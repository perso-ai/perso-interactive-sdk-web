import { ChatState, ChatTool, type LLMStreamChunk, type ProcessLLMOptions } from './types';
import { LLMError, LLMStreamingResponseError, llmStreamError, SessionSocketError } from '../shared/error';
import { removeEmoji } from '../shared/text';
import { LlmWsStream } from './llm-ws';
import { SessionSocket } from './session-socket';

/** Maximum number of tool follow-up rounds before aborting to prevent infinite loops. */
const MAX_TOOL_ROUNDS = 10;

/**
 * Callbacks that LlmProcessor uses to notify the host of side effects.
 */
export interface LlmProcessorCallbacks {
	onChatStateChange: (add: ChatState | null, remove: ChatState | null) => void;
	onError: (error: Error) => void;
	onChatLog: (message: string, isUser: boolean) => void;
	onTTSTF: (message: string) => void;
}

/**
 * Configuration for LlmProcessor construction.
 */
export interface LlmProcessorConfig {
	apiServer: string;
	sessionId: string;
	clientTools: Array<ChatTool>;
	callbacks: LlmProcessorCallbacks;
	/**
	 * Supplies the session's shared WebSocket, which carries `llm.*`. `Session`
	 * passes its own socket here so the connection is reused. When omitted, the
	 * processor opens its own socket from `apiServer`/`sessionId` — kept optional
	 * so existing standalone constructions keep working unchanged.
	 */
	getSocket?: () => SessionSocket;
}

interface StreamState {
	newMessageHistory: Array<object>;
	allChunks: string[];
	message: string;
	lastYieldedChunkCount: number;
	pendingToolCallsMessage: any;
	aborted: boolean;
	streamingError: Error | null;
	lastToolCallResults?: Array<{ toolCallId: string; chatTool: ChatTool; chatToolResult: object }>;
}

/**
 * Handles LLM streaming (over the session WebSocket), tool execution, and
 * message history management as a standalone module.
 */
export class LlmProcessor {
	private messageHistory: Array<object> = [];
	private fallbackSocket: SessionSocket | null = null;
	constructor(private config: LlmProcessorConfig) {}

	/**
	 * The socket to run `llm.*` over: the session's shared one when provided,
	 * otherwise a lazily-opened socket owned by this processor.
	 */
	private resolveSocket(): SessionSocket {
		if (this.config.getSocket) return this.config.getSocket();
		this.fallbackSocket ??= new SessionSocket({
			apiServer: this.config.apiServer,
			sessionId: this.config.sessionId
		});
		return this.fallbackSocket;
	}

	/**
	 * Closes any socket this processor opened on its own.
	 *
	 * A no-op when `getSocket` was supplied (the caller — e.g. {@link Session} —
	 * owns and closes that socket). Standalone constructions that omit `getSocket`
	 * should call this when done so the fallback WebSocket is released rather than
	 * lingering until page unload.
	 */
	dispose(): void {
		this.fallbackSocket?.close();
		this.fallbackSocket = null;
	}

