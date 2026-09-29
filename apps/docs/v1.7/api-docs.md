# Perso Interactive SDK details (js)

The Perso Interactive SDK talks to the Perso production API server
(`https://platform.perso.ai`) by default. All SDK calls take an options object —
you only need to provide your API key and the call-specific arguments.

To target another environment, every options object — `createSessionId`, `createSession`
(object form), the catalog getters that take `{ apiKey }` (`getLLMs`, `getTTSs`, ...,
`getAllSettings`), `makeTTS`, `getSessionInfo`, `getIntroMessage`, `getSessionTemplate`,
`getTextNormalization` — accepts an optional `apiServer: string`. Omit it for production;
the default is exported as `DEFAULT_API_SERVER` from both `perso-interactive-sdk-web/client`
and `perso-interactive-sdk-web/server`. Trailing slashes are trimmed.

```typescript
import { DEFAULT_API_SERVER, getAllSettings } from "perso-interactive-sdk-web/server";

DEFAULT_API_SERVER; // "https://platform.perso.ai"
const stageSettings = await getAllSettings({ apiKey, apiServer: "https://stage-platform.perso.ai" });
```

## Migrating from 1.6.x

Client-side audio now reaches the avatar one way — streamed.

| What you used | What to do |
|---------------|------------|
| `processChat` / `processTTSTF` / `processCustomChat` | Behavior unchanged. `processChat` and `processCustomChat` are deprecated as of 1.7.0 — prefer `processLLM()` → `processTTS()` → `processSTF()`, or `processTTSTF()`. |
| `processSTF` return value (`file_ref`) | Now returns `Promise<void>`. Drop any use of the return value. |
| `processSTF` `format` argument | Still accepted but ignored — the container is detected from the audio bytes. |
| `session.perso.stf()` / `.sendFile()` | Removed. Use `processSTF`. |
| `processTTS()` `output_format` option type | Narrowed from `string` to the `TTSOutputFormat` union. Runtime behavior is unchanged, but a `string`-typed variable now needs narrowing (e.g. `as TTSOutputFormat`). |
| `processTTS()` on a streamable voice | Now returns a 24 kHz mono `audio/wav` Blob for `pcm`/`pcm_24000` (or no `output_format`). `resample: true`, mp3/wav, and non-streamable voices are unchanged. |
| Input size limits | STT audio > 5 MiB, TTS text > 4,000 characters, or LLM `messages`/`tools` > 512 / 64 KiB now fail locally as the matching error. |

```typescript
// before
const fileRef = await session.processSTF(blob, 'wav', text);

// after — just drop the return value
await session.processSTF(blob, undefined, text);
```

## PersoInteractive

### Create session id

> **Server-side only**: This function requires your API key. Always call it from your server to keep the key secret. Pass only the returned `sessionId` to the browser.

Two call shapes are supported via a discriminated options object:

- **Form A** — pass `params` with explicit runtime options.
- **Form B** — pass `sessionTemplateId` to create a session from a SessionTemplate. The SDK resolves the template and maps its fields to the request body. Throws if the template's `model_style.platform_type` is not `"webrtc"`.

```typescript
// Form A: Create from explicit params
function createSessionId(options: {
  apiKey: string;
  params: {
    using_stf_webrtc: boolean;
    model_style?: string;
    prompt?: string;
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
    stt_text_normalization_config?: string;
    stt_text_normalization_locale?: string | null;
    extra_data?: unknown;
  };
}): Promise<string>;

// Form B: Create from a SessionTemplate ID
function createSessionId(options: {
  apiKey: string;
  sessionTemplateId: string;
}): Promise<string>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |
| `params` | Form A | Explicit runtime options (see the `params.*` table below). |
| `sessionTemplateId` | Form B | SessionTemplate ID. The SDK resolves the template and maps its fields to the request body. Throws if `model_style.platform_type` is not `"webrtc"`. |
| `params.using_stf_webrtc` | Yes | Whether to enable the STF WebRTC pipeline (set to `true` for the SDK demos). Selects the `STF_WEBRTC` capability. |
| `params.model_style` | No | ModelStyle `name` — the avatar the STF capability renders. |
| `params.prompt` | No | Prompt `prompt_id`, used by the LLM capability. |
| `params.llm_type` | No | LLM `name`. Providing it enables the LLM capability. |
| `params.tts_type` | No | TTS `name`. Providing it enables the TTS capability. |
| `params.stt_type` | No | STT `name`. Providing it enables the STT capability. |
| `params.document` | No | Document `document_id` |
| `params.background_image` | No | BackgroundImage `backgroundimage_id` |
| `params.text_normalization_config` | No | TextNormalizationConfig `textnormalizationconfig_id` applied to TTS/LLM input |
| `params.text_normalization_locale` | No | Locale for text normalization (e.g., `"ko"`, `"en"`, `"ko-KR"`, max 10 chars). Pass `null` to explicitly disable. |
| `params.stt_text_normalization_config` | No | TextNormalizationConfig `textnormalizationconfig_id` applied to STT output |
| `params.stt_text_normalization_locale` | No | Locale for STT text normalization (e.g., `"ko"`, `"en"`, max 10 chars). Pass `null` to explicitly disable. |
| `params.mcp_servers` | No | MCPServer `mcpserver_id` array |
| `params.padding_left` | No | AI avatar horizontal position (A number between -1.0 and 1.0, default 0.0) |
| `params.padding_top` | No | AI avatar vertical position (A number between 0.0 and 1.0, default 0.0) |
| `params.padding_height` | No | The scale of AI avatar height; the width of the AI avatar cannot exceed the width of the background (A number between 0.0 and 5.0, default 1.0) |
| `params.extra_data` | No | Free-form JSON stored with the session for caller-defined metadata. Read it back from `SessionInfo.extra_data`. Must be JSON-serializable; pass `null` to store an explicit null. |

```typescript
// Form A — from explicit params
const sessionId = await createSessionId({
  apiKey,
  params: {
    using_stf_webrtc: true,
    model_style: "<model_style_name>",
    prompt: "<prompt_id>",
    llm_type: "<llm_name>",
    tts_type: "<tts_name>",
    stt_type: "<stt_name>",
  },
});

// Form B — from a SessionTemplate
const sessionId = await createSessionId({
  apiKey,
  sessionTemplateId: "<sessiontemplate_id>",
});
```

**Returns:** Session ID (string)

**Throws:**

- `SessionCreationError` (subclass of `ApiError`) when the API rejects the request. `code` `does_not_exist` and `not_in_organization` arrive as the `DoesNotExistError` / `NotInOrganizationError` subclasses.
- A `400` with `code: 'invalid_platform_type'` and `attr: 'model_style'` when the selected ModelStyle's `platform_type` does not match the requested STF capability — `STF_WEBRTC` needs `"webrtc"`. Form B catches this client-side and throws before the request; Form A learns it from the server.

#### Capabilities

A session enables one or more capabilities. Each option you pass selects one, and the SDK derives the list, so nothing has to be enumerated by hand.

| Capability | Selected by | Configures |
|------------|-------------|------------|
| `STF_WEBRTC` | `using_stf_webrtc: true` | `model_style` (the avatar) |
| `LLM` | `llm_type` | `prompt`, `document`, `mcp_servers` |
| `TTS` | `tts_type` | `text_normalization_config` |
| `STT` | `stt_type` | `stt_text_normalization_config` |

Omitting an option leaves its capability out of the session, and the methods that depend on it stop working. A `processSTF`-only integration — one where the client produces the audio itself — therefore needs no `tts_type`, `llm_type`, or `prompt`. See [How audio reaches the avatar (STF)](#how-audio-reaches-the-avatar-stf).

Blank strings are not a way to leave something out: every id field is `minLength: 1` on the wire, so the SDK drops a blank rather than sending it. Passing `''` and omitting the field are equivalent.

The server also defines `STF_ONPREMISE` for on-device rendering. This SDK is WebRTC-only and never requests it.

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

const API_KEY = process.env.PERSO_INTERACTIVE_API_KEY;

app.post("/api/session", async (req, res) => {
  try {
    const sessionId = await createSessionId({
      apiKey: API_KEY,
      params: {
        using_stf_webrtc: true,
        model_style: "<model_style_name>",
        prompt: "<prompt_id>",
        llm_type: "<llm_name>",
        tts_type: "<tts_name>",
        stt_type: "<stt_name>",
        // text_normalization_config: "<textnormalizationconfig_id>", // optional
        // stt_text_normalization_config: "<textnormalizationconfig_id>", // optional
        // stt_text_normalization_locale: "ko", // optional
      },
      // apiServer defaults to "https://platform.perso.ai".
      // Pass it explicitly to point at another environment (e.g., stage).
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
    const sessionId = await createSessionId({
      apiKey: API_KEY,
      sessionTemplateId: "<sessiontemplate_id>",
    });
    res.json({ sessionId });
  } catch (error) {
    console.error("Session creation failed:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
```

> ⚠️ **Security Warning**: Never use `createSessionId` on the client-side in production. Exposing your API key in browser code can lead to unauthorized access and quota abuse. Always create sessions on the server and pass only the `sessionId` to the client.

#### Client-side Testing Only

> ⚠️ **Warning**: The following example exposes your API key in the browser. Use this **only for local testing**. Never deploy this to production. If your API key is compromised due to client-side usage, the SDK provider assumes no responsibility.

```typescript
import {
  createSessionId,
  createSession,
} from "perso-interactive-sdk-web/client";

const apiKey = "YOUR_API_KEY"; // ⚠️ NEVER commit or expose this in production

const sessionId = await createSessionId({
  apiKey,
  params: {
    using_stf_webrtc: true,
    model_style: "<model_style_name>",
    prompt: "<prompt_id>",
    llm_type: "<llm_name>",
    tts_type: "<tts_name>",
    stt_type: "<stt_name>",
    // text_normalization_config: "<textnormalizationconfig_id>", // optional
    // stt_text_normalization_config: "<textnormalizationconfig_id>", // optional
    // stt_text_normalization_locale: "ko", // optional
  },
});

const session = await createSession({
  sessionId,
  width: 1920,
  height: 1080,
  clientTools: [],
});

const videoEl = document.getElementById("video");
if (videoEl instanceof HTMLVideoElement) {
  session.setSrc(videoEl);
}
```

