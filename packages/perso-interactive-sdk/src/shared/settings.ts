import { PersoUtil, type TextNormalizationDownload } from './perso_util';
import type { SessionTemplate } from './types';

/**
 * Retrieves the list of available LLM providers from the API.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @returns Promise resolving with LLM metadata.
 */
export async function getLLMs(apiServer: string, apiKey: string) {
	return await PersoUtil.getLLMs(apiServer, apiKey);
}

/**
 * Retrieves available TTS providers.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getTTSs(apiServer: string, apiKey: string) {
	return await PersoUtil.getTTSs(apiServer, apiKey);
}

/**
 * Retrieves available STT providers.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getSTTs(apiServer: string, apiKey: string) {
	return await PersoUtil.getSTTs(apiServer, apiKey);
}

/**
 * Fetches avatar model styles.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getModelStyles(apiServer: string, apiKey: string) {
	return await PersoUtil.getModelStyles(apiServer, apiKey);
}

/**
 * Fetches preset background images.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getBackgroundImages(apiServer: string, apiKey: string) {
	return await PersoUtil.getBackgroundImages(apiServer, apiKey);
}

/**
 * Returns predefined prompt templates.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getPrompts(apiServer: string, apiKey: string) {
	return await PersoUtil.getPrompts(apiServer, apiKey);
}

/**
 * Returns supporting document metadata usable by the session.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getDocuments(apiServer: string, apiKey: string) {
	return await PersoUtil.getDocuments(apiServer, apiKey);
}

/**
 * Lists MCP server identifiers configured for the tenant.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getMcpServers(apiServer: string, apiKey: string) {
	return await PersoUtil.getMcpServers(apiServer, apiKey);
}

/**
 * Retrieves available text normalization options.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getTextNormalizations(apiServer: string, apiKey: string) {
	return await PersoUtil.getTextNormalizations(apiServer, apiKey);
}

/**
 * Downloads the ruleset data file for a Text Normalization Config.
 * Returns a pre-signed Blob Storage URL for the CSV file.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @param configId Text Normalization Config ID.
 */
export async function getTextNormalization(
	apiServer: string,
	apiKey: string,
	configId: string
): Promise<TextNormalizationDownload> {
	return await PersoUtil.downloadTextNormalization(apiServer, apiKey, configId);
}

/**
 * Retrieves the list of session templates.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getSessionTemplates(
	apiServer: string,
	apiKey: string
): Promise<SessionTemplate[]> {
	return await PersoUtil.getSessionTemplates(apiServer, apiKey);
}

/**
 * Retrieves a single session template by ID.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @param sessionTemplateId Session Template ID.
 */
export async function getSessionTemplate(
	apiServer: string,
	apiKey: string,
	sessionTemplateId: string
): Promise<SessionTemplate> {
	return await PersoUtil.getSessionTemplate(apiServer, apiKey, sessionTemplateId);
}

/**
 * Convenience helper that fetches every dropdown-friendly resource needed to
 * build a Perso session configuration screen in one call chain.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @returns Object containing arrays for LLMs, TTS/STT types, model styles, etc.
 */
export async function getAllSettings(apiServer: string, apiKey: string) {
	const [
		llms,
		ttsTypes,
		sttTypes,
		modelStyles,
		backgroundImages,
		prompts,
		documents,
		mcpServers,
		textNormalizations
	] = await Promise.all([
		getLLMs(apiServer, apiKey),
		getTTSs(apiServer, apiKey),
		getSTTs(apiServer, apiKey),
		getModelStyles(apiServer, apiKey),
		getBackgroundImages(apiServer, apiKey),
		getPrompts(apiServer, apiKey),
		getDocuments(apiServer, apiKey),
		getMcpServers(apiServer, apiKey),
		getTextNormalizations(apiServer, apiKey).catch(() => [])
	]);

	return {
		llms,
		ttsTypes,
		sttTypes,
		modelStyles,
		backgroundImages,
		prompts,
		documents,
		mcpServers,
		textNormalizations
	};
}

/**
 * Sends text to the TTS API and returns Base64-encoded audio.
 * @param apiServer Perso API server URL.
 * @param params Session ID and text to synthesize.
 * @returns Object with Base64 audio string.
 */
export async function makeTTS(
	apiServer: string,
	params: { sessionId: string; text: string; locale?: string; output_format?: string }
): Promise<{ audio: string }> {
	return await PersoUtil.makeTTS(apiServer, params);
}

/**
 * Retrieves metadata for an existing session.
 * @param apiServer Perso API server URL.
 * @param sessionId Session id to inspect.
 */
export async function getSessionInfo(apiServer: string, sessionId: string) {
	return await PersoUtil.getSessionInfo(apiServer, sessionId);
}
