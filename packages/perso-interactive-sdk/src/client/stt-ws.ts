import { STTError, sttStreamError } from '../shared/error';
import {
	type SttErrorPayload,
	type SttResultPayload,
	MAX_STT_AUDIO_B64_CHARS,
	STT_ERROR_CODE,
	randomId,
	WS_TYPE,
	type WsEnvelope
} from '../shared/ws-protocol';
import type { SessionSocket } from './session-socket';

/**
 * How long to wait for the terminal frame after `stt.request`.
 *
 * Without a bound, a server that never finalizes would leave the caller's
 * promise pending forever. Generous enough to cover provider transcription on a
 * slow link.
 */
const DEFAULT_TERMINAL_TIMEOUT_MS = 30000;

export interface SttRequestOptions {
	socket: SessionSocket;
	/** Entire utterance, base64. Capped at {@link MAX_STT_AUDIO_B64_CHARS}. */
	audioB64: string;
	/** Container MIME; the server defaults to `audio/wav` when omitted. */
	mime?: string;
	language?: string;
	terminalTimeoutMs?: number;
}

type Settle = {
	resolve: (text: string) => void;
	reject: (error: STTError) => void;
};

/**
 * Drives one whole-utterance `stt.request` → `stt.result` exchange over the
 * shared session socket — the WS counterpart of `POST /stt/`.
 *
 * The streaming counterpart is {@link SttStream}. This one carries the entire
 * utterance in a single frame and resolves with the transcript text; like every
 * request on the socket it is demultiplexed by its `id`.
 */
export class SttRequest {
	readonly id: string;

	private readonly socket: SessionSocket;
	private readonly audioB64: string;
	private readonly mime?: string;
	private readonly language?: string;
	private readonly terminalTimeoutMs: number;

	private readonly unsubscribes: Array<() => void> = [];
	private finished = false;
	private cancelled = false;
	private settle: Settle | null = null;
	private terminalTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(options: SttRequestOptions) {
		this.socket = options.socket;
		this.audioB64 = options.audioB64;
		this.mime = options.mime;
		this.language = options.language;
		this.terminalTimeoutMs = options.terminalTimeoutMs ?? DEFAULT_TERMINAL_TIMEOUT_MS;
		this.id = `stt-${randomId()}`;
	}

	/** Sends `stt.request` and resolves with the transcript text. */
	send(): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			this.settle = { resolve, reject };

			// Fail locally with a message naming the cause. Sending it anyway earns
			// an opaque server-side rejection that reads like a transport fault.
			if (this.audioB64.length > MAX_STT_AUDIO_B64_CHARS) {
				this.fail(
					sttStreamError({
						reason:
							`Audio is ${this.audioB64.length} base64 chars, over the ` +
							`${MAX_STT_AUDIO_B64_CHARS} the server accepts.`,
						code: STT_ERROR_CODE.CHUNK_TOO_LARGE
					})
				);
				return;
			}

			this.subscribe();
			this.terminalTimer = setTimeout(() => {
				this.fail(
					sttStreamError({
						reason: `No terminal frame within ${this.terminalTimeoutMs}ms of stt.request`,
						code: STT_ERROR_CODE.TERMINAL_TIMEOUT
					})
				);
			}, this.terminalTimeoutMs);

			try {
				this.socket.send(WS_TYPE.STT_REQUEST, this.id, {
					audio_b64: this.audioB64,
					...(this.mime && { mime: this.mime }),
					...(this.language && { language: this.language })
				});
			} catch (error) {
				this.fail(toSttError(error));
			}
		});
	}

	/**
	 * Aborts the request. The server answers with an `stt.error` carrying
	 * `code: 'cancelled'`; that is a client-requested stop, so the pending
	 * promise rejects with that code rather than as a genuine failure.
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
			sttStreamError({ reason: 'STT request cancelled by client', code: STT_ERROR_CODE.CANCELLED })
		);
	}

	private subscribe(): void {
		const forRequest = (handler: (frame: WsEnvelope) => void) => (frame: WsEnvelope) => {
			if (frame.id !== this.id) return;
			handler(frame);
		};

		this.unsubscribes.push(
			this.socket.on(
				WS_TYPE.STT_RESULT,
				forRequest((frame) => this.succeed(frame.payload as unknown as SttResultPayload))
			),
			this.socket.on(
				WS_TYPE.STT_ERROR,
				forRequest((frame) => this.handleErrorFrame(frame.payload as unknown as SttErrorPayload))
			),
			this.socket.onClosed((info) => {
				this.fail(
					sttStreamError({
						reason: `Session socket closed before the STT request finished: ${info.code}`,
						code: info.code
					})
				);
			}),
			this.socket.onError((payload) => {
				// A top-level protocol error (e.g. unknown_type on a server that does
				// not support stt.request) never reaches the id-keyed handlers, so fail
				// fast here instead of waiting for the terminal timeout.
				this.fail(
					sttStreamError({
						reason: payload.message ?? 'session socket protocol error',
						code: payload.code
					})
				);
			})
		);
	}

	private handleErrorFrame(payload: SttErrorPayload): void {
		// A cancel we asked for surfaces as its own rejection above; guard so the
		// server's cancelled error frame does not double-settle.
		if (this.cancelled) return;
		this.fail(sttStreamError(payload));
	}

	private succeed(payload: SttResultPayload): void {
		if (this.finished) return;
		const settle = this.settle;
		this.finish();
		settle?.resolve(payload.text ?? '');
	}

	private fail(error: STTError): void {
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

	private teardown(): void {
		if (this.terminalTimer !== null) {
			clearTimeout(this.terminalTimer);
			this.terminalTimer = null;
		}
		while (this.unsubscribes.length > 0) {
			this.unsubscribes.pop()?.();
		}
	}
}

/** Converts a transport-level throw into the STT error contract. */
function toSttError(error: unknown): STTError {
	if (error instanceof STTError) return error;
	const source = error as { code?: string; message?: string };
	return sttStreamError({ reason: source?.message ?? String(error), code: source?.code });
}
