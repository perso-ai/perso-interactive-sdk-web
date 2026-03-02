var apiServer = null;
var apiKey = null;
var session = null;
var config = null;
var screenOrientation = null;
var chatbotLeft = 0;
var chatbotTop = 0;
var chatbotHeight = 0;
var chatStates = new Set();
var sessionState = 0;
var removeOnClose = null;
var unsubscribeChatStates = null;
var unsubscribeChatLog = null;
var removeErrorHandler = null;
var removeSttResultCallback = null;

var clientTools = null;

function onSessionClicked() {
	if (sessionState === 0) {
		startSession();

		applySessionState(1);
	} else if (sessionState === 2) {
		stopSession();
	}
}

function appendChatBubble(message, isUser) {
	var chatLog = document.getElementById('chatLog');
	var bubble = document.createElement('div');
	bubble.className = isUser ? 'chat-bubble user' : 'chat-bubble ai';

	var role = document.createElement('div');
	role.className = 'chat-role';
	role.textContent = isUser ? 'You' : 'AI';

	var textEl = document.createElement('div');
	textEl.className = 'chat-text';
	textEl.textContent = message;

	var time = document.createElement('div');
	time.className = 'chat-time';
	time.textContent = new Date().toLocaleTimeString();

	bubble.appendChild(role);
	bubble.appendChild(textEl);
	bubble.appendChild(time);
	chatLog.appendChild(bubble);
	chatLog.scrollTop = chatLog.scrollHeight;
}

async function onVoiceChatClicked() {
	var voiceChatButton = document.getElementById('voice');
	if (voiceChatButton.disabled || !session) {
		return;
	}

	try {
		if (available()) {
			await session.startProcessSTT();
		} else {
			var text = await session.stopProcessSTT();
			if (text.trim().length === 0) {
				console.warn('STT returned empty text');
				return;
			}
			session.processChat(text);
		}
	} catch (error) {
		console.error(error);
	}
}

function onSendMessageClicked() {
	if (chatStates.size === 0) {
		sendMessage();
	} else {
		stopSpeech();
	}
}

function onMessageKeyPress(keyEvent) {
	if (keyEvent.key === 'Enter') {
		sendMessage();
	}
}

async function onSttRestButtonClicked() {
	var sttButton = document.getElementById('sttRestButton');
	var sttStatus = document.getElementById('sttRestStatus');
	var sttResult = document.getElementById('sttRestResult');

	if (!session) {
		return;
	}

	if (!session.isSTTRecording()) {
		try {
			sttButton.disabled = true;
			sttStatus.innerText = 'Starting...';
			sttResult.value = '';

			await session.startProcessSTT();
			sttButton.innerText = 'Stop STT';
			sttButton.disabled = false;
			sttStatus.innerText = 'Recording...';
			sttStatus.className = 'status recording';
		} catch (error) {
			sttStatus.innerText = 'Error: ' + error.message;
			sttStatus.className = 'status error';
			sttButton.disabled = false;
		}
	} else {
		try {
			sttButton.disabled = true;
			sttStatus.innerText = 'Processing...';
			sttStatus.className = 'status processing';

			var language = document.getElementById('sttRestLanguage').value;
			var text = await session.stopProcessSTT(language);
			sttButton.innerText = 'Start STT';
			sttButton.disabled = false;

			if (text && text.trim().length > 0) {
				sttResult.value = text;
				sttStatus.innerText = 'Completed';
				sttStatus.className = 'status success';
			} else {
				sttStatus.innerText = 'No speech detected';
				sttStatus.className = 'status warning';
			}
		} catch (error) {
			sttButton.innerText = 'Start STT';
			sttButton.disabled = false;
			sttStatus.innerText = 'Error: ' + error.message;
			sttStatus.className = 'status error';

			if (error instanceof PersoInteractive.STTError) {
				alert('STT Error: ' + error.message);
			}
		}
	}
}

async function onTtsMessageSubmit() {
	const messageElement = document.getElementById('ttsMessage');
	const audioElement = document.getElementById('ttsAudio');
	const message = messageElement.value.trim();
	if (message.length > 0 && session != null) {
		const audioBlob = await session.processTTS(message);
		if (audioBlob) {
			if (audioElement.src) {
				URL.revokeObjectURL(audioElement.src);
			}
			const audioUrl = URL.createObjectURL(audioBlob);
			audioElement.src = audioUrl;
			audioElement.play();
		}
	}
}

