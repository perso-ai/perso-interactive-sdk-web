export class Timeout extends Error {
	constructor() {
		super('WebRTC connection timeout');
	}
}

export class ApiError extends Error {
	constructor(
		public errorCode: number,
		public code: string,
		public detail: string,
		public attr?: string
	) {
		let message;
		if (attr != null) {
			message = `${errorCode}:${attr}_${detail}`;
		} else {
			message = `${errorCode}:${detail}`;
		}
		super(message);
	}
}

export class LLMError extends Error {
	constructor(public underlyingError: ApiError | LLMStreamingResponseError) {
		super();
		this.name = 'LLMError';
	}

	/**
	 * Protocol/API error code, forwarded from the underlying error.
	 *
	 * For LLM over WS this is the `llm.error` payload's `code` (see
	 * {@link LLM_ERROR_CODE}) — an open string. A client-requested cancel
	 * surfaces as `code === 'cancelled'`. A streaming-response parse failure has
	 * no code, so this is `undefined`.
	 */
	get code(): string | undefined {
		return this.underlyingError instanceof ApiError ? this.underlyingError.code : undefined;
	}
}

export class LLMStreamingResponseError extends Error {
	constructor(public description: string) {
		super();
	}
}

/**
 * Wraps a streaming `llm.error` payload as an {@link ApiError} so it can be
 * carried by {@link LLMError} alongside REST failures.
 *
 * Mirrors {@link sttStreamError}: `errorCode` is 0 because a WebSocket frame has
 * no HTTP status; the protocol code lives in `code`.
 */
export function llmStreamError(failure: {
	reason: string;
	code?: string;
	ref?: string;
}): LLMError {
	return new LLMError(new ApiError(0, failure.code ?? 'llm_stream_error', failure.reason));
}

export class STTError extends Error {
	constructor(public underlyingError: ApiError) {
		super(`STT Error: ${underlyingError.detail}`);
		// Without this the class name is lost at runtime and `error.name` reads
		// "Error", which breaks logging and name-based matching.
		this.name = 'STTError';
	}

	/**
	 * Protocol/API error code, forwarded from the underlying error.
	 *
	 * For streaming STT this is the `stt.error` payload's `code` — an open
	 * string, since the server relays the provider's own codes verbatim. Match
	 * against `STT_ERROR_CODE` members rather than assuming the set is closed.
	 * A transport fault that aborts the stream forwards its connection reason
	 * here unchanged (an open string such as `ws_closed`; log the rest).
	 */
	get code(): string {
		return this.underlyingError.code;
	}
}

/**
 * Wraps a streaming `stt.error` payload as an {@link ApiError} so it can be
 * carried by {@link STTError} alongside REST failures.
 *
 * Keeping one error type for both transports means consumers do not have to
 * branch on how the transcript was requested. `errorCode` is 0 because a
 * WebSocket frame has no HTTP status; the protocol code lives in `code`.
 */
export function sttStreamError(failure: {
	reason: string;
	code?: string;
	ref?: string;
}): STTError {
	return new STTError(new ApiError(0, failure.code ?? 'stt_stream_error', failure.reason));
}

/**
 * Failure of the session WebSocket itself, as opposed to a failure of one
 * request carried over it.
 *
 * `code` is the protocol's string code — from the close frame's `reason` for
 * pre-accept rejections (`ws_session_not_found`, `ws_session_not_ready`, ...)
 * or from a `session.terminated` / `session.displaced` envelope. It is an open
 * string: protocol v1 treats new codes as an additive change, so match against
 * known values rather than assuming the set is closed.
 */
export class SessionSocketError extends Error {
	constructor(
		public code: string,
		message?: string
	) {
		super(message ?? `Session socket error: ${code}`);
		this.name = 'SessionSocketError';
	}
}

/**
 * Failure of a streaming STF turn.
 *
 * `code` is an open string rather than a union: the streaming STF frames carry
 * no server-side error channel today, so every code here is raised locally, and
 * a future server error frame must be able to forward its own code verbatim.
 */
export class STFError extends Error {
	constructor(
		public reason: string,
		public code?: string
	) {
		super(`STF Error: ${reason}`);
		this.name = 'STFError';
	}
}

export class TTSError extends Error {
	constructor(public underlyingError: ApiError | TTSDecodeError) {
		super(underlyingError.message);
		this.name = 'TTSError';
	}

