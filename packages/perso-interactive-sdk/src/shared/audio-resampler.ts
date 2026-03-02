export class AudioResampleError extends Error {
	constructor(message: string) {
		super(`Audio resample error: ${message}`);
		this.name = 'AudioResampleError';
	}
}

export async function resampleAudio(
	samples: Float32Array,
	originalSampleRate: number,
	targetSampleRate: number,
	channels: number = 1
): Promise<Float32Array> {
	if (samples.length === 0) {
		throw new AudioResampleError('Cannot resample empty audio data');
	}

	if (originalSampleRate <= 0 || targetSampleRate <= 0) {
		throw new AudioResampleError(
			`Invalid sample rate: original=${originalSampleRate}, target=${targetSampleRate}`
		);
	}

	if (originalSampleRate === targetSampleRate) {
		return samples;
	}

	try {
		const duration = samples.length / originalSampleRate;
		const targetFrames = Math.ceil(duration * targetSampleRate);

		const tempCtx = new OfflineAudioContext(channels, samples.length, originalSampleRate);
		const audioBuffer = tempCtx.createBuffer(channels, samples.length, originalSampleRate);
		audioBuffer.getChannelData(0).set(samples);

		const offlineCtx = new OfflineAudioContext(channels, targetFrames, targetSampleRate);
		const bufferSource = offlineCtx.createBufferSource();
		bufferSource.buffer = audioBuffer;
		bufferSource.connect(offlineCtx.destination);
		bufferSource.start(0);

		const renderedBuffer = await offlineCtx.startRendering();
		return renderedBuffer.getChannelData(0);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new AudioResampleError(
			`Failed to resample audio from ${originalSampleRate}Hz to ${targetSampleRate}Hz: ${message}`
		);
	}
}

export const TTS_TARGET_SAMPLE_RATE = 16000;
