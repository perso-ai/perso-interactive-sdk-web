import { SessionSocketError } from '../shared/error';
import {
	type ErrorEnvelopePayload,
	type WsEnvelope,
	SESSION_SOCKET_CODE,
	WS_ENVELOPE_CODE,
	WS_TYPE,
	parseEnvelope,
	sessionWebSocketUrl
} from '../shared/ws-protocol';

/**
 * Ceiling on data queued in the socket's send buffer before the SDK refuses
 * to enqueue more. Roughly three seconds of 16 kHz mono base64 audio — enough
 * to ride out a transient stall, small enough that a genuinely dead uplink is
 * reported instead of silently consuming memory.
 */
const DEFAULT_MAX_BUFFERED_BYTES = 1024 * 1024;

/**
 * How long the handshake may take before the connect attempt is abandoned.
 *
 * A transport that opens but never sends `session.ready` would otherwise leave
 * every caller awaiting {@link SessionSocket.ensureOpen} pending forever, with
 * no error for the turn methods to wrap.
 */
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15000;

/** Code reported when the transport drops with no protocol reason attached. */
const UNEXPECTED_CLOSE_CODE = SESSION_SOCKET_CODE.CLOSED;

export interface SessionSocketOptions {
	apiServer: string;
	sessionId: string;
	/** Overridable for tests; defaults to the platform `WebSocket`. */
	webSocketImpl?: typeof WebSocket;
	maxBufferedBytes?: number;
	/** Bound on the `session.ready` handshake; defaults to 15 s. */
	handshakeTimeoutMs?: number;
}

export interface SessionSocketClose {
	code: string;
	reason: string;
}

type FrameHandler = (frame: WsEnvelope) => void;

/**
 * Owns the single WebSocket a session is allowed to hold.
 *
 * The protocol permits exactly one live consumer per `session_id` — a second
 * connect displaces the first (protocol section 3c) — so the connection is scoped to
 * the {@link Session} rather than to any one operation. It is opened lazily on
 * first use, which keeps sessions that never stream from paying for it, and
 * survives across operations so a push-to-talk turn does not pay a handshake
 * per utterance.
 *
 * Dispatch is keyed by frame type. Consumers exist for `session.*` (handled
 * here), `stt.*` (`stt-ws.ts`), `realtime_stt.*` (`stt-stream.ts`), `llm.*`
 * (`llm-ws.ts`) and `tts.*` (`tts-ws.ts`); each of those drivers also issues
 * the shared `cancel.request`. A new namespace means registering handlers, not reworking
 * the transport.
 */
export class SessionSocket {
	private readonly apiServer: string;
	private readonly sessionId: string;
	private readonly WebSocketImpl: typeof WebSocket | undefined;
	private readonly maxBufferedBytes: number;
	private readonly handshakeTimeoutMs: number;

	private ws: WebSocket | null = null;
	private opening: Promise<void> | null = null;
	private ready = false;
	/** Set by close(); makes this instance permanently unusable. */
	private disposed = false;
	/**
	 * Close info from a `session.terminated` / `session.displaced` envelope,
	 * which the server sends *before* closing. Preferred over the raw close
	 * frame because it carries the domain reason.
	 */
	private pendingClose: SessionSocketClose | null = null;
	/** Rejector for the in-flight connect, so close() can settle it. */
	private rejectOpening: ((error: SessionSocketError) => void) | null = null;

	private readonly handlers = new Map<string, Set<FrameHandler>>();
	private readonly closeListeners = new Set<(info: SessionSocketClose) => void>();
	private readonly errorListeners = new Set<(payload: ErrorEnvelopePayload) => void>();

	/** Capabilities reported by the server at handshake (`session.ready`). */
	capabilities: string[] = [];

