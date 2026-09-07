/**
 * ============================================================================
 * Example 2: TTS (Text-to-Speech) — Convert Text to Speech
 * ============================================================================
 *
 * TTS converts text into speech audio.
 * The converted audio is returned as a Blob, which can be played in the browser
 * or passed to STF (avatar lip-sync).
 *
 * Key methods:
 *   - session.processTTS(text) → Blob | undefined
 *   - session.processStreamingTTS(text) → StreamingTTSStream | undefined
 */

import {
	PcmStreamDecoder,
	TTSError,
	TTSDecodeError,
	TTSNotStreamableError,
	TTS_ERROR_CODE,
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
 *   3. Generates speech. On a session whose TTS type reports `streamable: true`
 *      this synthesizes progressively and reassembles the chunks here, so the
 *      clip is ready sooner — an internal detail that does not change what you
 *      get back. Non-streamable/container voices use the one-shot REST endpoint
 *   4. Returns the audio as a Blob. Its container depends on the route taken:
 *      - streaming route (streamable voice; no `output_format` or a `pcm`/`pcm_24000`
 *        one): a WAV Blob (`audio/wav`)
 *      - REST route: the container the server sent — `audio/mpeg` for `mp3*`,
 *        WAV for `wav*`. `pcm*` formats on this route arrive headerless (no
 *        sample rate on the wire), so that Blob is not playable as-is
 *      - `resample: true`: re-encoded as a 16 kHz mono WAV on either route (the
 *        REST route falls back to the raw audio if it cannot be decoded)
 *
 * @param session - The created Session object
 * @param text    - The text to convert to speech
 */
async function example_tts_basic(session: Session, text: string) {
	// ── 1) Text → Speech Conversion ─────────────────────────────────────

	// processTTS() returns an audio Blob (a WAV here — see step 4 above for other
	// containers). It resolves undefined for empty or emoji-only text, and ALSO
	// when synthesis failed: processTTS() never throws for a failed request, the
	// failure is reported through setErrorHandler() (see the error handling example).
	const audioBlob = await session.processTTS(text);

	if (!audioBlob) {
		console.warn('TTS: no audio (empty text, or a failure reported to the error handler).');
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
// Streaming TTS: Start playback on the first chunk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * processStreamingTTS() resolves as soon as the stream is established and
 * hands back PCM chunks, so playback can begin before synthesis has finished.
 *
 * It requires a session whose TTS type reports `streamable: true`. Every other
 * state rejects with TTSNotStreamableError before any request goes out —
 * `false`, a null or missing field, a session created without TTS, or a session
 * row the SDK could not read — because the TTS type is fixed when the session is
 * created, so no retry can make that session stream. processTTS() works on every
 * voice and is the fallback.
 *
 * The chunks cannot describe their own format: the bytes are little-endian 16-bit
 * PCM, the sample rate is not carried in the frames, and chunk boundaries split
 * samples. PcmStreamDecoder and stream.sampleRate cover all three — decoding a
 * chunk on its own turns speech into noise.
 */
async function example_tts_streaming(session: Session, text: string) {
	try {
		const stream = await session.processStreamingTTS(text);

		if (!stream) {
			// Either there was no speakable text, or the streaming connection could not
			// be opened — the latter is reported to setErrorHandler() as a TTSError.
			console.warn('TTS: no stream (empty text, or a connection failure reported to the error handler).');
			return;
		}

		const decoder = new PcmStreamDecoder();

		// A synthesis failure mid-stream (tts.error frame, idle timeout, socket
		// closed) is THROWN from this for-await loop as a TTSError AND reported to
		// setErrorHandler() — handle it in one place to avoid double-logging.
		// `await stream.cancel()` and `session.clearBuffer()` end the iteration
		// silently: no throw, nothing reported.
		for await (const chunk of stream) {
			const samples = decoder.decode(chunk); // Float32Array, [-1, 1]

			// Feed `samples` to playback at stream.sampleRate (24000 Hz, mono).
			// An empty result means the chunk only advanced a split sample.
			console.log(`${samples.length} samples at ${stream.sampleRate} Hz`);
		}

		// Abandoning a turn early? `await stream.cancel()` stops the iteration and
		// halts synthesis server-side where possible.
	} catch (error) {
		if (error instanceof TTSNotStreamableError) {
			// This session's voice cannot stream. One finished file instead.
			console.warn(`${error.message} (tts type: ${error.ttsType ?? 'unknown'})`);
			return await session.processTTS(text);
		}

		// A TTSError thrown by the loop above lands here. It has already reached
		// setErrorHandler(), so log it there or here — not both.
		throw error;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling: Proper error handling when TTS fails
// ─────────────────────────────────────────────────────────────────────────────

/**
 * processTTS() never throws for a failed synthesis: every failure is reported
 * through setErrorHandler() as a TTSError and the call resolves `undefined`.
 * A try/catch around processTTS() therefore catches nothing useful.
 *
 * TTSError wraps one of two underlying errors:
 *   1. ApiError       — the request failed. This covers the REST endpoint (HTTP
 *                       status in `underlyingError.errorCode`) AND the streaming
 *                       route: a connection that will not open, a protocol error,
 *                       the idle timeout and the 4000-character text cap all
 *                       arrive as this. For streaming-origin errors
 *                       `underlyingError.errorCode` is 0 (there is no HTTP
 *                       status) and the meaningful code is `error.code` — an open
 *                       string; match the TTS_ERROR_CODE members you handle and
 *                       log the rest. Never branch on errorCode 4xx/5xx for those.
 *   2. TTSDecodeError — the returned audio could not be decoded
 *                       (`error.code` is undefined)
 *
 * A third class, TTSNotStreamableError, is THROWN by processStreamingTTS() (not
 * reported) when the session's voice cannot stream — see example_tts_streaming.
 */
async function example_tts_errorHandling(session: Session) {
	// ── 1) Register a global error handler ──────────────────────────────

	const removeErrorHandler = session.setErrorHandler((error: Error) => {
		if (!(error instanceof TTSError)) return;

		if (error.underlyingError instanceof TTSDecodeError) {
			// Audio data decoding failed (corrupted response, etc.)
			console.error('TTS decoding error:', error.underlyingError.description);
		} else if (error.underlyingError instanceof ApiError) {
			// Request failed — REST or streaming origin. Branch on the string code.
			switch (error.code) {
				case TTS_ERROR_CODE.CANCELLED:
					// A client-requested stop (barge-in) — not a failure.
					break;
				case TTS_ERROR_CODE.IDLE_TIMEOUT:
					console.error('TTS: the server stopped sending audio.');
					break;
				default:
					// A dropped or unopened connection lands here too: error.code is an
					// open string (e.g. 'ws_closed'); errorCode is 0 on the streaming
					// route and an HTTP status on the REST route.
					console.error(
						`TTS request failed (code=${error.code}, http=${error.underlyingError.errorCode}):`,
						error.underlyingError.detail
					);
			}
		}
	});

	// ── 2) Check the result — no try/catch needed ───────────────────────

	const audioBlob = await session.processTTS('Hello');
	if (audioBlob === undefined) {
		// Empty text, or a failure that was already delivered to the handler above.
		console.warn('TTS produced no audio.');
		return;
	}
	console.log('TTS success! Audio size:', audioBlob.size, 'bytes');

	// Cleanup
	// removeErrorHandler();
}

// ─────────────────────────────────────────────────────────────────────────────
// Resample Option: 16 kHz mono WAV
// ─────────────────────────────────────────────────────────────────────────────

/**
 * By default processTTS() returns the audio as delivered (original sample rate).
 * With `resample: true` the audio is decoded and re-encoded as a 16 kHz mono WAV
 * (TTS_TARGET_SAMPLE_RATE), for consumers that need exactly that format — e.g.
 * an STT engine or an analysis pipeline expecting 16 kHz input.
 *
 * It is NOT needed for STF: processSTF() decodes any Blob and resamples it to
 * 24 kHz itself. Feeding it a 16 kHz clip only adds a lossy
 * downsample-then-upsample round trip — pass the default Blob instead.
 */
async function example_tts_noResample(session: Session) {
	// Default: original quality — fine for browser playback and for processSTF()
	const audioOriginal = await session.processTTS('High-quality speech playback');

	// resample: true — 16 kHz mono WAV, for consumers that require that format
	const audio16k = await session.processTTS('Sixteen kilohertz version', { resample: true });

	return { audioOriginal, audio16k };
}

// ─────────────────────────────────────────────────────────────────────────────
// Locale & Output Format
// ─────────────────────────────────────────────────────────────────────────────

/**
 * processTTS() accepts optional `locale` and `output_format` options. The
 * output_format also decides which transport the SDK uses:
 *   - `pcm` / `pcm_24000` on a streamable voice (or no output_format at all)
 *       -> streamed and reassembled into a WAV Blob
 *   - `mp3*` / `wav*`, `pcm_44100`, or ANY format on a non-streamable voice
 *       -> REST `POST /tts/`; the server's container is returned as-is
 *          (`audio/mpeg` for mp3). `pcm*` on this route is headerless and not
 *          playable as-is — prefer `wav*` / `mp3*` here.
 */
async function example_tts_localeAndFormat(session: Session) {
	// Override the voice locale (e.g. 'ko', 'en')
	const koreanAudio = await session.processTTS('안녕하세요, 만나서 반갑습니다.', { locale: 'ko' });

	// Ask for MP3: always the REST route, Blob type 'audio/mpeg'
	const mp3Audio = await session.processTTS('Hello, how are you?', { output_format: 'mp3' });

	// WAV at 24 kHz: also the REST route, Blob type 'audio/wav'
	const wavAudio = await session.processTTS('Hello, how are you?', { output_format: 'wav_24000' });

	return { koreanAudio, mp3Audio, wavAudio };
}

export {
	example_tts_basic,
	example_tts_streaming,
	example_tts_errorHandling,
	example_tts_noResample,
	example_tts_localeAndFormat
};
