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
