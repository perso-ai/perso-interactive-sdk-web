/**
 * ============================================================================
 * Example 1: LLM (Large Language Model) — AI Conversation
 * ============================================================================
 *
 * LLM sends a user's text message to the AI and receives the AI's response.
 * There are two ways to use it:
 *
 * 1. processChat()  — Simple mode (automatically handles TTS + avatar lip-sync)
 * 2. processLLM()   — Manual mode (directly control streaming responses)
 */

import {
	createSession,
	ChatState,
	type Session,
	type Chat,
	type LLMStreamChunk
} from 'perso-interactive-sdk-web/client';

// ─────────────────────────────────────────────────────────────────────────────
// Common: Session Creation (used identically across all examples)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a session.
 * The sessionId must be issued from the server. (To protect the API Key)
 *
 * @param apiServerUrl - Perso API server URL (e.g., 'https://live-api.perso.ai')
 * @param sessionId    - Session ID issued from the server
 * @returns The created Session object
 */
async function initSession(apiServerUrl: string, sessionId: string): Promise<Session> {
	// Avatar video width/height resolution (based on server rendering)
	const chatbotWidth = 1080;
	const chatbotHeight = 1920;

	// clientTools: List of custom functions that the LLM can invoke (empty array in this example)
	const clientTools: [] = [];

	const session = await createSession(
		apiServerUrl,
		sessionId,
		chatbotWidth,
		chatbotHeight,
		clientTools
	);

	return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// Method 1: processChat() — Simple Mode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * processChat() is the simplest way to use the LLM.
 *
 * A single call automatically handles the following:
 *   1. Sends the user message to the LLM
 *   2. Adds the AI response to the chat log
 *   3. Makes the avatar speak the AI response as voice
 *
 * Results are received via subscribeChatLog / subscribeChatStates callbacks.
 */
async function example_processChat(session: Session) {
	// ── 1) Event Subscription: Detect AI state changes ──────────────────

	// ChatState indicates what the AI is currently doing.
	// Empty Set = idle state (Available), having values means processing
	const unsubscribeChatStates = session.subscribeChatStates((states: Set<ChatState>) => {
		if (states.size === 0) {
			console.log('Status: Idle (ready for input)');
		}
		if (states.has(ChatState.LLM)) {
			console.log('Status: AI is generating a response...');
		}
		if (states.has(ChatState.ANALYZING)) {
			console.log('Status: Generating speech...');
		}
		if (states.has(ChatState.SPEAKING)) {
			console.log('Status: Avatar is speaking...');
		}
	});

	// ── 2) Event Subscription: Detect chat log (conversation history) ───

	// The entire chat log is passed whenever a new message is added.
	// The most recent message is at the first index (index 0).
	const unsubscribeChatLog = session.subscribeChatLog((chatLog: Array<Chat>) => {
		const latestMessage = chatLog[0];
		if (latestMessage.isUser) {
			console.log(`[Me] ${latestMessage.text}`);
		} else {
			console.log(`[AI] ${latestMessage.text}`);
		}
	});

	// ── 3) Send Message ─────────────────────────────────────────────────

	// Calling processChat() automatically:
	// - Adds the user message to the chat log
	// - Calls the LLM API (ChatState.LLM activated)
	// - Adds the AI response to the chat log
	// - Makes the avatar read the AI response aloud (ChatState.ANALYZING → ChatState.SPEAKING)
	session.processChat('Hello, how is the weather today?');

	// ── 4) Cleanup: Unsubscribe when you no longer need events ──────────

	// Call when the component unmounts or is no longer needed.
	// unsubscribeChatStates();
	// unsubscribeChatLog();
}

// ─────────────────────────────────────────────────────────────────────────────
// Method 2: processLLM() — Manual Mode (Streaming)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * processLLM() lets you receive LLM responses via real-time streaming
 * and control them directly.
 *
 * Unlike processChat():
 *   - Responses are NOT automatically added to the chat log (you must manage it yourself)
 *   - Avatar speech is NOT automatically triggered
 *   - Instead, you can receive responses in real-time chunk by chunk
 *   - You can also handle Tool Call (function invocation) events directly
 *
 * This approach is suitable for:
 *   - Displaying LLM responses on screen with a real-time typing effect
 *   - Controlling TTS or STF separately after the LLM response
 *   - Custom handling of Tool Call results
 */
async function example_processLLM(session: Session) {
	const userMessage = 'What is the capital of South Korea?';

	// ── 1) Start LLM Streaming ──────────────────────────────────────────

	// processLLM() returns an AsyncGenerator.
	// You can receive real-time chunks using a for-await-of loop.
	const llmGenerator = session.processLLM({ message: userMessage });

	let fullResponse = '';

	for await (const chunk of llmGenerator) {
		switch (chunk.type) {
			// ── 'message' type: AI response text ────────────────────────

			case 'message':
				// chunk.chunks: Array of newly arrived text fragments
				// chunk.message: Full accumulated response text so far
				// chunk.finish: Whether the response is complete (true = last chunk)

				// Use chunk.chunks for implementing a real-time typing effect
				for (const text of chunk.chunks) {
					console.log(text); // Gives the feel of character-by-character output
				}

				if (chunk.finish) {
					// Response complete! Get the full text.
					fullResponse = chunk.message;
					console.log('\n--- Response Complete ---');
					console.log('Full response:', fullResponse);
				}
				break;

			// ── 'tool_call' type: AI requests a function call ───────────

			case 'tool_call':
				// Occurs when the AI wants to use a registered tool (ChatTool).
				// In processLLM(), tool calls are NOT automatically executed,
				// so you must handle them manually. (processChat() handles them automatically)
				console.log('Tool Call request:', chunk.tool_calls);
				break;

			// ── 'tool_result' type: Tool execution result ───────────────

			case 'tool_result':
				console.log('Tool result:', chunk.tool_call_id, chunk.result);
				break;

			// ── 'error' type: Error occurred ────────────────────────────

			case 'error':
				console.error('LLM error occurred:', chunk.error);
				break;
		}
	}

	// ── 2) Use the Response ─────────────────────────────────────────────

	// Use fullResponse freely — pass it to TTS, display on screen, etc.
	// e.g., session.processTTS(fullResponse)  → Convert to speech
	// e.g., session.processSTF(audioBlob, 'wav', fullResponse)  → Avatar lip-sync

	return fullResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// Method 2-1: processLLM() — Cancel midway with AbortController
// ─────────────────────────────────────────────────────────────────────────────

/**
 * processLLM() supports AbortSignal, allowing you to cancel response generation midway.
 * For example, use this when the user presses a "Cancel" button.
 */
async function example_processLLM_withCancel(session: Session) {
	const controller = new AbortController();

	// Auto-cancel after 5 seconds (example)
	setTimeout(() => {
		controller.abort();
		console.log('LLM response generation has been cancelled.');
	}, 5000);

	const llmGenerator = session.processLLM({
		message: 'Tell me a long story.',
		signal: controller.signal // Pass AbortSignal
	});

	for await (const chunk of llmGenerator) {
		if (chunk.type === 'message') {
			console.log(chunk.chunks.join(''));
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus: Check Conversation History
// ─────────────────────────────────────────────────────────────────────────────

/**
 * You can retrieve the conversation history sent to the LLM using getMessageHistory().
 * When using processChat(), the history is automatically managed.
 */
function example_messageHistory(session: Session) {
	const history = session.getMessageHistory();
	console.log('Current conversation history:', history);
	// [
	//   { role: 'user', content: 'Hello' },
	//   { role: 'assistant', type: 'message', content: 'Hello! How can I help you?' },
	//   ...
	// ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports (for IDE reference)
// ─────────────────────────────────────────────────────────────────────────────

export {
	initSession,
	example_processChat,
	example_processLLM,
	example_processLLM_withCancel,
	example_messageHistory
};
