/**
 * ============================================================================
 * Example 4: STF (Speech-to-Face) — Avatar Lip-Sync with Audio
 * ============================================================================
 *
 * STF moves the avatar's mouth in sync with audio. `processSTF` is the one way
 * client-side audio reaches the avatar, and it always streams: the SDK turns
 * the audio into mono 24 kHz PCM and sends it as
 * `stf-streaming-start / -data / -end` frames, so the server begins lip-syncing
 * before the last byte has arrived. There is no upload-and-wait path to choose.
 *
 * Difference from TTS / TTSTF:
 *   - TTS:    Text -> speech audio returned to you (no avatar movement)
 *   - TTSTF:  Text -> the server synthesizes AND lip-syncs it (no audio crosses
 *             the wire from your side)
 *   - STF:    Audio you already hold -> the avatar lip-syncs to it
 *
 * Session requirements differ too: STF supplies its own audio, so it works on a
 * session created without a TTS (leave `tts_type` out of `createSessionId`).
 * TTS and TTSTF both need one.
 *
 * Key method:
 *   - session.processSTF(audio, format?, message?)
 *       audio:   a finished Blob, or a live source (ReadableStream /
 *                AsyncIterable) of mono 24 kHz PCM chunks
 *       format:  legacy hint, ignored — the container is detected from the bytes
 *       message: optional caption echoed on the server's `stf` response
 *       returns: resolves when the audio has been TRANSMITTED, not played
 */

import {
	ChatState,
	STFError,
	STF_STREAM_SAMPLE_RATE,
	type Session
} from 'perso-interactive-sdk-web/client';

// ─────────────────────────────────────────────────────────────────────────────
// Case 1: A finished clip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The common case: audio you already hold in full — an uploaded file, a
 * recording, the Blob `processTTS()` returned.
 *
 * The SDK decodes any container the browser can decode and resamples it to
 * the streaming rate, so nothing has to be prepared by the caller.
 *
 * @param session - The created Session object
 * @param audioFile - Audio file (Blob or File)
 * @param message - (Optional) Caption echoed on the server's stf response
 */
async function example_stf_finishedClip(session: Session, audioFile: Blob, message: string) {
	await session.processSTF(audioFile, undefined, message);
	// Resolved = transmitted. The avatar is likely still speaking; watch
	// ChatState.SPEAKING for playback.
}

/**
 * Several clips as separate utterances.
 *
 * Turns are serialized on the control channel, so awaiting each call is all
 * that is needed to keep them in order. Each clip becomes its own turn, which
 * means the server may leave a small gap between them.
 */
