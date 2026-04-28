async function synthesizeChunk(session, chunk, options) {
	const audioBlob = await session.processTTS(chunk);
	if (!audioBlob) {
		console.warn('TTS returned no audio for chunk');
		return;
	}
	if (!options?.skipSTF) {
		// processTTS returns the raw TTS bytes (no resample by default), so the
		// blob may be MP3 or WAV depending on what the TTS provider produced.
		// Hardcoding 'wav' makes the server reject/mis-decode MP3 payloads and
		// can destabilize the WebRTC session.
		await session.processSTF(audioBlob, audioBlob.type, chunk);
	}
}

/** Sequential: collects all LLM chunks first, then runs TTS/STF one by one. Simpler flow, useful for debugging. */
export async function processChat(session, text, options) {
	const llmGenerator = session.processLLM({ message: text });
	const messageChunks = [];
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
export async function processChatStreaming(session, text, options) {
	const llmGenerator = session.processLLM({ message: text });
	const messageChunks = [];
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

export async function sendChat(session, message) {
	return processChatStreaming(session, message);
}

export async function stopSpeech(session) {
	await session.clearBuffer();
}
