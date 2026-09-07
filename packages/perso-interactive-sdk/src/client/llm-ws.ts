import { LLMError, llmStreamError } from '../shared/error';
import {
	type LlmDeltaPayload,
	type LlmErrorPayload,
	type LlmFinishPayload,
	type LlmMessage,
	type LlmToolCall,
	type LlmToolCallPayload,
	LLM_ERROR_CODE,
	MAX_LLM_MESSAGES_CHARS,
	MAX_LLM_TOOLS_CHARS,
	randomId,
	WS_TYPE,
	type WsEnvelope
} from '../shared/ws-protocol';
import type { SessionSocket } from './session-socket';

/**
 * How long to wait for an `llm.delta` or the terminal frame before giving up.
 * Reset on every inbound frame so a long but healthy generation is not cut off.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 60000;

/** A normalized LLM stream event, transport-agnostic. */
export type LlmWsEvent =
	| { kind: 'delta'; role?: string; content: string; sentenceComplete: boolean }
	| { kind: 'tool_call'; toolCalls: LlmToolCall[]; synthetic: boolean }
	| { kind: 'finish'; reason: string };

export interface LlmWsStreamOptions {
	socket: SessionSocket;
	/** Full OpenAI-format chat history — the client owns it (protocol section 5). */
	messages: LlmMessage[];
	tools?: LlmMessage[];
	/** Aborts the request when it fires; the stream then ends gracefully. */
	signal?: AbortSignal;
	idleTimeoutMs?: number;
}

/**
 * Drives one `llm.request` → `llm.delta`* → `llm.finish` exchange over the
 * shared session socket, bridging the socket's push callbacks into a pull-based
 * async iterator.
 *
 * {@link run} yields normalized {@link LlmWsEvent}s and returns on `llm.finish`;
 * it throws an {@link LLMError} on `llm.error` or a socket drop. Tool-call
 * handling, history, and chunk batching stay with the caller — this is only the
 * transport. Requests are demultiplexed by `id`, so several can share one
 * connection.
 */
export class LlmWsStream {
	readonly id: string;

	private readonly socket: SessionSocket;
	private readonly messages: LlmMessage[];
	private readonly tools?: LlmMessage[];
	private readonly signal?: AbortSignal;
	private readonly idleTimeoutMs: number;

	private readonly queue: LlmWsEvent[] = [];
	private readonly unsubscribes: Array<() => void> = [];
	private started = false;
	private done = false;
	private error: LLMError | null = null;
	private wake: (() => void) | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private onAbort: (() => void) | null = null;

	constructor(options: LlmWsStreamOptions) {
		this.socket = options.socket;
		this.messages = options.messages;
		this.tools = options.tools;
		this.signal = options.signal;
		this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
		this.id = `llm-${randomId()}`;
	}

	/**
	 * Sends `llm.request` and yields events until the turn ends. Iterate with
	 * `for await`; the first pull sends the request. Breaking out early (or the
	 * `signal` firing) cancels the in-flight request.
	 */
	async *run(): AsyncGenerator<LlmWsEvent> {
		if (this.started) {
			throw llmStreamError({ reason: 'LlmWsStream.run() may only be called once' });
		}
		this.started = true;

		// Already aborted before anything went out: there is no server-side request
		// to cancel, so end without sending llm.request (which would start a
		// generation a later cancel could not match) or a pointless cancel frame.
		if (this.signal?.aborted) {
			this.done = true;
			return;
		}

		const payload = this.buildRequestPayload(); // throws locally on oversize

		this.subscribe();
		if (this.signal) {
			this.onAbort = () => this.cancel();
			this.signal.addEventListener('abort', this.onAbort);
		}
		this.armIdleTimer();

		try {
			this.socket.send(WS_TYPE.LLM_REQUEST, this.id, payload);
		} catch (error) {
			this.teardown();
			throw toLlmError(error);
		}

		try {
			while (true) {
				while (this.queue.length > 0) {
					yield this.queue.shift()!;
				}
				if (this.error) throw this.error;
				if (this.done) return;
				await new Promise<void>((resolve) => {
					this.wake = resolve;
				});
			}
		} finally {
			// A consumer that breaks early (or a thrown error) leaves the request
			// live on the server; cancel it so the slot frees and no orphan audio
			// is generated. A completed turn is already done, so this is a no-op.
			this.cancel();
			this.teardown();
		}
	}

	/**
	 * Aborts the request. Sends `cancel.request`; the stream ends gracefully
	 * (the consumer sees the iterator finish, not a throw). Backs barge-in.
	 */
	cancel(): void {
		if (this.done) return;
		this.sendCancelFrame();
		this.done = true;
		this.notify();
	}

	/** Tells the server to stop the in-flight generation for this request id. */
	private sendCancelFrame(): void {
		try {
			this.socket.send(WS_TYPE.CANCEL_REQUEST, `cancel-${randomId()}`, { target_id: this.id });
		} catch {
			// The socket is already gone; the request is aborted either way.
		}
	}

