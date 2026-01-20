import { PersoUtil } from "../shared";
import {
  type Chat,
  ChatState,
  ChatTool,
  createSession as cs,
  Session,
} from "./session";

/**
 * Re-export session helpers and error types so SDK consumers can import from a
 * single entry point.
 */
export {
  ChatState,
  ChatTool,
  type Chat,
  Session,
};

/**
 * Retrieves the list of available LLM providers from the API.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @returns Promise resolving with LLM metadata.
 */
export async function getLLMs(apiServer: string, apiKey: string) {
  return await PersoUtil.getLLMs(apiServer, apiKey);
}

/**
 * Retrieves available TTS providers.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getTTSs(apiServer: string, apiKey: string) {
  return await PersoUtil.getTTSs(apiServer, apiKey);
}

/**
 * Retrieves available STT providers.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getSTTs(apiServer: string, apiKey: string) {
  return await PersoUtil.getSTTs(apiServer, apiKey);
}

/**
 * Fetches avatar model styles.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getModelStyles(apiServer: string, apiKey: string) {
  return await PersoUtil.getModelStyles(apiServer, apiKey);
}

/**
 * Fetches preset background images.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getBackgroundImages(apiServer: string, apiKey: string) {
  return await PersoUtil.getBackgroundImages(apiServer, apiKey);
}

/**
 * Returns predefined prompt templates.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getPrompts(apiServer: string, apiKey: string) {
  return await PersoUtil.getPrompts(apiServer, apiKey);
}

/**
 * Returns supporting document metadata usable by the session.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getDocuments(apiServer: string, apiKey: string) {
  return await PersoUtil.getDocuments(apiServer, apiKey);
}

/**
 * Lists MCP server identifiers configured for the tenant.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 */
export async function getMcpServers(apiServer: string, apiKey: string) {
  return await PersoUtil.getMcpServers(apiServer, apiKey);
}

/**
 * Convenience helper that fetches every dropdown-friendly resource needed to
 * build a Perso session configuration screen in one call chain.
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @returns Object containing arrays for LLMs, TTS/STT types, model styles, etc.
 */
export async function getAllSettings(apiServer: string, apiKey: string) {
  const llms = await getLLMs(apiServer, apiKey);
  const modelStyles = await getModelStyles(apiServer, apiKey);
  const backgroundImages = await getBackgroundImages(apiServer, apiKey);
  const ttsTypes = await getTTSs(apiServer, apiKey);
  const sttTypes = await getSTTs(apiServer, apiKey);
  const prompts = await getPrompts(apiServer, apiKey);
  const documents = await getDocuments(apiServer, apiKey);
  const mcpServers = await getMcpServers(apiServer, apiKey);

  return {
    llms,
    ttsTypes,
    sttTypes,
    modelStyles,
    backgroundImages,
    prompts,
    documents,
    mcpServers,
  };
}

/**
 * Wraps the lower-level `session.createSession` helper so callers can import
 * from this module.
 * @param apiServer Perso API server URL.
 * @param sessionId Session id to attach to.
 * @param width Avatar canvas width.
 * @param height Avatar canvas height.
 * @param enableVoiceChat Whether microphone capture should be enabled.
 * @param clientTools Client-side tools available for function calling.
 * @returns Initialized Session.
 */
export async function createSession(
  apiServer: string,
  sessionId: string,
  width: number,
  height: number,
  enableVoiceChat: boolean,
  clientTools: Array<ChatTool>
) {
  return await cs(
    apiServer,
    sessionId,
    width,
    height,
    enableVoiceChat,
    clientTools
  );
}

/**
 * Retrieves metadata for an existing session.
 * @param apiServer Perso API server URL.
 * @param sessionId Session id to inspect.
 */
export async function getSessionInfo(apiServer: string, sessionId: string) {
  return await PersoUtil.getSessionInfo(apiServer, sessionId);
}
