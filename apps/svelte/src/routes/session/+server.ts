import { persoInteractiveApiKey, persoInteractiveApiServerUrl } from '$lib/constant';
import { createSessionId, getIntroMessage } from 'perso-interactive-sdk-web/server';
import { config } from '../../hooks.server';

export async function GET() {
	const sessionId = await createSessionId(persoInteractiveApiServerUrl, persoInteractiveApiKey, {
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
	});

	let introMessage: string = '';
	try {
		introMessage = await getIntroMessage(
			persoInteractiveApiServerUrl,
			persoInteractiveApiKey,
			config.prompt
		);
	} catch (error) {
		console.error('Failed to get intro message:', error);
	}

	return new Response(JSON.stringify({ persoInteractiveApiServerUrl, sessionId, introMessage }), {
		headers: { 'Content-Type': 'application/json' }
	});
}
