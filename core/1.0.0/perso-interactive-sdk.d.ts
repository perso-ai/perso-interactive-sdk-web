declare class ApiError extends Error {
    errorCode: number;
    code: string;
    detail: string;
    attr?: string | undefined;
    constructor(errorCode: number, code: string, detail: string, attr?: string | undefined);
}
declare class LLMError extends Error {
    underlyingError: ApiError | LLMStreamingResponseError;
    constructor(underlyingError: ApiError | LLMStreamingResponseError);
}
declare class LLMStreamingResponseError extends Error {
    description: string;
    constructor(description: string);
}

/**
 * High-level controller around a WebRTC PeerConnection that proxies Perso's
 * real-time APIs through convenience helpers.
 */
declare class Perso extends EventTarget {
    #private;
    pc: RTCPeerConnection;
    dc: RTCDataChannel;
    streams: Array<MediaStream>;
    pingTime: number;
    pingIntervalId: number | null;
    /**
     * Hooks a peer/data channel pair to status/ping listeners so consumers can
     * interact with the remote Perso session through a single object.
     * @param pc WebRTC peer connection that handles the media tracks.
     * @param dc Data channel dedicated to control-plane messages.
     */
    constructor(pc: RTCPeerConnection, dc: RTCDataChannel);
    /**
     * Attaches a local `MediaStream` to the Perso session, negotiates WebRTC
     * connectivity, and waits until the first remote stream is ready.
     * @param apiServer Perso API server URL.
     * @param sessionId Session identifier created via `createSessionId`.
     * @param stream Local camera/mic stream shared with the agent.
     * @param width Desired avatar canvas width.
     * @param height Desired avatar canvas height.
     * @returns Ready-to-use `Perso` instance.
     * @throws Timeout When remote streams fail to arrive in time.
     */
    static create(apiServer: string, sessionId: string, stream: MediaStream, width: number, height: number): Promise<Perso>;
    /**
     * Configures a browser `RTCPeerConnection` with the ICE servers provided by
     * the Perso API.
     * @param iceServers ICE server configuration list.
     * @returns Initialized RTCPeerConnection.
     */
    private static createPeerConnection;
    /**
     * Resolves once `condition()` passes or throws a `Timeout` when the maximum
     * number of checks is exceeded.
     * @param condition Predicate that signals readiness.
     * @param interval Interval between checks in milliseconds.
     * @param times Maximum number of attempts before timing out.
     * @throws Timeout When the predicate never returns true.
     */
    private static waitFor;
    /**
     * Returns true when the first remote track has been attached and the data
     * channel is open.
     * @returns Whether the instance is ready for interaction.
     */
    isReady(): boolean;
    /**
     * Subscribes to status updates and returns an unsubscribe helper to mirror
     * the EventTarget subscription pattern.
     * @param callback Listener invoked for each status event.
     * @returns Unsubscribe function that removes the listener.
     */
    subscribeStatus(callback: (event: CustomEvent) => void): () => void;
    /**
     * Returns the first incoming remote stream if available.
     * @returns Primary remote `MediaStream`.
     */
    getStream(): MediaStream;
    /**
     * Sends a typed JSON payload through the control data channel. All higher
     * level helpers eventually defer to this method.
     * @param type Message type identifier.
     * @param data Arbitrary JSON-serializable payload.
     */
    sendMessage(type: string, data: object): void;
    /**
     * Requests a TTS-to-face (TTSTF) playback with the provided text.
     * @param message Text to synthesize and animate.
     */
    ttstf(message: string): void;
    /**
     * Signals the remote agent to start buffering microphone audio.
     */
    recordStart(): void;
    /**
     * Stops recording and asks the server to run speech-to-text optionally using
     * a specific language.
     * @param language Optional language code for STT.
     */
    recordEndStt(language?: string): void;
    /**
     * Stops recording and translates the captured speech from `src_lang` to
     * `dst_lang`.
     * @param src_lang Source language code.
     * @param dst_lang Destination language code.
     */
    recordEndTranslate(src_lang: string, dst_lang: string): void;
    /**
     * Resizes the render canvas of the avatar/video surface on the remote side.
     * @param width Target width in CSS pixels.
     * @param height Target height in CSS pixels.
     */
    changeSize(width: number, height: number): void;
    /**
     * Switches the avatar template (model + dress) at runtime.
     * @param model Optional avatar model ID.
     * @param dress Optional outfit ID.
     */
    setTemplate(model?: string, dress?: string): void;
    /**
     * Drops any buffered speech or text that has not been processed yet.
     */
    clearBuffer(): void;
    /**
     * Sends a heartbeat over the data channel to keep the connection alive.
     */
    ping(): void;
    /**
     * Registers a data-channel handler for a specific message `type` and returns
     * a remover so callers can dispose of the listener cleanly.
     * @param type Message type to watch for.
     * @param callback Handler invoked with the parsed payload.
     * @returns Function that removes the listener.
     */
    setMessageCallback(type: string, callback: (data: any) => void): () => void;
    /**
     * Tears down the PeerConnection due to remote/network failure and emits a
     * timeout status so the UI can inform users.
     */
    private close;
    /**
     * Allows callers to gracefully terminate a session themselves and emit a
     * successful status code for analytics.
     */
    closeSelf(): void;
}

