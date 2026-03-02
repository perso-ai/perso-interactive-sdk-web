export interface WavInfo {
	sampleRate: number;
	channels: number;
	bitsPerSample: number;
	samples: Float32Array;
}

export class WavParseError extends Error {
	constructor(message: string) {
		super(`WAV parse error: ${message}`);
		this.name = 'WavParseError';
	}
}

export function parseWav(arrayBuffer: ArrayBuffer): WavInfo {
	const view = new DataView(arrayBuffer);

	if (arrayBuffer.byteLength < 44) {
		throw new WavParseError('File too small to be a valid WAV');
	}

	const riff = readString(view, 0, 4);
	if (riff !== 'RIFF') {
		throw new WavParseError('Missing RIFF header');
	}

	const wave = readString(view, 8, 4);
	if (wave !== 'WAVE') {
		throw new WavParseError('Missing WAVE format identifier');
	}

	let offset = 12;
	let fmtFound = false;
	let audioFormat = 0;
	let channels = 0;
	let sampleRate = 0;
	let bitsPerSample = 0;

	while (offset < arrayBuffer.byteLength - 8) {
		const chunkId = readString(view, offset, 4);
		const chunkSize = view.getUint32(offset + 4, true);

		if (chunkId === 'fmt ') {
			if (offset + 24 > arrayBuffer.byteLength) {
				throw new WavParseError('fmt chunk extends beyond file');
			}
			audioFormat = view.getUint16(offset + 8, true);
			channels = view.getUint16(offset + 10, true);
			sampleRate = view.getUint32(offset + 12, true);
			bitsPerSample = view.getUint16(offset + 22, true);
			fmtFound = true;
			offset += 8 + chunkSize;
			break;
		}

		const nextOffset = offset + 8 + chunkSize;
		if (nextOffset <= offset) break;
		offset = nextOffset;
	}

	if (!fmtFound) {
		throw new WavParseError('Missing fmt chunk');
	}

	if (audioFormat !== 1) {
		throw new WavParseError(`Unsupported audio format: ${audioFormat} (only PCM format 1 is supported)`);
	}

	if (channels === 0 || channels > 8) {
		throw new WavParseError(`Invalid channel count: ${channels}`);
	}

	if (sampleRate === 0 || sampleRate > 192000) {
		throw new WavParseError(`Invalid sample rate: ${sampleRate}`);
	}

	if (![8, 16, 24, 32].includes(bitsPerSample)) {
		throw new WavParseError(`Unsupported bits per sample: ${bitsPerSample}`);
	}

	let dataOffset = -1;
	let dataSize = 0;

	while (offset < arrayBuffer.byteLength - 8) {
		const chunkId = readString(view, offset, 4);
		const chunkSize = view.getUint32(offset + 4, true);

		if (chunkId === 'data') {
			dataOffset = offset + 8;
			dataSize = chunkSize;
			break;
		}

		const nextOffset = offset + 8 + chunkSize;
		if (nextOffset <= offset) break;
		offset = nextOffset;
	}

	if (dataOffset === -1) {
		throw new WavParseError('Missing data chunk');
	}

	const availableDataSize = arrayBuffer.byteLength - dataOffset;
	const actualDataSize = Math.min(dataSize, availableDataSize);

	const bytesPerSample = bitsPerSample / 8;
	const totalSamples = Math.floor(actualDataSize / (bytesPerSample * channels));
	const samples = new Float32Array(totalSamples * channels);

	let sampleIndex = 0;
	for (let i = 0; i < totalSamples * channels; i++) {
		const byteOffset = dataOffset + i * bytesPerSample;

		if (byteOffset + bytesPerSample > arrayBuffer.byteLength) {
			break;
		}

		samples[sampleIndex++] = Math.max(-1, Math.min(1, readSample(view, byteOffset, bitsPerSample)));
	}

	if (channels === 2) {
		const monoSamples = new Float32Array(totalSamples);
		for (let i = 0; i < totalSamples; i++) {
			monoSamples[i] = (samples[i * 2] + samples[i * 2 + 1]) / 2;
		}
		return { sampleRate, channels: 1, bitsPerSample, samples: monoSamples };
	}

	return { sampleRate, channels, bitsPerSample, samples: samples.slice(0, sampleIndex) };
}

export function encodeWav(samples: Float32Array, sampleRate: number, channels: number = 1): ArrayBuffer {
	const bytesPerSample = 2;
	const dataSize = samples.length * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeString(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeString(view, 8, 'WAVE');

	writeString(view, 12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channels * bytesPerSample, true);
	view.setUint16(32, channels * bytesPerSample, true);
	view.setUint16(34, 16, true);

	writeString(view, 36, 'data');
	view.setUint32(40, dataSize, true);

	let offset = 44;
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
		offset += 2;
	}

	return buffer;
}

export function getWavSampleRate(arrayBuffer: ArrayBuffer): number {
	const view = new DataView(arrayBuffer);

	if (arrayBuffer.byteLength < 28) {
		throw new WavParseError('File too small to be a valid WAV');
	}

	const riff = readString(view, 0, 4);
	if (riff !== 'RIFF') {
		throw new WavParseError('Missing RIFF header');
	}

	let offset = 12;
	while (offset < arrayBuffer.byteLength - 8) {
		const chunkId = readString(view, offset, 4);
		const chunkSize = view.getUint32(offset + 4, true);

		if (chunkId === 'fmt ') {
			if (offset + 16 > arrayBuffer.byteLength) {
				throw new WavParseError('fmt chunk extends beyond file');
			}
			return view.getUint32(offset + 12, true);
		}

		const nextOffset = offset + 8 + chunkSize;
		if (nextOffset <= offset) break;
		offset = nextOffset;
	}

	throw new WavParseError('Missing fmt chunk');
}

function readString(view: DataView, offset: number, length: number): string {
	let str = '';
	for (let i = 0; i < length; i++) {
		str += String.fromCharCode(view.getUint8(offset + i));
	}
	return str;
}

function writeString(view: DataView, offset: number, str: string): void {
	for (let i = 0; i < str.length; i++) {
		view.setUint8(offset + i, str.charCodeAt(i));
	}
}

// PCM sample conversion: different bit depths use different value ranges
// 8-bit: unsigned 0-255, center at 128 -> normalized to -1.0 ~ 1.0
// 16-bit: signed -32768 to 32767 -> normalized to -1.0 ~ 1.0
// 24-bit: signed 3-byte int with sign extension -> normalized to -1.0 ~ 1.0
// 32-bit: signed -2147483648 to 2147483647 -> normalized to -1.0 ~ 1.0
function readSample(view: DataView, byteOffset: number, bitsPerSample: number): number {
	switch (bitsPerSample) {
		case 8:
			return (view.getUint8(byteOffset) - 128) / 128;
		case 16:
			return view.getInt16(byteOffset, true) / 32768;
		case 24: {
			const b0 = view.getUint8(byteOffset);
			const b1 = view.getUint8(byteOffset + 1);
			const b2 = view.getUint8(byteOffset + 2);
			const int24 = (b2 << 16) | (b1 << 8) | b0;
			return (int24 > 0x7fffff ? int24 - 0x1000000 : int24) / 8388608;
		}
		case 32:
			return view.getInt32(byteOffset, true) / 2147483648;
		default:
			return 0;
	}
}
