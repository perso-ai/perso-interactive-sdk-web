import emojiRegex from 'emoji-regex';
import {
	ApiError,
	LLMError,
	LLMStreamingResponseError,
	PersoUtil,
	SessionEvent,
	STTError,
	TTSError,
	TTSDecodeError,
	decodeTTSAudio
} from '../shared';
import { LlmProcessor } from './llm';
import {
	type Chat,
	ChatState,
	ChatTool,
	type LLMStreamChunk,
	type ProcessLLMOptions
} from './types';
import { WavRecorder } from './wav-recorder';
import { Perso, type STFMessage, type STTErrorMessage, type STTMessage } from './perso';

export { type Chat, ChatState, ChatTool };

const HEARTBEAT_INTERVAL_MS = 10000;

/**
 * Manages a full Perso chat session including UI state, LLM orchestration,
 * microphone handling, and speech synthesis triggers.
 */
export class Session {
	private chatStatesHandler: EventTarget = new EventTarget();
	private chatLogHandler: EventTarget = new EventTarget();
	private sttEventHandler: EventTarget | null = null;

	private errorHandler: EventTarget = new EventTarget();

	private lastStfTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
	private stfTotalDuration: number = 0;
	private stfTimeoutStartTime: number = 0;

	private messageHistory: Array<object> = [];
	private chatLog: Array<Chat> = [];
	private llmProcessor!: LlmProcessor;

	private chatStateMap: Map<ChatState, number> = new Map([
		[ChatState.RECORDING, 0],
		[ChatState.LLM, 0],
		[ChatState.ANALYZING, 0],
		[ChatState.SPEAKING, 0],
		[ChatState.TTS, 0]
	]);

	private emojiRegex: RegExp = emojiRegex();

	private sttRecorder: WavRecorder | null = null;
	private sttTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
	private sttTimeoutAudioFile: File | null = null;

	private heartbeatIntervalId: ReturnType<typeof setTimeout> | null = null;

	private readonly legacyVoiceChatMode: boolean;
	private readonly stream: MediaStream | null;

	/**
	 * Sets up message listeners and chat-state trackers for a Perso session.
	 * @param apiServer Perso API server URL.
	 * @param sessionId Id of the session negotiated with the backend.
	 * @param perso Underlying Perso WebRTC controller.
	 * @param clientTools Tools exposed to the LLM for function calling.
	 * @param options Optional configuration.
	 * @param options.stream Local audio stream for legacy bidirectional mode.
	 * @param options.legacyVoiceChatMode Whether legacy voice chat mode is enabled.
	 */
	constructor(
		public apiServer: string,
		public sessionId: string,
		public perso: Perso | null,
		public clientTools: Array<ChatTool>,
		options?: { stream?: MediaStream; legacyVoiceChatMode?: boolean }
	) {
		this.legacyVoiceChatMode = options?.legacyVoiceChatMode ?? false;
		this.stream = options?.stream ?? null;
		this.resetChatState();
		this.llmProcessor = new LlmProcessor({
			apiServer,
			sessionId,
			clientTools,
			callbacks: {
				onChatStateChange: (add, remove) => this.setChatState(add, remove),
				onError: (error) => this.setError(error),
				onChatLog: (message, isUser) => this.addMessageToChatLog(message, isUser),
				onTTSTF: (message) => this.processTTSTFInternal(message)
			}
		});

		this.startHeartbeat();

		if (!perso) return;

		perso.subscribeStatus((event: CustomEvent) => {
			if (event.detail?.live === false) {
				this.stopHeartbeat();
			}
		});

		perso.setMessageCallback('stf', (data: STFMessage) => {
			if (
				!this.chatStateMap.get(ChatState.ANALYZING) &&
				!this.chatStateMap.get(ChatState.SPEAKING)
			) {
				return;
			}
			this.setChatState(ChatState.SPEAKING, ChatState.ANALYZING);
			if (this.lastStfTimeoutHandle !== null) {
				clearTimeout(this.lastStfTimeoutHandle);

				let currentTime = Date.now();
				this.stfTotalDuration += data.duration + 1000 - (currentTime - this.stfTimeoutStartTime);
				this.stfTimeoutStartTime = currentTime;
				this.lastStfTimeoutHandle = setTimeout(() => {
					this.lastStfTimeoutHandle = null;
					this.stfTimeoutStartTime = 0;
					this.stfTotalDuration = 0;
					this.setChatState(null, ChatState.SPEAKING);
				}, this.stfTotalDuration);
			} else {
				this.stfTimeoutStartTime = Date.now();
				this.stfTotalDuration = data.duration + 2000;
				this.lastStfTimeoutHandle = setTimeout(() => {
					this.lastStfTimeoutHandle = null;
					this.stfTimeoutStartTime = 0;
					this.stfTotalDuration = 0;
					this.setChatState(null, ChatState.SPEAKING);
				}, this.stfTotalDuration);
			}
		});

		perso.setMessageCallback('stt', (data: STTMessage) => {
			this.setChatState(null, ChatState.ANALYZING);

			if (this.sttEventHandler != null) {
				this.sttEventHandler.dispatchEvent(
					new CustomEvent('stt', {
						detail: data.text
					})
				);
			} else {
				if (data.text === '') {
					return;
				}

				this.processChat(data.text);
			}
		});

		perso.setMessageCallback('stt-error', (data: STTErrorMessage) => {
			void data;
			this.setChatState(null, ChatState.ANALYZING);
		});
	}

