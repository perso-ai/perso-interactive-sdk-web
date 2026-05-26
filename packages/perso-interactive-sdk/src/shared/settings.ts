import { PersoUtil, type TextNormalizationDownload } from './perso_util';
import { resolveApiServer } from './api-server';
import type { SessionTemplate } from './types';

export type ApiKeyOptions = { apiKey: string; apiServer?: string };

function isOptions(arg: unknown): arg is ApiKeyOptions {
	return typeof arg === 'object' && arg !== null && !Array.isArray(arg) && 'apiKey' in arg;
}

/**
 * Retrieves the list of available LLM providers from the API.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getLLMs(options: ApiKeyOptions): ReturnType<typeof PersoUtil.getLLMs>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getLLMs(
	apiServer: string,
	apiKey: string
): ReturnType<typeof PersoUtil.getLLMs>;
export async function getLLMs(
	arg1: string | ApiKeyOptions,
	arg2?: string
): ReturnType<typeof PersoUtil.getLLMs> {
	if (isOptions(arg1)) {
		return await PersoUtil.getLLMs(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getLLMs(resolveApiServer(arg1), arg2 as string);
}

/**
 * Retrieves available TTS providers.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getTTSs(options: ApiKeyOptions): ReturnType<typeof PersoUtil.getTTSs>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getTTSs(
	apiServer: string,
	apiKey: string
): ReturnType<typeof PersoUtil.getTTSs>;
export async function getTTSs(
	arg1: string | ApiKeyOptions,
	arg2?: string
): ReturnType<typeof PersoUtil.getTTSs> {
	if (isOptions(arg1)) {
		return await PersoUtil.getTTSs(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getTTSs(resolveApiServer(arg1), arg2 as string);
}

/**
 * Retrieves available STT providers.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getSTTs(options: ApiKeyOptions): ReturnType<typeof PersoUtil.getSTTs>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getSTTs(
	apiServer: string,
	apiKey: string
): ReturnType<typeof PersoUtil.getSTTs>;
export async function getSTTs(
	arg1: string | ApiKeyOptions,
	arg2?: string
): ReturnType<typeof PersoUtil.getSTTs> {
	if (isOptions(arg1)) {
		return await PersoUtil.getSTTs(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getSTTs(resolveApiServer(arg1), arg2 as string);
}

/**
 * Fetches avatar model styles.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getModelStyles(
	options: ApiKeyOptions
): ReturnType<typeof PersoUtil.getModelStyles>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getModelStyles(
	apiServer: string,
	apiKey: string
): ReturnType<typeof PersoUtil.getModelStyles>;
export async function getModelStyles(
	arg1: string | ApiKeyOptions,
	arg2?: string
): ReturnType<typeof PersoUtil.getModelStyles> {
	if (isOptions(arg1)) {
		return await PersoUtil.getModelStyles(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getModelStyles(resolveApiServer(arg1), arg2 as string);
}

/**
 * Fetches preset background images.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getBackgroundImages(
	options: ApiKeyOptions
): ReturnType<typeof PersoUtil.getBackgroundImages>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getBackgroundImages(
	apiServer: string,
	apiKey: string
): ReturnType<typeof PersoUtil.getBackgroundImages>;
export async function getBackgroundImages(
	arg1: string | ApiKeyOptions,
	arg2?: string
): ReturnType<typeof PersoUtil.getBackgroundImages> {
	if (isOptions(arg1)) {
		return await PersoUtil.getBackgroundImages(
			resolveApiServer(arg1.apiServer),
			arg1.apiKey
		);
	}
	return await PersoUtil.getBackgroundImages(resolveApiServer(arg1), arg2 as string);
}

/**
 * Returns predefined prompt templates.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getPrompts(
	options: ApiKeyOptions
): ReturnType<typeof PersoUtil.getPrompts>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getPrompts(
	apiServer: string,
	apiKey: string
): ReturnType<typeof PersoUtil.getPrompts>;
export async function getPrompts(
	arg1: string | ApiKeyOptions,
	arg2?: string
): ReturnType<typeof PersoUtil.getPrompts> {
	if (isOptions(arg1)) {
		return await PersoUtil.getPrompts(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getPrompts(resolveApiServer(arg1), arg2 as string);
}

/**
 * Returns supporting document metadata usable by the session.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getDocuments(
	options: ApiKeyOptions
): ReturnType<typeof PersoUtil.getDocuments>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getDocuments(
	apiServer: string,
	apiKey: string
): ReturnType<typeof PersoUtil.getDocuments>;
export async function getDocuments(
	arg1: string | ApiKeyOptions,
	arg2?: string
): ReturnType<typeof PersoUtil.getDocuments> {
	if (isOptions(arg1)) {
		return await PersoUtil.getDocuments(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getDocuments(resolveApiServer(arg1), arg2 as string);
}

/**
 * Lists MCP server identifiers configured for the tenant.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getMcpServers(
	options: ApiKeyOptions
): ReturnType<typeof PersoUtil.getMcpServers>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getMcpServers(
	apiServer: string,
	apiKey: string
): ReturnType<typeof PersoUtil.getMcpServers>;
export async function getMcpServers(
	arg1: string | ApiKeyOptions,
	arg2?: string
): ReturnType<typeof PersoUtil.getMcpServers> {
	if (isOptions(arg1)) {
		return await PersoUtil.getMcpServers(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getMcpServers(resolveApiServer(arg1), arg2 as string);
}

/**
 * Retrieves available text normalization options.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getTextNormalizations(
	options: ApiKeyOptions
): ReturnType<typeof PersoUtil.getTextNormalizations>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getTextNormalizations(
	apiServer: string,
	apiKey: string
): ReturnType<typeof PersoUtil.getTextNormalizations>;
export async function getTextNormalizations(
	arg1: string | ApiKeyOptions,
	arg2?: string
): ReturnType<typeof PersoUtil.getTextNormalizations> {
	if (isOptions(arg1)) {
		return await PersoUtil.getTextNormalizations(
			resolveApiServer(arg1.apiServer),
			arg1.apiKey
		);
	}
	return await PersoUtil.getTextNormalizations(resolveApiServer(arg1), arg2 as string);
}

export type GetTextNormalizationOptions = {
	apiKey: string;
	configId: string;
	apiServer?: string;
};

/**
 * Downloads the ruleset data file for a Text Normalization Config.
 * Returns a pre-signed Blob Storage URL for the CSV file.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.configId Identifier of the Text Normalization Config to download.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getTextNormalization(
	options: GetTextNormalizationOptions
): Promise<TextNormalizationDownload>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @param configId Identifier of the Text Normalization Config to download.
 */
