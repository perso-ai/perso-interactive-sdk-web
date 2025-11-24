import { persoInteractiveApiServerUrl, persoInteractiveApiKey } from '$lib/constant';

// TODO Added to bypass the in-house TLS MITM issue; remove for production builds.
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

// example
const allConfig = await getAllConfig();

/**
 * @description
 * 	- Provide the Perso Interactive configuration overrides used by this sample.
 * 	- Fetches the Perso Interactive metadata (LLM, TTS/STT, prompts, etc.) from the API server.
 * 	- Warning: Do not reference LLM/TTS/STT entries by array index in production; the sample below is for illustration only.
 * @returns Perso Interactive configuration object
 * @example
 * {
 * 	llm: 'gpt-4o', // see getLLMs
 * 	tts: 'tts-1', // see getTTSs
 * 	stt: 'stt-1', // see getSTTs
 * 	modelStyle: 'model-1', // see getModelStyles
 * 	prompt: 'prompt-1', // see getPrompts
 * 	document: 'document-1', // see getDocuments
 * 	backgroundImage: 'backgroundImage-1', // see getBackgroundImages
 * 	mcpServers: ['mcp-1', 'mcp-2'], // see getMcpServers
 * 	introMessage: 'introMessage-1', // see getPrompts
 * 	padding_left: 0.0, // range: -1.0 ~ 1.0
 * 	padding_top: 0.0, // range: 0.0 ~ 1.0
 * 	padding_height: 1.0 // range: 0.0 ~ 5.0
 * }
 * */
export const config = {
	llm: allConfig.llms[0].name,
	tts: allConfig.ttss[0].name,
	stt: allConfig.stts[0].name,
	modelStyle: allConfig.modelStyles[0].name,
	prompt: allConfig.prompts[0].prompt_id,
	document: allConfig.documents.length > 0 ? allConfig.documents[0].document_id : null,
	backgroundImage:
		allConfig.backgroundImages.length > 0 ? allConfig.backgroundImages[0].backgroundimage_id : null,
	mcpServers: (allConfig.mcpServers as Array<any>).map((value) => {
		return value.mcpserver_id;
	}),
	introMessage: allConfig.prompts[0].intro_message,
	padding_left: 0.0,
	padding_top: 0.15,
	padding_height: 1.0
};

async function getAllConfig() {
	const llms = await getLLMs(persoInteractiveApiServerUrl, persoInteractiveApiKey);
	const ttss = await getTTSs(persoInteractiveApiServerUrl, persoInteractiveApiKey);
	const stts = await getSTTs(persoInteractiveApiServerUrl, persoInteractiveApiKey);
	const modelStyles = await getModelStyles(persoInteractiveApiServerUrl, persoInteractiveApiKey);
	const backgroundImages = await getBackgroundImages(
		persoInteractiveApiServerUrl,
		persoInteractiveApiKey
	);
	const mcpServers = await getMcpServers(persoInteractiveApiServerUrl, persoInteractiveApiKey);
	const prompts = await getPrompts(persoInteractiveApiServerUrl, persoInteractiveApiKey);
	const documents = await getDocuments(persoInteractiveApiServerUrl, persoInteractiveApiKey);

	return {
		llms,
		ttss,
		stts,
		modelStyles,
		mcpServers,
		prompts,
		documents,
		backgroundImages
	};
}

/**
 * @param apiServer Perso Interactive API Server
 * @param apiKey Perso Interactive API Key
 * @returns JSON
 * [
 *   {
 *     "name": string
 *   }
 * ]
 */
async function getLLMs(apiServer: string, apiKey: string) {
	const response = await fetch(`${apiServer}/api/v1/settings/llm_type/`, {
		headers: {
			'PersoLive-APIKey': apiKey
		},
		method: 'GET'
	});

	return await response.json();
}

/**
 * @param apiServer Perso Interactive API Server
 * @param apiKey Perso Interactive API Key
 * @returns JSON
 * [
 *   {
 *     "name": string,
 *     "service": string,
 *     "speaker": string
 *   }
 * ]
 */