function formatFileSize(bytes) {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function handleStfFile(file) {
	const stfStatus = document.getElementById('stfStatus');
	const fileInput = document.getElementById('stfFile');
	const fileInfo = document.getElementById('stfFileInfo');
	const fileName = document.getElementById('stfFileName');
	const fileSize = document.getElementById('stfFileSize');

	const isMp3 = file.name.toLowerCase().endsWith('.mp3');
	const isWav = file.name.toLowerCase().endsWith('.wav');
	let format;
	if (isMp3) {
		format = 'mp3';
	} else if (isWav) {
		format = 'wav';
	} else {
		stfStatus.innerText = 'Error: Only mp3 and wav files are supported';
		stfStatus.className = 'status error';
		fileInput.value = '';
		return;
	}

	fileName.textContent = file.name;
	fileSize.textContent = formatFileSize(file.size);
	fileInfo.style.display = 'flex';

	if (!session) {
		stfStatus.innerText = 'Error: Session not started';
		stfStatus.className = 'status error';
		return;
	}

	try {
		stfStatus.innerText = 'Processing...';
		stfStatus.className = 'status processing';

		await session.processSTF(file, format, '');

		stfStatus.innerText = 'Completed';
		stfStatus.className = 'status success';
	} catch (error) {
		stfStatus.innerText = 'Error: ' + error.message;
		stfStatus.className = 'status error';
	}
}

function setupStfDropZone() {
	const dropZone = document.getElementById('stfDropZone');
	const fileInput = document.getElementById('stfFile');
	const fileInfo = document.getElementById('stfFileInfo');
	const stfStatus = document.getElementById('stfStatus');

	dropZone.addEventListener('click', () => fileInput.click());

	dropZone.addEventListener('dragenter', (e) => {
		e.preventDefault();
		dropZone.classList.add('dragover');
	});
	dropZone.addEventListener('dragover', (e) => {
		e.preventDefault();
		dropZone.classList.add('dragover');
	});
	dropZone.addEventListener('dragleave', () => {
		dropZone.classList.remove('dragover');
	});
	dropZone.addEventListener('drop', (e) => {
		e.preventDefault();
		dropZone.classList.remove('dragover');
		const files = e.dataTransfer.files;
		if (files.length > 0) {
			handleStfFile(files[0]);
		}
	});

	fileInput.addEventListener('change', () => {
		const file = fileInput.files[0];
		if (file) {
			handleStfFile(file);
		}
	});

	document.getElementById('stfFileRemove').addEventListener('click', (e) => {
		e.stopPropagation();
		fileInput.value = '';
		fileInfo.style.display = 'none';
		stfStatus.innerText = '';
		stfStatus.className = 'status';
	});
}

async function getConfig() {
	apiServer = document.getElementById('apiServer').value;
	apiKey = document.getElementById('apiKey').value;

	var authorizeBtn = document.getElementById('authorize');
	authorizeBtn.disabled = true;
	authorizeBtn.innerText = 'Loading...';

	try {
		config = await PersoInteractive.getAllSettings(apiServer, apiKey);
	} catch (e) {
		authorizeBtn.disabled = false;
		authorizeBtn.innerText = 'Authorize';
		alert(e);
		return;
	}

	if (!config) {
		return;
	}

	const llmOptions = document.getElementById('llmOptions');
	llmOptions.innerHTML = '';
	config.llms.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index;
		option.innerText = value.name;
		llmOptions.appendChild(option);
	});

	const ttsOptions = document.getElementById('ttsOptions');
	ttsOptions.innerHTML = '';
	config.ttsTypes.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index;
		option.innerText = value.name;
		ttsOptions.appendChild(option);
	});

	const sttOptions = document.getElementById('sttOptions');
	sttOptions.innerHTML = '';
	config.sttTypes.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index;
		option.innerText = value.name;
		sttOptions.appendChild(option);
	});

	const chatbotStyle = document.getElementById('chatbotStyle');
	chatbotStyle.innerHTML = '';
	config.modelStyles.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index;
		option.innerText = value.name;
		chatbotStyle.appendChild(option);
	});

	const backgroundImage = document.getElementById('backgroundImage');
	backgroundImage.innerHTML = '';
	if (config.backgroundImages.length > 0) {
		const option = document.createElement('option');
		option.value = '';
		option.innerText = '';
		backgroundImage.appendChild(option);
	}
	config.backgroundImages.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index;
		option.innerText = value.title;
		backgroundImage.appendChild(option);
	});

	const promptOptions = document.getElementById('promptOptions');
	promptOptions.innerHTML = '';
	promptOptions.onchange = () => {
		if (!config) {
			return;
		}
		const introMessage = document.getElementById('introMessage');
		introMessage.innerText = config.prompts[parseInt(promptOptions.value)].intro_message;
	};

	config.prompts.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index;
		option.innerText = value.name;
		promptOptions.appendChild(option);
		if (index === 0) {
			document.getElementById('introMessage').innerText = value.intro_message;
		}
	});
	promptOptions.value = 0;

	const documentOptions = document.getElementById('documentOptions');
	documentOptions.innerHTML = '';
	if (config.documents.length > 0) {
		const option = document.createElement('option');
		option.value = '';
		option.innerText = '';
		documentOptions.appendChild(option);
	}
	config.documents.forEach((value, index) => {
		const option = document.createElement('option');
		option.value = index;
		option.innerText = value.title;
		documentOptions.appendChild(option);
	});

	const mcpServersContainer = document.getElementById('mcpServersContainer');
	mcpServersContainer.innerHTML = '';
	if (config.mcpServers.length === 0) {
		const span = document.createElement('span');
		span.className = 'empty-hint';
		span.textContent = 'No MCP servers available';
		mcpServersContainer.appendChild(span);
	} else {
		config.mcpServers.forEach((value, index) => {
			const label = document.createElement('label');
			label.style.width = 'fit-content';

			const input = document.createElement('input');
			input.value = index;
			input.name = 'mcpServers';
			input.type = 'checkbox';

			label.appendChild(input);
			label.append(` ${value.name}`);
			mcpServersContainer.appendChild(label);
		});
	}

	document.getElementById('step2').classList.remove('disabled');
	document.getElementById('step3').classList.remove('disabled');
	document.getElementById('step4').classList.remove('disabled');
	document.getElementById('step5').classList.remove('disabled');
	document.getElementById('sessionButton').disabled = false;

	authorizeBtn.disabled = false;
	authorizeBtn.innerText = 'Authorize';
}

