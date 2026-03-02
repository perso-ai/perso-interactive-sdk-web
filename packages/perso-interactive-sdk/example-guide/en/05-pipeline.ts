/**
 * ============================================================================
 * Example 5: API Integration — Compose APIs for Complete Conversation Flows
 * ============================================================================
 *
 * By combining individual APIs (LLM, TTS, STT, STF), you can implement
 * various conversation scenarios. This example covers the following
 * integration patterns:
 *
 * 1. Voice Chat (STT → LLM → TTS → STF): User speech → AI response → Avatar speaks
 * 2. Text Chat + Avatar Speech (LLM → TTS → STF): Text input → AI response → Avatar speaks
 * 3. processChat Simple Mode: Execute the entire pipeline in one line
 * 4. Intro Message: Avatar greets when session starts
 */

import {
	createSession,
	ChatState,
	ChatTool,
	type Session,
	type Chat,
	type LLMStreamChunk
} from 'perso-interactive-sdk-web/client';

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 1: Voice Chat (STT → LLM → TTS → STF)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The most complete voice conversation pipeline.
 *
 * Flow:
 *   [Mic Recording] → STT(Text Conversion) → LLM(AI Response) → TTS(Speech Generation) → STF(Avatar Lip-sync)
 *
 * Since each step is manually controlled, you can process intermediate
 * results or skip specific steps.
 */
