/**
 * Client-side entry point for perso-interactive-sdk.
 * Use this module in browser environments.
 *
 * @example
 * ```typescript
 * import {
 *   createSession,
 *   ChatTool,
 *   ChatState,
 *   getAllSettings
 * } from 'perso-interactive-sdk/client';
 *
 * // Create a session (sessionId should come from server)
 * const session = await createSession(
 *   apiServer,
 *   sessionId,
 *   width,
 *   height,
 *   enableVoiceChat,
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
  getAllSettings,
  createSession,
  getSessionInfo,
  // Session
  ChatTool,
  ChatState,
  Session,
  type Chat,
} from "./PersoInteractive";

// Client-side session creation (exposes API key - use with caution)
export { createSessionId } from "./init";

// Error types
export {
  ApiError,
  LLMError,
  LLMStreamingResponseError,
} from "../shared";
