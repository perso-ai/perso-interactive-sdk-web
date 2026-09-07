/**
 * ============================================================================
 * Example 3: STT (Speech-to-Text) — Convert Speech to Text
 * ============================================================================
 *
 * STT converts speech recorded from a microphone into text.
 * You directly control recording start/stop, and use the converted text
 * for the LLM or UI.
 *
 * Key methods:
 *   - session.startProcessSTT(timeout? | { timeout?, language? }) → Start recording
 *   - session.stopProcessSTT(language?)  → Stop recording + return text
 *   - session.isSTTRecording()           → Check if recording is in progress
 *   - session.transcribeAudio(audio, language?) → Directly convert an audio file to text
 *   - session.subscribeSttPartials(cb)   → Receive interim hypotheses (streaming)
 *   - session.subscribeSttUtterances(cb) → Receive committed utterances (end-of-turn)
 *
 * Two interaction modes, fixed when the session is created:
 *   NON_STREAMING → record the whole utterance, transcribe it on stop
 *   STREAMING     → send audio while the user speaks, interim text arrives mid-utterance
 *
 * You never choose the transport. startProcessSTT() reads the session's STT
 * type and uses the matching one, so the basic example below works for both.
 * To use streaming, pass a streaming stt_type to createSessionId() — find one
 * with getSTTs(), whose `mode` and `end_of_turn_detection` fields identify them.
 */

import {
	STTError,
	STT_ERROR_CODE,
	ChatState,
	type Session,
	type SttPartial,
	type SttUtterance
} from 'perso-interactive-sdk-web/client';

// ─────────────────────────────────────────────────────────────────────────────
// Basic Usage: Microphone Recording → Text Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records speech through the microphone and converts it to text.
 *
 * Internal behavior (NON_STREAMING session):
 *   1. startProcessSTT() → Requests browser microphone access → Starts WAV recording
 *   2. (Waits while the user speaks)
 *   3. stopProcessSTT() → Stops recording → Sends the WAV as a single request
 *      over the streaming connection → Returns text
 *
 * Recording format: 16kHz WAV (sample rate optimized for STT processing).
 * A STREAMING session instead sends PCM chunks as they are captured and returns
 * the transcript from the same stopProcessSTT() call.
 */
