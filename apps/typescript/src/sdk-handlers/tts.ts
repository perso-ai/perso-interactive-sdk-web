import type { Session } from 'perso-interactive-sdk-web/client';

export async function processTTS(
	session: Session,
	message: string
): Promise<Blob | undefined> {
	return session.processTTS(message);
}

export function playAudio(audioBlob: Blob, audioElement: HTMLAudioElement): void {
	if (audioElement.src) {
		URL.revokeObjectURL(audioElement.src);
	}

	const audioUrl = URL.createObjectURL(audioBlob);
	audioElement.src = audioUrl;
	audioElement.play();
}