async function getTTSs(apiServer: string, apiKey: string) {
	const response = await fetch(`${apiServer}/api/v1/settings/tts_type/`, {
		headers: {
			'PersoLive-APIKey': apiKey
		},
		method: 'GET'
	});

	return await response.json();
}

/**
 * @param apiServer Perso Interactive API Server
 * @param apiKey Perso Interactive API Key
 * @returns JSON
 * [
 *   {
 *     "name": string,
 *     "service": string,
 *     "options": string
 *   }
 * ]
 */
async function getSTTs(apiServer: string, apiKey: string) {
	const response = await fetch(`${apiServer}/api/v1/settings/stt_type/`, {
		headers: {
			'PersoLive-APIKey': apiKey
		},
		method: 'GET'
	});

	return await response.json();
}

/**
 * @param apiServer Perso Interactive API Server
 * @param apiKey Perso Interactive API Key
 * @returns JSON
 * [
 *   {
 *     "name": string,
 *     "model": string,
 *     "style": string
 *   }
 * ]
 */
async function getModelStyles(apiServer: string, apiKey: string) {
	const response = await fetch(`${apiServer}/api/v1/settings/modelstyle/?platform_type=webrtc`, {
		headers: {
			'PersoLive-APIKey': apiKey
		},
		method: 'GET'
	});

	return await response.json();
}

/**
 * @param apiServer Perso Interactive API Server
 * @param apiKey Perso Interactive API Key
 * @returns JSON
 * [
 *   {
 *     "backgroundimage_id": string,
 *     "title": string,
 *     "image": string
 *     "created_at": string // ex) "2024-05-02T09:05:55.395Z"
 *   }
 * ]
 */
async function getBackgroundImages(apiServer: string, apiKey: string) {
	const response = await fetch(`${apiServer}/api/v1/background_image/`, {
		headers: {
			'PersoLive-APIKey': apiKey
		},
		method: 'GET'
	});

	return await response.json();
}

/**
 * @param apiServer Perso Interactive API Server
 * @param apiKey Perso Interactive API Key
 * @returns JSON
 * [
 *   {
 *     "mcpserver_id": string,
 *     "name": string,
 *     "url": string
 *     "description": string"
 *   }
 * ]
 */
async function getMcpServers(apiServer: string, apiKey: string) {
	const response = await fetch(`${apiServer}/api/v1/settings/mcp_type/`, {
		headers: {
			'PersoLive-APIKey': apiKey
		},
		method: 'GET'
	});

	return await response.json();
}

/**
 * @param apiServer Perso Interactive API Server
 * @param apiKey Perso Interactive API Key
 * @returns JSON
 * [
 *   {
 *     "name": string,
 *     "description": string,
 *     "prompt_id": string,
 *     "system_prompt": string,
 *     "require_document": boolean,
 *     "intro_message": string
 *   }
 * ]
 */
async function getPrompts(apiServer: string, apiKey: string) {
	const response = await fetch(`${apiServer}/api/v1/prompt/`, {
		headers: {
			'PersoLive-APIKey': apiKey
		},
		method: 'GET'
	});

	return await response.json();
}

/**
 * @param apiServer Perso Interactive API Server
 * @param apiKey Perso Interactive API Key
 * @returns JSON
 * [
 *   {
 *     "document_id": string,
 *     "title": string,
 *     "description": string,
 *     "search_count": number,,
 *     "processed": boolean,
 *     "created_at": string, // ex) "2024-05-02T09:05:55.395Z",
 *     "updated_at": string // ex) "2024-05-02T09:05:55.395Z"
 *   }
 * ]
 */
async function getDocuments(apiServer: string, apiKey: string) {
	const response = await fetch(`${apiServer}/api/v1/document/`, {
		headers: {
			'PersoLive-APIKey': apiKey
		},
		method: 'GET'
	});

	return await response.json();
}