	/**
	 * Protocol/API error code, forwarded from the underlying error.
	 *
	 * For streaming TTS over WS this is the `tts.error` payload's `code` (see
	 * {@link TTS_ERROR_CODE}) — an open string, since the server relays the
	 * provider's own codes verbatim. A client-requested cancel surfaces as
	 * `code === 'cancelled'`, which callers should treat distinctly from a
	 * failure. A decode failure has no code, so this is `undefined`.
	 */
	get code(): string | undefined {
		return this.underlyingError instanceof ApiError ? this.underlyingError.code : undefined;
	}
}

export class TTSDecodeError extends Error {
	constructor(public description: string) {
		super(`TTS decode error: ${description}`);
	}
}

/**
 * Wraps a streaming `tts.error` payload as an {@link ApiError} so it can be
 * carried by {@link TTSError} alongside REST failures.
 *
 * Mirrors {@link sttStreamError}: `errorCode` is 0 because a WebSocket frame has
 * no HTTP status; the protocol code lives in `code`.
 */
export function ttsStreamError(failure: {
	reason: string;
	code?: string;
	ref?: string;
}): TTSError {
	return new TTSError(new ApiError(0, failure.code ?? 'tts_stream_error', failure.reason));
}

/**
 * `processStreamingTTS()` was called on a session whose TTS type does not
 * confirm `streamable: true`.
 *
 * Raised by the SDK rather than forwarded from the server, and before the
 * request goes out: the TTS type is fixed when the session is created, so a
 * voice that cannot stream will not start streaming later in the same session.
 *
 * Every unconfirmed case raises it — an explicit `false`, a null or absent
 * field, a session with no TTS type, and a row that could not be read — because
 * streaming synthesis is unusable on a voice that does not support it, and a
 * request built on an unconfirmed flag can only fail later and less clearly.
 * `processTTS()` needs no streaming support and is the documented fallback.
 */
export class TTSNotStreamableError extends Error {
	constructor(public ttsType?: string) {
		super(
			ttsType
				? `TTS type "${ttsType}" does not report streamable: true; use processTTS() instead`
				: "This session's TTS type does not report streamable: true; use processTTS() instead"
		);
		this.name = 'TTSNotStreamableError';
	}
}

/**
 * Domain error thrown by `createSessionId()` (and the `getSessionTemplate`
 * path) when the underlying API returns an `ApiError`. The raw
 * `errorCode`, `code`, `detail`, and `attr` fields are preserved as-is —
 * callers inspect them to decide how to react (e.g. treat
 * `code === 'invalid'` with a "not found" detail as feature-unavailable
 * per LIV-1681).
 *
 * Extends `ApiError`, so existing `instanceof ApiError` branches keep
 * working.
 */
export class SessionCreationError extends ApiError {
	constructor(source: ApiError) {
		super(source.errorCode, source.code, source.detail, source.attr);
		this.name = 'SessionCreationError';
	}
}

/**
 * Session creation failed because a referenced resource does not exist.
 * Triggered when the server returns `code === 'does_not_exist'` — for
 * example, a `prompt_id` that has been deleted or never existed. The
 * `attr` field, when present, identifies which input field referenced
 * the missing resource (e.g. `'prompt'`).
 */
export class DoesNotExistError extends SessionCreationError {
	constructor(source: ApiError) {
		super(source);
		this.name = 'DoesNotExistError';
	}
}

/**
 * Session creation failed because a referenced resource is not assigned
 * to the caller's organization. Triggered when the server returns
 * `code === 'not_in_organization'` — for example, an LLM/TTS/STT type
 * that exists in the platform catalog but is not enabled for this
 * organization. The `attr` field, when present, identifies which input
 * field referenced the unavailable resource.
 */
export class NotInOrganizationError extends SessionCreationError {
	constructor(source: ApiError) {
		super(source);
		this.name = 'NotInOrganizationError';
	}
}

/**
 * Map an error caught during session creation into the SDK's domain error
 * hierarchy. Used by both client and server `createSessionId` entry points.
 *
 * - Already-domain errors (`SessionCreationError` and subclasses) pass
 *   through unchanged — protects against accidental double-wrapping.
 * - `ApiError` with `code === 'does_not_exist'` → `DoesNotExistError`.
 * - `ApiError` with `code === 'not_in_organization'` → `NotInOrganizationError`.
 * - Other `ApiError` → `SessionCreationError`.
 * - Non-`ApiError` exceptions are returned as-is.
 */
export function wrapSessionCreationApiError(err: unknown): unknown {
	if (err instanceof SessionCreationError) {
		return err;
	}
	if (err instanceof ApiError) {
		switch (err.code) {
			case 'does_not_exist':
				return new DoesNotExistError(err);
			case 'not_in_organization':
				return new NotInOrganizationError(err);
			default:
				return new SessionCreationError(err);
		}
	}
	return err;
}
