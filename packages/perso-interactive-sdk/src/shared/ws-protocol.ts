/**
 * Wire types for the session WebSocket (`/api/v1/session/{id}/ws/`, protocol
 * v1). Models the frames the SDK exchanges over the socket: the `session.*`
 * lifecycle, the `stt.*` streaming namespace and whole-utterance `stt.request`,
 * and the `llm.*` and `tts.*` namespaces — LLM turns and TTS synthesis now run
 * over the socket rather than REST — plus the shared `cancel.*` frames.
 *
 * Kept free of DOM dependencies so the shapes can be asserted in Node.
 */

/** Every frame, both directions, has this shape. */
export interface WsEnvelope<P = Record<string, unknown>> {
	type: string;
	/** Present on requests and on every response correlated to one. */
	id?: string;
	ts?: number;
	payload: P;
}

/* -------------------------------------------------------------------------
 * Server -> client payloads
 * ---------------------------------------------------------------------- */

export interface SessionReadyPayload {
	session_id: string;
	status: string;
	capabilities: string[];
	history_present: boolean;
}

export interface SessionClosedPayload {
	code: string;
	reason: string;
}

export interface SttPartialPayload {
	/** Confirmed prefix plus the current interim hypothesis. */
	text: string;
	/** Confirmed prefix only. */
	final_text: string;
	/** Present only in end-of-turn detection mode. */
	utterance_seq?: number;
}

export interface SttUtterancePayload {
	seq: number;
	text: string;
	normalized_text: string;
	locale: string;
}

export interface SttResultPayload {
	text: string;
	normalized_text: string;
	locale: string;
	/** Present only in end-of-turn detection mode, where `text` is empty. */
	utterance_count?: number;
}

export interface SttErrorPayload {
	reason: string;
	/**
	 * Open string. Beyond the documented stream codes the server forwards the
	 * provider's own error code verbatim, so this must not be narrowed to a
	 * union — protocol v1 treats new codes as an additive change.
	 */
	code?: string;
	/** SessionEvent pk, when the failure was persisted. */
	ref?: string;
}

/** One streamed token of an `llm.delta` frame (protocol section 5). */
export interface LlmDeltaPayload {
	/** Present only on the first delta of a response. */
	role?: string;
	content: string;
	/**
	 * `true` on the delta that closes a sentence (server-side
	 * `StreamSentenceSplitter`), so a caller can pipeline TTS per sentence
	 * without re-tokenizing.
	 */
	sentence_complete: boolean;
}

/** One OpenAI-style tool call the model issued. */
export interface LlmToolCall {
	id: string;
	type: string;
	function: { name: string; arguments: string };
}

export interface LlmToolCallPayload {
	tool_calls: LlmToolCall[];
	/**
	 * `true` marks a RAG-injected tool message the client must NOT execute —
	 * the server has already resolved it.
	 */
	synthetic: boolean;
}

export interface LlmFinishPayload {
	/**
	 * Mirrors OpenAI: `stop`, `tool_calls`, `length`, `content_filter`. Left an
	 * open string rather than a union so a new terminal reason is an additive
	 * change, consistent with the rest of protocol v1.
	 */
	reason: string;
}

export interface LlmErrorPayload {
	reason: string;
	/** Open string; see {@link LLM_ERROR_CODE}. Absent on a plain provider fault. */
	code?: string;
	/** SessionEvent pk, when the failure was persisted. */
	ref?: string;
}

/** One audio slice of a `tts.chunk` frame (protocol section 6). */
export interface TtsChunkPayload {
	audio_b64: string;
	/** Monotonic index within one `tts.request`, starting at 0. */
	seq: number;
}

export interface TtsFinishPayload {
	/** Resolved audio format, e.g. `pcm_24000` (`pcm` is aliased to `pcm_24000`). */
	format: string;
	sample_rate: number;
}

export interface TtsErrorPayload {
	reason: string;
	/** Open string; see {@link TTS_ERROR_CODE}. */
	code?: string;
	/** SessionEvent pk, when the failure was persisted. */
	ref?: string;
}

/** Response to a `cancel.request` (protocol section 6.5). */
export interface CancelResultPayload {
	target_id: string;
	/** `true` when a matching in-flight task was found and interrupted. */
	cancelled: boolean;
	/** Modality of the cancelled task, or `null` when nothing matched (no-op). */
	modality: 'stt' | 'tts' | 'llm' | null;
}

