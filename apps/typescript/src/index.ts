import '@perso-interactive-sdk-web/design-system/styles/base.css';
import '@perso-interactive-sdk-web/design-system/styles/components.css';
import '@perso-interactive-sdk-web/design-system/styles/chat.css';
import './global.css';
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
	TTSError,
	TTSDecodeError,
	type Chat,
	type Session
} from 'perso-interactive-sdk-web/client';
import { processChat, stopSpeech } from './sdk-handlers/llm';
import { processTTS, playAudio } from './sdk-handlers/tts';
import { startProcessSTT, stopProcessSTT, toggleSTT } from './sdk-handlers/stt';
import { detectFormat, processSTF, formatSize, setupDropZone } from './sdk-handlers/stf';

type Orientation = 'portrait' | 'landscape';
type SessionState = 0 | 1 | 2;
type Settings = Awaited<ReturnType<typeof getAllSettings>>;

const getElement = <T extends HTMLElement>(id: string): T => {
	const element = document.getElementById(id);
	if (!element) {
		throw new Error(`Element with id "${id}" not found.`);
	}
	return element as T;
};

const getSelectIndex = (id: string): number => Number(getElement<HTMLSelectElement>(id).value);

let apiServer = '';
let apiKey = '';
let session: Session | null = null;
let config: Settings | null = null;
let screenOrientation: Orientation = 'portrait';
let chatbotLeft = 0;
let chatbotTop = 0;
let chatbotHeight = 100;
let chatStates: Set<ChatState> = new Set();
let sessionState: SessionState = 0;
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

const appendChatBubble = (message: string, isUser: boolean): void => {
	const chatLog = getElement<HTMLDivElement>('chatLog');
	const bubble = document.createElement('div');
	bubble.className = isUser ? 'chat-bubble user' : 'chat-bubble ai';

	const role = document.createElement('div');
	role.className = 'chat-role';
	role.textContent = isUser ? 'You' : 'AI';

	const textEl = document.createElement('div');
	textEl.className = 'chat-text';
	textEl.textContent = message;

	const time = document.createElement('div');
	time.className = 'chat-time';
	time.textContent = new Date().toLocaleTimeString();

	bubble.appendChild(role);
	bubble.appendChild(textEl);
	bubble.appendChild(time);
	chatLog.appendChild(bubble);
	chatLog.scrollTop = chatLog.scrollHeight;
};

const processComplete = async (text: string, options?: { skipSTF?: boolean }): Promise<void> => {
	if (!session) return;

	appendChatBubble(text, true);

	const llmResponse = await processChat(session, text, options);
	if (llmResponse) {
		appendChatBubble(llmResponse, false);
	}
};

const onVoiceChatClicked = async (): Promise<void> => {
	const voiceChatButton = getElement<HTMLButtonElement>('voice');
	if (voiceChatButton.disabled || !session) {
		return;
	}

	try {
		if (available()) {
			await startProcessSTT(session);
		} else {
			const text = await stopProcessSTT(session);
			if (text.trim().length === 0) {
				console.warn('STT returned empty text');
				return;
			}

			await processComplete(text);
		}
	} catch (error) {
		console.error(error);
	}
};

const onSendMessageClicked = (): void => {
	if (chatStates.size === 0) {
		const messageElement = getElement<HTMLInputElement>('message');
		const message = messageElement.value.trim();
		if (!session || message.length === 0) return;
		messageElement.value = '';
		void processComplete(message);
	} else if (processing() && session) {
		void stopSpeech(session);
	}
};

const onMessageKeyPress = (keyEvent: KeyboardEvent): void => {
	if (keyEvent.key === 'Enter') {
		const messageElement = getElement<HTMLInputElement>('message');
		const message = messageElement.value.trim();
		if (!session || message.length === 0) return;
		messageElement.value = '';
		void processComplete(message);
	}
};

// TTSTF functions
const onTtstfSendClicked = (): void => {
	const messageElement = getElement<HTMLInputElement>('ttstfMessage');
	const message = messageElement.value.trim();
	if (!session || message.length === 0) return;
	messageElement.value = '';
	session.processTTSTF(message);
};

const onTtstfKeyPress = (keyEvent: KeyboardEvent): void => {
	if (keyEvent.key === 'Enter') {
		onTtstfSendClicked();
	}
};

