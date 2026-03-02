export async function startProcessSTT(session, timeout) {
	await session.startProcessSTT(timeout);
}

export async function stopProcessSTT(session, language) {
	return session.stopProcessSTT(language);
}

export function isRecording(session) {
	return session.isSTTRecording();
}

export async function toggleSTT(session, options) {
	if (!session.isSTTRecording()) {
		await session.startProcessSTT(options.timeout);
		return { action: 'started' };
	} else {
		const text = await session.stopProcessSTT(options.language);

		if (text && text.trim().length > 0) {
			return { action: 'completed', text };
		} else {
			return { action: 'empty' };
		}
	}
}
