export async function processTTS(session, message) {
	return session.processTTS(message);
}

export function playAudio(audioBlob, audioElement) {
	if (audioElement.src) {
		URL.revokeObjectURL(audioElement.src);
	}

	const audioUrl = URL.createObjectURL(audioBlob);
	audioElement.src = audioUrl;
	audioElement.play();
}
