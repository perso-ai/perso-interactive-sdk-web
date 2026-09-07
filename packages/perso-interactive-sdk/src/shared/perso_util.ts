import { ApiError } from './error';
import type {
	BackgroundImage,
	Document,
	LLMType,
	MCPServer,
	ModelStyle,
	Prompt,
	STTResponse,
	STTType,
	SessionInfo,
	SessionTemplate,
	TextNormalizationConfig,
	TTSOutputFormat,
	TTSResponse,
	TTSType
} from './types';

export enum SessionCapabilityName {
	LLM = 'LLM',
	TTS = 'TTS',
	STT = 'STT',
	STF_ONPREMISE = 'STF_ONPREMISE',
	STF_WEBRTC = 'STF_WEBRTC'
}

export enum SessionEvent {
	SESSION_START = 'SESSION_START',
	SESSION_DURING = 'SESSION_DURING',
	SESSION_LOG = 'SESSION_LOG',
	SESSION_END = 'SESSION_END',
	SESSION_ERROR = 'SESSION_ERROR',
	SESSION_TTS = 'SESSION_TTS',
	SESSION_STT = 'SESSION_STT',
	SESSION_LLM = 'SESSION_LLM'
}

export interface TextNormalizationDownload {
	config_id: string;
	config_name: string;
	file_url: string;
}

export class PersoUtil {
	/**
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @returns JSON
	 * [
	 *   {
	 *     "name": string
	 *   }
	 * ]
	 */
	static async getLLMs(apiServer: string, apiKey: string): Promise<LLMType[]> {
		const promise = fetch(`${apiServer}/api/v1/settings/llm_type/`, {
			headers: {
				'PersoLive-APIKey': apiKey
			},
			method: 'GET'
		});
		const response = await promise;

		return await this.parseJson(response);
	}

	/**
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @returns JSON
	 * [
	 *   {
	 *     "name": string,
	 *     "model": string,
	 *     "style": string
	 *   }
	 * ]
	 */
	static async getModelStyles(apiServer: string, apiKey: string): Promise<ModelStyle[]> {
		const promise = fetch(`${apiServer}/api/v1/settings/modelstyle/?platform_type=webrtc`, {
			headers: {
				'PersoLive-APIKey': apiKey
			},
			method: 'GET'
		});
		const response = await promise;

		return await this.parseJson(response);
	}

	/**
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @returns JSON
	 * [
	 *   {
	 *     "backgroundimage_id": string,
	 *     "title": string,
	 *     "image": string
	 *     "created_at": string // ex) "2024-05-02T09:05:55.395Z"
	 *   }
	 * ]
	 */
	static async getBackgroundImages(apiServer: string, apiKey: string): Promise<BackgroundImage[]> {
		const promise = fetch(`${apiServer}/api/v1/background_image/`, {
			headers: {
				'PersoLive-APIKey': apiKey
			},
			method: 'GET'
		});
		const response = await promise;

		return await this.parseJson(response);
	}

	/**
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @returns JSON
	 * [
	 *   {
	 *     "name": string,
	 *     "service": string,
	 *     "speaker": string
	 *   }
	 * ]
	 */
	static async getTTSs(apiServer: string, apiKey: string): Promise<TTSType[]> {
		const promise = fetch(`${apiServer}/api/v1/settings/tts_type/`, {
			headers: {
				'PersoLive-APIKey': apiKey
			},
			method: 'GET'
		});
		const response = await promise;

		return await this.parseJson(response);
	}

	/**
	 * Lists the STT types available to this API key.
	 *
	 * Reads the v2 listing, not v1. v1 filters out `STREAMING` types and
	 * serializes without `mode` / `end_of_turn_detection`, so a configuration
	 * screen built on it cannot offer streaming STT at all. v2 is a strict
	 * superset in both rows and fields, so there is nothing to choose between
	 * and no version option is exposed.
	 *
	 * Requires a server that serves `/settings/stt_type/v2/`.
	 *
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @returns JSON
	 * [
	 *   {
	 *     "name": string,
	 *     "service": string,
	 *     "options": unknown | null,
	 *     "mode": "NON_STREAMING" | "STREAMING",
	 *     "end_of_turn_detection": boolean
	 *   }
	 * ]
	 */
	static async getSTTs(apiServer: string, apiKey: string): Promise<STTType[]> {
		const promise = fetch(`${apiServer}/api/v1/settings/stt_type/v2/`, {
			headers: {
				'PersoLive-APIKey': apiKey
			},
			method: 'GET'
		});
		const response = await promise;

		return await this.parseJson(response);
	}

