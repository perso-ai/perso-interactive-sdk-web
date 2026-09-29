/**
 * Sample rate requested from the browser for streaming STT.
 *
 * 16 kHz mono is what the recognizer wants, and asking the `AudioContext` for
 * it lets the browser's own resampler handle the mic's native rate. The
 * alternative — capturing at the device rate and resampling in JS — means
 * shipping a realtime resampler; since `realtime_stt.start` declares `sample_rate` on
 * the wire, honestly reporting whatever rate the browser granted is both
 * cheaper and more accurate. See {@link PcmStreamRecorder.sampleRate}.
 */
export const TARGET_SAMPLE_RATE = 16000;

/** Default slice of audio carried by one `realtime_stt.audio_chunk`, in milliseconds. */
const DEFAULT_CHUNK_MS = 100;

/**
 * AudioWorklet processor source. Mirrors the one in `wav-recorder.ts` but
 * forwards frames continuously instead of buffering for a final encode.
 */
const WORKLET_PROCESSOR_CODE = `
class StreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = true;
    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.isRecording = false;
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && this.isRecording) {
      this.port.postMessage({ type: 'audio', data: new Float32Array(input[0]) });
    }
    return this.isRecording;
  }
}

registerProcessor('pcm-stream-processor', StreamProcessor);
`;

/** Data URL rather than a Blob URL, for the same CSP reasons as `wav-recorder`. */
const WORKLET_DATA_URL = `data:application/javascript,${encodeURIComponent(
	WORKLET_PROCESSOR_CODE
)}`;

export interface PcmStreamRecorderOptions {
	/** Receives one fixed-size slice of mono Float32 samples per chunk interval. */
	onChunk: (samples: Float32Array) => void;
	/** Chunk duration in milliseconds. Defaults to 100. */
	chunkMs?: number;
}

/**
 * Captures the microphone as a continuous stream of fixed-size PCM chunks,
 * for feeding `realtime_stt.audio_chunk` while the user is still speaking.
 *
 * Distinct from {@link WavRecorder}, which buffers the whole utterance and
 * resamples once at `stop()` — correct for a one-shot `stt.request`, but
 * unusable when audio has to leave the device as it is captured.
 */
export class PcmStreamRecorder {
	private readonly onChunk: (samples: Float32Array) => void;
	private readonly chunkMs: number;

	private audioContext: AudioContext | null = null;
	private mediaStream: MediaStream | null = null;
	private workletNode: AudioWorkletNode | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;

	private buffer: Float32Array | null = null;
	private filled = 0;
	private active = false;
	private muted = false;

	/**
	 * Rate the browser actually granted, which is what `realtime_stt.start` must
	 * declare. Equals {@link TARGET_SAMPLE_RATE} wherever the sample-rate hint
	 * is honoured; on browsers that ignore it (older Safari) this is the
	 * device rate and the audio is streamed at that rate rather than resampled.
	 */
	sampleRate = TARGET_SAMPLE_RATE;

	constructor(options: PcmStreamRecorderOptions) {
		this.onChunk = options.onChunk;
		this.chunkMs = options.chunkMs ?? DEFAULT_CHUNK_MS;
	}

	get recording(): boolean {
		return this.active;
	}

	/**
	 * Opens the microphone and begins emitting chunks.
	 *
	 * @throws Error if already recording or if microphone access is denied.
	 */
	async start(): Promise<void> {
		if (this.active) {
			throw new Error('PcmStreamRecorder is already recording');
		}

		// Echo cancellation is stated rather than assumed: with an always-on mic
		// the avatar's own voice would otherwise be transcribed as user speech.
		this.mediaStream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
				channelCount: 1
			}
		});

		this.audioContext = this.createContext();
		this.sampleRate = this.audioContext.sampleRate;

		if (this.audioContext.state !== 'running') {
			try {
				await this.audioContext.resume();
			} catch (error) {
				console.warn('PcmStreamRecorder: Failed to resume AudioContext:', error);
			}
		}

		await this.audioContext.audioWorklet.addModule(WORKLET_DATA_URL);

		this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
		this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-stream-processor');

		this.buffer = new Float32Array(Math.round((this.sampleRate * this.chunkMs) / 1000));
		this.filled = 0;
		this.active = true;

		this.workletNode.port.onmessage = (event: MessageEvent) => {
			if (event.data?.type === 'audio') {
				this.accept(event.data.data as Float32Array);
			}
		};

		this.sourceNode.connect(this.workletNode);
		this.workletNode.connect(this.audioContext.destination);
	}

	/**
	 * Substitutes silence for captured audio without interrupting the stream.
	 *
	 * Chunks keep flowing while muted, which matters because the server drops a
	 * stream that goes 30 s without one; pausing the sends would end the stream
	 * rather than mute it.
	 */
	setMuted(muted: boolean): void {
		this.muted = muted;
	}

	/**
	 * Stops capture and releases the microphone and audio graph.
	 *
	 * Safe to call at any point after {@link start} was entered, including when
	 * start threw partway through: `getUserMedia` may already have lit the
	 * microphone indicator before a later step (worklet module load under a
	 * strict CSP, for example) failed. Gating this on `active` would leave that
	 * microphone open for the life of the page.
	 */
	async stop(): Promise<void> {
		if (!this.active && !this.mediaStream && !this.audioContext) return;
		this.active = false;

		this.workletNode?.port.postMessage({ type: 'stop' });
		if (this.workletNode) {
			this.workletNode.port.onmessage = null;
		}
		this.workletNode?.disconnect();
		this.sourceNode?.disconnect();
		this.mediaStream?.getTracks().forEach((track) => track.stop());

		try {
			await this.audioContext?.close();
		} catch {
			// A context that is already closed is not a failure worth reporting.
		}

		this.audioContext = null;
		this.mediaStream = null;
		this.workletNode = null;
		this.sourceNode = null;
		// A partial chunk is discarded rather than zero-padded: padding would
		// inject silence the microphone never heard into the transcript.
		this.buffer = null;
		this.filled = 0;
	}

	/** Buffers a worklet frame, emitting whenever a whole chunk is available. */
	private accept(frame: Float32Array): void {
		const buffer = this.buffer;
		if (!this.active || !buffer) return;

		let offset = 0;
		while (offset < frame.length) {
			const room = buffer.length - this.filled;
			const take = Math.min(room, frame.length - offset);

			if (this.muted) {
				buffer.fill(0, this.filled, this.filled + take);
			} else {
				buffer.set(frame.subarray(offset, offset + take), this.filled);
			}

			this.filled += take;
			offset += take;

			if (this.filled === buffer.length) {
				// Copy out: the caller may hold the chunk past the next frame.
				this.onChunk(buffer.slice(0));
				this.filled = 0;
			}
		}
	}

	/**
	 * Creates the capture context, falling back to the device default when the
	 * browser refuses the sample-rate hint (older Safari throws).
	 */
	private createContext(): AudioContext {
		try {
			return new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
		} catch {
			return new AudioContext();
		}
	}
}
