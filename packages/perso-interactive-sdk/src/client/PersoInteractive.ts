export type { TextNormalizationDownload } from '../shared/perso_util';
export type {
	SessionTemplate,
	Prompt,
	LLMType,
	TTSType,
	STTType,
	STTResponse,
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
import { DEFAULT_API_SERVER, resolveApiServer } from '../shared/api-server';
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

export {
	getLLMs,
	getTTSs,
	getSTTs,
	getModelStyles,
	getBackgroundImages,
	getPrompts,
	getDocuments,
	getMcpServers,
	getTextNormalizations,
	getTextNormalization,
	getSessionTemplates,
	getAllSettings,
	makeTTS,
	getSessionInfo
} from '../shared/settings';
export type {
	ApiKeyOptions,
	GetTextNormalizationOptions,
	GetSessionTemplateOptions,
	MakeTTSOptions,
	GetSessionInfoOptions
} from '../shared/settings';

export type CreateSessionObjectOptions = {
	sessionId: string;
	width: number;
	height: number;
	clientTools: Array<ChatTool>;
	apiServer?: string;
};

/** @overload Object-form. Uses DEFAULT_API_SERVER when apiServer is omitted. */
export function createSession(options: CreateSessionObjectOptions): Promise<Session>;
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
	apiServerOrOptions: string | CreateSessionObjectOptions,
	sessionId?: string,
	width?: number,
	height?: number,
	enableVoiceChatOrClientTools?: boolean | Array<ChatTool>,
	clientTools?: Array<ChatTool>
): Promise<Session> {
	if (typeof apiServerOrOptions === 'object') {
		const options = apiServerOrOptions;
		const resolved = resolveApiServer(options.apiServer);
		return await cs(
			resolved,
			options.sessionId,
			options.width,
			options.height,
			options.clientTools
		);
	}

	const resolvedApiServer = resolveApiServer(apiServerOrOptions);

	if (typeof enableVoiceChatOrClientTools === 'boolean') {
		return await cs(
			resolvedApiServer,
			sessionId as string,
			width as number,
			height as number,
			enableVoiceChatOrClientTools,
			clientTools ?? []
		);
	}
	return await cs(
		resolvedApiServer,
		sessionId as string,
		width as number,
		height as number,
		enableVoiceChatOrClientTools as Array<ChatTool>
	);
}

export { DEFAULT_API_SERVER };