	constructor(options: SessionSocketOptions) {
		this.apiServer = options.apiServer;
		this.sessionId = options.sessionId;
		this.WebSocketImpl =
			options.webSocketImpl ?? (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
		this.maxBufferedBytes = options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
		this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
	}

	/** Whether the handshake has completed and the socket is usable. */
	get connected(): boolean {
		return this.ready;
	}

	/**
	 * Connects if needed and resolves once the server has accepted the session.
	 *
	 * Resolution waits for `session.ready`, not merely for the transport to
	 * open: the server can accept the socket and still reject the session.
	 * Concurrent callers share one connection attempt. A socket that dropped on
	 * its own reconnects here; one closed via {@link close} does not.
	 */
	ensureOpen(): Promise<void> {
		if (this.disposed) {
			return Promise.reject(
				new SessionSocketError(SESSION_SOCKET_CODE.DISPOSED, 'Session socket has been closed')
			);
		}
		if (this.ready) return Promise.resolve();
		if (this.opening) return this.opening;

		this.opening = this.connect().finally(() => {
			this.opening = null;
		});
		return this.opening;
	}

	private connect(): Promise<void> {
		const WebSocketImpl = this.WebSocketImpl;
		if (!WebSocketImpl) {
			return Promise.reject(
				new SessionSocketError(
					SESSION_SOCKET_CODE.UNSUPPORTED,
					'WebSocket is not available in this environment'
				)
			);
		}

		return new Promise<void>((resolve, reject) => {
			let ws: WebSocket;
			try {
				ws = new WebSocketImpl(sessionWebSocketUrl(this.apiServer, this.sessionId));
			} catch (error) {
				// A synchronous constructor failure (malformed URL, CSP refusal) has no
				// close event to report through, so give it the same coded shape every
				// other open failure has — the turn methods wrap on that class.
				reject(
					new SessionSocketError(
						SESSION_SOCKET_CODE.CONNECT_FAILED,
						`Session socket could not be created: ${error instanceof Error ? error.message : String(error)}`
					)
				);
				return;
			}
			this.ws = ws;
			this.pendingClose = null;

			let settled = false;
			let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
			const settle = (fn: () => void) => {
				if (settled) return;
				settled = true;
				if (handshakeTimer !== null) clearTimeout(handshakeTimer);
				this.rejectOpening = null;
				fn();
			};
			this.rejectOpening = (error) => settle(() => reject(error));

			handshakeTimer = setTimeout(() => {
				if (settled) return;
				// Drop the reference before closing so the close this triggers is not
				// reported a second time through onclose.
				this.ws = null;
				try {
					ws.close();
				} catch {
					// Already closed; the rejection below is what matters.
				}
				settle(() =>
					reject(
						new SessionSocketError(
							SESSION_SOCKET_CODE.HANDSHAKE_TIMEOUT,
							`Session socket handshake timed out after ${this.handshakeTimeoutMs}ms`
						)
					)
				);
			}, this.handshakeTimeoutMs);

			const socket = ws as unknown as {
				onopen: (() => void) | null;
				onmessage: ((event: { data: string }) => void) | null;
				onclose: ((event: { code: number; reason: string }) => void) | null;
				onerror: (() => void) | null;
			};

			socket.onopen = null;

			socket.onmessage = (event) => {
				const frame = parseEnvelope(String(event.data));
				if (!frame) return;

				if (frame.type === WS_TYPE.SESSION_READY && !settled) {
					const capabilities = (frame.payload as { capabilities?: unknown }).capabilities;
					settle(() => {
						this.ready = true;
						this.capabilities = Array.isArray(capabilities) ? (capabilities as string[]) : [];
						resolve();
					});
				}

				if (
					frame.type === WS_TYPE.SESSION_TERMINATED ||
					frame.type === WS_TYPE.SESSION_DISPLACED
				) {
					const payload = frame.payload as { code?: string; reason?: string };
					this.pendingClose = {
						code: payload.code ?? frame.type,
						reason: payload.reason ?? ''
					};
				}

				// A top-level `error` envelope (protocol section 7: bad_envelope /
				// unknown_type / oversize) is not correlated to a request `id`, so the
				// id-keyed dispatch would drop it and the in-flight request would sit
				// until its idle/terminal timeout. Surface it to error listeners so a
				// waiting request can fail fast instead — e.g. an `unknown_type` from a
				// server that predates the frame the SDK just sent.
				if (frame.type === WS_TYPE.ERROR) {
					const payload = frame.payload as unknown as ErrorEnvelopePayload;
					// The envelope carries no request id, so an envelope fault fails every
					// in-flight request — the socket can no longer be trusted to speak that
					// frame. Rate limiting is different: it is transient (retry_after_ms)
					// and the server reports a rate-limited request through that request's
					// own `*.error`, so it must not abort unrelated work.
					if (payload.code !== WS_ENVELOPE_CODE.RATE_LIMITED) {
						this.notifyError(payload);
					}
				}

				this.dispatch(frame);
			};

			socket.onclose = (event) => {
				// Guard against a second close for the same connection: FakeWebSocket
				// and some browsers deliver close after an explicit close() too.
				if (this.ws !== ws) return;
				this.ws = null;
				this.ready = false;

				const reason = event?.reason ?? '';
				const info = this.pendingClose ?? {
					code: reason === '' ? UNEXPECTED_CLOSE_CODE : reason,
					reason
				};
				this.pendingClose = null;

				if (!settled) {
					settle(() =>
						reject(new SessionSocketError(info.code, `Session socket closed: ${info.code}`))
					);
					return;
				}

				this.notifyClosed(info);
			};

			socket.onerror = () => {
				// Errors are reported through onclose, which always follows. Handling
				// them here as well would produce a duplicate rejection.
			};
		});
	}

	/**
	 * Sends one envelope.
	 *
	 * @throws SessionSocketError if the socket is not connected, or if queued
	 *   data has exceeded the backpressure ceiling. Audio is never dropped to
	 *   relieve pressure — a silently truncated stream produces a wrong
	 *   transcript with no signal, so the caller is told instead.
	 */
	send(type: string, id: string | undefined, payload: object): void {
		const ws = this.ws;
		if (!ws || !this.ready) {
			throw new SessionSocketError(
				SESSION_SOCKET_CODE.NOT_CONNECTED,
				`Cannot send ${type}: socket is not open`
			);
		}

		if (ws.bufferedAmount > this.maxBufferedBytes) {
			throw new SessionSocketError(
				SESSION_SOCKET_CODE.BACKPRESSURE,
				`Cannot send ${type}: send buffer is ${ws.bufferedAmount} bytes ` +
					`(limit ${this.maxBufferedBytes}); the connection cannot keep up`
			);
		}

		ws.send(JSON.stringify({ type, ...(id !== undefined && { id }), payload }));
	}

	/** Subscribes to a frame type. Returns an unsubscribe function. */
	on(type: string, handler: FrameHandler): () => void {
		const existing = this.handlers.get(type);
		if (existing) {
			existing.add(handler);
		} else {
			this.handlers.set(type, new Set([handler]));
		}

		return () => {
			this.handlers.get(type)?.delete(handler);
		};
	}

	/** Subscribes to connection loss. Returns an unsubscribe function. */
	onClosed(listener: (info: SessionSocketClose) => void): () => void {
		this.closeListeners.add(listener);
		return () => {
			this.closeListeners.delete(listener);
		};
	}

	/**
	 * Subscribes to top-level `error` envelopes — envelope-level protocol faults
	 * (`bad_envelope` / `unknown_type` / `oversize`) that carry no request `id`.
	 * In-flight requests use this to fail fast rather than wait for a timeout.
	 * Returns an unsubscribe function.
	 */
	onError(listener: (payload: ErrorEnvelopePayload) => void): () => void {
		this.errorListeners.add(listener);
		return () => {
			this.errorListeners.delete(listener);
		};
	}

	/** Closes the socket permanently. Further {@link ensureOpen} calls reject. */
	close(): void {
		this.disposed = true;
		this.ready = false;
		const ws = this.ws;
		this.ws = null;

		// Settle any in-flight connect before the reference is dropped. The
		// onclose handler bails out on `this.ws !== ws`, so once the reference is
		// gone it can no longer reject for us and the caller awaiting
		// ensureOpen() would hang for the life of the page.
		const rejectOpening = this.rejectOpening;
		this.rejectOpening = null;
		rejectOpening?.(
			new SessionSocketError(
				SESSION_SOCKET_CODE.DISPOSED,
				'Session socket was closed while connecting'
			)
		);

		try {
			ws?.close();
		} catch {
			// Closing an already-closed socket is not an error worth surfacing.
		}
	}

	private dispatch(frame: WsEnvelope): void {
		const handlers = this.handlers.get(frame.type);
		if (!handlers) return;

		// Snapshot: a handler may unsubscribe itself while we iterate.
		for (const handler of [...handlers]) {
			try {
				handler(frame);
			} catch {
				// One consumer's failure must not stop the others from seeing the
				// frame, nor escape into the WebSocket event loop.
			}
		}
	}

	private notifyClosed(info: SessionSocketClose): void {
		for (const listener of [...this.closeListeners]) {
			try {
				listener(info);
			} catch {
				// As with dispatch: a listener must not break the close path.
			}
		}
	}

	private notifyError(payload: ErrorEnvelopePayload): void {
		// Snapshot: a listener may unsubscribe itself while we iterate.
		for (const listener of [...this.errorListeners]) {
			try {
				listener(payload);
			} catch {
				// A listener's failure must not stop the others, nor escape into the
				// WebSocket event loop.
			}
		}
	}
}
