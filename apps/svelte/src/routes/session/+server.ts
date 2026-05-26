import { json } from '@sveltejs/kit';
import { persoInteractiveApiKey, persoInteractiveApiServerUrl } from '$lib/constant';
import {
	createSessionId,
	getIntroMessage,
	ApiError,
	SessionCreationError,
	DoesNotExistError,
	NotInOrganizationError
} from 'perso-interactive-sdk-web/server';
import { config } from '../../hooks.server';

export async function GET() {
	try {
		const sessionId = await createSessionId({
			apiKey: persoInteractiveApiKey,
			params: {
				using_stf_webrtc: true,
				llm_type: config.llm,
				tts_type: config.tts,
				stt_type: config.stt,
				model_style: config.modelStyle,
				prompt: config.prompt,
				document: config.document || undefined,
				background_image: config.backgroundImage || undefined,
				mcp_servers: config.mcpServers?.length ? config.mcpServers : undefined,
				padding_left: config.padding_left,
				padding_top: config.padding_top,
				padding_height: config.padding_height
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

		return json({ persoInteractiveApiServerUrl, sessionId, introMessage });
	} catch (err) {
		if (err instanceof DoesNotExistError) {
			return json(err, { status: 400 });
		} else if (err instanceof NotInOrganizationError) {
			return json(err, { status: 403 });
		} else if (err instanceof SessionCreationError) {
			return json(err, { status: err.errorCode });
		} else if (err instanceof ApiError) {
			return json(err, { status: err.errorCode });
		}
		const message = err instanceof Error ? err.message : 'An unknown error occurred.';
		return json({ name: 'Error', message }, { status: 500 });
	}
}
