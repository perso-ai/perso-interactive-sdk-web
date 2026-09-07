import { SessionCapabilityName } from './perso_util';

export interface Prompt {
	prompt_id: string;
	name: string;
	description?: string;
	system_prompt: string;
	require_document?: boolean;
	intro_message?: string;
}

export interface SessionCapability {
	name: SessionCapabilityName;
	description?: string | null;
}

export interface Document {
	document_id: string;
	title: string;
	file: string;
	description?: string;
	search_count?: number;
	ef_search?: number | null;
	processed: boolean;
	processed_v2: boolean;
	created_at: string;
	updated_at: string;
}

export interface LLMType {
	name: string;
	service?: string;
}

export interface TTSType {
	name: string;
	streamable?: boolean;
	service: string;
	model?: string | null;
	voice?: string | null;
	voice_settings?: unknown | null;
	style?: string | null;
	voice_extra_data?: unknown | null;
}

/**
 * Audio format `POST /api/v1/session/{session_id}/tts/` returns, mirroring the
 * OpenAPI enum. The suffix is the sample rate in Hz; the bare names take the
 * provider's default.
 *
 * A closed union rather than `string`: the value is chosen by the caller and
 * sent outbound, so a typo that would otherwise come back as an opaque 400 is
 * worth catching at compile time.
 *
 * This is the endpoint's format list, not a list every SDK path can decode.
 * `Session.processTTS` decodes what it receives, and the `pcm*` members arrive
 * headerless: on the one-shot `/tts/` path — a voice that is not streamable, or
 * `'pcm_44100'` on any voice — there is no rate on the wire to build a container
 * from, so the returned Blob is not playable. Ask for a `wav*` or `mp3*` member
 * there, and reach raw PCM through `processStreamingTTS`, whose decoder knows
 * the rate by contract. `makeTTS` is unaffected: it hands back the Base64
 * payload for the caller to decode.
 */
export type TTSOutputFormat =
	| 'pcm'
	| 'pcm_24000'
	| 'pcm_44100'
	| 'wav'
	| 'wav_24000'
	| 'wav_44100'
	| 'mp3'
	| 'mp3_44100';

/**
 * Audio formats accepted by the streaming TTS calls — the subset of
 * {@link TTSOutputFormat} the session WebSocket (`tts.request`) can carry. It
 * is PCM-only: the socket produces `pcm_24000`, and `pcm` is kept as an alias
 * for source compatibility; both resolve to the same 24 kHz mono output.
 */
export type StreamingTTSOutputFormat = Extract<TTSOutputFormat, 'pcm' | 'pcm_24000'>;

/**
 * Response from POST /api/v1/session/{session_id}/tts/.
 *
 * `normalized_text` is what the voice actually spoke after the session's
 * normalization config ran, and `locale` is the voice it resolved to — both
 * useful for captions, so unlike {@link STTResponse} the SDK exposes the whole
 * payload.
 *
 * The schema marks all three required, but the two extra fields are optional
 * here: `makeTTS` hands the parsed body straight back without checking it, so a
 * required annotation would be promising something no code enforces. A field
 * that always arrives only costs one `??` at the call site.
 */
export interface TTSResponse {
	/** Base64-encoded audio in the requested {@link TTSOutputFormat}. */
	audio: string;
	locale?: string;
	normalized_text?: string;
}

/** Interaction mode an STT type supports. The two are mutually exclusive. */
export type STTMode = 'NON_STREAMING' | 'STREAMING';

export interface STTType {
	name: string;
	service: string;
	options?: unknown | null;
	/**
	 * How this type expects audio. `STREAMING` types reject a one-shot
	 * `stt.request` and vice versa, so the choice is made when the session
	 * is created, not per call.
	 *
	 * Optional because a server predating the v2 listing omits it; treat a
	 * missing value as `NON_STREAMING`.
	 */
	mode?: STTMode;
	/**
	 * `STREAMING` sub-mode in which the provider detects utterance boundaries,
	 * so one stream carries a whole conversation and the client never stops
	 * per utterance.
	 */
	end_of_turn_detection?: boolean;
}

/**
 * Response from POST /api/v1/session/{session_id}/stt/.
 *
 * The wire payload includes additional fields (e.g., `locale`,
 * `normalized_text`) that the SDK intentionally does not expose.
 */
export interface STTResponse {
	text: string;
}

export interface TextNormalizationConfig {
	textnormalizationconfig_id: string;
	name: string;
	/** Whether the pre/post hooks below are applied. */
	hook_enabled?: boolean;
	pre_hook_url: string | null;
	pre_hook_args?: unknown | null;
	post_hook_url: string | null;
	post_hook_args?: unknown | null;
	created_at: string;
}

