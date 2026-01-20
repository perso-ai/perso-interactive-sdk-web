import {
  getAllSettings,
  createSessionId,
  createSession,
  getSessionInfo,
  ChatTool,
  ChatState,
  LLMError,
  ApiError,
  LLMStreamingResponseError,
  type Chat,
  type Session,
} from "perso-interactive-sdk-web/client";

type Orientation = "portrait" | "landscape";
type SessionState = 0 | 1 | 2;
type Settings = Awaited<ReturnType<typeof getAllSettings>>;

const getElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found.`);
  }
  return element as T;
};

const getSelectIndex = (id: string): number =>
  Number(getElement<HTMLSelectElement>(id).value);

let apiServer = "";
let apiKey = "";
let session: Session | null = null;
let config: Settings | null = null;
let screenOrientation: Orientation = "portrait";
let chatbotLeft = 0;
let chatbotTop = 0;
let chatbotHeight = 100;
let chatStates: Set<ChatState> = new Set();
let sessionState: SessionState = 0;
let enableVoiceChat = true;
let removeOnClose: (() => void) | null = null;
let unsubscribeChatStates: (() => void) | null = null;
let unsubscribeChatLog: (() => void) | null = null;
let removeErrorHandler: (() => void) | null = null;
let removeSttResultCallback: (() => void) | null = null;
let clientTools: ChatTool[] = [];

const onSessionClicked = (): void => {
  if (sessionState === 0) {
    void startSession();
    applySessionState(1);
  } else if (sessionState === 2) {
    stopSession();
  }
};

const onVoiceChatClicked = (): void => {
  const voiceChatButton = getElement<HTMLButtonElement>("voice");
  if (voiceChatButton.disabled || !session) {
    return;
  }

  if (available()) {
    session.startVoiceChat();
  } else {
    session.stopVoiceChat();
  }
};

const onSendMessageClicked = (): void => {
  if (chatStates.size === 0) {
    sendMessage();
  } else {
    stopSpeech();
  }
};

const onMessageKeyPress = (keyEvent: KeyboardEvent): void => {
  if (keyEvent.key === "Enter") {
    sendMessage();
  }
};

const onTtstfMessageSubmit = (): void => {
  const messageElement = getElement<HTMLInputElement>("ttfMessage");
  const message = messageElement.value.trim();

  if (!session || message.length === 0) {
    return;
  }

  messageElement.value = "";
  session.processTTSTF(message);
};

const getConfig = async (): Promise<void> => {
  apiServer = getElement<HTMLInputElement>("apiServer").value;
  apiKey = getElement<HTMLInputElement>("apiKey").value;

  try {
    config = await getAllSettings(apiServer, apiKey);
  } catch (error) {
    alert(error);
    return;
  }

  if (!config) {
    return;
  }

  const settings = config as {
    llms: { name: string }[];
    ttsTypes: { name: string }[];
    sttTypes: { name: string }[];
    modelStyles: { name: string }[];
    backgroundImages: { title: string }[];
    prompts: { name: string; intro_message: string }[];
    documents: { title: string }[];
    mcpServers: { name: string }[];
  };

  const llmOptions = getElement<HTMLSelectElement>("llmOptions");
  llmOptions.innerHTML = "";
  settings.llms.forEach((value, index) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.innerText = value.name;
    llmOptions.appendChild(option);
  });

  const ttsOptions = getElement<HTMLSelectElement>("ttsOptions");
  ttsOptions.innerHTML = "";
  settings.ttsTypes.forEach((value, index) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.innerText = value.name;
    ttsOptions.appendChild(option);
  });

  const sttOptions = getElement<HTMLSelectElement>("sttOptions");
  sttOptions.innerHTML = "";
  settings.sttTypes.forEach((value, index) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.innerText = value.name;
    sttOptions.appendChild(option);
  });

  const chatbotStyle = getElement<HTMLSelectElement>("chatbotStyle");
  chatbotStyle.innerHTML = "";
  settings.modelStyles.forEach((value, index) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.innerText = value.name;
    chatbotStyle.appendChild(option);
  });

  const backgroundImage = getElement<HTMLSelectElement>("backgroundImage");
  backgroundImage.innerHTML = "";
  if (settings.backgroundImages.length > 0) {
    const option = document.createElement("option");
    option.value = "";
    option.innerText = "";
    backgroundImage.appendChild(option);
  }
  settings.backgroundImages.forEach((value, index) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.innerText = value.title;
    backgroundImage.appendChild(option);
  });

  const promptOptions = getElement<HTMLSelectElement>("promptOptions");
  promptOptions.innerHTML = "";
  promptOptions.onchange = () => {
    if (!config) {
      return;
    }
    const introMessage = getElement<HTMLLabelElement>("introMessage");
    const selectedPrompt = config.prompts[Number(promptOptions.value)];
    introMessage.innerText = selectedPrompt.intro_message;
  };

  settings.prompts.forEach((value, index) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.innerText = value.name;
    promptOptions.appendChild(option);
    if (index === 0) {
      getElement<HTMLLabelElement>("introMessage").innerText =
        value.intro_message;
    }
  });
  promptOptions.value = "0";

  const documentOptions = getElement<HTMLSelectElement>("documentOptions");
  documentOptions.innerHTML = "";
  if (settings.documents.length > 0) {
    const option = document.createElement("option");
    option.value = "";
    option.innerText = "";
    documentOptions.appendChild(option);
  }
  settings.documents.forEach((value, index) => {
    const option = document.createElement("option");
    option.value = index.toString();
    option.innerText = value.title;
    documentOptions.appendChild(option);
  });

  const mcpServersContainer = getElement<HTMLDivElement>("mcpServersContainer");
  mcpServersContainer.innerHTML = "";
  settings.mcpServers.forEach((value, index) => {
    const label = document.createElement("label");
    label.style.width = "fit-content";

    const input = document.createElement("input");
    input.value = index.toString();
    input.name = "mcpServers";
    input.type = "checkbox";

    label.appendChild(input);
    label.append(` ${value.name}`);
    mcpServersContainer.appendChild(label);
  });
};

const startSession = async (): Promise<void> => {
  removeErrorHandler?.();
  removeOnClose?.();
  unsubscribeChatStates?.();
  unsubscribeChatLog?.();
  removeSttResultCallback?.();

  removeErrorHandler = null;
  removeOnClose = null;
  unsubscribeChatStates = null;
  unsubscribeChatLog = null;
  removeSttResultCallback = null;

  const width = screenOrientation === "portrait" ? 1080 : 1920;
  const height = screenOrientation === "portrait" ? 1920 : 1080;

  if (!config) {
    alert("Please authorize before starting a session.");
    applySessionState(0);
    return;
  }

  const settings = config;

  const llmOption = settings.llms[getSelectIndex("llmOptions")];
  const llmTypeKey = llmOption.name;
  const ttsOption = settings.ttsTypes[getSelectIndex("ttsOptions")];
  const ttsTypeKey = ttsOption.name;
  const sttOption = settings.sttTypes[getSelectIndex("sttOptions")];
  const sttTypeKey = sttOption.name;
  const modelStyleOption = settings.modelStyles[getSelectIndex("chatbotStyle")];
  const modelStyleKey = modelStyleOption.name;

  const promptSelect = getElement<HTMLSelectElement>("promptOptions");
  const promptOption = settings.prompts[Number(promptSelect.value)];
  const promptKey = promptOption.prompt_id;

  const backgroundImageSelect =
    getElement<HTMLSelectElement>("backgroundImage");
  const backgroundImageOptionIndex = backgroundImageSelect.value;
  const backgroundImageKey =
    backgroundImageOptionIndex.length === 0
      ? null
      : settings.backgroundImages[Number(backgroundImageOptionIndex)]
          .backgroundimage_id;

  const documentSelect = getElement<HTMLSelectElement>("documentOptions");
  const documentOptionIndex = documentSelect.value;
  const documentKey =
    documentOptionIndex.length === 0
      ? null
      : settings.documents[Number(documentOptionIndex)].document_id;

  const mcpServerCheckBoxes = document.getElementsByName(
    "mcpServers"
  ) as NodeListOf<HTMLInputElement>;
  const mcpServersKey = Array.from(mcpServerCheckBoxes).reduce<string[]>(
    (acc, element) => {
      if (element.checked) {
        const mcpKey = settings.mcpServers[Number(element.value)].mcpserver_id;
        acc.push(mcpKey);
      }
      return acc;
    },
    []
  );

  const clientToolsCheckBoxes = document.getElementsByName(
    "clientTools"
  ) as NodeListOf<HTMLInputElement>;
  const selectedClientTools = Array.from(clientToolsCheckBoxes).reduce<
    ChatTool[]
  >((acc, element) => {
    if (element.checked) {
      acc.push(clientTools[Number(element.value)]);
    }
    return acc;
  }, []);

  const useIntro = getElement<HTMLInputElement>("useIntro").checked;
  const videoElement = getElement<HTMLVideoElement>("video");

  try {
    const sessionId = await createSessionId(
      apiServer,
      apiKey,
      {
        using_stf_webrtc: true,
        model_style: modelStyleKey,
        prompt: promptKey,
        document: documentKey ?? undefined,
        background_image: backgroundImageKey ?? undefined,
        mcp_servers: mcpServersKey,
        padding_left: chatbotLeft / 100,
        padding_top: chatbotTop / 100,
        padding_height: chatbotHeight / 100,
        llm_type: llmTypeKey,
        tts_type: ttsTypeKey,
        stt_type: sttTypeKey,
      }
    );

    const newSession = await createSession(
      apiServer,
      sessionId,
      width,
      height,
      enableVoiceChat,
      selectedClientTools
    );

    session = newSession;

    videoElement.className = screenOrientation;
    newSession.setSrc(videoElement);

    applyChatStates(null);
    applySessionState(2);
  } catch (error) {
    alert(error);
    applySessionState(0);
    return;
  }

  if (!session) {
    return;
  }

  refreshChatLog([]);
  removeErrorHandler = session.setErrorHandler((error: Error) => {
    if (error instanceof LLMError) {
      const llmError = error as LLMError;
      if (llmError.underlyingError instanceof ApiError) {
        alert(llmError.underlyingError);
      } else if (
        llmError.underlyingError instanceof
        LLMStreamingResponseError
      ) {
        alert(llmError.underlyingError.description);
      }
    }
  });
  unsubscribeChatLog = session.subscribeChatLog((chatLog: Array<Chat>) => {
    refreshChatLog(chatLog);
  });
  unsubscribeChatStates = session.subscribeChatStates((states: Set<ChatState>) => {
    applyChatStates(states);
  });
  // removeSttResultCallback = session.setSttResultCallback((text) => {
  //     if (text.length > 0) {
  //         session.processChat(text);
  //     } else {
  //         alert('Your voice was not recognized.');
  //     }
  // });
  removeOnClose = session.onClose((manualClosed: boolean) => {
    if (!manualClosed) {
      setTimeout(() => {
        getSessionInfo(apiServer, session!.getSessionId())
          .then((response: { termination_reason: string }) => {
            alert(response.termination_reason);
          })
          .catch((error: Error) => {
            console.error(error);
          });
      }, 500);
    }

    applySessionState(0);
  });

  if (useIntro && promptOption.intro_message.trim().length > 0) {
    setTimeout(() => {
      session?.processTTSTF(promptOption.intro_message);
    }, 1000);
  }
};

const stopSession = (): void => {
  session?.stopSession();
};

const sendMessage = (): void => {
  const messageElement = getElement<HTMLInputElement>("message");
  const message = messageElement.value.trim();
  if (!session || message.length === 0) {
    return;
  }

  messageElement.value = "";
  session.processChat(message);
};

const stopSpeech = (): void => {
  if (processing()) {
    void session?.clearBuffer();
  }
};

const available = (): boolean => chatStates.size === 0;

const processing = (): boolean =>
  chatStates.has(ChatState.LLM) ||
  chatStates.has(ChatState.ANALYZING) ||
  chatStates.has(ChatState.SPEAKING);

const recording = (): boolean =>
  chatStates.has(ChatState.RECORDING);

const refreshChatLog = (chatList: Array<Chat>): void => {
  const chatLog = getElement<HTMLUListElement>("chatLog");
  chatLog.innerHTML = "";
  chatList.forEach((chat) => {
    const li = document.createElement("li");
    li.className = chat.isUser
      ? "message-container user"
      : "message-container other";

    const timeSpan = document.createElement("span");
    timeSpan.className = "timestamp";
    timeSpan.innerText =
      chat.timestamp instanceof Date
        ? chat.timestamp.toLocaleString()
        : String(chat.timestamp);

    const messageDiv = document.createElement("div");
    messageDiv.className = chat.isUser
      ? "message user-message"
      : "message other-message";
    messageDiv.innerHTML = chat.text;

    li.appendChild(timeSpan);
    li.appendChild(messageDiv);

    chatLog.appendChild(li);
  });
};

const applySessionState = (nextState: SessionState): void => {
  sessionState = nextState;

  const sessionButton = getElement<HTMLButtonElement>("sessionButton");
  switch (nextState) {
    case 0: {
      sessionButton.disabled = false;
      sessionButton.innerText = "START";
      break;
    }
    case 1: {
      sessionButton.disabled = true;
      break;
    }
    case 2: {
      sessionButton.disabled = false;
      sessionButton.innerText = "STOP";
      break;
    }
  }
};

const applyChatStates = (
  nextChatStates: Set<ChatState> | null
): void => {
  chatStates = nextChatStates ?? new Set();

  const chatStateDesc = getElement<HTMLParagraphElement>(
    "chatStateDescription"
  );
  const stopSpeechButton = getElement<HTMLButtonElement>("stopSpeech");
  const voiceChatButton = getElement<HTMLButtonElement>("voice");
  const message = getElement<HTMLInputElement>("message");
  const sendMessageButton = getElement<HTMLButtonElement>("sendMessage");
  const ttfMessage = getElement<HTMLInputElement>("ttfMessage");
  const sendTtfMessage = getElement<HTMLButtonElement>("sendTtfMessage");

  if (available()) {
    message.disabled = false;
    sendMessageButton.disabled = false;
    ttfMessage.disabled = false;
    sendTtfMessage.disabled = false;

    chatStateDesc.innerText = "Available";
    message.focus();
  } else {
    message.disabled = true;
    sendMessageButton.disabled = true;
    ttfMessage.disabled = true;
    sendTtfMessage.disabled = true;

    const chatStatesTextArr: string[] = [];
    if (chatStates.has(ChatState.RECORDING)) {
      chatStatesTextArr.push("Recording");
    }
    if (chatStates.has(ChatState.LLM)) {
      chatStatesTextArr.push("LLM");
    }
    if (chatStates.has(ChatState.ANALYZING)) {
      chatStatesTextArr.push("Analyzing");
    }
    if (chatStates.has(ChatState.SPEAKING)) {
      chatStatesTextArr.push("AI Speaking");
    }
    chatStateDesc.innerText = chatStatesTextArr.join(" / ");
  }

  if (processing()) {
    stopSpeechButton.disabled = false;
    voiceChatButton.disabled = true;
  } else {
    stopSpeechButton.disabled = true;
    voiceChatButton.disabled = false;
  }

  voiceChatButton.innerText = recording() ? "Stop" : "Start";
};

const background = new Image();
const perso = new Image();

const loadImage = async (): Promise<void> => {
  const backgroundLoader = new Promise<void>((resolve) => {
    background.src = "background.png";
    background.onload = () => resolve();
  });
  const persoLoader = new Promise<void>((resolve) => {
    perso.src = "perso.png";
    perso.onload = () => resolve();
  });

  await backgroundLoader;
  await persoLoader;
};

const redrawChatbotCanvas = (): void => {
  const chatbotCanvas = getElement<HTMLCanvasElement>("chatbotCanvas");

  const width = screenOrientation === "portrait" ? 304 : 960;
  const height = 540;

  chatbotCanvas.style.width = `${width}px`;
  chatbotCanvas.style.height = `${height}px`;
  chatbotCanvas.width = width;
  chatbotCanvas.height = height;

  const ctx = chatbotCanvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.drawImage(background, 0, 0, width, height);

  const persoRatio =
    perso.height === 0 ? 1 : Math.max(perso.width / perso.height, 0.0001);
  let persoWidth = height * persoRatio;
  let persoHeight = height;
  persoWidth = Math.min(persoWidth * (chatbotHeight / 100), width);
  persoHeight = persoWidth / persoRatio;

  const leftRange = width - persoWidth;
  const persoLeft = leftRange * (chatbotLeft / 200 + 0.5);
  const persoTop = height * (chatbotTop / 100);

  ctx.drawImage(perso, persoLeft, persoTop, persoWidth, persoHeight);
};

window.onload = async (): Promise<void> => {
  const enableVoiceChatToggle = getElement<HTMLInputElement>("enableVoiceChat");
  enableVoiceChatToggle.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    const voiceChatContainer = getElement<HTMLDivElement>(
      "inputMethodContainer2"
    );
    enableVoiceChat = target.checked;
    voiceChatContainer.style.display = enableVoiceChat ? "flex" : "none";
  });

  const screenOrientations = document.getElementsByName(
    "screenOrientation"
  ) as NodeListOf<HTMLInputElement>;
  Array.from(screenOrientations).forEach((node) => {
    node.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.checked) {
        screenOrientation = target.value as Orientation;
        redrawChatbotCanvas();
      }
    });
  });
  screenOrientations[0]?.click();

  clientTools = loadChatTools();
  const clientToolsContainer = getElement<HTMLDivElement>(
    "clientToolsContainer"
  );
  clientToolsContainer.innerHTML = "";
  clientTools.forEach((value, index) => {
    const label = document.createElement("label");
    label.style.width = "fit-content";

    const input = document.createElement("input");
    input.value = index.toString();
    input.name = "clientTools";
    input.type = "checkbox";

    label.appendChild(input);
    label.append(` ${value.name}`);
    clientToolsContainer.appendChild(label);
  });

  const toPaddingString = (value: number): string => `${value}(${value / 100})`;

  chatbotLeft = 0;
  chatbotTop = 0;
  chatbotHeight = 100;

  const chatbotLeftElement = getElement<HTMLInputElement>("chatbotLeft");
  const chatbotLeftValueElement =
    getElement<HTMLSpanElement>("chatbotLeftValue");
  chatbotLeftElement.min = "-100";
  chatbotLeftElement.max = "100";
  chatbotLeftElement.value = chatbotLeft.toString();
  chatbotLeftElement.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
    chatbotLeft = Number(target.value);
    chatbotLeftValueElement.innerHTML = toPaddingString(chatbotLeft);
    redrawChatbotCanvas();
  });

  const chatbotTopElement = getElement<HTMLInputElement>("chatbotTop");
  const chatbotTopValueElement = getElement<HTMLSpanElement>("chatbotTopValue");
  chatbotTopElement.min = "0";
  chatbotTopElement.max = "100";
  chatbotTopElement.value = chatbotTop.toString();
  chatbotTopElement.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
    chatbotTop = Number(target.value);
    chatbotTopValueElement.innerHTML = toPaddingString(chatbotTop);
    redrawChatbotCanvas();
  });

  const chatbotHeightElement = getElement<HTMLInputElement>("chatbotHeight");
  const chatbotHeightValueElement =
    getElement<HTMLSpanElement>("chatbotHeightValue");
  chatbotHeightElement.min = "0";
  chatbotHeightElement.max = "500";
  chatbotHeightElement.value = chatbotHeight.toString();
  chatbotHeightElement.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
    chatbotHeight = Number(target.value);
    chatbotHeightValueElement.innerHTML = toPaddingString(chatbotHeight);
    redrawChatbotCanvas();
  });

  const inputEvent = new Event("input", {
    bubbles: true,
    cancelable: true,
  });
  chatbotLeftElement.dispatchEvent(inputEvent);
  chatbotTopElement.dispatchEvent(inputEvent);
  chatbotHeightElement.dispatchEvent(inputEvent);

  await loadImage();

  redrawChatbotCanvas();
};

const loadChatTools = (): ChatTool[] => {
  const chatTool1 = new ChatTool(
    "get_square_number",
    "Returns the square of the given number",
    {
      type: "object",
      properties: {
        number: {
          type: "number",
          description: "given number",
          examples: [3, 6, 9],
        },
      },
      required: ["number"],
    },
    (arg: { number: number }) => ({
      result: arg.number * arg.number,
    }),
    false
  );

  const chatTool2 = new ChatTool(
    "get_current_weather",
    "Retrieves the current weather for a given location",
    {
      type: "object",
      properties: {
        location: {
          examples: ["New York, US", "Seoul, KR"],
          type: "string",
          description: "City and country, e.g. 'San Francisco, CA'",
        },
        units: {
          type: "string",
          description: "The temperature unit to use",
          enum: ["celsius", "fahrenheit"],
          default: "celsius",
        },
      },
      required: ["location", "units"],
    },
    (arg: { location: string; units: string }) => {
      const location = arg.location;
      const units = arg.units;
      console.log(`get_current_weather called for ${location} in ${units}`);
      return {
        temperature: "30℃",
        condition: "Mostly clear",
        humidity: "68%",
        wind: "10.3km/h",
      };
    },
    false
  );

  const chatTool3 = new ChatTool(
    "show_settings",
    "Use ONLY for direct **COMMANDS** to open settings/admin screen (e.g., 'open settings', 'show admin'). MUST NOT be used for explanations or responses. Return values are machine-only JSON.",
    {
      type: "object",
      properties: {},
    },
    () => {
      console.log("show admin page");
      return { action: "show_settings", success: true };
    },
    true
  );

  const chatTool4 = new ChatTool(
    "show_map",
    "Use ONLY for direct **COMMANDS** to open map (e.g., 'open map', 'show map'). MUST NOT be used for explanations or responses. Return values are machine-only JSON.",
    {
      type: "object",
      properties: {},
    },
    () => {
      console.log("show map");
      throw new Error("client tool4 error test");
    },
    true
  );

  return [chatTool1, chatTool2, chatTool3, chatTool4];
};

// Expose functions to global scope for HTML onclick handlers
(window as unknown as Record<string, unknown>).getConfig = getConfig;
(window as unknown as Record<string, unknown>).onSessionClicked =
  onSessionClicked;
(window as unknown as Record<string, unknown>).onVoiceChatClicked =
  onVoiceChatClicked;
(window as unknown as Record<string, unknown>).onSendMessageClicked =
  onSendMessageClicked;
(window as unknown as Record<string, unknown>).onMessageKeyPress =
  onMessageKeyPress;
(window as unknown as Record<string, unknown>).onTtstfMessageSubmit =
  onTtstfMessageSubmit;
