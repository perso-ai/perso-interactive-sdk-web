import type { SttPartial, SttUtterance } from './stt-stream';

export interface RealtimeSttOptions {
	/** Language of the speech, e.g. `ko`; declared on `realtime_stt.start`. */
	language?: string;
}

/**
 * One event of a realtime STT cycle, in the order the server produced it:
 * `started`, then any number of `partial` and `utterance`, then one `finished`.
 */
export type RealtimeSttEvent =
	| { type: 'started' }
	| ({ type: 'partial' } & SttPartial)
	| ({ type: 'utterance' } & SttUtterance)
	| { type: 'finished'; utteranceCount: number };

/**
 * One start -> stop cycle of realtime STT, read with `for await`.
 *
 * The loop ends after `finished`. Failures (server error, dropped socket,
 * microphone denied, a non-streaming session) are thrown from the loop.
 * Iterate it once; it is a single-consumer stream.
 */
export interface RealtimeSttStream extends AsyncIterable<RealtimeSttEvent> {
	/**
	 * Ends the cycle now, with or without end-of-turn detection. The microphone
	 * closes immediately; any unconfirmed speech arrives as one last
	 * `utterance`, then `finished`. Called before the mic opens, it never opens
	 * and the loop yields only `finished`; called while the stream is still
	 * connecting, the speech captured so far is sent once it opens and the cycle
	 * then stops as usual. Breaking out of the loop does the same. Idempotent.
	 */
	stop(): void;
}

/**
 * The session writes events in; the caller's loop reads them out. Events that
 * arrive before the caller starts iterating are buffered, not dropped.
 */
export class RealtimeSttEventQueue implements RealtimeSttStream {
	// ponytail: unbounded buffer; events are a few per second of speech, so a
	// cap only matters if a caller never iterates a very long cycle.
	private readonly buffered: RealtimeSttEvent[] = [];
	private wake: (() => void) | null = null;
	private ended = false;
	private failure: { error: unknown } | null = null;

	constructor(private readonly requestStop: () => void) {}

	stop(): void {
		this.requestStop();
	}

	push(event: RealtimeSttEvent): void {
		if (this.ended) return;
		this.buffered.push(event);
		this.notify();
	}

	end(): void {
		this.ended = true;
		this.notify();
	}

	fail(error: unknown): void {
		if (this.ended) return;
		this.failure = { error };
		this.ended = true;
		this.notify();
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<RealtimeSttEvent> {
		try {
			while (true) {
				const next = this.buffered.shift();
				if (next) {
					yield next;
					continue;
				}
				if (this.failure) throw this.failure.error;
				if (this.ended) return;
				await new Promise<void>((resolve) => (this.wake = resolve));
			}
		} finally {
			// The caller broke out of the loop: nobody reads the rest of the cycle.
			if (!this.ended) {
				this.ended = true;
				this.buffered.length = 0;
				this.requestStop();
			}
		}
	}

	private notify(): void {
		const wake = this.wake;
		this.wake = null;
		wake?.();
	}
}
