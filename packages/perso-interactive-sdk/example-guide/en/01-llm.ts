/**
 * ============================================================================
 * Example 1: LLM (Large Language Model) — AI Conversation
 * ============================================================================
 *
 * LLM sends a user's text message to the AI and receives the AI's response.
 * There are two ways to use it:
 *
 * 1. processLLM()   — Recommended. Streams the response chunk by chunk and leaves
 *                     TTS / avatar playback under your control
 * 2. processChat()  — Legacy (DEPRECATED). One call that also speaks the response
 *                     through the avatar; kept for existing callers only
 */

import {
	createSession,
	ChatState,
	LLMError,
	type ChatTool,
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
 * @param apiServerUrl - Perso API server URL (e.g., 'https://platform.perso.ai')
 * @param sessionId    - Session ID issued from the server
 * @returns The created Session object
 */
async function initSession(apiServerUrl: string, sessionId: string): Promise<Session> {
	// Avatar video width/height resolution (based on server rendering)
	const chatbotWidth = 1080;
	const chatbotHeight = 1920;

	// clientTools: List of custom functions that the LLM can invoke (empty array in this example)
	const clientTools: ChatTool[] = [];

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
// Method 1: processLLM() — Streaming Mode (Recommended)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * processLLM() delivers the LLM response as a real-time stream and leaves the
 * follow-up steps to you.
 *
 * What it does and does not do:
 *   - Responses are NOT added to the chat log (subscribeChatLog) — render them yourself
 *   - Avatar speech is NOT triggered — call processTTS()/processSTF() or processTTSTF()
 *   - Tool calls (ChatTool) ARE executed automatically; tool_call / tool_result
 *     chunks are yielded so you can observe them (see below)
 *   - ChatState.LLM is active while the stream runs
 *
 * This approach is suitable for:
 *   - Displaying LLM responses on screen with a real-time typing effect
 *   - Controlling TTS or STF separately after the LLM response
 *   - Observing tool calls and their results as they happen
 */
async function example_processLLM(session: Session) {
	const userMessage = 'What is the capital of South Korea?';

	// ── 1) Start LLM Streaming ──────────────────────────────────────────

	// processLLM() returns an AsyncGenerator.
	// You can receive real-time chunks using a for-await-of loop.
	const llmGenerator = session.processLLM({ message: userMessage });

	let fullResponse = '';
	// Number of text fragments already rendered (see the 'message' case).
	let renderedFragments = 0;

	for await (const chunk of llmGenerator) {
		switch (chunk.type) {
			// ── 'message' type: AI response text ────────────────────────

			case 'message':
				// chunk.chunks:  CUMULATIVE list of every text fragment received so
				//                far in this turn — NOT just the newly arrived ones
				// chunk.message: Full accumulated response text so far
				// chunk.finish:  Whether the response is complete (true = last chunk)

				// For a typing effect, render only the fragments you have not shown yet.
				// Iterating over the whole chunk.chunks array would re-print everything
				// on every chunk. The final finish:true chunk repeats the same array, so
				// it normally adds nothing new here.
				for (const text of chunk.chunks.slice(renderedFragments)) {
					console.log(text);
				}
				renderedFragments = chunk.chunks.length;
				// Alternatively, simply replace the displayed text with chunk.message.

				if (chunk.finish) {
					// Response complete! Get the full text.
					fullResponse = chunk.message;
					console.log('\n--- Response Complete ---');
					console.log('Full response:', fullResponse);
				}
				break;

			// ── 'tool_call' type: AI requested a function call ──────────

			case 'tool_call':
				// The AI asked for one or more registered tools (ChatTool).
				// processLLM() runs them for you: the matching tools are invoked, and when
				// a result has to go back to the LLM a follow-up round is sent
				// automatically (up to 10 rounds). Tools marked `executeOnly` end the turn
				// without one. This chunk is for observability only — do NOT execute the
				// tools yourself, or they run twice.
				// Server-injected (RAG) tool calls are surfaced here as well, but they
				// are already resolved server-side and nothing runs on the client.
				console.log('Tool call requested:', chunk.tool_calls);
				break;

			// ── 'tool_result' type: Tool execution result ───────────────

			case 'tool_result':
				// Result of a tool processLLM() just executed — observability only.
				console.log('Tool result:', chunk.tool_call_id, chunk.result);
				break;

			// ── 'error' type: Error occurred ────────────────────────────

			case 'error':
				// The generator ends after an error chunk — nothing follows it.
				// chunk.error is an LLMError when:
				//   - the streaming connection could not be opened: error.code carries the
				//     socket code (e.g. 'ws_session_not_found') and
				//     error.underlyingError.errorCode is 0 (no HTTP status)
				//   - the server sent llm.error, or the stream broke mid-response
				//   - tool follow-up rounds exceeded the limit (10)
				if (chunk.error instanceof LLMError) {
					console.error('LLM error:', chunk.error.code, chunk.error.underlyingError);
				} else {
					console.error('LLM error occurred:', chunk.error);
				}
				break;
		}
	}

	// ── 2) Use the Response ─────────────────────────────────────────────

	// Use fullResponse freely — pass it to TTS, display on screen, etc.
	// e.g., session.processTTS(fullResponse)  → Convert to speech
	// e.g., session.processSTF(audioBlob, undefined, fullResponse)  → Avatar lip-sync
	//       (the 2nd argument is a legacy format hint and is ignored — pass undefined)

	return fullResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// Method 1-1: processLLM() — Cancel midway with AbortController
// ─────────────────────────────────────────────────────────────────────────────

/**
 * processLLM() accepts an AbortSignal so response generation can be cancelled
 * midway — for example when the user presses a "Cancel" button.
 *
 * Cancellation is graceful:
 *   - No AbortError is thrown; the for-await loop simply ends
 *   - One last 'message' chunk with finish: true and the partial text received
 *     so far may still be yielded before the loop ends
 *   - The partial turn is NOT committed to the history returned by
 *     getMessageHistory(), so the next processLLM() call is not polluted by
 *     truncated assistant text
 *
 * Note: session.clearBuffer() does NOT cancel a processLLM() stream you are
 * driving yourself — it only cancels the legacy processChat() job. Use the
 * AbortSignal.
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
		if (chunk.type === 'message' && chunk.finish) {
			// After an abort this is the partial text received so far.
			const label = controller.signal.aborted ? 'Partial response:' : 'Full response:';
			console.log(label, chunk.message);
		}
	}

	// Reached both on completion and on cancellation — no exception either way.
	console.log('LLM stream ended.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Method 2: processChat() — Legacy Simple Mode (DEPRECATED)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated processChat() is deprecated. Use processLLM() -> processTTS() ->
 * processSTF() instead (Method 1). processChat() predates the step-controlled
 * pipeline and exposes nothing between the steps: the LLM response cannot be
 * read before it is spoken, your own audio cannot be substituted, and playback
 * cannot start on the first TTS chunk. Its behavior is unchanged for existing
 * callers, and this example is kept for them.
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

	// Calling processChat() (deprecated) automatically:
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
// Bonus: Check Conversation History
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getMessageHistory() returns the conversation history that processLLM() sends
 * as context: the user messages, assistant replies, tool calls and tool results
 * of every COMPLETED processLLM() turn (an aborted turn is not recorded).
 *
 * It reflects processLLM() turns only. Messages handled by the legacy
 * processChat() or by processTTSTF() go to a separate, internal history: they
 * are neither visible here nor used as context for processLLM().
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
	example_processLLM,
	example_processLLM_withCancel,
	example_processChat,
	example_messageHistory
};
