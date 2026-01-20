import emojiRegex from "emoji-regex";
import { ApiError, LLMError, LLMStreamingResponseError, PersoUtil } from "../shared";
import {
  Perso,
  type STFMessage,
  type STTError,
  type STTMessage,
} from "./perso";

/**
 * Represents a single entry shown in the chat log UI.
 */
export interface Chat {
  text: string;
  isUser: boolean;
  timestamp: Date;
}

/**
 * Discrete states that describe where the conversation currently is
 * (recording, running the LLM, analyzing text, speaking back, etc.).
 */
export enum ChatState {
  RECORDING = "RECORDING",
  LLM = "LLM",
  ANALYZING = "ANALYZING",
  SPEAKING = "SPEAKING",
}

/**
 * Container describing a callable tool (local client helper or remote MCP)
 * that the LLM runtime can invoke during conversations.
 */
export class ChatTool {
  constructor(
    public name: string,
    public description: string,
    public parameters: object,
    public call: (arg: any) => object | Promise<object>,
    public executeOnly: boolean = false
  ) {}
}

/**
 * Manages a full Perso chat session including UI state, LLM orchestration,
 * microphone handling, and speech synthesis triggers.
 */
export class Session {
  private chatStatesHandler: EventTarget = new EventTarget();
  private chatLogHandler: EventTarget = new EventTarget();
  private sttEventHandler: EventTarget | null = null;

  private errorHandler: EventTarget = new EventTarget();

  private lastStfTimeoutHandle: number | null = null;
  private stfTotalDuration: number = 0;
  private stfTimeoutStartTime: number = 0;

  private messageHistory: Array<object> = [];
  private chatLog: Array<Chat> = [];

  private chatStateMap: Map<ChatState, number> = new Map([
    [ChatState.RECORDING, 0],
    [ChatState.LLM, 0],
    [ChatState.ANALYZING, 0],
    [ChatState.SPEAKING, 0],
  ]);

  private emojiRegex: RegExp = emojiRegex();

