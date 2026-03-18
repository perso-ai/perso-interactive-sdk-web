/**
 * Client-side entry point for perso-interactive-sdk-web.
 * Use this module in browser environments.
 *
 * @example
 * ```typescript
 * import {
 *   createSession,
 *   ChatTool,
 *   ChatState,
 *   getAllSettings
 * } from 'perso-interactive-sdk-web/client';
 *
 * // Create a session (sessionId should come from server)
 * const session = await createSession(
 *   apiServer,
 *   sessionId,
 *   width,
 *   height,
 *   clientTools
 * );
 *
 * // Bind to video element
 * session.setSrc(videoElement);
 * ```
 */

// Session management
export {
	getLLMs,
	getTTSs,
	getSTTs,
	getModelStyles,
	getBackgroundImages,
	getPrompts,
	getDocuments,
	getMcpServers,
	getSessionTemplates,
	getTextNormalizations,
	getTextNormalization,
	getAllSettings,
	createSession,
	getSessionInfo,
	makeTTS,
	// Session
	ChatTool,
	ChatState,
	Session,
	type Chat,
	type LLMStreamChunk,
	type ProcessLLMOptions,
	// LLM processing
	LlmProcessor,
	type LlmProcessorCallbacks,
	type LlmProcessorConfig,
	// Audio recording
	WavRecorder,
	createWavRecorder,
	type WavRecorderOptions,
	type TextNormalizationDownload,
	type SessionTemplate,
	type Prompt,
	type LLMType,
	type TTSType,
	type STTType,
	type ModelStyle,
	type BackgroundImage,
	type Document,
	type MCPServer,
	type SessionCapability,
	type TextNormalizationConfig,
	type ModelStyleConfig,
	type AIHumanModelFile
} from './PersoInteractive';

// Client-side session creation (exposes API key - use with caution)
export { createSessionId } from './init';

// Error types
export {
	ApiError,
	LLMError,
	LLMStreamingResponseError,
	STTError,
	TTSError,
	TTSDecodeError
} from '../shared';

// Audio utilities
export { getWavSampleRate, TTS_TARGET_SAMPLE_RATE } from '../shared';
