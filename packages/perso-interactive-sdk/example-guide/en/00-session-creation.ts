/**
 * ============================================================================
 * Example 0: Session Creation — Two Ways to Create a Session
 * ============================================================================
 *
 * Before using any SDK feature (LLM, TTS, STT, STF), you need a session.
 * There are two ways to create a session ID on the server:
 *
 * 1. Manual Configuration — Specify each parameter (LLM, TTS, STT, model style, etc.)
 * 2. Session Template    — Use a pre-configured template ID (all settings bundled)
 *
 * Both methods return a session ID that is passed to the client's createSession().
 */

import { createSessionId, getSessionTemplates } from 'perso-interactive-sdk-web/server';

import { createSession, type Session } from 'perso-interactive-sdk-web/client';

// ─────────────────────────────────────────────────────────────────────────────
// Method 1: Manual Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a session by specifying each parameter individually.
 *
 * You need to know the exact names/IDs for model style, prompt, LLM type,
 * TTS type, and STT type. These can be fetched via the SDK's getter APIs
 * (getLLMs, getTTSs, getSTTs, getModelStyles, getPrompts).
 *
 * @param apiServer - Perso API server URL (e.g., 'https://live-api.perso.ai')
 * @param apiKey    - API key (must be kept server-side only!)
 */
async function example_manualConfiguration(
	apiServer: string,
	apiKey: string
): Promise<string> {
	const sessionId = await createSessionId(apiServer, apiKey, {
		using_stf_webrtc: true,
		model_style: 'your-model-style-name',
		prompt: 'your-prompt-id',
		llm_type: 'your-llm-type',
		tts_type: 'your-tts-type',
		stt_type: 'your-stt-type'
		// Optional parameters:
		// document: 'your-document-id',
		// background_image: 'your-background-image-id',
		// mcp_servers: ['mcp-server-id-1', 'mcp-server-id-2'],
	});

	console.log('Session created (manual):', sessionId);
	return sessionId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Method 2: Session Template
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a session from a pre-configured template.
 *
 * Session Templates bundle all settings (LLM, TTS, STT, model style, prompt,
 * etc.) into a single reusable preset managed in the dashboard.
 * Just pass the template ID — no manual configuration needed.
 *
 * @param apiServer - Perso API server URL
 * @param apiKey    - API key (must be kept server-side only!)
 * @param templateId - Session template ID from getSessionTemplates()
 */
async function example_sessionTemplate(
	apiServer: string,
	apiKey: string,
	templateId: string
): Promise<string> {
	// Pass the template ID directly as a string — that's it!
	const sessionId = await createSessionId(apiServer, apiKey, templateId);

	console.log('Session created (template):', sessionId);
	return sessionId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing Available Templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all available session templates for your API key.
 *
 * Each template contains the full session configuration:
 *   - Model style (avatar appearance)
 *   - Prompt (system instructions + intro message)
 *   - LLM, TTS, STT types
 *   - Optional: document, background image, MCP servers
 */
async function example_listTemplates(apiServer: string, apiKey: string) {
	const templates = await getSessionTemplates(apiServer, apiKey);

	console.log(`Found ${templates.length} template(s):`);

	for (const t of templates) {
		console.log(`  [${t.sessiontemplate_id}] ${t.name}`);
		console.log(`    Description : ${t.description ?? '(none)'}`);
		console.log(`    Model Style : ${t.model_style.name}`);
		console.log(`    LLM         : ${t.llm_type.name}`);
		console.log(`    TTS         : ${t.tts_type.name}`);
		console.log(`    STT         : ${t.stt_type.name}`);
	}

	return templates;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Pattern: Template → Manual Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tries to use a session template first; falls back to manual configuration
 * if no templates are available.
 *
 * Useful during migration or when template support is optional.
 */
async function example_templateWithFallback(
	apiServer: string,
	apiKey: string,
	fallbackParams: {
		modelStyle: string;
		promptId: string;
		llmType: string;
		ttsType: string;
		sttType: string;
	}
): Promise<string> {
	// Try to fetch templates; default to empty array on failure
	const templates = await getSessionTemplates(apiServer, apiKey).catch(() => []);

	let sessionId: string;

	if (templates.length > 0) {
		// Template available — use it
		const template = templates[0];
		console.log(`Using template: "${template.name}"`);

		sessionId = await createSessionId(apiServer, apiKey, template.sessiontemplate_id);
	} else {
		// No templates — fall back to manual configuration
		console.log('No templates found, using manual configuration.');

		sessionId = await createSessionId(apiServer, apiKey, {
			using_stf_webrtc: true,
			model_style: fallbackParams.modelStyle,
			prompt: fallbackParams.promptId,
			llm_type: fallbackParams.llmType,
			tts_type: fallbackParams.ttsType,
			stt_type: fallbackParams.sttType
		});
	}

	console.log('Session created:', sessionId);
	return sessionId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side: Using the Session ID
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Once you have a session ID (from either method above), pass it to
 * createSession() on the client to start using the SDK.
 *
 * This step is identical regardless of how the session was created.
 */
async function example_clientSession(
	apiServer: string,
	sessionId: string
): Promise<Session> {
	const session = await createSession(apiServer, sessionId, 1080, 1920, []);

	// Bind avatar video to a <video> element
	const videoElement = document.querySelector('video') as HTMLVideoElement;
	session.setSrc(videoElement);

	console.log('Client session ready. You can now use LLM, TTS, STT, STF APIs.');
	return session;
}

export {
	example_manualConfiguration,
	example_sessionTemplate,
	example_listTemplates,
	example_templateWithFallback,
	example_clientSession
};