	/**
	 * Streams LLM responses as an AsyncGenerator, yielding {@link LLMStreamChunk}
	 * discriminated by `type`: `message`, `tool_call`, `tool_result`, `error`.
	 *
	 * Consumers get pull-based control over the stream — backpressure,
	 * early exit via `break`, and `AbortSignal` cancellation are handled
	 * naturally by the generator protocol.
	 *
	 * **Yield strategy**: consecutive `llm.delta` frames are accumulated into one
	 * `message` chunk (`chunks[]` + `message`). A `tool_call` flushes any
	 * pending message chunk first to preserve ordering.
	 *
	 * **Tool execution** happens internally — `tool_call` and `tool_result` chunks
	 * are yielded for observability. If tools require a follow-up LLM call,
	 * the generator loops transparently.
	 *
	 * **Failures**: a socket that will not open, an `llm.error` frame, or a
	 * dropped socket are yielded as an `error` chunk (an {@link LLMError})
	 * rather than thrown, so a consumer sees one terminal chunk either way.
	 *
	 * @param options - Message, optional tool overrides, and optional AbortSignal.
	 * @yields {LLMStreamChunk} Streaming chunks. The final `message` chunk
	 *   has `finish: true` and contains the complete `chunks[]` / `message`.
	 * @throws {Error} If `options.message` is empty.
	 */
	async *processLLM(options: ProcessLLMOptions): AsyncGenerator<LLMStreamChunk> {
		if (options.message.length === 0) {
			throw new Error('Message cannot be empty');
		}

		const availableTools = options.tools ?? this.config.clientTools;
		const tools = availableTools.map((clientTool) => {
			return {
				type: 'function',
				function: {
					description: clientTool.description,
					name: clientTool.name,
					parameters: clientTool.parameters
				}
			};
		});

		const state: StreamState = {
			newMessageHistory: [{ role: 'user', content: options.message }],
			allChunks: [],
			message: '',
			lastYieldedChunkCount: 0,
			pendingToolCallsMessage: null,
			aborted: false,
			streamingError: null
		};

		let toolRoundCount = 0;
		let messagePayload = [...this.messageHistory, ...state.newMessageHistory];

		this.config.callbacks.onChatStateChange(ChatState.LLM, null);
		try {
			// An already-aborted turn does no transport work at all.
			if (options.signal?.aborted) {
				return;
			}

			const socket = this.resolveSocket();
			try {
				await socket.ensureOpen();
			} catch (error) {
				// The WS transport is internal to the SDK: a connection-level failure
				// is still an LLM failure to the caller, who never chose WebSocket over
				// REST. Surface it as LLMError — matching stopProcessSTT / processTTS —
				// so `instanceof LLMError` keeps working; the socket's code is
				// preserved on `.code`. Only a non-Error is wrapped from scratch.
				yield {
					type: 'error',
					error:
						error instanceof SessionSocketError
							? llmStreamError({ reason: error.message, code: error.code })
							: error instanceof Error
								? error
								: llmStreamError({ reason: String(error) })
				};
				return;
			}

			while (true) {
				if (options.signal?.aborted) {
					if (state.allChunks.length > 0) {
						yield {
							type: 'message',
							chunks: [...state.allChunks],
							message: state.message,
							finish: true
						};
					}
					return;
				}

				const wsStream = new LlmWsStream({
					socket,
					messages: messagePayload as Array<Record<string, unknown>>,
					tools: tools as Array<Record<string, unknown>>,
					...(options.signal && { signal: options.signal })
				});

				state.streamingError = null;
				yield* this.parseWsStream(wsStream, state, options);

				if (state.streamingError) {
					return;
				}

				if (state.aborted) {
					if (state.allChunks.length > 0) {
						yield {
							type: 'message',
							chunks: [...state.allChunks],
							message: state.message,
							finish: true
						};
					}
					return;
				}

				if (state.pendingToolCallsMessage != null) {
					yield* this.executeToolCalls(state, availableTools);

					const toolCallResults = state.lastToolCallResults!;
					const predicate1 =
						toolCallResults.length > 0 &&
						state.pendingToolCallsMessage.tool_calls.length !== toolCallResults.length;
					const predicate2 = toolCallResults.some((value) => !value.chatTool.executeOnly);
					if (predicate1 || predicate2) {
						toolRoundCount++;
						if (toolRoundCount >= MAX_TOOL_ROUNDS) {
							yield {
								type: 'error',
								error: new LLMError(
									new LLMStreamingResponseError(
										`Tool follow-up loop exceeded maximum rounds (${MAX_TOOL_ROUNDS})`
									)
								)
							};
							return;
						}
						messagePayload = [...this.messageHistory, ...state.newMessageHistory];
						state.pendingToolCallsMessage = null;
						continue;
					}
				}

				this.messageHistory.push(...state.newMessageHistory);
				yield {
					type: 'message',
					chunks: [...state.allChunks],
					message: state.message,
					finish: true
				};
				return;
			}
		} finally {
			this.config.callbacks.onChatStateChange(null, ChatState.LLM);
		}
	}