	private llmJob: Promise<any> | null = null;

	/**
	 * Sends a user utterance through Perso's internal LLM and speaks the result
	 * while automatically updating history, chat logs, and chat states.
	 * @param message User message to forward to the LLM.
	 * @remarks
	 * - Emits entries via `subscribeChatLog`.
	 * - Updates all chat states published through `subscribeChatStates`.
	 * - Maintains `messageHistory` for subsequent LLM calls.
	 */
	async processChat(message: string) {
		if (message.trim().length === 0) return;

		this.pipelineSuppressed = false;
		this.addMessageToChatLog(message, true);

		this.llmJob = this.processChatInternal(message);
	}

	processLLM(options: ProcessLLMOptions): AsyncGenerator<LLMStreamChunk> {
		this.pipelineSuppressed = false;
		return this.llmProcessor.processLLM(options);
	}

	getMessageHistory(): ReadonlyArray<object> {
		return this.llmProcessor.getHistory();
	}

	/** @deprecated Use processTTSTF() with explicit history management instead. */
	processCustomChat(message: string) {
		if (message.trim().length === 0) return;

		this.processTTSTFInternal(message);
	}

	/**
	 * Sends an assistant message to the LLM history and triggers TTSTF playback.
	 * @param message Assistant output that should be spoken immediately.
	 */
	processTTSTF(message: string) {
		if (message.trim().length === 0) return;

		this.pipelineSuppressed = false;
		this.messageHistory.push({
			role: 'assistant',
			type: 'message',
			content: message
		});
		this.addMessageToChatLog(message, false);
		this.processTTSTFInternal(message);
	}

	async transcribeAudio(audio: Blob | File, language?: string): Promise<string> {
		const audioFile =
			audio instanceof File ? audio : new File([audio], 'audio.wav', { type: audio.type });

		try {
			const result = await PersoUtil.makeSTT(this.apiServer, this.sessionId, audioFile, language);
			return result.text;
		} catch (error) {
			if (error instanceof ApiError) {
				throw new STTError(error);
			}
			throw error;
		}
	}

	async processSTF(file: Blob, format: string, message: string): Promise<string> {
		if (!this.perso) {
			throw new Error('processSTF requires WebRTC (STF mode)');
		}
		this.pipelineSuppressed = false;
		this.setChatState(ChatState.ANALYZING);
		try {
			const result = await this.perso.stf(file, format, message);
			if (this.pipelineSuppressed) {
				this.setChatState(null, ChatState.ANALYZING);
				return result;
			}
			return result;
		} catch (error) {
			this.setChatState(null, ChatState.ANALYZING);
			throw error;
		}
	}