async function startSession() {
	if (removeErrorHandler != null) {
		removeErrorHandler();
	}
	if (removeOnClose != null) {
		removeOnClose();
	}
	if (unsubscribeChatStates != null) {
		unsubscribeChatStates();
	}
	if (unsubscribeChatLog != null) {
		unsubscribeChatLog();
	}
	if (removeSttResultCallback != null) {
		removeSttResultCallback();
	}

	removeErrorHandler = null;
	removeOnClose = null;
	unsubscribeChatStates = null;
	unsubscribeChatLog = null;
	removeSttResultCallback = null;

	let width, height;
	if (screenOrientation === 'portrait') {
		width = 1080;
		height = 1920;
	} else {
		width = 1920;
		height = 1080;
	}

	if (!config) {
		alert('Please authorize before starting a session.');
		applySessionState(0);
		return;
	}

	const llmOption = config.llms[parseInt(document.getElementById('llmOptions').value)];
	const llmTypeKey = llmOption.name;
	const ttsOption = config.ttsTypes[parseInt(document.getElementById('ttsOptions').value)];
	const ttsTypeKey = ttsOption.name;
	const sttOption = config.sttTypes[parseInt(document.getElementById('sttOptions').value)];
	const sttTypeKey = sttOption.name;
	const modelStyleOption =
		config.modelStyles[parseInt(document.getElementById('chatbotStyle').value)];
	const modelStyleKey = modelStyleOption.name;
	const promptOption = config.prompts[parseInt(document.getElementById('promptOptions').value)];
	const promptKey = promptOption.prompt_id;

	let backgroundImageOptionIndex = document.getElementById('backgroundImage').value;
	let backgroundImageKey;
	if (backgroundImageOptionIndex.length === 0) {
		backgroundImageKey = null;
	} else {
		backgroundImageKey =
			config.backgroundImages[parseInt(backgroundImageOptionIndex)].backgroundimage_id;
	}

	let documentOptionIndex = document.getElementById('documentOptions').value;
	let documentKey;
	if (documentOptionIndex.length === 0) {
		documentKey = null;
	} else {
		documentKey = config.documents[parseInt(documentOptionIndex)].document_id;
	}

	const mcpServerCheckBoxes = document.getElementsByName('mcpServers');
	let mcpServersKey = [];
	mcpServerCheckBoxes.forEach((element) => {
		if (element.checked) {
			const mcpKey = config.mcpServers[element.value].mcpserver_id;
			mcpServersKey.push(mcpKey);
		}
	});

	const clientToolsCheckBoxes = document.getElementsByName('clientTools');
	let selectedClientTools = [];
	clientToolsCheckBoxes.forEach((element) => {
		if (element.checked) {
			const clientTool = clientTools[element.value];
			selectedClientTools.push(clientTool);
		}
	});

	const useIntro = document.getElementById('useIntro').checked;
	const videoElement = document.getElementById('video');

	try {
		const sessionId = await PersoInteractive.createSessionId(apiServer, apiKey, {
			using_stf_webrtc: true,
			model_style: modelStyleKey,
			prompt: promptKey,
			document: documentKey,
			background_image: backgroundImageKey,
			mcp_servers: mcpServersKey,
			padding_left: chatbotLeft / 100,
			padding_top: chatbotTop / 100,
			padding_height: chatbotHeight / 100,
			llm_type: llmTypeKey,
			tts_type: ttsTypeKey,
			stt_type: sttTypeKey
		});
		session = await PersoInteractive.createSession(
			apiServer,
			sessionId,
			width,
			height,
			selectedClientTools
		);

		session.setSrc(videoElement);

		applyChatStates(null);

		applySessionState(2);
	} catch (e) {
		alert(e);
		applySessionState(0);
		return;
	}

	refreshChatLog([]);
	removeErrorHandler = session.setErrorHandler((error) => {
		if (error instanceof PersoInteractive.LLMError) {
			if (error.underlyingError instanceof PersoInteractive.ApiError) {
				alert(error.underlyingError);
			} else if (error.underlyingError instanceof PersoInteractive.LLMStreamingResponseError) {
				alert(error.underlyingError.description);
			}
		} else if (error instanceof PersoInteractive.TTSError) {
			if (error.underlyingError instanceof PersoInteractive.ApiError) {
				alert(`TTS API Error: ${error.underlyingError}`);
			} else if (error.underlyingError instanceof PersoInteractive.TTSDecodeError) {
				alert(`TTS Decode Error: ${error.underlyingError.description}`);
			}
		}
	});
	unsubscribeChatLog = session.subscribeChatLog((chatLog) => {
		refreshChatLog(chatLog);
	});
	unsubscribeChatStates = session.subscribeChatStates((states) => {
		applyChatStates(states);
	});
	removeOnClose = session.onClose((manualClosed) => {
		if (!manualClosed) {
			setTimeout(() => {
				PersoInteractive.getSessionInfo(apiServer, session.getSessionId())
					.then((response) => {
						alert(response.termination_reason);
					})
					.catch((error) => {
						console.error(error);
					});
			}, 500);
		}

		applySessionState(0);
	});

	if (useIntro && promptOption.intro_message.trim().length > 0) {
		setTimeout(() => {
			session.processTTSTF(promptOption.intro_message);
		}, 1000);
	}
}