/**
 * Represents a single entry shown in the chat log UI.
 */
interface Chat {
    text: string;
    isUser: boolean;
    timestamp: Date;
}
/**
 * Discrete states that describe where the conversation currently is
 * (recording, running the LLM, analyzing text, speaking back, etc.).
 */
declare enum ChatState {
    RECORDING = "RECORDING",
    LLM = "LLM",
    ANALYZING = "ANALYZING",
    SPEAKING = "SPEAKING"
}
/**
 * Container describing a callable tool (local client helper or remote MCP)
 * that the LLM runtime can invoke during conversations.
 */
declare class ChatTool {
    name: string;
    description: string;
    parameters: object;
    call: (arg: any) => object | Promise<object>;
    executeOnly: boolean;
    constructor(name: string, description: string, parameters: object, call: (arg: any) => object | Promise<object>, executeOnly?: boolean);
}
/**
 * Manages a full Perso chat session including UI state, LLM orchestration,
 * microphone handling, and speech synthesis triggers.
 */
declare class Session {
    apiServer: string;
    sessionId: string;
    stream: MediaStream;
    perso: Perso;
    clientTools: Array<ChatTool>;
    private chatStatesHandler;
    private chatLogHandler;
    private sttEventHandler;
    private errorHandler;
    private lastStfTimeoutHandle;
    private stfTotalDuration;
    private stfTimeoutStartTime;
    private messageHistory;
    private chatLog;
    private chatStateMap;
    private emojiRegex;
    /**
     * Sets up message listeners and chat-state trackers for a Perso session.
     * @param apiServer Perso API server URL.
     * @param sessionId Id of the session negotiated with the backend.
     * @param stream Local audio stream shared with the session.
     * @param perso Underlying Perso WebRTC controller.
     * @param clientTools Tools exposed to the LLM for function calling.
     */
    constructor(apiServer: string, sessionId: string, stream: MediaStream, perso: Perso, clientTools: Array<ChatTool>);
    private llmJob;
    /**
     * Sends a user utterance through Perso's internal LLM and speaks the result
     * while automatically updating history, chat logs, and chat states.
     * @param message User message to forward to the LLM.
     * @remarks
     * - Emits entries via `subscribeChatLog`.
     * - Updates all chat states published through `subscribeChatStates`.
     * - Maintains `messageHistory` for subsequent LLM calls.
     */
    processChat(message: string): Promise<void>;
    /**
     * Plays back a response produced by a custom/external LLM without calling
     * the built-in Perso LLM pipeline.
     * @param message Assistant response generated externally.
     * @remarks
     * - Does not mutate `messageHistory`.
     * - Does not emit chat-log updates.
     * - Does not toggle the `LLM` chat state.
     */
    processCustomChat(message: string): void;
    /**
     * Sends an assistant message to the LLM history and triggers TTSTF playback.
     * @param message Assistant output that should be spoken immediately.
     */
    processTTSTF(message: string): void;
    /**
     * Triggers the recording state and instructs Perso to buffer microphone
     * audio for speech-to-text.
     * @returns Result of `perso.recordStart()`.
     */
    startVoiceChat(): void;
    /**
     * Stops the microphone capture, transitions the UI to analyzing, and sends
     * the buffered audio to STT.
     */
    stopVoiceChat(): void;
    /**
     * Resizes the avatar video canvas on the remote renderer.
     * @param width Target width in CSS pixels.
     * @param height Target height in CSS pixels.
     */
    changeSize(width: number, height: number): void;
    /**
     * Cancels any ongoing LLM/TTS jobs, clears remote buffers, and resets all
     * chat-state timers.
     */
    clearBuffer(): Promise<void>;
    /**
     * Assigns the remote video stream to a DOM video tag.
     * @param element Target video element.
     */
    setSrc(element: HTMLVideoElement): void;
    /**
     * Returns the local microphone stream associated with the session.
     * @returns Local `MediaStream`.
     */
    getLocalStream(): MediaStream;
    /**
     * Returns the first remote stream exposed by the Perso renderer.
     * @returns Remote `MediaStream`.
     */
    getRemoteStream(): MediaStream;
    /**
     * Gracefully closes the session and remote connection.
     */
    stopSession(): void;
    /**
     * Subscribes to Perso status events and notifies the caller when the session
     * closes (distinguishing manual/automatic closure).
     * @param callback Invoked with `true` when closed manually.
     * @returns Function to unsubscribe the listener.
     */
    onClose(callback: (manualClosed: boolean) => void): () => void;
    /**
     * Subscribes to chat-state updates.
     * @param callback Handler receiving the active state set.
     * @returns Function to unsubscribe.
     */
    subscribeChatStates(callback: (chatStates: Set<ChatState>) => void): () => void;
    /**
     * Subscribes to chat-log updates (most recent message first).
     * @param callback Handler receiving the full chat log snapshot.
     * @returns Function to unsubscribe.
     */
    subscribeChatLog(callback: (chatLog: Array<Chat>) => void): () => void;
    /**
     * Streams raw STT text results to the provided callback instead of routing
     * them back into the LLM pipeline automatically.
     * @param callback Handler for STT transcripts.
     * @returns Function to unsubscribe/reset STT event handling.
     */
    setSttResultCallback(callback: (text: string) => void): () => void;
    /**
     * Allows UI code to react to LLM/streaming errors.
     * @param callback Handler receiving the raised error.
     * @returns Function to unsubscribe.
     */
    setErrorHandler(callback: (error: Error) => void): () => void;
    /**
     * @returns Session identifier assigned by the backend.
     */
    getSessionId(): string;
    /**
     * Streams responses from the Perso LLM endpoint, handles tool calls, and
     * updates chat history/state accordingly.
     * @param message Optional user message array or string injected ahead of the
     * pending history (null when recursively continuing after tool calls).
     * @remarks
     * - Accumulates `type: "message"` chunks until a non-message event arrives.
     * - When tool calls are returned, executes client tools (and recursively calls
     *   itself if follow-up LLM output is required).
     * - Adds every spoken assistant message to the chat log and messageHistory.
     */
    private processChatInternal;
    /**
     * Looks up a tool definition by the function name provided in a tool_call.
     * @param clientTools Registered tools.
     * @param funcName Name requested by the LLM.
     * @returns Matching `ChatTool` or null.
     */
    private getChatTool;
    private llmCancel;
    /**
     * Cancels any in-flight LLM stream by flipping the cancellation flag and
     * awaiting the pending promise if necessary.
     */
    private clearLLMJob;
    /**
     * Filters/sanitizes text and sends it to Perso's TTSTF endpoint while toggling
     * the ANALYZING chat state.
     * @param message Assistant message to speak aloud.
     */
    private processTTSTFInternal;
    /**
     * Adds an entry at the top of the chat log and notifies subscribers.
     * @param message Text to store.
     * @param isUser Whether the entry was produced by the user.
     */
    private addMessageToChatLog;
    /**
     * Adjusts the internal reference-counted chat-state map and emits changes as
     * needed.
     * @param add State(s) to activate/increment.
     * @param remove State(s) to deactivate/decrement.
     */
    private setChatState;
    /**
     * Resets all chat states to an idle baseline and emits the update.
     */
    private resetChatState;
    /**
     * Converts the ref-counted map into a set of active chat states.
     * @param state Current state map.
     * @returns Set of states whose count is > 0.
     */
    private exchangeChatStateMapToSet;
    /**
     * Broadcasts chat-state updates via the internal EventTarget.
     * @param newChatStateSet Active state set.
     */
    private dispatchChatState;
    /**
     * Compares two chat-state sets for equality.
     */
    private isEqualChatStateMap;
    /**
     * Emits an error event for UI subscribers.
     */
    private setError;
    /**
     * Gracefully closes the underlying Perso connection on behalf of the session.
     */
    private close;
    /**
     * Strips emoji characters that TTSTF may not render correctly.
     * @param str Text to sanitize.
     * @returns Filtered string.
     */
    private removeEmoji;
}

