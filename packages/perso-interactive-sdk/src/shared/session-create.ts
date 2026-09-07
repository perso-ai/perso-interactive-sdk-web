import { SessionCapabilityName } from './perso_util';
import type { SessionTemplate } from './types';

/**
 * Caller-facing options for `createSessionId`.
 *
 * Only `using_stf_webrtc` is meaningful on its own: every other field enables
 * or configures a capability, and leaving one out leaves that capability out of
 * the session.
 */
export type CreateSessionIdBody = {
	using_stf_webrtc: boolean;
	model_style?: string;
	prompt?: string;
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
	/**
	 * Free-form JSON stored alongside the session for caller-defined metadata,
	 * readable afterwards as `SessionInfo.extra_data`.
	 *
	 * `unknown` rather than a record: the schema places no shape on it, and the
	 * read side is untyped for the same reason. Whatever is passed must survive
	 * `JSON.stringify`.
	 */
	extra_data?: unknown;
};

/**
 * The wire body of `POST /api/v1/session/`, mirroring the OpenAPI
 * `SessionCreateRequest`. It differs from the caller-facing options: capabilities
 * are derived rather than passed, and `using_stf_webrtc` is not a field.
 */
export type SessionCreateRequestBody = Omit<CreateSessionIdBody, 'using_stf_webrtc'> & {
	capability?: Array<SessionCapabilityName>;
};

/**
 * Fields the schema declares as `minLength: 1`. To the server a blank string is
 * an invalid id rather than "unset", so a UI that leaves a picker unselected
 * must not turn into a rejected request. `llm_type` / `tts_type` / `stt_type`
 * get the same treatment through their capability guards below.
 */
const BLANK_INVALID_FIELDS = [
	'model_style',
	'prompt',
	'document',
	'background_image',
	'text_normalization_config',
	'stt_text_normalization_config'
] as const;

/**
 * Turns caller options into the request body, deriving the capability list.
 *
 * Shared so the client and server entry points cannot drift: both send exactly
 * the same request for the same options.
 */
export function buildSessionCreateBody(params: CreateSessionIdBody): SessionCreateRequestBody {
	// `using_stf_webrtc` is an SDK-level flag, not a request field: it only
	// selects a capability. The capability-bearing options are pulled out too,
	// so a blank one neither reaches the wire nor claims a capability.
	const { using_stf_webrtc, llm_type, tts_type, stt_type, ...rest } = params;

	const body: SessionCreateRequestBody = { ...rest };
	const capability: Array<SessionCapabilityName> = [];

	if (using_stf_webrtc) {
		capability.push(SessionCapabilityName.STF_WEBRTC);
	}
	if (llm_type) {
		capability.push(SessionCapabilityName.LLM);
		body.llm_type = llm_type;
	}
	if (tts_type) {
		capability.push(SessionCapabilityName.TTS);
		body.tts_type = tts_type;
	}
	if (stt_type) {
		capability.push(SessionCapabilityName.STT);
		body.stt_type = stt_type;
	}

	for (const field of BLANK_INVALID_FIELDS) {
		if (body[field] === '') {
			delete body[field];
		}
	}

	// An absent `capability` is what selects the server's default; an empty
	// array is not a documented input.
	if (capability.length > 0) {
		body.capability = capability;
	}

	return body;
}

/**
 * Maps a SessionTemplate onto caller options.
 *
 * Every field is read behind the capability that requires it, or optionally:
 * a template configured for one capability leaves the others unset, and reading
 * through a missing one would surface as an opaque TypeError.
 */
export function sessionTemplateToParams(template: SessionTemplate): CreateSessionIdBody {
	const hasCapability = (name: SessionCapabilityName) =>
		template.capability.some((c) => c.name === name);

	return {
		using_stf_webrtc: hasCapability(SessionCapabilityName.STF_WEBRTC),
		model_style: template.model_style?.name,
		prompt: template.prompt?.prompt_id,
		document: template.document?.document_id,
		background_image: template.background_image?.backgroundimage_id,
		mcp_servers: template.mcp_servers?.length
			? template.mcp_servers.map((m) => m.mcpserver_id)
			: undefined,
		llm_type: hasCapability(SessionCapabilityName.LLM) ? template.llm_type?.name : undefined,
		tts_type: hasCapability(SessionCapabilityName.TTS) ? template.tts_type?.name : undefined,
		stt_type: hasCapability(SessionCapabilityName.STT) ? template.stt_type?.name : undefined,
		text_normalization_config: template.text_normalization_config?.textnormalizationconfig_id,
		text_normalization_locale: template.text_normalization_locale,
		stt_text_normalization_config:
			template.stt_text_normalization_config?.textnormalizationconfig_id,
		stt_text_normalization_locale: template.stt_text_normalization_locale,
		padding_left: template.padding_left ?? undefined,
		padding_top: template.padding_top ?? undefined,
		padding_height: template.padding_height ?? undefined
	};
}