function stopSession() {
	session.stopSession();
}

function sendMessage() {
	var messageElement = document.getElementById('message');
	var message = messageElement.value.trim();
	if (!session || message.length === 0) {
		return;
	}

	messageElement.value = '';
	session.processChat(message);
}

function stopSpeech() {
	if (processing()) {
		session.clearBuffer();
	}
}

function available() {
	return chatStates.size === 0;
}

function processing() {
	return (
		chatStates.has(PersoInteractive.ChatState.LLM) ||
		chatStates.has(PersoInteractive.ChatState.ANALYZING) ||
		chatStates.has(PersoInteractive.ChatState.SPEAKING)
	);
}

function recording() {
	return chatStates.has(PersoInteractive.ChatState.RECORDING);
}

function refreshChatLog(chatList) {
	var chatLog = document.getElementById('chatLog');
	chatLog.innerHTML = '';
	[...chatList].reverse().forEach((chat) => {
		var bubble = document.createElement('div');
		bubble.className = chat.isUser ? 'chat-bubble user' : 'chat-bubble ai';

		var role = document.createElement('div');
		role.className = 'chat-role';
		role.textContent = chat.isUser ? 'You' : 'AI';

		var text = document.createElement('div');
		text.className = 'chat-text';
		text.textContent = chat.text;

		var time = document.createElement('div');
		time.className = 'chat-time';
		time.textContent =
			chat.timestamp instanceof Date ? chat.timestamp.toLocaleTimeString() : String(chat.timestamp);

		bubble.appendChild(role);
		bubble.appendChild(text);
		bubble.appendChild(time);
		chatLog.appendChild(bubble);
	});
	chatLog.scrollTop = chatLog.scrollHeight;
}

