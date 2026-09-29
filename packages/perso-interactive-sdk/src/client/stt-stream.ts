import { STTError, sttStreamError } from '../shared/error';
import { encodePcmChunk } from '../shared/pcm-encode';
import {
	type RealtimeSttFinishedPayload,
	type SttErrorPayload,
	type SttPartialPayload,
	type SttUtterancePayload,
	MAX_STT_CHUNK_B64_CHARS,
	STT_ERROR_CODE,
	WS_TYPE,
	type WsEnvelope
} from '../shared/ws-protocol';
import type { SessionSocket } from './session-socket';

/**
 * How long to wait for the terminal frame after `realtime_stt.stop`.
 *
 * Without a bound, a server that never finalizes would leave
 * `stopProcessSTT()` pending forever. Generous enough to cover provider
 * finalization on a slow link.
 */
const DEFAULT_TERMINAL_TIMEOUT_MS = 30000;

/**
 * How long to wait for `realtime_stt.started` after `realtime_stt.start`.
 *
 * The microphone is already capturing while this wait runs, so a server that
 * accepts the socket but never acknowledges the stream must not leave
 * `startProcessSTT()` pending with the mic open.
 */
const DEFAULT_START_TIMEOUT_MS = 15000;

/** Interim recognition hypothesis for one utterance. */
export interface SttPartial {
	/** Confirmed prefix plus the current interim hypothesis. */
	text: string;
	/** Confirmed prefix only — safe to treat as settled. */
	finalText: string;
	/** Which utterance this belongs to. */
	utteranceSeq?: number;
}

/** One utterance committed by server-side end-of-turn detection. */
export interface SttUtterance {
	seq: number;
	text: string;
	normalizedText: string;
	/** Language the server identified for this utterance, e.g. `ko`; `""` when unknown. */
	language: string;
}

/** Terminal outcome of a stream. */
export interface SttStreamResult {
	text: string;
	normalizedText: string;
	/** Language of the last committed utterance; `""` for a silent stream. */
	language: string;
	/** Number of utterances the server committed; 0 for a silent stream. */
	utteranceCount: number;
}

export interface SttStreamOptions {
	socket: SessionSocket;
	/** Rate the recorder is actually capturing at; declared on `realtime_stt.start`. */
	sampleRate: number;
	language?: string;
	onPartial?: (partial: SttPartial) => void;
	onUtterance?: (utterance: SttUtterance) => void;
	onError?: (error: STTError) => void;
	terminalTimeoutMs?: number;
	/** Bound on the `realtime_stt.started` acknowledgement; defaults to 15 s. */
	startTimeoutMs?: number;
}

type OpenSettle = {
	resolve: () => void;
	reject: (error: STTError) => void;
};

type StopSettle = {
	resolve: (result: SttStreamResult) => void;
	reject: (error: STTError) => void;
};

/**
 * Drives one `realtime_stt.start` → `realtime_stt.audio_chunk`* →
 * `realtime_stt.stop` exchange.
 *
 * The server permits a single active stream per connection, so the session
 * holds at most one of these at a time. All frames of the exchange share the
 * `id` chosen here, which is how overlapping operations on the shared socket
 * are demultiplexed.
 */
export class SttStream {
	readonly id: string;

	private readonly socket: SessionSocket;
	private readonly sampleRate: number;
	private readonly language?: string;
	private readonly onPartial?: (partial: SttPartial) => void;
	private readonly onUtterance?: (utterance: SttUtterance) => void;
	private readonly onError?: (error: STTError) => void;
	private readonly terminalTimeoutMs: number;
	private readonly startTimeoutMs: number;

	private readonly unsubscribes: Array<() => void> = [];
	/**
	 * Utterances seen so far. The terminal `realtime_stt.finished` carries no
	 * text in either mode, so the transcript is reassembled from these.
	 */
	private readonly committed: SttUtterance[] = [];

	private finished = false;
	private cancelled = false;
	private opening: OpenSettle | null = null;
	private stopping: StopSettle | null = null;
	private terminalTimer: ReturnType<typeof setTimeout> | null = null;
	private startTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(options: SttStreamOptions) {
		this.socket = options.socket;
		this.sampleRate = options.sampleRate;
		this.language = options.language;
		this.onPartial = options.onPartial;
		this.onUtterance = options.onUtterance;
		this.onError = options.onError;
		this.terminalTimeoutMs = options.terminalTimeoutMs ?? DEFAULT_TERMINAL_TIMEOUT_MS;
		this.startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
		this.id = `stt-${randomId()}`;
	}

	/** Whether the stream is still accepting audio. */
	get active(): boolean {
		return !this.finished;
	}