// STT REST API functions
const onSttRestButtonClicked = async (): Promise<void> => {
	if (!session) return;

	const sttButton = getElement<HTMLButtonElement>('sttRestButton');
	const sttStatus = getElement<HTMLParagraphElement>('sttRestStatus');
	const sttResult = getElement<HTMLInputElement>('sttRestResult');
	const language = getElement<HTMLSelectElement>('sttRestLanguage').value;

	sttButton.disabled = true;
	sttResult.value = '';

	if (!session.isSTTRecording()) {
		sttStatus.innerText = 'Starting...';
	} else {
		sttStatus.innerText = 'Processing...';
		sttStatus.className = 'status processing';
	}

	try {
		const result = await toggleSTT(session, { language, timeout: 30000 });

		switch (result.action) {
			case 'started':
				sttButton.innerText = 'Stop STT';
				sttButton.disabled = false;
				sttStatus.innerText = 'Recording...';
				sttStatus.className = 'status recording';
				break;
			case 'completed':
				sttButton.innerText = 'Start STT';
				sttButton.disabled = false;
				sttResult.value = result.text;
				sttStatus.innerText = 'Completed';
				sttStatus.className = 'status success';
				break;
			case 'empty':
				sttButton.innerText = 'Start STT';
				sttButton.disabled = false;
				sttStatus.innerText = 'No speech detected';
				sttStatus.className = 'status warning';
				break;
		}
	} catch (error) {
		sttButton.innerText = 'Start STT';
		sttButton.disabled = false;
		sttStatus.innerText = `Error: ${error instanceof Error ? error.message : 'Unknown'}`;
		sttStatus.className = 'status error';
	}
};

const onTtsMessageSubmit = async (): Promise<void> => {
	const messageElement = getElement<HTMLInputElement>('ttsMessage');
	const audioElement = getElement<HTMLAudioElement>('ttsAudio');
	const message = messageElement.value.trim();

	if (!session || message.length === 0) {
		return;
	}

	const audioBlob = await processTTS(session, message);
	if (audioBlob) {
		playAudio(audioBlob, audioElement);
	}
};

let pendingStfFile: File | null = null;

const onStfFileSelected = (file: File): void => {
	const stfStatus = getElement<HTMLSpanElement>('stfStatus');
	const fileInfo = getElement<HTMLDivElement>('stfFileInfo');
	const fileNameEl = getElement<HTMLDivElement>('stfFileName');
	const fileSizeEl = getElement<HTMLDivElement>('stfFileSize');
	const executeButton = getElement<HTMLButtonElement>('stfExecute');

	const format = detectFormat(file.name);
	if (!format) {
		stfStatus.innerText = 'Error: Only mp3 and wav files are supported';
		stfStatus.className = 'status error';
		return;
	}

	fileNameEl.textContent = file.name;
	fileSizeEl.textContent = formatSize(file.size);
	fileInfo.style.display = 'flex';
	stfStatus.innerText = '';
	stfStatus.className = 'status';

	pendingStfFile = file;
	executeButton.disabled = false;
};

const executeSTF = async (): Promise<void> => {
	const stfStatus = getElement<HTMLSpanElement>('stfStatus');
	const executeButton = getElement<HTMLButtonElement>('stfExecute');

	if (!session) {
		stfStatus.innerText = 'Error: Session not started';
		stfStatus.className = 'status error';
		return;
	}

	if (!pendingStfFile) {
		stfStatus.innerText = 'Error: No file selected';
		stfStatus.className = 'status error';
		return;
	}

	const format = detectFormat(pendingStfFile.name);
	if (!format) {
		stfStatus.innerText = 'Error: Only mp3 and wav files are supported';
		stfStatus.className = 'status error';
		return;
	}

	try {
		executeButton.disabled = true;
		stfStatus.innerText = 'Processing...';
		stfStatus.className = 'status processing';
		await processSTF(session, pendingStfFile, format);
		stfStatus.innerText = 'Completed';
		stfStatus.className = 'status success';
	} catch (error) {
		stfStatus.innerText = `Error: ${error instanceof Error ? error.message : 'Unknown'}`;
		stfStatus.className = 'status error';
	} finally {
		executeButton.disabled = false;
	}
};