function applySessionState(nextState) {
	sessionState = nextState;

	var sessionButton = document.getElementById('sessionButton');

	// STT REST UI elements
	var sttRestButton = document.getElementById('sttRestButton');
	var sttRestStatus = document.getElementById('sttRestStatus');
	var sttRestResult = document.getElementById('sttRestResult');

	var featuresArea = document.getElementById('featuresArea');

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
}

function applyChatStates(nextChatStates) {
	chatStates = nextChatStates !== null ? nextChatStates : new Set();

	const chatStateDesc = document.getElementById('chatStateDescription');
	const stopSpeechButton = document.getElementById('stopSpeech');
	const voiceChatButton = document.getElementById('voice');
	const message = document.getElementById('message');
	const sendMessageBtn = document.getElementById('sendMessage');

	if (available()) {
		message.disabled = false;
		sendMessageBtn.disabled = false;

		chatStateDesc.innerText = 'Available';
		chatStateDesc.className = 'state-available';
		message.focus();
	} else {
		message.disabled = true;
		sendMessageBtn.disabled = true;

		const chatStatesTextArr = [];
		if (chatStates.has(PersoInteractive.ChatState.RECORDING)) {
			chatStatesTextArr.push('Recording');
		}
		if (chatStates.has(PersoInteractive.ChatState.LLM)) {
			chatStatesTextArr.push('LLM');
		}
		if (chatStates.has(PersoInteractive.ChatState.ANALYZING)) {
			chatStatesTextArr.push('Analyzing');
		}
		if (chatStates.has(PersoInteractive.ChatState.SPEAKING)) {
			chatStatesTextArr.push('AI Speaking');
		}
		if (chatStates.has(PersoInteractive.ChatState.TTS)) {
			chatStatesTextArr.push('TTS');
		}
		chatStateDesc.innerText = chatStatesTextArr.join(' / ');
		chatStateDesc.className = 'state-busy';
	}

	if (recording()) {
		stopSpeechButton.disabled = true;
		voiceChatButton.disabled = false;
		voiceChatButton.innerText = 'Stop Speech';
		voiceChatButton.classList.add('recording');
	} else if (processing()) {
		stopSpeechButton.disabled = false;
		voiceChatButton.disabled = true;
		voiceChatButton.innerText = 'Voice Chat';
		voiceChatButton.classList.remove('recording');
	} else {
		stopSpeechButton.disabled = true;
		voiceChatButton.disabled = false;
		voiceChatButton.innerText = 'Voice Chat';
		voiceChatButton.classList.remove('recording');
	}
}

const background = new Image();
const perso = new Image();

async function loadImage() {
	const backgroundLoader = new Promise((resolve) => {
		background.src = 'background.png';

		background.onload = function () {
			resolve();
		};
	});
	const persoLoader = new Promise((resolve) => {
		perso.src = 'perso.png';

		perso.onload = function () {
			resolve();
		};
	});

	await backgroundLoader;
	await persoLoader;
}

