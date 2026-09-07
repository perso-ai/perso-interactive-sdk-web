import {
	ApiError,
	LLMError,
	LLMStreamingResponseError,
	SessionSocketError,
	STFError,
	STTError,
	sttStreamError,
	TTSError,
	TTSDecodeError,
	TTSNotStreamableError,
	ttsStreamError
} from '../shared/error';
import { PersoUtil, SessionEvent } from '../shared/perso_util';
import {
	base64ToArrayBuffer,
	blobToArrayBuffer,
	decodeAudioToPcm,
	decodeTTSAudio
} from '../shared/audio';
import { resampleAudio, TTS_TARGET_SAMPLE_RATE } from '../shared/audio-resampler';
import { removeEmoji } from '../shared/text';
import {
	PcmStreamDecoder,
	STREAMING_TTS_CHANNELS,
	STREAMING_TTS_SAMPLE_RATE
} from '../shared/pcm-stream';
import { encodeWav } from '../shared/wav-utils';
import { encodeBase64 } from '../shared/pcm-encode';
import type { StreamingTTSStream } from '../shared/settings';
import type {
	SessionInfo,
	STTResponse,
	StreamingTTSOutputFormat,
	TTSOutputFormat,
	TTSType
} from '../shared/types';
import { LlmProcessor } from './llm';
import {
	type Chat,
	ChatState,
	ChatTool,
	type LLMStreamChunk,
	type ProcessLLMOptions
} from './types';
import { WavRecorder } from './wav-recorder';
import { PcmStreamRecorder } from './pcm-recorder';
import { SessionSocket } from './session-socket';
import {
	SttStream,
	type SttPartial,
	type SttResultMeta,
	type SttUtterance
} from './stt-stream';
import { SttRequest } from './stt-ws';
import { TtsRequest } from './tts-ws';
import { TTS_ERROR_CODE } from '../shared/ws-protocol';
import {
	Perso,
	type ControlErrorMessage,
	type STFMessage,
	type STTErrorMessage,
	type STTMessage
} from './perso';
import { STF_STREAM_SAMPLE_RATE, StfStream } from './stf-stream';

/** PCM chunk shapes a live audio source may yield: mono 24 kHz, Float32 in [-1, 1] or s16le bytes. */
export type StfPcmChunk = Float32Array | Int16Array | Uint8Array | ArrayBuffer;

/**
 * Audio accepted by {@link Session.processSTF}: a finished clip, or a live
 * source whose own end closes the turn.
 */
export type StfAudioSource = Blob | ReadableStream<StfPcmChunk> | AsyncIterable<StfPcmChunk>;

/** Resolves a live source to one pull interface, whatever shape it arrived in. */
function toPcmIterator(
	source: ReadableStream<StfPcmChunk> | AsyncIterable<StfPcmChunk>
): AsyncIterator<StfPcmChunk> {
	const readable = source as ReadableStream<StfPcmChunk>;
	if (typeof readable.getReader === 'function') {
		const reader = readable.getReader();
		return {
			async next(): Promise<IteratorResult<StfPcmChunk>> {
				const { done, value } = await reader.read();
				return done ? { done: true, value: undefined } : { done: false, value: value as StfPcmChunk };
			},
			async return(): Promise<IteratorResult<StfPcmChunk>> {
				await reader.cancel().catch(() => undefined);
				// Without this the caller's stream stays locked forever and a later
				// getReader()/pipeTo() on it throws.
				reader.releaseLock();
				return { done: true, value: undefined };
			}
		};
	}
	return (source as AsyncIterable<StfPcmChunk>)[Symbol.asyncIterator]();
}

/** Raced against `source.next()`, so a cancelled turn cannot hang on a silent source. */
const TURN_FINISHED = Symbol('stf-turn-finished');

/**
 * Narrows an `output_format` to the PCM variants the session WebSocket
 * (`tts.request`) can carry, or `undefined` for a format only the one-shot
 * `/tts/` endpoint can produce.
 */
function asStreamingFormat(format: TTSOutputFormat): StreamingTTSOutputFormat | undefined {
	return format === 'pcm' || format === 'pcm_24000' ? format : undefined;
}

export { type Chat, ChatState, ChatTool };

const HEARTBEAT_INTERVAL_MS = 10000;

/**
 * How the session's STT type wants audio delivered. Read from the session row,
 * never chosen by the caller: the server rejects the mismatching transport
 * outright, so this is a property of the session rather than of the call.
 */
interface SttMode {
	streaming: boolean;
	endOfTurnDetection: boolean;
}

const NON_STREAMING: SttMode = { streaming: false, endOfTurnDetection: false };

/** Options accepted by the object form of {@link Session.startProcessSTT}. */
export interface StartProcessSTTOptions {
	/** Milliseconds after which recording stops automatically. */
	timeout?: number;
	/** Language hint. Streaming declares it up front, at `stt.start`. */
	language?: string;
}

/**
 * Similarity above which a committed utterance is treated as the avatar's own
 * voice returning through the microphone rather than as user speech.
 */
const ECHO_SIMILARITY_THRESHOLD = 0.8;

/** How many recently spoken assistant lines are compared against for echo. */
const ECHO_HISTORY_SIZE = 3;

/**
 * Utterances shorter than this are never treated as echo.
 *
 * The similarity score divides by the shorter side, so a single token that
 * happens to appear anywhere in the avatar's line scores 1.0 — a bare "네" in
 * reply to "네, 알겠습니다" would be discarded as the avatar's own voice. Short
 * replies carry no signal that distinguishes echo from speech, so they are left
 * to the browser's acoustic echo cancellation rather than guessed at here.
 */
const ECHO_MIN_TOKENS = 3;

/**
 * Manages a full Perso chat session including UI state, LLM orchestration,
 * microphone handling, and speech synthesis triggers.
 */
export class Session {
	private chatStatesHandler: EventTarget = new EventTarget();
	private chatLogHandler: EventTarget = new EventTarget();
	private sttEventHandler: EventTarget | null = null;
	private sttPartialSubscribers = new Set<(partial: SttPartial) => void>();
	private sttUtteranceSubscribers = new Set<(utterance: SttUtterance) => void>();

	private errorHandler: EventTarget = new EventTarget();

	private lastStfTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
	private activeStfStream: StfStream | null = null;
	/** WebSocket TTS requests in flight, so a barge-in can stop them at once. */
	private readonly activeTtsRequests = new Set<TtsRequest>();
	/** Tail of the internal streaming-turn chain; see {@link enqueueStfTurn}. */
	private stfTurnQueue: Promise<unknown> = Promise.resolve();
	/**
	 * Cancellation hooks of live turns in flight. A live turn that has not
	 * received its first chunk has no stream to cancel through, so barge-in and
	 * session close reach its pull loop here instead.
	 */
	private liveTurnCancels = new Set<() => void>();
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

	private sttRecorder: WavRecorder | null = null;
	private sttTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
	private sttTimeoutAudioFile: File | null = null;

