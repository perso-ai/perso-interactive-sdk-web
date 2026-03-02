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
 *   - session.startProcessSTT(timeout?) → Start recording
 *   - session.stopProcessSTT(language?)  → Stop recording + return text
 *   - session.isSTTRecording()           → Check if recording is in progress
 *   - session.transcribeAudio(audio, language?) → Directly convert an audio file to text
 */

import {
	createSession,
	STTError,
	ApiError,
	ChatState,
	type Session
} from 'perso-interactive-sdk-web/client';

// ─────────────────────────────────────────────────────────────────────────────
// Basic Usage: Microphone Recording → Text Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records speech through the microphone and converts it to text.
 *
 * Internal behavior:
 *   1. startProcessSTT() → Requests browser microphone access → Starts WAV recording
 *   2. (Waits while the user speaks)
 *   3. stopProcessSTT() → Stops recording → Sends WAV file to STT API → Returns text
 *
 * Recording format: 16kHz WAV (sample rate optimized for STT processing)
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

	// language parameter: Specifies the language to recognize.
	//   'ko' = Korean, 'en' = English, 'ja' = Japanese, 'zh' = Chinese
	//   If omitted, the server default is used.
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
 * If you specify a timeout in startProcessSTT(), recording will
 * automatically stop after that duration. (The recorded audio is preserved)
 *
 * Calling stopProcessSTT() will then send the preserved audio to the STT API.
 */
async function example_stt_basic_noTimeout(session: Session) {
	// Start recording without a timeout. It will continue until stopProcessSTT() is called.
	await session.startProcessSTT();
	console.log('Recording started');

	// ... Wait for user interaction ...
	// When the user presses the "Stop" button, or after 30 seconds:

	const text = await session.stopProcessSTT('en');
	console.log('Result:', text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Access Recorded Audio File
// ─────────────────────────────────────────────────────────────────────────────

/**
 * After calling stopProcessSTT(), you can access the last recorded
 * audio file (WAV) via session.lastRecordedAudioFile.
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

	// Access the last recorded file
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
 * Instead of recording from the microphone, directly convert an existing
 * audio file (Blob/File) to text.
 * Useful for processing file uploads or pre-recorded audio.
 */
async function example_stt_transcribeAudio(session: Session) {
	// Example: Audio file selected from <input type="file">
	const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
	const file = fileInput.files?.[0];

	if (!file) {
		console.warn('No file selected.');
		return;
	}

	// transcribeAudio() accepts a Blob or File and converts it to text.
	const text = await session.transcribeAudio(file, 'en');
	console.log('Transcribed text:', text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Errors that can occur in STT:
 *   1. Microphone access permission denied → Standard Error
 *   2. Starting again while already recording → Error('STT recording is already in progress')
 *   3. Stopping without starting → Error('STT recording has not been started')
 *   4. STT API failure → STTError (contains ApiError internally)
 */
async function example_stt_errorHandling(session: Session) {
	try {
		await session.startProcessSTT();
		const text = await session.stopProcessSTT('en');
		console.log('Result:', text);
	} catch (error) {
		if (error instanceof STTError) {
			// STT API call failed
			console.error('STT API error:', error.message);
		} else if (error instanceof Error) {
			if (error.message.includes('already in progress')) {
				console.error('Already recording. Call stopProcessSTT() first.');
			} else if (error.message.includes('not been started')) {
				console.error('Recording has not been started. Call startProcessSTT() first.');
			} else {
				// Microphone access permission denied, etc.
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

export {
	example_stt_basic,
	example_stt_basic_noTimeout,
	example_stt_accessRecordedAudio,
	example_stt_transcribeAudio,
	example_stt_errorHandling,
	example_stt_chatStates
};
