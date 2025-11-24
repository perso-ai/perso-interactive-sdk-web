import { persoInteractiveApiKey, persoInteractiveApiServerUrl } from '$lib/constant';
import { error } from '@sveltejs/kit';
import { config } from '../../hooks.server';

async function createSessionId(
	apiServer: string,
	apiKey: string,
	llm_type: string | null,
	tts_type: string | null,
	stt_type: string | null,
	model_style: string,
	prompt: string,
	document?: string,
	background_image?: string,
	mcp_servers?: Array<string>,
	padding_left?: number,
	padding_top?: number,
	padding_height?: number
) {
	const response = await fetch(`${apiServer}/api/v1/session/`, {
		body: JSON.stringify({
			capability: ['STF_WEBRTC', 'LLM'],
			llm_type,
			tts_type,
			stt_type,
			model_style,
			prompt,
			document,
			background_image,
			mcp_servers,
			padding_left,
			padding_top,
			padding_height
		}),
		headers: {
			'PersoLive-APIKey': apiKey,
			'Content-Type': 'application/json'
		},
		method: 'POST'
	});

	if (!response.ok) {
		throw error(408, await response.json());
	}

	let json = await response.json();

	return json.session_id;
}

async function getIntroMessage(apiServer: string, apiKey: string, promptId: string) {
	const response = await fetch(`${apiServer}/api/v1/prompt/${promptId}/`, {
		headers: {
			'PersoLive-APIKey': apiKey,
			'Content-Type': 'application/json'
		},
		method: 'GET'
	});

	if (!response.ok) {
		throw error(response.status);
	}

	let json = await response.json();

	return json.intro_message;
}

export async function GET() {
	const sessionId = await createSessionId(
		persoInteractiveApiServerUrl,
		persoInteractiveApiKey,
		config.llm,
		config.tts,
		config.stt,
		config.modelStyle,
		config.prompt,
		config.document,
		config.backgroundImage,
		config.mcpServers,
		config.padding_left,
		config.padding_top,
		config.padding_height
	);

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