	private socket: SessionSocket | null = null;
	private sttStream: SttStream | null = null;
	private sttStreamRecorder: PcmStreamRecorder | null = null;
	/** Transcript from an auto-stop, awaiting the caller's stopProcessSTT(). */
	private sttTimeoutTranscript: string | null = null;
	/** Read once per session; see {@link resolveSessionInfo}. */
	private sessionInfoPromise: Promise<SessionInfo | null> | null = null;
	/** Recently spoken assistant lines, newest last, for echo rejection. */
	private spokenHistory: string[] = [];
	/** Guards the one-time warning about an ignored `language` argument. */
	private warnedIgnoredLanguage = false;

	private heartbeatIntervalId: ReturnType<typeof setTimeout> | null = null;

	private readonly legacyVoiceChatMode: boolean;
	private readonly stream: MediaStream | null;
	private readonly webSocketImpl: typeof WebSocket | undefined;

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
		/**
		 * @deprecated Since 1.7.0 — direct property access will become private
		 * in a future version. The server URL is internal wiring the session
		 * already carries into every request.
		 */
		public apiServer: string,
		/**
		 * @deprecated Since 1.7.0 — use {@link getSessionId} instead. The
		 * property will become private in a future version.
		 */
		public sessionId: string,
		/**
		 * @deprecated Since 1.7.0 — internal WebRTC controller. Reaching
		 * through it couples callers to transport details that change without
		 * notice (`session.perso.stf()` / `.sendFile()` are removed in 1.7.0
		 * for this reason). Use the `Session` methods instead; the property
		 * will become private in a future version.
		 */
		public perso: Perso | null,
		/**
		 * @deprecated Since 1.7.0 — pass tools to `createSession` instead of
		 * mutating this array. The property will become private in a future
		 * version.
		 */
		public clientTools: Array<ChatTool>,
		options?: {
			stream?: MediaStream;
			legacyVoiceChatMode?: boolean;
			/** Overridable for tests; defaults to the platform `WebSocket`. */
			webSocketImpl?: typeof WebSocket;
		}
	) {
		this.legacyVoiceChatMode = options?.legacyVoiceChatMode ?? false;
		this.stream = options?.stream ?? null;
		this.webSocketImpl = options?.webSocketImpl;
		this.resetChatState();
		// Started here rather than on first use: the row decides how STT records
		// and whether TTS may stream, and paying its round trip at creation keeps
		// it off the latency path of the first synthesis — the one thing streaming
		// TTS exists to shorten. Failures are absorbed by resolveSessionInfo().
		void this.resolveSessionInfo();
		this.llmProcessor = new LlmProcessor({
			apiServer,
			sessionId,
			clientTools,
			getSocket: () => this.getSocket(),
			callbacks: {
				onChatStateChange: (add, remove) => this.setChatState(add, remove),
				onError: (error) => this.setError(error),
				onChatLog: (message, isUser) => this.addMessageToChatLog(message, isUser),
				onTTSTF: (message) => this.processTTSTFInternal(message)
			}
		});

		if (!perso) {
			this.startHeartbeat();
			return;
		}

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

				// Deprecated on purpose: this is the legacy voice-chat path, whose
				// contract is that a transcript with no registered handler is spoken
				// back automatically. Both sides retire together.
				this.processChat(data.text);
			}
		});

		perso.setMessageCallback('stt-error', (data: STTErrorMessage) => {
			void data;
			this.setChatState(null, ChatState.ANALYZING);
		});

		perso.setMessageCallback('error', (data: ControlErrorMessage) => {
			this.handleControlError(data);
		});
	}

	/**
	 * Gives back the state a refused command was holding, and reports it.
	 *
	 * A refused turn never produces the `stf` response that would promote it to
	 * SPEAKING, so its `ANALYZING` ref has to come back here or the session sits
	 * in `ANALYZING` for good — silently, since nothing else reads these frames.
	 *
	 * Only the frame that opens a turn releases a ref. A server that refuses
	 * `stf-streaming-start` refuses every `-data` frame behind it too, and
	 * releasing on those would take the ref of a different turn still in flight.
	 */
	private handleControlError(data: ControlErrorMessage) {
		const type = data?.type ?? '';

		// The same turn failing again, already accounted for by its start frame.
		if (type === 'stf-streaming-data' || type === 'stf-streaming-end') {
			return;
		}

		if (type === 'stf-streaming-start') {
			// Nothing will render what follows, so stop feeding the turn. Cancelling
			// sends frames of its own, and the rejection often arrives with the
			// channel already going down — letting that throw would skip the release
			// below and strand the session in the state this handler exists to clear.
			this.cancelActiveStfStream();
		}

		if (type === 'stf-streaming-start' || type === 'ttstf') {
			this.setChatState(null, ChatState.ANALYZING);
		}

		this.setError(
			new STFError(`server rejected "${type}": ${data?.code ?? 'unknown'}`, 'server_rejected')
		);
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
	 * @deprecated Use processLLM() -> processTTS() -> processSTF() instead. This
	 *   call predates the step-controlled pipeline and exposes nothing between
	 *   the steps: the LLM response cannot be read before it is spoken, your own
	 *   audio cannot be substituted, and playback cannot start on the first TTS
	 *   chunk. Behavior is unchanged for existing callers.
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
	 *
	 * The text goes to the server over the WebRTC control channel (`ttstf`
	 * frame); TTS synthesis, chunking, and lip-sync are the server pipeline's
	 * job, so the client neither fetches audio nor chooses a transport.
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
		const result = await this.transcribeAudioDetailed(audio, language);
		return result.text;
	}

	/**
	 * Same as transcribeAudio but returns the full STTResponse object.
	 *
	 * The SDK currently exposes only `text`. Other server-side fields
	 * (e.g., `locale`, `normalized_text`) are intentionally omitted.
	 */
	async transcribeAudioDetailed(audio: Blob | File, language?: string): Promise<STTResponse> {
		// A streaming STT type rejects a one-shot `stt.request` server-side. Since
		// the mode is already known, say so here rather than round-tripping to
		// an opaque `mode_unsupported`.
		if ((await this.resolveSttMode()).streaming) {
			throw new Error(
				"This session's STT type is streaming-only; use startProcessSTT()/stopProcessSTT() " +
					'instead of transcribing a buffered file.'
			);
		}

		return { text: await this.transcribeOverSocket(audio, language) };
	}

	/**
	 * Sends audio for Speech-to-Face processing.
	 *
	 * The audio is delivered through the streaming STF frames, so the avatar
	 * starts speaking before the whole clip has been transmitted. Callers never
	 * choose a transport — streaming is how STF is delivered.
	 *
	 * Two kinds of input:
	 * - A `Blob` (finished clip): decoded locally and resampled to
	 *   `STF_STREAM_SAMPLE_RATE`, any container the browser can decode.
	 * - A live source (`ReadableStream` / `AsyncIterable` of PCM chunks): each
	 *   chunk must already be mono 24 kHz — Float32 in [-1, 1] or s16le bytes.
	 *   The turn opens at the first chunk and closes when the source ends.
	 *
	 * The session enters `ANALYZING` and is promoted to `SPEAKING` by the
	 * server's `stf` response. Resolving therefore means the audio was
	 * transmitted, not that it has played. `clearBuffer()` cancels an open turn
	 * and stops consuming a live source; the call then resolves, not rejects.
	 *
	 * @param audio Audio clip or live PCM source to lip-sync.
	 * @param format Legacy format hint, ignored — a Blob's container is detected
	 *   from the audio bytes. Kept so existing call sites keep compiling.
	 * @param message Optional text caption echoed on the server's `stf` response.
	 * @returns Resolves once the audio has been transmitted.
	 * @throws STFError When a clip cannot be decoded or the turn fails.
	 */
	async processSTF(audio: StfAudioSource, format?: string, message: string = ''): Promise<void> {
		if (!this.perso) {
			throw new Error('processSTF requires WebRTC (STF mode)');
		}
		void format;
		this.pipelineSuppressed = false;
		this.setChatState(ChatState.ANALYZING);

		if (audio instanceof Blob) {
			try {
				const pcm = await this.decodeForStf(audio);
				if (this.pipelineSuppressed) {
					this.setChatState(null, ChatState.ANALYZING);
					return;
				}
				await this.enqueueStfTurn(() => this.runStfStreamTurn(pcm, message));
			} catch (error) {
				this.setChatState(null, ChatState.ANALYZING);
				throw error;
			}
			return;
		}

		const source = toPcmIterator(audio);
		const progress = { delivered: false };
		try {
			await this.enqueueStfTurn(() => this.runLiveStfTurn(source, message, progress));
		} catch (error) {
			// Once audio was delivered the server's stf response owns the state;
			// with nothing delivered, no response is coming, so give it back.
			if (!progress.delivered) {
				this.setChatState(null, ChatState.ANALYZING);
			}
			throw error;
		}
		if (!progress.delivered) {
			this.setChatState(null, ChatState.ANALYZING);
		}
	}

	/**
	 * Feeds a live PCM source through one streaming turn.
	 *
	 * The turn opens lazily at the first chunk, so an empty source never leaves
	 * the server holding a turn with no audio. Each pull is raced against the
	 * turn's terminal state — a barge-in must not leave this loop hanging on a
	 * source that has gone silent.
	 */
	private async runLiveStfTurn(
		source: AsyncIterator<StfPcmChunk>,
		message: string,
		progress: { delivered: boolean }
	): Promise<void> {
		let stream: StfStream | null = null;
		let finishResolve!: () => void;
		const finished = new Promise<typeof TURN_FINISHED>((resolve) => {
			finishResolve = () => resolve(TURN_FINISHED);
		});
		// Registered for the whole turn: before the first chunk there is no
		// stream for clearBuffer/close to cancel through, so they resolve the
		// race here instead of leaving this loop hanging on a silent source.
		this.liveTurnCancels.add(finishResolve);

		try {
			while (true) {
				if (this.pipelineSuppressed) return;

				const item = await Promise.race([source.next(), finished]);
				if (item === TURN_FINISHED) return;
				if (item.done) break;
				if (this.pipelineSuppressed) return;

				stream ??= this.openStfTurn(message, finishResolve);
				if (!stream.active) return;
				// Congested channel: stop pulling instead of buffering unboundedly.
				await stream.whenWritable();
				if (!stream.active) return;

				const chunk = item.value;
				if (chunk instanceof Float32Array) {
					stream.writeFloat32(chunk);
				} else {
					stream.write(chunk);
				}
				progress.delivered = true;
			}
		} catch (error) {
			// A failing source must not cut off audio already handed to the turn:
			// close it cleanly so the delivered part plays, then surface the error.
			if (stream?.active && progress.delivered) {
				await stream.end().catch(() => undefined);
			} else {
				stream?.cancel();
			}
			throw error;
		} finally {
			this.liveTurnCancels.delete(finishResolve);
			void source.return?.();
		}

		if (stream === null || !stream.active) return;
		try {
			await stream.end();
		} catch (error) {
			if (error instanceof STFError && error.code === 'cancelled') return;
			throw error;
		}
	}

	private async decodeForStf(file: Blob): Promise<Float32Array> {
		try {
			return await decodeAudioToPcm(file, STF_STREAM_SAMPLE_RATE);
		} catch (error) {
			const description = error instanceof Error ? error.message : String(error);
			throw new STFError(`failed to decode audio for streaming: ${description}`, 'decode');
		}
	}

	/**
	 * Serializes streaming turns: the control channel carries one STF turn at a
	 * time, so overlapping `processSTF`/`processTTSTF` calls queue instead of
	 * colliding on the `stream_busy` guard.
	 */
	private enqueueStfTurn<T>(task: () => Promise<T>): Promise<T> {
		const run = this.stfTurnQueue.then(task, task);
		this.stfTurnQueue = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	/**
	 * Streams one finished PCM clip through a streaming STF turn.
	 *
	 * The caller holds the `ANALYZING` ref for this turn; a clean finish leaves
	 * it for the server's `stf` response to promote, and a cancellation (barge-in
	 * via `clearBuffer`/`stopSession`) resolves quietly because the interruption
	 * was requested, not suffered.
	 */
	private async runStfStreamTurn(pcm: Float32Array, message: string): Promise<void> {
		// A turn dequeued after a barge-in or session close must not restart
		// speech the user just cancelled (or write to a closing channel).
		if (this.pipelineSuppressed) return;
		const stream = this.openStfTurn(message);
		try {
			stream.writeFloat32(pcm);
			await stream.end();
		} catch (error) {
			if (error instanceof STFError && error.code === 'cancelled') {
				return;
			}
			throw error;
		}
	}

	/**
	 * Opens a streaming turn and takes the single active-stream slot.
	 *
	 * The awaiting caller owns the `ANALYZING` state; the stream only releases
	 * the slot (and runs the optional hook) when it reaches its terminal state.
	 *
	 * @param message Caption echoed on the server's `stf` response.
	 * @param onFinish Extra hook run once, on the stream's terminal state.
	 */
	private openStfTurn(message: string, onFinish?: () => void): StfStream {
		if (this.activeStfStream?.active) {
			throw new STFError('a streaming STF turn is already active on this session', 'stream_busy');
		}

		const stream = new StfStream({
			message,
			perso: this.perso!,
			onFinish: () => {
				if (this.activeStfStream === stream) {
					this.activeStfStream = null;
				}
				onFinish?.();
			}
		});

		this.activeStfStream = stream;
		stream.open();

		return stream;
	}

	/**
	 * Synthesizes speech and resolves with the finished audio as one file.
	 *
	 * On a voice whose TTS type reports `streamable: true` the audio is streamed
	 * over the session WebSocket (`tts.request`) and reassembled here, so
	 * synthesis and transfer overlap and the clip is ready sooner. That is a
	 * transport detail: the return value is a single Blob either way, and callers
	 * need no branch for it. Use {@link processStreamingTTS} to consume the
	 * chunks as they arrive instead.
	 *
	 * @param message Text to speak. Emoji are stripped and terminal punctuation is appended.
	 * @param options.resample Whether to resample to the SDK target rate (16 kHz).
	 * @param options.locale Optional locale override for the TTS voice.
	 * @param options.output_format Audio format to request. Anything other than a
	 *   PCM variant keeps the one-shot endpoint, which is the only one with
	 *   containers.
	 * @returns The audio, or `undefined` when the message has no speakable text or
	 *   the request failed (reported through the error handler).
	 */
	async processTTS(
		message: string,
		options: { resample?: boolean; locale?: string; output_format?: TTSOutputFormat } = {}
	): Promise<Blob | undefined> {
		const { resample = false, locale, output_format } = options;
		const filteredMessage = removeEmoji(message).trim();
		if (filteredMessage.length === 0) return;
		this.pipelineSuppressed = false;

		const textForTTS = /[.?!]$/.test(filteredMessage) ? filteredMessage : filteredMessage + '.';

		this.setChatState(ChatState.TTS, null);
		try {
			// A streamable voice without a container format is synthesized over the
			// WebSocket (`tts.request`, PCM) and reassembled into the same WAV Blob.
			// Container formats (mp3/wav) and non-streamable voices keep the one-shot
			// `/tts/` endpoint — the WS transport is PCM-only, so routing them there
			// would silently change the returned audio format.
			if (await this.canStreamTTS(output_format)) {
				return await this.collectTtsOverWs(textForTTS, locale, resample);
			}

			const { audio } = await PersoUtil.makeTTS(this.apiServer, {
				sessionId: this.sessionId,
				text: textForTTS,
				...(locale && { locale }),
				...(output_format && { output_format })
			});
			if (this.pipelineSuppressed) return undefined;
			return await decodeTTSAudio(audio, resample);
		} catch (error) {
			if (error instanceof TTSError) {
				this.setError(error);
			} else if (error instanceof ApiError || error instanceof TTSDecodeError) {
				this.setError(new TTSError(error));
			} else if (error instanceof SessionSocketError) {
				// The WS transport is internal; a socket that will not open is still a
				// TTS failure, reported exactly as a one-shot /tts/ failure was.
				this.setError(ttsStreamError({ reason: error.message, code: error.code }));
			} else {
				this.setError(error instanceof Error ? error : new Error(String(error)));
			}
		} finally {
			this.setChatState(null, ChatState.TTS);
		}
	}

	/**
	 * Whether {@link processTTS} may stream over the session WebSocket for this call.
	 *
	 * Requires an explicit `streamable: true` — the opposite default from
	 * {@link assertTtsStreamable}, and deliberately so: here the one-shot
	 * endpoint is a working alternative rather than a dead end, so an
	 * unanswered question keeps the transport already known to work.
	 */
	private async canStreamTTS(output_format?: TTSOutputFormat): Promise<boolean> {
		// The WS transport is PCM-only: a caller who named a container gets the
		// endpoint that has them.
		if (output_format !== undefined && asStreamingFormat(output_format) === undefined) return false;

		return (await this.resolveTtsType())?.streamable === true;
	}

	/**
	 * Drains a streaming synthesis over the WebSocket (`tts.request`, PCM) into
	 * the single WAV file {@link processTTS} returns.
	 *
	 * The rate and channel count come from the SDK's constants — the frames carry
	 * PCM at {@link STREAMING_TTS_SAMPLE_RATE}. Barge-in (`pipelineSuppressed`)
	 * cancels the request and resolves to `undefined`; other failures propagate to
	 * `processTTS`, which reports them exactly as it reports one-shot failures.
	 */
	private async collectTtsOverWs(
		text: string,
		locale: string | undefined,
		resample: boolean
	): Promise<Blob | undefined> {
		const socket = this.getSocket();
		await socket.ensureOpen();

		const decoder = new PcmStreamDecoder();
		const blocks: Float32Array[] = [];
		let sampleCount = 0;

		const request = new TtsRequest({
			socket,
			text,
			...(locale && { locale }),
			outputFormat: 'pcm_24000',
			onChunk: ({ audioB64 }) => {
				// A turn abandoned by barge-in has to stop synthesis too. cancel() is
				// idempotent, so a repeated suppressed chunk is harmless.
				if (this.pipelineSuppressed) {
					request.cancel();
					return;
				}
				const samples = decoder.decode(new Uint8Array(base64ToArrayBuffer(audioB64)));
				if (samples.length === 0) return;
				blocks.push(samples);
				sampleCount += samples.length;
			}
		});

		this.activeTtsRequests.add(request);
		try {
			await request.send();
		} catch (error) {
			// A cancel we issued for barge-in is not a failure.
			if (
				this.pipelineSuppressed ||
				(error instanceof TTSError && error.code === TTS_ERROR_CODE.CANCELLED)
			) {
				return undefined;
			}
			throw error;
		} finally {
			this.activeTtsRequests.delete(request);
		}

		if (this.pipelineSuppressed) return undefined;

		let samples: Float32Array = new Float32Array(sampleCount);
		let offset = 0;
		for (const block of blocks) {
			samples.set(block, offset);
			offset += block.length;
		}

		let sampleRate = STREAMING_TTS_SAMPLE_RATE;
		if (resample && sampleCount > 0 && sampleRate !== TTS_TARGET_SAMPLE_RATE) {
			samples = await resampleAudio(
				samples,
				sampleRate,
				TTS_TARGET_SAMPLE_RATE,
				STREAMING_TTS_CHANNELS
			);
			sampleRate = TTS_TARGET_SAMPLE_RATE;
		}

		return new Blob([encodeWav(samples, sampleRate, STREAMING_TTS_CHANNELS)], {
			type: 'audio/wav'
		});
	}

	/**
	 * Synthesizes speech and returns the PCM chunks as they arrive.
	 *
	 * The streaming counterpart of {@link processTTS}. Where that resolves with a
	 * finished Blob, this resolves as soon as the session WebSocket is open and
	 * hands back a stream, so playback can start on the first chunk instead of on
	 * the last. On voices whose provider streams, first audio arrives sooner; on
	 * voices whose provider does not, the stream simply delivers everything at
	 * the end and the caller needs no special case.
	 *
	 * `ChatState.TTS` is held from this call until the stream reaches a terminal
	 * state — drained, cancelled, or failed — so the state tracks audible output
	 * rather than just the request.
	 *
	 * Requires a session whose TTS type supports streaming; see
	 * {@link assertTtsStreamable} for what happens when it does not.
	 *
	 * @param message Text to speak. Emoji are stripped and terminal punctuation
	 *   is appended, matching {@link processTTS}.
	 * @param options.locale Optional locale override for the TTS voice.
	 * @param options.output_format PCM variant to request. Accepted for source
	 *   compatibility; the session WebSocket always carries `pcm_24000`.
	 * @returns The stream, or `undefined` when the message has no speakable text
	 *   or the request was rejected (reported through the error handler).
	 * @throws TTSNotStreamableError When the session's TTS type reports
	 *   `streamable: false`. Unlike a request failure this rejects rather than
	 *   resolving with `undefined`: no retry or error handler can make this
	 *   session stream, so the caller has to change transport.
	 */
	async processStreamingTTS(
		message: string,
		options: { locale?: string; output_format?: StreamingTTSOutputFormat } = {}
	): Promise<StreamingTTSStream | undefined> {
		const { locale } = options;
		const filteredMessage = removeEmoji(message).trim();
		if (filteredMessage.length === 0) return;

		await this.assertTtsStreamable();
		this.pipelineSuppressed = false;

		const textForTTS = /[.?!]$/.test(filteredMessage) ? filteredMessage : filteredMessage + '.';

		// `output_format` is accepted for source compatibility; the WS transport
		// carries pcm_24000 only, which is the rate the stream already reported.
		this.setChatState(ChatState.TTS, null);
		try {
			await this.getSocket().ensureOpen();
		} catch (error) {
			// The state is released here rather than in a `finally`: on success it
			// has to outlive this method and travel with the stream.
			this.setChatState(null, ChatState.TTS);
			// The WS transport is internal; a socket that will not open is still a TTS
			// failure, surfaced as TTSError so `instanceof TTSError` keeps working.
			// ensureOpen() only rejects with SessionSocketError today; anything else is
			// wrapped the same way so the documented `setErrorHandler` contract holds.
			this.setError(
				ttsStreamError({
					reason: error instanceof Error ? error.message : String(error),
					...(error instanceof SessionSocketError && { code: error.code })
				})
			);
			return undefined;
		}

		return this.wrapStreamingTtsWs(textForTTS, locale);
	}

	/**
	 * Refuses a streaming request unless the session's row confirms the voice.
	 *
	 * Requires `streamable: true`; every other state refuses, including a null or
	 * absent field, a session with no TTS type, and a row that could not be read.
	 * Streaming synthesis is unusable on a voice that does not support it, so
	 * sending a request on an unconfirmed flag only moves the same failure
	 * later, into the error handler, where it reads like a transient fault
	 * instead of a session that can never stream.
	 */
	private async assertTtsStreamable(): Promise<void> {
		const ttsType = await this.resolveTtsType();
		if (ttsType?.streamable !== true) {
			throw new TTSNotStreamableError(ttsType?.name);
		}
	}

	/**
	 * Cancels the open streaming STF turn, if any, without letting a dead channel
	 * escape.
	 *
	 * Cancelling sends frames of its own, and every caller reaches here precisely
	 * when the channel may already be going down — a server rejection, a barge-in,
	 * a teardown. A throw there would skip the work that follows: the state
	 * release in the error handler, the rest of `clearBuffer`, the `closeSelf` in
	 * `stopSession`. There is nothing left to tell the server anyway.
	 */
	private cancelActiveStfStream(): void {
		try {
			this.activeStfStream?.cancel();
		} catch {
			// The channel is gone; the server has already dropped the turn with it.
		}
	}

	/**
	 * Binds a WebSocket `tts.request` to the session's state and error handling,
	 * exposing the PCM chunks as they arrive.
	 *
	 * A failure after the request starts cannot come back as a status code, so it
	 * surfaces here: the error handler is notified and the rejection is still
	 * propagated to whoever is iterating. A client cancel ends the stream cleanly
	 * with no further chunks. The socket must already be open.
	 */
	private wrapStreamingTtsWs(text: string, locale: string | undefined): StreamingTTSStream {
		const socket = this.getSocket();

		const queue: Uint8Array[] = [];
		let wake: (() => void) | null = null;
		let done = false;
		let failure: TTSError | null = null;
		// Tracked explicitly rather than inferred: "a cancelled stream yields
		// nothing" is a contract, not an accident of when frames stop arriving.
		let cancelled = false;
		const notify = () => {
			const w = wake;
			wake = null;
			w?.();
		};

		let finished = false;
		const finish = () => {
			if (finished) return;
			finished = true;
			this.setChatState(null, ChatState.TTS);
		};

		const request = new TtsRequest({
			socket,
			text,
			...(locale && { locale }),
			outputFormat: 'pcm_24000',
			onChunk: ({ audioB64 }) => {
				if (cancelled) return;
				// A barge-in (`clearBuffer`) suppresses the pipeline without the
				// consumer calling the stream's cancel(); stop synthesis server-side
				// too, or the server keeps producing frames that pile into an unread
				// queue. cancel() is idempotent, matching collectTtsOverWs.
				if (this.pipelineSuppressed) {
					request.cancel();
					return;
				}
				queue.push(new Uint8Array(base64ToArrayBuffer(audioB64)));
				notify();
			}
		});

		this.activeTtsRequests.add(request);
		request.send().then(
			() => {
				this.activeTtsRequests.delete(request);
				done = true;
				notify();
			},
			(error: unknown) => {
				this.activeTtsRequests.delete(request);
				failure =
					error instanceof TTSError
						? error
						: ttsStreamError({ reason: error instanceof Error ? error.message : String(error) });
				done = true;
				notify();
			}
		);

		const shouldStop = () => cancelled || this.pipelineSuppressed;
		const reportError = (error: TTSError) => this.setError(error);

		return {
			sampleRate: STREAMING_TTS_SAMPLE_RATE,
			channels: STREAMING_TTS_CHANNELS,
			cancel: async () => {
				if (cancelled) return;
				cancelled = true;
				request.cancel();
				done = true;
				notify();
				finish();
			},
			async *[Symbol.asyncIterator]() {
				try {
					for (;;) {
						if (shouldStop()) return;
						while (queue.length > 0) {
							yield queue.shift()!;
							if (shouldStop()) return;
						}
						// A cancel surfaces as a 'cancelled' TTSError on `failure`; that is
						// a client stop, not a fault, so it must not reach the error handler.
						if (failure && !cancelled && failure.code !== TTS_ERROR_CODE.CANCELLED) {
							reportError(failure);
							throw failure;
						}
						if (done) return;
						await new Promise<void>((resolve) => {
							wake = resolve;
						});
					}
				} finally {
					finish();
				}
			}
		};
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
	 * Reads the session row once and shares it.
	 *
	 * Two decisions the caller never makes need this row — how STT wants audio
	 * delivered, and whether TTS can stream — and both are fixed for the
	 * session's lifetime, so one lookup serves every call. A failure resolves to
	 * `null` rather than rejecting: each caller has a defined behavior for
	 * "unknown", and none of them should gain a new way to fail because a
	 * metadata GET blipped.
	 */
	private resolveSessionInfo(): Promise<SessionInfo | null> {
		this.sessionInfoPromise ??= PersoUtil.getSessionInfo(this.apiServer, this.sessionId).catch(
			() => {
				// A failure is not cached as an answer. Streaming TTS now refuses
				// anything it cannot confirm, so keeping one blip would cost the
				// session that transport for its whole lifetime; the next call retries.
				this.sessionInfoPromise = null;
				return null;
			}
		);

		return this.sessionInfoPromise;
	}

	/**
	 * Resolves how this session's STT type wants audio delivered, once.
	 *
	 * The mode lives on the session row, so the SDK reads it rather than asking
	 * the caller. A lookup failure resolves to non-streaming instead of
	 * rejecting: the classic whole-utterance path worked before this call
	 * existed and must not gain a new way to fail. A session that really is
	 * streaming then gets a clear `mode_unsupported` from the server.
	 */
	private async resolveSttMode(): Promise<SttMode> {
		const info = await this.resolveSessionInfo();
		if (!info) return NON_STREAMING;

		return {
			streaming: info.stt_type?.mode === 'STREAMING',
			endOfTurnDetection: info.stt_type?.end_of_turn_detection === true
		};
	}

	/** The session's TTS type, or `null` when the row carries none or is unavailable. */
	private async resolveTtsType(): Promise<TTSType | null> {
		return (await this.resolveSessionInfo())?.tts_type ?? null;
	}

	/** Lazily opens the session's single WebSocket (protocol section 3c allows one). */
	private getSocket(): SessionSocket {
		this.socket ??= new SessionSocket({
			apiServer: this.apiServer,
			sessionId: this.sessionId,
			...(this.webSocketImpl && { webSocketImpl: this.webSocketImpl })
		});
		return this.socket;
	}

	/**
	 * Transcribes a whole audio clip over the session WebSocket (`stt.request`) —
	 * the WS counterpart of `POST /stt/`. Resolves with the transcript text and
	 * rejects with {@link STTError} on failure. The socket is opened on demand and
	 * kept for the session's lifetime, as the streaming STT path already does.
	 */
	private async transcribeOverSocket(audio: Blob, language?: string): Promise<string> {
		const bytes = new Uint8Array(await blobToArrayBuffer(audio));
		const socket = this.getSocket();
		try {
			await socket.ensureOpen();
		} catch (error) {
			// The WS transport is internal to the SDK: a socket that will not open is
			// still an STT failure to the caller, who never chose WebSocket over REST.
			// Surface it as STTError so `instanceof STTError` keeps working; the
			// socket's code is preserved on `.code`.
			if (error instanceof SessionSocketError) {
				throw sttStreamError({ reason: error.message, code: error.code });
			}
			throw error;
		}
		const request = new SttRequest({
			socket,
			audioB64: encodeBase64(bytes),
			mime: audio.type || 'audio/wav',
			...(language && { language })
		});
		return await request.send();
	}

	/**
	 * Starts recording audio for STT processing.
	 *
	 * Transport is chosen from the session's STT type, not by the caller:
	 * non-streaming types record to WAV and send it as one `stt.request` frame
	 * over the session WebSocket on stop, streaming types open an `stt.start`
	 * stream on the same socket and send audio as it is captured. Both report
	 * through the same `stopProcessSTT` return value.
	 *
	 * @param timeoutOrOptions Timeout in milliseconds, or an options object.
	 * @throws Error if already recording or if microphone access is denied.
	 */
	startProcessSTT(timeout?: number): Promise<void>;
	startProcessSTT(options?: StartProcessSTTOptions): Promise<void>;
	async startProcessSTT(timeoutOrOptions?: number | StartProcessSTTOptions): Promise<void> {
		const options: StartProcessSTTOptions =
			typeof timeoutOrOptions === 'number' ? { timeout: timeoutOrOptions } : (timeoutOrOptions ?? {});

		if (this.sttRecorder?.isRecording() || this.sttStream?.active) {
			throw new Error('STT recording is already in progress');
		}

		const mode = await this.resolveSttMode();
		if (mode.streaming) {
			return await this.startStreamingSTT(mode, options);
		}

		return await this.startRecordedSTT(options.timeout);
	}

	/**
	 * Opens a streaming STT session: WebSocket, `stt.start`, then mic capture.
	 *
	 * With end-of-turn detection the server commits utterances asynchronously,
	 * so there is no return value to carry them. They go to the callback
	 * registered via `setSttResultCallback`; starting without one would drop
	 * every utterance silently, so it is rejected up front. Registering the
	 * callback after start would race the first utterance.
	 */
	private async startStreamingSTT(
		mode: SttMode,
		options: StartProcessSTTOptions
	): Promise<void> {
		if (
			mode.endOfTurnDetection &&
			this.sttUtteranceSubscribers.size === 0 &&
			this.sttEventHandler === null
		) {
			throw new Error(
				'End-of-turn streaming STT delivers utterances asynchronously; ' +
					'call subscribeSttUtterances() before startProcessSTT()'
			);
		}

		this.pipelineSuppressed = false;
		this.setChatState(ChatState.RECORDING);

		// The worklet starts producing the moment the mic opens, but the stream is
		// only usable after the ws handshake and the stt.start round-trip. Audio
		// captured in that window is the onset of the user's first word, so it is
		// held rather than dropped — the same rule the backpressure path follows.
		const pending: Float32Array[] = [];
		let liveStream: SttStream | null = null;
		const recorder = new PcmStreamRecorder({
			onChunk: (samples) => {
				if (liveStream) liveStream.sendAudio(samples);
				else pending.push(samples);
			}
		});

		try {
			await recorder.start();
			await this.getSocket().ensureOpen();

			const stream = new SttStream({
				socket: this.getSocket(),
				sampleRate: recorder.sampleRate,
				endOfTurnDetection: mode.endOfTurnDetection,
				...(options.language && { language: options.language }),
				onPartial: (partial) => this.dispatchSttPartial(partial),
				onUtterance: (utterance) => this.handleSttUtterance(utterance),
				onError: (error) => {
					void this.teardownStreamingSTT();
					this.setError(error);
				}
			});

			await stream.open();
			this.sttStream = stream;
			this.sttStreamRecorder = recorder;
			this.sttTimeoutTranscript = null;

			liveStream = stream;
			for (const chunk of pending) {
				stream.sendAudio(chunk);
			}
			pending.length = 0;

			if (options.timeout && options.timeout > 0) {
				// Mirrors the non-streaming path, which parks the recorded audio so a
				// later stopProcessSTT() still returns a transcript. Discarding it
				// here would make the same `timeout` option behave differently
				// depending on a mode the caller did not choose.
				this.sttTimeoutHandle = setTimeout(() => {
					this.sttTimeoutHandle = null;
					void this.stopStreamingSTT()
						.then((text) => {
							this.sttTimeoutTranscript = text;
						})
						.catch((error: unknown) => {
							this.setError(error instanceof Error ? error : new Error(String(error)));
						});
				}, options.timeout);
			}
		} catch (error) {
			await recorder.stop();
			this.setChatState(null, ChatState.RECORDING);
			this.sttStream = null;
			this.sttStreamRecorder = null;
			// A socket that will not open is an STT failure; a mic-permission error
			// (recorder.start) is not, so only the transport failure is wrapped so
			// that `instanceof STTError` keeps working for connection loss.
			throw error instanceof SessionSocketError
				? sttStreamError({ reason: error.message, code: error.code })
				: error;
		}
	}

	/**
	 * Routes a server-committed utterance to the result callback.
	 *
	 * Deliberately does NOT fall back to `processChat`: that path keeps its own
	 * message history, separate from the one `processLLM` uses, so feeding new
	 * streaming results into it would revive that divergence. Callers drive the
	 * LLM themselves.
	 */
	private handleSttUtterance(utterance: SttUtterance): void {
		if (this.isEchoOfAvatar(utterance.text)) {
			return;
		}

		// Isolate each subscriber: a throwing callback must not block the other
		// subscribers or the legacy 'stt' dispatch below (the dual-path contract).
		for (const callback of [...this.sttUtteranceSubscribers]) {
			try {
				callback(utterance);
			} catch (error) {
				console.error('subscribeSttUtterances callback threw:', error);
			}
		}

		// Back-compat: the deprecated setSttResultCallback still receives the split
		// (text, meta) shape through the legacy 'stt' event.
		this.sttEventHandler?.dispatchEvent(
			new CustomEvent('stt', {
				detail: {
					text: utterance.text,
					meta: {
						seq: utterance.seq,
						normalizedText: utterance.normalizedText,
						locale: utterance.locale
					}
				}
			})
		);
	}

	private dispatchSttPartial(partial: SttPartial): void {
		// Isolate each subscriber so one throwing callback does not starve the rest.
		for (const callback of [...this.sttPartialSubscribers]) {
			try {
				callback(partial);
			} catch (error) {
				console.error('subscribeSttPartials callback threw:', error);
			}
		}
	}

	/**
	 * Whether a transcript is the avatar's own speech heard by the microphone.
	 *
	 * With an always-on mic and server-side endpointing, un-cancelled echo is
	 * not merely noise: the transcript is answered by the LLM, which speaks
	 * again, which is transcribed again. Acoustic echo cancellation handles
	 * most of it, but this second check makes the loop structurally impossible
	 * even on a device whose AEC is poor — and it is cheap here because the SDK
	 * already knows exactly what the avatar said.
	 */
	private isEchoOfAvatar(text: string): boolean {
		const candidate = normalizeForEchoCompare(text);
		if (candidate.length === 0) return false;

		// Discarding a genuine short reply is worse than letting one short echo
		// through: the user is left with no response at all and no way to tell
		// why. See ECHO_MIN_TOKENS.
		if (candidate.split(' ').filter(Boolean).length < ECHO_MIN_TOKENS) return false;

		return this.spokenHistory.some(
			(spoken) => similarity(candidate, spoken) >= ECHO_SIMILARITY_THRESHOLD
		);
	}

	/** Records what the avatar is about to say, for echo rejection. */
	private rememberSpoken(message: string): void {
		const normalized = normalizeForEchoCompare(message);
		if (normalized.length === 0) return;

		this.spokenHistory.push(normalized);
		if (this.spokenHistory.length > ECHO_HISTORY_SIZE) {
			this.spokenHistory.shift();
		}
	}

	/** Stops mic capture and clears streaming state. */
	private async teardownStreamingSTT(): Promise<void> {
		if (this.sttTimeoutHandle) {
			clearTimeout(this.sttTimeoutHandle);
			this.sttTimeoutHandle = null;
		}

		const recorder = this.sttStreamRecorder;
		this.sttStreamRecorder = null;
		this.sttStream = null;
		this.setChatState(null, ChatState.RECORDING);

		await recorder?.stop();
	}

	/**
	 * Classic path: buffer the whole utterance, then send it as one `stt.request`
	 * frame over the session WebSocket on stop.
	 */
	private async startRecordedSTT(timeout?: number): Promise<void> {
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
	 * Stops STT recording and resolves with the transcript.
	 *
	 * On a streaming session this sends `stt.stop` and waits for the terminal
	 * frame; on a non-streaming one it sends the recorded WAV as a single
	 * `stt.request` over the session WebSocket. In end-of-turn detection mode
	 * the individual utterances were already delivered to the result callback
	 * as they were committed, and the return value is their concatenation — a
	 * summary of the stream, not the primary channel.
	 *
	 * @param language Language code (e.g. 'ko'). Ignored on a streaming
	 *   session, where the language is declared at `stt.start`; pass it to
	 *   {@link startProcessSTT} instead.
	 * @returns Promise resolving to the transcribed text.
	 * @throws STTError if the request fails.
	 * @throws Error if not currently recording.
	 */
	async stopProcessSTT(language?: string): Promise<string> {
		if (this.sttStream) {
			return await this.stopStreamingSTT(language);
		}

		// Auto-stopped by timeout: the stream is already gone but its transcript
		// was kept for exactly this call.
		if (this.sttTimeoutTranscript !== null) {
			const text = this.sttTimeoutTranscript;
			this.sttTimeoutTranscript = null;
			return text;
		}

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

		return await this.transcribeOverSocket(audioFile, language);
	}

	/** Sends `stt.stop`, waits for the terminal frame, and releases the mic. */
	private async stopStreamingSTT(language?: string): Promise<string> {
		const stream = this.sttStream;
		if (!stream) {
			throw new Error('STT recording has not been started');
		}

		if (language && !this.warnedIgnoredLanguage) {
			// Once per session: push-to-talk calls stop() on every utterance, and a
			// warning repeated per turn trains the reader to ignore the console.
			this.warnedIgnoredLanguage = true;
			console.warn(
				'stopProcessSTT: `language` is ignored on a streaming session — it is ' +
					'declared at stt.start. Pass it to startProcessSTT({ language }) instead.'
			);
		}

		try {
			const result = await stream.stop();
			return result.text;
		} finally {
			await this.teardownStreamingSTT();
		}
	}

	/**
	 * Checks if STT recording is currently in progress or has audio pending processing.
	 * @returns True if recording is active or audio is pending from timeout.
	 */
	isSTTRecording(): boolean {
		return (
			(this.sttRecorder?.isRecording() ?? false) ||
			(this.sttStream?.active ?? false) ||
			this.sttTimeoutAudioFile !== null
		);
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
		// Suppress before cancelling: a queued streaming turn is dequeued the
		// moment the active one settles, and it must already see the barge-in.
		this.pipelineSuppressed = true;
		try {
			this.perso?.clearBuffer();
		} catch {
			// A dead control channel means the remote buffer is already moot, and the
			// caller asked to stop speech rather than to hear about transport. The
			// local cancellation below is the part that still has to run.
		}
		// Barge-in also stops any WebSocket synthesis in flight right away rather
		// than waiting for the next tts.chunk to notice the suppression: the server
		// may have nothing more to send, which would leave processTTS pending until
		// the idle timeout and a streaming consumer blocked on its next chunk.
		// cancel() is idempotent and settles the request, which drops it from the set.
		for (const request of [...this.activeTtsRequests]) {
			request.cancel();
		}

		// Barge-in: abort the in-flight recognition along with playback so the
		// next turn starts clean. cancel is idempotent, so a finished stream is
		// a no-op. Teardown must follow: cancel only marks the stream finished,
		// and a recorder left running keeps the microphone open AND feeds the
		// *next* stream, since its callback resolves the stream at call time.
		if (this.sttStream) {
			this.sttStream.cancel();
			await this.teardownStreamingSTT();
		}

		// Barge-in also applies to an open streaming STF turn: cancel drops the
		// queued audio and tells the server to discard what it has buffered. A
		// live turn still waiting for its first chunk has no stream yet, so its
		// pull loop is released through the cancellation hooks.
		this.cancelActiveStfStream();
		for (const cancelLiveTurn of this.liveTurnCancels) {
			cancelLiveTurn();
		}

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
	 * Subscribes to interim STT hypotheses on a streaming session, delivered as
	 * the user speaks. Multiple subscribers are supported; the returned function
	 * removes this one. Never fires on a non-streaming session.
	 *
	 * A hypothesis is provisional — render `text` as in-progress and treat
	 * `finalText` as the confirmed prefix. Under end-of-turn detection each
	 * partial carries `utteranceSeq`, tying it to the utterance delivered by
	 * {@link subscribeSttUtterances}.
	 *
	 * @param callback Handler receiving each {@link SttPartial}.
	 * @returns Function to unsubscribe.
	 */
	subscribeSttPartials(callback: (partial: SttPartial) => void): () => void {
		this.sttPartialSubscribers.add(callback);
		return () => {
			this.sttPartialSubscribers.delete(callback);
		};
	}

	/**
	 * Subscribes to committed STT utterances under end-of-turn detection, each
	 * delivered once as a whole {@link SttUtterance}. Multiple subscribers are
	 * supported; the returned function removes this one.
	 *
	 * At least one subscriber (or a {@link setSttResultCallback} handler) is
	 * required before {@link startProcessSTT} on an end-of-turn session, since the
	 * server commits utterances asynchronously and they have no return value to
	 * travel on. Registering after start would race the first utterance.
	 *
	 * @param callback Handler receiving each committed {@link SttUtterance}.
	 * @returns Function to unsubscribe.
	 */
	subscribeSttUtterances(callback: (utterance: SttUtterance) => void): () => void {
		this.sttUtteranceSubscribers.add(callback);
		return () => {
			this.sttUtteranceSubscribers.delete(callback);
		};
	}

	/**
	 * Streams raw STT text results to the provided callback instead of routing
	 * them back into the LLM pipeline automatically.
	 *
	 * @deprecated Prefer {@link subscribeSttUtterances}, which delivers each
	 *   committed utterance as a whole {@link SttUtterance} and supports multiple
	 *   subscribers. This method is retained for the classic DataChannel
	 *   voice-chat path and for backward compatibility.
	 *
	 * Required before {@link startProcessSTT} on a session whose STT type uses
	 * end-of-turn detection: there, utterances are committed by the server as
	 * the conversation goes and have no return value to travel on.
	 *
	 * @param callback Handler for STT transcripts. The second argument carries
	 *   per-utterance metadata on streaming sessions and is absent on the
	 *   classic path — existing single-argument handlers keep working.
	 * @returns Function to unsubscribe/reset STT event handling.
	 */
	setSttResultCallback(callback: (text: string, meta?: SttResultMeta) => void) {
		const wrapper = (e: CustomEvent) => {
			// The legacy DataChannel path dispatches a bare string; the streaming
			// path dispatches { text, meta }.
			if (typeof e.detail === 'string') {
				callback(e.detail);
				return;
			}
			callback(e.detail.text, e.detail.meta);
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
					contents += removeEmoji(message.content);
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
	 *
	 * Text-to-speech stays server-side by design: the client hands over text and
	 * the server pipeline owns synthesis and lip-sync. Client-side streaming STF
	 * exists only for audio the client itself holds (`processSTF`).
	 * @param message Assistant message to speak aloud.
	 */
	private processTTSTFInternal(message: string) {
		const filteredMessage = removeEmoji(message).trim();
		if (filteredMessage.length === 0) {
			return;
		}

		// Recorded before playback starts so an echo of this line arriving on an
		// always-on microphone can be recognised and discarded.
		this.rememberSpoken(filteredMessage);

		if (!this.perso) return;

		this.setChatState(ChatState.ANALYZING);
		try {
			this.perso.ttstf(filteredMessage);
		} catch (error) {
			// A frame that never left cannot be answered, so the `stf` response that
			// would release ANALYZING is not coming. Reported rather than rethrown:
			// this also runs from the LLM stream's onTTSTF hook, where a throw would
			// abort a stream that is otherwise healthy.
			this.setChatState(null, ChatState.ANALYZING);
			this.setError(
				error instanceof STFError
					? error
					: new STFError(
							`failed to send "ttstf": ${error instanceof Error ? error.message : String(error)}`,
							'channel_closed'
						)
			);
		}
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
	 * Sends a SESSION_LOG event for the current session.
	 * @param detail Optional event description. Strings are sent as-is; objects are JSON-stringified.
	 */
	async logSessionEvent(detail?: string | Record<string, unknown>): Promise<void> {
		const detailStr = typeof detail === 'object' ? JSON.stringify(detail) : detail;
		await PersoUtil.sessionEvent(this.apiServer, this.sessionId, SessionEvent.SESSION_LOG, detailStr);
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
		this.sttStream?.cancel();
		void this.teardownStreamingSTT();
		this.socket?.close();
		this.socket = null;
		// Cancel before the channel goes away, so the server is not left holding
		// a streaming turn it thinks is still filling. Suppression stops queued
		// turns from reopening on the closing channel, and the cancellation
		// hooks release live turns still waiting for their first chunk.
		this.pipelineSuppressed = true;
		this.cancelActiveStfStream();
		for (const cancelLiveTurn of this.liveTurnCancels) {
			cancelLiveTurn();
		}
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

}

/**
 * Creates a Session with SDK-driven STT/TTS (current mode): speech is
 * exchanged through the session WebSocket (and the one-shot `/tts/` endpoint
 * for container formats) rather than over a WebRTC audio track.
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
 *   Use the 5-argument overload with SDK-driven STT/TTS instead.
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

/**
 * Reduces a transcript to the form used for echo comparison: lowercase, no
 * punctuation, single-spaced. The recognizer and the TTS input differ in
 * exactly those respects for the same sentence.
 */
function normalizeForEchoCompare(text: string): string {
	return removeEmoji(text)
		.toLowerCase()
		.replace(/[.,!?;:'"()[\]{}<>~\-–—…]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Token-overlap ratio between two normalized transcripts, in [0, 1].
 *
 * Deliberately not an edit distance: recognition of the avatar's own audio
 * tends to drop or mangle whole words rather than individual characters, and
 * an overlap ratio degrades gracefully under that. Measured against the
 * shorter side so a truncated echo of a long sentence still scores high.
 */
function similarity(a: string, b: string): number {
	if (a === b) return 1;

	const aTokens = a.split(' ').filter(Boolean);
	const bTokens = new Set(b.split(' ').filter(Boolean));
	if (aTokens.length === 0 || bTokens.size === 0) return 0;

	let shared = 0;
	for (const token of aTokens) {
		if (bTokens.has(token)) shared++;
	}

	return shared / Math.min(aTokens.length, bTokens.size);
}
