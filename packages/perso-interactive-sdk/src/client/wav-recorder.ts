import { resampleAudio, encodeWav } from '../shared';

export interface WavRecorderOptions {
	channels?: number;
	targetSampleRate?: number;
}

/**
 * AudioWorkletProcessor code for capturing audio samples.
 * This code runs in the audio worklet thread.
 * Supports bidirectional communication for safe stop handling.
 */
const WORKLET_PROCESSOR_CODE = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = true;
    
    // Listen for stop message from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.isRecording = false;
        // Send confirmation back to main thread
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0 && this.isRecording) {
      // Clone the audio data and send to main thread
      const channelData = new Float32Array(input[0]);
      this.port.postMessage({ type: 'audio', data: channelData });
    }
    // Return true to keep the processor alive until stopped
    return this.isRecording;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
`;

/**
 * Data URL for the AudioWorklet processor module.
 * Using Data URL instead of Blob URL for better CSP compatibility.
 */
const WORKLET_DATA_URL = `data:application/javascript,${encodeURIComponent(WORKLET_PROCESSOR_CODE)}`;

/**
 * Records audio from the microphone and produces WAV files using Web Audio API.
 * Uses AudioWorklet (standard API) for cross-browser compatibility.
 *
 * Browser Support:
 * - Chrome 66+
 * - Firefox 76+
 * - Safari 14.1+
 * - iOS Safari 14.5+
 * - Edge 79+
 */
export class WavRecorder {
	private audioContext: AudioContext | null = null;
	private mediaStream: MediaStream | null = null;
	private workletNode: AudioWorkletNode | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;
	private audioChunks: Float32Array[] = [];
	private isRecordingState: boolean = false;
	private channels: number;
	private targetSampleRate: number | undefined;

	constructor(options: WavRecorderOptions = {}) {
		this.channels = options.channels || 1;
		this.targetSampleRate = options.targetSampleRate;
	}

	/**
	 * Starts recording audio from the microphone.
	 * Requests microphone permission via getUserMedia.
	 * @throws Error if already recording or if microphone access is denied.
	 */
	async start(): Promise<void> {
		if (this.isRecordingState) {
			throw new Error('WavRecorder is already recording');
		}

		// Request microphone access
		this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

		// Create AudioContext (uses device's default sample rate)
		// Resampling to target rate will be done in stop() using OfflineAudioContext
		this.audioContext = new AudioContext();

		// Safari/iOS compatibility: AudioContext may start in 'suspended' or 'interrupted' state
		// due to browser autoplay policies. Calling resume() ensures the context is running
		// before audio processing begins. This should be called within a user gesture context.
		if (this.audioContext.state !== 'running') {
			try {
				await this.audioContext.resume();
			} catch (error) {
				// resume() can fail if context is in unexpected state.
				// Log warning but continue - context may still work for our purposes.
				console.warn('WavRecorder: Failed to resume AudioContext:', error);
			}
		}

		// Load the AudioWorklet module using Data URL (better CSP compatibility than Blob URL)
		await this.audioContext.audioWorklet.addModule(WORKLET_DATA_URL);

		// Create source node from microphone stream
		this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

		// Create AudioWorkletNode
		this.workletNode = new AudioWorkletNode(this.audioContext, 'recorder-processor');

		this.audioChunks = [];

		// Listen for audio data from the worklet
		// Note: We don't check isRecordingState here because stop() will
		// override this handler to continue collecting chunks until 'stopped' is received
		this.workletNode.port.onmessage = (event) => {
			if (event.data.type === 'audio') {
				this.audioChunks.push(event.data.data);
			}
		};

		// Connect the audio graph
		this.sourceNode.connect(this.workletNode);
		// Connect to destination to keep the audio graph alive (silent output)
		this.workletNode.connect(this.audioContext.destination);

		this.isRecordingState = true;
	}

	/**
	 * Stops recording and returns the recorded audio as a WAV File.
	 * Uses bidirectional communication with AudioWorklet to ensure all audio data is captured.
	 * @returns Promise resolving to a File containing the recorded WAV audio.
	 * @throws Error if not currently recording.
	 */
	async stop(): Promise<File> {
		if (!this.isRecordingState) {
			throw new Error('WavRecorder is not recording');
		}

		this.isRecordingState = false;

		// Send stop message to AudioWorklet and wait for confirmation
		// This ensures all pending audio chunks are received before disconnecting
		await new Promise<void>((resolve) => {
			this.workletNode!.port.onmessage = (event) => {
				if (event.data.type === 'stopped') {
					resolve();
				} else if (event.data.type === 'audio') {
					// Continue collecting audio chunks until stopped confirmation
					this.audioChunks.push(event.data.data);
				}
			};

			this.workletNode!.port.postMessage({ type: 'stop' });
		});

		// Now safe to disconnect - all audio data has been received
		this.workletNode?.disconnect();
		this.sourceNode?.disconnect();
		this.mediaStream?.getTracks().forEach((track) => track.stop());

		// Capture values needed for encoding before cleanup
		const chunks = this.audioChunks;
		const originalSampleRate = this.audioContext!.sampleRate;

		try {
			// Merge all audio chunks into a single Float32Array
			const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
			const merged = new Float32Array(totalLength);
			let offset = 0;
			for (const chunk of chunks) {
				merged.set(chunk, offset);
				offset += chunk.length;
			}

			let finalSamples: Float32Array;
			let finalSampleRate: number;

			if (this.targetSampleRate && this.targetSampleRate !== originalSampleRate) {
				finalSamples = await resampleAudio(
					merged,
					originalSampleRate,
					this.targetSampleRate,
					this.channels
				);
				finalSampleRate = this.targetSampleRate;
			} else {
				finalSamples = merged;
				finalSampleRate = originalSampleRate;
			}

			const wavBuffer = encodeWav(finalSamples, finalSampleRate, this.channels);
			const blob = new Blob([wavBuffer], { type: 'audio/wav' });

			return new File([blob], 'recording.wav', { type: 'audio/wav' });
		} finally {
			// Always clean up resources, even if encoding fails
			await this.audioContext?.close();
			this.audioContext = null;
			this.mediaStream = null;
			this.workletNode = null;
			this.sourceNode = null;
			this.audioChunks = [];
		}
	}

	isRecording(): boolean {
		return this.isRecordingState;
	}
}

/**
 * Factory function to create a WavRecorder.
 * @param options Optional configuration.
 * @returns A new WavRecorder instance.
 */
export function createWavRecorder(options?: WavRecorderOptions): WavRecorder {
	return new WavRecorder(options);
}
