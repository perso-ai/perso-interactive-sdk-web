/**
 * Encoding for the wire formats that carry raw, headerless 16-bit linear PCM
 * as base64 text: the streaming STT WebSocket (`stt.audio_chunk`, `audio_b64`
 * field) and the streaming STF frames (`stf-streaming-data`, `data` field).
 *
 * This is the counterpart of `pcm-stream.ts`, which decodes the streaming TTS
 * direction. Like that module it intentionally has NO DOM dependency (no
 * `AudioContext`, no `btoa`) so it stays Node-safe and unit-testable without a
 * browser shim; base64 is implemented here rather than delegated to
 * `btoa`/`Buffer`.
 */

/**
 * Asymmetric full-scale factors. Positive samples scale by 32767 and negative
 * by 32768 so that ±1.0 maps onto the full Int16 range — the same convention
 * `encodeWav` uses, and the inverse of the `/ 32768` normalization in
 * `wav-utils` and `pcm-stream`.
 */
const INT16_POSITIVE_SCALE = 0x7fff;
const INT16_NEGATIVE_SCALE = 0x8000;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Converts normalized Float32 samples to little-endian signed 16-bit PCM.
 *
 * Samples outside [-1, 1] are clamped rather than allowed to wrap, since a
 * wrapped sample turns a loud passage into full-scale noise the recognizer
 * cannot read.
 */
export function floatToInt16LE(samples: Float32Array): Uint8Array {
	const bytes = new Uint8Array(samples.length * 2);
	const view = new DataView(bytes.buffer);

	for (let i = 0; i < samples.length; i++) {
		const sample = samples[i];
		const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
		const scale = clamped < 0 ? INT16_NEGATIVE_SCALE : INT16_POSITIVE_SCALE;
		view.setInt16(i * 2, Math.round(clamped * scale), true);
	}

	return bytes;
}

/**
 * Encodes bytes as standard base64 with `=` padding.
 *
 * Written as an explicit loop because the idiomatic
 * `btoa(String.fromCharCode(...bytes))` both requires a DOM global and blows
 * the argument limit on buffers of any real size.
 */
export function encodeBase64(bytes: Uint8Array): string {
	let out = '';

	let i = 0;
	for (; i + 2 < bytes.length; i += 3) {
		const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
		out +=
			BASE64_ALPHABET[(triple >> 18) & 0x3f] +
			BASE64_ALPHABET[(triple >> 12) & 0x3f] +
			BASE64_ALPHABET[(triple >> 6) & 0x3f] +
			BASE64_ALPHABET[triple & 0x3f];
	}

	const remaining = bytes.length - i;
	if (remaining === 1) {
		const chunk = bytes[i] << 16;
		out += BASE64_ALPHABET[(chunk >> 18) & 0x3f] + BASE64_ALPHABET[(chunk >> 12) & 0x3f] + '==';
	} else if (remaining === 2) {
		const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8);
		out +=
			BASE64_ALPHABET[(chunk >> 18) & 0x3f] +
			BASE64_ALPHABET[(chunk >> 12) & 0x3f] +
			BASE64_ALPHABET[(chunk >> 6) & 0x3f] +
			'=';
	}

	return out;
}

/** Encodes Float32 samples as the `audio_b64` payload of one `stt.audio_chunk`. */
export function encodePcmChunk(samples: Float32Array): string {
	return encodeBase64(floatToInt16LE(samples));
}
