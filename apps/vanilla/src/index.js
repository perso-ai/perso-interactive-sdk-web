var apiServer = null;
var apiKey = null;
var session = null;
var config = null;
var screenOrientation = null;
var chatbotLeft = 0;
var chatbotTop = 0;
var chatbotHeight = 0;
var chatStates = new Set(); // enum PersoInteractive.ChatState [ RECORDING, LLM, ANALYZING, SPEAKING ], 'chatStates' can have multiple ChatState values.
var sessionState = 0; // 0: Initial state(or closed) 1: starting 2: started
var enableVoiceChat = true;
var removeOnClose = null;
var unsubscribeChatStates = null;
var unsubscribeChatLog = null;
var removeErrorHandler = null;
var removeSttResultCallback = null;

var clientTools = null;

function onSessionClicked() {
	if (this.sessionState === 0) {
		startSession();

		applySessionState(1);
	} else if (this.sessionState === 2) {
		stopSession();
	}
}

function onVoiceChatClicked() {
	var voiceChatButton = document.getElementById('voice');
	if (voiceChatButton.disabled) {
		return;
	}

	if (available()) {
		session.startVoiceChat();
	} else {
		session.stopVoiceChat();
	}
}

function onSendMessageClicked() {
	if (this.chatStates.size === 0) {
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

function onTtstfMessageSubmit() {
	var messageElement = document.getElementById('ttfMessage');
	var message = messageElement.value.trim();
	if (message.length > 0) {
		messageElement.value = '';
		session.processTTSTF(message);
	}
}

async function getConfig() {
	apiServer = document.getElementById('apiServer').value;
	apiKey = document.getElementById('apiKey').value;

	try {
		config = await PersoInteractive.getAllSettings(apiServer, apiKey);
	} catch (e) {
		alert(e);
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
	promptOptions.addEventListener('change', (ev) => {
		const introMessage = document.getElementById('introMessage');
		introMessage.innerText = config.prompts[parseInt(promptOptions.value)].intro_message;
	});

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
	config.mcpServers.forEach((value, index) => {
		const label = document.createElement('label');
		label.style = 'width: fit-content;';

		const input = document.createElement('input');
		input.value = index;
		input.name = 'mcpServers';
		input.type = 'checkbox';

		label.appendChild(input);

		label.innerHTML += value.name;
		mcpServersContainer.appendChild(label);
	});
}

async function startSession() {
	if (this.removeErrorHandler != null) {
		this.removeErrorHandler();
	}
	if (this.removeOnClose != null) {
		this.removeOnClose();
	}
	if (this.unsubscribeChatStates != null) {
		this.unsubscribeChatStates();
	}
	if (this.unsubscribeChatLog != null) {
		this.unsubscribeChatLog();
	}
	if (this.removeSttResultCallback != null) {
		this.removeSttResultCallback();
	}

	let width, height;
	if (this.screenOrientation === 'portrait') {
		width = 1080;
		height = 1920;
	} else {
		width = 1920;
		height = 1080;
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
		// ''
		backgroundImageKey = null;
	} else {
		backgroundImageKey =
			config.backgroundImages[parseInt(backgroundImageOptionIndex)].backgroundimage_id;
	}

	let documentOptionIndex = document.getElementById('documentOptions').value;
	let documentKey;
	if (documentOptionIndex.length === 0) {
		// ''
		documentKey = null;
	} else {
		documentKey = config.documents[parseInt(documentOptionIndex)].document_id;
	}

	const mcpServerCheckBoxes = document.getElementsByName('mcpServers');
	let mcpServersKey = [];
	mcpServerCheckBoxes.forEach((element, key, parent) => {
		if (element.checked) {
			const mcpKey = config.mcpServers[element.value].mcpserver_id;
			mcpServersKey.push(mcpKey);
		}
	});

	const clientToolsCheckBoxes = document.getElementsByName('clientTools');
	let selectedClientTools = [];
	clientToolsCheckBoxes.forEach((element, key, parent) => {
		if (element.checked) {
			const clientTool = clientTools[element.value];
			selectedClientTools.push(clientTool);
		}
	});

	const useIntro = document.getElementById('useIntro').checked;
	const videoElement = document.getElementById('video');

	try {
		const sessionId = await PersoInteractive.createSessionId(
			apiServer,
			apiKey,
			{
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
				stt_type: sttTypeKey,
			}
		);
		session = await PersoInteractive.createSession(
			apiServer,
			sessionId,
			width,
			height,
			enableVoiceChat,
			selectedClientTools
		);

		videoElement.classList = screenOrientation;
		session.setSrc(videoElement);

		applyChatStates(null);

		applySessionState(2);
	} catch (e) {
		alert(e);
		applySessionState(0);
		return;
	}

	refreshChatLog([]);
	this.removeErrorHandler = session.setErrorHandler((error) => {
		if (error instanceof PersoInteractive.LLMError) {
			if (error.underlyingError instanceof PersoInteractive.ApiError) {
				alert(error.underlyingError);
			} else if (error.underlyingError instanceof PersoInteractive.LLMStreamingResponseError) {
				alert(error.underlyingError.description);
			}
		}
	});
	this.unsubscribeChatLog = session.subscribeChatLog((chatLog) => {
		refreshChatLog(chatLog);
	});
	this.unsubscribeChatStates = session.subscribeChatStates((chatStates) => {
		applyChatStates(chatStates);
	});
	// this.removeSttResultCallback = session.setSttResultCallback((text) => {
	//     if (text.length > 0) {
	//         session.processChat(text);
	//     } else {
	//         alert('Your voice was not recognized.');
	//     }
	// });
	this.removeOnClose = session.onClose((manualClosed) => {
		if (!manualClosed) {
			setTimeout(() => {
				PersoInteractive.getSessionInfo(apiServer, session.getSessionId()).then((response) => {
					alert(response.termination_reason);
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
	if (message.length > 0) {
		messageElement.value = '';
		session.processChat(message);
	}
}

function stopSpeech() {
	if (processing()) {
		session.clearBuffer();
	}
}

function available() {
	// If 'chatStates' has no ChatState, it is in the Available state
	return this.chatStates.size === 0;
}

function processing() {
	// It is in a state where a response is being generated (LLM),
	// being converted into video (ANALYZING),
	// or the AI human is speaking (SPEAKING).
	return (
		this.chatStates.has(PersoInteractive.ChatState.LLM) ||
		this.chatStates.has(PersoInteractive.ChatState.ANALYZING) ||
		this.chatStates.has(PersoInteractive.ChatState.SPEAKING)
	);
}

function recording() {
	return this.chatStates.has(PersoInteractive.ChatState.RECORDING);
}

function refreshChatLog(chatList) {
	var chatLog = document.getElementById('chatLog');
	chatLog.innerHTML = '';
	chatList.forEach((chat) => {
		var li = document.createElement('li');
		if (chat.isUser) {
			li.classList = 'message-container user';
		} else {
			li.classList = 'message-container other';
		}

		var timeSpan = document.createElement('span');
		timeSpan.classList = 'timestamp';
		timeSpan.innerHTML = chat.timestamp;

		var messageDiv = document.createElement('div');
		if (chat.isUser) {
			messageDiv.classList = 'message user-message';
		} else {
			messageDiv.classList = 'message other-message';
		}
		messageDiv.innerHTML = chat.text;

		li.appendChild(timeSpan);
		li.appendChild(messageDiv);

		chatLog.appendChild(li);
	});
}

function applySessionState(sessionState) {
	this.sessionState = sessionState;

	var sessionButton = document.getElementById('sessionButton');
	switch (sessionState) {
		case 0: {
			sessionButton.disabled = false;
			sessionButton.innerText = 'START';
			break;
		}
		case 1: {
			sessionButton.disabled = true;
			break;
		}
		case 2: {
			sessionButton.disabled = false;
			sessionButton.innerText = 'STOP';
			break;
		}
	}
}

function applyChatStates(chatStates) {
	this.chatStates = chatStates !== null ? chatStates : new Set();

	const chatStateDesc = document.getElementById('chatStateDescription');
	const stopSpeechButton = document.getElementById('stopSpeech');
	const voiceChatButton = document.getElementById('voice');
	const message = document.getElementById('message');
	const sendMessage = document.getElementById('sendMessage');
	const ttfMessage = document.getElementById('ttfMessage');
	const sendTtfMessage = document.getElementById('sendTtfMessage');

	if (available()) {
		message.disabled = false;
		sendMessage.disabled = false;
		ttfMessage.disabled = false;
		sendTtfMessage.disabled = false;

		chatStateDesc.innerText = 'Available';
		message.focus();
	} else {
		message.disabled = true;
		sendMessage.disabled = true;
		ttfMessage.disabled = true;
		sendTtfMessage.disabled = true;

		const chatStatesTextArr = [];
		if (this.chatStates.has(PersoInteractive.ChatState.RECORDING)) {
			chatStatesTextArr.push('Recording');
		}
		if (this.chatStates.has(PersoInteractive.ChatState.LLM)) {
			chatStatesTextArr.push('LLM');
		}
		if (this.chatStates.has(PersoInteractive.ChatState.ANALYZING)) {
			chatStatesTextArr.push('Analyzing');
		}
		if (this.chatStates.has(PersoInteractive.ChatState.SPEAKING)) {
			chatStatesTextArr.push('AI Speaking');
		}
		chatStateDesc.innerText = chatStatesTextArr.join(' / ');
	}

	if (processing()) {
		stopSpeechButton.disabled = false;
		voiceChatButton.disabled = true;
	} else {
		stopSpeechButton.disabled = true;
		voiceChatButton.disabled = false;
	}

	if (recording()) {
		voiceChatButton.innerText = 'Stop';
	} else {
		voiceChatButton.innerText = 'Start';
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

	let width, height;
	if (screenOrientation === 'portrait') {
		width = 304;
		height = 540;
	} else {
		width = 960;
		height = 540;
	}
	chatbotCanvas.clientWidth = width;
	chatbotCanvas.clientHeight = height;
	chatbotCanvas.width = width;
	chatbotCanvas.height = height;

	const ctx = chatbotCanvas.getContext('2d');

	ctx.drawImage(background, 0, 0, width, height);

	let persoRatio = perso.width / perso.height;
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
	const enableVoiceChat = document.getElementById('enableVoiceChat');
	enableVoiceChat.addEventListener('change', (e) => {
		const voiceChatContainer = document.getElementById('inputMethodContainer2');
		this.enableVoiceChat = e.target.checked;
		if (this.enableVoiceChat) {
			voiceChatContainer.style.display = 'flex';
		} else {
			voiceChatContainer.style.display = 'none';
		}
	});

	const screenOrientations = document.getElementsByName('screenOrientation');
	for (let i = 0; i < screenOrientations.length; i++) {
		let node = screenOrientations[i];
		node.addEventListener('change', (e) => {
			if (e.target.checked) {
				this.screenOrientation = e.target.value;
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
		label.style = 'width: fit-content;';

		const input = document.createElement('input');
		input.value = index;
		input.name = 'clientTools';
		input.type = 'checkbox';

		label.appendChild(input);

		label.innerHTML += value.name;
		clientToolsContainer.appendChild(label);
	});

	function toPaddingString(value) {
		return `${value}(${value / 100})`;
	}

	this.chatbotLeft = 0;
	this.chatbotTop = 0;
	this.chatbotHeight = 100;

	const chatbotLeftElement = document.getElementById('chatbotLeft');
	const chatbotLeftValueElement = document.getElementById('chatbotLeftValue');
	chatbotLeftElement.min = -100;
	chatbotLeftElement.max = 100;
	chatbotLeftElement.value = this.chatbotLeft;
	chatbotLeftElement.addEventListener('input', (ev) => {
		this.chatbotLeft = ev.target.value;
		chatbotLeftValueElement.innerHTML = toPaddingString(this.chatbotLeft);
		redrawChatbotCanvas();
	});

	const chatbotTopElement = document.getElementById('chatbotTop');
	const chatbotTopValueElement = document.getElementById('chatbotTopValue');
	chatbotTopElement.min = 0;
	chatbotTopElement.max = 100;
	chatbotTopElement.value = this.chatbotTop;
	chatbotTopElement.addEventListener('input', (ev) => {
		this.chatbotTop = ev.target.value;
		chatbotTopValueElement.innerHTML = toPaddingString(this.chatbotTop);
		redrawChatbotCanvas();
	});

	const chatbotHeightElement = document.getElementById('chatbotHeight');
	const chatbotHeightValueElement = document.getElementById('chatbotHeightValue');
	chatbotHeightElement.min = 0;
	chatbotHeightElement.max = 500;
	chatbotHeightElement.value = this.chatbotHeight;
	chatbotHeightElement.addEventListener('input', (ev) => {
		this.chatbotHeight = ev.target.value;
		chatbotHeightValueElement.innerHTML = toPaddingString(this.chatbotHeight);
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
};

// Loading the default ClientTools.
function loadChatTools() {
	// This ClientTool tells you the square of the queried number.
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
	// This ClientTool provides the current weather of the queried city.
	// This is a sample feature that always provides the same information regardless of the city queried.
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
			return {
				temperature: '30℃',
				condition: 'Mostly clear',
				humidity: '68%',
				wind: '10.3km/h'
			};
		},
		false
	);
	// This ClientTool opens the admin dashboard.
	// This is a sample feature that logs a message when executed.
	const chatTool3 = new PersoInteractive.ChatTool(
		'show_settings',
		"Use ONLY for direct **COMMANDS** to open settings/admin screen (e.g., 'open settings', 'show admin'). MUST NOT be used for explanations or responses. Return values are machine-only JSON.",
		{
			type: 'object',
			properties: {}
		},
		(arg) => {
			console.log('show admin page');
			return { action: 'show_settings', success: true };
		},
		true
	);
	// This ClientTool opens a map.
	// This is a sample that triggers an error when executed.
	const chatTool4 = new PersoInteractive.ChatTool(
		'show_map',
		"Use ONLY for direct **COMMANDS** to open map (e.g., 'open map', 'show map'). MUST NOT be used for explanations or responses. Return values are machine-only JSON.",
		{
			type: 'object',
			properties: {}
		},
		(arg) => {
			console.log('show map');
			throw new Error('client tool4 error test');
		},
		true
	);

	return [chatTool1, chatTool2, chatTool3, chatTool4];
}
