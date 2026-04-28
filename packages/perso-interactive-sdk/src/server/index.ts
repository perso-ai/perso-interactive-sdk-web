/**
 * Server-side entry point for perso-interactive-sdk-web.
 * Use this module in Node.js/SvelteKit/Next.js server environments.
 *
 * @example
 * ```typescript
 * import { createSessionId, getIntroMessage, getAllSettings } from 'perso-interactive-sdk-web/server';
 *
 * const settings = await getAllSettings(apiServer, apiKey);
 *
 * const sessionId = await createSessionId(apiServer, apiKey, {
 *   using_stf_webrtc: true,
 *   model_style: settings.modelStyles[0].name,
 *   prompt: settings.prompts[0].prompt_id,
 *   llm_type: settings.llms[0].name,
 *   tts_type: settings.ttsTypes[0].name,
 *   stt_type: settings.sttTypes[0].name,
 * });
 * ```
 */

export { createSessionId, getIntroMessage } from './init';
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
	getSessionTemplate,
	getAllSettings,
	makeTTS,
	getSessionInfo,
	PersoUtil as PersoUtilServer,
	ApiError
} from '../shared';
export type { SessionTemplate } from '../shared/types';
