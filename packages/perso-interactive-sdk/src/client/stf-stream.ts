import { STFError } from '../shared/error';
import { encodeBase64, floatToInt16LE } from '../shared/pcm-encode';
import type { Perso } from './perso';

/**
 * Sample rate the streaming STF frames are specified in: mono, 24 kHz, signed
 * 16-bit little-endian. Audio from any other rate has to be resampled before it
 * reaches this stream — the frames carry no rate field to declare it with.
 */
export const STF_STREAM_SAMPLE_RATE = 24000;

/** Mono 24 kHz s16le: 48 bytes per millisecond of audio. */
const BYTES_PER_MS = (STF_STREAM_SAMPLE_RATE * 2) / 1000;

/** 100 ms of audio per frame — small enough to keep the channel responsive. */
const DEFAULT_CHUNK_BYTES = 100 * BYTES_PER_MS;

/**
 * Local ceiling on one `stf-streaming-data` frame's base64 payload.
 *
 * The server's own cap is not documented yet, so this is deliberately
 * conservative (1 s of audio) and exists to fail an oversized `chunkBytes`
 * locally, with a message naming the cause, instead of earning an opaque
 * server-side rejection. Revise once the server publishes its limit.
 */
export const MAX_STF_CHUNK_B64_CHARS = 64 * 1024;

/**
 * How much may sit unsent in the control channel before this stream stops
 * pushing.
 *
 * The streaming frames share the control channel with the 1 s ping, and
 * `Perso` tears the session down after 30 s without a pong. At the frame rate
 * this stream produces, 256 KB is already ~4 s of audio queued locally — far
 * past the point where more pushing helps, and small enough that a ping queued
 * behind it clears well inside the ping deadline.
 */
const CONTROL_BACKPRESSURE_THRESHOLD = 256 * 1024;

/** How long a congested channel may block `end()` before the turn fails. */
const DEFAULT_FLUSH_TIMEOUT_MS = 30000;

export interface StfStreamOptions {
	perso: Perso;
	/** Caption the server echoes back on its `stf` response. */
	message?: string;
	/** PCM bytes per outbound frame. Must be even and fit the base64 cap. */
	chunkBytes?: number;
	/** How long `end()` waits for a congested channel to drain. */
	flushTimeoutMs?: number;
	/**
	 * Called exactly once when the stream reaches its terminal state, with the
	 * error that ended it or `null` on a clean finish. Lets an owner (the
	 * `Session`) release state it took out on the stream's behalf without having
	 * to intercept every exit path.
	 */
	onFinish?: (error: STFError | null) => void;
}

type StreamState = 'idle' | 'open' | 'ending' | 'finished';

type FlushSettle = {
	resolve: () => void;
	reject: (error: STFError) => void;
};

/** One queued frame plus the PCM byte count it stands for. */
type QueuedFrame = {
	audioB64: string;
	byteLength: number;
};

/**
 * Drives one `stf-streaming-start` -> `stf-streaming-data`* ->
 * `stf-streaming-end` turn.
 *
 * Two jobs beyond wrapping the frames. It reframes arbitrary writes into
 * fixed-size, sample-aligned chunks, so a caller can hand over whatever its
 * audio source produces without splitting a 16-bit sample across two frames.
 * And it watches the control channel's buffer, holding frames back while the
 * channel is congested rather than burying the session's ping behind several
 * seconds of audio.
 *
 * Pacing is the caller's job: this sends every frame as soon as the channel
 * accepts it. Feed the stream on a clock if the server expects audio in real
 * time.
 */
export class StfStream {
	private readonly perso: Perso;
	private readonly message: string;
	private readonly chunkBytes: number;
	private readonly flushTimeoutMs: number;
	private readonly onFinish?: (error: STFError | null) => void;

	private state: StreamState = 'idle';
	/** Bytes received but not yet framed — includes a trailing half sample. */
	private carry = new Uint8Array(0);
	private queue: QueuedFrame[] = [];
	/** Producers paused in {@link whenWritable}, waiting for channel room. */
	private writableWaiters: Array<() => void> = [];
	private flushSettle: FlushSettle | null = null;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private drainListener: (() => void) | null = null;
	private previousLowThreshold: number | null = null;
	private bytesSent = 0;

