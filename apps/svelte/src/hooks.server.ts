import { persoInteractiveApiServerUrl, persoInteractiveApiKey } from '$lib/constant';
import { PersoUtilServer } from 'perso-interactive-sdk-web/server';

// TODO Added to bypass the in-house TLS MITM issue; remove for production builds.
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

// example
const allConfig = await getAllConfig();

// getSTTs() reads the v2 listing, which includes STREAMING types alongside the
// recorded ones. This sample drives STT through the one-shot REST path, which a
// STREAMING type rejects, so the mode is filtered rather than left to list order.
// A server predating the v2 listing omits `mode`; treat that as NON_STREAMING,
// which is all such a server can serve.
const recordedStts = allConfig.stts.filter(
	(stt) => (stt.mode ?? 'NON_STREAMING') === 'NON_STREAMING'
);

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
	stt: recordedStts[0].name,
	modelStyle: allConfig.modelStyles[0].name,
	prompt: allConfig.prompts[0].prompt_id,
	document: allConfig.documents.length > 0 ? allConfig.documents[0].document_id : null,
	backgroundImage:
		allConfig.backgroundImages.length > 0 ? allConfig.backgroundImages[0].backgroundimage_id : null,
	mcpServers: [],
	introMessage: allConfig.prompts[0].intro_message,
	padding_left: 0.0,
	padding_top: 0.15,
	padding_height: 1.0
};

async function getAllConfig() {
	const llms = await PersoUtilServer.getLLMs(persoInteractiveApiServerUrl, persoInteractiveApiKey);
	const ttss = await PersoUtilServer.getTTSs(persoInteractiveApiServerUrl, persoInteractiveApiKey);
	const stts = await PersoUtilServer.getSTTs(persoInteractiveApiServerUrl, persoInteractiveApiKey);
	const modelStyles = await PersoUtilServer.getModelStyles(
		persoInteractiveApiServerUrl,
		persoInteractiveApiKey
	);
	const backgroundImages = await PersoUtilServer.getBackgroundImages(
		persoInteractiveApiServerUrl,
		persoInteractiveApiKey
	);
	const mcpServers = await PersoUtilServer.getMcpServers(
		persoInteractiveApiServerUrl,
		persoInteractiveApiKey
	);
	const prompts = await PersoUtilServer.getPrompts(
		persoInteractiveApiServerUrl,
		persoInteractiveApiKey
	);
	const documents = await PersoUtilServer.getDocuments(
		persoInteractiveApiServerUrl,
		persoInteractiveApiKey
	);

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