	async processTTS(
		message: string,
		options: { resample?: boolean } = {}
	): Promise<Blob | undefined> {
		const { resample = true } = options;
		const filteredMessage = this.removeEmoji(message).trim();
		if (filteredMessage.length === 0) return;
		this.pipelineSuppressed = false;

		const textForTTS = /[.?!]$/.test(filteredMessage) ? filteredMessage : filteredMessage + '.';

		this.setChatState(ChatState.TTS, null);
		try {
			const { audio } = await PersoUtil.makeTTS(this.apiServer, {
				sessionId: this.sessionId,
				text: textForTTS
			});
			if (this.pipelineSuppressed) return undefined;
			const ttsResult = await decodeTTSAudio(audio, resample);
			return ttsResult;
		} catch (error) {
			if (error instanceof ApiError || error instanceof TTSDecodeError) {
				this.setError(new TTSError(error));
			} else {
				this.setError(error instanceof Error ? error : new Error(String(error)));
			}
		} finally {
			this.setChatState(null, ChatState.TTS);
		}
	}

	/**
	 * Triggers the recording state and instructs Perso to buffer microphone
	 * audio for speech-to-text.
	 *
	 * In legacy mode this sends a `record-start` DataChannel message to the
	 * server which begins buffering the bidirectional audio stream.
	 *
	 * @returns Result of `perso.recordStart()`.
	 * @deprecated Use startProcessSTT() instead. Legacy voice chat mode will be removed in a future version.
	 */
	startVoiceChat() {
		if (!this.perso) {
			throw new Error('startVoiceChat requires WebRTC (STF mode)');
		}
		this.pipelineSuppressed = false;
		this.setChatState(ChatState.RECORDING);
		return this.perso.recordStart();
	}

	/**
	 * Stops the microphone capture, transitions the UI to analyzing, and sends
	 * the buffered audio to STT.
	 *
	 * In legacy mode this sends a `record-end-stt` DataChannel message.  The
	 * server responds with a `"stt"` message which is handled by the
	 * `setMessageCallback("stt")` listener in the constructor, triggering
	 * `processChat` automatically.
	 *
	 * @deprecated Use stopProcessSTT() instead. Legacy voice chat mode will be removed in a future version.
	 */
	stopVoiceChat() {
		if (!this.perso) {
			throw new Error('stopVoiceChat requires WebRTC (STF mode)');
		}
		this.setChatState(ChatState.ANALYZING, ChatState.RECORDING);
		this.perso.recordEndStt();
	}

	/**
	 * Starts recording audio for STT processing.
	 * Uses Web Audio API internally to capture microphone input and encode to WAV format.
	 * @param timeout Optional timeout in milliseconds to automatically stop recording.
	 * @throws Error if already recording or if microphone access is denied.
	 */
	async startProcessSTT(timeout?: number): Promise<void> {
		if (this.sttRecorder?.isRecording()) {
			throw new Error('STT recording is already in progress');
		}

		this.pipelineSuppressed = false;
		this.setChatState(ChatState.RECORDING);
		try {
			// WavRecorder handles getUserMedia internally for cross-browser WAV encoding
			// Use 16000Hz sample rate for optimal STT processing (resampled via OfflineAudioContext)
			this.sttRecorder = new WavRecorder({ targetSampleRate: 16000 });
			await this.sttRecorder.start();

			if (timeout && timeout > 0) {
				this.sttTimeoutHandle = setTimeout(async () => {
					this.sttTimeoutHandle = null;
					if (this.sttRecorder?.isRecording()) {
						// Auto-stop and save the audio file for later use by stopProcessSTT
						try {
							this.sttTimeoutAudioFile = await this.sttRecorder.stop();
						} catch {
							this.sttTimeoutAudioFile = null;
							this.setChatState(null, ChatState.RECORDING);
						}
						this.sttRecorder = null;
					}
				}, timeout);
			}
		} catch (error) {
			this.setChatState(null, ChatState.RECORDING);
			this.sttRecorder = null;
			throw error;
		}
	}

	/**
	 * Result of STT processing including transcribed text and recorded audio.
	 */
	public lastRecordedAudioFile: File | null = null;

