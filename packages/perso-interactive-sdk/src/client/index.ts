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
 * const session = await createSession({
 *   sessionId,
 *   width,
 *   height,
 *   clientTools
 * });
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
	getSessionTemplate,
	getTextNormalizations,
	getTextNormalization,
	getAllSettings,
	createSession,
	getSessionInfo,
	makeTTS,
	DEFAULT_API_SERVER,
	// Session
	ChatTool,
	ChatState,
	VideoCodec,
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
	type TTSOutputFormat,
	type TTSResponse,
	type STTType,
	type STTMode,
	type STTResponse,
	type ModelStyle,
	type BackgroundImage,
	type Document,
	type MCPServer,
	type SessionCapability,
	type TextNormalizationConfig,
	type ModelStyleConfig,
	type ModelFile,
	/** @deprecated Renamed to `ModelFile`. */
	type AIHumanModelFile,
	type SessionInfo,
	type SessionStatus,
	// Options types
	type ApiKeyOptions,
	type GetTextNormalizationOptions,
	type GetSessionTemplateOptions,
	type MakeTTSOptions,
	type StreamingTTSStream,
	type GetSessionInfoOptions,
	type CreateSessionObjectOptions
} from './PersoInteractive';

// Streaming TTS. The `tts.chunk` frames carry headerless little-endian 16-bit
// PCM with no rate on the wire, so the decoder and the two constants are the
// contract: the decoder also carries samples that chunk boundaries split in half.
export { PcmStreamDecoder, STREAMING_TTS_SAMPLE_RATE, STREAMING_TTS_CHANNELS } from '../shared/pcm-stream';
export type { StreamingTTSOutputFormat } from '../shared/types';

// Client-side session creation (exposes API key - use with caution)
export { createSessionId } from './init';

// Streaming STT payloads: the `partial` / `utterance` events of startRealtimeSTT().
// SttStreamResult is intentionally not re-exported: no public method hands the
// caller that shape.
export type { SttPartial, SttUtterance } from './stt-stream';
export type { StartProcessSTTOptions } from './session';

// Realtime STT: one start -> stop cycle read as a single `for await` event
// stream, separate from startProcessSTT()/stopProcessSTT() and the subscribe API.
export type { RealtimeSttEvent, RealtimeSttOptions, RealtimeSttStream } from './realtime-stt';

// Per-modality error-code tables to match `STTError.code` / `TTSError.code` /
// `LLMError.code` against — the actionable codes are `cancelled` (a client
// stop, not a failure), plus the rate-limit and busy codes. All are open sets,
// so match the members you handle and let the rest through rather than
// switching exhaustively. Transport- and envelope-level faults surface on the
// same `.code` as an opaque string you can log; they carry no dedicated public
// table.
export { STT_ERROR_CODE, TTS_ERROR_CODE, LLM_ERROR_CODE } from '../shared/ws-protocol';

// Streaming STF — processSTF() streams internally. These are the pieces a
// live source needs: the PCM contract constant and the accepted input shapes.
export { STF_STREAM_SAMPLE_RATE } from './stf-stream';
export type { StfAudioSource, StfPcmChunk } from './session';

// Error types
export {
	ApiError,
	LLMError,
	LLMStreamingResponseError,
	STFError,
	STTError,
	TTSError,
	TTSDecodeError,
	TTSNotStreamableError,
	SessionCreationError,
	DoesNotExistError,
	NotInOrganizationError
} from '../shared/error';

// Audio utilities
export { getWavSampleRate } from '../shared/wav-utils';
export { TTS_TARGET_SAMPLE_RATE } from '../shared/audio-resampler';
