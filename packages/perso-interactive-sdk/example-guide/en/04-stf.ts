/**
 * ============================================================================
 * Example 4: STF (Speech-to-Face) — Avatar Lip-Sync with Audio
 * ============================================================================
 *
 * STF sends an audio file to the avatar to perform lip-sync
 * (mouth movement synchronization). The avatar moves its mouth in sync
 * with the audio, showing a "speaking" appearance.
 *
 * Difference from TTS:
 *   - TTS: Text → Generate speech (returns audio Blob)
 *   - STF: Existing audio → Avatar moves mouth in sync with that audio
 *
 * Key method:
 *   - session.processSTF(audioFile, format, message) → Execute avatar lip-sync
 */

import { createSession, ChatState, type Session } from 'perso-interactive-sdk-web/client';

// ─────────────────────────────────────────────────────────────────────────────
// Basic Usage: Avatar lip-sync with an audio file
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends an audio file to the avatar to perform lip-sync.
 *
 * processSTF() sends the audio to the server via WebRTC DataChannel,
 * and the server generates the avatar's mouth movements
 * and reflects them in the video stream.
 *
 * @param session - The created Session object
 * @param audioFile - Audio file (Blob or File)
 * @param format - Audio format ('wav' or 'mp3')
 * @param message - (Optional) Text to display in the chat log
 */
async function example_stf_basic(session: Session, audioFile: Blob, format: string, message: string) {
	// processSTF() parameters:
	//   audioFile: Audio data as Blob or File
	//   format: Audio format string ('wav' or 'mp3')
	//   message: Text to display in the chat log while the avatar "speaks" (optional)
	await session.processSTF(audioFile, format, message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute STF with File Upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes avatar lip-sync with an audio file selected from <input type="file">.
 * Supports MP3 and WAV formats.
 */
async function example_stf_fromFileInput(session: Session) {
	const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
	const file = fileInput.files?.[0];

	if (!file) {
		console.warn('No file selected.');
		return;
	}

	// Determine format from file extension
	const fileName = file.name.toLowerCase();
	let format: string;
	if (fileName.endsWith('.mp3')) {
		format = 'mp3';
	} else if (fileName.endsWith('.wav')) {
		format = 'wav';
	} else {
		console.error('Unsupported format. Only MP3 or WAV files are supported.');
		return;
	}

	await session.processSTF(file, format, 'Avatar speaks with the uploaded audio.');
	console.log('STF complete!');
}

// ─────────────────────────────────────────────────────────────────────────────
// Track Avatar Speaking State via ChatState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks ChatState changes during STF processing.
 *
 * STF ChatState flow:
 *   1. ANALYZING — Server is analyzing the audio and generating lip-sync data
 *   2. SPEAKING  — Avatar is speaking with lip-sync
 *   3. (Empty Set) — Speech complete, idle state
 */
function example_stf_chatStates(session: Session) {
	session.subscribeChatStates((states: Set<ChatState>) => {
		if (states.has(ChatState.ANALYZING)) {
			console.log('Generating avatar lip-sync data...');
		}
		if (states.has(ChatState.SPEAKING)) {
			console.log('Avatar is speaking...');
		}
		if (states.size === 0) {
			console.log('Avatar speech complete, idle state.');
		}
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Stop Avatar Speaking (clearBuffer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * You can forcefully stop the avatar while it is speaking.
 * clearBuffer() also cancels any ongoing LLM/TTS operations.
 */
async function example_stf_stopSpeaking(session: Session) {
	// When called while the avatar is speaking:
	//   - Currently playing audio stops immediately
	//   - Ongoing LLM/TTS operations are cancelled
	//   - All ChatStates are reset
	await session.clearBuffer();
	console.log('Avatar speech has been stopped.');
}

export {
	example_stf_basic,
	example_stf_fromFileInput,
	example_stf_chatStates,
	example_stf_stopSpeaking
};