	private buildRequestPayload(): { messages: LlmMessage[]; tools?: LlmMessage[] } {
		const messagesJson = JSON.stringify(this.messages);
		if (messagesJson.length > MAX_LLM_MESSAGES_CHARS) {
			throw llmStreamError({
				reason:
					`LLM messages are ${messagesJson.length} chars, over the ` +
					`${MAX_LLM_MESSAGES_CHARS} the server accepts.`
			});
		}

		if (this.tools && this.tools.length > 0) {
			const toolsJson = JSON.stringify(this.tools);
			if (toolsJson.length > MAX_LLM_TOOLS_CHARS) {
				throw llmStreamError({
					reason:
						`LLM tools are ${toolsJson.length} chars, over the ` +
						`${MAX_LLM_TOOLS_CHARS} the server accepts.`
				});
			}
			return { messages: this.messages, tools: this.tools };
		}
		return { messages: this.messages };
	}

	private subscribe(): void {
		const forRequest = (handler: (frame: WsEnvelope) => void) => (frame: WsEnvelope) => {
			if (frame.id !== this.id || this.done) return;
			this.armIdleTimer();
			handler(frame);
		};

		this.unsubscribes.push(
			this.socket.on(
				WS_TYPE.LLM_DELTA,
				forRequest((frame) => {
					const p = frame.payload as unknown as LlmDeltaPayload;
					this.push({
						kind: 'delta',
						...(p.role !== undefined && { role: p.role }),
						content: p.content ?? '',
						sentenceComplete: p.sentence_complete ?? false
					});
				})
			),
			this.socket.on(
				WS_TYPE.LLM_TOOL_CALL,
				forRequest((frame) => {
					const p = frame.payload as unknown as LlmToolCallPayload;
					this.push({
						kind: 'tool_call',
						toolCalls: p.tool_calls ?? [],
						synthetic: p.synthetic ?? false
					});
				})
			),
			this.socket.on(
				WS_TYPE.LLM_FINISH,
				forRequest((frame) => {
					const p = frame.payload as unknown as LlmFinishPayload;
					this.push({ kind: 'finish', reason: p.reason });
					this.finishOk();
				})
			),
			this.socket.on(
				WS_TYPE.LLM_ERROR,
				forRequest((frame) => {
					const p = frame.payload as unknown as LlmErrorPayload;
					// A cancel is a client-requested stop, not a failure.
					if (p.code === LLM_ERROR_CODE.CANCELLED) {
						this.finishOk();
						return;
					}
					this.finishErr(llmStreamError(p));
				})
			),
			this.socket.onClosed((info) => {
				this.finishErr(
					llmStreamError({
						reason: `Session socket closed before the LLM turn finished: ${info.code}`,
						code: info.code
					})
				);
			}),
			this.socket.onError((payload) => {
				// A top-level protocol error (e.g. unknown_type on a server that does
				// not support llm.request) carries no request id, so fail fast here
				// instead of waiting for the idle timeout.
				this.finishErr(
					llmStreamError({
						reason: payload.message ?? 'session socket protocol error',
						code: payload.code
					})
				);
			})
		);
	}

	private push(event: LlmWsEvent): void {
		if (this.done) return;
		this.queue.push(event);
		this.notify();
	}

	private finishOk(): void {
		if (this.done) return;
		this.done = true;
		this.notify();
	}

	private finishErr(error: LLMError): void {
		if (this.done) return;
		this.error = error;
		this.done = true;
		this.notify();
	}

	private notify(): void {
		const wake = this.wake;
		this.wake = null;
		wake?.();
	}

	private armIdleTimer(): void {
		if (this.idleTimer !== null) clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => {
			// The socket is still open — frames just stopped arriving — so the server
			// is still generating. Tell it to stop before abandoning the turn, or it
			// keeps producing output nothing will read.
			this.sendCancelFrame();
			this.finishErr(
				llmStreamError({
					reason: `No LLM frame within ${this.idleTimeoutMs}ms`,
					code: LLM_ERROR_CODE.IDLE_TIMEOUT
				})
			);
		}, this.idleTimeoutMs);
	}

	private teardown(): void {
		if (this.idleTimer !== null) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		if (this.signal && this.onAbort) {
			this.signal.removeEventListener('abort', this.onAbort);
			this.onAbort = null;
		}
		while (this.unsubscribes.length > 0) {
			this.unsubscribes.pop()?.();
		}
	}
}

/** Converts a transport-level throw into the LLM error contract. */
function toLlmError(error: unknown): LLMError {
	if (error instanceof LLMError) return error;
	const source = error as { code?: string; message?: string };
	return llmStreamError({ reason: source?.message ?? String(error), code: source?.code });
}
