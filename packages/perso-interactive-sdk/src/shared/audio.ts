import { TTSDecodeError } from './error';
import { parseWav, encodeWav } from './wav-utils';
import { resampleAudio, TTS_TARGET_SAMPLE_RATE } from './audio-resampler';

/**
 * Decodes Base64-encoded TTS audio and optionally resamples it to the
 * target sample rate used by the SDK.
 *
 * @param base64 Base64-encoded audio data from the TTS API.
 * @param resample Whether to resample to the SDK target rate (default: true).
 * @returns Decoded (and optionally resampled) audio as a Blob.
 * @throws TTSDecodeError When the Base64 data is invalid.
 */
export async function decodeTTSAudio(base64: string, resample: boolean = true): Promise<Blob> {
	let arrayBuffer: ArrayBuffer;
	try {
		const byteChars = atob(base64);
		const byteNumbers = new Array(byteChars.length);
		for (let i = 0; i < byteChars.length; i++) {
			byteNumbers[i] = byteChars.charCodeAt(i);
		}
		arrayBuffer = new Uint8Array(byteNumbers).buffer as ArrayBuffer;
	} catch {
		throw new TTSDecodeError('Invalid Base64 audio data');
	}

	const mimeType = detectAudioMimeType(arrayBuffer);

	if (!resample) {
		return new Blob([arrayBuffer], { type: mimeType });
	}

	try {
		const audioData = await decodeAndResample(arrayBuffer, mimeType);
		const wavBuffer = encodeWav(audioData.samples, TTS_TARGET_SAMPLE_RATE, 1);
		return new Blob([wavBuffer], { type: 'audio/wav' });
	} catch {
		return new Blob([arrayBuffer], { type: mimeType });
	}
}

async function decodeAndResample(
	arrayBuffer: ArrayBuffer,
	mimeType: string
): Promise<{ samples: Float32Array; sampleRate: number }> {
	if (mimeType === 'audio/wav') {
		const wavInfo = parseWav(arrayBuffer);
		if (wavInfo.sampleRate === TTS_TARGET_SAMPLE_RATE) {
			return { samples: wavInfo.samples, sampleRate: wavInfo.sampleRate };
		}
		const resampled = await resampleAudio(
			wavInfo.samples,
			wavInfo.sampleRate,
			TTS_TARGET_SAMPLE_RATE,
			wavInfo.channels
		);
		return { samples: resampled, sampleRate: TTS_TARGET_SAMPLE_RATE };
	}

	const audioContext = new AudioContext({ sampleRate: TTS_TARGET_SAMPLE_RATE });
	try {
		const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
		if (audioBuffer.sampleRate === TTS_TARGET_SAMPLE_RATE) {
			return { samples: audioBuffer.getChannelData(0), sampleRate: TTS_TARGET_SAMPLE_RATE };
		}
		const resampled = await resampleAudio(
			audioBuffer.getChannelData(0),
			audioBuffer.sampleRate,
			TTS_TARGET_SAMPLE_RATE,
			1
		);
		return { samples: resampled, sampleRate: TTS_TARGET_SAMPLE_RATE };
	} finally {
		await audioContext.close();
	}
}

/**
 * Normalizes a caller-provided STF audio format hint into the canonical
 * `'wav' | 'mp3'` value the backend expects.
 *
 * Accepts the canonical values, common MIME types, or `undefined`/empty to
 * derive from the Blob's own `type` field. Falls back to `'wav'` when the
 * type is missing or unknown.
 *
 * @param format Caller-provided format hint (canonical, MIME, or undefined).
 * @param file Audio blob whose `type` is used as a fallback source of truth.
 * @returns `'wav'` or `'mp3'`.
 */
export function normalizeAudioFormat(format: string | undefined | null, file: Blob): 'wav' | 'mp3' {
	const canonical = (value: string | undefined | null): 'wav' | 'mp3' | null => {
		if (!value) return null;
		// Strip MIME parameters (e.g. `audio/mpeg; codecs=mp3`) before matching.
		const lower = value.toLowerCase().split(';')[0].trim();
		if (lower === 'mp3' || lower === 'audio/mpeg' || lower === 'audio/mp3') return 'mp3';
		if (
			lower === 'wav' ||
			lower === 'audio/wav' ||
			lower === 'audio/x-wav' ||
			lower === 'audio/wave'
		)
			return 'wav';
		return null;
	};
	return canonical(format) ?? canonical(file.type) ?? 'wav';
}

function detectAudioMimeType(data: ArrayBuffer): string {
	const view = new Uint8Array(data);
	if (view.length >= 4) {
		const header = String.fromCharCode(view[0], view[1], view[2], view[3]);
		if (header === 'RIFF') return 'audio/wav';
		if (header.startsWith('ID3')) return 'audio/mpeg';
		if (view[0] === 0xff && (view[1] & 0xe0) === 0xe0) return 'audio/mpeg';
	}
	return 'audio/wav';
}