async function example_stt_basic(session: Session) {
	// ── 1) Start Recording ──────────────────────────────────────────────

	// When startProcessSTT() is called:
	//   - The browser requests microphone access permission (first time only)
	//   - ChatState.RECORDING is activated
	//   - Internally uses Web Audio API to record in WAV format
	await session.startProcessSTT();
	console.log('Recording... (please speak)');

	// ── 2) Check if recording is in progress (optional) ─────────────────

	const isRecording = session.isSTTRecording();
	console.log('Recording status:', isRecording); // true

	// ── 3) Stop Recording + Convert to Text ─────────────────────────────

	// language parameter: the language to recognize.
	//   'ko' = Korean, 'en' = English, 'ja' = Japanese, 'zh' = Chinese
	//   If omitted, the server default is used.
	// NON_STREAMING session: this is where the language goes (sent with the request).
	// STREAMING session: this argument is IGNORED (with a one-time console.warn) —
	//   the language is fixed at stt.start, so pass it to
	//   startProcessSTT({ language }) instead. See the streaming examples below.
	const transcribedText = await session.stopProcessSTT('en');

	if (transcribedText.trim().length > 0) {
		console.log('Recognized text:', transcribedText);
	} else {
		console.warn('No speech was recognized.');
	}

	return transcribedText;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto Timeout: Automatically stop recording after a set duration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * If you specify a timeout (ms) in startProcessSTT(), recording stops
 * automatically after that duration, and the result is parked until you call
 * stopProcessSTT():
 *   - NON_STREAMING: the recorded audio is preserved and transcribed on that call
 *   - STREAMING:     the transcript itself is preserved and returned by that call
 *
 * On NON_STREAMING, isSTTRecording() keeps returning true while the audio is
 * parked; on STREAMING it returns false once the stream has stopped, even
 * though the transcript is still waiting for stopProcessSTT().
 */
async function example_stt_autoTimeout(session: Session) {
	// Stop recording automatically after 10 seconds.
	await session.startProcessSTT(10000);
	console.log('Recording started (auto-stops after 10 s)');

	// ... Wait for user interaction ...
	// When the user presses "Stop" — before or after the 10 s mark — collect the result:

	const text = await session.stopProcessSTT('en');
	console.log('Result:', text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Access Recorded Audio File
// ─────────────────────────────────────────────────────────────────────────────

/**
 * After stopProcessSTT() on a NON_STREAMING session, the recorded WAV is
 * available as session.lastRecordedAudioFile.
 *
 * On a STREAMING session audio is sent as it is captured and never assembled
 * into a file, so the property stays null there.
 *
 * This file can be used for:
 *   - Playing the recorded audio back to the user
 *   - Passing directly to STF (avatar lip-sync)
 *   - Sending to another STT service
 */
async function example_stt_accessRecordedAudio(session: Session) {
	await session.startProcessSTT();

	// (Recording in progress)

	const text = await session.stopProcessSTT('en');

	// Access the last recorded file (null on a STREAMING session)
	const audioFile = session.lastRecordedAudioFile;
	if (audioFile) {
		console.log('Recording file name:', audioFile.name);
		console.log('Recording file size:', audioFile.size, 'bytes');
		console.log('Recording file type:', audioFile.type);

		// Play the recorded audio in the browser
		const audioUrl = URL.createObjectURL(audioFile);
		const audio = new Audio(audioUrl);
		audio.play();
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Directly Convert Audio File to Text (transcribeAudio)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Instead of recording from the microphone, transcribe an existing audio
 * file (Blob/File). Useful for processing file uploads or pre-recorded audio.
 *
 * The clip is sent as one request over the streaming connection.
 *   - NON_STREAMING sessions only: on a STREAMING session this throws a plain
 *     Error — streaming STT types have no one-shot endpoint, use
 *     startProcessSTT()/stopProcessSTT() there
 *   - The base64-encoded audio must stay under 5 MiB; larger input fails locally
 *     with an STTError whose code is 'chunk_too_large'
 *   - transcribeAudioDetailed() returns the same result as `{ text }` — no other
 *     server fields are exposed
 */
async function example_stt_transcribeAudio(session: Session) {
	// Example: Audio file selected from <input type="file">
	const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
	const file = fileInput.files?.[0];

	if (!file) {
		console.warn('No file selected.');
		return;
	}

	// transcribeAudio() accepts a Blob or File and resolves with the text.
	const text = await session.transcribeAudio(file, 'en');
	console.log('Transcribed text:', text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Errors that can occur in STT:
 *   1. Microphone access permission denied → plain Error (from getUserMedia)
 *   2. Starting again while already recording → Error('STT recording is already in progress')
 *   3. Stopping without starting → Error('STT recording has not been started')
 *   4. STT request failure → STTError (wraps an ApiError). This covers:
 *        - the STT request or streaming exchange failing (server error, terminal
 *          timeout, connection dropped mid-request)
 *        - the streaming connection failing to open — on stopProcessSTT() of a
 *          NON_STREAMING session and on startProcessSTT() of a STREAMING one
 *      All of these come from the streaming route, so `underlyingError.errorCode`
 *      is 0 (no HTTP status) and the meaningful code is `error.code` — an open
 *      string; match the STT_ERROR_CODE members you handle and log the rest
 *   5. Recorded audio over 5 MiB base64 → STTError with code 'chunk_too_large'
 *      (STT_ERROR_CODE.CHUNK_TOO_LARGE), raised locally before anything is sent
 *   6. transcribeAudio() on a STREAMING session → plain Error (streaming-only
 *      STT types have no one-shot endpoint)
 *   7. startProcessSTT() on an end-of-turn STREAMING session without
 *      subscribeSttUtterances() → plain Error (utterances would have nowhere to go)
 */
async function example_stt_errorHandling(session: Session) {
	try {
		await session.startProcessSTT();
		const text = await session.stopProcessSTT('en');
		console.log('Result:', text);
	} catch (error) {
		if (error instanceof STTError) {
			// Streaming-origin: there is no HTTP status, branch on the string code.
			switch (error.code) {
				case STT_ERROR_CODE.CANCELLED:
					// Aborted by clearBuffer() (barge-in) — not a failure.
					break;
				case STT_ERROR_CODE.CHUNK_TOO_LARGE:
					console.error('Recording too large for one request:', error.message);
					break;
				case STT_ERROR_CODE.TERMINAL_TIMEOUT:
					console.error('STT server did not answer in time:', error.message);
					break;
				default:
					// A dropped or unopened connection lands here too — error.code is
					// an open string (e.g. 'ws_closed') you can log.
					console.error(`STT error (${error.code}):`, error.message);
			}
			// underlyingError is the wrapped ApiError; its detail is the server's reason
			console.error('Detail:', error.underlyingError.detail);
		} else if (error instanceof Error) {
			if (error.message.includes('already in progress')) {
				console.error('Already recording. Call stopProcessSTT() first.');
			} else if (error.message.includes('not been started')) {
				console.error('Recording has not been started. Call startProcessSTT() first.');
			} else {
				// Microphone access permission denied, streaming-only misuse, etc.
				console.error('STT error:', error.message);
			}
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Reflect Recording State in UI via ChatState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * You can detect the recording state via subscribeChatStates() and reflect it in the UI.
 * For example, change the microphone icon color to red while in RECORDING state.
 */
function example_stt_chatStates(session: Session) {
	session.subscribeChatStates((states: Set<ChatState>) => {
		if (states.has(ChatState.RECORDING)) {
			console.log('🎙️ Recording... (change mic icon to red)');
		} else {
			console.log('🎙️ Recording idle (restore mic icon to default color)');
		}
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming: Interim Text While the User Is Still Speaking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * On a session whose STT type is STREAMING, audio is sent as it is captured
 * and the server returns hypotheses before the utterance ends.
 *
 * subscribeSttPartials is opt-in because an interim hypothesis is not a settled
 * transcript — render `text` as provisional and treat `finalText` as settled.
 * Multiple subscribers are supported; the returned function unsubscribes.
 *
 * The language is declared at start, so on a STREAMING session it MUST be
 * given to startProcessSTT({ language }); a language passed to stopProcessSTT()
 * is ignored there (with a one-time console.warn).
 *
 * On a NON_STREAMING session partials never fire and the transcript arrives only
 * from stopProcessSTT(); pass the language to stopProcessSTT(language) there.
 */
async function example_stt_streamingPartials(session: Session) {
	session.subscribeSttPartials(({ text, finalText, utteranceSeq }: SttPartial) => {
		// text = confirmed prefix + current interim guess; finalText = the
		// confirmed prefix only. utteranceSeq is set only under end-of-turn
		// detection — it ties this hypothesis to one utterance, so you can
		// update the right line instead of appending a new one.
		console.log(`interim #${utteranceSeq ?? 0}: ${text} (settled: ${finalText})`);
	});

	await session.startProcessSTT({ language: 'ko' });

	// ... user speaks; partials arrive continuously ...

	// No language here: on STREAMING it was declared at start and would be ignored.
	const finalText = await session.stopProcessSTT();
	console.log('Final:', finalText);
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming: Hands-Free Conversation (end-of-turn detection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When the STT type sets end_of_turn_detection, the provider finds utterance
 * boundaries itself. The microphone stays open for the whole conversation and
 * each utterance is delivered as it is committed — there is no per-utterance
 * stop, so the results cannot travel on a return value.
 *
 * Register the receiver BEFORE starting. Without one there is nowhere for
 * utterances to go, so startProcessSTT() rejects rather than dropping them
 * silently; registering afterwards would race the first utterance.
 *
 * The SDK does not feed results into the LLM for you — drive the pipeline
 * explicitly, exactly as you would for typed input.
 */
async function example_stt_handsFreeConversation(session: Session) {
	session.subscribeSttUtterances(async (utterance: SttUtterance) => {
		// utterance is one committed span of speech (one turn), delivered whole:
		//   seq            — utterance order, for logging or de-duping
		//   text           — the transcript
		//   normalizedText — spoken numbers/units rendered as written, e.g.
		//                    "twenty three" -> "23"; prefer it when you parse
		//   locale         — the language the server detected, e.g. 'ko-KR'
		const forLlm = utterance.normalizedText || utterance.text;
		console.log(`utterance #${utterance.seq} [${utterance.locale}]:`, utterance.text);

		for await (const chunk of session.processLLM({ message: forLlm })) {
			if (chunk.type === 'message' && chunk.finish) {
				session.processTTSTF(chunk.message);
			}
		}
	});

	// Mic stays open; utterances arrive through the subscriber above.
	await session.startProcessSTT();

	// Later, to end the conversation:
	//   await session.stopProcessSTT();
	// The return value is the concatenation of everything heard — a summary,
	// not the primary channel, since each utterance was already delivered.
}

/**
 * Echo handling, for reference.
 *
 * With an always-open microphone the avatar's own voice can be picked up and
 * transcribed as user speech. Left unchecked that is not just noise: the
 * transcript would be answered by the LLM, spoken again, and transcribed
 * again. The SDK guards against this on two levels — it requests echo
 * cancellation from the browser, and it discards a committed utterance that
 * closely matches what the avatar just spoke. Discarded utterances never reach
 * subscribeSttUtterances, so no handling is needed on your side.
 */

export {
	example_stt_basic,
	example_stt_autoTimeout,
	example_stt_accessRecordedAudio,
	example_stt_transcribeAudio,
	example_stt_errorHandling,
	example_stt_chatStates,
	example_stt_streamingPartials,
	example_stt_handsFreeConversation
};