/**
 * The top-level `error` frame — envelope-level failures that are not tied to
 * one request modality (bad shape, unknown type, throttle). Per-request
 * failures use the matching `*.error` frame instead.
 */
export interface ErrorEnvelopePayload {
	/** Envelope-level fault code (`bad_envelope`, `unknown_type`, `oversize`, `ws_rate_limited`). Open string. */
	code: string;
	message?: string;
	/** Present with `ws_rate_limited`; wait this long before retrying. */
	retry_after_ms?: number;
}

/* -------------------------------------------------------------------------
 * Client -> server payloads
 * ---------------------------------------------------------------------- */

/** Raw formats the server accepts on `stt.start`. Browsers only ever send `pcm_s16le`. */
export type SttAudioFormat = 'pcm_s16le' | 'pcm_s24le' | 'pcm_s32le' | 'pcm_u8';

export interface SttStartPayload {
	language?: string | null;
	audio_format: SttAudioFormat;
	sample_rate: number;
	num_channels: number;
}

export interface SttAudioChunkPayload {
	audio_b64: string;
}

export interface CancelRequestPayload {
	target_id: string;
}

/** Message in an `llm.request` history — OpenAI chat shape (`role`, `content`, …). */
export type LlmMessage = Record<string, unknown>;

/**
 * Whole-utterance STT over WS (protocol section 4). The streaming counterpart is
 * `stt.start` / `stt.audio_chunk` / `stt.stop`.
 */
export interface SttRequestPayload {
	/** Entire utterance, base64. Capped at {@link MAX_STT_AUDIO_B64_CHARS}. */
	audio_b64: string;
	/** Container MIME; defaults to `audio/wav` server-side. */
	mime?: string;
	language?: string;
}

/**
 * One LLM turn (protocol section 5). The client owns the history: every request
 * carries the full `messages` array, same contract as REST `/llm/v2/`.
 */
export interface LlmRequestPayload {
	/** Non-empty OpenAI-format chat history. Serialized JSON capped at {@link MAX_LLM_MESSAGES_CHARS}. */
	messages: LlmMessage[];
	/** Optional OpenAI tool definitions. Serialized JSON capped at {@link MAX_LLM_TOOLS_CHARS}. */
	tools?: LlmMessage[];
}

/** One TTS synthesis request (protocol section 6). */
export interface TtsRequestPayload {
	/** Capped at {@link MAX_TTS_TEXT_CHARS}. */
	text: string;
	locale?: string;
	/** `StreamingTTSView` vocabulary (`pcm`, `pcm_24000`, `mp3`, `wav`, …). `pcm` = `pcm_24000`. */
	output_format?: string;
}

/* -------------------------------------------------------------------------
 * Codes and limits
 * ---------------------------------------------------------------------- */

/**
 * Codes that can appear on `STTError.code`. Not exhaustive by design — the
 * server relays the recognition provider's own codes verbatim, so compare
 * against these constants and let unknown values through.
 *
 * Most arrive in an `stt.error` frame; the few marked below are raised by the
 * SDK without a round trip, and are listed here so one table covers everything
 * a caller can receive.
 */
export const STT_ERROR_CODE = {
	/** Client-requested abort via `cancel.request`. Not a failure. */
	CANCELLED: 'cancelled',
	/** The session's STT type does not allow this interaction mode. */
	MODE_UNSUPPORTED: 'mode_unsupported',
	STREAM_BUSY: 'stream_busy',
	STREAM_STATE: 'stream_state',
	STREAM_IDLE_TIMEOUT: 'stream_idle_timeout',
	STREAM_MAX_DURATION: 'stream_max_duration',
	PROVIDER_CLOSED: 'provider_closed',
	STT_BUSY: 'stt_busy',
	RATE_LIMITED: 'ws_rate_limited',
	/**
	 * SDK-raised: one chunk's base64 payload exceeded
	 * {@link MAX_STT_CHUNK_B64_CHARS}.
	 *
	 * The SDK's own chunk sits two orders of magnitude below the cap, so this is
	 * a guard against a capture configuration the stream was not opened for
	 * rather than something an app tunes its way out of.
	 */
	CHUNK_TOO_LARGE: 'chunk_too_large',
	/** SDK-raised: no terminal frame arrived within the post-`stt.stop` wait. */
	TERMINAL_TIMEOUT: 'terminal_timeout',
	/** SDK-raised: the server never acknowledged `stt.start` with `stt.started`. */
	START_TIMEOUT: 'start_timeout'
} as const;