  /**
   * Sets up message listeners and chat-state trackers for a Perso session.
   * @param apiServer Perso API server URL.
   * @param sessionId Id of the session negotiated with the backend.
   * @param stream Local audio stream shared with the session.
   * @param perso Underlying Perso WebRTC controller.
   * @param clientTools Tools exposed to the LLM for function calling.
   */
  constructor(
    public apiServer: string,
    public sessionId: string,
    public stream: MediaStream,
    public perso: Perso,
    public clientTools: Array<ChatTool>
  ) {
    this.resetChatState();

    perso.setMessageCallback("stf", (data: STFMessage) => {
      this.setChatState(ChatState.SPEAKING, ChatState.ANALYZING);
      if (this.lastStfTimeoutHandle !== null) {
        clearTimeout(this.lastStfTimeoutHandle);

        let currentTime = Date.now();
        this.stfTotalDuration +=
          data.duration + 1000 - (currentTime - this.stfTimeoutStartTime);
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

    perso.setMessageCallback("stt", (data: STTMessage) => {
      this.setChatState(null, ChatState.ANALYZING);

      if (this.sttEventHandler != null) {
        this.sttEventHandler.dispatchEvent(
          new CustomEvent("stt", {
            detail: data.text,
          })
        );
      } else {
        if (data.text === "") {
          return;
        }

        this.processChat(data.text);
      }
    });

    perso.setMessageCallback("stt-error", (data: STTError) => {
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

    this.addMessageToChatLog(message, true);

    this.llmJob = this.processChatInternal(message);
  }

  /**
   * Plays back a response produced by a custom/external LLM without calling
   * the built-in Perso LLM pipeline.
   * @param message Assistant response generated externally.
   * @remarks
   * - Does not mutate `messageHistory`.
   * - Does not emit chat-log updates.
   * - Does not toggle the `LLM` chat state.
   */
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

    this.messageHistory.push({
      role: "assistant",
      type: "message",
      content: message,
    });
    this.addMessageToChatLog(message, false);
    this.processTTSTFInternal(message);
  }

  /**
   * Triggers the recording state and instructs Perso to buffer microphone
   * audio for speech-to-text.
   * @returns Result of `perso.recordStart()`.
   */
  startVoiceChat() {
    this.setChatState(ChatState.RECORDING);
    return this.perso.recordStart();
  }

  /**
   * Stops the microphone capture, transitions the UI to analyzing, and sends
   * the buffered audio to STT.
   */
  stopVoiceChat() {
    this.setChatState(ChatState.ANALYZING, ChatState.RECORDING);
    this.perso.recordEndStt();
  }

  /**
   * Resizes the avatar video canvas on the remote renderer.
   * @param width Target width in CSS pixels.
   * @param height Target height in CSS pixels.
   */
  changeSize(width: number, height: number) {
    this.perso.changeSize(width, height);
  }

  /**
   * Cancels any ongoing LLM/TTS jobs, clears remote buffers, and resets all
   * chat-state timers.
   */
  async clearBuffer() {
    await this.clearLLMJob();

    this.perso.clearBuffer();

    if (this.lastStfTimeoutHandle !== null) {
      clearTimeout(this.lastStfTimeoutHandle);
      this.lastStfTimeoutHandle = null;
    }

    this.resetChatState();
  }

  /**
   * Assigns the remote video stream to a DOM video tag.
   * @param element Target video element.
   */
  setSrc(element: HTMLVideoElement) {
    element.srcObject = this.getRemoteStream();
  }

  /**
   * Returns the local microphone stream associated with the session.
   * @returns Local `MediaStream`.
   */
  getLocalStream() {
    return this.stream;
  }

  /**
   * Returns the first remote stream exposed by the Perso renderer.
   * @returns Remote `MediaStream`.
   */
  getRemoteStream() {
    return this.perso.getStream();
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
   * @param callback Invoked with `true` when closed manually.
   * @returns Function to unsubscribe the listener.
   */
  onClose(callback: (manualClosed: boolean) => void) {
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
    this.chatStatesHandler.addEventListener("status", wrapper as EventListener);
    return () => {
      this.chatStatesHandler.removeEventListener(
        "status",
        wrapper as EventListener
      );
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
    this.chatLogHandler.addEventListener("chatLog", wrapper as EventListener);
    return () => {
      this.chatLogHandler.removeEventListener(
        "chatLog",
        wrapper as EventListener
      );
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
    this.sttEventHandler.addEventListener("stt", wrapper as EventListener);
    return () => {
      this.sttEventHandler?.removeEventListener(
        "stt",
        wrapper as EventListener
      );
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
    this.errorHandler.addEventListener("error", wrapper as EventListener);
    return () => {
      this.errorHandler.removeEventListener("error", wrapper as EventListener);
    };
  }

  /**
   * @returns Session identifier assigned by the backend.
   */
  getSessionId() {
    return this.sessionId;
  }

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
  private async processChatInternal(message: string | Array<object> | null) {
    this.setChatState(ChatState.LLM);

    const tools = this.clientTools.map((client_tool) => {
      return {
        type: "function",
        function: {
          description: client_tool.description,
          name: client_tool.name,
          parameters: client_tool.parameters,
        },
      };
    });

    const newMessageHistory = new Array<object>();
    if (message === null) {
      // do nothing
    } else if (message instanceof Array) {
      newMessageHistory.push(...message);
    } else if (typeof message === "string") {
      newMessageHistory.push({ role: "user", content: message });
    }

    const response = await fetch(
      `${this.apiServer}/api/v1/session/${this.sessionId}/llm/v2/`,
      {
        body: JSON.stringify({
          messages: [...this.messageHistory, ...newMessageHistory],
          tools: tools,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );

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
    const decoder = new TextDecoder("utf-8");

    let contents = "";
    let pendingToolCallsMessage: any = null;
    let buffer = "";
    while (true) {
      const { done, value } = await reader!.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundary;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        if (this.llmCancel) {
          if (contents.length > 0) {
            this.addMessageToChatLog(contents, false);
          }
          this.setChatState(null, ChatState.LLM);

          return;
        }

        const line = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 1);
        if (!line.startsWith("data: {")) {
          const error = new LLMError(
            new LLMStreamingResponseError("Failed to parse SSE response")
          );
          this.setError(error);
          this.setChatState(null, ChatState.LLM);

          return;
        }

        const message = JSON.parse(line.slice(6).trim());
        if (message.status !== "success") {
          const error = new LLMError(
            new LLMStreamingResponseError(message.reason)
          );
          this.setError(error);
          this.setChatState(null, ChatState.LLM);

          return;
        }

        // type:message can arrive separated by sentence units.
        // Therefore, accumulate the content of type:message in contents.(contents.length > 0)
        // When a non-type:message arrives (messageType != 'message'), add contents to messageHistory.
        if (contents.length > 0 && message.type != "message") {
          newMessageHistory.push({
            role: "assistant",
            type: "message",
            content: contents,
          });
          this.addMessageToChatLog(contents, false);

          contents = "";
        }

        // Regardless of role, if type is message, it must always be spoken.
        if (message.type === "message") {
          contents += message.content;
          this.processTTSTFInternal(message.content);

          continue;
        }

        // 1. If a guidance message (role:assistant, type:message) precedes, subsequent tool_call messages have role:null.
        // 2. If type:tool_call arrives without a guidance message, role must be assistant.
        if (message.type === "tool_call" && message.tool_calls != null) {
          newMessageHistory.push({
            role: "assistant", // Force to assistant since message.role can be null.
            type: message.type,
            content: message.content,
            tool_calls: message.tool_calls,
          });

          pendingToolCallsMessage = message;

          continue;
        }

        if (message.role === "tool") {
          // If role:tool, type:tool_call, it is a result message from remote MCP tool. The client only stores it in messageHistory.
          if (message.type === "tool_call") {
            newMessageHistory.push({
              role: message.role,
              type: message.type,
              content: message.content,
              tool_call_id: message.tool_call_id,
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
        const chatTool = this.getChatTool(
          this.clientTools,
          toolCallMessage.function.name
        );
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
                chatToolResult: chatToolResult,
              });
            } catch (e) {
              resolve({
                toolCallId: toolCallMessage.id,
                chatTool: chatTool,
                chatToolResult: { result: "error!" },
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
          role: "tool",
          content: JSON.stringify(toolCallResult.chatToolResult),
          tool_call_id: toolCallResult.toolCallId,
        });
      }

      // Cases requiring a follow-up LLM call
      // 1. When requested with a combination of Remote MCP (excluding database_search) and Client Tool
      // 2. When at least one of the requested Client tools is !executeOnly
      // In both cases above, a follow-up LLM call must be made.
      // Since history contains tool results, sending a new message afterwards will only respond to that message
      const predicate1 =
        toolCallResults.length > 0 &&
        pendingToolCallsMessage.tool_calls.length !== toolCallResults.length;
      const predicate2 = toolCallResults.some(
        (value) => !value.chatTool.executeOnly
      );
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

  private llmCancel = false;
  /**
   * Cancels any in-flight LLM stream by flipping the cancellation flag and
   * awaiting the pending promise if necessary.
   */
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

    this.setChatState(ChatState.ANALYZING);
    this.perso.ttstf(filteredMessage);
  }

  /**
   * Adds an entry at the top of the chat log and notifies subscribers.
   * @param message Text to store.
   * @param isUser Whether the entry was produced by the user.
   */
  private addMessageToChatLog(message: string, isUser: boolean) {
    this.chatLog = [
      { text: message, isUser, timestamp: new Date() },
      ...this.chatLog,
    ];

    this.chatLogHandler.dispatchEvent(
      new CustomEvent("chatLog", {
        detail: {
          chatLog: this.chatLog,
        },
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
        newChatStateMap.set(
          chatState,
          (newChatStateMap.get(chatState) || 0) + 1
        );
      } else {
        newChatStateMap.set(chatState, 1);
      }
    }

    function removeChatState(chatState: ChatState) {
      if (chatState === ChatState.ANALYZING) {
        newChatStateMap.set(
          chatState,
          Math.max((newChatStateMap.get(chatState) || 0) - 1, 0)
        );
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
    ]);
    this.dispatchChatState(this.exchangeChatStateMapToSet(this.chatStateMap));
  }

  /**
   * Converts the ref-counted map into a set of active chat states.
   * @param state Current state map.
   * @returns Set of states whose count is > 0.
   */
  private exchangeChatStateMapToSet(
    state: Map<ChatState, number>
  ): Set<ChatState> {
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
      new CustomEvent("status", {
        detail: {
          status: newChatStateSet,
        },
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
      new CustomEvent("error", {
        detail: {
          error: error,
        },
      })
    );
  }

  /**
   * Gracefully closes the underlying Perso connection on behalf of the session.
   */
  private close() {
    this.perso.closeSelf();
  }

  /**
   * Strips emoji characters that TTSTF may not render correctly.
   * @param str Text to sanitize.
   * @returns Filtered string.
   */
  private removeEmoji(str: string) {
    return str.replace(this.emojiRegex, "");
  }
}

/**
 * Creates a Session by wiring audio sources, instantiating Perso, and
 * registering cleanup logic.
 * @param apiServer Perso API server URL.
 * @param sessionId Session id returned from the backend.
 * @param width Desired avatar canvas width.
 * @param height Desired avatar canvas height.
 * @param enableVoiceChat True to use the microphone; false to synthesize a silent stream.
 * @param clientTools Client-side tools exposed to the LLM.
 * @returns Fully initialized `Session`.
 */
export const createSession = async (
  apiServer: string,
  sessionId: string,
  width: number,
  height: number,
  enableVoiceChat: boolean,
  clientTools: Array<ChatTool>
) => {
  let stream: MediaStream | null = null;
  let releaseAudioSourceFunc: VoidFunction | null = null;

  if (enableVoiceChat) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
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
    };
  }

  const perso = await Perso.create(apiServer, sessionId, stream, width, height);
  const session = new Session(apiServer, sessionId, stream, perso, clientTools);

  session.onClose((_) => {
    releaseAudioSourceFunc();
  });

  return session;
};
