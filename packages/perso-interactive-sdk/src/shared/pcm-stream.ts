/**
 * Decoding for the raw PCM carried by `tts.chunk` frames over the session
 * WebSocket (`tts.request`).
 *
 * This is the counterpart of `pcm-encode.ts`, which encodes the upload
 * direction. Like that module it intentionally has NO DOM dependency (no
 * `AudioContext`, no `atob`) so it stays Node-safe and unit-testable without a
 * browser shim.
 *
 * Each chunk is a Base64 slice of headerless PCM: no container, no length, and
 * no rate of its own. Two things about that are traps worth naming, because a
 * caller cannot recover from either by inspecting the bytes:
 *
 *  1. The samples are 16-bit little-endian, and nothing on the frame says so.
 *     Decoding them big-endian (the RFC 3551 `L16` convention) produces noise.
 *  2. The rate is not in the chunks — `tts.finish` reports it only after the
 *     audio has arrived — so it has to be known out of band. Both `pcm` and
 *     `pcm_24000` were measured at 24 kHz mono.
 */

/**
 * Sample rate of the PCM `tts.chunk` frames carry, for both `pcm` and
 * `pcm_24000` — the chunks carry no rate of their own.
 */
export const STREAMING_TTS_SAMPLE_RATE = 24000;

/** Channel count of that PCM. `tts.request` has no channel option. */
export const STREAMING_TTS_CHANNELS = 1;

/** Normalization divisor matching `wav-utils`, so both paths agree on scale. */
const INT16_SCALE = 32768;

/**
 * Converts streamed 16-bit PCM to normalized floats, one chunk at a time.
 *
 * Chunk boundaries do not respect sample boundaries — the server emits odd
 * lengths, 1-byte and 7-byte chunks included — so a decoder that treats each
 * chunk independently drops a byte per split sample and shifts everything after
 * it, turning speech into noise. This carries the orphaned byte forward instead.
 *
 * One decoder instance belongs to one stream; reuse across streams would leak a
 * trailing byte from the previous one.
 */
export class PcmStreamDecoder {
	/** Low byte of a sample whose high byte landed in the next chunk. */
	private pending: number | null = null;

	/**
	 * Decodes one chunk, prepending any byte held back from the previous one.
	 *
	 * @param chunk Raw bytes as they arrived from the stream.
	 * @returns Samples in [-1, 1]. Empty when the chunk only advanced a split
	 *   sample and produced nothing whole.
	 */
	decode(chunk: Uint8Array): Float32Array {
		const carried = this.pending === null ? 0 : 1;
		const total = carried + chunk.byteLength;
		const sampleCount = total >> 1;

		if (sampleCount === 0) {
			if (chunk.byteLength === 1) this.pending = chunk[0];
			return new Float32Array(0);
		}

		const samples = new Float32Array(sampleCount);
		let offset = 0;
		let index = 0;

		if (carried === 1) {
			// Little-endian: the held byte is the low half of this sample.
			const value = (this.pending as number) | (chunk[0] << 8);
			samples[index++] = (value & 0x8000 ? value - 0x10000 : value) / INT16_SCALE;
			offset = 1;
			this.pending = null;
		}

		const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
		while (index < sampleCount) {
			samples[index++] = view.getInt16(offset, true) / INT16_SCALE;
			offset += 2;
		}

		this.pending = offset < chunk.byteLength ? chunk[offset] : null;
		return samples;
	}
}

/** Lifecycle hooks for {@link streamPcmChunks}. */
export interface PcmStreamHooks {
	/** Stops iteration early when it returns true, without treating it as a failure. */
	shouldStop?: () => boolean;
	/** Runs on the failure that ended iteration, before it is rethrown. */
	onError?: (error: Error) => void;
	/** Runs exactly once, on any terminal outcome. */
	onEnd?: () => void;
}

/**
 * Iterates a `ReadableStream` reader, yielding non-empty chunks.
 *
 * Formerly backed `Session.processStreamingTTS` on the HTTP transport; the
 * session WebSocket path decodes `tts.chunk` frames directly and no longer
 * calls it. Kept standalone so the details that are easy to get subtly wrong —
 * skipping empty chunks, releasing the lock, running the terminal hook exactly
 * once on every exit path — stay isolated.
 */
export async function* streamPcmChunks(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	hooks: PcmStreamHooks = {}
): AsyncGenerator<Uint8Array> {
	try {
		for (;;) {
			if (hooks.shouldStop?.()) return;
			const { done, value } = await reader.read();
			if (done) return;
			if (hooks.shouldStop?.()) return;
			if (value && value.byteLength > 0) yield value;
		}
	} catch (error) {
		hooks.onError?.(error instanceof Error ? error : new Error(String(error)));
		throw error;
	} finally {
		reader.releaseLock?.();
		hooks.onEnd?.();
	}
}
