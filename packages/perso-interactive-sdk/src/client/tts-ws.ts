import { TTSError, ttsStreamError } from '../shared/error';
import {
	type TtsChunkPayload,
	type TtsErrorPayload,
	type TtsFinishPayload,
	MAX_TTS_TEXT_CHARS,
	TTS_ERROR_CODE,
	randomId,
	WS_TYPE,
	type WsEnvelope
} from '../shared/ws-protocol';
import type { SessionSocket } from './session-socket';

/**
 * How long to wait for a `tts.chunk` or the terminal frame before giving up.
 *
 * Without a bound, a server that stalls after `tts.request` would leave the
 * caller's promise pending forever. Reset on every inbound frame so a long but
 * healthy synthesis is not cut off.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 30000;

/** One decoded slice of synthesized audio, in arrival order. */
export interface TtsChunk {
	/** Base64 audio, in the requested `output_format`. */
	audioB64: string;
	/** Monotonic index within this request, starting at 0. */
	seq: number;
}

/** Terminal metadata of a completed synthesis. */
export interface TtsFinishInfo {
	/** Resolved audio format, e.g. `pcm_24000`. */
	format: string;
	sampleRate: number;
}

export interface TtsRequestOptions {
	socket: SessionSocket;
	text: string;
	locale?: string;
	/** `StreamingTTSView` vocabulary (`pcm`, `pcm_24000`, `mp3`, `wav`, …). */
	outputFormat?: string;
	/** Invoked per `tts.chunk` as audio arrives, so callers can play incrementally. */
	onChunk?: (chunk: TtsChunk) => void;
	idleTimeoutMs?: number;
}

type Settle = {
	resolve: (info: TtsFinishInfo) => void;
	reject: (error: TTSError) => void;
};

/**
 * Drives one `tts.request` → `tts.chunk`* → `tts.finish` exchange over the
 * shared session socket.
 *
 * Multiple TTS requests may be in flight on one connection (the server caps the
 * count); each carries its own `id`, which is how their frames are
 * demultiplexed. Chunks are surfaced through `onChunk` as they arrive; the
 * {@link send} promise resolves once the server signals `tts.finish`.
 */
export class TtsRequest {
	readonly id: string;

	private readonly socket: SessionSocket;
	private readonly text: string;
	private readonly locale?: string;
	private readonly outputFormat?: string;
	private readonly onChunk?: (chunk: TtsChunk) => void;
	private readonly idleTimeoutMs: number;

	private readonly unsubscribes: Array<() => void> = [];
	private finished = false;
	private cancelled = false;
	private settle: Settle | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(options: TtsRequestOptions) {
		this.socket = options.socket;
		this.text = options.text;
		this.locale = options.locale;
		this.outputFormat = options.outputFormat;
		this.onChunk = options.onChunk;
		this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
		this.id = `tts-${randomId()}`;
	}

	/** Sends `tts.request` and resolves with the finish metadata. */
	send(): Promise<TtsFinishInfo> {
		return new Promise<TtsFinishInfo>((resolve, reject) => {
			this.settle = { resolve, reject };

			// Fail locally with a message naming the cause. Sending it anyway earns
			// an opaque server-side rejection that reads like a transport fault.
			if (this.text.length > MAX_TTS_TEXT_CHARS) {
				this.fail(
					ttsStreamError({
						reason:
							`TTS text is ${this.text.length} chars, over the ${MAX_TTS_TEXT_CHARS} ` +
							`the server accepts.`
					})
				);
				return;
			}

			this.subscribe();
			this.armIdleTimer();

			try {
				this.socket.send(WS_TYPE.TTS_REQUEST, this.id, {
					text: this.text,
					...(this.locale && { locale: this.locale }),
					...(this.outputFormat && { output_format: this.outputFormat })
				});
			} catch (error) {
				this.fail(toTtsError(error));
			}
		});
	}

	/**
	 * Aborts the request without waiting for the remaining audio.
	 *
	 * The server answers with a `tts.error` carrying `code: 'cancelled'`; that is
	 * a client-requested stop, so the pending promise rejects with that code
	 * rather than being treated as a genuine failure. Backs barge-in.
	 */
	cancel(): void {
		if (this.finished) return;
		this.cancelled = true;

		try {
			this.socket.send(WS_TYPE.CANCEL_REQUEST, `cancel-${randomId()}`, { target_id: this.id });
		} catch {
			// The socket is already gone; the request is aborted either way.
		}

		this.fail(
			ttsStreamError({ reason: 'TTS request cancelled by client', code: TTS_ERROR_CODE.CANCELLED })
		);
	}

	private subscribe(): void {
		const forRequest = (handler: (frame: WsEnvelope) => void) => (frame: WsEnvelope) => {
			if (frame.id !== this.id) return;
			this.armIdleTimer();
			handler(frame);
		};

		this.unsubscribes.push(
			this.socket.on(
				WS_TYPE.TTS_CHUNK,
				forRequest((frame) => {
					const payload = frame.payload as unknown as TtsChunkPayload;
					this.onChunk?.({ audioB64: payload.audio_b64, seq: payload.seq });
				})
			),
			this.socket.on(
				WS_TYPE.TTS_FINISH,
				forRequest((frame) => this.succeed(frame.payload as unknown as TtsFinishPayload))
			),
			this.socket.on(
				WS_TYPE.TTS_ERROR,
				forRequest((frame) => this.handleErrorFrame(frame.payload as unknown as TtsErrorPayload))
			),
			this.socket.onClosed((info) => {
				this.fail(
					ttsStreamError({
						reason: `Session socket closed before the TTS request finished: ${info.code}`,
						code: info.code
					})
				);
			}),
			this.socket.onError((payload) => {
				// A top-level protocol error (e.g. unknown_type) carries no request id,
				// so fail fast here instead of waiting for the idle timeout.
				this.fail(
					ttsStreamError({
						reason: payload.message ?? 'session socket protocol error',
						code: payload.code
					})
				);
			})
		);
	}

	private handleErrorFrame(payload: TtsErrorPayload): void {
		// A cancel we asked for surfaces as its own rejection; a cancel-coded error
		// from any other cause is still a client stop, not a failure.
		if (this.cancelled) return;
		this.fail(ttsStreamError(payload));
	}

	private succeed(payload: TtsFinishPayload): void {
		if (this.finished) return;
		const settle = this.settle;
		this.finish();
		settle?.resolve({ format: payload.format, sampleRate: payload.sample_rate });
	}

	private fail(error: TTSError): void {
		if (this.finished) return;
		const settle = this.settle;
		this.finish();
		settle?.reject(error);
	}

	private finish(): void {
		this.finished = true;
		this.settle = null;
		this.teardown();
	}

	private armIdleTimer(): void {
		if (this.idleTimer !== null) clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => {
			this.fail(
				ttsStreamError({
					reason: `No TTS frame within ${this.idleTimeoutMs}ms`,
					code: TTS_ERROR_CODE.IDLE_TIMEOUT
				})
			);
		}, this.idleTimeoutMs);
	}

	private teardown(): void {
		if (this.idleTimer !== null) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		while (this.unsubscribes.length > 0) {
			this.unsubscribes.pop()?.();
		}
	}
}

/** Converts a transport-level throw into the TTS error contract. */
function toTtsError(error: unknown): TTSError {
	if (error instanceof TTSError) return error;
	const source = error as { code?: string; message?: string };
	return ttsStreamError({ reason: source?.message ?? String(error), code: source?.code });
}
