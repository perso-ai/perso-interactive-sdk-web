import { PersoUtil } from '../shared';
import type { TextNormalizationDownload } from '../shared/perso_util';
export type { TextNormalizationDownload } from '../shared/perso_util';
export type {
	SessionTemplate,
	Prompt,
	LLMType,
	TTSType,
	STTType,
	ModelStyle,
	BackgroundImage,
	Document,
	MCPServer,
	SessionCapability,
	TextNormalizationConfig,
	ModelStyleConfig,
	AIHumanModelFile
} from '../shared/types';
import {
	type Chat,
	ChatState,
	ChatTool,
	type LLMStreamChunk,
	type ProcessLLMOptions
} from './types';
import { createSession as cs, Session } from './session';
import {
	LlmProcessor,
	type LlmProcessorCallbacks,
	type LlmProcessorConfig
} from './llm';
import { WavRecorder, createWavRecorder, type WavRecorderOptions } from './wav-recorder';

export {
	ChatState,
	ChatTool,
	type Chat,
	type LLMStreamChunk,
	type ProcessLLMOptions,
	Session,
	// LLM processing
	LlmProcessor,
	type LlmProcessorCallbacks,
	type LlmProcessorConfig,
	// Audio recording
	WavRecorder,
	createWavRecorder,
	type WavRecorderOptions
};

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
export async function getTextNormalization(apiServer: string, apiKey: string, configId: string): Promise<TextNormalizationDownload> {
	return await PersoUtil.downloadTextNormalization(apiServer, apiKey, configId);
}

export async function getMcpServers(apiServer: string, apiKey: string) {
	return await PersoUtil.getMcpServers(apiServer, apiKey);
}

/**
 * Retrieves the list of session templates.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getSessionTemplates(apiServer: string, apiKey: string) {
	return await PersoUtil.getSessionTemplates(apiServer, apiKey);
}

/**
 * Convenience helper that fetches every dropdown-friendly resource needed to
 * build a Perso session configuration screen in one call chain.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @returns Object containing arrays for LLMs, TTS/STT types, model styles, etc.
 */
export async function getAllSettings(apiServer: string, apiKey: string) {
	const [llms, ttsTypes, sttTypes, modelStyles, backgroundImages, prompts, documents, mcpServers, textNormalizations] =
		await Promise.all([
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
 * Creates a Session with REST-based STT/TTS (current mode).
 */
export function createSession(
	apiServer: string,
	sessionId: string,
	width: number,
	height: number,
	clientTools: Array<ChatTool>
): Promise<Session>;
/**
 * Creates a Session with bidirectional WebRTC audio (legacy mode).
 * @deprecated Legacy voice chat mode will be removed in a future version.
 *   Use the 5-argument overload with REST-based STT/TTS instead.
 */
export function createSession(
	apiServer: string,
	sessionId: string,
	width: number,
	height: number,
	enableVoiceChat: boolean,
	clientTools: Array<ChatTool>
): Promise<Session>;
export async function createSession(
	apiServer: string,
	sessionId: string,
	width: number,
	height: number,
	enableVoiceChatOrClientTools: boolean | Array<ChatTool>,
	clientTools?: Array<ChatTool>
): Promise<Session> {
	if (typeof enableVoiceChatOrClientTools === 'boolean') {
		return await cs(apiServer, sessionId, width, height, enableVoiceChatOrClientTools, clientTools ?? []);
	}
	return await cs(apiServer, sessionId, width, height, enableVoiceChatOrClientTools);
}

/**
 * Retrieves metadata for an existing session.
 * @param apiServer Perso API server URL.
 * @param sessionId Session id to inspect.
 */
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

export async function getSessionInfo(apiServer: string, sessionId: string) {
	return await PersoUtil.getSessionInfo(apiServer, sessionId);
}

