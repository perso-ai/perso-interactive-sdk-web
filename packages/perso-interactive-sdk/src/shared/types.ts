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

export interface STTType {
	name: string;
	service: string;
	options?: unknown | null;
}

export interface TextNormalizationConfig {
	textnormalizationconfig_id: string;
	name: string;
	created_at: string;
}

export interface ModelStyleConfig {
	modelstyleconfig_id: string;
	key: string;
	value: string;
}

export interface AIHumanModelFile {
	name: string;
	file?: string | null;
}

export interface ModelStyle {
	name: string;
	model: string;
	model_file?: string | null;
	model_files: AIHumanModelFile[];
	style: string;
	file?: string | null;
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

export interface SessionTemplate {
	sessiontemplate_id: string;
	name: string;
	description: string | null;
	prompt: Prompt;
	capability: SessionCapability[];
	document: Document | null;
	llm_type: LLMType;
	tts_type: TTSType;
	stt_type: STTType;
	text_normalization_config?: TextNormalizationConfig | null;
	text_normalization_locale?: string | null;
	stt_text_normalization_config?: TextNormalizationConfig | null;
	stt_text_normalization_locale?: string | null;
	model_style: ModelStyle;
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