/**
 * Transport-fault codes, as opposed to recognition faults.
 *
 * A session-socket fault is re-wrapped into `STTError` / `TTSError` / `LLMError`
 * with its code forwarded unchanged, so these reach callers on those errors'
 * `.code` — there is no separate public error class to catch. Open set, like
 * {@link STT_ERROR_CODE} — the server's pre-accept close reasons
 * (`ws_session_not_found`, `ws_session_not_ready`, ...) surface here verbatim.
 */
export const SESSION_SOCKET_CODE = {
	/** The socket was closed by the SDK and will not reconnect. */
	DISPOSED: 'ws_disposed',
	/** No `WebSocket` in this environment. */
	UNSUPPORTED: 'ws_unsupported',
	/** Send attempted before the session was accepted. */
	NOT_CONNECTED: 'ws_not_connected',
	/** Send buffer past its cap; the connection cannot keep up. */
	BACKPRESSURE: 'ws_backpressure',
	/** Transport dropped with no protocol reason attached. */
	CLOSED: 'ws_closed',
	/** The transport opened but `session.ready` never arrived within the handshake bound. */
	HANDSHAKE_TIMEOUT: 'ws_handshake_timeout',
	/** The `WebSocket` constructor itself threw (malformed URL, CSP refusal, ...). */
	CONNECT_FAILED: 'ws_connect_failed'
} as const;

/**
 * Codes on `llm.error`'s `code`. Open set, like {@link STT_ERROR_CODE}: a plain
 * provider fault arrives with no `code` and only a `reason`.
 */
export const LLM_ERROR_CODE = {
	/** Aborted by a `cancel.request`. Not a failure — treat distinctly. */
	CANCELLED: 'cancelled',
	/** `llm.request` exceeded the per-WS in-flight cap. */
	BUSY: 'llm_busy',
	/** Throttle bucket exceeded; payload carries `retry_after_ms`. */
	RATE_LIMITED: 'ws_rate_limited',
	/** SDK-raised: no `llm.delta`/`llm.finish` arrived within the idle window. */
	IDLE_TIMEOUT: 'llm_idle_timeout'
} as const;

/**
 * Codes on `tts.error`'s `code`. Open set, like {@link STT_ERROR_CODE}.
 */
export const TTS_ERROR_CODE = {
	/** Aborted by a `cancel.request`. Not a failure — treat distinctly. */
	CANCELLED: 'cancelled',
	/** `tts.request` exceeded the per-WS in-flight cap. */
	BUSY: 'tts_busy',
	/** Throttle bucket exceeded; payload carries `retry_after_ms`. */
	RATE_LIMITED: 'ws_rate_limited',
	/** SDK-raised: no `tts.chunk`/`tts.finish` arrived within the idle window. */
	IDLE_TIMEOUT: 'tts_idle_timeout'
} as const;

/**
 * Codes on the top-level `error` envelope (protocol section 7) — envelope-level
 * faults not tied to one request. Per-request faults use `*.error` instead.
 */
export const WS_ENVELOPE_CODE = {
	/** Missing `type`/`id`, not JSON, or payload failed schema validation. */
	BAD_ENVELOPE: 'bad_envelope',
	/** Unrecognized frame `type`. */
	UNKNOWN_TYPE: 'unknown_type',
	/** Frame exceeded the size budget. */
	OVERSIZE: 'oversize',
	/**
	 * Too many frames on the connection; `retry_after_ms` says how long to wait.
	 * Transient, so unlike the faults above it does not abort in-flight requests —
	 * a rate-limited request is reported through its own `*.error` frame.
	 */
	RATE_LIMITED: 'ws_rate_limited'
} as const;