async function example_stf_clipsInOrder(session: Session, clips: Blob[]) {
	for (const clip of clips) {
		await session.processSTF(clip, undefined, '');
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 2: A live source — audio that is still being produced
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When the audio does not exist yet — a streaming TTS, a synthesizer — hand
 * over the source instead of a clip. The turn opens at the first chunk and
 * closes when the source ends, so synthesis time overlaps with playback
 * instead of preceding it.
 *
 * The one contract: each chunk must ALREADY be mono 24 kHz
 * (`STF_STREAM_SAMPLE_RATE`) — Float32 normalized to [-1, 1], or s16le bytes.
 * The frames carry no sample-rate field, so the SDK cannot resample chunks.
 *
 * @param session - The created Session object
 * @param vendorChunks - Mono 24 kHz PCM chunks, in playback order
 */
async function example_stf_liveSource(
	session: Session,
	vendorChunks: AsyncIterable<Float32Array>
) {
	async function* chunks(): AsyncGenerator<Float32Array> {
		for await (const chunk of vendorChunks) {
			yield chunk;
		}
	}

	// A SERVER rejection does NOT reject processSTF(): the call still resolves,
	// and the failure is reported through setErrorHandler() as an STFError with
	// code 'server_rejected'. Watch the error handler as well as the catch below.
	const removeErrorHandler = session.setErrorHandler((error: Error) => {
		if (error instanceof STFError && error.code === 'server_rejected') {
			console.error('Server rejected the STF turn:', error.reason);
		}
	});

	try {
		await session.processSTF(chunks(), undefined, 'Avatar speaks as audio arrives.');
	} catch (error) {
		// The source failing mid-utterance rejects here; audio already delivered
		// still plays. Local faults reject too, as STFError with a code:
		//   'decode'         — a Blob could not be decoded (Blob form only)
		//   'channel_closed' — the WebRTC control channel is not open
		if (error instanceof STFError) {
			console.error(`Live STF failed (${error.code ?? 'unknown'}):`, error.reason);
		} else {
			console.error('Live STF failed:', error);
		}
	} finally {
		removeErrorHandler();
	}
}

/**
 * A `fetch` body of raw PCM is already a valid live source — chunk boundaries
 * that split a 16-bit sample are realigned by the SDK.
 *
 * Compressed streams (mp3/opus/webm) cannot be passed this way: live sources
 * take raw PCM only, and partial compressed chunks cannot be decoded
 * incrementally. Ask the provider for a raw output such as `pcm_24000`, or
 * collect a complete file and use the Blob form.
 */
async function example_stf_fetchStream(session: Session, url: string, text: string) {
	const response = await fetch(url, {
		method: 'POST',
		body: JSON.stringify({ text, output_format: 'pcm_24000' })
	});
	if (!response.body) throw new Error('No response body');

	await session.processSTF(response.body, undefined, text);
}

/**
 * Several clips joined into ONE utterance.
 *
 * Passing clips separately gives one turn each, and the server may leave a gap
 * at every boundary. Decoding them yourself and yielding the PCM keeps
 * everything inside a single turn.
 */
async function example_stf_clipsAsOneTurn(session: Session, clips: Blob[]) {
	async function* joined(): AsyncGenerator<Float32Array> {
		for (const clip of clips) {
			const ctx = new OfflineAudioContext(1, 1, STF_STREAM_SAMPLE_RATE);
			const buffer = await ctx.decodeAudioData(await clip.arrayBuffer());
			yield buffer.getChannelData(0); // decodeAudioData resampled it for us
		}
	}

	await session.processSTF(joined(), undefined, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 3: An always-on microphone
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A microphone never ends on its own, so the application decides where turns
 * end — and that decision matters because the frames carry no timestamps. The
 * server concatenates whatever PCM it receives, so a pause that is not present
 * in the audio does not exist for it.
 *
 * The recommended shape: one turn per unmuted span. Muting ends the source,
 * which ends the turn, so every span starts a fresh timeline.
 *
 * Feeding an open turn nothing while muted instead makes the avatar fall
 * behind by the total muted time, and the session's state settles to idle so
 * later `stf` responses are ignored (SPEAKING stops being reported).
 */
function example_stf_alwaysOnMic(session: Session, micStream: MediaStream, workletUrl: string) {
	let controller: ReadableStreamDefaultController<Float32Array> | null = null;
	let muted = false;

	async function start() {
		// Capturing at the streaming rate removes any need to resample chunks.
		const ctx = new AudioContext({ sampleRate: STF_STREAM_SAMPLE_RATE });
		await ctx.audioWorklet.addModule(workletUrl);

		const node = new AudioWorkletNode(ctx, 'pcm-tap');
		node.port.onmessage = (event: MessageEvent<Float32Array>) => {
			if (muted) return;
			// Production code should also watch controller.desiredSize: a live
			// source cannot pause its producer, so a congested channel would
			// otherwise grow this queue without bound.
			controller?.enqueue(event.data);
		};

		ctx.createMediaStreamSource(micStream).connect(node);
		openSegment();
	}

	function openSegment() {
		const segment = new ReadableStream<Float32Array>({
			start: (c) => {
				controller = c;
			},
			cancel: () => {
				// clearBuffer()/stopSession() cancelled the turn.
				controller = null;
			}
		});
		void session.processSTF(segment); // this span is one turn
	}

	function closeSegment() {
		controller?.close(); // source ends -> turn ends
		controller = null;
	}

	function toggleMute() {
		muted = !muted;
		if (muted) closeSegment();
		else openSegment();
	}

	return { start, toggleMute };
}

// ─────────────────────────────────────────────────────────────────────────────
// Track Avatar Speaking State via ChatState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks ChatState changes during STF processing.
 *
 * STF ChatState flow:
 *   1. ANALYZING — the turn is open and audio is being transmitted
 *   2. SPEAKING  — the server's `stf` response landed; the avatar is speaking
 *   3. (Empty Set) — speech complete, idle state
 */
function example_stf_chatStates(session: Session) {
	session.subscribeChatStates((states: Set<ChatState>) => {
		if (states.has(ChatState.ANALYZING)) {
			console.log('Sending audio / waiting for the server to start...');
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
 * Stops the avatar mid-speech. This is also how a streaming turn is cancelled:
 * there is no stream handle to call — `clearBuffer()` drops the open turn,
 * stops consuming a live source, and tells the server to discard what it has
 * buffered.
 *
 * A pending `processSTF()` then RESOLVES rather than rejecting: an
 * interruption you asked for is not a failure.
 */
async function example_stf_stopSpeaking(session: Session) {
	await session.clearBuffer();
	console.log('Avatar speech has been stopped.');
}

export {
	example_stf_finishedClip,
	example_stf_clipsInOrder,
	example_stf_liveSource,
	example_stf_fetchStream,
	example_stf_clipsAsOneTurn,
	example_stf_alwaysOnMic,
	example_stf_chatStates,
	example_stf_stopSpeaking
};
