import { ApiError, PersoUtil, SessionCapabilityName } from '../shared';
import type { SessionTemplate } from '../shared/types';

type CreateSessionIdBody = {
	using_stf_webrtc: boolean;
	model_style: string;
	prompt: string;
	document?: string;
	background_image?: string;
	mcp_servers?: Array<string>;
	padding_left?: number;
	padding_top?: number;
	padding_height?: number;
	llm_type?: string;
	tts_type?: string;
	stt_type?: string;
	text_normalization_config?: string;
	text_normalization_locale?: string | null;
	stt_text_normalization_config?: string;
	stt_text_normalization_locale?: string | null;
};

/**
 * Requests a new session creation ID by POSTing the desired runtime options to
 * the Perso backend (`/api/v1/session/`).
 *
 * WARNING: This function requires an API key. When using this function in
 * client-side code, the API key will be exposed to the browser. For production
 * use, prefer creating session IDs server-side using `perso-interactive-sdk-web/server`.
 *
 * @overload Creates a session from a SessionTemplate ID. Internally calls
 * `getSessionTemplate` to resolve the template and maps it to the request body.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @param sessionTemplateId SessionTemplate ID to resolve configuration from.
 * @returns Session ID returned by the server.
 * @throws {Error} If the template's `model_style.platform_type` is not `"webrtc"`.
 * @throws {ApiError} If the template ID is invalid or API call fails.
 */
export async function createSessionId(
	apiServer: string,
	apiKey: string,
	sessionTemplateId: string
): Promise<string>;
/**
 * @overload Creates a session from explicit runtime options.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @param params Runtime options for the session.
 * @returns Session ID returned by the server.
 */
export async function createSessionId(
	apiServer: string,
	apiKey: string,
	params: CreateSessionIdBody
): Promise<string>;
export async function createSessionId(
	apiServer: string,
	apiKey: string,
	paramsOrTemplateId: CreateSessionIdBody | string
): Promise<string> {
	// 브라우저 환경에서 API 키 노출 경고
	if (typeof window !== 'undefined') {
		console.warn(
			'[perso-interactive-sdk-web] WARNING: createSessionId is being called from the browser. ' +
				'This exposes your API key and is not recommended for production. ' +
				"Use server-side session creation with 'perso-interactive-sdk-web/server' instead. " +
				'See: https://github.com/perso-ai/perso-interactive-sdk-web#server-side'
		);
	}

	let params: CreateSessionIdBody;

	if (typeof paramsOrTemplateId === 'string') {
		const template = await PersoUtil.getSessionTemplate(apiServer, apiKey, paramsOrTemplateId);

		if (template.model_style.platform_type !== 'webrtc') {
			throw new Error(
				`SessionTemplate "${paramsOrTemplateId}" uses platform_type "${template.model_style.platform_type}", but only "webrtc" is supported`
			);
		}

		params = sessionTemplateToParams(template);
	} else {
		params = paramsOrTemplateId;
	}

	const body: CreateSessionIdBody & {
		capability: Array<SessionCapabilityName>;
	} = {
		capability: [],
		...params
	};

	if (params.using_stf_webrtc) {
		body.capability.push(SessionCapabilityName.STF_WEBRTC);
	}
	if (params?.llm_type) {
		body.capability.push(SessionCapabilityName.LLM);
		body.llm_type = params.llm_type;
	}
	if (params?.tts_type) {
		body.capability.push(SessionCapabilityName.TTS);
		body.tts_type = params.tts_type;
	}
	if (params?.stt_type) {
		body.capability.push(SessionCapabilityName.STT);
		body.stt_type = params.stt_type;
	}

	const response = await fetch(`${apiServer}/api/v1/session/`, {
		body: JSON.stringify(body),
		headers: {
			'PersoLive-APIKey': apiKey,
			'Content-Type': 'application/json'
		},
		method: 'POST'
	});

	const json = await PersoUtil.parseJson(response);
	return json.session_id as string;
}

function sessionTemplateToParams(template: SessionTemplate): CreateSessionIdBody {
	const hasCapability = (name: SessionCapabilityName) =>
		template.capability.some((c) => c.name === name);

	return {
		using_stf_webrtc: hasCapability(SessionCapabilityName.STF_WEBRTC),
		model_style: template.model_style.name,
		prompt: template.prompt.prompt_id,
		document: template.document?.document_id,
		background_image: template.background_image?.backgroundimage_id,
		mcp_servers: template.mcp_servers?.length
			? template.mcp_servers.map((m) => m.mcpserver_id)
			: [],
		llm_type: hasCapability(SessionCapabilityName.LLM) ? template.llm_type.name : undefined,
		tts_type: hasCapability(SessionCapabilityName.TTS) ? template.tts_type.name : undefined,
		stt_type: hasCapability(SessionCapabilityName.STT) ? template.stt_type.name : undefined,
		text_normalization_config: template.text_normalization_config?.textnormalizationconfig_id,
		text_normalization_locale: template.text_normalization_locale,
		stt_text_normalization_config: template.stt_text_normalization_config?.textnormalizationconfig_id,
		stt_text_normalization_locale: template.stt_text_normalization_locale,
		padding_left: template.padding_left ?? undefined,
		padding_top: template.padding_top ?? undefined,
		padding_height: template.padding_height ?? undefined
	};
}

type PromptMetadata = {
	prompt_id: string;
	intro_message: string;
};

/**
 * Retrieves the intro message for a specific prompt.
 *
 * WARNING: This function requires an API key. When using this function in
 * client-side code, the API key will be exposed to the browser. For production
 * use, prefer fetching intro messages server-side using `perso-interactive-sdk-web/server`.
 *
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @param promptId The prompt ID to fetch intro message for.
 * @returns The intro message string.
 */
export const getIntroMessage = async (apiServer: string, apiKey: string, promptId: string) => {
	try {
		const prompts = (await PersoUtil.getPrompts(apiServer, apiKey)) as PromptMetadata[];
		const prompt = prompts.find((item) => item.prompt_id === promptId);

		if (!prompt) {
			throw new Error(`Prompt (${promptId}) not found`, { cause: 404 });
		}

		return prompt.intro_message;
	} catch (err: unknown) {
		if (err instanceof ApiError) {
			throw new Error(err.detail, { cause: err.errorCode ?? 500 });
		}

		throw err;
	}
};