/** Frame types the SDK sends and receives. */
export const WS_TYPE = {
	SESSION_READY: 'session.ready',
	SESSION_TERMINATED: 'session.terminated',
	SESSION_DISPLACED: 'session.displaced',
	/** Whole-utterance STT (protocol section 4). */
	STT_REQUEST: 'stt.request',
	STT_START: 'stt.start',
	STT_AUDIO_CHUNK: 'stt.audio_chunk',
	STT_STOP: 'stt.stop',
	STT_STARTED: 'stt.started',
	STT_PARTIAL: 'stt.partial',
	STT_UTTERANCE: 'stt.utterance',
	STT_RESULT: 'stt.result',
	STT_ERROR: 'stt.error',
	/** LLM over WS (protocol section 5). */
	LLM_REQUEST: 'llm.request',
	LLM_DELTA: 'llm.delta',
	LLM_TOOL_CALL: 'llm.tool_call',
	LLM_FINISH: 'llm.finish',
	LLM_ERROR: 'llm.error',
	/** TTS over WS (protocol section 6). */
	TTS_REQUEST: 'tts.request',
	TTS_CHUNK: 'tts.chunk',
	TTS_FINISH: 'tts.finish',
	TTS_ERROR: 'tts.error',
	CANCEL_REQUEST: 'cancel.request',
	CANCEL_RESULT: 'cancel.result',
	ERROR: 'error'
} as const;

/**
 * Server cap on one `stt.audio_chunk`'s base64 payload
 * (`MAX_STT_CHUNK_B64_CHARS`).
 *
 * The SDK's 100 ms chunk encodes to roughly 4 KB at 16 kHz — about 1/120th of
 * this — so the constant is not a limit apps run into. It exists so a chunk that
 * somehow does exceed it fails locally with a message naming the cause, instead
 * of drawing an opaque server-side rejection that reads like a transport fault.
 */
export const MAX_STT_CHUNK_B64_CHARS = 512 * 1024;

/**
 * Per-field caps the server enforces (protocol section 11b,
 * `perso_live/ws_serializers.py`). Oversize inputs draw a descriptive `*.error`
 * (or top-level `error`) envelope, so the SDK validates against these before
 * sending to fail locally with a clearer message.
 */
/** `stt.request.audio_b64` — whole-utterance cap (distinct from the streaming chunk cap). */
export const MAX_STT_AUDIO_B64_CHARS = 5 * 1024 * 1024;
/** `tts.request.text`. */
export const MAX_TTS_TEXT_CHARS = 4000;
/** `llm.request.messages`, measured as serialized JSON length. */
export const MAX_LLM_MESSAGES_CHARS = 512 * 1024;
/** `llm.request.tools`, measured as serialized JSON length. */
export const MAX_LLM_TOOLS_CHARS = 64 * 1024;

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

/** Builds the session WebSocket URL from the REST API server origin. */
export function sessionWebSocketUrl(apiServer: string, sessionId: string): string {
	const base = apiServer.replace(/\/+$/, '').replace(/^http/, 'ws');
	return `${base}/api/v1/session/${encodeURIComponent(sessionId)}/ws/`;
}

/**
 * Parses an inbound frame, returning `null` for anything malformed.
 *
 * Returns rather than throws because the caller is a WebSocket `message`
 * handler: an exception there escapes into the event loop as an unhandled
 * error instead of reaching the session's error channel.
 */
export function parseEnvelope(raw: string): WsEnvelope | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return null;
	}

	const frame = parsed as Record<string, unknown>;
	if (typeof frame.type !== 'string') {
		return null;
	}

	const payload =
		typeof frame.payload === 'object' && frame.payload !== null && !Array.isArray(frame.payload)
			? (frame.payload as Record<string, unknown>)
			: {};

	return {
		type: frame.type,
		...(typeof frame.id === 'string' && { id: frame.id }),
		...(typeof frame.ts === 'number' && { ts: frame.ts }),
		payload
	};
}

/** Whether a frame belongs to the `stt.*` namespace and to the given stream. */
export function isSttFrameFor(frame: WsEnvelope, streamId: string): boolean {
	return frame.type.startsWith('stt.') && frame.id === streamId;
}

/** Whether a frame belongs to the `llm.*` namespace and to the given request. */
export function isLlmFrameFor(frame: WsEnvelope, requestId: string): boolean {
	return frame.type.startsWith('llm.') && frame.id === requestId;
}

/** Whether a frame belongs to the `tts.*` namespace and to the given request. */
export function isTtsFrameFor(frame: WsEnvelope, requestId: string): boolean {
	return frame.type.startsWith('tts.') && frame.id === requestId;
}

/**
 * Request/stream id suffix shared by the llm/tts/stt WS drivers.
 * `crypto.randomUUID` is available in the secure contexts this SDK requires; the
 * fallback keeps the helper usable under test runners that omit it.
 */
export function randomId(): string {
	const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
	if (typeof cryptoRef?.randomUUID === 'function') {
		return cryptoRef.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