	/**
	 * Stops STT recording and sends the audio to the STT API for transcription.
	 * @param language Optional language code for STT (e.g., 'ko', 'en').
	 * @returns Promise resolving to the transcribed text.
	 * @throws STTError if the API call fails.
	 * @throws Error if not currently recording.
	 */
	async stopProcessSTT(language?: string): Promise<string> {
		if (this.sttTimeoutHandle) {
			clearTimeout(this.sttTimeoutHandle);
			this.sttTimeoutHandle = null;
		}

		this.setChatState(null, ChatState.RECORDING);

		let audioFile: File;

		// Check if we have a saved audio file from timeout
		if (this.sttTimeoutAudioFile) {
			audioFile = this.sttTimeoutAudioFile;
			this.sttTimeoutAudioFile = null;
		} else if (this.sttRecorder?.isRecording()) {
			// Normal case: stop the active recorder
			audioFile = await this.sttRecorder.stop();
			this.sttRecorder = null;
		} else if (this.sttRecorder) {
			// Recorder exists but not recording (shouldn't happen normally)
			this.sttRecorder = null;
			throw new Error('STT recording is not in progress');
		} else {
			throw new Error('STT recording has not been started');
		}

		// Store the audio file for playback
		this.lastRecordedAudioFile = audioFile;

		try {
			const result = await PersoUtil.makeSTT(this.apiServer, this.sessionId, audioFile, language);
			return result.text;
		} catch (error) {
			if (error instanceof ApiError) {
				throw new STTError(error);
			}
			throw error;
		}
	}

	/**
	 * Checks if STT recording is currently in progress or has audio pending processing.
	 * @returns True if recording is active or audio is pending from timeout.
	 */
	isSTTRecording(): boolean {
		return (this.sttRecorder?.isRecording() ?? false) || this.sttTimeoutAudioFile !== null;
	}

	/**
	 * Resizes the avatar video canvas on the remote renderer.
	 * @param width Target width in CSS pixels.
	 * @param height Target height in CSS pixels.
	 */
	changeSize(width: number, height: number) {
		this.perso?.changeSize(width, height);
	}

	/**
	 * Cancels any ongoing LLM/TTS jobs, clears remote buffers, and resets all
	 * chat-state timers.
	 */
	async clearBuffer() {
		this.perso?.clearBuffer();

		await this.clearLLMJob();

		if (this.lastStfTimeoutHandle !== null) {
			clearTimeout(this.lastStfTimeoutHandle);
			this.lastStfTimeoutHandle = null;
		}

		this.pipelineSuppressed = true;
		this.resetChatState();
	}

	/**
	 * Assigns the remote video stream to a DOM video tag.
	 * @param element Target video element.
	 */
	setSrc(element: HTMLVideoElement) {
		element.srcObject = this.getRemoteStream() ?? null;
	}

	/**
	 * Returns the first remote stream exposed by the Perso renderer.
	 * @returns Remote `MediaStream`.
	 */
	getRemoteStream() {
		return this.perso?.getStream();
	}

	/**
	 * Returns the local microphone stream associated with the session.
	 * Only available in legacy voice chat mode.
	 * @returns Local `MediaStream` or `null` if not in legacy mode.
	 * @deprecated Legacy voice chat mode will be removed in a future version.
	 */
	getLocalStream(): MediaStream | null {
		return this.stream;
	}

	/**
	 * Gracefully closes the session and remote connection.
	 */
	stopSession() {
		this.close();
	}

	/**
	 * Subscribes to Perso status events and notifies the caller when the session
	 * closes (distinguishing manual/automatic closure).
	 *
	 * In non-WebRTC mode (perso is null), the callback is never invoked and a
	 * no-op unsubscribe is returned. Use `setErrorHandler` to detect session
	 * termination caused by heartbeat failure instead.
	 *
	 * @param callback Invoked with `true` when closed manually.
	 * @returns Function to unsubscribe the listener.
	 */
	onClose(callback: (manualClosed: boolean) => void) {
		if (!this.perso) {
			return () => {};
		}
		return this.perso.subscribeStatus((event: CustomEvent) => {
			if (event.detail != null && event.detail.live === false) {
				callback(event.detail.code === 200);
			}
		});
	}

