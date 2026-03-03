import type { Session } from 'perso-interactive-sdk-web/client';

async function synthesizeChunk(
	session: Session,
	chunk: string,
	options?: { skipSTF?: boolean }
): Promise<void> {
	const audioBlob = await session.processTTS(chunk);
	if (!audioBlob) {
		console.warn('TTS returned no audio for chunk');
		return;
	}
	if (!options?.skipSTF) {
		await session.processSTF(audioBlob, 'wav', chunk);
	}
}

/** Sequential: collects all LLM chunks first, then runs TTS/STF one by one. Simpler flow, useful for debugging. */
export async function processChat(
	session: Session,
	text: string,
	options?: { skipSTF?: boolean }
): Promise<string> {
	const llmGenerator = session.processLLM({ message: text });
	const messageChunks: string[] = [];
	let finished = false;

	for await (const chunk of llmGenerator) {
		if (chunk.type === 'message') {
			if (chunk.finish) finished = true;

			const newChunks = chunk.chunks.slice(messageChunks.length);
			messageChunks.push(...newChunks);
		} else if (chunk.type === 'error') {
			console.error('LLM error:', chunk.error);
			return '';
		}
	}

	if (!finished || messageChunks.length === 0) {
		console.warn('LLM returned empty response');
		return '';
	}

	const llmResponse = messageChunks.join('');

	for (const c of messageChunks) {
		if (c.trim().length === 0) continue;
		await synthesizeChunk(session, c, options);
	}

	return llmResponse;
}

/** Streaming: enqueues TTS/STF via promise chain as LLM chunks arrive. Lower time-to-first-speech, suited for production. */
export async function processChatStreaming(
	session: Session,
	text: string,
	options?: { skipSTF?: boolean }
): Promise<string> {
	const llmGenerator = session.processLLM({ message: text });
	const messageChunks: string[] = [];
	let queue = Promise.resolve();
	let finished = false;

	for await (const chunk of llmGenerator) {
		if (chunk.type === 'message') {
			if (chunk.finish) finished = true;

			const newChunks = chunk.chunks.slice(messageChunks.length);
			messageChunks.push(...newChunks);

			for (const c of newChunks) {
				if (c.trim().length === 0) continue;
				queue = queue.then(() => synthesizeChunk(session, c, options));
			}
		} else if (chunk.type === 'error') {
			console.error('LLM error:', chunk.error);
			return '';
		}
	}

	if (!finished || messageChunks.length === 0) {
		console.warn('LLM returned empty response');
		return '';
	}

	const llmResponse = messageChunks.join('');

	await queue;

	return llmResponse;
}

export async function sendChat(session: Session, message: string): Promise<string> {
	return processChatStreaming(session, message);
}

export async function stopSpeech(session: Session): Promise<void> {
	await session.clearBuffer();
}
