import { ApiError, PersoUtil } from "../shared";

type CreateSessionIdBody = {
  using_stf_webrtc: boolean;
  model_style: string;
  prompt: string;
  document?: string;
  background_image?: string;
  mcp_servers?: Array<string>;
  padding_left?: number;
  padding_top?: number;
  padding_height?: number;
  llm_type?: string;
  tts_type?: string;
  stt_type?: string;
};

/**
 * Requests a new session creation ID by POSTing the desired runtime options to
 * the Perso backend (`/api/v1/session/`).
 *
 * WARNING: This function requires an API key. When using this function in
 * client-side code, the API key will be exposed to the browser. For production
 * use, prefer creating session IDs server-side using `perso-interactive-sdk/server`.
 *
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @param params {
 *   using_stf_webrtc: boolean;
 *   llm_type?: string;
 *   tts_type?: string;
 *   stt_type?: string;
 *   model_style: string;
 *   prompt: string;
 *   document?: string;
 *   background_image?: string;
 *   mcp_servers?: Array<string>;
 *   padding_left?: number;
 *   padding_top?: number;
 *   padding_height?: number;
 * }
 * @returns Session ID returned by the server.
 */
export const createSessionId = async (
  apiServer: string,
  apiKey: string,
  params: CreateSessionIdBody
): Promise<string> => {
  // 브라우저 환경에서 API 키 노출 경고
  if (typeof window !== "undefined") {
    console.warn(
      "[perso-interactive-sdk] WARNING: createSessionId is being called from the browser. " +
        "This exposes your API key and is not recommended for production. " +
        "Use server-side session creation with 'perso-interactive-sdk/server' instead. " +
        "See: https://github.com/perso-ai/perso-interactive-sdk-web#server-side"
    );
  }

  const body: CreateSessionIdBody & {
    capability: Array<"LLM" | "STT" | "TTS" | "STF_WEBRTC">;
  } = {
    capability: [],
    ...params,
  };

  if (params.using_stf_webrtc) {
    body.capability.push("STF_WEBRTC");
  }
  if (params?.llm_type) {
    body.capability.push("LLM");
    body.llm_type = params.llm_type;
  }
  if (params?.tts_type) {
    body.capability.push("TTS");
    body.tts_type = params.tts_type;
  }
  if (params?.stt_type) {
    body.capability.push("STT");
    body.stt_type = params.stt_type;
  }

  const response = await fetch(`${apiServer}/api/v1/session/`, {
    body: JSON.stringify(body),
    headers: {
      "PersoLive-APIKey": apiKey,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  let json = await PersoUtil.parseJson(response);
  return json.session_id as string;
};

type PromptMetadata = {
  prompt_id: string;
  intro_message: string;
};

/**
 * Retrieves the intro message for a specific prompt.
 *
 * WARNING: This function requires an API key. When using this function in
 * client-side code, the API key will be exposed to the browser. For production
 * use, prefer fetching intro messages server-side using `perso-interactive-sdk/server`.
 *
 * @param apiServer Perso API server URL.
 * @param apiKey API key used for authentication.
 * @param promptId The prompt ID to fetch intro message for.
 * @returns The intro message string.
 */
export const getIntroMessage = async (
  apiServer: string,
  apiKey: string,
  promptId: string
) => {
  try {
    const prompts = (await PersoUtil.getPrompts(
      apiServer,
      apiKey
    )) as PromptMetadata[];
    const prompt = prompts.find((item) => item.prompt_id === promptId);

    if (!prompt) {
      throw new Error(`Prompt (${promptId}) not found`, { cause: 404 });
    }

    return prompt.intro_message;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw new Error(err.detail, { cause: err.errorCode ?? 500 });
    }

    throw err;
  }
};