async function example_voiceChat_fullPipeline(session: Session) {
	// ── Step 1: STT — Convert user speech to text ───────────────────────

	await session.startProcessSTT(); // Start recording
	console.log('Recording... please speak.');

	// When the user finishes speaking (triggered by button click, etc.)
	const userText = await session.stopProcessSTT('en');

	if (userText.trim().length === 0) {
		console.warn('No speech was recognized.');
		return;
	}
	console.log('[User]', userText);

	// ── Step 2: LLM — Ask the AI and receive a response ────────────────

	const llmGenerator = session.processLLM({ message: userText });
	let aiResponse = '';

	for await (const chunk of llmGenerator) {
		if (chunk.type === 'message' && chunk.finish) {
			aiResponse = chunk.message;
		} else if (chunk.type === 'error') {
			console.error('LLM error:', chunk.error);
			return;
		}
	}

	if (aiResponse.trim().length === 0) {
		console.warn('AI returned an empty response.');
		return;
	}
	console.log('[AI]', aiResponse);

	// ── Step 3: TTS — Convert AI response to speech ────────────────────

	const audioBlob = await session.processTTS(aiResponse);

	if (!audioBlob) {
		console.warn('TTS conversion failed.');
		return;
	}

	// ── Step 4: STF — Avatar lip-sync with the speech ──────────────────

	// Passing audioBlob to STF makes the avatar move its mouth in sync with the audio.
	// The third parameter (message) is the text to display in the chat log.
	await session.processSTF(audioBlob, 'wav', aiResponse);

	console.log('Voice chat pipeline complete!');
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 2: Text Chat + Avatar Speech (LLM → TTS → STF)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Receives text input, AI responds, and the avatar reads it aloud.
 *
 * Flow:
 *   [Text Input] → LLM(AI Response) → TTS(Speech Generation) → STF(Avatar Lip-sync)
 *
 * Simpler than voice chat since there's no STT step.
 */
async function example_textChat_withAvatar(session: Session, userMessage: string) {
	// Generate AI response with LLM
	const llmGenerator = session.processLLM({ message: userMessage });
	let aiResponse = '';

	for await (const chunk of llmGenerator) {
		if (chunk.type === 'message' && chunk.finish) {
			aiResponse = chunk.message;
		} else if (chunk.type === 'error') {
			console.error('LLM error:', chunk.error);
			return;
		}
	}

	if (aiResponse.trim().length === 0) return;

	// Convert to speech with TTS
	const audioBlob = await session.processTTS(aiResponse);
	if (!audioBlob) return;

	// Avatar lip-sync with STF
	await session.processSTF(audioBlob, 'wav', aiResponse);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 3: processChat — Execute entire pipeline in one line (Simple Mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * processChat() automatically performs LLM call + avatar speech.
 *
 * Produces nearly the same result as "Pattern 2" above,
 * but also automatically handles chat log management and conversation history.
 *
 * Differences:
 *   processChat()           — LLM + avatar speech automatic, history auto-managed
 *   processLLM() + TTS/STF  — Manual control of each step, intermediate processing possible
 */
async function example_processChat_pipeline(session: Session) {
	// Receive results via event subscriptions
	session.subscribeChatLog((chatLog: Array<Chat>) => {
		const latest = chatLog[0];
		console.log(`[${latest.isUser ? 'Me' : 'AI'}] ${latest.text}`);
	});

	session.subscribeChatStates((states: Set<ChatState>) => {
		if (states.size === 0) console.log('✅ Idle');
		if (states.has(ChatState.LLM)) console.log('🤖 Generating AI response...');
		if (states.has(ChatState.ANALYZING)) console.log('🎬 Generating lip-sync...');
		if (states.has(ChatState.SPEAKING)) console.log('🗣️ Avatar is speaking...');
	});

	// Execute the entire pipeline in one line!
	session.processChat('How is the weather in Seoul today?');
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 4: Intro Message — Avatar greeting when session starts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sets the avatar to greet right after the session is created.
 * Use processChat() for LLM response + avatar speech in one go,
 * or construct a TTS → STF pipeline directly to have the avatar speak
 * a pre-prepared text.
 *
 * You can use an introMessage issued from the server,
 * or specify a custom greeting.
 */
async function example_introMessage(apiServerUrl: string, sessionId: string, introMessage: string) {
	const session = await createSession(apiServerUrl, sessionId, 1080, 1920, []);

	// Connect avatar video to the video element
	const videoElement = document.querySelector('video') as HTMLVideoElement;
	session.setSrc(videoElement);

	// Wait briefly for session connection to stabilize, then play the greeting
	if (introMessage && introMessage.length > 0) {
		setTimeout(async () => {
			const audioBlob = await session.processTTS(introMessage);
			if (audioBlob) {
				await session.processSTF(audioBlob, 'wav', introMessage);
			}
		}, 1000);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 5: STT → processChat (Voice Input → Auto Pipeline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * After converting speech to text with STT, passing it to processChat()
 * automatically handles LLM call → avatar speech.
 *
 * This is the most concise voice conversation implementation.
 */
async function example_stt_to_processChat(session: Session) {
	// Start recording
	await session.startProcessSTT();

	// (When the user finishes speaking)
	const text = await session.stopProcessSTT('en');

	if (text.trim().length > 0) {
		// processChat() automatically handles LLM → avatar speech.
		session.processChat(text);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 6: Conversation Pipeline with Tool Calling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * By registering ChatTools, the AI can invoke specific functions during conversation.
 *
 * Example: "What's the weather in Seoul?" → AI calls get_weather tool → Responds with the result
 *
 * Using processChat() automatically handles Tool Call execution + follow-up LLM calls.
 */
async function example_pipeline_withTools(apiServerUrl: string, sessionId: string) {
	// ── 1) Define Tools ─────────────────────────────────────────────────

	const weatherTool = new ChatTool(
		'get_weather', // Tool name (identifier used when AI invokes it)
		'Gets the current weather for a given city', // Tool description (criteria for AI to decide when to use it)
		{
			// Parameter schema (JSON Schema format)
			type: 'object',
			properties: {
				city: {
					type: 'string',
					description: 'City name (e.g., Seoul, Tokyo)',
					examples: ['Seoul', 'Tokyo', 'New York']
				}
			},
			required: ['city']
		},
		// Tool execution function (this function runs when the AI invokes it)
		async (args: { city: string }) => {
			// In practice, you would call a weather API
			return {
				city: args.city,
				temperature: '22°C',
				condition: 'Sunny'
			};
		},
		false // executeOnly: false = AI generates a follow-up response including the result
	);

	// executeOnly parameter explanation:
	//   false (default): AI receives the tool result and responds in natural language.
	//     e.g., "The current temperature in Seoul is 22°C and it's sunny."
	//
	//   true: Only executes the tool without a follow-up AI response.
	//     e.g., Use for triggering UI actions like "Open settings screen".

	// ── 2) Create session with tools ────────────────────────────────────

	const session = await createSession(apiServerUrl, sessionId, 1080, 1920, [weatherTool]);

	// ── 3) Start conversation ───────────────────────────────────────────

	// processChat() automatically:
	//   1. Sends the message to the LLM
	//   2. AI decides to call the get_weather tool
	//   3. Executes the tool (the function defined above)
	//   4. Makes a follow-up LLM call including the result
	//   5. Avatar reads the final response aloud
	session.processChat("What's the weather like in Seoul?");
}

// ─────────────────────────────────────────────────────────────────────────────
// Full Session Lifecycle (Init → Conversation → Teardown)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A comprehensive example showing the complete session lifecycle.
 *
 * 1. Session creation + event subscriptions
 * 2. Video binding
 * 3. Intro message
 * 4. Conversation
 * 5. Session teardown + cleanup
 */
async function example_fullLifecycle(
	apiServerUrl: string,
	sessionId: string,
	introMessage: string
) {
	// ── 1) Create Session ───────────────────────────────────────────────

	const session = await createSession(apiServerUrl, sessionId, 1080, 1920, []);

	// ── 2) Subscribe to Events ──────────────────────────────────────────

	const unsubscribes: Array<() => void> = [];

	// Subscribe to chat log
	unsubscribes.push(
		session.subscribeChatLog((chatLog: Array<Chat>) => {
			console.log('Chat log updated:', chatLog.length, 'messages');
		})
	);

	// Subscribe to state changes
	unsubscribes.push(
		session.subscribeChatStates((states: Set<ChatState>) => {
			console.log('Current state:', states.size === 0 ? 'Idle' : [...states].join(', '));
		})
	);

	// Error handler
	unsubscribes.push(
		session.setErrorHandler((error: Error) => {
			console.error('SDK error:', error);
		})
	);

	// Detect session close
	unsubscribes.push(
		session.onClose((manualClosed: boolean) => {
			if (manualClosed) {
				console.log('User closed the session.');
			} else {
				console.log('Session was closed by the server.');
			}

			// Unsubscribe all
			unsubscribes.forEach((fn) => fn());
		})
	);

	// ── 3) Video Binding ────────────────────────────────────────────────

	const videoElement = document.querySelector('video') as HTMLVideoElement;
	session.setSrc(videoElement);

	// ── 4) Intro Message ────────────────────────────────────────────────

	if (introMessage && introMessage.length > 0) {
		setTimeout(async () => {
			const audioBlob = await session.processTTS(introMessage);
			if (audioBlob) {
				await session.processSTF(audioBlob, 'wav', introMessage);
			}
		}, 1000);
	}

	// ── 5) Conversation (called based on user interaction) ──────────────

	// Text chat
	// session.processChat('Hello!');

	// Voice chat
	// await session.startProcessSTT();
	// const text = await session.stopProcessSTT('en');
	// session.processChat(text);

	// ── 6) End Session ──────────────────────────────────────────────────

	// When the user clicks the "End" button:
	// session.stopSession();

	return session;
}

export {
	example_voiceChat_fullPipeline,
	example_textChat_withAvatar,
	example_processChat_pipeline,
	example_introMessage,
	example_stt_to_processChat,
	example_pipeline_withTools,
	example_fullLifecycle
};
