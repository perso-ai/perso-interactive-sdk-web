import { NextResponse } from 'next/server';
import { persoInteractiveApiKey, persoInteractiveApiServerUrl } from '@/lib/constant';
import {
	createSessionId,
	getIntroMessage,
	ApiError,
	SessionCreationError,
	DoesNotExistError,
	NotInOrganizationError
} from 'perso-interactive-sdk-web/server';
import { getConfig } from '@/lib/server-config';

export async function GET() {
	try {
		const config = await getConfig();

		const sessionId = await createSessionId({
			apiKey: persoInteractiveApiKey,
			params: {
				using_stf_webrtc: true,
				llm_type: config.llm,
				tts_type: config.tts,
				stt_type: config.stt,
				model_style: config.modelStyle,
				prompt: config.prompt,
				document: config.document || undefined
			}
		});

		let introMessage: string = '';
		try {
			introMessage = await getIntroMessage({
				apiKey: persoInteractiveApiKey,
				promptId: config.prompt
			});
		} catch (error) {
			console.error('Failed to get intro message:', error);
		}

		return NextResponse.json({ persoInteractiveApiServerUrl, sessionId, introMessage });
	} catch (err) {
		if (err instanceof DoesNotExistError) {
			return NextResponse.json(err, { status: 400 });
		} else if (err instanceof NotInOrganizationError) {
			return NextResponse.json(err, { status: 403 });
		} else if (err instanceof SessionCreationError) {
			return NextResponse.json(err, { status: err.errorCode });
		} else if (err instanceof ApiError) {
			return NextResponse.json(err, { status: err.errorCode });
		}
		const message = err instanceof Error ? err.message : 'An unknown error occurred.';
		return NextResponse.json({ name: 'Error', message }, { status: 500 });
	}
}