	/**
	 * Subscribes to chat-state updates.
	 * @param callback Handler receiving the active state set.
	 * @returns Function to unsubscribe.
	 */
	subscribeChatStates(callback: (chatStates: Set<ChatState>) => void) {
		const wrapper = (e: CustomEvent) => {
			callback(e.detail.status);
		};
		this.chatStatesHandler.addEventListener('status', wrapper as EventListener);
		return () => {
			this.chatStatesHandler.removeEventListener('status', wrapper as EventListener);
		};
	}

	/**
	 * Subscribes to chat-log updates (most recent message first).
	 * @param callback Handler receiving the full chat log snapshot.
	 * @returns Function to unsubscribe.
	 */
	subscribeChatLog(callback: (chatLog: Array<Chat>) => void) {
		const wrapper = (e: CustomEvent) => {
			callback(e.detail.chatLog);
		};
		this.chatLogHandler.addEventListener('chatLog', wrapper as EventListener);
		return () => {
			this.chatLogHandler.removeEventListener('chatLog', wrapper as EventListener);
		};
	}

	/**
	 * Streams raw STT text results to the provided callback instead of routing
	 * them back into the LLM pipeline automatically.
	 * @param callback Handler for STT transcripts.
	 * @returns Function to unsubscribe/reset STT event handling.
	 */
	setSttResultCallback(callback: (text: string) => void) {
		const wrapper = (e: CustomEvent) => {
			callback(e.detail);
		};
		this.sttEventHandler = new EventTarget();
		this.sttEventHandler.addEventListener('stt', wrapper as EventListener);
		return () => {
			this.sttEventHandler?.removeEventListener('stt', wrapper as EventListener);
			this.sttEventHandler = null;
		};
	}

	/**
	 * Allows UI code to react to LLM/streaming errors.
	 * @param callback Handler receiving the raised error.
	 * @returns Function to unsubscribe.
	 */
	setErrorHandler(callback: (error: Error) => void) {
		const wrapper = (e: CustomEvent) => {
			callback(e.detail.error);
		};
		this.errorHandler.addEventListener('error', wrapper as EventListener);
		return () => {
			this.errorHandler.removeEventListener('error', wrapper as EventListener);
		};
	}

	/**
	 * @returns Session identifier assigned by the backend.
	 */
	getSessionId() {
		return this.sessionId;
	}

	private async processChatInternal(message: string | Array<object> | null) {
		this.setChatState(ChatState.LLM);

		const tools = this.clientTools.map((client_tool) => {
			return {
				type: 'function',
				function: {
					description: client_tool.description,
					name: client_tool.name,
					parameters: client_tool.parameters
				}
			};
		});

		const newMessageHistory = new Array<object>();
		if (message === null) {
			// do nothing
		} else if (message instanceof Array) {
			newMessageHistory.push(...message);
		} else if (typeof message === 'string') {
			newMessageHistory.push({ role: 'user', content: message });
		}

		const response = await fetch(`${this.apiServer}/api/v1/session/${this.sessionId}/llm/v2/`, {
			body: JSON.stringify({
				messages: [...this.messageHistory, ...newMessageHistory],
				tools: tools
			}),
			headers: {
				'Content-Type': 'application/json'
			},
			method: 'POST'
		});

		if (!response.ok) {
			const json = await response.json();
			const error = new LLMError(
				new ApiError(
					response.status,
					json.errors[0].code,
					json.errors[0].detail,
					json.errors[0].attr
				)
			);
			this.setError(error);
			this.setChatState(null, ChatState.LLM);

			return;
		}

		const reader = response.body?.getReader();
		const decoder = new TextDecoder('utf-8');

		let contents = '';
		let pendingToolCallsMessage: any = null;
		let buffer = '';
		while (true) {
			const { done, value } = await reader!.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });

