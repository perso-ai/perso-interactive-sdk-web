/**
 * Server-side entry point for perso-interactive-sdk.
 * Use this module in Node.js/SvelteKit/Next.js server environments.
 *
 * @example
 * ```typescript
 * import { createSessionId, getIntroMessage } from 'perso-interactive-sdk/server';
 *
 * const sessionId = await createSessionId(apiServer, apiKey, {
 *   using_stf_webrtc: true,
 *   model_style: 'nathalie-front-full_dress-nodded_loop',
 *   prompt: 'plp-xxx',
 *   llm_type: 'azure-gpt-4o',
 *   tts_type: 'openai-nova',
 *   stt_type: 'gpt-4o-transcribe',
 * });
 * ```
 */

export { createSessionId, getIntroMessage } from "./init";
export { PersoUtil as PersoUtilServer, ApiError } from "../shared";