export async function getTextNormalization(
	apiServer: string,
	apiKey: string,
	configId: string
): Promise<TextNormalizationDownload>;
export async function getTextNormalization(
	arg1: string | GetTextNormalizationOptions,
	arg2?: string,
	arg3?: string
): Promise<TextNormalizationDownload> {
	if (typeof arg1 === 'object') {
		return await PersoUtil.downloadTextNormalization(
			resolveApiServer(arg1.apiServer),
			arg1.apiKey,
			arg1.configId
		);
	}
	return await PersoUtil.downloadTextNormalization(
		resolveApiServer(arg1),
		arg2 as string,
		arg3 as string
	);
}

/**
 * Retrieves the list of session templates.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getSessionTemplates(
	options: ApiKeyOptions
): Promise<SessionTemplate[]>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getSessionTemplates(
	apiServer: string,
	apiKey: string
): Promise<SessionTemplate[]>;
export async function getSessionTemplates(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<SessionTemplate[]> {
	if (isOptions(arg1)) {
		return await PersoUtil.getSessionTemplates(
			resolveApiServer(arg1.apiServer),
			arg1.apiKey
		);
	}
	return await PersoUtil.getSessionTemplates(resolveApiServer(arg1), arg2 as string);
}

export type GetSessionTemplateOptions = {
	apiKey: string;
	sessionTemplateId: string;
	apiServer?: string;
};

/**
 * Retrieves a single session template by ID.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.sessionTemplateId Identifier of the session template to fetch.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getSessionTemplate(
	options: GetSessionTemplateOptions
): Promise<SessionTemplate>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @param sessionTemplateId Identifier of the session template to fetch.
 */
export async function getSessionTemplate(
	apiServer: string,
	apiKey: string,
	sessionTemplateId: string
): Promise<SessionTemplate>;
export async function getSessionTemplate(
	arg1: string | GetSessionTemplateOptions,
	arg2?: string,
	arg3?: string
): Promise<SessionTemplate> {
	if (typeof arg1 === 'object') {
		return await PersoUtil.getSessionTemplate(
			resolveApiServer(arg1.apiServer),
			arg1.apiKey,
			arg1.sessionTemplateId
		);
	}
	return await PersoUtil.getSessionTemplate(
		resolveApiServer(arg1),
		arg2 as string,
		arg3 as string
	);
}