/**
 * Retrieves the list of available LLM providers from the API.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @returns Promise resolving with LLM metadata.
 */
declare function getLLMs(apiServer: string, apiKey: string): Promise<any>;
/**
 * Retrieves available TTS providers.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
declare function getTTSs(apiServer: string, apiKey: string): Promise<any>;
/**
 * Retrieves available STT providers.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
declare function getSTTs(apiServer: string, apiKey: string): Promise<any>;
/**
 * Fetches avatar model styles.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
declare function getModelStyles(apiServer: string, apiKey: string): Promise<any>;
/**
 * Fetches preset background images.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
declare function getBackgroundImages(apiServer: string, apiKey: string): Promise<any>;
/**
 * Returns predefined prompt templates.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
declare function getPrompts(apiServer: string, apiKey: string): Promise<any>;
/**
 * Returns supporting document metadata usable by the session.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
declare function getDocuments(apiServer: string, apiKey: string): Promise<any>;
/**
 * Lists MCP server identifiers configured for the tenant.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
declare function getMcpServers(apiServer: string, apiKey: string): Promise<any>;
/**
 * Convenience helper that fetches every dropdown-friendly resource needed to
 * build a Perso session configuration screen in one call chain.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @returns Object containing arrays for LLMs, TTS/STT types, model styles, etc.
 */