	/**
	 * Sends `realtime_stt.start` and resolves once the server acknowledges with
	 * `realtime_stt.started`.
	 */
	open(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.subscribe();

			this.opening = { resolve, reject };

			try {
				this.socket.send(WS_TYPE.REALTIME_STT_START, this.id, {
					...(this.language && { language: this.language }),
					audio_format: 'pcm_s16le',
					sample_rate: this.sampleRate,
					num_channels: 1
				});
			} catch (error) {
				this.teardown();
				reject(toSttError(error));
				return;
			}

			// Armed only once realtime_stt.start is on the wire; the acknowledgement
			// handler clears it, and fail() tears it down with everything else.
			this.startTimer = setTimeout(() => {
				// The server may still accept the stream after we give up. Tell it to
				// drop this id, or a late acceptance leaves a stream running that the
				// SDK has discarded and the next realtime_stt.start is refused with stream_busy.
				this.sendCancelFrame();
				this.fail(
					sttStreamError({
						reason:
							`No realtime_stt.started within ${this.startTimeoutMs}ms ` +
							'of realtime_stt.start',
						code: STT_ERROR_CODE.START_TIMEOUT
					})
				);
			}, this.startTimeoutMs);
		});
	}

	/**
	 * Sends one slice of captured audio.
	 *
	 * Silently ignores calls after the stream has finished — the recorder runs
	 * on its own clock and can deliver a frame that was already in flight when
	 * the stream ended.
	 */
	sendAudio(samples: Float32Array): void {
		if (this.finished || samples.length === 0) return;

		const audio_b64 = encodePcmChunk(samples);
		// Fail locally with a message naming the cause. Sending it anyway earns
		// an opaque server-side rejection that reads like a transport fault.
		//
		// Reported through `fail` rather than thrown: this runs inside the
		// recorder's AudioWorklet message handler, where a throw escapes into the
		// event loop instead of reaching the caller, and the recorder would go on
		// delivering chunks that throw again. `fail` finishes the stream, so the
		// guard above turns every later call into a no-op.
		if (audio_b64.length > MAX_STT_CHUNK_B64_CHARS) {
			this.fail(
				sttStreamError({
					reason:
						`Audio chunk is ${audio_b64.length} base64 chars, over the ` +
						`${MAX_STT_CHUNK_B64_CHARS} the server accepts. The SDK's own chunk is ` +
						`orders of magnitude below the cap, so this indicates a capture rate or ` +
						`buffer size the stream was not opened for.`,
					code: STT_ERROR_CODE.CHUNK_TOO_LARGE
				})
			);
			return;
		}

		try {
			this.socket.send(WS_TYPE.REALTIME_STT_AUDIO_CHUNK, this.id, { audio_b64 });
		} catch (error) {
			this.fail(toSttError(error));
		}
	}

	/** Sends `realtime_stt.stop` and resolves with the terminal result. */
	stop(): Promise<SttStreamResult> {
		return new Promise<SttStreamResult>((resolve, reject) => {
			if (this.finished) {
				reject(
					sttStreamError({
						reason: 'STT stream is not active',
						code: STT_ERROR_CODE.STREAM_STATE
					})
				);
				return;
			}

			this.stopping = { resolve, reject };
			this.terminalTimer = setTimeout(() => {
				this.fail(
					sttStreamError({
						reason: `No terminal frame within ${this.terminalTimeoutMs}ms of realtime_stt.stop`,
						code: STT_ERROR_CODE.TERMINAL_TIMEOUT
					})
				);
			}, this.terminalTimeoutMs);

			try {
				this.socket.send(WS_TYPE.REALTIME_STT_STOP, this.id, {});
			} catch (error) {
				this.fail(toSttError(error));
			}
		});
	}

	/**
	 * Aborts the stream without waiting for a transcript.
	 *
	 * The server answers with a `realtime_stt.error` carrying `code: 'cancelled'`;
	 * that is a client-requested stop rather than a failure, so it is not
	 * reported through `onError`.
	 */
	cancel(): void {
		if (this.finished) return;
		this.cancelled = true;

		this.sendCancelFrame();

		// A stop() awaiting the terminal frame will never receive one now, so it
		// has to be settled here. Rejecting (rather than resolving with a partial
		// transcript) keeps `code: 'cancelled'` as the single signal that the
		// caller's own barge-in ended the turn, and lets stopProcessSTT's finally
		// run its teardown.
		const stopping = this.stopping;
		this.finish();
		stopping?.reject(
			sttStreamError({ reason: 'STT stream cancelled by client', code: STT_ERROR_CODE.CANCELLED })
		);
	}

	private subscribe(): void {
		const forStream = (handler: (frame: WsEnvelope) => void) => (frame: WsEnvelope) => {
			if (frame.id !== this.id) return;
			handler(frame);
		};

		this.unsubscribes.push(
			this.socket.on(
				WS_TYPE.REALTIME_STT_STARTED,
				forStream(() => {
					this.clearStartTimer();
					this.opening?.resolve();
					this.opening = null;
				})
			),
			this.socket.on(
				WS_TYPE.REALTIME_STT_PARTIAL,
				forStream((frame) => {
					const payload = frame.payload as unknown as SttPartialPayload;
					this.onPartial?.({
						text: payload.text ?? '',
						finalText: payload.finalized_text ?? '',
						...(payload.utterance_seq !== undefined && { utteranceSeq: payload.utterance_seq })
					});
				})
			),
			this.socket.on(
				WS_TYPE.REALTIME_STT_UTTERANCE,
				forStream((frame) => {
					const payload = frame.payload as unknown as SttUtterancePayload;
					const utterance: SttUtterance = {
						seq: payload.seq,
						text: payload.text ?? '',
						normalizedText: payload.normalized_text ?? '',
						language: payload.language ?? ''
					};
					this.committed.push(utterance);
					this.onUtterance?.(utterance);
				})
			),
			this.socket.on(
				WS_TYPE.REALTIME_STT_FINISHED,
				forStream((frame) =>
					this.succeed(frame.payload as unknown as RealtimeSttFinishedPayload)
				)
			),
			this.socket.on(
				WS_TYPE.REALTIME_STT_ERROR,
				forStream((frame) => this.handleErrorFrame(frame.payload as unknown as SttErrorPayload))
			),
			this.socket.onClosed((info) => {
				this.fail(
					sttStreamError({
						reason: `Session socket closed before the STT stream finished: ${info.code}`,
						code: info.code
					})
				);
			}),
			this.socket.onError((payload) => {
				// A top-level protocol error (e.g. unknown_type from a server that does
				// not know realtime_stt.start) carries no stream id, so the id-keyed
				// handlers never see it; fail fast instead of waiting out a timeout with the
				// microphone open.
				this.fail(
					sttStreamError({
						reason: payload.message ?? 'session socket protocol error',
						code: payload.code
					})
				);
			})
		);
	}

	/** Best-effort `cancel.request` for this stream; a dead socket is not an error here. */
	private sendCancelFrame(): void {
		try {
			this.socket.send(WS_TYPE.CANCEL_REQUEST, `cancel-${randomId()}`, { target_id: this.id });
		} catch {
			// The socket is already gone; the stream is aborted either way.
		}
	}

	private clearStartTimer(): void {
		if (this.startTimer !== null) {
			clearTimeout(this.startTimer);
			this.startTimer = null;
		}
	}

	private handleErrorFrame(payload: SttErrorPayload): void {
		// A cancel we asked for is not a failure; the stream is already finished.
		if (this.cancelled || payload.code === STT_ERROR_CODE.CANCELLED) {
			this.finish();
			return;
		}
		this.fail(sttStreamError(payload));
	}

	private succeed(payload: RealtimeSttFinishedPayload): void {
		if (this.finished) return;

		const spoken = this.committed.filter((utterance) => utterance.text !== '');
		const result: SttStreamResult = {
			text: spoken.map((utterance) => utterance.text).join(' '),
			normalizedText: spoken.map((utterance) => utterance.normalizedText).join(' '),
			language: spoken[spoken.length - 1]?.language ?? '',
			utteranceCount: payload.utterance_count ?? this.committed.length
		};

		const stopping = this.stopping;
		this.finish();
		stopping?.resolve(result);
	}

	private fail(error: STTError): void {
		if (this.finished) return;

		const opening = this.opening;
		const stopping = this.stopping;
		this.finish();

		if (opening) {
			opening.reject(error);
			return;
		}
		if (stopping) {
			stopping.reject(error);
			return;
		}
		this.onError?.(error);
	}

	private finish(): void {
		this.finished = true;
		this.opening = null;
		this.stopping = null;
		this.clearStartTimer();
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
	return sttStreamError({
		reason: source?.message ?? String(error),
		code: source?.code
	});
}

/**
 * Stream id suffix. `crypto.randomUUID` is available in the secure contexts
 * this SDK already requires for `getUserMedia`, but the fallback keeps the
 * module usable under test runners that omit it.
 */
function randomId(): string {
	const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
	if (typeof cryptoRef?.randomUUID === 'function') {
		return cryptoRef.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
