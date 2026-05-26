import { resolveApiServer } from '../shared/api-server';
import { ApiError, wrapSessionCreationApiError } from '../shared/error';
import { PersoUtil, SessionCapabilityName } from '../shared/perso_util';
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

type CreateSessionIdObjectOptions =
	| { apiKey: string; params: CreateSessionIdBody; apiServer?: string }
	| { apiKey: string; sessionTemplateId: string; apiServer?: string };

/** @overload Object-form. Uses DEFAULT_API_SERVER when apiServer is omitted. */
export async function createSessionId(options: CreateSessionIdObjectOptions): Promise<string>;
/** @overload Positional form — SessionTemplate ID. */
export async function createSessionId(
	apiServer: string,
	apiKey: string,
	sessionTemplateId: string
): Promise<string>;
/** @overload Positional form — explicit params. */
export async function createSessionId(
	apiServer: string,
	apiKey: string,
	params: CreateSessionIdBody
): Promise<string>;
/**
 * Requests a new session creation ID by POSTing the desired runtime options to
 * the Perso backend (`/api/v1/session/`).
 *
 * @param apiServerOrOptions Either the Perso API server URL (positional) or an
 *   options object containing `apiKey`, `params|sessionTemplateId`, and
 *   optional `apiServer` (defaults to `https://platform.perso.ai`).
 * @param apiKey API key used for authentication (positional form only).
 * @param paramsOrTemplateId Runtime options for the session, or a
 *   SessionTemplate ID to resolve configuration from (positional form only).
 * @returns Session ID returned by the server.
 * @throws {Error} If a SessionTemplate's `model_style.platform_type` is not `"webrtc"`.
 * @throws {SessionCreationError} When the API returns an error during session creation.
 * @throws {DoesNotExistError} When the server response `code` is `'does_not_exist'` (subclass of `SessionCreationError`).
 * @throws {NotInOrganizationError} When the server response `code` is `'not_in_organization'` (subclass of `SessionCreationError`).
 */
export async function createSessionId(
	apiServerOrOptions: string | CreateSessionIdObjectOptions,
	apiKey?: string,
	paramsOrTemplateId?: CreateSessionIdBody | string
): Promise<string> {
	let resolvedApiServer: string;
	let resolvedApiKey: string;
	let resolvedParamsOrTemplateId: CreateSessionIdBody | string;

	if (typeof apiServerOrOptions === 'object') {
		const options = apiServerOrOptions;
		resolvedApiServer = resolveApiServer(options.apiServer);
		resolvedApiKey = options.apiKey;
		resolvedParamsOrTemplateId =
			'sessionTemplateId' in options ? options.sessionTemplateId : options.params;
	} else {
		resolvedApiServer = resolveApiServer(apiServerOrOptions);
		resolvedApiKey = apiKey as string;
		resolvedParamsOrTemplateId = paramsOrTemplateId as CreateSessionIdBody | string;
	}

	return await createSessionIdInternal(
		resolvedApiServer,
		resolvedApiKey,
		resolvedParamsOrTemplateId
	);
}

async function createSessionIdInternal(
	apiServer: string,
	apiKey: string,
	paramsOrTemplateId: CreateSessionIdBody | string
): Promise<string> {
	try {
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
			capability: Array<'LLM' | 'STT' | 'TTS' | 'STF_WEBRTC'>;
		} = {
			capability: [],
			...params
		};

		if (params.using_stf_webrtc) {
			body.capability.push('STF_WEBRTC');
		}
		if (params?.llm_type) {
			body.capability.push('LLM');
			body.llm_type = params.llm_type;
		}
		if (params?.tts_type) {
			body.capability.push('TTS');
			body.tts_type = params.tts_type;
		}
		if (params?.stt_type) {
			body.capability.push('STT');
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
	} catch (err) {
		throw wrapSessionCreationApiError(err);
	}
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
			? template.mcp_servers?.map((m) => m.mcpserver_id)
			: undefined,
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

type GetIntroMessageObjectOptions = {
	apiKey: string;
	promptId: string;
	apiServer?: string;
};

/** @overload Object-form. Uses DEFAULT_API_SERVER when apiServer is omitted. */
export async function getIntroMessage(options: GetIntroMessageObjectOptions): Promise<string>;
/** @overload Positional form. */
export async function getIntroMessage(
	apiServer: string,
	apiKey: string,
	promptId: string
): Promise<string>;
/**
 * Retrieves the intro message for a specific prompt.
 *
 * @param apiServerOrOptions Either the Perso API server URL (positional) or an
 *   options object containing `apiKey`, `promptId`, and optional `apiServer`
 *   (defaults to `https://platform.perso.ai`).
 * @param apiKey API key used for authentication (positional form only).
 * @param promptId The prompt ID to fetch intro message for (positional form only).
 * @returns The intro message string.
 */
export async function getIntroMessage(
	apiServerOrOptions: string | GetIntroMessageObjectOptions,
	apiKey?: string,
	promptId?: string
): Promise<string> {
	let resolvedApiServer: string;
	let resolvedApiKey: string;
	let resolvedPromptId: string;

	if (typeof apiServerOrOptions === 'object') {
		resolvedApiServer = resolveApiServer(apiServerOrOptions.apiServer);
		resolvedApiKey = apiServerOrOptions.apiKey;
		resolvedPromptId = apiServerOrOptions.promptId;
	} else {
		resolvedApiServer = resolveApiServer(apiServerOrOptions);
		resolvedApiKey = apiKey as string;
		resolvedPromptId = promptId as string;
	}

	try {
		const prompts = (await PersoUtil.getPrompts(
			resolvedApiServer,
			resolvedApiKey
		)) as PromptMetadata[];
		const prompt = prompts.find((item) => item.prompt_id === resolvedPromptId);

		if (!prompt) {
			throw new Error(`Prompt (${resolvedPromptId}) not found`, { cause: 404 });
		}

		return prompt.intro_message;
	} catch (err: unknown) {
		if (err instanceof ApiError) {
			throw new Error(err.detail, { cause: err.errorCode ?? 500 });
		}

		throw err;
	}
}
