# Perso Interactive SDK details (js)

## PersoInteractive

### Get LLM list

```typescript
function getLLMs(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of LLM objects

```JSON
[
  {
    "name": string
  }
]
```

### Get TTS list

```typescript
function getTTSs(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of TTS objects

```JSON
[
  {
    "name": string,
    "service": string,
    "speaker": string
  }
]
```

### Get STT list

```typescript
function getSTTs(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of STT objects

```JSON
[
  {
    "name": string,
    "service": string,
    "options": string
  }
]
```

### Get ModelStyle list

```typescript
function getModelStyles(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of ModelStyle objects

```JSON
[
  {
    "name": string,
    "model": string,
    "style": string
  }
]
```

### Get prompt list

```typescript
function getPrompts(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of Prompt objects

```JSON
[
  {
    "name": string,
    "description": string,
    "prompt_id": string,
    "system_prompt": string,
    "require_document": boolean,
    "intro_message": string
  }
]
```

### Get document list

```typescript
function getDocuments(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of Document objects

```JSON
[
  {
    "document_id": string,
    "title": string,
    "description": string,
    "search_count": number,
    "processed": boolean,
    "created_at": string, // ex) "2024-05-02T09:05:55.395Z",
    "updated_at": string // ex) "2024-05-02T09:05:55.395Z"
  }
]
```

### Get background image list

```typescript
function getBackgroundImages(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of BackgroundImage objects

```JSON
[
  {
    "backgroundimage_id": string,
    "title": string,
    "image": string,
    "created_at": string // ex) "2024-05-02T09:05:55.395Z"
  }
]
```

### Get Remote MCP Server list

```typescript
function getMcpServers(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of MCPServer objects

```JSON
[
  {
    "mcpserver_id": string,
    "name": string,
    "url": string,
    "description": string
  }
]
```

### Get Text Normalization Config list

```typescript
function getTextNormalizations(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of TextNormalizationConfig objects

```JSON
[
  {
    "textnormalizationconfig_id": string,
    "name": string,
    "created_at": string
  }
]
```

### Download Text Normalization Config

Downloads the ruleset data file for a specific Text Normalization Config. Returns a pre-signed Blob Storage URL for the CSV file that can be downloaded directly. Supports Azure Blob Storage ETag for caching.

**Top-level convenience function** (available from `perso-interactive-sdk-web/client`):

```typescript
function getTextNormalization(
  apiServer: string,
  apiKey: string,
  configId: string
): Promise<TextNormalizationDownload>;
```

**Low-level method** (available via `PersoUtilServer` from `perso-interactive-sdk-web/server`):

```typescript
PersoUtilServer.downloadTextNormalization(apiServer, apiKey, configId): Promise<TextNormalizationDownload>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `apiServer` | Yes | API Server URL |
| `apiKey` | Yes | API Key |
| `configId` | Yes | TextNormalizationConfig `textnormalizationconfig_id` |

**Returns:** `TextNormalizationDownload` object

```typescript
interface TextNormalizationDownload {
  config_id: string;
  config_name: string;
  file_url: string;   // Pre-signed URL; use Azure Blob Storage ETag for caching
}
```

```typescript
import { getTextNormalization } from "perso-interactive-sdk-web/client";

const download = await getTextNormalization(
  apiServer,
  apiKey,
  "<textnormalizationconfig_id>"
);
// download.file_url → pre-signed URL to the CSV ruleset
```

### Get all settings

```typescript
function getAllSettings(apiServer: string, apiKey: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Object containing all settings

```JSON
{
  "llms": JSON, // result of getLLMs
  "ttsTypes": JSON, // result of getTTSs
  "sttTypes": JSON, // result of getSTTs
  "modelStyles": JSON, // result of getModelStyles
  "prompts": JSON, // result of getPrompts
  "documents": JSON, // result of getDocuments
  "backgroundImages": JSON, // result of getBackgroundImages
  "mcpServers": JSON, // result of getMcpServers
  "textNormalizations": JSON // result of getTextNormalizations
}
```

### Create session id

> **Server-side only**: This function requires your API key. Always call it from your server to keep the key secret. Pass only the returned `sessionId` to the browser.

```typescript
// Overload 1: Create from a SessionTemplate ID (recommended)
function createSessionId(
  apiServer: string,
  apiKey: string,
  sessionTemplateId: string
): Promise<string>;

// Overload 2: Create from explicit params
function createSessionId(
  apiServer: string,
  apiKey: string,
  params: {
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
    text_normalization_config?: string;
    text_normalization_locale?: string | null;
  }
): Promise<string>;
```

**Overload 1 — `sessionTemplateId`**: Pass a SessionTemplate ID (string) as the third argument. The function internally calls `getSessionTemplate` to resolve the template and maps its fields to the request body. This is the simplest way to create a session when you have pre-configured templates.

- Throws if `model_style.platform_type` is not `"webrtc"`.

```typescript
// Example: create session from template
const sessionId = await createSessionId(apiServer, apiKey, "tmpl-abc-123");
```

**Overload 2 — `params`**: Pass an object with explicit runtime options (original behavior).

| Parameter | Required | Description |
|-----------|----------|-------------|
| `apiServer` | Yes | API Server URL |
| `apiKey` | Yes | API Key |
| `params.using_stf_webrtc` | Yes | Whether to enable the STF WebRTC pipeline (set to `true` for the SDK demos) |
| `params.model_style` | Yes | ModelStyle `name` |
| `params.prompt` | Yes | Prompt `prompt_id` |
| `params.llm_type` | No | LLM `name` |
| `params.tts_type` | No | TTS `name` |
| `params.stt_type` | No | STT `name` |
| `params.document` | No | Document `document_id` |
| `params.background_image` | No | BackgroundImage `backgroundimage_id` |
| `params.text_normalization_config` | No | TextNormalizationConfig `textnormalizationconfig_id` |
| `params.text_normalization_locale` | No | Locale for text normalization (e.g., `"ko"`, `"en"`). Pass `null` to explicitly disable. |
| `params.mcp_servers` | No | MCPServer `mcpserver_id` array |
| `params.padding_left` | No | AI human horizontal position (A number between -1.0 and 1.0, default 0.0) |
| `params.padding_top` | No | AI human vertical position (A number between 0.0 and 1.0, default 0.0) |
| `params.padding_height` | No | The scale of AI human height; the width of the AI human cannot exceed the width of the background (A number between 0.0 and 5.0, default 1.0) |

**Returns:** Session ID (string)

#### Express.js Example

This example uses [Express](https://www.npmjs.com/package/express). Install the required packages:

```bash
# npm
npm install express perso-interactive-sdk-web

# yarn
yarn add express perso-interactive-sdk-web

# pnpm
pnpm add express perso-interactive-sdk-web
```

```javascript
// server.js
const express = require("express");
const { createSessionId } = require("perso-interactive-sdk-web/server");

const app = express();

const API_SERVER = "https://live-api.perso.ai";
const API_KEY = process.env.PERSO_INTERACTIVE_API_KEY;

app.post("/api/session", async (req, res) => {
  try {
    const sessionId = await createSessionId(API_SERVER, API_KEY, {
      using_stf_webrtc: true,
      model_style: "<model_style_name>",
      prompt: "<prompt_id>",
      llm_type: "<llm_name>",
      tts_type: "<tts_name>",
      stt_type: "<stt_name>",
      // text_normalization_config: "<textnormalizationconfig_id>", // optional
    });
    res.json({ sessionId });
  } catch (error) {
    console.error("Session creation failed:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// Using a SessionTemplate (simpler — no need to specify individual options)
app.post("/api/session-from-template", async (req, res) => {
  try {
    const sessionId = await createSessionId(API_SERVER, API_KEY, "<sessiontemplate_id>");
    res.json({ sessionId });
  } catch (error) {
    console.error("Session creation failed:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
```

#### Client-side Testing Only

> ⚠️ **Warning**: The following example exposes your API key in the browser. Use this **only for local testing**. Never deploy this to production. If your API key is compromised due to client-side usage, the SDK provider assumes no responsibility.

```typescript
import {
  createSessionId,
  createSession,
} from "perso-interactive-sdk-web/client";

const apiServer = "https://live-api.perso.ai";
const apiKey = "YOUR_API_KEY"; // ⚠️ NEVER commit or expose this in production

const sessionId = await createSessionId(apiServer, apiKey, {
  using_stf_webrtc: true,
  model_style: "<model_style_name>",
  prompt: "<prompt_id>",
  llm_type: "<llm_name>",
  tts_type: "<tts_name>",
  stt_type: "<stt_name>",
  // text_normalization_config: "<textnormalizationconfig_id>", // optional
});

const session = await createSession(apiServer, sessionId, 1920, 1080, []);
const videoEl = document.getElementById("video");
if (videoEl instanceof HTMLVideoElement) {
  session.setSrc(videoEl);
}
```

### Get intro message

> **Server-side only**: This function requires your API key.

```typescript
function getIntroMessage(
  apiServer: string,
  apiKey: string,
  promptId: string
): Promise<string>;
```

| Parameter   | Required | Description                              |
|-------------|----------|------------------------------------------|
| `apiServer` | Yes      | API Server URL                           |
| `apiKey`    | Yes      | API Key                                  |
| `promptId`  | Yes      | The prompt ID to fetch intro message for |

**Returns:** The intro message string for the given prompt.

**Throws:**
- `Error` with `cause: 404` if the prompt is not found
- `Error` with the API error detail if an `ApiError` occurs

```typescript
import { getIntroMessage } from "perso-interactive-sdk-web/server";

const intro = await getIntroMessage(apiServer, apiKey, "<prompt_id>");
```

### Get Session Template list

> **Server-side only**: This function requires your API key.

```typescript
function getSessionTemplates(
  apiServer: string,
  apiKey: string
): Promise<SessionTemplate[]>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |

**Returns:** Array of SessionTemplate objects

```JSON
[
  {
    "sessiontemplate_id": string,
    "name": string,
    "description": string | null,
    "prompt": {
      "prompt_id": string,
      "name": string,
      "description"?: string,
      "system_prompt": string,
      "require_document"?: boolean,
      "intro_message"?: string
    },
    "capability": [
      {
        "name": string,       // "LLM" | "TTS" | "STT" | "STF_ONPREMISE" | "STF_WEBRTC"
        "description"?: string | null
      }
    ],
    "document": {
      "document_id": string,
      "title": string,
      "file": string,
      "description"?: string,
      "search_count"?: number,
      "ef_search"?: number | null,
      "processed": boolean,
      "processed_v2": boolean,
      "created_at": string,
      "updated_at": string
    } | null,
    "llm_type": {
      "name": string,
      "service"?: string
    },
    "tts_type": {
      "name": string,
      "streamable"?: boolean,
      "service": string,
      "model"?: string | null,
      "voice"?: string | null,
      "voice_settings"?: object | null,
      "style"?: string | null,
      "voice_extra_data"?: object | null
    },
    "stt_type": {
      "name": string,
      "service": string,
      "options"?: object | null
    },
    "text_normalization_config"?: {
      "textnormalizationconfig_id": string,
      "name": string,
      "created_at": string
    } | null,
    "text_normalization_locale"?: string | null,
    "model_style": {
      "name": string,
      "model": string,
      "model_file"?: string | null,
      "model_files": [{ "name": string, "file"?: string | null }],
      "style": string,
      "file"?: string | null,
      "platform_type"?: string,
      "configs": [{ "modelstyleconfig_id": string, "key": string, "value": string }]
    },
    "background_image": {
      "backgroundimage_id": string,
      "title": string,
      "image": string,
      "created_at": string
    } | null,
    "agent": string | null,
    "padding_left": number | null,
    "padding_top": number | null,
    "padding_height": number | null,
    "extra_data": object | null,
    "mcp_servers"?: [
      {
        "mcpserver_id": string,
        "name": string,
        "description"?: string,
        "url": string,
        "transport_protocol"?: string,
        "server_timeout_sec"?: number,
        "extra_data"?: object | null
      }
    ],
    "created_at": string,
    "last_used_at": string | null
  }
]
```

### Get Session Template

> **Server-side only**: This function requires your API key.

```typescript
function getSessionTemplate(
  apiServer: string,
  apiKey: string,
  sessionTemplateId: string
): Promise<SessionTemplate>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `apiKey` | API Key |
| `sessionTemplateId` | Session Template ID |

**Returns:** A single SessionTemplate object (same schema as array element above)

### Make TTS

```typescript
function makeTTS(
  apiServer: string,
  params: {
    sessionId: string;
    text: string;
    locale?: string;
    output_format?: string;
  }
): Promise<{ audio: string }>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `apiServer` | Yes | API Server URL |
| `params.sessionId` | Yes | Active session ID |
| `params.text` | Yes | Text to synthesize |
| `params.locale` | No | Language/locale code for TTS (e.g., `"ko"`, `"en"`) |
| `params.output_format` | No | Audio output format (e.g., `"wav"`) |

**Returns:** Object with Base64-encoded audio string

```JSON
{
  "audio": string
}
```

```typescript
import { makeTTS } from "perso-interactive-sdk-web/client";

const result = await makeTTS(apiServer, {
  sessionId: "<session_id>",
  text: "Hello, world!",
  locale: "en",         // optional
  output_format: "wav", // optional
});
// result.audio contains Base64-encoded audio data
```

### PersoUtilServer

> **Server-side only**: Available from `perso-interactive-sdk-web/server`.

Server-side alias for the internal `PersoUtil` class. Exposes low-level static methods
for direct API calls (e.g., `getLLMs`, `getPrompts`, `getModelStyles`).
Most users should prefer the top-level convenience functions instead.

### Create session

The `sessionId` parameter should be obtained from your server endpoint (see [Create session id](#create-session-id) above).

```typescript
function createSession(
  apiServer: string,
  sessionId: string,
  width: number,
  height: number,
  clientTools: Array<ChatTool>
): Promise<Session>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `apiServer` | Yes | API Server URL |
| `sessionId` | Yes | Session ID obtained from your server |
| `width` | Yes | AI human video width |
| `height` | Yes | AI human video height |
| `clientTools` | Yes | Client tools to be registered with the LLM |

**Returns:** Session object

### Get session info

```typescript
function getSessionInfo(apiServer: string, sessionId: string): Promise<any>;
```

| Parameter | Description |
|-----------|-------------|
| `apiServer` | API Server URL |
| `sessionId` | Session ID |

**Returns:** Session info object

```JSON
{
  "session_id": string,
  "client_sdp": string,
  "server_sdp": string,
  "prompt": {
    "name": string,
    "description": string,
    "prompt_id": string,
    "system_prompt": string,
    "require_document": boolean,
    "intro_message": string
  },
  "document": string,
  "llm_type": {
    "name": string
  },
  "model_style": {
    "name": string,
    "model": string,
    "model_file": string,
    "style": string,
    "file": string
  },
  "tts_type": {
    "name": string,
    "service": string,
    "model": string,
    "voice": string,
    "style": string,
    "voice_extra_data": string
  },
  "ice_servers": Array<RTCIceServer>,
  "status": string, // "CREATED", "EXCHANGED", "IN_PROGRESS", "TERMINATED"
  "termination_reason": string, // "GRACEFUL_TERMINATION", "SESSION_EXPIRED_BEFORE_CONNECTION", "SESSION_LOST_AFTER_CONNECTION", "SESSION_MISC_ERROR", "MAX_ACTIVE_SESSION_QUOTA_EXCEEDED", "MAX_MIN_PER_SESSION_QUOTA_EXCEEDED", "TOTAL_MIN_PER_MONTH_QUOTA_EXCEEDED"
  "duration_sec": number,
  "created_at": string, // ex) "2024-05-02T09:05:55.395Z"
  "padding_left": number,
  "padding_top": number,
  "padding_height": number,
  "background_image": {
    "backgroundimage_id": string,
    "title": string,
    "image": string,
    "created_at": string // ex) "2024-05-02T09:05:55.395Z"
  },
  "extra_data": string
}
```

## Session

### Send a message to the AI human

```typescript
function processChat(message: string): Promise<void>;
```

'message' must not be empty

ChatState.LLM is set in the 'Chat states'.  
While the AI human is preparing a response, ChatState.ANALYZING is set in 'Chat states'.  
When speaking begins, ChatState.SPEAKING is set in 'Chat states'.

### Stream LLM responses with full control (Advanced)

```typescript
function processLLM(options: ProcessLLMOptions): AsyncGenerator<LLMStreamChunk>;
```

| Parameter | Description |
|-----------|-------------|
| `options` | Configuration object containing message, optional tools, and abort signal |

**Returns:** `AsyncGenerator<LLMStreamChunk>` - An async generator that yields streaming chunks

This method provides fine-grained control over LLM streaming responses. Unlike `processChat()`, it:
- Does NOT automatically trigger TTS/avatar speech
- Does NOT automatically update chat logs
- Does NOT manage chat states
- Gives you full control over the streaming response

**Use cases:**
- Custom UI rendering of streaming text
- Intercepting and modifying LLM responses
- Building custom chat interfaces
- Integration with external systems

**Example usage:**

```typescript
const controller = new AbortController();

for await (const chunk of session.processLLM({
  message: "Hello, how are you?",
  signal: controller.signal
})) {
  if (chunk.type === 'message') {
    console.log('Streaming:', chunk.message);
    if (chunk.finish) {
      console.log('Complete response:', chunk.message);
      // Optionally trigger avatar speech
      session.processTTSTF(chunk.message);
    }
  } else if (chunk.type === 'tool_call') {
    console.log('Tool called:', chunk.tool_calls);
  } else if (chunk.type === 'tool_result') {
    console.log('Tool result:', chunk.result);
  } else if (chunk.type === 'error') {
    console.error('Error:', chunk.error);
  }
}
```

**Cancellation:**

```typescript
// Cancel the stream
controller.abort();

// Or break from the loop
for await (const chunk of session.processLLM({ message: "..." })) {
  if (someCondition) break; // Cleanly exits the generator
}
```

### Get message history

```typescript
function getMessageHistory(): ReadonlyArray<object>;
```

**Returns:** Read-only array of message history objects

Returns the conversation history used by the LLM. Each entry contains `role`, `type`, and `content` fields.

**Example usage:**

```typescript
const history = session.getMessageHistory();
console.log('Conversation has', history.length, 'messages');
```

### Transcribe audio to text

```typescript
function transcribeAudio(audio: Blob | File, language?: string): Promise<string>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `audio` | Yes | Audio data as Blob or File |
| `language` | No | Language code for STT (e.g., 'ko', 'en') |

**Returns:** Promise resolving to transcribed text

**Throws:** `STTError` if the API call fails

Converts audio to text using the STT API. This is a lower-level method compared to `startProcessSTT()`/`stopProcessSTT()` - use it when you have pre-recorded audio or audio from external sources.

**Example usage:**

```typescript
// From a file input
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const text = await session.transcribeAudio(file, 'ko');

// From a Blob
const audioBlob = new Blob([audioData], { type: 'audio/wav' });
const text = await session.transcribeAudio(audioBlob);
```

### Custom LLM response (Deprecated)

```typescript
/** @deprecated Use processTTSTF() with explicit history management instead. */
function processCustomChat(message: string): void;
```

'message' must not be empty

> **Deprecated**: This function is deprecated. Use `processTTSTF()` instead and manage message history manually via `getMessageHistory()` if needed.

This function makes the AI human speak the response message generated by a custom LLM. This function does not invoke the internal LLM.

While the AI human is preparing a response, ChatState.ANALYZING is set in 'Chat states'.  
When speaking begins, ChatState.SPEAKING is set in 'Chat states'.

**Important Notes:**

- Does not manage messageHistory automatically
- `subscribeChatLog` is not available when using this function
- `subscribeChatStates` cannot handle ChatState.LLM (only ANALYZING and SPEAKING states are triggered)
- Use this function when you want to integrate your own custom LLM instead of using the internal LLM

**Related methods:**
- `processTTSTF()` - Recommended replacement; adds message to history and chat log automatically
- `processLLM()` - For custom LLM integration with streaming support

### AI human speaks the 'message'

```typescript
function processTTSTF(message);
```

'message' must not be empty

While the AI human is preparing a response, ChatState.ANALYZING is set in 'Chat states'.
When speaking begins, ChatState.SPEAKING is set in 'Chat states'.

### Generate TTS audio from text

```typescript
function processTTS(
  message: string,
  options?: { resample?: boolean; locale?: string; output_format?: string }
): Promise<Blob | undefined>;
```

| Parameter          | Required | Description                                                        |
|--------------------|----------|--------------------------------------------------------------------|
| `message`          | Yes      | Text to convert to speech audio                                    |
| `options`          | No       | Options object                                                     |
| `options.resample` | No       | Whether to resample audio to TTS target sample rate (default: `false`) |
| `options.locale` | No       | Language locale code for TTS (e.g., `'ko'`, `'en'`). Passed to the TTS API when specified. |
| `options.output_format` | No       | Audio output format (e.g., `'wav'`, `'mp3'`). Passed to the TTS API when specified. |

**Returns:** `Blob` containing audio data (audio/wav), or `undefined` if the message is empty after filtering.

This function converts text to speech audio without making the AI human speak. Use this when you need the TTS audio file separately.

While processing, ChatState.TTS is set in the 'Chat states'.

**Example usage:**

```typescript
const audioBlob = await session.processTTS("Hello, world!");
if (audioBlob) {
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  audio.play();

  // Remember to revoke the URL when done to prevent memory leaks
  audio.onended = () => URL.revokeObjectURL(audioUrl);
}

// With locale and output format
const audioBlob = await session.processTTS("Hello, world!", {
  resample: false,
  locale: "en",
  output_format: "mp3"
});
```

**Error handling:**

If an error occurs during TTS processing, a `TTSError` is passed to the error handler set via `setErrorHandler()`.

### Send audio/video to STF pipeline

```typescript
function processSTF(file: Blob, format: string, message: string): Promise<string>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `file` | Yes | The audio or video file to send as a Blob |
| `format` | Yes | The file format (e.g., `'wav'`, `'mp4'`) |
| `message` | Yes | The message to accompany the file |

Sends an audio or video file to the STF (Speech-To-Face) pipeline for processing. This method requires an active WebRTC connection (STF mode).

**Returns:** `Promise<string>` - The STF pipeline response

**Throws:**
- `Error("processSTF requires WebRTC (STF mode)")` if the session does not have an active WebRTC connection

**ChatState transitions:** ANALYZING → SPEAKING

**Example usage:**

```typescript
const audioBlob = new Blob([audioData], { type: 'audio/wav' });
const response = await session.processSTF(audioBlob, 'wav', 'Hello');
```

### Stop AI human speaking

```typescript
function clearBuffer(): Promise<void>;
```

You can stop the AI human's response. If called before speech starts, the pending speech will not begin. If speech has already started, it will stop after the current sentence finishes.

### Start STT recording (HTTP API)

```typescript
function startProcessSTT(timeout?: number): Promise<void>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `timeout` | No | Optional timeout in milliseconds to automatically stop recording |

Starts recording audio for STT (Speech-To-Text) processing.

**How it works:**
1. Records audio using Web Audio API (client-side)
2. Encodes to WAV format
3. Sends to STT REST API via HTTP
4. Returns transcribed text

This is the recommended STT method with better cross-browser support and explicit control over the transcription flow.

**Throws:**
- `Error` if already recording
- `Error` if microphone access is denied

**Browser Support:**
- Chrome 66+
- Firefox 76+
- Safari 14.1+
- iOS Safari 14.5+
- Edge 79+

### Stop STT recording and transcribe (HTTP API)

```typescript
function stopProcessSTT(language?: string): Promise<string>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `language` | No | Optional language code for STT (e.g., 'ko', 'en') |

Stops STT recording and sends the recorded audio to the STT REST API for transcription.

**Returns:** Promise resolving to the transcribed text (string)

**Throws:**
- `STTError` if the API call fails
- `Error("STT recording is not in progress")` if the recorder exists but is not recording
- `Error("STT recording has not been started")` if `startProcessSTT()` was not called

**Usage Example:**

```typescript
// Start recording
await session.startProcessSTT();

// ... user speaks ...

// Stop recording and get transcribed text
try {
  const text = await session.stopProcessSTT('ko');
  console.log('Transcribed:', text);

  // Process the text manually or send to chat
  if (text.trim().length > 0) {
    session.processChat(text);
  }
} catch (error) {
  if (error instanceof STTError) {
    console.error('STT API failed:', error.message);
  }
}
```

### Check STT recording status

```typescript
function isSTTRecording(): boolean;
```

**Returns:** `true` if STT recording is currently in progress or has audio pending from timeout, `false` otherwise

This method returns `true` in the following cases:
1. Recording is actively in progress (after `startProcessSTT()` and before `stopProcessSTT()`)
2. Recording was automatically stopped by timeout but `stopProcessSTT()` has not been called yet (audio is pending)

**Usage Example:**

```typescript
if (!session.isSTTRecording()) {
  await session.startProcessSTT();
} else {
  const text = await session.stopProcessSTT();
  // Handle transcribed text
}
```

### Get last recorded audio file

```typescript
public lastRecordedAudioFile: File | null;
```

**Returns:** The last recorded WAV audio file from STT processing, or `null` if no recording has been made.

After calling `stopProcessSTT()`, you can access the recorded audio file for playback or other purposes.

**Usage Example:**

```typescript
// Start recording
await session.startProcessSTT();

// ... user speaks ...

// Stop recording and get transcribed text (language parameter is optional)
const text = await session.stopProcessSTT();

// Access the recorded audio file
if (session.lastRecordedAudioFile) {
  const audioUrl = URL.createObjectURL(session.lastRecordedAudioFile);
  const audio = new Audio(audioUrl);
  audio.play();
  
  // Remember to revoke the URL when done to prevent memory leaks
  audio.onended = () => URL.revokeObjectURL(audioUrl);
}
```

### ~~startVoiceChat~~ (Deprecated)

```typescript
/** @deprecated Use startProcessSTT() instead. */
function startVoiceChat(): void;
```

> **Deprecated**: This method is deprecated and will be removed in a future version. Use `startProcessSTT()` instead.

Previously used WebRTC data channel for STT.

**Migration:** Use `startProcessSTT()` for HTTP API-based STT recording.

### ~~stopVoiceChat~~ (Deprecated)

```typescript
/** @deprecated Use stopProcessSTT() instead. */
function stopVoiceChat(): void;
```

> **Deprecated**: This method is deprecated and will be removed in a future version. Use `stopProcessSTT()` instead.

Previously used WebRTC data channel for STT.

**Migration:** Use `stopProcessSTT()` for HTTP API-based STT transcription.

### Get user's audio stream (Deprecated)

> ⚠️ **Deprecated**: Legacy voice chat mode will be removed in a future version.

```typescript
function getLocalStream(): MediaStream | null;
```

**Returns:** `MediaStream | null` — `null` if not in legacy voice chat mode.

Only available in legacy voice chat mode. Returns `null` otherwise.

### Get AI human's media(video + audio) stream

```typescript
function getRemoteStream(): MediaStream | undefined;
```

**Returns:** `MediaStream | undefined` — `undefined` if the Perso renderer is not yet initialized.

It can be used for various purposes such as recording.

### Get 'SessionID'

```typescript
function getSessionId(): string;
```

**Returns:** Session ID (string)

### Specifies the HTMLVideoElement to display the AI human video

```typescript
function setSrc(element: HTMLVideoElement);
```

| Parameter | Description |
|-----------|-------------|
| `element` | HTMLVideoElement (`<video>`) where the AI human's video will be rendered |

### Adjusts the size of the AI Human video during execution

```typescript
function changeSize(width: number, height: number);
```

| Parameter | Description |
|-----------|-------------|
| `width` | AI Human video width |
| `height` | AI Human video height |

You can change the size of the AI human even after the session has been created.

### Callback for when the session is closed

```typescript
function onClose(callback: (manualClosed: boolean) => void): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function invoked when the session is closed |

**Callback parameter:**

| Parameter | Description |
|-----------|-------------|
| `manualClosed` | `true` if the user closed the session themselves, `false` if quota exceeded or network error occurred |

**Returns:** `removeOnClose` - function to remove the callback

### Subscribe to conversation log changes from the session

```typescript
function subscribeChatLog(callback: (chatLog: Array<Chat>) => void): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function for receiving conversation log updates |

**Chat interface:**

```typescript
interface Chat {
  isUser: boolean; // true - user, false - AI human
  text: string; // conversation
  timestamp: Date; // conversation timestamp
}
```

**Returns:** `unsubscribeChatLog` - function to unsubscribe

Receive the entire conversation log whenever it's updated.

### Subscribe to 'Chat states' changes from the session

```typescript
function subscribeChatStates(
  callback: (chatStates: Set<ChatState>) => void
): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function for receiving chat state changes |

**Callback parameter:**

| Parameter | Description |
|-----------|-------------|
| `chatStates` | A set containing the processes currently in progress. Multiple states can be included at the same time. If empty, it indicates an available state. |

**Returns:** `unsubscribeChatStates` - function to unsubscribe

Receive 'Chat states' changes during conversation.

### Set STT result callback (Voice chat)

```typescript
function setSttResultCallback(callback: (text: string) => void): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function that receives STT (Speech-To-Text) results during voice chat |

**Returns:** Function to remove the callback

### Set error handler

```typescript
function setErrorHandler(callback: (error: Error) => void): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function that receives errors occurring during the processChat process |

**Returns:** Function to remove the error handler

### Log session event

```typescript
function logSessionEvent(detail?: string | Record<string, unknown>): Promise<void>;
```

Sends a `SESSION_LOG` event for the current session. Use this to record custom analytics or debugging information.

| Parameter | Description |
|-----------|-------------|
| `detail` | Optional event description. Strings are sent as-is; objects are JSON-stringified. |

**Usage:**

```typescript
// String detail
await session.logSessionEvent("user clicked submit button");

// Object detail (JSON-stringified internally)
await session.logSessionEvent({ action: "button_click", target: "submit" });

// No detail
await session.logSessionEvent();
```

### Stop session

```typescript
function stopSession();
```

Closes the session and ends the AI human conversation immediately. If successfully closed, `true` will be sent to the `onClose` callback.

## ChatState

```typescript
enum ChatState {
  RECORDING = "RECORDING",
  LLM = "LLM",
  ANALYZING = "ANALYZING",
  SPEAKING = "SPEAKING",
  TTS = "TTS",
}
```

These values represent the conversation state.

| State | Description |
|-------|-------------|
| `RECORDING` | The user is inputting voice for a voice chat. |
| `LLM` | The LLM is generating a response to the user's message. |
| `ANALYZING` | The response generated by the LLM is being processed for the AI human to speak. |
| `SPEAKING` | The AI human is speaking. |
| `TTS` | The `processTTS()` function is generating audio from text. |

## ChatTool

Perso Interactive supports 'Tool calling'.  
There are two types of tool calling: Remote MCP tool and Client tool.  
Remote MCP tools can be registered and managed through the Perso Interactive back office.  
This section explains Client tools only.

### What is 'Client tool'?

A Client tool is an external module or function that performs tasks that the LLM (Large Language Model) cannot execute directly.  
In other words, it's a tool that enables the LLM to carry out real-world actions—such as data retrieval, calculations, or file processing—that it can't handle by "just talking."

LLM → calls Client tool → performs actual operation → returns result  
The LLM only knows how and when to use the Client tool.  
The Client tool handles the actual logic.

'ChatTool' is a Perso Interactive class used to define a Client tool and register it with the LLM.

```typescript
class ChatTool<TArg = any, TResult extends object = object> {
  constructor(
    public name: string,
    public description: string,
    public parameters: object,
    public call: (arg: TArg) => TResult | Promise<TResult>,
    public executeOnly: boolean = false
  );
}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `name` | Yes | The name of the ChatTool. It must be a unique value that distinguishes it from other tools (such as Remote MCP tools or Client tools). |
| `description` | Yes | A description of the ChatTool's purpose and functionality. Since the LLM refers to this information to understand how and when to use the Client tool, it should be written clearly. |
| `parameters` | Yes | The parameters required to call this ChatTool, defined in JSON Schema format. |
| `call` | Yes | Defines the actual operation. You can implement the necessary logic—such as connecting to external APIs—and return the result as an Object. |
| `executeOnly` | No | Set to true if the LLM does not need to provide a response after the ChatTool is executed. In some special cases (e.g., when multiple tools are requested simultaneously), this setting may be ignored. Default: `false` |

### Example: Using a Client tool

Suppose you want the LLM to provide real-time weather information.  
(However, by default, an LLM cannot provide real-time weather data.)  
But, you already have a function that retrieves weather information.

```typescript
/**
 * Retrieves the current weather for a given location
 * @param location - City and country, e.g. 'San Francisco, CA' / examples: 'New York, US', 'Seoul, KR'
 * @param units - The temperature unit to use, enum Units
 * @returns Weather
 */
function getCurrentWeather(
    location: string,
    units: Units = Units.CELSIUS
): Promise<Weather> {
    ...
}

enum Units {
    CELSIUS = 'celsius',
    FAHRENHEIT = 'fahrenheit'
}

interface Weather {
    temperature: number,
    condition: string,
    humidity: number,
    wind: number
}
```

You can define a ChatTool to expose getCurrentWeather as a Client tool and register it with the LLM.  
Below is an example ChatTool definition based on getCurrentWeather.

```typescript
const chatTool = new PersoInteractiveSDK.ChatTool(
  "get_current_weather",
  "Retrieves the current weather for a given location",
  {
    type: "object",
    properties: {
      location: {
        examples: ["New York, US", "Seoul, KR"],
        type: "string",
        description: "City and country, e.g. 'San Francisco, CA'",
      },
      units: {
        type: "string",
        description: "The temperature unit to use",
        enum: ["celsius", "fahrenheit"],
        default: "celsius",
      },
    },
    required: ["location", "units"],
  },
  async (arg) => {
    const location: string = arg.location;
    // convert string to Units, 'celsius' -> Units.CELSIUS
    const units = Object.values(Units).find((v) => v === arg.units);
    if (units === undefined) {
      return { result: "failed" };
    }

    try {
      const weather = await getCurrentWeather(location, units);
      return {
        temperature: `${weather.temperature}${
          units === Units.CELSIUS ? "℃" : "℉"
        }`, // 30℃, 86℉
        condition: weather.condition, // e.g. 'Mostly clear'
        humidity: `${weather.humidity}%`, // e.g. 68%
        wind: `${weather.wind}km/h`, // e.g. 10.3km/h
      };
    } catch (error) {
      return { result: "failed" };
    }
  },
  false
);
```

### Example Interaction

When a user asks:  
&emsp;"Tell me the current weather in Seoul."

The LLM analyzes the request and asks the client to execute the 'get_current_weather' tool.  
It sends the tool name and the arguments needed for execution:  
&emsp;name : 'get_current_weather'  
&emsp;arg.location : 'Seoul' (or 'Seoul, KR')  
&emsp;arg.units : 'celsius' (since no specific unit was mentioned, the default 'celsius' is used)

The client receives the 'get_current_weather' request, finds the ChatTool with that name, and calls call(arg).  
The result is returned to the LLM, which then generates a suitable response.

Example:  
&emsp;Q. Tell me the current weather in Seoul.  
&emsp;A. It's currently 30°C in Seoul with 68% humidity and clear skies.

&emsp;Q. Tell me the current weather in Seoul, in Fahrenheit.  
&emsp;A. It's currently 86°F in Seoul with 68% humidity and clear skies.

## ApiError

An error that occurs while using the Perso Interactive API. They include details such as the error type and description.

```typescript
class ApiError extends Error {
  constructor(
    public errorCode: number,
    public code: string,
    public detail: string,
    public attr?: string
  );
}
```

| Property | Required | Description |
|----------|----------|-------------|
| `errorCode` | Yes | HTTP error code |
| `code` | Yes | Error code string |
| `detail` | Yes | Detailed error description |
| `attr` | No | Additional attribute information |

## LLMError

An error that occurs during the use of the LLM API, which includes `ApiError` and `LLMStreamingResponseError`. This error is passed to the error handler.

```typescript
class LLMError extends Error {
  public underlyingError: ApiError | LLMStreamingResponseError;
}
```

| Property | Description |
|----------|-------------|
| `underlyingError` | The underlying error (`ApiError` or `LLMStreamingResponseError`) |

## LLMStreamingResponseError

An error that occurs during the streaming of an LLM response.

```typescript
class LLMStreamingResponseError extends Error {
  public description: string;
}
```

| Property | Description |
|----------|-------------|
| `description` | Detailed error description |

## STTError

An error that occurs during STT (Speech-To-Text) API calls. This error wraps `ApiError` and is thrown by `stopProcessSTT()`.

```typescript
class STTError extends Error {
  public underlyingError: ApiError;
}
```

| Property | Description |
|----------|-------------|
| `underlyingError` | The underlying `ApiError` containing HTTP status code and error details |

**Usage Example:**

```typescript
import { STTError } from 'perso-interactive-sdk-web/client';

try {
  const text = await session.stopProcessSTT('ko');
} catch (error) {
  if (error instanceof STTError) {
    console.error('STT API Error:', error.underlyingError.detail);
    console.error('Error Code:', error.underlyingError.code);
  } else {
    console.error('Recording Error:', error.message);
  }
}
```

## TTSError

An error that occurs during the TTS (Text-to-Speech) process, which includes `ApiError` and `TTSDecodeError`. This error is passed to the error handler when `processTTS()` fails.

```typescript
class TTSError extends Error {
  public underlyingError: ApiError | TTSDecodeError;
}
```

| Property | Description |
|----------|-------------|
| `underlyingError` | The underlying error (`ApiError` or `TTSDecodeError`) |

**Example error handling:**

```typescript
session.setErrorHandler((error) => {
  if (error instanceof TTSError) {
    if (error.underlyingError instanceof ApiError) {
      console.error("TTS API error:", error.underlyingError.detail);
    } else if (error.underlyingError instanceof TTSDecodeError) {
      console.error("TTS decode error:", error.underlyingError.description);
    }
  }
});
```

## TTSDecodeError

An error that occurs when decoding Base64 audio data from the TTS API fails.

```typescript
class TTSDecodeError extends Error {
  public description: string;
}
```

| Property | Description |
|----------|-------------|
| `description` | Detailed error description |

## ProcessLLMOptions

Options for the `processLLM()` method.

```typescript
interface ProcessLLMOptions {
  message: string;
  tools?: Array<ChatTool>;
  signal?: AbortSignal;
}
```

| Property | Required | Description |
|----------|----------|-------------|
| `message` | Yes | The user message to send to the LLM |
| `tools` | No | Optional array of tools to override the session's default client tools |
| `signal` | No | AbortSignal for cancellation support |

## LLMStreamChunk

Discriminated union type yielded by the `processLLM()` async generator.

```typescript
type LLMStreamChunk =
  | {
      type: 'message';
      chunks: string[];
      message: string;
      finish: boolean;
    }
  | {
      type: 'tool_call';
      tool_calls: Array<object>;
    }
  | {
      type: 'tool_result';
      tool_call_id: string;
      result: object;
    }
  | {
      type: 'error';
      error: Error;
    };
```

| Type | Description |
|------|-------------|
| `message` | Streaming text content. `chunks` contains all accumulated text pieces, `message` is the full concatenated text, `finish` indicates if this is the final chunk |
| `tool_call` | LLM requested tool execution. `tool_calls` contains the tool invocations with function names and arguments |
| `tool_result` | Result of a tool execution. `tool_call_id` identifies which tool call this result belongs to, `result` contains the tool's return value |
| `error` | An error occurred during streaming. `error` contains the `LLMError` instance |

**Example handling all chunk types:**

```typescript
for await (const chunk of session.processLLM({ message: "What's the weather?" })) {
  switch (chunk.type) {
    case 'message':
      // Update UI with streaming text
      updateStreamingText(chunk.message);
      if (chunk.finish) {
        // Final response received
        finalizeResponse(chunk.message);
      }
      break;
    case 'tool_call':
      // Tool is being executed (handled internally)
      console.log('Executing tools:', chunk.tool_calls.map(t => t.function.name));
      break;
    case 'tool_result':
      // Tool execution completed
      console.log('Tool result:', chunk.tool_call_id, chunk.result);
      break;
    case 'error':
      // Handle error
      handleError(chunk.error);
      break;
  }
}
```

## LlmProcessor

A standalone module for LLM streaming, SSE parsing, tool execution, and message history management. Use this when you need full control over the LLM interaction outside of a `Session`.

### Constructor

```typescript
class LlmProcessor {
  constructor(config: LlmProcessorConfig);
}
```

### LlmProcessorConfig

```typescript
interface LlmProcessorConfig {
  apiServer: string;
  sessionId: string;
  clientTools: Array<ChatTool>;
  callbacks: LlmProcessorCallbacks;
}
```

| Property | Description |
|----------|-------------|
| `apiServer` | Perso API server URL |
| `sessionId` | Session ID for the LLM conversation |
| `clientTools` | Default client tools available for LLM tool calling |
| `callbacks` | Callback functions for side effects |

### LlmProcessorCallbacks

```typescript
interface LlmProcessorCallbacks {
  onChatStateChange: (add: ChatState | null, remove: ChatState | null) => void;
  onError: (error: Error) => void;
  onChatLog: (message: string, isUser: boolean) => void;
  onTTSTF: (message: string) => void;
}
```

| Callback | Description |
|----------|-------------|
| `onChatStateChange` | Called when chat state should be added or removed |
| `onError` | Called when an error occurs during processing |
| `onChatLog` | Called when a message should be added to the chat log |
| `onTTSTF` | Called when a message should be spoken by the AI human |

### Stream LLM responses

```typescript
function processLLM(options: ProcessLLMOptions): AsyncGenerator<LLMStreamChunk>;
```

| Parameter | Description |
|-----------|-------------|
| `options` | Configuration object containing message, optional tools, and abort signal |

**Returns:** `AsyncGenerator<LLMStreamChunk>` - An async generator that yields streaming chunks

Streams LLM responses with full tool execution support. Tool calls are executed internally, with `tool_call` and `tool_result` chunks yielded for observability. If tools require a follow-up LLM call, the generator loops transparently (up to 10 rounds maximum).

**Example usage:**

```typescript
import { LlmProcessor, ChatTool, ChatState } from 'perso-interactive-sdk-web/client';

const processor = new LlmProcessor({
  apiServer: "https://live-api.perso.ai",
  sessionId: "your-session-id",
  clientTools: [weatherTool],
  callbacks: {
    onChatStateChange: (add, remove) => { /* update UI state */ },
    onError: (error) => { console.error(error); },
    onChatLog: (message, isUser) => { /* update chat UI */ },
    onTTSTF: (message) => { /* trigger avatar speech */ },
  }
});

for await (const chunk of processor.processLLM({ message: "Hello!" })) {
  if (chunk.type === 'message' && chunk.finish) {
    console.log('Complete:', chunk.message);
  }
}
```

### Get message history

```typescript
function getHistory(): ReadonlyArray<object>;
```

**Returns:** Read-only array of the conversation history managed by this processor.

### Add to message history

```typescript
function addToHistory(entry: object): void;
```

| Parameter | Description |
|-----------|-------------|
| `entry` | A message history entry to append (e.g., `{ role: 'assistant', content: '...' }`) |

## WavRecorder

Records audio from the microphone and produces WAV files using Web Audio API with AudioWorklet. This is a standalone utility for capturing audio independently of the `Session` STT flow.

**Browser Support:**
- Chrome 66+
- Firefox 76+
- Safari 14.1+
- iOS Safari 14.5+
- Edge 79+

### Constructor

```typescript
class WavRecorder {
  constructor(options?: WavRecorderOptions);
}
```

### WavRecorderOptions

```typescript
interface WavRecorderOptions {
  channels?: number;
  targetSampleRate?: number;
}
```

| Property | Required | Description |
|----------|----------|-------------|
| `channels` | No | Number of audio channels (default: 1) |
| `targetSampleRate` | No | Target sample rate for the output WAV. If different from the device's native rate, audio will be resampled. |

### Start recording

```typescript
function start(): Promise<void>;
```

Starts recording audio from the microphone. Requests microphone permission via `getUserMedia`.

**Throws:**
- `Error` if already recording
- `Error` if microphone access is denied

### Stop recording

```typescript
function stop(): Promise<File>;
```

Stops recording and returns the recorded audio as a WAV `File`.

**Returns:** `Promise<File>` - A File containing the recorded WAV audio (`audio/wav`)

**Throws:** `Error` if not currently recording

### Check recording status

```typescript
function isRecording(): boolean;
```

**Returns:** `true` if recording is currently in progress, `false` otherwise

### Factory function

```typescript
function createWavRecorder(options?: WavRecorderOptions): WavRecorder;
```

Convenience factory function to create a `WavRecorder` instance.

**Example usage:**

```typescript
import { WavRecorder, createWavRecorder } from 'perso-interactive-sdk-web/client';

// Using factory function
const recorder = createWavRecorder({ targetSampleRate: 16000 });

// Or using constructor directly
const recorder = new WavRecorder({ channels: 1, targetSampleRate: 16000 });

// Start recording
await recorder.start();

// ... user speaks ...

// Stop recording and get WAV file
const audioFile = await recorder.stop();

// Use the file (e.g., send to server, play back, or pass to session.transcribeAudio)
const text = await session.transcribeAudio(audioFile, 'en');
```

## Audio Utilities

### Get WAV sample rate

```typescript
function getWavSampleRate(wavData: ArrayBuffer): number;
```

| Parameter | Description |
|-----------|-------------|
| `wavData` | Raw WAV file data as ArrayBuffer |

**Returns:** The sample rate of the WAV file (e.g., 16000, 44100, 48000)

Extracts the sample rate from WAV file header data. Useful for inspecting audio files before processing.

### TTS Target Sample Rate

```typescript
const TTS_TARGET_SAMPLE_RATE: number; // 16000
```

The target sample rate (16000 Hz) used by the TTS system. Use this constant when resampling audio for TTS compatibility.

