import type { Session } from 'perso-interactive-sdk-web/client';

export type STTToggleResult =
	| { action: 'started' }
	| { action: 'completed'; text: string }
	| { action: 'empty' };

export async function startProcessSTT(session: Session, timeout?: number): Promise<void> {
	await session.startProcessSTT(timeout);
}

export async function stopProcessSTT(session: Session, language?: string): Promise<string> {
	return session.stopProcessSTT(language);
}

export function isRecording(session: Session): boolean {
	return session.isSTTRecording();
}

export async function toggleSTT(
	session: Session,
	options: { language?: string; timeout?: number }
): Promise<STTToggleResult> {
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
