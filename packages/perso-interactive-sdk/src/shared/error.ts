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
	}
}

export class LLMStreamingResponseError extends Error {
	constructor(public description: string) {
		super();
	}
}

export class STTError extends Error {
	constructor(public underlyingError: ApiError) {
		super(`STT Error: ${underlyingError.detail}`);
	}
}

export class TTSError extends Error {
	constructor(public underlyingError: ApiError | TTSDecodeError) {
		super(underlyingError.message);
	}
}

export class TTSDecodeError extends Error {
	constructor(public description: string) {
		super(`TTS decode error: ${description}`);
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