### Create session

The `sessionId` parameter should be obtained from your server endpoint (see [Create session id](#create-session-id) above).

```typescript
function createSession(options: {
  sessionId: string;
  width: number;
  height: number;
  clientTools: Array<ChatTool>;
  videoCodec?: VideoCodec;
}): Promise<Session>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `sessionId` | Yes | Session ID obtained from your server |
| `width` | Yes | AI avatar video width |
| `height` | Yes | AI avatar video height |
| `clientTools` | Yes | Client tools to be registered with the LLM |
| `videoCodec` | No | Pins the avatar video codec. Omit to let the server pick one during WebRTC negotiation (default). See [Video codec](#video-codec) below. |

```typescript
const session = await createSession({
  sessionId,
  width: 1920,
  height: 1080,
  clientTools: [],
});
```

**Returns:** Session object

#### Video codec

By default, omit `videoCodec` and the server selects the codec during WebRTC negotiation. Set it only when a specific codec must be used (for example, color-fidelity checks) — the SDK then filters the SDP offer to that codec so the server answers with it:

```typescript
import { createSession, VideoCodec } from "perso-interactive-sdk-web/client";

const session = await createSession({
  sessionId,
  width: 1920,
  height: 1080,
  clientTools: [],
  videoCodec: VideoCodec.H264, // VideoCodec.VP8 ("vp8") | VideoCodec.H264 ("h264")
});
```

If `videoCodec` is set but the browser cannot decode it (or exposes no video receive capabilities, e.g. older Safari), `createSession` throws an `Error` whose `name` is `VideoCodecUnsupportedError`. The server must also support encoding the requested codec.

### Get LLM list

```typescript
function getLLMs(options: { apiKey: string }): Promise<LLMType[]>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const llms = await getLLMs({ apiKey });
```

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
function getTTSs(options: { apiKey: string }): Promise<TTSType[]>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const ttsTypes = await getTTSs({ apiKey });
```

**Returns:** Array of TTS objects

```JSON
[
  {
    "name": string,
    "streamable"?: boolean,
    "service": string,
    "model"?: string | null,
    "voice"?: string | null,
    "voice_settings"?: unknown | null,
    "style"?: string | null,
    "voice_extra_data"?: unknown | null
  }
]
```

### Get STT list

```typescript
function getSTTs(options: { apiKey: string }): Promise<STTType[]>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const sttTypes = await getSTTs({ apiKey });
```

**Returns:** Array of STT objects

```JSON
[
  {
    "name": string,
    "service": string,
    "options"?: unknown | null,
    "mode"?: "NON_STREAMING" | "STREAMING",   // absent on older servers: treat as NON_STREAMING
    "end_of_turn_detection"?: boolean
  }
]
```

`mode` identifies which transport the type requires; `end_of_turn_detection`
marks the streaming sub-mode in which the provider detects utterance
boundaries. See [STT interaction modes](#stt-interaction-modes).

> **Server requirement:** this reads `/api/v1/settings/stt_type/v2/`. Against a
> server that predates it the call fails; older servers expose only
> non-streaming types at the v1 path.

### Get ModelStyle list

```typescript
function getModelStyles(options: { apiKey: string }): Promise<ModelStyle[]>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const modelStyles = await getModelStyles({ apiKey });
```

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
function getPrompts(options: { apiKey: string }): Promise<Prompt[]>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const prompts = await getPrompts({ apiKey });
```

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
function getDocuments(options: { apiKey: string }): Promise<Document[]>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const documents = await getDocuments({ apiKey });
```

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
function getBackgroundImages(options: { apiKey: string }): Promise<BackgroundImage[]>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const backgroundImages = await getBackgroundImages({ apiKey });
```

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
function getMcpServers(options: { apiKey: string }): Promise<MCPServer[]>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const mcpServers = await getMcpServers({ apiKey });
```

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
function getTextNormalizations(options: { apiKey: string }): Promise<TextNormalizationConfig[]>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const textNormalizations = await getTextNormalizations({ apiKey });
```

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

**Top-level convenience function** (available from `perso-interactive-sdk-web/client`).

```typescript
function getTextNormalization(options: {
  apiKey: string;
  configId: string;
}): Promise<TextNormalizationDownload>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |
| `configId` | Yes | TextNormalizationConfig `textnormalizationconfig_id` |

```typescript
import { getTextNormalization } from "perso-interactive-sdk-web/client";

const download = await getTextNormalization({
  apiKey,
  configId: "<textnormalizationconfig_id>",
});
// download.file_url → pre-signed URL to the CSV ruleset
```

**Returns:** `TextNormalizationDownload` object

```typescript
interface TextNormalizationDownload {
  config_id: string;
  config_name: string;
  file_url: string;   // Pre-signed URL; use Azure Blob Storage ETag for caching
}
```

### Get all settings

```typescript
function getAllSettings(options: { apiKey: string }): Promise<AllSettings>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const settings = await getAllSettings({ apiKey });
```

**Returns:** every catalog in one object. Each field carries the same type as the
matching individual getter.

```typescript
type AllSettings = {
  llms: LLMType[];
  ttsTypes: TTSType[];
  sttTypes: STTType[];
  modelStyles: ModelStyle[];
  prompts: Prompt[];
  documents: Document[];
  backgroundImages: BackgroundImage[];
  mcpServers: MCPServer[];
  textNormalizations: TextNormalizationConfig[];
};
```

### Get intro message

> **Server-side only**: This function requires your API key.

```typescript
function getIntroMessage(options: {
  apiKey: string;
  promptId: string;
}): Promise<string>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |
| `promptId` | Yes | The prompt ID to fetch intro message for |

```typescript
import { getIntroMessage } from "perso-interactive-sdk-web/server";

const intro = await getIntroMessage({ apiKey, promptId: "<prompt_id>" });
```

**Returns:** The intro message string for the given prompt.

**Throws:**
- `Error` with `cause: 404` if the prompt is not found
- `Error` with the API error detail if an `ApiError` occurs

### Get Session Template list

```typescript
function getSessionTemplates(options: {
  apiKey: string;
}): Promise<SessionTemplate[]>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |

```typescript
const templates = await getSessionTemplates({ apiKey });
```

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
    } | null,
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
    } | null,
    "tts_type": {
      "name": string,
      "streamable"?: boolean,
      "service": string,
      "model"?: string | null,
      "voice"?: string | null,
      "voice_settings"?: unknown | null,
      "style"?: string | null,
      "voice_extra_data"?: unknown | null
    } | null,
    "stt_type": {
      "name": string,
      "service": string,
      "options"?: unknown | null
    } | null,
    "text_normalization_config"?: {
      "textnormalizationconfig_id": string,
      "name": string,
      "created_at": string
    } | null,
    "text_normalization_locale"?: string | null,
    "stt_text_normalization_config"?: {
      "textnormalizationconfig_id": string,
      "name": string,
      "created_at": string
    } | null,
    "stt_text_normalization_locale"?: string | null,
    "model_style": {
      "name": string,
      "model": string,
      "model_file"?: string | null,
      "model_files": [{ "name": string, "file"?: string | null }],
      "style": string,
      "file"?: string | null,
      "files": [{ "name": string, "file"?: string | null }],
      "platform_type"?: string,
      "configs": [{ "modelstyleconfig_id": string, "key": string, "value": string }]
    } | null,
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
function getSessionTemplate(options: {
  apiKey: string;
  sessionTemplateId: string;
}): Promise<SessionTemplate>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | API Key |
| `sessionTemplateId` | Yes | Session Template ID |

```typescript
const template = await getSessionTemplate({
  apiKey,
  sessionTemplateId: "<sessiontemplate_id>",
});
```

**Returns:** A single SessionTemplate object (same schema as array element above)

### Make TTS

```typescript
function makeTTS(options: {
  sessionId: string;
  text: string;
  locale?: string;
  output_format?: TTSOutputFormat;
}): Promise<TTSResponse>;

type TTSOutputFormat =
  | "pcm" | "pcm_24000" | "pcm_44100"
  | "wav" | "wav_24000" | "wav_44100"
  | "mp3" | "mp3_44100";

interface TTSResponse {
  audio: string;
  locale?: string;
  normalized_text?: string;
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `sessionId` | Yes | Active session ID |
| `text` | Yes | Text to synthesize |
| `locale` | No | Language/locale code for TTS (e.g., `"ko"`, `"en"`) |
| `output_format` | No | Audio output format. One of `TTSOutputFormat`; the suffix is the sample rate in Hz. Defaults to the server's `"mp3"`. |

```typescript
import { makeTTS } from "perso-interactive-sdk-web/client";

const result = await makeTTS({
  sessionId: "<session_id>",
  text: "Hello, world!",
  locale: "en",         // optional
  output_format: "wav", // optional
});
// result.audio contains Base64-encoded audio data
// result.locale is the locale the voice resolved to
// result.normalized_text is the text after the session's normalization config ran
```

**Returns:** Object with the Base64-encoded audio, the resolved locale and the normalized text. The two extra fields are typed optional: the SDK returns the parsed body without validating it, so nothing enforces their presence.

```JSON
{
  "audio": string,
  "locale": string,
  "normalized_text": string
}
```

### Streaming TTS (PCM)

Streaming TTS is reached through [`Session.processStreamingTTS()`](#stream-tts-audio-from-text). There is no standalone helper: the stream reports through the session's chat state and error handler, so giving it a second surface would split that ownership.

```typescript
interface StreamingTTSStream extends AsyncIterable<Uint8Array> {
  readonly sampleRate: number;
  readonly channels: number;
  cancel(): Promise<void>;
}
```

The call resolves once the stream is established; a request the server rejects surfaces during iteration as a `TTSError`, not before it. Iterating yields raw PCM chunks in arrival order.

```typescript
import { PcmStreamDecoder } from "perso-interactive-sdk-web/client";

const stream = await session.processStreamingTTS("Hello, world!", {
  output_format: "pcm_24000", // optional
});

const decoder = new PcmStreamDecoder();
for await (const chunk of stream!) {
  const samples = decoder.decode(chunk); // Float32Array, [-1, 1]
  // feed `samples` to playback at `stream.sampleRate`
}
```

**Yields:** headerless little-endian 16-bit PCM chunks.

#### Only a streamable voice may stream

The session's `tts_type.streamable` decides whether the streaming path is available to the session at all. The SDK reads the session row once when the session is created and enforces it:

| `tts_type.streamable` | `processStreamingTTS()` | `processTTS()` |
|-----------------------|-------------------------|----------------|
| `true` | Streams | Streams internally and returns one reassembled `Blob` |
| `false` | Rejects with `TTSNotStreamableError` before any request | Uses `POST /tts/` |
| `null` or absent | Rejects with `TTSNotStreamableError` | Uses `POST /tts/` |
| `tts_type` is `null` (session created without TTS) | Rejects with `TTSNotStreamableError` | Uses `POST /tts/` |
| The row could not be read | Rejects with `TTSNotStreamableError`; the next call reads the row again | Uses `POST /tts/` |

`processStreamingTTS()` requires a confirmed `true` — the absence of a `false` is not enough, because a request built on an unconfirmed flag can only fail later and less clearly. It rejects rather than reporting through the error handler because the TTS type is fixed for the session's lifetime: no retry can make that session stream, so the caller has to change transport. `processTTS()` works on every voice and is the documented fallback; it is never gated, only routed.

A failed lookup is not cached as an answer, so a transient network fault does not cost the session its streaming transport for the rest of its life — the next `processStreamingTTS()` call reads the row again.

#### Why the SDK supplies the format

The chunks are raw base64-encoded PCM with no container and no rate metadata. Two consequences a caller cannot recover from by inspecting the bytes:

- The bytes are **little-endian** 16-bit PCM. Treating them as big-endian produces noise.
- The sample rate is not carried in the frames. Use `stream.sampleRate` / `STREAMING_TTS_SAMPLE_RATE` (24000) and `stream.channels` / `STREAMING_TTS_CHANNELS` (1).

Chunk boundaries do not respect sample boundaries — 1-byte chunks occur — so decode with [`PcmStreamDecoder`](#pcmstreamdecoder), which carries a split sample across chunks. Decoding each chunk independently drops a byte per split and shifts everything after it.

#### Progressive delivery depends on the voice

Whether audio actually arrives while it is being synthesized is decided by the TTS provider behind the session's voice, not by the transport. Some voices deliver their first bytes early in the synthesis; others withhold everything until it finishes, and the stream simply yields the whole payload at once — callers need no special case either way.

> **`streamable` governs availability, not latency.** A `streamable: true` voice may still deliver everything at the end. Read the flag as the server's statement about whether streaming may be used for the session — which is what the SDK enforces — and treat progressive delivery as a property of the provider that no flag announces.
>
> **The value is per-environment server data and is corrected independently of the SDK.** The same voice can be streamable on one environment and gated on another. Check the environment you target with `getSessionInfo()` rather than assuming a voice's value carries across.

### PersoUtilServer

> **Server-side only**: Available from `perso-interactive-sdk-web/server`.

Server-side alias for the internal `PersoUtil` class. Exposes low-level static methods
for direct API calls (e.g., `getLLMs`, `getPrompts`, `getModelStyles`).
Most users should prefer the top-level convenience functions instead.

### Get session info

```typescript
function getSessionInfo(options: {
  sessionId: string;
}): Promise<SessionInfo>;
```

| Field | Required | Description |
|-------|----------|-------------|
| `sessionId` | Yes | Session ID |

```typescript
const info = await getSessionInfo({ sessionId });

if (info.stt_type?.mode === 'STREAMING') {
  // startProcessSTT() will stream interim results while the user speaks
}
```

**Returns:** `SessionInfo` — see [SessionInfo](#sessioninfo).

#### `SessionInfo`

```typescript
interface SessionInfo {
  session_id: string;
  client_sdp: string | null;
  server_sdp: string | null;
  prompt: Prompt;
  document?: string | null;
  llm_type: LLMType;
  model_style: ModelStyle;
  tts_type: TTSType;
  stt_type: STTType | null;
  text_normalization_config: TextNormalizationConfig | null;
  text_normalization_locale: string | null;
  stt_text_normalization_config: TextNormalizationConfig | null;
  stt_text_normalization_locale: string | null;
  ice_servers: RTCIceServer[] | null;
  status: SessionStatus;
  termination_reason: string | null;
  duration_sec: number;
  created_at: string;
  session_acls: string[];
  padding_left: number | null;
  padding_top: number | null;
  padding_height: number | null;
  background_image: BackgroundImage | null;
  extra_data?: unknown | null;
  capability: SessionCapability[];
  mcp_servers: MCPServer[];
}

type SessionStatus = 'CREATED' | 'EXCHANGED' | 'IN_PROGRESS' | 'TERMINATED';
```

Object-valued configuration fields are nullable even where the wire schema marks
them required: a session created without a background image or a normalization
config omits them, and a non-null promise here would turn a missing field into a
property access on `null`.

`stt_type` is the field the SDK reads to decide whether `startProcessSTT()`
streams or records — see [STT interaction modes](#stt-interaction-modes).

`termination_reason` is an **open string**, not a union: the server adds reasons
without a protocol bump. Known values are `GRACEFUL_TERMINATION`,
`SESSION_EXPIRED_BEFORE_CONNECTION`, `SESSION_LOST_AFTER_CONNECTION`,
`SESSION_MISC_ERROR`, `MAX_ACTIVE_SESSION_QUOTA_EXCEEDED`,
`MAX_MIN_PER_SESSION_QUOTA_EXCEEDED`, `TOTAL_MIN_PER_MONTH_QUOTA_EXCEEDED`, and
`INSUFFICIENT_CREDITS`.

## Session

### Send a message to the AI avatar

> **Deprecated.** `processChat()` predates the step-controlled pipeline and is marked `@deprecated`. It still works and its behavior is unchanged, but new integrations should use [processLLM](#stream-llm-responses-with-full-control-advanced) → [processTTS](#generate-tts-audio-from-text) → [processSTF](#send-audio-to-stf-pipeline), which exposes each step. `processCustomChat()` belongs to the same family and is also deprecated.

```typescript
/** @deprecated Use processLLM() -> processTTS() -> processSTF() instead. */
function processChat(message: string): Promise<void>;
```

'message' must not be empty

ChatState.LLM is set in the 'Chat states'.  
While the AI avatar is preparing a response, ChatState.ANALYZING is set in 'Chat states'.  
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
- Sets `ChatState.LLM` for the duration of the turn; never sets `ANALYZING`/`SPEAKING`
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

**Error handling:**

Failures are yielded, not thrown. Every failure — an LLM protocol error, the connection dropping mid-turn, the 10-round tool follow-up cap, or a streaming connection that cannot be opened at all — arrives as `{ type: 'error', error: LLMError }` and the generator then returns. A connection-open failure carries the connection reason on `error.code` (an open string you can log). The one throw is input validation: `processLLM({ message: '' })` throws `Error('Message cannot be empty')` on the first pull.

**Cancellation:**

```typescript
// Cancel the stream
controller.abort();

// Or break from the loop
for await (const chunk of session.processLLM({ message: "..." })) {
  if (someCondition) break; // Cleanly exits the generator
}
```

Aborting is graceful: no `AbortError` is raised. The loop simply ends — a final `message` chunk with `finish: true` and the partial text may still be yielded — and the partial turn is **not** committed to the history `getMessageHistory()` returns, so the next turn does not see truncated assistant text.

### Get message history

```typescript
function getMessageHistory(): ReadonlyArray<object>;
```

**Returns:** Read-only array of message history objects

Returns the conversation history used by the LLM. Entries are OpenAI-style chat messages and their shape depends on `role`:

| `role` | Fields |
|--------|--------|
| `user` | `{ role: 'user', content: string }` |
| `assistant` | `{ role: 'assistant', type: 'message', content: string }` for spoken text, or `{ role: 'assistant', type: 'tool_call', content: null, tool_calls: [...] }` when the LLM requested tools |
| `tool` | `{ role: 'tool', content: string, tool_call_id: string }` — `content` is the tool's return value as JSON, `tool_call_id` links it to the call it answers |

Only `role` is common to every entry; `type` is present on assistant entries only.

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

**Throws:**
- `STTError` if the request fails — the server's error code is on `.code`; when the connection could not be opened, `.code` carries the connection reason (an open string) instead
- `STTError` with `code: 'chunk_too_large'`, raised locally before anything is sent, when the audio exceeds 5 MiB as base64
- `Error` on a session whose STT type is streaming-only — use `startProcessSTT()`/`stopProcessSTT()` instead

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

### Transcribe audio (detailed response)

```typescript
function transcribeAudioDetailed(
  audio: Blob | File,
  language?: string
): Promise<STTResponse>;

interface STTResponse {
  text: string;
}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `audio` | Yes | Audio data as Blob or File |
| `language` | No | Language code for STT (e.g., `'ko'`, `'en'`). When omitted, the server detects the language. |

**Returns:** `STTResponse` containing the transcribed text.

> The server's `stt.result` frame also carries `locale` and `normalized_text`. The SDK keeps only `text`, so they are not exposed by `STTResponse`.

**Throws:**
- `STTError` if the request fails — the server's error code is on `.code`; when the connection could not be opened, `.code` carries the connection reason (an open string) instead
- `STTError` with `code: 'chunk_too_large'`, raised locally before anything is sent, when the audio exceeds 5 MiB as base64
- `Error` on a session whose STT type is streaming-only — use `startProcessSTT()`/`stopProcessSTT()` instead

Same as `transcribeAudio()` but returns the `STTResponse` object form. Use this when you want an extensible result shape rather than a bare string.

```typescript
const result = await session.transcribeAudioDetailed(audioBlob, 'ko');
console.log(result.text);
```

### Custom LLM response (Deprecated)

```typescript
/** @deprecated Use processTTSTF() with explicit history management instead. */
function processCustomChat(message: string): void;
```

'message' must not be empty

> **Deprecated**: This function is deprecated. Use `processTTSTF()` instead. Note that `processTTSTF()` appends only to the legacy history used by the deprecated `processChat()`; the entry is not visible to `getMessageHistory()` and is not used as context by `processLLM()`.

This function makes the AI avatar speak the response message generated by a custom LLM. This function does not invoke the internal LLM.

While the AI avatar is preparing a response, ChatState.ANALYZING is set in 'Chat states'.  
When speaking begins, ChatState.SPEAKING is set in 'Chat states'.

**Important Notes:**

- Does not manage messageHistory automatically
- `subscribeChatLog` is not available when using this function
- `subscribeChatStates` cannot handle ChatState.LLM (only ANALYZING and SPEAKING states are triggered)
- Use this function when you want to integrate your own custom LLM instead of using the internal LLM

**Related methods:**
- `processTTSTF()` - Recommended replacement; adds the message to the chat log and to the legacy `processChat()` history only (not to `getMessageHistory()`, not to `processLLM()` context)
- `processLLM()` - For custom LLM integration with streaming support

### AI avatar speaks the 'message'

```typescript
function processTTSTF(message: string): void;
```

'message' must not be empty

The text is sent to the server, which handles TTS synthesis and lip-sync — the client neither
fetches audio nor chooses a transport. The message is appended to the chat log, but it is **not**
visible to `getMessageHistory()` and is not used as context by `processLLM()`.

While the AI avatar is preparing a response, ChatState.ANALYZING is set in 'Chat states'.
When speaking begins, ChatState.SPEAKING is set in 'Chat states'.

### Generate TTS audio from text

```typescript
function processTTS(
  message: string,
  options?: { resample?: boolean; locale?: string; output_format?: TTSOutputFormat }
): Promise<Blob | undefined>;
```

| Parameter          | Required | Description                                                        |
|--------------------|----------|--------------------------------------------------------------------|
| `message`          | Yes      | Text to convert to speech audio                                    |
| `options`          | No       | Options object                                                     |
| `options.resample` | No       | Whether to resample audio to TTS target sample rate (default: `false`) |
| `options.locale` | No       | Language locale code for TTS (e.g., `'ko'`, `'en'`). Passed to the TTS API when specified. |
| `options.output_format` | No       | Audio output format. One of `TTSOutputFormat` (`'pcm'`, `'pcm_24000'`, `'pcm_44100'`, `'wav'`, `'wav_24000'`, `'wav_44100'`, `'mp3'`, `'mp3_44100'`). Passed to the TTS API when specified. **Ask for a `wav*` or `mp3*` format here** — see the PCM note below. |

**Returns:** `Blob` containing the audio, or `undefined` if the message is empty after filtering, if the request failed (the `TTSError` goes to the error handler), or if the turn was interrupted by `clearBuffer()`. The `Blob` is `audio/wav` on the streaming path and when `resample: true`; on the `POST /tts/` path with the default `resample: false` the server's container is returned unchanged (e.g. `audio/mpeg` for mp3).

This function converts text to speech audio without making the AI avatar speak. Use this when you need the TTS audio file separately.

On a session whose `tts_type.streamable` is `true`, the audio is synthesized progressively and reassembled here, so the clip is ready sooner. That is a transport detail — the return value is a single `Blob` either way, and callers need no branch for it. This faster path carries PCM only, so an `options.output_format` other than `'pcm'`/`'pcm_24000'` — and any non-streamable voice — produces the container formats (mp3/wav) instead. See [Only a streamable voice may stream](#only-a-streamable-voice-may-stream).

> **PCM formats do not survive this path.** `TTSOutputFormat` is the endpoint's
> format list, and `processTTS` decodes what it receives. The `pcm*` formats
> arrive headerless, and on the one-shot `POST /tts/` path — a voice that is not
> streamable, or `'pcm_44100'` on any voice — there is no sample rate on the wire
> to build a container from, so the returned `Blob` is not playable. Ask for a
> `wav*` or `mp3*` format here. Raw PCM is reached through
> [`processStreamingTTS()`](#stream-tts-audio-from-text), whose decoder knows the
> rate by contract, and through `makeTTS()`, which hands back the Base64 payload
> for you to decode yourself.

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

### Stream TTS audio from text

```typescript
function processStreamingTTS(
  message: string,
  options?: {
    locale?: string;
    output_format?: 'pcm' | 'pcm_24000';
  }
): Promise<StreamingTTSStream | undefined>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `message` | Yes | Text to convert to speech audio |
| `options.locale` | No | Language locale code for TTS (e.g., `'ko-KR'`) |
| `options.output_format` | No | Accepted for source compatibility and otherwise **ignored** — the streaming path always uses `pcm_24000` (24 kHz mono), which is the rate `stream.sampleRate` reports |

**Returns:** A `StreamingTTSStream`, or `undefined` if the message is empty after filtering or the streaming connection could not be opened (reported to `setErrorHandler()` as a `TTSError` whose `.code` carries the connection reason).

The streaming counterpart of `processTTS()`. Where that resolves with a finished `Blob`, this resolves as soon as the stream is established and hands back a stream of PCM chunks, so playback can start on the first chunk instead of the last. Emoji stripping and terminal punctuation match `processTTS()`.

`ChatState.TTS` is held from the call until the stream reaches a terminal state — drained, cancelled, or failed — so the state tracks audible output rather than just the request.

**Requires a session whose TTS type is streamable.** Unless `tts_type.streamable` is `true` the call rejects with `TTSNotStreamableError` before any request goes out; fall back to `processTTS()`, which works on every voice. See [Only a streamable voice may stream](#only-a-streamable-voice-may-stream) for the full table, plus [Streaming TTS (PCM)](#streaming-tts-pcm) for the PCM contract, the decoder, and why progressive delivery depends on the voice.

**Example usage:**

```typescript
import { PcmStreamDecoder } from "perso-interactive-sdk-web/client";

const stream = await session.processStreamingTTS("Hello, world!");
if (stream) {
  const decoder = new PcmStreamDecoder();
  for await (const chunk of stream) {
    const samples = decoder.decode(chunk);
    // feed `samples` to playback at `stream.sampleRate`
  }
}
```

Abandoning a turn should cancel the stream, which stops synthesis server-side where possible:

```typescript
await stream.cancel();
```

**Error handling:**

Only a streaming connection that cannot be opened makes the method resolve with `undefined`; that failure is reported to the error handler as a `TTSError` whose `.code` carries the connection reason (an open string such as `ws_closed` or `ws_session_not_ready`). Every later failure — a TTS protocol error, no audio for 30 s (`tts_idle_timeout`), the connection dropping mid-request, a top-level transport `error`, or text over 4,000 characters (raised locally, `code: 'tts_stream_error'`) — is a `TTSError` that is passed to the error handler **and** thrown from the iteration, so wrap `for await` in `try`/`catch`. `underlyingError.errorCode` is `0` for all of these; branch on `.code`. `cancel()` ends the iteration silently: nothing is thrown and nothing reaches the error handler. A failure is delivered when the iterator reaches it — a stream that is neither iterated nor cancelled reports nothing and keeps `ChatState.TTS` set — so always consume the stream or call `cancel()`.

A non-streamable voice is the one failure that rejects the call itself rather than going to the error handler:

```typescript
import { TTSNotStreamableError } from "perso-interactive-sdk-web/client";

try {
  const stream = await session.processStreamingTTS("Hello, world!");
} catch (error) {
  if (error instanceof TTSNotStreamableError) {
    const audioBlob = await session.processTTS("Hello, world!");
  }
}
```

### How audio reaches the avatar (STF)

STF (Speech-To-Face) drives the avatar's mouth from audio. **Audio always streams** — there is no upload-and-wait path. The server begins lip-syncing as the audio arrives, so first speech comes sooner for longer or live-generated clips, and you never choose the transport.

There are two paths, and the difference is **who produces the audio**:

| Path | Audio source |
|------|--------------|
| `processSTF(audio)` | **Client** — a file, the microphone, an external TTS, … |
| `processTTSTF(text)` / `processChat(text)` | **Server** — you send text and the server synthesizes it |

The `processTTSTF` path sends only text, so there is no round-trip of downloading audio and re-uploading it; synthesis and lip-sync both run server-side. Both paths report completion the same way, so their ChatState transitions are identical.

The two paths also differ in session setup. Because `processSTF` sends client-produced audio, it **works on a session created without TTS** — omit `tts_type` from `createSessionId` and an STF session needs only `model_style`. The `processTTSTF` path needs the server to synthesize, so it requires a session with a `tts_type`. See [Capabilities](#capabilities).

> The only way for the client to send audio is `processSTF`. The old file-upload STF transport (`file_ref`) has been removed.

### Send audio to STF pipeline

```typescript
function processSTF(audio: StfAudioSource, format?: string, message?: string): Promise<void>;

type StfPcmChunk = Float32Array | Int16Array | Uint8Array | ArrayBuffer;
type StfAudioSource = Blob | ReadableStream<StfPcmChunk> | AsyncIterable<StfPcmChunk>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `audio` | Yes | A finished clip (`Blob` — any container the browser can decode; WAV is parsed directly, everything else goes through `decodeAudioData`), or a live source (`ReadableStream` / `AsyncIterable` of PCM chunks) whose own end closes the turn. |
| `format` | No | Legacy format hint, **ignored** — a Blob's container is detected from the audio bytes. Kept so existing call sites keep compiling. |
| `message` | No | Optional text caption echoed on the server's `stf` response. Defaults to an empty string. |

Sends audio to the STF (Speech-To-Face) pipeline. The audio streams to the server, which begins
lip-syncing before it has finished arriving. Callers never choose a transport — streaming is how
STF is delivered.

**Finished clips** (`Blob`) are decoded and resampled for you. **Live sources** carry raw PCM with
no metadata, so each chunk must already be mono 24 kHz — a `Float32Array` normalized to [-1, 1], or
s16le bytes (`Int16Array` / `Uint8Array` / `ArrayBuffer`). The turn opens at the first chunk (an
empty source never opens one) and closes when the source ends.

Overlapping `processSTF` calls are serialized: one streaming turn runs at a time, so a second call
waits for the first to finish instead of failing.

This method requires an active WebRTC connection (STF mode).

**Returns:** `Promise<void>` — resolves once the audio has been *transmitted*, not played. Playback
is reported by the server's `stf` response, which drives the `SPEAKING` state.

**Throws:**
- `Error("processSTF requires WebRTC (STF mode)")` if the session has no active WebRTC connection
- `STFError` with `code: 'decode'` if a clip cannot be decoded
- `STFError` if the turn otherwise fails — `reason` plus an open-string `code`. See [STFError](#stferror)
- The source's own error, when a live source fails mid-utterance — audio already delivered still plays

A `clearBuffer()` interruption and a server rejection do **not** throw here: the call **resolves**
instead (see **Cancellation** and **Server rejection** below).

**Cancellation:** `clearBuffer()` cancels an open turn, stops consuming a live source, and tells
the server to discard buffered speech. The pending call then **resolves**, not rejects — an
interruption that was asked for is not a failure.

**Server rejection:** if the server rejects the turn, `processSTF` resolves but the audio never
plays, and an `STFError` with `code: 'server_rejected'` is reported to `setErrorHandler()`. The most
common cause is a server that does not implement streaming STF; that error is the only signal of it.

**ChatState transitions:** ANALYZING → SPEAKING

**Example usage:**

```typescript
// Finished clip — any decodable container
const audioBlob = new Blob([audioData], { type: 'audio/wav' });
await session.processSTF(audioBlob, undefined, 'Hello');

// TTS output works the same way:
const ttsBlob = await session.processTTS('Hello');
if (ttsBlob) {
  await session.processSTF(ttsBlob, undefined, 'Hello');
}

// Live source — audio still being produced (external streaming TTS, mic, ...)
async function* livePcm(): AsyncIterable<Float32Array> {
  for await (const chunk of vendorTts.stream(text, { sampleRate: 24000, mono: true })) {
    yield chunk; // mono 24 kHz Float32
  }
}
await session.processSTF(livePcm(), undefined, 'Hello'); // turn opens at the first chunk

// A fetch body of raw PCM is already a valid live source:
const res = await fetch(url, { method: 'POST', body: JSON.stringify({ text, format: 'pcm_24000' }) });
await session.processSTF(res.body!, undefined, text);
```

**Which one to pass**

| Situation | Pass | Why |
|-----------|------|-----|
| File upload, a recording, a `processTTS()` result | `Blob` | The SDK decodes and resamples it for you |
| External streaming TTS, microphone, live synthesis | Live source | Generation overlaps playback, so first speech is faster |
| Several clips as **separate utterances** | `Blob`, awaited in sequence | Each clip is its own turn |
| Several clips as **one continuous utterance** | One live source | No turn boundary, so there is no gap between them |
| A very long clip | Live source | A `Blob` queues its whole decoded PCM at once |

A live source has one contract: **each chunk must already be mono 24 kHz.** The chunks carry no
sample-rate metadata, so the SDK cannot verify or resample them per chunk.

> **Compressed audio cannot be a live source.** Live sources take raw PCM only — partial mp3/opus/webm
> chunks cannot be progressively decoded. Ask your provider for a raw output such as `pcm_24000`, or
> collect the finished audio and pass it as a `Blob`.

### Feeding an always-on microphone

A microphone never ends on its own, so the application decides where turns end — and that decision matters because **the frames carry no timestamps**. The server simply concatenates the PCM it receives, so a pause that is not represented in the audio does not exist for it.

The recommended structure is **one turn per speech segment**: a mute ends the turn, and each segment starts a fresh timeline.

```typescript
// Keep the mic open; capture at 24 kHz so there is nothing to resample.
const ctx = new AudioContext({ sampleRate: STF_STREAM_SAMPLE_RATE });
let controller: ReadableStreamDefaultController<Float32Array> | null = null;

node.port.onmessage = (e) => controller?.enqueue(e.data);

function onUnmute() {
  const segment = new ReadableStream<Float32Array>({
    start: (c) => { controller = c; },
    cancel: () => { controller = null; }   // clearBuffer cancels the turn -> here
  });
  void session.processSTF(segment);        // this segment is one turn
}

function onMute() {
  controller?.close();                     // ending the source ends the turn
  controller = null;
}
```

Do **not** just stop enqueuing chunks while leaving the turn open during a mute. Because the audio carries no timestamps, the server concatenates across the gap and the avatar falls behind by the muted duration, later `stf` responses can be dropped (the avatar speaks but `SPEAKING` is not reported), and every later `processSTF` call waits in the queue behind the turn that never closed.

Two more things to watch:

- **Echo**: if the mic picks up the avatar's own voice from the speakers, it gets lip-synced back. Set `getUserMedia({ audio: { echoCancellation: true } })` or design for a headset.
- **Backpressure**: a live source cannot pause generation when transmission slows. When the channel is congested the SDK stops pulling from the source, so production code should watch `controller.desiredSize` and drop or measure.

### Stop AI avatar speaking

```typescript
function clearBuffer(): Promise<void>;
```

You can stop the AI avatar's response. If called before speech starts, the pending speech will not begin. If speech has already started, it will stop after the current sentence finishes.

This is the barge-in call. Beyond the server-side speech buffer it cancels everything the SDK is driving on the caller's behalf:

- an in-flight streaming STT stream — cancelled and the microphone released; a pending `stopProcessSTT()` rejects with `STTError` `code: 'cancelled'`
- the active STF turn — a pending `processSTF()` **resolves**, and a live source stops being pulled
- the deprecated `processChat()` job
- any streaming TTS request — a cancel is sent at once (not deferred to the next chunk), a pending `processTTS()` resolves `undefined`, and an open `processStreamingTTS()` stream ends silently with no further chunks and nothing reported to the error handler

It does **not** cancel a `processLLM()` generator the caller is iterating. Pass an `AbortSignal` in `ProcessLLMOptions` and abort it instead.

### STT interaction modes

An STT type works in exactly one of two modes, and the mode is fixed when the
session is created:

| `mode` | Behavior |
|--------|----------|
| `NON_STREAMING` | The whole utterance is recorded, then transcribed on stop |
| `STREAMING` | Audio is sent while the user speaks; interim text arrives during the utterance |

`STREAMING` types additionally carry `end_of_turn_detection`. When it is `true`
the provider detects utterance boundaries itself, so a single recording carries
a whole conversation and each utterance is delivered as it is committed.

The two modes are mutually exclusive, fixed by the session's STT type. **You do not select the
transport.** `startProcessSTT()` reads the session's STT type and uses the matching one, so the same
calling code works for both. Choose the behavior by passing a streaming `stt_type` to
`createSessionId()`.

Discover which types support streaming with `getSTTs()`, whose `mode` and
`end_of_turn_detection` fields identify them.

> **Server requirement:** streaming STT needs a backend that serves
> `/api/v1/settings/stt_type/v2/`. Against an older server all STT types are
> treated as `NON_STREAMING`.

#### What the caller still has to know

The transport is hidden; the interaction model is not. What the SDK cannot hide
is *where the transcript arrives* and *whether the microphone stays open* —
both are visible to the user, so the UI has to know.

| Session | Transcript arrives at | Microphone | UI shape |
|---------|----------------------|------------|----------|
| `NON_STREAMING` | `stopProcessSTT()` return value | Opened per turn | Push-to-talk |
| `STREAMING` | Same, plus `subscribeSttPartials` for interim text | Opened per turn | Push-to-talk + provisional text |
| `STREAMING` + `end_of_turn_detection` | **`subscribeSttUtterances`** | **Open for the whole conversation** | Live indicator, no button |

The third row differs in kind, which makes `end_of_turn_detection` — not `mode`
— the value worth branching on:

- **Without it you cannot even start.** `startProcessSTT()` rejects on an
  end-of-turn session with no utterance subscriber registered, rather than dropping
  every utterance silently.
- **The UI shape differs.** A microphone that stays open for the conversation
  has no press-and-hold button; it needs a live indicator and a barge-in path
  (`clearBuffer()`).
- **Feature availability differs.** `transcribeAudio()` is rejected on a
  streaming session and `lastRecordedAudioFile` is only populated on a
  non-streaming one, so an "upload a file" or "play back what I said" control
  has to be hidden accordingly.

What *is* hidden stays hidden: `subscribeSttPartials` is inert on a
`NON_STREAMING` session (it never fires) and `language` works on both, so a single
call site compiles and runs correctly for all three rows. Only the surrounding UI
and the subscription change.

Most applications never query this. Whoever creates the session picks the
`stt_type`, so the mode is already known and can be passed to the client.
`getSessionInfo()` is for the case where it is not — a session created by
another service, or a template-created session where the browser receives only
the id. It needs no API key.

```typescript
const info = await getSessionInfo({ sessionId });
const alwaysOn = info.stt_type?.end_of_turn_detection === true;

if (alwaysOn) {
  // Utterances arrive on the subscriber, which must be registered before start.
  session.subscribeSttUtterances(handleUtterance);
  renderLiveIndicator();
} else {
  // The transcript comes back from stopProcessSTT().
  renderPushToTalkButton();
}
```

### Start STT recording

```typescript
function startProcessSTT(timeout?: number): Promise<void>;
function startProcessSTT(options?: {
  timeout?: number;
  language?: string;
}): Promise<void>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `timeout` | No | Milliseconds after which recording stops automatically |
| `options.language` | No | Language code (e.g. `'ko'`). Streaming declares it up front |

Interim hypotheses are delivered through `subscribeSttPartials()`, not this call.

Starts recording audio for STT (Speech-To-Text) processing.

**How it works — `NON_STREAMING`:**
1. Records the microphone (client-side)
2. Sends the whole utterance for transcription on `stopProcessSTT()`
3. Returns transcribed text

**How it works — `STREAMING`:**
1. Captures audio and sends it as it arrives
2. Emits interim hypotheses to `subscribeSttPartials` subscribers while the user speaks
3. Returns the final text on `stopProcessSTT()`

Interim hypotheses are opt-in (subscribe with `subscribeSttPartials`) because a
hypothesis is not a settled transcript; existing result consumers must not
receive one by surprise.

**Throws:**
- `Error` if already recording
- `Error` if microphone access is denied
- `Error` if the session uses end-of-turn detection and no utterance subscriber is
  registered — see `subscribeSttUtterances()`
- `STTError` on a streaming session when the connection cannot be opened
  (`.code` carries the connection reason, an open string) or when the
  server refuses to start the stream (e.g. `mode_unsupported`, `stream_busy`) or
  does not acknowledge it within 15 s (`start_timeout`)

**Browser Support:**
- Chrome 66+
- Firefox 76+
- Safari 14.1+
- iOS Safari 14.5+
- Edge 79+

### Stop STT recording and transcribe

```typescript
function stopProcessSTT(language?: string): Promise<string>;
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `language` | No | Language code for STT (e.g., 'ko', 'en'). Ignored on a streaming session — pass it to `startProcessSTT()` instead |

Stops recording and resolves with the transcript. On a `NON_STREAMING` session
the recorded audio is sent for transcription; on a `STREAMING` session the stream
is finalized and the server's final result is returned.

**Returns:** Promise resolving to the transcribed text (string)

With end-of-turn detection the individual utterances were already delivered to
the utterance subscribers as they were committed, and this value is their
concatenation — a summary of the recording, not the primary channel.

**Throws:**
- `STTError` if the request fails, including a streaming failure such as
  `provider_closed` or the connection dropping mid-stream
- `Error("STT recording is not in progress")` if the recorder exists but is not recording
- `Error("STT recording has not been started")` if `startProcessSTT()` was not called

**Usage Example:**

```typescript
// Interim text is opt-in and streaming-only; inert on a non-streaming session.
session.subscribeSttPartials(({ text }) => showInterim(text));
await session.startProcessSTT({ language: 'ko' });

// ... user speaks ...

try {
  const text = await session.stopProcessSTT();
  console.log('Transcribed:', text);

  if (text.trim().length > 0) {
    // Drive the pipeline yourself
    for await (const chunk of session.processLLM({ message: text })) {
      if (chunk.type === 'message' && chunk.finish) {
        session.processTTSTF(chunk.message);
      }
    }
  }
} catch (error) {
  if (error instanceof STTError) {
    console.error('STT failed:', error.code, error.message);
  }
}
```

#### `SttPartial`

```typescript
interface SttPartial {
  text: string;          // confirmed prefix + current interim hypothesis
  finalText: string;     // confirmed prefix only
  utteranceSeq?: number; // present only with end-of-turn detection
}
```

Render `text` as provisional UI and treat `finalText` as settled. In
end-of-turn detection mode both reset at every utterance boundary.

### Check STT recording status

```typescript
function isSTTRecording(): boolean;
```

**Returns:** `true` if STT recording is currently in progress or has audio pending from timeout, `false` otherwise

This method returns `true` in the following cases:
1. Recording is actively in progress (after `startProcessSTT()` and before `stopProcessSTT()`) — both STT modes
2. On a `NON_STREAMING` session, recording was automatically stopped by `timeout` but `stopProcessSTT()` has not been called yet (the recorded audio is pending)

On a `STREAMING` session a `timeout` auto-stop finalizes the stream and parks the transcript for the next `stopProcessSTT()`, which still returns it — but `isSTTRecording()` returns `false` in that window, because neither the microphone nor the stream is open anymore. Case 2 applies to `NON_STREAMING` sessions only.

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

**Migration:** Use `startProcessSTT()` for STT recording.

### ~~stopVoiceChat~~ (Deprecated)

```typescript
/** @deprecated Use stopProcessSTT() instead. */
function stopVoiceChat(): void;
```

> **Deprecated**: This method is deprecated and will be removed in a future version. Use `stopProcessSTT()` instead.

**Migration:** Use `stopProcessSTT()` for STT transcription.

### Get user's audio stream (Deprecated)

> ⚠️ **Deprecated**: Legacy voice chat mode will be removed in a future version.

```typescript
function getLocalStream(): MediaStream | null;
```

**Returns:** `MediaStream | null` — `null` if not in legacy voice chat mode.

Only available in legacy voice chat mode. Returns `null` otherwise.

### Get AI avatar's media(video + audio) stream

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

### Specifies the HTMLVideoElement to display the AI avatar video

```typescript
function setSrc(element: HTMLVideoElement);
```

| Parameter | Description |
|-----------|-------------|
| `element` | HTMLVideoElement (`<video>`) where the AI avatar's video will be rendered |

### Adjusts the size of the AI Avatar video during execution

```typescript
function changeSize(width: number, height: number);
```

| Parameter | Description |
|-----------|-------------|
| `width` | AI Avatar video width |
| `height` | AI Avatar video height |

You can change the size of the AI avatar even after the session has been created.

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

In non-WebRTC mode — a session created without the STF capability (no `using_stf_webrtc`), so there is no `Perso` connection — the callback never fires and a no-op unsubscribe is returned. Such a session is kept alive by a heartbeat instead; detect its termination through `setErrorHandler()`, which receives the heartbeat failure that closes it.

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
  isUser: boolean; // true - user, false - AI avatar
  text: string; // conversation
  timestamp: Date; // conversation timestamp
}
```

**Returns:** `unsubscribeChatLog` - function to unsubscribe

Receive the entire conversation log whenever it's updated. The array is ordered **newest first**: `chatLog[0]` is the most recent entry, so reverse it (or iterate from the end) to render in chronological order.

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

### Subscribe to STT partials

```typescript
function subscribeSttPartials(
  callback: (partial: SttPartial) => void
): () => void;

interface SttPartial {
  text: string; // confirmed prefix + current interim guess
  finalText: string; // confirmed prefix only
  utteranceSeq?: number; // present only under end-of-turn detection
}
```

Subscribes to interim STT hypotheses on a streaming session, delivered as the user
speaks. Multiple subscribers are supported; the returned function removes this one.

**Returns:** Function to unsubscribe.

A hypothesis is provisional — render `text` as in-progress and treat `finalText` as
the confirmed prefix. It never fires on a `NON_STREAMING` session. Under end-of-turn
detection each partial carries `utteranceSeq`, tying it to the utterance delivered by
`subscribeSttUtterances()`.

```typescript
const off = session.subscribeSttPartials(({ text, finalText }) => showInterim(text, finalText));
await session.startProcessSTT({ language: 'ko' });
// ... later: off();
```

### Subscribe to STT utterances

```typescript
function subscribeSttUtterances(
  callback: (utterance: SttUtterance) => void
): () => void;

interface SttUtterance {
  seq: number;
  text: string;
  normalizedText: string; // spoken numbers/units as written, e.g. "23"
  locale: string; // detected language, e.g. 'ko-KR'
}
```

Subscribes to committed STT utterances under end-of-turn detection, each delivered
once as a whole `SttUtterance`. Multiple subscribers are supported; the returned
function removes this one. It fires only under end-of-turn detection — on a
non-end-of-turn streaming session there is a single utterance whose transcript comes
from `stopProcessSTT()`.

**Returns:** Function to unsubscribe.

**Required for end-of-turn detection.** When the session's STT type detects
utterance boundaries, the microphone stays open and each utterance is committed by
the server as the conversation goes — there is no return value for them to travel
on. `startProcessSTT()` therefore rejects if no subscriber (or a deprecated
`setSttResultCallback()` handler) is registered, rather than dropping utterances
silently. Register before starting; registering afterwards races the first
utterance.

The SDK does **not** feed these results into the LLM for you. Drive the pipeline
explicitly with `processLLM()` → `processTTSTF()`.

```typescript
session.subscribeSttUtterances(async (utterance) => {
  console.log(`utterance ${utterance.seq} [${utterance.locale}]:`, utterance.text);

  for await (const chunk of session.processLLM({
    message: utterance.normalizedText || utterance.text
  })) {
    if (chunk.type === 'message' && chunk.finish) {
      session.processTTSTF(chunk.message);
    }
  }
});

await session.startProcessSTT(); // mic stays open for the whole conversation
```

**Echo handling.** With an always-open microphone the avatar's own voice can be
picked up and transcribed as user speech, which would then be answered and spoken
again. The SDK guards against this on two levels: it requests echo cancellation
from the browser, and it discards a committed utterance that closely matches what
the avatar just spoke. Utterances discarded this way never reach a subscriber.

### Set STT result callback (deprecated)

```typescript
function setSttResultCallback(
  callback: (text: string, meta?: SttResultMeta) => void
): () => void;

/** An SttUtterance minus the `text` that travels as the first argument. */
type SttResultMeta = Omit<SttUtterance, 'text'>;
// { seq: number; normalizedText: string; locale: string }
```

**Deprecated — prefer [`subscribeSttUtterances`](#subscribe-to-stt-utterances)**,
which delivers each committed utterance as a whole `SttUtterance` and supports
multiple subscribers. This method is retained for the classic DataChannel voice-chat
path and for backward compatibility: either a `subscribeSttUtterances` subscriber or
a `setSttResultCallback` handler satisfies the end-of-turn start requirement, and
both receive each committed utterance.

`meta` is present when the result is a server-committed utterance from a streaming
session, and absent on the legacy voice-chat path. Existing single-argument handlers
keep working unchanged. `SttResultMeta` is exported so a handler declared apart from
the call site can be typed without restating the shape.

### Set error handler

```typescript
function setErrorHandler(callback: (error: Error) => void): () => void;
```

| Parameter | Description |
|-----------|-------------|
| `callback` | Callback function that receives errors the SDK cannot deliver as a rejection — failures that surface after a call has returned, or inside a pipeline the SDK drives itself |

**Returns:** Function to remove the error handler

The handler receives:

| Error | Raised by |
|-------|-----------|
| `LLMError` | The deprecated `processChat()` pipeline — the `/llm/v2/` request or its SSE stream failed |
| `TTSError` | `processTTS()` (the call then resolves `undefined`); `processStreamingTTS()` — a streaming connection that will not open (resolves `undefined`) and every mid-stream failure, which is also thrown from the iteration |
| `STTError` | Streaming STT — a failure that ends the stream while no `startProcessSTT()`/`stopProcessSTT()` call is pending (a pending call rejects instead), or a failure while a `timeout` auto-stop finalizes the stream |
| `STFError` | `code: 'server_rejected'` — the server refused an STF turn (`processSTF()` still resolves); `code: 'channel_closed'` — `processTTSTF()` (or the deprecated chat methods that speak through it) could not send its request |
| `ApiError` / `Error` | The heartbeat of a non-WebRTC session failed; the session is closed afterwards |

Errors that reject a call — `stopProcessSTT()`, `transcribeAudio()`, `processSTF()` (other than the two codes above), `TTSNotStreamableError` — are not duplicated into the handler. `processLLM()` never uses it: its failures are yielded as `error` chunks.

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

Closes the session and ends the AI avatar conversation immediately. If successfully closed, `true` will be sent to the `onClose` callback.

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
| `ANALYZING` | The response generated by the LLM is being processed for the AI avatar to speak. |
| `SPEAKING` | The AI avatar is speaking. |
| `TTS` | `processTTS()` is generating audio from text, or a `processStreamingTTS()` stream is still open — the state is held until that stream is drained, cancelled, or fails. |

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
const chatTool = new PersoInteractive.ChatTool(
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

## SessionCreationError

An error thrown by `createSessionId()` (including the `getSessionTemplate` path) when the underlying API returns an `ApiError`. Extends `ApiError`, so existing `instanceof ApiError` branches keep working — use this subclass when you want to distinguish session creation failures from other API errors.

```typescript
class SessionCreationError extends ApiError {
  constructor(source: ApiError);
}
```

The original `errorCode`, `code`, `detail`, and `attr` fields are preserved verbatim from the server response. The SDK does not parse `detail` strings — callers inspect the raw fields to decide how to react. When session creation fails because a feature is unavailable to the caller, the relevant signals are typically:

| Server response | Typical meaning | SDK error |
|-----------------|-----------------|-----------|
| `code: "does_not_exist"` (often with `attr` set) | Referenced resource (e.g. prompt) does not exist | `DoesNotExistError` (subclass of `SessionCreationError`) |
| `code: "not_in_organization"` | Resource exists but is not assigned to the caller's organization | `NotInOrganizationError` (subclass of `SessionCreationError`) |
| `code: "invalid"` with a `"… not found"` detail | Org-level feature (STT/TTS/LLM/Model Style) is not assigned | `SessionCreationError` — inspect `detail` |

## DoesNotExistError

A `SessionCreationError` subclass thrown when the server's response `code` is `"does_not_exist"` — the referenced resource (e.g. an invalid `prompt_id`) does not exist at all. The `attr` field, when present, identifies which input field referenced the missing resource (e.g. `"prompt"`).

```typescript
class DoesNotExistError extends SessionCreationError {
  constructor(source: ApiError);
}
```

## NotInOrganizationError

A `SessionCreationError` subclass thrown when the server's response `code` is `"not_in_organization"` — the resource exists in the platform catalog but is not assigned to the caller's organization (e.g. an LLM/TTS/STT type that requires admin enablement). The `attr` field, when present, identifies which input field referenced the unavailable resource.

```typescript
class NotInOrganizationError extends SessionCreationError {
  constructor(source: ApiError);
}
```

**Usage Example:**

```typescript
import {
  createSessionId,
  DoesNotExistError,
  NotInOrganizationError,
  SessionCreationError,
  ApiError
} from 'perso-interactive-sdk-web/server';

try {
  const sessionId = await createSessionId({ apiKey, params });
} catch (err) {
  if (err instanceof DoesNotExistError) {
    // e.g. invalid prompt_id — err.attr identifies which input field.
  } else if (err instanceof NotInOrganizationError) {
    // Resource exists but not enabled for this organization.
  } else if (err instanceof SessionCreationError) {
    // Other session creation failures (still has errorCode/code/detail/attr).
  } else if (err instanceof ApiError) {
    // Any other API error.
  } else {
    throw err;
  }
}
```

> When chaining `instanceof` checks, order from narrowest to broadest:
> `DoesNotExistError` / `NotInOrganizationError` → `SessionCreationError` → `ApiError`. Because `SessionCreationError extends ApiError`, an `ApiError` check first would absorb every session creation error.

## LLMError

An error that occurs during an LLM turn, which wraps `ApiError` and `LLMStreamingResponseError`. `processLLM()` yields it as an `error` chunk. A protocol failure's code is forwarded on `.code`.

```typescript
class LLMError extends Error {
  public underlyingError: ApiError | LLMStreamingResponseError;
  get code(): string | undefined;
}
```

| Property | Description |
|----------|-------------|
| `underlyingError` | The underlying error (`ApiError` or `LLMStreamingResponseError`). For a transport-level failure the wrapped `ApiError` status is `0`, since it carries no HTTP status |
| `code` | The LLM protocol error code, or the connection reason (an open string) when the transport failed. `undefined` only when `underlyingError` is an `LLMStreamingResponseError`, which today arises solely from the 10-round tool follow-up cap |

Match `code` against the exported `LLM_ERROR_CODE` table:

| Member | Value | Meaning |
|--------|-------|---------|
| `CANCELLED` | `cancelled` | The turn was aborted by a cancel (barge-in). A client-requested stop, **not a failure** — the SDK converts it into a normal end of iteration, so `processLLM()` consumers never observe an `error` chunk with this code |
| `BUSY` | `llm_busy` | Past the per-connection in-flight LLM cap |
| `RATE_LIMITED` | `ws_rate_limited` | Too many requests on the connection |
| `IDLE_TIMEOUT` | `llm_idle_timeout` | SDK-raised: no frame arrived within the idle window |

When the streaming connection cannot be opened, or drops mid-turn, its reason
(`ws_closed`, `ws_disposed`, or the server's pre-accept reason such as
`ws_session_not_ready` / `ws_session_not_found`) is forwarded into `code`
unchanged. A top-level transport `error` (e.g. `unknown_type` from a server that
predates this transport) forwards its code the same way. Both are open strings —
log the ones you do not handle.

**Treat `code` as an open string** — the server relays provider codes verbatim and adds new ones without a version bump. Match the values you handle and fall through on the rest.

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

An error that occurs during STT (Speech-To-Text) processing. This error wraps `ApiError` and is thrown by `stopProcessSTT()`. Streaming failures use the same type, so consumers do not have to branch on which transport produced the transcript.

```typescript
class STTError extends Error {
  public underlyingError: ApiError;
  readonly code: string;
}
```

| Property | Description |
|----------|-------------|
| `underlyingError` | The underlying `ApiError` containing status code and error details. For a streaming failure the status is `0`, since it carries no HTTP status |
| `code` | Error code from the API or the streaming protocol |

Match `code` against the exported `STT_ERROR_CODE` table:

| Member | Value | Raised by | Meaning |
|--------|-------|-----------|---------|
| `CANCELLED` | `cancelled` | SDK / server | The stream was aborted by `clearBuffer()`. A client-requested stop, **not a failure** |
| `CHUNK_TOO_LARGE` | `chunk_too_large` | SDK | A base64 payload exceeded the server cap. On a stream, one chunk did — the SDK's own chunk is ~1/120th of the cap, so this signals a capture configuration the stream was not opened for — and it is reported through `onError` / the pending promise. On a whole-utterance request the entire clip exceeded 5 MiB, and it **rejects** `stopProcessSTT()` / `transcribeAudio*()` before anything is sent |
| `TERMINAL_TIMEOUT` | `terminal_timeout` | SDK | No result arrived within 30s of stopping the stream (stream) or of the request (whole utterance) |
| `START_TIMEOUT` | `start_timeout` | SDK | The server did not acknowledge the stream start within 15 s; `startProcessSTT()` rejects, the microphone is released, and a cancel is sent so a late acceptance cannot leave the stream running server-side |
| `MODE_UNSUPPORTED` | `mode_unsupported` | server | The session's STT type does not allow this transport |
| `STREAM_BUSY` | `stream_busy` | server | The connection already has an active stream |
| `STREAM_STATE` | `stream_state` | server / SDK | A frame for an unknown or already-finished stream |
| `STREAM_IDLE_TIMEOUT` | `stream_idle_timeout` | server | No chunk or stop for 30s |
| `STREAM_MAX_DURATION` | `stream_max_duration` | server | Past 600s, or 3600s with end-of-turn detection |
| `PROVIDER_CLOSED` | `provider_closed` | server | The recognition provider dropped the stream |
| `STT_BUSY` | `stt_busy` | server | Past the per-connection in-flight STT cap (3) |
| `RATE_LIMITED` | `ws_rate_limited` | server | Too many frames on the connection |

A transport fault that aborts a stream forwards its reason into `code` unchanged.
A top-level transport `error` on a whole-utterance request (e.g. `unknown_type`
from a server that predates this transport) forwards its code the same way. Both
are open strings — log the ones you do not handle.

**Treat `code` as an open string** — the server forwards the speech provider's
own codes verbatim, and new protocol codes are added without a version bump.
Match against the values you handle and fall through on the rest.

**Usage Example:**

```typescript
import { STTError, STT_ERROR_CODE } from 'perso-interactive-sdk-web/client';

try {
  const text = await session.stopProcessSTT('ko');
} catch (error) {
  if (error instanceof STTError) {
    // A barge-in cancelled the stream; there is nothing to report.
    if (error.code === STT_ERROR_CODE.CANCELLED) return;
    console.error('STT API Error:', error.underlyingError.detail);
    console.error('Error Code:', error.code);
  } else {
    console.error('Recording Error:', error.message);
  }
}
```

## TTSError

An error that occurs during the TTS (Text-to-Speech) process, which wraps `ApiError` and `TTSDecodeError`. Passed to the error handler when `processTTS()` fails, and thrown from a `processStreamingTTS()` stream. A protocol failure's code is forwarded on `.code`.

```typescript
class TTSError extends Error {
  public underlyingError: ApiError | TTSDecodeError;
  get code(): string | undefined;
}
```

| Property | Description |
|----------|-------------|
| `underlyingError` | The underlying error (`ApiError` or `TTSDecodeError`). For a transport-level failure the wrapped `ApiError` status is `0`, since it carries no HTTP status |
| `code` | The TTS protocol error code, the server's code string from a `POST /tts/` failure, or the connection reason (an open string) when the transport failed. `undefined` only when `underlyingError` is a `TTSDecodeError` |

Match `code` against the exported `TTS_ERROR_CODE` table:

| Member | Value | Meaning |
|--------|-------|---------|
| `CANCELLED` | `cancelled` | The request was aborted by a cancel (barge-in). A client-requested stop, **not a failure** |
| `BUSY` | `tts_busy` | Past the per-connection in-flight TTS cap |
| `RATE_LIMITED` | `ws_rate_limited` | Too many requests on the connection |
| `IDLE_TIMEOUT` | `tts_idle_timeout` | SDK-raised: no chunk or terminal frame arrived within the idle window |

When the streaming connection cannot be opened, or drops mid-request, its reason
(`ws_closed`, `ws_disposed`, or the server's pre-accept reason such as
`ws_session_not_ready` / `ws_session_not_found`) is forwarded into `code`
unchanged. A top-level transport `error` (e.g. `unknown_type` from a server that
predates this transport) forwards its code the same way. Both are open strings —
log the ones you do not handle.

**Treat `code` as an open string** — new protocol codes are added without a version bump. Match the values you handle and fall through on the rest. A one-shot `processTTS()` failure on the `POST /tts/` path carries the server's `ApiError`: `.code` is its code string and `underlyingError.errorCode` is the HTTP status, whereas every transport failure has `errorCode === 0`. Only a `TTSDecodeError` leaves `code` `undefined`.

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

## TTSNotStreamableError

`processStreamingTTS()` was called on a session whose `tts_type.streamable` is not `true`. Unlike `TTSError`, this **rejects the call** instead of going to the error handler, and it is raised before the request goes out.

```typescript
class TTSNotStreamableError extends Error {
  public ttsType?: string;
}
```

| Property | Description |
|----------|-------------|
| `ttsType` | Name of the TTS type that rejected the request, when the session row carried one. Absent when the row has no TTS type or could not be read |

Every unconfirmed state raises it: `false`, `null`, an absent field, a session created without TTS, and a row the SDK could not read. The documented recovery is `processTTS()`, which needs no streaming support. See [Only a streamable voice may stream](#only-a-streamable-voice-may-stream).

## STFError

Failure of an STF (Speech-To-Face) turn — the avatar audio behind `processSTF()` and `processTTSTF()`. Thrown from `processSTF()` when the failure is known at the call, and passed to `setErrorHandler()` when it arrives after the call has returned.

```typescript
class STFError extends Error {
  public reason: string;
  public code?: string;
}
```

| Property | Description |
|----------|-------------|
| `reason` | Human-readable description. `message` is `STF Error: <reason>`; `name` is `"STFError"` |
| `code` | Failure code, an **open string**. Optional in the type; every code the SDK raises sets it |

| `code` | Surfaces as | Meaning |
|--------|-------------|---------|
| `decode` | Thrown from `processSTF()` | The `Blob` could not be decoded |
| `channel_closed` | Thrown from `processSTF()`; reported to `setErrorHandler()` for `processTTSTF()` | The WebRTC control channel is not open, so the frame was dropped. The channel can be gone while the PeerConnection stays up |
| `server_rejected` | `setErrorHandler()` only — `processSTF()` still resolves | The server refused the frame that opens a turn (`stf-streaming-start` or `ttstf`). `reason` names the command and the server's code, e.g. `server rejected "stf-streaming-start": unknown_command` |
| `config`, `chunk_too_large`, `stream_state`, `stream_busy`, `flush_timeout` | Thrown from `processSTF()` | Local streaming-turn failures — see [Send audio to STF pipeline](#send-audio-to-stf-pipeline) |

`cancelled` is raised internally when `clearBuffer()` interrupts a turn, but `processSTF()` swallows it and resolves: an interruption that was asked for is not a failure, so application code never observes that code.

**Treat `code` as an open string.** The streaming STF frames carry no server-side error channel today, so every code above is raised locally; a future server error frame will forward its own code verbatim. Match the values you handle and fall through on the rest.

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
  | ({
      type: 'tool_call';
      tool_calls: Array<object>;
    } & Record<string, unknown>)
  | ({
      type: 'tool_result';
      tool_call_id: string;
      result: object;
    } & Record<string, unknown>)
  | {
      type: 'error';
      error: Error;
    };
```

| Type | Description |
|------|-------------|
| `message` | Streaming text content. `chunks` contains all accumulated text pieces, `message` is the full concatenated text, `finish` indicates if this is the final chunk |
| `tool_call` | LLM requested tool execution. `tool_calls` contains the tool invocations — OpenAI-style `{ id, type, function: { name, arguments } }` objects on the wire, but typed `object`, so narrow before reading them. The `Record<string, unknown>` intersection lets extra server fields ride along |
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
      // Tool is being executed (handled internally). Entries are typed `object`;
      // narrow to the OpenAI-style shape before reading `function.name`.
      for (const call of chunk.tool_calls as Array<{ function: { name: string } }>) {
        console.log('Executing tool:', call.function.name);
      }
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

A standalone module for LLM streaming, tool execution, and message history management. Use this when you need full control over the LLM interaction outside of a `Session`.

### Constructor

```typescript
class LlmProcessor {
  constructor(config: LlmProcessorConfig);
  dispose(): void;
}
```

A standalone `LlmProcessor` opens its own streaming connection on the
first turn. Call `dispose()` when you are done so that connection is released.
(`Session`-owned processors are cleaned up by `session.stopSession()`.)

### LlmProcessorConfig

```typescript
interface LlmProcessorConfig {
  apiServer: string;
  sessionId: string;
  clientTools: Array<ChatTool>;
  callbacks: LlmProcessorCallbacks;
  // Internal: Session supplies its own socket here to reuse the connection.
  getSocket?: () => SessionSocket;
}
```

| Property | Description |
|----------|-------------|
| `apiServer` | Perso API server URL |
| `sessionId` | Session ID for the LLM conversation |
| `clientTools` | Default client tools available for LLM tool calling |
| `callbacks` | Callback functions for side effects |
| `getSocket` | **Internal.** `Session` passes its own WebSocket so the connection is reused; omit it in standalone use — the processor then opens (and `dispose()` closes) its own. Not intended for application code, which is why `SessionSocket` is not part of the public client exports |

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
| `onError` | Declared for `Session` wiring; not invoked by `LlmProcessor` today — errors are yielded as `error` chunks, so consume those instead |
| `onChatLog` | Declared for `Session` wiring; not invoked by `LlmProcessor` today — `processLLM()` does not write to the chat log |
| `onTTSTF` | Declared for `Session` wiring; not invoked by `LlmProcessor` today — trigger speech yourself from the `finish: true` chunk |

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
  apiServer: "https://platform.perso.ai",
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

## PcmStreamDecoder

Converts the raw PCM chunks a [`StreamingTTSStream`](#streaming-tts-pcm) yields into normalized float samples. Exported from `perso-interactive-sdk-web/client`.

```typescript
class PcmStreamDecoder {
  decode(chunk: Uint8Array): Float32Array;
}
```

| Method | Description |
|--------|-------------|
| `decode(chunk)` | Decodes one chunk of headerless little-endian 16-bit PCM into samples in `[-1, 1]`. Returns an empty array when the chunk only completed part of a split sample |

Chunk boundaries do not respect sample boundaries — 1-byte chunks occur — so the decoder holds a trailing odd byte and prepends it to the next call. **One instance per stream:** do not share a decoder across streams or reuse one after its stream ends, or the held byte leaks into the next stream and shifts every sample after it.

```typescript
import { PcmStreamDecoder } from "perso-interactive-sdk-web/client";

const stream = await session.processStreamingTTS("Hello, world!");
if (stream) {
  const decoder = new PcmStreamDecoder(); // one per stream
  for await (const chunk of stream) {
    const samples = decoder.decode(chunk); // Float32Array at stream.sampleRate
  }
}
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

