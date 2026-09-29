/**
 * ============================================================================
 * Example 3: STT (Speech-to-Text) — Convert Speech to Text
 * ============================================================================
 *
 * STT converts speech recorded from a microphone into text.
 * Two modes exist, fixed when the session is created:
 *
 *   NON_STREAMING — record the whole utterance, transcribe it on stop
 *     startProcessSTT() -> stopProcessSTT() -> returns text
 *
 *   STREAMING — audio sent while the user speaks; interim text arrives mid-utterance
 *     startRealtimeSTT() -> for-await loop -> partial / utterance / finished events
 *
 * startProcessSTT() rejects with STTError code: 'mode_unsupported' on a STREAMING
 * session before the mic opens. startRealtimeSTT() returns the stream synchronously
 * on any session; on a NON_STREAMING session the loop throws STTError
 * code: 'mode_unsupported' before the mic opens.
 *
 * Key methods:
 *   NON_STREAMING:
 *     session.startProcessSTT(timeout? | { timeout?, language? }) -> start recording
 *     session.stopProcessSTT(language?)                           -> stop + return text
 *
 *   STREAMING:
 *     session.startRealtimeSTT({ language? })                     -> RealtimeSttStream
 *       stt.stop()                                                -> end the cycle
 *       for await (const event of stt) { ... }                   -> read events
 *
 *   Both:
 *     session.isSTTRecording()                                    -> check state
 *     session.transcribeAudio(audio, language?)                   -> file -> text (NON_STREAMING only)
 */

import {
	STTError,
	STT_ERROR_CODE,
	ChatState,
	type Session
} from 'perso-interactive-sdk-web/client';

// ─────────────────────────────────────────────────────────────────────────────
// NON_STREAMING: Basic Usage — Microphone Recording -> Text
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records speech through the microphone and converts it to text.
 *
 * Internal behavior:
 *   1. startProcessSTT() -> requests browser microphone access -> starts WAV recording
 *   2. (Waits while the user speaks)
 *   3. stopProcessSTT() -> stops recording -> sends the WAV over the session WebSocket
 *      -> returns text
 *
 * Recording format: 16 kHz WAV (optimized for STT).
 */
async function example_stt_basic(session: Session) {
	// ── 1) Start Recording ──────────────────────────────────────────────

	// startProcessSTT() requests microphone access (first time only),
	// activates ChatState.RECORDING, and starts WAV recording internally.
	await session.startProcessSTT();
	console.log('Recording... (please speak)');

	// ── 2) Check if recording is in progress (optional) ─────────────────

	const isRecording = session.isSTTRecording();
	console.log('Recording status:', isRecording); // true

	// ── 3) Stop Recording + Convert to Text ─────────────────────────────

	// language: the recognition language ('ko', 'en', 'ja', 'zh', ...).
	// Omit to use the default given to startProcessSTT(), or the server default.
	const transcribedText = await session.stopProcessSTT('en');

	if (transcribedText.trim().length > 0) {
		console.log('Recognized text:', transcribedText);
	} else {
		console.warn('No speech was recognized.');
	}

	return transcribedText;
}

// ─────────────────────────────────────────────────────────────────────────────
// NON_STREAMING: Auto Timeout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * If you specify a timeout (ms) in startProcessSTT(), recording stops
 * automatically after that duration. The recorded audio is preserved until
 * stopProcessSTT() is called, which sends it for transcription.
 *
 * isSTTRecording() stays true while the parked audio is waiting.
 */
async function example_stt_autoTimeout(session: Session) {
	// Stop recording automatically after 10 seconds.
	await session.startProcessSTT(10000);
	console.log('Recording started (auto-stops after 10 s)');

	// When the user presses "Stop" — before or after the 10 s mark:
	const text = await session.stopProcessSTT('en');
	console.log('Result:', text);
}

// ─────────────────────────────────────────────────────────────────────────────
// NON_STREAMING: Access Recorded Audio File
// ─────────────────────────────────────────────────────────────────────────────

/**
 * After stopProcessSTT() on a NON_STREAMING session, the recorded WAV is
 * available as session.lastRecordedAudioFile.
 *
 * On a STREAMING session audio is sent as it is captured and never assembled
 * into a file, so the property stays null there.
 */