export interface ModelStyleConfig {
	modelstyleconfig_id: string;
	key: string;
	value: string;
}

export interface ModelFile {
	name: string;
	file?: string | null;
}

/**
 * @deprecated Renamed to {@link ModelFile}. Kept as an alias because the old
 * name has shipped from the client entry since 1.3.0.
 */
export type AIHumanModelFile = ModelFile;

export interface ModelStyle {
	name: string;
	model: string;
	model_file?: string | null;
	model_files: ModelFile[];
	style: string;
	file?: string | null;
	/**
	 * Style-level files, as opposed to the model-level `model_files`. The wire
	 * schema names this element type separately but its shape is identical, so
	 * {@link ModelFile} covers both.
	 */
	files: ModelFile[];
	platform_type?: string;
	configs: ModelStyleConfig[];
}

export interface BackgroundImage {
	backgroundimage_id: string;
	title: string;
	image: string;
	created_at: string;
}

export interface MCPServer {
	mcpserver_id: string;
	name: string;
	description?: string;
	url: string;
	transport_protocol?: string;
	server_timeout_sec?: number;
	extra_data?: unknown | null;
}

/** Lifecycle position of a session. */
export type SessionStatus = 'CREATED' | 'EXCHANGED' | 'IN_PROGRESS' | 'TERMINATED';

/**
 * Response from GET /api/v1/session/{session_id}/, as returned by
 * `getSessionInfo()`.
 *
 * Object-valued configuration fields are typed as nullable even where the wire
 * schema marks them required: a session created without a background image or a
 * normalization config omits them, and promising a non-null value here would
 * turn a missing field into a property access on `null`. Declaring a nullable
 * field that never arrives as `null` only costs a redundant check.
 */
export interface SessionInfo {
	session_id: string;
	client_sdp: string | null;
	server_sdp: string | null;
	prompt: Prompt;
	document?: string | null;
	llm_type: LLMType;
	model_style: ModelStyle;
	tts_type: TTSType;
	/**
	 * Null on a session created without speech recognition. `mode` and
	 * `end_of_turn_detection` on this field are what decide whether
	 * `startProcessSTT()` streams or records.
	 */
	stt_type: STTType | null;
	text_normalization_config: TextNormalizationConfig | null;
	text_normalization_locale: string | null;
	stt_text_normalization_config: TextNormalizationConfig | null;
	stt_text_normalization_locale: string | null;
	ice_servers: RTCIceServer[] | null;
	status: SessionStatus;
	/**
	 * Why the session ended, or null while it is still running.
	 *
	 * An open string rather than a union: the server adds reasons without a
	 * protocol bump — `INSUFFICIENT_CREDITS` arrived after this endpoint was
	 * first documented. Known values are `GRACEFUL_TERMINATION`,
	 * `SESSION_EXPIRED_BEFORE_CONNECTION`, `SESSION_LOST_AFTER_CONNECTION`,
	 * `SESSION_MISC_ERROR`, `MAX_ACTIVE_SESSION_QUOTA_EXCEEDED`,
	 * `MAX_MIN_PER_SESSION_QUOTA_EXCEEDED`,
	 * `TOTAL_MIN_PER_MONTH_QUOTA_EXCEEDED`, and `INSUFFICIENT_CREDITS`.
	 */
	termination_reason: string | null;
	duration_sec: number;
	created_at: string;
	session_acls: string[];
	padding_left: number | null;
	padding_top: number | null;
	padding_height: number | null;
	background_image: BackgroundImage | null;
	extra_data?: unknown | null;
	capability: SessionCapability[];
	mcp_servers: MCPServer[];
}

export interface SessionTemplate {
	sessiontemplate_id: string;
	name: string;
	description: string | null;
	/**
	 * Null on a template that enables no LLM capability. The same reasoning as
	 * on `SessionInfo`: a field the wire schema marks required is still absent
	 * from a session that never configured it.
	 */
	prompt: Prompt | null;
	capability: SessionCapability[];
	document: Document | null;
	llm_type: LLMType | null;
	tts_type: TTSType | null;
	stt_type: STTType | null;
	text_normalization_config?: TextNormalizationConfig | null;
	text_normalization_locale?: string | null;
	stt_text_normalization_config?: TextNormalizationConfig | null;
	stt_text_normalization_locale?: string | null;
	/** Null on a template that configures no avatar. */
	model_style: ModelStyle | null;
	background_image: BackgroundImage | null;
	agent: string | null;
	padding_left: number | null;
	padding_top: number | null;
	padding_height: number | null;
	extra_data: unknown | null;
	mcp_servers?: MCPServer[];
	created_at: string;
	last_used_at: string | null;
}
