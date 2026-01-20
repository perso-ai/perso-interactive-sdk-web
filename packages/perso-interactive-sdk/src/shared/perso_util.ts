import { ApiError } from "./error";

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
  static async getLLMs(apiServer: string, apiKey: string) {
    const promise = fetch(`${apiServer}/api/v1/settings/llm_type/`, {
      headers: {
        "PersoLive-APIKey": apiKey,
      },
      method: "GET",
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
  static async getModelStyles(apiServer: string, apiKey: string) {
    const promise = fetch(
      `${apiServer}/api/v1/settings/modelstyle/?platform_type=webrtc`,
      {
        headers: {
          "PersoLive-APIKey": apiKey,
        },
        method: "GET",
      }
    );
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
  static async getBackgroundImages(apiServer: string, apiKey: string) {
    const promise = fetch(`${apiServer}/api/v1/background_image/`, {
      headers: {
        "PersoLive-APIKey": apiKey,
      },
      method: "GET",
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
  static async getTTSs(apiServer: string, apiKey: string) {
    const promise = fetch(`${apiServer}/api/v1/settings/tts_type/`, {
      headers: {
        "PersoLive-APIKey": apiKey,
      },
      method: "GET",
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
   *     "service": string
   *   }
   * ]
   */
  static async getSTTs(apiServer: string, apiKey: string) {
    const promise = fetch(`${apiServer}/api/v1/settings/stt_type/`, {
      headers: {
        "PersoLive-APIKey": apiKey,
      },
      method: "GET",
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
   *     "description": string,
   *     "prompt_id": string,
   *     "system_prompt": string,
   *     "require_document": boolean,
   *     "intro_message": string
   *   }
   * ]
   */
  static async getPrompts(apiServer: string, apiKey: string) {
    const promise = fetch(`${apiServer}/api/v1/prompt/`, {
      headers: {
        "PersoLive-APIKey": apiKey,
      },
      method: "GET",
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
  static async getDocuments(apiServer: string, apiKey: string) {
    const promise = fetch(`${apiServer}/api/v1/document/`, {
      headers: {
        "PersoLive-APIKey": apiKey,
      },
      method: "GET",
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
   *     "mcpserver_id": string,
   *     "name": string,
   *     "url": string,
   *     "description": string
   *   }
   * ]
   */
  static async getMcpServers(apiServer: string, apiKey: string) {
    const promise = fetch(`${apiServer}/api/v1/settings/mcp_type/`, {
      headers: {
        "PersoLive-APIKey": apiKey,
      },
      method: "GET",
    });
    const response = await promise;

    return await this.parseJson(response);
  }

  /**
   * @param apiServer Perso Interactive API Server
   * @param apiKey Perso Interactive API Key
   * @returns JSON
   * {
   *   "session_id": string,
   *   "client_sdp": string,
   *   "server_sdp": string,
   *   "prompt": {
   *     "name": string,
   *     "description": string,
   *     "prompt_id": string,
   *     "system_prompt": string,
   *     "require_document": boolean,
   *     "intro_message": string
   *   },
   *   "document": string,
   *   "llm_type": {
   *     "name": string
   *   },
   *   "model_style": {
   *     "name": string,
   *     "model": string,
   *     "model_file": string,
   *     "style": string,
   *     "file": string
   *   },
   *   "tts_type": {
   *     "name": string,
   *     "service": string,
   *     "model": string,
   *     "voice": string,
   *     "style": string,
   *     "voice_extra_data": string
   *   },
   *   "ice_servers": Array<RTCIceServer>,
   *   "status": string, // "CREATED", "EXCHANGED", "IN_PROGRESS", "TERMINATED"
   *   "termination_reason": string, // "GRACEFUL_TERMINATION", "SESSION_EXPIRED_BEFORE_CONNECTION", "SESSION_LOST_AFTER_CONNECTION", "SESSION_MISC_ERROR", "MAX_ACTIVE_SESSION_QUOTA_EXCEEDED", "MAX_MIN_PER_SESSION_QUOTA_EXCEEDED", "TOTAL_MIN_PER_MONTH_QUOTA_EXCEEDED"
   *   "duration_sec": number,
   *   "created_at": string, // ex) "2024-05-02T09:05:55.395Z"
   *   "padding_left": number,
   *   "padding_top": number,
   *   "padding_height": number,
   *   "background_image": {
   *     "backgroundimage_id": string,
   *     "title": string,
   *     "image": string,
   *     "created_at": string // ex) "2024-05-02T09:05:55.395Z"
   *  },
   *  "extra_data": string
   * }
   */
  static async getSessionInfo(apiServer: string, sessionId: string) {
    const promise = fetch(`${apiServer}/api/v1/session/${sessionId}/`, {
      method: "GET",
    });
    const response = await promise;

    return await this.parseJson(response);
  }

  static async sessionEvent(
    apiServer: string,
    sessionId: string,
    sessionEvent: string
  ) {
    const promise = fetch(
      `${apiServer}/api/v1/session/${sessionId}/event/create/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          detail: "",
          event: sessionEvent,
        }),
      }
    );
    await promise;
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
      throw new ApiError(
        response.status,
        error.code,
        error.detail,
        error.attr
      );
    }
  }
}