function redrawChatbotCanvas() {
	const chatbotCanvas = document.getElementById('chatbotCanvas');

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

	let leftRange = width - persoWidth;
	let persoLeft = leftRange * (chatbotLeft / 200 + 0.5);

	let persoTop = height * (chatbotTop / 100);

	ctx.drawImage(perso, persoLeft, persoTop, persoWidth, persoHeight);
}

window.onload = async function () {
	const toggleApiKeyBtn = document.getElementById('toggleApiKey');
	const apiKeyInput = document.getElementById('apiKey');
	const eyeIcon = document.getElementById('eyeIcon');
	toggleApiKeyBtn.addEventListener('click', () => {
		const isPassword = apiKeyInput.type === 'password';
		apiKeyInput.type = isPassword ? 'text' : 'password';
		eyeIcon.innerHTML = isPassword
			? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
			: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
	});

	const screenOrientations = document.getElementsByName('screenOrientation');
	for (let i = 0; i < screenOrientations.length; i++) {
		let node = screenOrientations[i];
		node.addEventListener('change', (e) => {
			if (e.target.checked) {
				screenOrientation = e.target.value;
				redrawChatbotCanvas();
			}
		});
	}

	screenOrientations[0].click();

	clientTools = loadChatTools();
	const clientToolsContainer = document.getElementById('clientToolsContainer');
	clientToolsContainer.innerHTML = '';
	clientTools.forEach((value, index) => {
		const label = document.createElement('label');
		label.style.width = 'fit-content';

		const input = document.createElement('input');
		input.value = index;
		input.name = 'clientTools';
		input.type = 'checkbox';

		label.appendChild(input);
		label.append(` ${value.name}`);
		clientToolsContainer.appendChild(label);
	});

	function toPaddingString(value) {
		return `${value}(${value / 100})`;
	}

	chatbotLeft = 0;
	chatbotTop = 0;
	chatbotHeight = 100;

	const chatbotLeftElement = document.getElementById('chatbotLeft');
	const chatbotLeftValueElement = document.getElementById('chatbotLeftValue');
	chatbotLeftElement.min = -100;
	chatbotLeftElement.max = 100;
	chatbotLeftElement.value = chatbotLeft;
	chatbotLeftElement.addEventListener('input', (ev) => {
		chatbotLeft = ev.target.value;
		chatbotLeftValueElement.innerHTML = toPaddingString(chatbotLeft);
		redrawChatbotCanvas();
	});

	const chatbotTopElement = document.getElementById('chatbotTop');
	const chatbotTopValueElement = document.getElementById('chatbotTopValue');
	chatbotTopElement.min = 0;
	chatbotTopElement.max = 100;
	chatbotTopElement.value = chatbotTop;
	chatbotTopElement.addEventListener('input', (ev) => {
		chatbotTop = ev.target.value;
		chatbotTopValueElement.innerHTML = toPaddingString(chatbotTop);
		redrawChatbotCanvas();
	});

	const chatbotHeightElement = document.getElementById('chatbotHeight');
	const chatbotHeightValueElement = document.getElementById('chatbotHeightValue');
	chatbotHeightElement.min = 0;
	chatbotHeightElement.max = 500;
	chatbotHeightElement.value = chatbotHeight;
	chatbotHeightElement.addEventListener('input', (ev) => {
		chatbotHeight = ev.target.value;
		chatbotHeightValueElement.innerHTML = toPaddingString(chatbotHeight);
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

	setupStfDropZone();
};

function loadChatTools() {
	const chatTool1 = new PersoInteractive.ChatTool(
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
		(arg) => {
			return { result: arg.number * arg.number };
		},
		false
	);
	const chatTool2 = new PersoInteractive.ChatTool(
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
		(arg) => {
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
	const chatTool3 = new PersoInteractive.ChatTool(
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
	const chatTool4 = new PersoInteractive.ChatTool(
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
}

window.getConfig = getConfig;
window.onSessionClicked = onSessionClicked;
window.onSendMessageClicked = onSendMessageClicked;
window.onMessageKeyPress = onMessageKeyPress;
window.onVoiceChatClicked = onVoiceChatClicked;
window.onSttRestButtonClicked = onSttRestButtonClicked;
window.onTtsMessageSubmit = onTtsMessageSubmit;
