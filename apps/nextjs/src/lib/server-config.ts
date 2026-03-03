import { persoInteractiveApiServerUrl, persoInteractiveApiKey } from './constant';
import { PersoUtilServer } from 'perso-interactive-sdk-web/server';

interface Config {
	llm: string;
	tts: string;
	stt: string;
	modelStyle: string;
	prompt: string;
	document: string | null;
	backgroundImage: string | null;
	mcpServers: string[];
	introMessage: string;
	padding_left: number;
	padding_top: number;
	padding_height: number;
}

let cachedConfig: Config | null = null;

/**
 * @description
 * 	- Provide the Perso Interactive configuration overrides used by this sample.
 * 	- Fetches the Perso Interactive metadata (LLM, TTS/STT, prompts, etc.) from the API server.
 * 	- Warning: Do not reference LLM/TTS/STT entries by array index in production; the sample below is for illustration only.
 * @returns Perso Interactive configuration object
 */
export async function getConfig(): Promise<Config> {
	if (cachedConfig) return cachedConfig;

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
	const prompts = await PersoUtilServer.getPrompts(
		persoInteractiveApiServerUrl,
		persoInteractiveApiKey
	);
	const documents = await PersoUtilServer.getDocuments(
		persoInteractiveApiServerUrl,
		persoInteractiveApiKey
	);

	if (!llms.length || !ttss.length || !stts.length || !modelStyles.length || !prompts.length) {
		throw new Error('Required API resources are empty (LLMs, TTSs, STTs, ModelStyles, or Prompts)');
	}

	cachedConfig = {
		llm: llms[0].name,
		tts: ttss[0].name,
		stt: stts[0].name,
		modelStyle: modelStyles[0].name,
		prompt: prompts[0].prompt_id,
		document: documents.length > 0 ? documents[0].document_id : null,
		backgroundImage:
			backgroundImages.length > 0 ? backgroundImages[0].backgroundimage_id : null,
		mcpServers: [],
		introMessage: prompts[0].intro_message,
		padding_left: 0.0,
		padding_top: 0.15,
		padding_height: 1.0
	};

	return cachedConfig;
}