	constructor(options: StfStreamOptions) {
		this.perso = options.perso;
		this.message = options.message ?? '';
		this.chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
		this.flushTimeoutMs = options.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;
		this.onFinish = options.onFinish;

		if (!Number.isInteger(this.chunkBytes) || this.chunkBytes <= 0) {
			throw new STFError(`chunkBytes must be a positive integer, got ${this.chunkBytes}`, 'config');
		}
		// An odd chunk would split a 16-bit sample across two frames, which the
		// server has no way to rejoin.
		if (this.chunkBytes % 2 !== 0) {
			throw new STFError(`chunkBytes must be even, got ${this.chunkBytes}`, 'config');
		}
		if (base64Length(this.chunkBytes) > MAX_STF_CHUNK_B64_CHARS) {
			throw new STFError(
				`chunkBytes ${this.chunkBytes} encodes to ${base64Length(this.chunkBytes)} base64 ` +
					`chars, over the ${MAX_STF_CHUNK_B64_CHARS} cap. Lower chunkBytes.`,
				'chunk_too_large'
			);
		}
	}

	/** Whether the stream is still accepting audio. */
	get active(): boolean {
		return this.state === 'open' || this.state === 'ending';
	}

	/** PCM bytes handed to the data channel so far. */
	get sentBytes(): number {
		return this.bytesSent;
	}

	/** Frames held back by backpressure. */
	get queuedFrames(): number {
		return this.queue.length;
	}

	/** Opens the turn. Returns as soon as the frame is sent — there is no ack. */
	open(): void {
		if (this.state !== 'idle') {
			throw new STFError(`cannot open a stream that is ${this.state}`, 'stream_state');
		}
		this.state = 'open';
		this.perso.stfStreamingStart(this.message);
	}

	/**
	 * Queues raw little-endian 16-bit PCM.
	 *
	 * An `Int16Array` is converted explicitly rather than reinterpreted, so the
	 * wire stays little-endian regardless of the host's byte order.
	 */
	write(pcm: Int16Array | Uint8Array | ArrayBuffer): void {
		this.assertWritable();
		this.append(toLittleEndianBytes(pcm));
		this.frame(false);
		this.drain();
	}

	/** Queues normalized Float32 samples, converting them to s16le. */
	writeFloat32(samples: Float32Array): void {
		this.assertWritable();
		this.append(floatToInt16LE(samples));
		this.frame(false);
		this.drain();
	}