const initStfDropZone = (): void => {
	const executeButton = getElement<HTMLButtonElement>('stfExecute');

	setupDropZone(
		{
			dropZone: getElement<HTMLDivElement>('stfDropZone'),
			fileInput: getElement<HTMLInputElement>('stfFile'),
			fileInfo: getElement<HTMLDivElement>('stfFileInfo'),
			statusSpan: getElement<HTMLSpanElement>('stfStatus'),
			removeButton: getElement<HTMLButtonElement>('stfFileRemove'),
			executeButton
		},
		(file) => {
			onStfFileSelected(file);
		}
	);

	executeButton.addEventListener('click', () => {
		void executeSTF();
	});
};

const getConfig = async (): Promise<void> => {
	apiServer = getElement<HTMLInputElement>('apiServer').value;
	apiKey = getElement<HTMLInputElement>('apiKey').value;

	const authorizeBtn = getElement<HTMLButtonElement>('authorize');
	authorizeBtn.disabled = true;
	authorizeBtn.innerText = 'Loading...';

	try {
		config = await getAllSettings(apiServer, apiKey);
	} catch (error) {
		authorizeBtn.disabled = false;
		authorizeBtn.innerText = 'Authorize';
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

	const llmOptions = getElement<HTMLSelectElement>('llmOptions');
	llmOptions.innerHTML = '';
	settings.llms.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index.toString();
		option.innerText = value.name;
		llmOptions.appendChild(option);
	});

	const ttsOptions = getElement<HTMLSelectElement>('ttsOptions');
	ttsOptions.innerHTML = '';
	settings.ttsTypes.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index.toString();
		option.innerText = value.name;
		ttsOptions.appendChild(option);
	});

	const sttOptions = getElement<HTMLSelectElement>('sttOptions');
	sttOptions.innerHTML = '';
	settings.sttTypes.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index.toString();
		option.innerText = value.name;
		sttOptions.appendChild(option);
	});

	const chatbotStyle = getElement<HTMLSelectElement>('chatbotStyle');
	chatbotStyle.innerHTML = '';
	settings.modelStyles.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index.toString();
		option.innerText = value.name;
		chatbotStyle.appendChild(option);
	});

	const backgroundImage = getElement<HTMLSelectElement>('backgroundImage');
	backgroundImage.innerHTML = '';
	if (settings.backgroundImages.length > 0) {
		const option = document.createElement('option');
		option.value = '';
		option.innerText = '';
		backgroundImage.appendChild(option);
	}
	settings.backgroundImages.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index.toString();
		option.innerText = value.title;
		backgroundImage.appendChild(option);
	});

	const promptOptions = getElement<HTMLSelectElement>('promptOptions');
	promptOptions.innerHTML = '';
	promptOptions.onchange = () => {
		if (!config) {
			return;
		}
		const introMessage = getElement<HTMLDivElement>('introMessage');
		const selectedPrompt = config.prompts[Number(promptOptions.value)];
		introMessage.innerText = selectedPrompt.intro_message;
	};

	settings.prompts.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index.toString();
		option.innerText = value.name;
		promptOptions.appendChild(option);
		if (index === 0) {
			getElement<HTMLDivElement>('introMessage').innerText = value.intro_message;
		}
	});
	promptOptions.value = '0';

	const documentOptions = getElement<HTMLSelectElement>('documentOptions');
	documentOptions.innerHTML = '';
	if (settings.documents.length > 0) {
		const option = document.createElement('option');
		option.value = '';
		option.innerText = '';
		documentOptions.appendChild(option);
	}
	settings.documents.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index.toString();
		option.innerText = value.title;
		documentOptions.appendChild(option);
	});

	const mcpServersContainer = getElement<HTMLDivElement>('mcpServersContainer');
	mcpServersContainer.innerHTML = '';
	if (settings.mcpServers.length === 0) {
		const span = document.createElement('span');
		span.className = 'empty-hint';
		span.textContent = 'No MCP servers available';
		mcpServersContainer.appendChild(span);
	} else {
		settings.mcpServers.forEach((value, index) => {
			const label = document.createElement('label');
			label.style.width = 'fit-content';

			const input = document.createElement('input');
			input.value = index.toString();
			input.name = 'mcpServers';
			input.type = 'checkbox';

			label.appendChild(input);
			label.append(` ${value.name}`);
			mcpServersContainer.appendChild(label);
		});
	}

	getElement('step2').classList.remove('disabled');
	getElement('step3').classList.remove('disabled');
	getElement('step4').classList.remove('disabled');
	getElement('step5').classList.remove('disabled');
	getElement<HTMLButtonElement>('sessionButton').disabled = false;

	authorizeBtn.disabled = false;
	authorizeBtn.innerText = 'Authorize';
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

	const width = screenOrientation === 'portrait' ? 1080 : 1920;
	const height = screenOrientation === 'portrait' ? 1920 : 1080;

	if (!config) {
		alert('Please authorize before starting a session.');
		applySessionState(0);
		return;
	}

	const settings = config;

	const llmOption = settings.llms[getSelectIndex('llmOptions')];
	const llmTypeKey = llmOption.name;
	const ttsOption = settings.ttsTypes[getSelectIndex('ttsOptions')];
	const ttsTypeKey = ttsOption.name;
	const sttOption = settings.sttTypes[getSelectIndex('sttOptions')];
	const sttTypeKey = sttOption.name;
	const modelStyleOption = settings.modelStyles[getSelectIndex('chatbotStyle')];
	const modelStyleKey = modelStyleOption.name;

	const promptSelect = getElement<HTMLSelectElement>('promptOptions');
	const promptOption = settings.prompts[Number(promptSelect.value)];
	const promptKey = promptOption.prompt_id;

	const backgroundImageSelect = getElement<HTMLSelectElement>('backgroundImage');
	const backgroundImageOptionIndex = backgroundImageSelect.value;
	const backgroundImageKey =
		backgroundImageOptionIndex.length === 0
			? null
			: settings.backgroundImages[Number(backgroundImageOptionIndex)].backgroundimage_id;

	const documentSelect = getElement<HTMLSelectElement>('documentOptions');
	const documentOptionIndex = documentSelect.value;
	const documentKey =
		documentOptionIndex.length === 0
			? null
			: settings.documents[Number(documentOptionIndex)].document_id;

	const mcpServerCheckBoxes = document.getElementsByName(
		'mcpServers'
	) as NodeListOf<HTMLInputElement>;
	const mcpServersKey = Array.from(mcpServerCheckBoxes).reduce<string[]>((acc, element) => {
		if (element.checked) {
			const mcpKey = settings.mcpServers[Number(element.value)].mcpserver_id;
			acc.push(mcpKey);
		}
		return acc;
	}, []);

	const clientToolsCheckBoxes = document.getElementsByName(
		'clientTools'
	) as NodeListOf<HTMLInputElement>;
	const selectedClientTools = Array.from(clientToolsCheckBoxes).reduce<ChatTool[]>(
		(acc, element) => {
			if (element.checked) {
				acc.push(clientTools[Number(element.value)]);
			}
			return acc;
		},
		[]
	);

	const useIntro = getElement<HTMLInputElement>('useIntro').checked;
	const videoElement = getElement<HTMLVideoElement>('video');

	try {
		const sessionId = await createSessionId(apiServer, apiKey, {
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
			stt_type: sttTypeKey
		});

		const newSession = await createSession(
			apiServer,
			sessionId,
			width,
			height,
			selectedClientTools
		);

		session = newSession;

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
			} else if (llmError.underlyingError instanceof LLMStreamingResponseError) {
				alert(llmError.underlyingError.description);
			}
		} else if (error instanceof TTSError) {
			const ttsError = error as TTSError;
			if (ttsError.underlyingError instanceof ApiError) {
				alert(`TTS API Error: ${ttsError.underlyingError}`);
			} else if (ttsError.underlyingError instanceof TTSDecodeError) {
				alert(`TTS Decode Error: ${ttsError.underlyingError.description}`);
			}
		}
	});
	unsubscribeChatLog = session.subscribeChatLog((chatLog: Array<Chat>) => {
		refreshChatLog(chatLog);
	});
	unsubscribeChatStates = session.subscribeChatStates((states: Set<ChatState>) => {
		applyChatStates(states);
	});
	removeOnClose = session.onClose((manualClosed: boolean) => {
		if (!manualClosed) {
			setTimeout(() => {
				getSessionInfo(apiServer, session!.getSessionId())
					.then((response: { termination_reason: string }) => {
						if (response.termination_reason) {
							alert(response.termination_reason);
						}
					})
					.catch((error: unknown) => {
						console.error('Failed to get session info:', error);
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

const available = (): boolean => chatStates.size === 0;

const processing = (): boolean =>
	chatStates.has(ChatState.LLM) ||
	chatStates.has(ChatState.ANALYZING) ||
	chatStates.has(ChatState.SPEAKING);

const recording = (): boolean => chatStates.has(ChatState.RECORDING);

const refreshChatLog = (chatList: Array<Chat>): void => {
	const chatLog = getElement<HTMLDivElement>('chatLog');
	chatLog.innerHTML = '';
	[...chatList].reverse().forEach((chat) => {
		const bubble = document.createElement('div');
		bubble.className = chat.isUser ? 'chat-bubble user' : 'chat-bubble ai';

		const role = document.createElement('div');
		role.className = 'chat-role';
		role.textContent = chat.isUser ? 'You' : 'AI';

		const text = document.createElement('div');
		text.className = 'chat-text';
		text.textContent = chat.text;

		const time = document.createElement('div');
		time.className = 'chat-time';
		time.textContent =
			chat.timestamp instanceof Date ? chat.timestamp.toLocaleTimeString() : String(chat.timestamp);

		bubble.appendChild(role);
		bubble.appendChild(text);
		bubble.appendChild(time);
		chatLog.appendChild(bubble);
	});
	chatLog.scrollTop = chatLog.scrollHeight;
};

const applySessionState = (nextState: SessionState): void => {
	sessionState = nextState;

	const sessionButton = getElement<HTMLButtonElement>('sessionButton');

	// STT REST UI elements
	const sttRestButton = getElement<HTMLButtonElement>('sttRestButton');
	const sttRestStatus = getElement<HTMLParagraphElement>('sttRestStatus');
	const sttRestResult = getElement<HTMLInputElement>('sttRestResult');

	const featuresArea = getElement('featuresArea');

	switch (nextState) {
		case 0: {
			sessionButton.disabled = false;
			sessionButton.innerText = 'START';
			// Reset STT REST UI when session stops
			sttRestButton.disabled = true;
			sttRestButton.innerText = 'Start STT';
			sttRestStatus.innerText = '';
			sttRestStatus.className = 'status';
			sttRestResult.value = '';
			featuresArea.classList.add('disabled');
			break;
		}
		case 1: {
			sessionButton.disabled = true;
			sessionButton.innerText = 'Loading...';
			sttRestButton.disabled = true;
			break;
		}
		case 2: {
			sessionButton.disabled = false;
			sessionButton.innerText = 'STOP';
			// Enable STT buttons when session is active
			sttRestButton.disabled = false;
			featuresArea.classList.remove('disabled');
			break;
		}
	}
};

const applyChatStates = (nextChatStates: Set<ChatState> | null): void => {
	chatStates = nextChatStates ?? new Set();

	const chatStateDesc = getElement<HTMLParagraphElement>('chatStateDescription');
	const stopSpeechButton = getElement<HTMLButtonElement>('stopSpeech');
	const voiceChatButton = getElement<HTMLButtonElement>('voice');
	const message = getElement<HTMLInputElement>('message');
	const sendMessageButton = getElement<HTMLButtonElement>('sendMessage');

	const ttstfMessage = getElement<HTMLInputElement>('ttstfMessage');
	const sendTtstfButton = getElement<HTMLButtonElement>('sendTtstf');

	if (available()) {
		message.disabled = false;
		sendMessageButton.disabled = false;
		ttstfMessage.disabled = false;
		sendTtstfButton.disabled = false;

		chatStateDesc.innerText = 'Available';
		chatStateDesc.className = 'state-available';
		message.focus();
	} else {
		message.disabled = true;
		sendMessageButton.disabled = true;
		ttstfMessage.disabled = true;
		sendTtstfButton.disabled = true;

		const chatStatesTextArr: string[] = [];
		if (chatStates.has(ChatState.RECORDING)) {
			chatStatesTextArr.push('Recording');
		}
		if (chatStates.has(ChatState.LLM)) {
			chatStatesTextArr.push('LLM');
		}
		if (chatStates.has(ChatState.ANALYZING)) {
			chatStatesTextArr.push('Analyzing');
		}
		if (chatStates.has(ChatState.SPEAKING)) {
			chatStatesTextArr.push('AI Speaking');
		}
		if (chatStates.has(ChatState.TTS)) {
			chatStatesTextArr.push('TTS');
		}
		chatStateDesc.innerText = chatStatesTextArr.join(' / ');
		chatStateDesc.className = 'state-busy';
	}

	stopSpeechButton.disabled = !chatStates.has(ChatState.SPEAKING);

	if (recording()) {
		voiceChatButton.disabled = false;
		voiceChatButton.innerText = 'Stop Speech';
		voiceChatButton.classList.add('recording');
	} else if (processing()) {
		voiceChatButton.disabled = true;
		voiceChatButton.innerText = 'Voice Chat';
		voiceChatButton.classList.remove('recording');
	} else {
		voiceChatButton.disabled = false;
		voiceChatButton.innerText = 'Voice Chat';
		voiceChatButton.classList.remove('recording');
	}
};

const background = new Image();
const perso = new Image();

const loadImage = async (): Promise<void> => {
	const backgroundLoader = new Promise<void>((resolve) => {
		background.src = 'background.png';
		background.onload = () => resolve();
	});
	const persoLoader = new Promise<void>((resolve) => {
		perso.src = 'perso.png';
		perso.onload = () => resolve();
	});

	await backgroundLoader;
	await persoLoader;
};

const redrawChatbotCanvas = (): void => {
	const chatbotCanvas = getElement<HTMLCanvasElement>('chatbotCanvas');

	const width = screenOrientation === 'portrait' ? 120 : 360;
	const height = 202;

	chatbotCanvas.style.width = `${width}px`;
	chatbotCanvas.style.height = `${height}px`;
	chatbotCanvas.width = width;
	chatbotCanvas.height = height;

	const ctx = chatbotCanvas.getContext('2d');
	if (!ctx) {
		return;
	}

	ctx.drawImage(background, 0, 0, width, height);

	const persoRatio = perso.height === 0 ? 1 : Math.max(perso.width / perso.height, 0.0001);
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
	const toggleApiKeyBtn = getElement<HTMLButtonElement>('toggleApiKey');
	const apiKeyInput = getElement<HTMLInputElement>('apiKey');
	const eyeIcon = document.getElementById('eyeIcon') as unknown as SVGElement;
	toggleApiKeyBtn.addEventListener('click', () => {
		const isPassword = apiKeyInput.type === 'password';
		apiKeyInput.type = isPassword ? 'text' : 'password';
		eyeIcon.innerHTML = isPassword
			? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
			: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
	});

	const screenOrientations = document.getElementsByName(
		'screenOrientation'
	) as NodeListOf<HTMLInputElement>;
	Array.from(screenOrientations).forEach((node) => {
		node.addEventListener('change', (event) => {
			const target = event.target as HTMLInputElement;
			if (target.checked) {
				screenOrientation = target.value as Orientation;
				redrawChatbotCanvas();
			}
		});
	});
	screenOrientations[0]?.click();

	clientTools = loadChatTools();
	const clientToolsContainer = getElement<HTMLDivElement>('clientToolsContainer');
	clientToolsContainer.innerHTML = '';
	clientTools.forEach((value, index) => {
		const label = document.createElement('label');
		label.style.width = 'fit-content';

		const input = document.createElement('input');
		input.value = index.toString();
		input.name = 'clientTools';
		input.type = 'checkbox';

		label.appendChild(input);
		label.append(` ${value.name}`);
		clientToolsContainer.appendChild(label);
	});

	const toPaddingString = (value: number): string => `${value}(${value / 100})`;

	chatbotLeft = 0;
	chatbotTop = 0;
	chatbotHeight = 100;

	const chatbotLeftElement = getElement<HTMLInputElement>('chatbotLeft');
	const chatbotLeftValueElement = getElement<HTMLSpanElement>('chatbotLeftValue');
	chatbotLeftElement.min = '-100';
	chatbotLeftElement.max = '100';
	chatbotLeftElement.value = chatbotLeft.toString();
	chatbotLeftElement.addEventListener('input', (event) => {
		const target = event.target as HTMLInputElement;
		chatbotLeft = Number(target.value);
		chatbotLeftValueElement.textContent = toPaddingString(chatbotLeft);
		redrawChatbotCanvas();
	});

	const chatbotTopElement = getElement<HTMLInputElement>('chatbotTop');
	const chatbotTopValueElement = getElement<HTMLSpanElement>('chatbotTopValue');
	chatbotTopElement.min = '0';
	chatbotTopElement.max = '100';
	chatbotTopElement.value = chatbotTop.toString();
	chatbotTopElement.addEventListener('input', (event) => {
		const target = event.target as HTMLInputElement;
		chatbotTop = Number(target.value);
		chatbotTopValueElement.textContent = toPaddingString(chatbotTop);
		redrawChatbotCanvas();
	});

	const chatbotHeightElement = getElement<HTMLInputElement>('chatbotHeight');
	const chatbotHeightValueElement = getElement<HTMLSpanElement>('chatbotHeightValue');
	chatbotHeightElement.min = '0';
	chatbotHeightElement.max = '500';
	chatbotHeightElement.value = chatbotHeight.toString();
	chatbotHeightElement.addEventListener('input', (event) => {
		const target = event.target as HTMLInputElement;
		chatbotHeight = Number(target.value);
		chatbotHeightValueElement.textContent = toPaddingString(chatbotHeight);
		redrawChatbotCanvas();
	});

	const inputEvent = new Event('input', {
		bubbles: true,
		cancelable: true
	});
	chatbotLeftElement.dispatchEvent(inputEvent);
	chatbotTopElement.dispatchEvent(inputEvent);
	chatbotHeightElement.dispatchEvent(inputEvent);

	await loadImage();

	redrawChatbotCanvas();

	initStfDropZone();
};

const loadChatTools = (): ChatTool[] => {
	const chatTool1 = new ChatTool(
		'get_square_number',
		'Returns the square of the given number',
		{
			type: 'object',
			properties: {
				number: {
					type: 'number',
					description: 'given number',
					examples: [3, 6, 9]
				}
			},
			required: ['number']
		},
		(arg: { number: number }) => ({
			result: arg.number * arg.number
		}),
		false
	);

	const chatTool2 = new ChatTool(
		'get_current_weather',
		'Retrieves the current weather for a given location',
		{
			type: 'object',
			properties: {
				location: {
					examples: ['New York, US', 'Seoul, KR'],
					type: 'string',
					description: "City and country, e.g. 'San Francisco, CA'"
				},
				units: {
					type: 'string',
					description: 'The temperature unit to use',
					enum: ['celsius', 'fahrenheit'],
					default: 'celsius'
				}
			},
			required: ['location', 'units']
		},
		(arg: { location: string; units: string }) => {
			const location = arg.location;
			const units = arg.units;
			console.log(`get_current_weather called for ${location} in ${units}`);
			return {
				temperature: '30℃',
				condition: 'Mostly clear',
				humidity: '68%',
				wind: '10.3km/h'
			};
		},
		false
	);

	const chatTool3 = new ChatTool(
		'show_settings',
		"Use ONLY for direct **COMMANDS** to open settings/admin screen (e.g., 'open settings', 'show admin'). MUST NOT be used for explanations or responses. Return values are machine-only JSON.",
		{
			type: 'object',
			properties: {}
		},
		() => {
			console.log('show admin page');
			return { action: 'show_settings', success: true };
		},
		true
	);

	const chatTool4 = new ChatTool(
		'show_map',
		"Use ONLY for direct **COMMANDS** to open map (e.g., 'open map', 'show map'). MUST NOT be used for explanations or responses. Return values are machine-only JSON.",
		{
			type: 'object',
			properties: {}
		},
		() => {
			console.log('show map');
			throw new Error('client tool4 error test');
		},
		true
	);

	return [chatTool1, chatTool2, chatTool3, chatTool4];
};

// Expose functions to global scope for HTML onclick handlers
(window as unknown as Record<string, unknown>).getConfig = getConfig;
(window as unknown as Record<string, unknown>).onSessionClicked = onSessionClicked;
(window as unknown as Record<string, unknown>).onVoiceChatClicked = onVoiceChatClicked;
(window as unknown as Record<string, unknown>).onSendMessageClicked = onSendMessageClicked;
(window as unknown as Record<string, unknown>).onMessageKeyPress = onMessageKeyPress;
(window as unknown as Record<string, unknown>).onSttRestButtonClicked = onSttRestButtonClicked;
(window as unknown as Record<string, unknown>).onTtsMessageSubmit = onTtsMessageSubmit;
(window as unknown as Record<string, unknown>).onTtstfSendClicked = onTtstfSendClicked;
(window as unknown as Record<string, unknown>).onTtstfKeyPress = onTtstfKeyPress;