	/**
	 * Consumes one `llm.request` turn's frames from {@link LlmWsStream}, updating
	 * `state` and yielding the same {@link LLMStreamChunk}s the REST path did.
	 *
	 * The transport differs but the downstream contract does not: `llm.delta`
	 * frames accumulate into `message` chunks (emoji-stripped, same as
	 * before), `llm.tool_call` becomes a `tool_call` chunk and arms the tool
	 * round, and `llm.finish` ends the turn. A `llm.error` (or a socket drop)
	 * surfaces as an `error` chunk and sets `state.streamingError`, matching how
	 * the previous REST/SSE path reported a failed stream.
	 */
	private async *parseWsStream(
		wsStream: LlmWsStream,
		state: StreamState,
		options: ProcessLLMOptions
	): AsyncGenerator<LLMStreamChunk> {
		let contents = '';
		state.pendingToolCallsMessage = null;

		const yieldChunks = (): LLMStreamChunk | null => {
			if (state.allChunks.length > state.lastYieldedChunkCount) {
				state.lastYieldedChunkCount = state.allChunks.length;
				return {
					type: 'message',
					chunks: [...state.allChunks],
					message: state.message,
					finish: false
				};
			}
			return null;
		};

		const flushAssistantText = () => {
			if (contents.length > 0) {
				state.newMessageHistory.push({ role: 'assistant', type: 'message', content: contents });
				contents = '';
			}
		};

		try {
			for await (const event of wsStream.run()) {
				if (options.signal?.aborted) {
					state.aborted = true;
					return;
				}

				if (event.kind === 'delta') {
					const filtered = removeEmoji(event.content);
					if (filtered.length === 0) continue;
					contents += filtered;
					state.message += filtered;
					state.allChunks.push(filtered);
					const pending = yieldChunks();
					if (pending) yield pending;
					continue;
				}

				if (event.kind === 'tool_call') {
					// Server-injected (RAG) tool calls are already resolved server-side;
					// the client must not execute them. Surface for observability, but
					// do not arm the tool round or record them as client history.
					if (event.synthetic) {
						yield { type: 'tool_call', tool_calls: event.toolCalls };
						continue;
					}

					// Flush any assistant text that preceded the tool call, preserving
					// the message-before-tool_call ordering.
					flushAssistantText();
					const pending = yieldChunks();
					if (pending) yield pending;

					state.newMessageHistory.push({
						role: 'assistant',
						type: 'tool_call',
						// The inline content (if any) was flushed as a separate message
						// entry above; the tool_call entry carries null, matching the
						// shape the REST path recorded.
						content: null,
						tool_calls: event.toolCalls
					});
					state.pendingToolCallsMessage = { tool_calls: event.toolCalls };
					yield { type: 'tool_call', tool_calls: event.toolCalls };
					continue;
				}

				// event.kind === 'finish' — the turn is complete; nothing more to read.
			}
		} catch (error) {
			const llmError =
				error instanceof LLMError
					? error
					: llmStreamError({ reason: error instanceof Error ? error.message : String(error) });
			state.streamingError = llmError;
			yield { type: 'error', error: llmError };
			return;
		}

		// A barge-in that fires during an idle gap (between deltas) ends the stream
		// without another event for the in-loop abort check to observe, so the loop
		// exits normally. Discard the partial turn here too — committing truncated
		// assistant text would poison the next request's history.
		if (options.signal?.aborted) {
			state.aborted = true;
			return;
		}

		flushAssistantText();
	}

	private async *executeToolCalls(
		state: StreamState,
		availableTools: Array<ChatTool>
	): AsyncGenerator<LLMStreamChunk> {
		const getTool = (funcName: string) => {
			for (const tool of availableTools) {
				if (tool.name === funcName) {
					return tool;
				}
			}
			return null;
		};

		const runTools: Array<
			Promise<{ toolCallId: string; chatTool: ChatTool; chatToolResult: object }>
		> = [];
		for (const toolCallMessage of state.pendingToolCallsMessage.tool_calls) {
			const chatTool = getTool(toolCallMessage.function.name);
			if (chatTool == null) continue;

			runTools.push(
				(async () => {
					try {
						const chatToolResult = await chatTool.call(
							JSON.parse(toolCallMessage.function.arguments)
						);
						return {
							toolCallId: toolCallMessage.id,
							chatTool: chatTool,
							chatToolResult: chatToolResult
						};
					} catch (e) {
						return {
							toolCallId: toolCallMessage.id,
							chatTool: chatTool,
							chatToolResult: { error: (e as Error).message }
						};
					}
				})()
			);
		}

		const toolCallResults = await Promise.all(runTools);
		state.lastToolCallResults = toolCallResults;

		for (const toolCallResult of toolCallResults) {
			state.newMessageHistory.push({
				role: 'tool',
				content: JSON.stringify(toolCallResult.chatToolResult),
				tool_call_id: toolCallResult.toolCallId
			});
			yield {
				type: 'tool_result',
				tool_call_id: toolCallResult.toolCallId,
				result: toolCallResult.chatToolResult
			};
		}
	}

	addToHistory(entry: object): void {
		this.messageHistory.push(entry);
	}

	getHistory(): ReadonlyArray<object> {
		return this.messageHistory;
	}
}
