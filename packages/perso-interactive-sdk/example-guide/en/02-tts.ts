/**
 * ============================================================================
 * Example 2: TTS (Text-to-Speech) — Convert Text to Speech
 * ============================================================================
 *
 * TTS converts text into speech audio.
 * The converted audio is returned as a Blob, which can be played in the browser
 * or passed to STF (avatar lip-sync).
 *
 * Key method:
 *   - session.processTTS(text) → Blob | undefined
 */

import {
	createSession,
	TTSError,
	TTSDecodeError,
	ApiError,
	type Session
} from 'perso-interactive-sdk-web/client';

// ─────────────────────────────────────────────────────────────────────────────
// Basic Usage: Convert text to speech and play in the browser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts text to speech and plays it through an <audio> element.
 *
 * processTTS() internally performs the following:
 *   1. Removes emojis from the text (for TTS engine compatibility)
 *   2. Automatically appends a period if the sentence doesn't end with one
 *   3. Calls the Perso TTS API to generate speech
 *   4. Returns the audio as a WAV-format Blob
 *
 * @param session - The created Session object
 * @param text    - The text to convert to speech
 */
async function example_tts_basic(session: Session, text: string) {
	// ── 1) Text → Speech Conversion ─────────────────────────────────────

	// processTTS() returns a Blob (WAV audio).
	// Empty text or text containing only emojis returns undefined.
	const audioBlob = await session.processTTS(text);

	if (!audioBlob) {
		console.warn('TTS: No text to convert.');
		return;
	}

	// ── 2) Play Audio in the Browser ────────────────────────────────────

	// Convert the Blob to a URL and attach it to an <audio> element.
	const audioUrl = URL.createObjectURL(audioBlob);

	const audioElement = document.querySelector('audio') as HTMLAudioElement;
	audioElement.src = audioUrl;
	audioElement.play();

	// Prevent memory leaks: release the URL after playback completes.
	audioElement.addEventListener(
		'ended',
		() => {
			URL.revokeObjectURL(audioUrl);
		},
		{ once: true }
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling: Proper error handling when TTS fails
// ─────────────────────────────────────────────────────────────────────────────

/**
 * There are two types of TTS errors:
 *   1. ApiError  — TTS API server call failed (network error, server error, etc.)
 *   2. TTSDecodeError — Returned audio data decoding failed
 *
 * You can detect global errors with setErrorHandler(),
 * or catch them directly with try-catch around processTTS().
 */
async function example_tts_errorHandling(session: Session) {
	// ── Method 1: Register a global error handler ───────────────────────

	const removeErrorHandler = session.setErrorHandler((error: Error) => {
		if (error instanceof TTSError) {
			if (error.underlyingError instanceof ApiError) {
				// API call itself failed (network error, auth failure, etc.)
				console.error('TTS API error:', error.underlyingError.detail);
			} else if (error.underlyingError instanceof TTSDecodeError) {
				// Audio data decoding failed (corrupted response, etc.)
				console.error('TTS decoding error:', error.underlyingError.description);
			}
		}
	});

	// ── Method 2: Catch directly with try-catch ─────────────────────────

	try {
		const audioBlob = await session.processTTS('Hello');
		if (audioBlob) {
			console.log('TTS success! Audio size:', audioBlob.size, 'bytes');
		}
	} catch (error) {
		console.error('TTS failed:', error);
	}

	// Cleanup
	// removeErrorHandler();
}

// ─────────────────────────────────────────────────────────────────────────────
// Resample Option: Preserve original audio quality
// ─────────────────────────────────────────────────────────────────────────────

/**
 * By default, processTTS() resamples audio to 16kHz.
 * This is for compatibility with STF (avatar lip-sync).
 *
 * If you need original quality audio without resampling,
 * use the resample: false option.
 */
async function example_tts_noResample(session: Session) {
	// With resampling (default, recommended when using with STF)
	const audioForSTF = await session.processTTS('Speech to send to the avatar', { resample: true });

	// Without resampling (original quality, for browser playback only)
	const audioForPlayback = await session.processTTS('High-quality speech playback', { resample: false });

	return { audioForSTF, audioForPlayback };
}

export { example_tts_basic, example_tts_errorHandling, example_tts_noResample };