			let boundary;
			while ((boundary = buffer.indexOf('\n')) !== -1) {
				if (this.llmCancel) {
					if (contents.length > 0) {
						this.addMessageToChatLog(contents, false);
					}
					this.setChatState(null, ChatState.LLM);

					return;
				}

				const line = buffer.slice(0, boundary).trim();
				buffer = buffer.slice(boundary + 1);
				if (!line.startsWith('data: {')) {
					const error = new LLMError(new LLMStreamingResponseError('Failed to parse SSE response'));
					this.setError(error);
					this.setChatState(null, ChatState.LLM);

					return;
				}

				const message = JSON.parse(line.slice(6).trim());
				if (message.status !== 'success') {
					const error = new LLMError(new LLMStreamingResponseError(message.reason));
					this.setError(error);
					this.setChatState(null, ChatState.LLM);

					return;
				}

				if (contents.length > 0 && message.type != 'message') {
					newMessageHistory.push({
						role: 'assistant',
						type: 'message',
						content: contents
					});
					this.addMessageToChatLog(contents, false);

					contents = '';
				}

				if (message.type === 'message') {
					contents += message.content;
					this.processTTSTFInternal(message.content);

					continue;
				}

				if (message.type === 'tool_call' && message.tool_calls != null) {
					newMessageHistory.push({
						role: 'assistant',
						type: message.type,
						content: message.content,
						tool_calls: message.tool_calls
					});

					pendingToolCallsMessage = message;

					continue;
				}

				if (message.role === 'tool') {
					if (message.type === 'tool_call') {
						newMessageHistory.push({
							role: message.role,
							type: message.type,
							content: message.content,
							tool_call_id: message.tool_call_id
						});
					}
					continue;
				}
			}
		}

		if (this.llmCancel) {
			this.setChatState(null, ChatState.LLM);

			return;
		}

		if (pendingToolCallsMessage != null) {
			const runTools = [];
			for (const toolCallMessage of pendingToolCallsMessage.tool_calls) {
				const chatTool = this.getChatTool(this.clientTools, toolCallMessage.function.name);
				if (chatTool == null) continue;

				runTools.push(
					new Promise(async (resolve) => {
						try {
							const chatToolResult = await chatTool.call(
								JSON.parse(toolCallMessage.function.arguments)
							);
							resolve({
								toolCallId: toolCallMessage.id,
								chatTool: chatTool,
								chatToolResult: chatToolResult
							});
						} catch (e) {
							resolve({
								toolCallId: toolCallMessage.id,
								chatTool: chatTool,
								chatToolResult: { result: 'error!' }
							});
						}
					})
				);
			}

			const toolCallResults = (await Promise.all(runTools)) as Array<{
				toolCallId: string;
				chatTool: ChatTool;
				chatToolResult: object;
			}>;

			for (const toolCallResult of toolCallResults) {
				newMessageHistory.push({
					role: 'tool',
					content: JSON.stringify(toolCallResult.chatToolResult),
					tool_call_id: toolCallResult.toolCallId
				});
			}

			// Cases requiring a follow-up LLM call:
			// 1. When requested with a combination of Remote MCP (excluding database_search) and Client Tool
			// 2. When at least one of the requested Client tools is !executeOnly
			// In both cases above, a follow-up LLM call must be made.
			// Since history contains tool results, sending a new message afterwards will only respond to that message
			const predicate1 =
				toolCallResults.length > 0 &&
				pendingToolCallsMessage.tool_calls.length !== toolCallResults.length;
			const predicate2 = toolCallResults.some((value) => !value.chatTool.executeOnly);
			if (predicate1 || predicate2) {
				await this.processChatInternal(newMessageHistory);
			} else {
				this.messageHistory.push(...newMessageHistory);
			}
		} else {
			this.messageHistory.push(...newMessageHistory);
		}

		this.setChatState(null, ChatState.LLM);
	}

	/**
	 * Looks up a tool definition by the function name provided in a tool_call.
	 * @param clientTools Registered tools.
	 * @param funcName Name requested by the LLM.
	 * @returns Matching `ChatTool` or null.
	 */
	private getChatTool(clientTools: Array<ChatTool>, funcName: string) {
		for (const tool of clientTools) {
			if (tool.name === funcName) {
				return tool;
			}
		}
		return null;
	}

	/**
	 * Cancels any in-flight LLM stream by flipping the cancellation flag and
	 * awaiting the pending promise if necessary.
	 */
	private llmCancel = false;
	private pipelineSuppressed = false;

	private async clearLLMJob() {
		if (this.llmJob != null) {
			this.llmCancel = true;
			await this.llmJob;
			this.llmCancel = false;
		}
	}

	/**
	 * Filters/sanitizes text and sends it to Perso's TTSTF endpoint while toggling
	 * the ANALYZING chat state.
	 * @param message Assistant message to speak aloud.
	 */
	private processTTSTFInternal(message: string) {
		const filteredMessage = this.removeEmoji(message).trim();
		if (filteredMessage.length === 0) {
			return;
		}

		if (!this.perso) return;

		this.setChatState(ChatState.ANALYZING);
		this.perso.ttstf(filteredMessage);
	}

	/**
	 * Adds an entry at the top of the chat log and notifies subscribers.
	 * @param message Text to store.
	 * @param isUser Whether the entry was produced by the user.
	 */
	private addMessageToChatLog(message: string, isUser: boolean) {
		this.chatLog = [{ text: message, isUser, timestamp: new Date() }, ...this.chatLog];

		this.chatLogHandler.dispatchEvent(
			new CustomEvent('chatLog', {
				detail: {
					chatLog: this.chatLog
				}
			})
		);
	}

	/**
	 * Adjusts the internal reference-counted chat-state map and emits changes as
	 * needed.
	 * @param add State(s) to activate/increment.
	 * @param remove State(s) to deactivate/decrement.
	 */
	private setChatState(
		add: ChatState | Array<ChatState> | null = null,
		remove: ChatState | Array<ChatState> | null = null
	) {
		const newChatStateMap = new Map(this.chatStateMap);

		function addChatState(chatState: ChatState) {
			if (chatState === ChatState.ANALYZING) {
				newChatStateMap.set(chatState, (newChatStateMap.get(chatState) || 0) + 1);
			} else {
				newChatStateMap.set(chatState, 1);
			}
		}

		function removeChatState(chatState: ChatState) {
			if (chatState === ChatState.ANALYZING) {
				newChatStateMap.set(chatState, Math.max((newChatStateMap.get(chatState) || 0) - 1, 0));
			} else {
				newChatStateMap.set(chatState, 0);
			}
		}

		if (add != null) {
			if (add instanceof Array) {
				for (let chatState of add) {
					addChatState(chatState);
				}
			} else {
				addChatState(add);
			}
		}

		if (remove != null) {
			if (remove instanceof Array) {
				for (let chatState of remove) {
					removeChatState(chatState);
				}
			} else {
				removeChatState(remove);
			}
		}

		const prevChatStateSet = this.exchangeChatStateMapToSet(this.chatStateMap);
		const newChatStateSet = this.exchangeChatStateMapToSet(newChatStateMap);

		this.chatStateMap = newChatStateMap;

		if (!this.isEqualChatStateMap(prevChatStateSet, newChatStateSet)) {
			this.dispatchChatState(newChatStateSet);
		}
	}

	/**
	 * Resets all chat states to an idle baseline and emits the update.
	 */
	private resetChatState() {
		this.chatStateMap = new Map([
			[ChatState.RECORDING, 0],
			[ChatState.LLM, 0],
			[ChatState.ANALYZING, 0],
			[ChatState.SPEAKING, 0],
			[ChatState.TTS, 0]
		]);
		this.dispatchChatState(this.exchangeChatStateMapToSet(this.chatStateMap));
	}

	/**
	 * Converts the ref-counted map into a set of active chat states.
	 * @param state Current state map.
	 * @returns Set of states whose count is > 0.
	 */
	private exchangeChatStateMapToSet(state: Map<ChatState, number>): Set<ChatState> {
		const chatStateSet = new Set<ChatState>();
		for (const chatState of state) {
			if (chatState[1] > 0) {
				chatStateSet.add(chatState[0]);
			}
		}
		return chatStateSet;
	}

	/**
	 * Broadcasts chat-state updates via the internal EventTarget.
	 * @param newChatStateSet Active state set.
	 */
	private dispatchChatState(newChatStateSet: Set<ChatState>) {
		this.chatStatesHandler.dispatchEvent(
			new CustomEvent('status', {
				detail: {
					status: newChatStateSet
				}
			})
		);
	}

	/**
	 * Compares two chat-state sets for equality.
	 */
	private isEqualChatStateMap(a: Set<ChatState>, b: Set<ChatState>) {
		if (a.size !== b.size) return false;
		for (const val of a) {
			if (a.has(val) !== b.has(val)) return false;
		}

		return true;
	}

	/**
	 * Emits an error event for UI subscribers.
	 */
	private setError(error: Error) {
		this.errorHandler.dispatchEvent(
			new CustomEvent('error', {
				detail: {
					error: error
				}
			})
		);
	}

	/**
	 * Gracefully closes the underlying Perso connection on behalf of the session.
	 */
	private close() {
		this.stopHeartbeat();
		this.perso?.closeSelf();
	}

	private startHeartbeat() {
		const sendHeartbeat = async () => {
			try {
				await PersoUtil.sessionEvent(this.apiServer, this.sessionId, SessionEvent.SESSION_DURING);
				if (this.heartbeatIntervalId !== null) {
					this.heartbeatIntervalId = setTimeout(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
				}
			} catch (error) {
				if (error instanceof ApiError) {
					this.setError(error);
				} else {
					this.setError(error instanceof Error ? error : new Error(String(error)));
				}
				this.close();
			}
		};
		this.heartbeatIntervalId = setTimeout(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
	}

	private stopHeartbeat() {
		if (this.heartbeatIntervalId !== null) {
			clearTimeout(this.heartbeatIntervalId);
			this.heartbeatIntervalId = null;
		}
	}

	/**
	 * Strips emoji characters that TTSTF may not render correctly.
	 * @param str Text to sanitize.
	 * @returns Filtered string.
	 */
	private removeEmoji(str: string) {
		return str.replace(this.emojiRegex, '');
	}
}

/**
 * Creates a Session with REST-based STT/TTS (current mode).
 */
export function createSession(
	apiServer: string,
	sessionId: string,
	width: number,
	height: number,
	clientTools: Array<ChatTool>
): Promise<Session>;
/**
 * Creates a Session with bidirectional WebRTC audio (legacy mode).
 * @deprecated Legacy voice chat mode will be removed in a future version.
 *   Use the 5-argument overload with REST-based STT/TTS instead.
 */
export function createSession(
	apiServer: string,
	sessionId: string,
	width: number,
	height: number,
	enableVoiceChat: boolean,
	clientTools: Array<ChatTool>
): Promise<Session>;
export async function createSession(
	apiServer: string,
	sessionId: string,
	width: number,
	height: number,
	enableVoiceChatOrClientTools: boolean | Array<ChatTool>,
	clientTools?: Array<ChatTool>
): Promise<Session> {
	if (typeof enableVoiceChatOrClientTools !== 'boolean') {
		const perso = await Perso.create(apiServer, sessionId, width, height);
		return new Session(apiServer, sessionId, perso, enableVoiceChatOrClientTools);
	}

	const enableVoiceChat = enableVoiceChatOrClientTools;
	const tools = clientTools ?? [];

	let stream: MediaStream;
	let releaseAudioSourceFunc: VoidFunction;

	if (enableVoiceChat) {
		stream = await navigator.mediaDevices.getUserMedia({
			audio: true,
			video: false
		});
		releaseAudioSourceFunc = () => {};
	} else {
		const audioContext = new AudioContext();
		const oscillator = audioContext.createOscillator();
		oscillator.frequency.value = 0;
		const destination = audioContext.createMediaStreamDestination();
		oscillator.connect(destination);
		oscillator.start();
		stream = destination.stream;

		releaseAudioSourceFunc = () => {
			oscillator.stop();
			oscillator.disconnect(destination);
			audioContext.close();
		};
	}

	const perso = await Perso.create(apiServer, sessionId, width, height, stream);

	if (!perso) {
		releaseAudioSourceFunc();
		return new Session(apiServer, sessionId, null, tools);
	}

	const session = new Session(apiServer, sessionId, perso, tools, {
		stream,
		legacyVoiceChatMode: true
	});

	session.onClose(() => {
		releaseAudioSourceFunc();
	});

	return session;
}