	/**
	 * Sends text to the TTS API and returns the synthesized audio.
	 * @param apiServer Perso Interactive API Server
	 * @param params Session ID and text to synthesize.
	 * @returns JSON with Base64 audio, the resolved locale and the normalized text.
	 * {
	 *   "audio": string,
	 *   "locale": string,
	 *   "normalized_text": string
	 * }
	 */
	static async makeTTS(
		apiServer: string,
		{
			sessionId,
			text,
			locale,
			output_format
		}: { sessionId: string; text: string; locale?: string; output_format?: TTSOutputFormat }
	): Promise<TTSResponse> {
		const body: Record<string, string> = { text };
		if (locale) body.locale = locale;
		if (output_format) body.output_format = output_format;

		const response = await fetch(`${apiServer}/api/v1/session/${sessionId}/tts/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		return (await this.parseJson(response)) as TTSResponse;
	}

	/**
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @returns JSON
	 * [
	 *   {
	 *     "name": string,
	 *     "description": string,
	 *     "prompt_id": string,
	 *     "system_prompt": string,
	 *     "require_document": boolean,
	 *     "intro_message": string
	 *   }
	 * ]
	 */
	static async getPrompts(apiServer: string, apiKey: string): Promise<Prompt[]> {
		const promise = fetch(`${apiServer}/api/v1/prompt/`, {
			headers: {
				'PersoLive-APIKey': apiKey
			},
			method: 'GET'
		});
		const response = await promise;

		return await this.parseJson(response);
	}

	/**
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @returns JSON
	 * [
	 *   {
	 *     "document_id": string,
	 *     "title": string,
	 *     "description": string,
	 *     "search_count": number,
	 *     "processed": boolean,
	 *     "created_at": string, // ex) "2024-05-02T09:05:55.395Z",
	 *     "updated_at": string // ex) "2024-05-02T09:05:55.395Z"
	 *   }
	 * ]
	 */
	static async getDocuments(apiServer: string, apiKey: string): Promise<Document[]> {
		const promise = fetch(`${apiServer}/api/v1/document/`, {
			headers: {
				'PersoLive-APIKey': apiKey
			},
			method: 'GET'
		});
		const response = await promise;

		return await this.parseJson(response);
	}

	/**
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @returns See {@link TextNormalizationConfig}.
	 */
	static async getTextNormalizations(
		apiServer: string,
		apiKey: string
	): Promise<TextNormalizationConfig[]> {
		const promise = fetch(`${apiServer}/api/v1/settings/text_normalization_config/`, {
			headers: {
				'PersoLive-APIKey': apiKey
			},
			method: 'GET'
		});
		const response = await promise;

		return await this.parseJson(response);
	}

	/**
	 * Downloads the ruleset data file for a Text Normalization Config.
	 * Returns a pre-signed Blob Storage URL for the CSV file.
	 * The client can download the file directly from this URL and leverage Azure Blob Storage ETag for caching.
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @param configId Text Normalization Config ID
	 * @returns JSON
	 * {
	 *   "config_id": string,
	 *   "config_name": string,
	 *   "file_url": string
	 * }
	 */
	static async downloadTextNormalization(apiServer: string, apiKey: string, configId: string): Promise<TextNormalizationDownload> {
		const response = await fetch(
			`${apiServer}/api/v1/settings/text_normalization_config/${configId}/download/`,
			{
				headers: {
					'PersoLive-APIKey': apiKey
				},
				method: 'GET'
			}
		);

		return await this.parseJson(response);
	}

	/**
	 * Retrieves the list of session templates.
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @returns Array of SessionTemplate objects
	 */
	static async getSessionTemplates(
		apiServer: string,
		apiKey: string
	): Promise<SessionTemplate[]> {
		const response = await fetch(`${apiServer}/api/v1/session_template/`, {
			headers: { 'PersoLive-APIKey': apiKey },
			method: 'GET'
		});
		return await this.parseJson(response);
	}

	/**
	 * Retrieves a single session template by ID.
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @param sessionTemplateId Session Template ID
	 * @returns SessionTemplate object
	 */
	static async getSessionTemplate(
		apiServer: string,
		apiKey: string,
		sessionTemplateId: string
	): Promise<SessionTemplate> {
		const response = await fetch(
			`${apiServer}/api/v1/session_template/${sessionTemplateId}/`,
			{
				headers: { 'PersoLive-APIKey': apiKey },
				method: 'GET'
			}
		);
		return await this.parseJson(response);
	}

	/**
	 * Lists the remote MCP servers available to this API key.
	 *
	 * The settings listing carries a subset of {@link MCPServer} —
	 * `mcpserver_id`, `name`, `url`, `description`. The remaining fields
	 * (`transport_protocol`, `server_timeout_sec`, `extra_data`) are populated
	 * only where a server appears inside a session or template, which is why they
	 * are optional on the shared type.
	 *
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 */
	static async getMcpServers(apiServer: string, apiKey: string): Promise<MCPServer[]> {
		const promise = fetch(`${apiServer}/api/v1/settings/mcp_type/`, {
			headers: {
				'PersoLive-APIKey': apiKey
			},
			method: 'GET'
		});
		const response = await promise;

		return await this.parseJson(response);
	}

	/**
	 * @param apiServer Perso Interactive API Server
	 * @param apiKey Perso Interactive API Key
	 * @returns The session row. See {@link SessionInfo} for the full shape —
	 *   it is the single description of this payload, so it cannot drift out of
	 *   step with the code the way a duplicated comment did. `stt_type` is the
	 *   field `Session` reads to decide whether STT streams or records.
	 */
	static async getSessionInfo(apiServer: string, sessionId: string): Promise<SessionInfo> {
		const promise = fetch(`${apiServer}/api/v1/session/${sessionId}/`, {
			method: 'GET'
		});
		const response = await promise;

		return await this.parseJson(response);
	}

	static async sessionEvent(apiServer: string, sessionId: string, sessionEvent: SessionEvent, detail: string = '') {
		const response = await fetch(`${apiServer}/api/v1/session/${sessionId}/event/create/`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				detail,
				event: sessionEvent
			})
		});
		await this.parseJson(response);
	}

	/**
	 * Sends audio data to the STT API endpoint for speech-to-text conversion.
	 * @param apiServer Perso Interactive API Server
	 * @param sessionId Session ID for the current session
	 * @param audioFile Audio file (WAV format)
	 * @param language Optional language code (e.g., 'ko', 'en')
	 * @returns STTResponse with only the transcribed text.
	 *
	 * The server returns additional fields (e.g., `locale`, `normalized_text`)
	 * which are intentionally not exposed by the SDK.
	 *
	 * @deprecated The SDK now transcribes over the session WebSocket
	 * (`stt.request`); `Session.stopProcessSTT()` / `transcribeAudio()` no longer
	 * call this. Kept for backward compatibility and will be removed in a future
	 * major version.
	 */
	static async makeSTT(
		apiServer: string,
		sessionId: string,
		audioFile: File,
		language?: string
	): Promise<STTResponse> {
		const formData = new FormData();
		formData.append('audio', audioFile);
		if (language) {
			formData.append('language', language);
		}

		const response = await fetch(`${apiServer}/api/v1/session/${sessionId}/stt/`, {
			method: 'POST',
			body: formData
		});

		const data = (await this.parseJson(response)) as { text: string };
		return { text: data.text };
	}

	/**
	 * Initiates an LLM streaming request and returns the response body reader.
	 * @param apiServer Perso Interactive API Server
	 * @param sessionId Session ID for the current session
	 * @param body Request body containing messages and tools
	 * @param signal Optional AbortSignal to cancel the request
	 * @returns ReadableStreamDefaultReader for SSE streaming response
	 * @throws ApiError when response is not ok
	 *
	 * @deprecated The SDK now runs LLM turns over the session WebSocket
	 * (`llm.request`); `Session.processLLM()` no longer calls this. Kept for
	 * backward compatibility and will be removed in a future major version.
	 */
	static async makeLLM(
		apiServer: string,
		sessionId: string,
		body: { messages: Array<object>; tools: Array<object> },
		signal?: AbortSignal
	): Promise<ReadableStreamDefaultReader<Uint8Array>> {
		const response = await fetch(`${apiServer}/api/v1/session/${sessionId}/llm/v2/`, {
			body: JSON.stringify(body),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			signal
		});

		if (!response.ok) {
			const json = await response.json();
			const error = json.errors?.[0] ?? {
				code: 'UNKNOWN_ERROR',
				detail: `Server returned status ${response.status} with no error details`,
				attr: null
			};
			throw new ApiError(response.status, error.code, error.detail, error.attr);
		}

		return response.body!.getReader();
	}

	/**
	 * Fetches ICE server configuration for WebRTC peer connection setup.
	 * @param apiServer Perso Interactive API Server
	 * @param sessionId Session ID
	 * @returns Array of RTCIceServer configurations.
	 */
	static async getIceServers(
		apiServer: string,
		sessionId: string
	): Promise<Array<RTCIceServer>> {
		const response = await fetch(
			`${apiServer}/api/v1/session/${sessionId}/ice-servers/`,
			{ method: 'GET' }
		);
		const json = await this.parseJson(response);
		return json.ice_servers;
	}

	/**
	 * Exchanges the client SDP offer with the server and returns the server SDP answer.
	 * @param apiServer Perso Interactive API Server
	 * @param sessionId Session ID
	 * @param offer Client SDP offer from RTCPeerConnection.createOffer().
	 * @returns Server SDP answer to set as remote description.
	 */
	static async exchangeSDP(
		apiServer: string,
		sessionId: string,
		offer: RTCSessionDescriptionInit
	): Promise<RTCSessionDescriptionInit> {
		const response = await fetch(
			`${apiServer}/api/v1/session/${sessionId}/exchange/`,
			{
				body: JSON.stringify({ client_sdp: offer }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST'
			}
		);
		const json = await this.parseJson(response);
		return json.server_sdp;
	}

	static async parseJson(response: Response) {
		const json = await response.json();
		if (response.ok) {
			return json;
		} else {
			const error = json.errors?.[0] ?? {
				code: 'UNKNOWN_ERROR',
				detail: `Server returned status ${response.status} with no error details`,
				attr: null
			};
			throw new ApiError(response.status, error.code, error.detail, error.attr);
		}
	}
}