	/**
	 * Resolves once the channel can take more frames — immediately when there is
	 * room, after the next drain while congested, and on finish, so a producer
	 * pacing itself on this never hangs on a stream that was cancelled under it.
	 *
	 * Lets a pull-based producer stop pulling while the channel is congested,
	 * keeping the amount of audio buffered in this stream bounded.
	 */
	whenWritable(): Promise<void> {
		if (this.state === 'finished' || !this.congested()) {
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			this.writableWaiters.push(resolve);
			this.armDrainListener();
		});
	}

	private releaseWritableWaiters(): void {
		if (this.writableWaiters.length === 0) return;
		const waiters = this.writableWaiters;
		this.writableWaiters = [];
		for (const waiter of waiters) waiter();
	}

	/**
	 * Flushes what is buffered, then closes the turn.
	 *
	 * Resolves once `stf-streaming-end` has been handed to the channel. That is
	 * transmission, not playback: the avatar's speech is reported separately by
	 * the server's `stf` message, which is what drives the session's SPEAKING
	 * state.
	 */
	end(): Promise<void> {
		if (this.state !== 'open') {
			return Promise.reject(new STFError(`cannot end a stream that is ${this.state}`, 'stream_state'));
		}
		this.state = 'ending';
		this.frame(true);

		return new Promise<void>((resolve, reject) => {
			this.flushSettle = { resolve, reject };
			this.flushTimer = setTimeout(() => {
				this.fail(
					new STFError(
						`control channel did not drain within ${this.flushTimeoutMs}ms; ` +
							`${this.queue.length} frames still queued`,
						'flush_timeout'
					)
				);
			}, this.flushTimeoutMs);

			this.drain();
		});
	}

	/**
	 * Abandons the turn: drops queued audio, tells the server to discard what it
	 * has buffered, and closes the stream.
	 *
	 * `clear-buffer` goes first so the avatar stops as soon as possible, and the
	 * end frame follows so the server is not left with a stream it thinks is
	 * still filling. The server's exact mid-stream semantics are unconfirmed —
	 * see the streaming STF notes in the SDK README.
	 */
	cancel(): void {
		if (this.state === 'finished') return;

		const wasOpen = this.state !== 'idle';
		this.queue = [];
		this.carry = new Uint8Array(0);

		if (wasOpen) {
			this.perso.clearBuffer();
			this.perso.stfStreamingEnd();
		}

		const cancelled = new STFError('stream cancelled by client', 'cancelled');
		const settle = this.flushSettle;
		this.finish(cancelled);
		settle?.reject(cancelled);
	}

	private assertWritable(): void {
		if (this.state !== 'open') {
			throw new STFError(`cannot write to a stream that is ${this.state}`, 'stream_state');
		}
	}

	private append(chunk: Uint8Array): void {
		if (chunk.length === 0) return;

		const merged = new Uint8Array(this.carry.length + chunk.length);
		merged.set(this.carry, 0);
		merged.set(chunk, this.carry.length);
		this.carry = merged;
	}

	/**
	 * Moves whole chunks from the carry buffer into the send queue.
	 *
	 * On the final pass the remainder is emitted too, minus any trailing odd
	 * byte: half a sample carries no audio the server could render, so it is
	 * dropped rather than padded into a click.
	 */
	private frame(final: boolean): void {
		let offset = 0;

		while (this.carry.length - offset >= this.chunkBytes) {
			this.enqueue(this.carry.slice(offset, offset + this.chunkBytes));
			offset += this.chunkBytes;
		}

		if (final) {
			const remaining = this.carry.length - offset;
			const aligned = remaining - (remaining % 2);
			if (aligned > 0) {
				this.enqueue(this.carry.slice(offset, offset + aligned));
			}
			offset += remaining;
		}

		this.carry = this.carry.slice(offset);
	}

	private enqueue(chunk: Uint8Array): void {
		this.queue.push({ audioB64: encodeBase64(chunk), byteLength: chunk.length });
	}

	/** Sends queued frames until the channel congests or the queue empties. */
	private drain(): void {
		while (this.queue.length > 0) {
			if (this.congested()) {
				this.armDrainListener();
				return;
			}

			const frame = this.queue.shift();
			if (frame === undefined) break;

			this.perso.stfStreamingData(frame.audioB64);
			this.bytesSent += frame.byteLength;
		}

		this.releaseDrainListener();
		if (!this.congested()) {
			this.releaseWritableWaiters();
		}

		if (this.state === 'ending') {
			this.perso.stfStreamingEnd();
			const settle = this.flushSettle;
			this.finish(null);
			settle?.resolve();
		}
	}

	private congested(): boolean {
		return (this.perso.dc.bufferedAmount ?? 0) > CONTROL_BACKPRESSURE_THRESHOLD;
	}

	/**
	 * Waits for the channel to report room again.
	 *
	 * Uses `addEventListener` rather than the `onbufferedamountlow` property
	 * because the control channel is shared — assigning the handler would
	 * silently replace another listener's.
	 */
	private armDrainListener(): void {
		if (this.drainListener !== null) return;

		this.previousLowThreshold = this.perso.dc.bufferedAmountLowThreshold;
		this.perso.dc.bufferedAmountLowThreshold = CONTROL_BACKPRESSURE_THRESHOLD / 2;
		this.drainListener = () => this.drain();
		this.perso.dc.addEventListener('bufferedamountlow', this.drainListener);
	}

	private releaseDrainListener(): void {
		if (this.drainListener === null) return;

		this.perso.dc.removeEventListener('bufferedamountlow', this.drainListener);
		this.drainListener = null;
		if (this.previousLowThreshold !== null) {
			this.perso.dc.bufferedAmountLowThreshold = this.previousLowThreshold;
			this.previousLowThreshold = null;
		}
	}

	private fail(error: STFError): void {
		if (this.state === 'finished') return;

		const settle = this.flushSettle;
		this.finish(error);
		settle?.reject(error);
	}

	private finish(error: STFError | null): void {
		this.state = 'finished';
		this.flushSettle = null;
		this.queue = [];
		this.carry = new Uint8Array(0);

		if (this.flushTimer !== null) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		this.releaseDrainListener();
		this.releaseWritableWaiters();
		this.onFinish?.(error);
	}
}

/** base64 length for `byteLength` bytes, including `=` padding. */
function base64Length(byteLength: number): number {
	return Math.ceil(byteLength / 3) * 4;
}

/**
 * Normalizes an audio input to raw little-endian 16-bit bytes.
 *
 * `Uint8Array` and `ArrayBuffer` are assumed to be s16le already and copied
 * verbatim; `Int16Array` is re-serialized so the result does not depend on the
 * host's endianness.
 */
function toLittleEndianBytes(pcm: Int16Array | Uint8Array | ArrayBuffer): Uint8Array {
	if (pcm instanceof Int16Array) {
		const bytes = new Uint8Array(pcm.length * 2);
		const view = new DataView(bytes.buffer);
		for (let i = 0; i < pcm.length; i++) {
			view.setInt16(i * 2, pcm[i], true);
		}
		return bytes;
	}

	if (pcm instanceof Uint8Array) {
		return pcm;
	}

	return new Uint8Array(pcm);
}