declare function getAllSettings(apiServer: string, apiKey: string): Promise<{
    llms: any;
    ttsTypes: any;
    sttTypes: any;
    modelStyles: any;
    backgroundImages: any;
    prompts: any;
    documents: any;
    mcpServers: any;
}>;
/**
 * Requests a session creation ID by POSTing the desired runtime options to
 * the Perso backend (`/api/v1/session/`).
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @param params {
 *   using_stf_webrtc: boolean;
 *   llm_type?: string;
 *   tts_type?: string;
 *   stt_type?: string;
 *   model_style: string;
 *   prompt: string;
 *   document?: string;
 *   background_image?: string;
 *   mcp_servers?: Array<string>;
 *   padding_left?: number;
 *   padding_top?: number;
 *   padding_height?: number;
 * }
 * @returns Session ID returned by the server.
 */
declare const createSessionId: (apiServer: string, apiKey: string, params: {
    using_stf_webrtc: boolean;
    model_style: string;
    prompt: string;
    document?: string;
    background_image?: string;
    mcp_servers?: Array<string>;
    padding_left?: number;
    padding_top?: number;
    padding_height?: number;
    llm_type?: string;
    tts_type?: string;
    stt_type?: string;
}) => Promise<string>;
/**
 * Wraps the lower-level `session.createSession` helper so callers can import
 * from this module.
 * @param apiServer Perso API server URL.
 * @param sessionId Session id to attach to.
 * @param width Avatar canvas width.
 * @param height Avatar canvas height.
 * @param enableVoiceChat Whether microphone capture should be enabled.
 * @param clientTools Client-side tools available for function calling.
 * @returns Initialized Session.
 */
