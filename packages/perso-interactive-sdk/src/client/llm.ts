import { ChatState, ChatTool, type LLMStreamChunk, type ProcessLLMOptions } from './types';
import { ApiError, LLMError, LLMStreamingResponseError, PersoUtil, removeEmoji } from '../shared';

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
 * Handles LLM streaming, SSE parsing, tool execution, and message history
 * management as a standalone module.
 */
export class LlmProcessor {
	private messageHistory: Array<object> = [];
	constructor(private config: LlmProcessorConfig) {}

	/**
	 * Streams LLM responses as an AsyncGenerator, yielding {@link LLMStreamChunk}
	 * discriminated by `type`: `assistant`, `tool_call`, `tool_result`, `error`.
	 *
	 * Consumers get pull-based control over the stream — backpressure,
	 * early exit via `break`, and `AbortSignal` cancellation are handled
	 * naturally by the generator protocol.
	 *
	 * **Yield strategy**: message-type SSE events within a single `reader.read()`
	 * are batched into one `assistant` chunk (accumulated `chunks[]` + `message`).
	 * Non-message events (`tool_call`, `tool`) flush pending message chunks first
	 * to preserve ordering.
	 *
	 * **Tool execution** happens internally — `tool_call` and `tool_result` chunks
	 * are yielded for observability. If tools require a follow-up LLM call,
	 * the generator loops transparently.
	 *
	 * @param options - Message, optional tool overrides, and optional AbortSignal.
	 * @yields {LLMStreamChunk} Streaming chunks. The final `assistant` chunk
	 *   has `finish: true` and contains the complete `chunks[]` / `message`.
	 * @throws {Error} If `options.message` is empty.
	 * @throws {LLMError} Re-thrown when the initial fetch fails with a non-API error.
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

				let reader: ReadableStreamDefaultReader<Uint8Array>;
				try {
					reader = await PersoUtil.makeLLM(
						this.config.apiServer,
						this.config.sessionId,
						{ messages: messagePayload, tools: tools },
						options.signal
					);
				} catch (error) {
					if (error instanceof ApiError) {
						yield { type: 'error', error: new LLMError(error) };
						return;
					}
					throw error;
				}

				state.streamingError = null;
				yield* this.parseSSEStream(reader, state, options);

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

	private async *parseSSEStream(
		reader: ReadableStreamDefaultReader<Uint8Array>,
		state: StreamState,
		options: ProcessLLMOptions
	): AsyncGenerator<LLMStreamChunk> {
		const decoder = new TextDecoder('utf-8');
		let buffer = '';
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

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });

			let boundary;
			while ((boundary = buffer.indexOf('\n')) !== -1) {
				if (options.signal?.aborted) {
					state.aborted = true;
					return;
				}

				const line = buffer.slice(0, boundary).trim();
				buffer = buffer.slice(boundary + 1);
				if (!line.startsWith('data: {')) {
					state.streamingError = new LLMError(
						new LLMStreamingResponseError('Failed to parse SSE response')
					);
					yield { type: 'error', error: state.streamingError };
					return;
				}

				let parsedMessage: any;
				try {
					parsedMessage = JSON.parse(line.slice(6).trim());
				} catch {
					state.streamingError = new LLMError(
						new LLMStreamingResponseError('Failed to parse SSE JSON')
					);
					yield { type: 'error', error: state.streamingError };
					return;
				}
				if (parsedMessage.status !== 'success') {
					state.streamingError = new LLMError(new LLMStreamingResponseError(parsedMessage.reason));
					yield { type: 'error', error: state.streamingError };
					return;
				}

				if (contents.length > 0 && parsedMessage.type != 'message') {
					state.newMessageHistory.push({
						role: 'assistant',
						type: 'message',
						content: contents
					});
					contents = '';

					// Flush pending chunks before non-message event
					const pending = yieldChunks();
					if (pending) yield pending;
				}

				if (parsedMessage.type === 'message') {
					const filtered = removeEmoji(parsedMessage.content);
					contents += filtered;
					state.message += filtered;
					state.allChunks.push(filtered);
					continue;
				}

				if (parsedMessage.type === 'tool_call' && parsedMessage.tool_calls != null) {
					state.newMessageHistory.push({
						role: 'assistant',
						type: parsedMessage.type,
						content: parsedMessage.content,
						tool_calls: parsedMessage.tool_calls
					});
					state.pendingToolCallsMessage = parsedMessage;
					yield {
						type: 'tool_call',
						tool_calls: parsedMessage.tool_calls
					};
					continue;
				}

				if (parsedMessage.role === 'tool') {
					if (parsedMessage.type === 'tool_call') {
						state.newMessageHistory.push({
							role: parsedMessage.role,
							type: parsedMessage.type,
							content: parsedMessage.content,
							tool_call_id: parsedMessage.tool_call_id
						});
					}
					continue;
				}
			}

			// After processing all lines from this read, yield batched chunks
			const pending = yieldChunks();
			if (pending) yield pending;
		}

		// Process any data left in the buffer after the stream ends without a trailing '\n'.
		// Without this, the last SSE event would be silently dropped.
		const remaining = buffer.trim();
		if (remaining.length > 0) {
			if (!remaining.startsWith('data: {')) {
				state.streamingError = new LLMError(
					new LLMStreamingResponseError('Failed to parse SSE response')
				);
				yield { type: 'error', error: state.streamingError };
				return;
			}

			let parsedMessage: any;
			try {
				parsedMessage = JSON.parse(remaining.slice(6).trim());
			} catch {
				state.streamingError = new LLMError(
					new LLMStreamingResponseError('Failed to parse SSE JSON')
				);
				yield { type: 'error', error: state.streamingError };
				return;
			}

			if (parsedMessage.status !== 'success') {
				state.streamingError = new LLMError(new LLMStreamingResponseError(parsedMessage.reason));
				yield { type: 'error', error: state.streamingError };
				return;
			}

			if (parsedMessage.type === 'message') {
				const filtered = removeEmoji(parsedMessage.content);
				contents += filtered;
				state.message += filtered;
				state.allChunks.push(filtered);
			} else if (parsedMessage.type === 'tool_call' && parsedMessage.tool_calls != null) {
				if (contents.length > 0) {
					state.newMessageHistory.push({
						role: 'assistant',
						type: 'message',
						content: contents
					});
					contents = '';
					const pending = yieldChunks();
					if (pending) yield pending;
				}
				state.newMessageHistory.push({
					role: 'assistant',
					type: parsedMessage.type,
					content: parsedMessage.content,
					tool_calls: parsedMessage.tool_calls
				});
				state.pendingToolCallsMessage = parsedMessage;
				yield {
					type: 'tool_call',
					tool_calls: parsedMessage.tool_calls
				};
			}
		}

		if (contents.length > 0) {
			state.newMessageHistory.push({
				role: 'assistant',
				type: 'message',
				content: contents
			});
		}
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
