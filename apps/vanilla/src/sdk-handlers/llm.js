export async function processChat(session, text, options) {
	const llmGenerator = session.processLLM({ message: text });
	let llmResponse = '';
	const messageChunks = [];

	for await (const chunk of llmGenerator) {
		if (chunk.type === 'message') {
			for (let i = messageChunks.length; i < chunk.chunks.length; i++) {
				messageChunks.push(chunk.chunks[i]);
			}
			if (chunk.finish) {
				llmResponse = chunk.message;
			}
		} else if (chunk.type === 'error') {
			console.error('LLM error:', chunk.error);
			return '';
		}
	}

	if (llmResponse.trim().length === 0) {
		console.warn('LLM returned empty response');
		return '';
	}

	const audioBlob = await session.processTTS(llmResponse);
	if (!audioBlob) {
		console.warn('TTS returned no audio');
		return llmResponse;
	}

	if (options?.skipSTF) return llmResponse;

	await session.processSTF(audioBlob, 'wav', llmResponse);

	return llmResponse;
}

export async function sendChat(session, message) {
	return processChat(session, message);
}

export async function stopSpeech(session) {
	await session.clearBuffer();
}