async function example_stt_accessRecordedAudio(session: Session) {
	await session.startProcessSTT();

	const text = await session.stopProcessSTT('en');

	// Access the last recorded file (null on a STREAMING session)
	const audioFile = session.lastRecordedAudioFile;
	if (audioFile) {
		console.log('Recording file name:', audioFile.name);
		console.log('Recording file size:', audioFile.size, 'bytes');

		// Play the recorded audio in the browser
		const audioUrl = URL.createObjectURL(audioFile);
		const audio = new Audio(audioUrl);
		audio.play();
	}

	return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// NON_STREAMING: Transcribe an Existing Audio File
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Instead of recording from the microphone, transcribe an existing audio
 * file (Blob/File). Useful for processing file uploads or pre-recorded audio.
 *
 * NON_STREAMING sessions only: on a STREAMING session this throws a plain
 * Error — streaming STT types have no one-shot endpoint; use startRealtimeSTT()
 * there. The base64-encoded audio must stay under 5 MiB.
 */
async function example_stt_transcribeAudio(session: Session) {
	const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
	const file = fileInput.files?.[0];

	if (!file) {
		console.warn('No file selected.');
		return;
	}

	const text = await session.transcribeAudio(file, 'en');
	console.log('Transcribed text:', text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling (NON_STREAMING)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Errors that can occur in startProcessSTT / stopProcessSTT:
 *   1. STTError code: 'mode_unsupported' if the session is STREAMING
 *      -> use startRealtimeSTT() instead
 *   2. Microphone access denied -> plain Error from getUserMedia
 *   3. Starting again while already recording -> Error('STT recording is already in progress')
 *   4. Stopping without starting -> Error('STT recording has not been started')
 *   5. STT request failure -> STTError (wraps ApiError)
 *   6. Recorded audio over 5 MiB -> STTError code: 'chunk_too_large'
 */
async function example_stt_errorHandling(session: Session) {
	try {
		await session.startProcessSTT();
		const text = await session.stopProcessSTT('en');
		console.log('Result:', text);
	} catch (error) {
		if (error instanceof STTError) {
			switch (error.code) {
				case STT_ERROR_CODE.MODE_UNSUPPORTED:
					// Session is STREAMING; use startRealtimeSTT() instead.
					console.error('Use startRealtimeSTT() for a STREAMING session.');
					break;
				case STT_ERROR_CODE.CANCELLED:
					// Server-side cancellation — not a failure.
					break;
				case STT_ERROR_CODE.CHUNK_TOO_LARGE:
					console.error('Recording too large for one request:', error.message);
					break;
				case STT_ERROR_CODE.TERMINAL_TIMEOUT:
					console.error('STT server did not answer in time:', error.message);
					break;
				default:
					console.error(`STT error (${error.code}):`, error.message);
			}
		} else if (error instanceof Error) {
			if (error.message.includes('already in progress')) {
				console.error('Already recording. Call stopProcessSTT() first.');
			} else if (error.message.includes('not been started')) {
				console.error('Recording has not been started. Call startProcessSTT() first.');
			} else {
				console.error('STT error:', error.message);
			}
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Reflect Recording State in UI via ChatState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ChatState.RECORDING is active for both startProcessSTT() and startRealtimeSTT().
 */
function example_stt_chatStates(session: Session) {
	session.subscribeChatStates((states: Set<ChatState>) => {
		if (states.has(ChatState.RECORDING)) {
			console.log('Recording... (change mic icon to red)');
		} else {
			console.log('Recording idle (restore mic icon to default color)');
		}
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING: Push-to-Talk with Interim Text (startRealtimeSTT)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * On a STREAMING session, startRealtimeSTT() opens a mic-to-server stream and
 * returns a RealtimeSttStream you iterate with for await. The loop yields:
 *
 *   { type: 'started' }                              -- mic is open
 *   { type: 'partial', text, finalText, utteranceSeq } -- in-progress hypothesis
 *   { type: 'utterance', seq, text, normalizedText, language } -- committed span
 *   { type: 'finished', utteranceCount }             -- cycle is over
 *
 * Call stt.stop() to end the cycle at any time; breaking out of the loop does
 * the same. Without end_of_turn_detection, one utterance arrives after stop().
 *
 * Protocol failures (server error, non-STREAMING session) are thrown from the
 * loop as STTError. A microphone denial surfaces as the browser's own error
 * (e.g. NotAllowedError), not STTError; catch both types around the loop.
 */
async function example_stt_realtimePushToTalk(session: Session) {
	const button = document.querySelector('button')!;

	const stt = session.startRealtimeSTT({ language: 'ko' });
	button.onpointerup = () => stt.stop();

	let finalText = '';
	try {
		for await (const event of stt) {
			if (event.type === 'partial') {
				// text = confirmed prefix + current hypothesis; finalText = settled prefix only
				console.log(`interim #${event.utteranceSeq ?? 0}: ${event.text}`);
			}
			if (event.type === 'utterance') {
				finalText += event.text;
			}
		}
	} catch (error) {
		console.error('STT failed', error);
	}
	// Past the loop: 'finished' arrived and the cycle is over.
	console.log('Final transcript:', finalText);
	return finalText;
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING: Hands-Free Conversation (end_of_turn_detection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When the STT type sets end_of_turn_detection, the provider finds utterance
 * boundaries itself. The microphone stays open for the whole conversation and
 * each utterance is delivered as a committed 'utterance' event — there is no
 * per-utterance stop button.
 *
 * Drive the LLM pipeline from inside the loop. The SDK does not feed results
 * into the LLM for you.
 *
 * Echo handling: with an always-open microphone the avatar's own voice can be
 * picked up and transcribed as user speech. The SDK guards against this on two
 * levels — it requests echo cancellation from the browser, and it discards a
 * committed utterance that closely matches what the avatar just spoke. Discarded
 * utterances never reach the for-await loop, so no handling is needed on your side.
 */
async function example_stt_handsFreeConversation(session: Session) {
	const endButton = document.querySelector('button')!;

	let avatarIsSpeaking = false;
	session.subscribeChatStates((states) => {
		avatarIsSpeaking = states.has(ChatState.SPEAKING);
	});

	const stt = session.startRealtimeSTT({ language: 'ko' });
	endButton.onclick = () => stt.stop();

	for await (const event of stt) {
		if (event.type === 'partial' && avatarIsSpeaking) {
			await session.clearBuffer(); // barge-in; the cycle keeps listening
		}
		if (event.type === 'utterance') {
			// utterance.normalizedText has spoken numbers/units written out, e.g. "23"
			const forLlm = event.normalizedText || event.text;
			console.log(`utterance #${event.seq}:`, event.text);

			for await (const chunk of session.processLLM({ message: forLlm })) {
				if (chunk.type === 'message' && chunk.finish) {
					session.processTTSTF(chunk.message);
				}
			}
		}
	}
}

export {
	example_stt_basic,
	example_stt_autoTimeout,
	example_stt_accessRecordedAudio,
	example_stt_transcribeAudio,
	example_stt_errorHandling,
	example_stt_chatStates,
	example_stt_realtimePushToTalk,
	example_stt_handsFreeConversation
};