type AllSettings = {
	llms: Awaited<ReturnType<typeof PersoUtil.getLLMs>>;
	ttsTypes: Awaited<ReturnType<typeof PersoUtil.getTTSs>>;
	sttTypes: Awaited<ReturnType<typeof PersoUtil.getSTTs>>;
	modelStyles: Awaited<ReturnType<typeof PersoUtil.getModelStyles>>;
	backgroundImages: Awaited<ReturnType<typeof PersoUtil.getBackgroundImages>>;
	prompts: Awaited<ReturnType<typeof PersoUtil.getPrompts>>;
	documents: Awaited<ReturnType<typeof PersoUtil.getDocuments>>;
	mcpServers: Awaited<ReturnType<typeof PersoUtil.getMcpServers>>;
	textNormalizations: Awaited<ReturnType<typeof PersoUtil.getTextNormalizations>> | [];
};

/**
 * Convenience helper that fetches every dropdown-friendly resource needed to
 * build a Perso session configuration screen in one call chain.
 *
 * @param options.apiKey API key used for authentication.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getAllSettings(options: ApiKeyOptions): Promise<AllSettings>;
/**
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getAllSettings(
	apiServer: string,
	apiKey: string
): Promise<AllSettings>;
export async function getAllSettings(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<AllSettings> {
	const resolved = isOptions(arg1)
		? { apiServer: resolveApiServer(arg1.apiServer), apiKey: arg1.apiKey }
		: { apiServer: resolveApiServer(arg1), apiKey: arg2 as string };

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
		PersoUtil.getLLMs(resolved.apiServer, resolved.apiKey),
		PersoUtil.getTTSs(resolved.apiServer, resolved.apiKey),
		PersoUtil.getSTTs(resolved.apiServer, resolved.apiKey),
		PersoUtil.getModelStyles(resolved.apiServer, resolved.apiKey),
		PersoUtil.getBackgroundImages(resolved.apiServer, resolved.apiKey),
		PersoUtil.getPrompts(resolved.apiServer, resolved.apiKey),
		PersoUtil.getDocuments(resolved.apiServer, resolved.apiKey),
		PersoUtil.getMcpServers(resolved.apiServer, resolved.apiKey),
		PersoUtil.getTextNormalizations(resolved.apiServer, resolved.apiKey).catch(
			() => [] as never[]
		)
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

type MakeTTSParams = {
	sessionId: string;
	text: string;
	locale?: string;
	output_format?: string;
};

export type MakeTTSOptions = MakeTTSParams & { apiServer?: string };

/**
 * Sends text to the TTS API and returns Base64-encoded audio.
 *
 * @param options.sessionId Identifier of the active session.
 * @param options.text Text to synthesize.
 * @param options.locale Optional locale override for the TTS voice.
 * @param options.output_format Optional output audio format.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function makeTTS(options: MakeTTSOptions): Promise<{ audio: string }>;
/**
 * @param apiServer Perso API server URL.
 * @param params TTS request parameters (`sessionId`, `text`, optional `locale`, `output_format`).
 */
export async function makeTTS(
	apiServer: string,
	params: MakeTTSParams
): Promise<{ audio: string }>;
export async function makeTTS(
	arg1: string | MakeTTSOptions,
	arg2?: MakeTTSParams
): Promise<{ audio: string }> {
	if (typeof arg1 === 'object') {
		const { apiServer, ...params } = arg1;
		return await PersoUtil.makeTTS(resolveApiServer(apiServer), params);
	}
	return await PersoUtil.makeTTS(resolveApiServer(arg1), arg2 as MakeTTSParams);
}

export type GetSessionInfoOptions = { sessionId: string; apiServer?: string };

/**
 * Retrieves metadata for an existing session.
 *
 * @param options.sessionId Identifier of the session to look up.
 * @param options.apiServer Perso API server URL. Defaults to `https://platform.perso.ai`.
 */
export async function getSessionInfo(
	options: GetSessionInfoOptions
): ReturnType<typeof PersoUtil.getSessionInfo>;
/**
 * @param apiServer Perso API server URL.
 * @param sessionId Identifier of the session to look up.
 */
export async function getSessionInfo(
	apiServer: string,
	sessionId: string
): ReturnType<typeof PersoUtil.getSessionInfo>;
export async function getSessionInfo(
	arg1: string | GetSessionInfoOptions,
	arg2?: string
): ReturnType<typeof PersoUtil.getSessionInfo> {
	if (typeof arg1 === 'object') {
		return await PersoUtil.getSessionInfo(resolveApiServer(arg1.apiServer), arg1.sessionId);
	}
	return await PersoUtil.getSessionInfo(resolveApiServer(arg1), arg2 as string);
}