declare function createSession(apiServer: string, sessionId: string, width: number, height: number, enableVoiceChat: boolean, clientTools: Array<ChatTool>): Promise<Session>;
/**
 * Retrieves metadata for an existing session.
 * @param apiServer Perso API server URL.
 * @param sessionId Session id to inspect.
 */
declare function getSessionInfo(apiServer: string, sessionId: string): Promise<any>;

type PersoInteractiveModule_ApiError = ApiError;
declare const PersoInteractiveModule_ApiError: typeof ApiError;
type PersoInteractiveModule_Chat = Chat;
type PersoInteractiveModule_ChatState = ChatState;
declare const PersoInteractiveModule_ChatState: typeof ChatState;
type PersoInteractiveModule_ChatTool = ChatTool;
declare const PersoInteractiveModule_ChatTool: typeof ChatTool;
type PersoInteractiveModule_LLMError = LLMError;
declare const PersoInteractiveModule_LLMError: typeof LLMError;
type PersoInteractiveModule_LLMStreamingResponseError = LLMStreamingResponseError;
declare const PersoInteractiveModule_LLMStreamingResponseError: typeof LLMStreamingResponseError;
type PersoInteractiveModule_Session = Session;
declare const PersoInteractiveModule_Session: typeof Session;
declare const PersoInteractiveModule_createSession: typeof createSession;
declare const PersoInteractiveModule_createSessionId: typeof createSessionId;
declare const PersoInteractiveModule_getAllSettings: typeof getAllSettings;
declare const PersoInteractiveModule_getBackgroundImages: typeof getBackgroundImages;
declare const PersoInteractiveModule_getDocuments: typeof getDocuments;
declare const PersoInteractiveModule_getLLMs: typeof getLLMs;
declare const PersoInteractiveModule_getMcpServers: typeof getMcpServers;
declare const PersoInteractiveModule_getModelStyles: typeof getModelStyles;
declare const PersoInteractiveModule_getPrompts: typeof getPrompts;
declare const PersoInteractiveModule_getSTTs: typeof getSTTs;
declare const PersoInteractiveModule_getSessionInfo: typeof getSessionInfo;
declare const PersoInteractiveModule_getTTSs: typeof getTTSs;
declare namespace PersoInteractiveModule {
  export { PersoInteractiveModule_ApiError as ApiError, PersoInteractiveModule_ChatState as ChatState, PersoInteractiveModule_ChatTool as ChatTool, PersoInteractiveModule_LLMError as LLMError, PersoInteractiveModule_LLMStreamingResponseError as LLMStreamingResponseError, PersoInteractiveModule_Session as Session, PersoInteractiveModule_createSession as createSession, PersoInteractiveModule_createSessionId as createSessionId, PersoInteractiveModule_getAllSettings as getAllSettings, PersoInteractiveModule_getBackgroundImages as getBackgroundImages, PersoInteractiveModule_getDocuments as getDocuments, PersoInteractiveModule_getLLMs as getLLMs, PersoInteractiveModule_getMcpServers as getMcpServers, PersoInteractiveModule_getModelStyles as getModelStyles, PersoInteractiveModule_getPrompts as getPrompts, PersoInteractiveModule_getSTTs as getSTTs, PersoInteractiveModule_getSessionInfo as getSessionInfo, PersoInteractiveModule_getTTSs as getTTSs };
  export type { PersoInteractiveModule_Chat as Chat };
}

declare global {
    const PersoInteractive: typeof PersoInteractiveModule;

    export { PersoInteractiveModule as PersoInteractive };
}

export { ApiError, ChatState, ChatTool, LLMError, LLMStreamingResponseError, Session, createSession, createSessionId, getAllSettings, getBackgroundImages, getDocuments, getLLMs, getMcpServers, getModelStyles, getPrompts, getSTTs, getSessionInfo, getTTSs };
export type { Chat };
