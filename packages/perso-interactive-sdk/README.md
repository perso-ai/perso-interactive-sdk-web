# perso-interactive-sdk-web

WebRTC-based real-time interactive AI avatar SDK for web applications.

> **API server:** Use `https://platform.perso.ai` as the Perso Interactive API server URL.
>
> Legacy `https://live-api.perso.ai` remains backward-compatible.

## Installation

```bash
# npm
npm install perso-interactive-sdk-web

# yarn
yarn add perso-interactive-sdk-web

# pnpm
pnpm add perso-interactive-sdk-web
```

## Usage

> 📖 **Looking for step-by-step examples?** See the [Example Guide](https://github.com/perso-ai/perso-interactive-sdk-web/blob/master/packages/perso-interactive-sdk/example-guide/en/README.md) for annotated code snippets covering LLM, TTS, STT, STF, and full pipeline patterns.

The SDK provides two entry points:

### Server-side (`perso-interactive-sdk-web/server`)

Use this module in Node.js server environments to create sessions securely without exposing your API key. The client examples below (ES Module, TypeScript, IIFE) all call this server endpoint to obtain a `sessionId`.

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

app.listen(3000, () => console.log("Server running on port 3000"));
```

> **Two call styles supported.** Every SDK function shown above also accepts the
> classic positional form `createSessionId(apiServer, apiKey, params)` for
> backward compatibility. New code should prefer the **object form** — it lets
> you omit `apiServer` (defaults to `https://platform.perso.ai`) and is easier
> to read at call sites.

#### Using a SessionTemplate

If you have pre-configured session templates, pass the template ID directly instead of assembling params manually:

```javascript
const sessionId = await createSessionId({
  apiKey: API_KEY,
  sessionTemplateId: "<sessiontemplate_id>",
});
```

#### Listing available resources from the server

Use `getAllSettings` (or any individual `getXxx` helper) on the server to discover the LLM/TTS/STT/model-style options that your tenant has access to without exposing the API key in the browser:

```javascript
const { getAllSettings } = require("perso-interactive-sdk-web/server");

app.get("/api/settings", async (req, res) => {
  const settings = await getAllSettings({ apiKey: API_KEY });
  res.json(settings); // { llms, ttsTypes, sttTypes, modelStyles, ... }
});
```

#### Stage / custom API server

Every object-form call accepts an optional `apiServer`. Omit it for production
(defaults to `https://platform.perso.ai`), or pass an explicit URL to point at
a non-production environment. The SDK trims trailing slashes for you.

```javascript
const { DEFAULT_API_SERVER, getAllSettings } = require(
  "perso-interactive-sdk-web/server"
);

DEFAULT_API_SERVER; // "https://platform.perso.ai"

const stageSettings = await getAllSettings({
  apiKey: API_KEY,
  apiServer: "https://stage-platform.perso.ai",
});
```

The same `DEFAULT_API_SERVER` constant is also re-exported from
`perso-interactive-sdk-web/client`.

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

### Client-side (`perso-interactive-sdk-web/client`)

Use this module in browser environments to create and manage interactive sessions.

```typescript
import {
  createSession,
  ChatTool,
  ChatState,
} from "perso-interactive-sdk-web/client";

// Obtain sessionId from your server (see Express.js example above)
const sessionId = await fetch("/api/session", { method: "POST" })
  .then((res) => res.json())
  .then((data) => data.sessionId);

// Create a session (apiServer defaults to https://platform.perso.ai)
const session = await createSession({
  sessionId,
  width: 1920,
  height: 1080,
  clientTools: [],
});

// Bind to video element
const videoEl = document.getElementById("video");
if (videoEl instanceof HTMLVideoElement) {
  session.setSrc(videoEl);
}

// Subscribe to chat states
session.subscribeChatStates((states) => {
  console.log("Chat states:", states);
});

// Subscribe to chat log
session.subscribeChatLog((chatLog) => {
  console.log("Chat log:", chatLog);
});
```

#### Chat (Recommended) — processLLM → processTTS → processSTF

Full pipeline with individual step control. Use this when you need to handle each stage (LLM response, TTS audio, avatar animation) separately.

```typescript
// 1. Get LLM response
const llmGenerator = session.processLLM({ message: "Hello!" });
let llmResponse = "";
for await (const chunk of llmGenerator) {
  if (chunk.type === "message" && chunk.finish) {
    llmResponse = chunk.message;
  }
}

// 2. Convert text to speech
const audioBlob = await session.processTTS(llmResponse);

// 3. Animate avatar with audio
if (audioBlob) {
  await session.processSTF(audioBlob, audioBlob.type, llmResponse);
}
```

With voice input (STT → LLM → TTS → STF):

```typescript
await session.startProcessSTT();
const text = await session.stopProcessSTT();
// Pass `text` to the processLLM pipeline above
```

#### Chat (Simple) — processChat

All-in-one call that runs LLM → TTS → STF internally. Use this when you don't need control over individual steps.

```typescript
session.processChat("Hello!");
```

#### Direct Speech — processTTSTF

Avatar speaks text directly without LLM. Useful for scripted greetings, announcements, or guided messages.

```typescript
session.processTTSTF("Welcome! How can I help you today?");
```

```typescript
// Stop session
session.stopSession();
```

### Client Tool Calling

Define custom tools that the LLM can invoke:

```typescript
import { ChatTool } from "perso-interactive-sdk-web/client";

const weatherTool = new ChatTool(
  "get_weather",
  "Get current weather for a location",
  {
    type: "object",
    properties: {
      location: { type: "string", description: "City name" },
    },
    required: ["location"],
  },
  async (args) => {
    // Your implementation
    return { temperature: 22, condition: "Sunny" };
  },
  false, // executeOnly: if true, no follow-up LLM response
);

const session = await createSession({
  sessionId,
  width,
  height,
  clientTools: [weatherTool],
});
```

### Browser (IIFE)

For direct browser usage via `<script>` tag without a bundler. The SDK exposes a global `PersoInteractive` namespace:

```html
<script src="https://cdn.jsdelivr.net/npm/perso-interactive-sdk-web@latest/dist/client/index.iife.js"></script>
<script>
  async function start() {
    // Obtain sessionId from your server (see Express.js example above)
    const sessionId = await fetch("/api/session", { method: "POST" })
      .then((res) => res.json())
      .then((data) => data.sessionId);

    // apiServer defaults to https://platform.perso.ai
    const session = await PersoInteractive.createSession({
      sessionId,
      width: 1920,
      height: 1080,
      clientTools: [],
    });

    const videoEl = document.getElementById("video");
    if (videoEl instanceof HTMLVideoElement) {
      session.setSrc(videoEl);
    }
  }

  start();
</script>
```

> **Note**: The browser examples above call `POST /api/session` on your server. See the [Express.js example](#expressjs-example) for the server implementation. Never expose your API key in client-side code.

### Example Guide

> 📖 **Example Guide**: [English](https://github.com/perso-ai/perso-interactive-sdk-web/blob/master/packages/perso-interactive-sdk/example-guide/en/README.md)

## API Reference

> Every function below has two call styles: the **object form** shown in the
> table (recommended for new code; `apiServer` is optional and defaults to
> `https://platform.perso.ai`) and the equivalent **positional form**
> (`fn(apiServer, apiKey, …)`) which remains fully supported.

### Server Exports

| Export                                                                          | Description                                          |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `createSessionId({ apiKey, sessionTemplateId, apiServer? })`                    | Create a session ID from a SessionTemplate           |
| `createSessionId({ apiKey, params, apiServer? })`                               | Create a new session ID                              |
| `getIntroMessage({ apiKey, promptId, apiServer? })`                             | Get intro message for a prompt                       |
| `getLLMs({ apiKey, apiServer? })`                                               | Get available LLM providers                          |
| `getTTSs({ apiKey, apiServer? })`                                               | Get available TTS providers                          |
| `getSTTs({ apiKey, apiServer? })`                                               | Get available STT providers                          |
| `getModelStyles({ apiKey, apiServer? })`                                        | Get available avatar styles                          |
| `getBackgroundImages({ apiKey, apiServer? })`                                   | Get available backgrounds                            |
| `getPrompts({ apiKey, apiServer? })`                                            | Get available prompts                                |
| `getDocuments({ apiKey, apiServer? })`                                          | Get available documents                              |
| `getMcpServers({ apiKey, apiServer? })`                                         | Get available MCP servers                            |
| `getTextNormalizations({ apiKey, apiServer? })`                                 | Get available text normalization configs             |
| `getTextNormalization({ apiKey, configId, apiServer? })`                        | Download text normalization ruleset (pre-signed URL) |
| `getAllSettings({ apiKey, apiServer? })`                                        | Get all settings at once                             |
| `getSessionTemplates({ apiKey, apiServer? })`                                   | Get available session templates                      |
| `getSessionTemplate({ apiKey, sessionTemplateId, apiServer? })`                 | Get a single session template by ID                  |
| `getSessionInfo({ sessionId, apiServer? })`                                     | Get session metadata                                 |
| `makeTTS({ sessionId, text, locale?, output_format?, apiServer? })`             | Generate TTS audio from text (standalone)            |
| `DEFAULT_API_SERVER`                                                            | The default API server URL (`https://platform.perso.ai`) |
| `PersoUtilServer`                                                               | Low-level API utilities                              |
| `ApiError`                                                                      | Error class for API errors                           |
| `SessionCreationError`                                                          | Error class for session creation failures (extends `ApiError`) |
| `DoesNotExistError`                                                             | Session creation referenced a non-existent resource (extends `SessionCreationError`) |
| `NotInOrganizationError`                                                        | Session creation referenced a resource not assigned to the org (extends `SessionCreationError`) |

### Client Exports

| Export                                                                             | Description                                                |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `createSession({ sessionId, width, height, clientTools, apiServer? })`             | Create a session                                           |
| `Session`                                                                          | Session class                                              |
| `ChatTool`                                                                         | Client tool class                                          |
| `ChatState`                                                                        | Enum for chat states (RECORDING, LLM, ANALYZING, SPEAKING, TTS) |
| `getLLMs({ apiKey, apiServer? })`                                                  | Get available LLM providers                                |
| `getTTSs({ apiKey, apiServer? })`                                                  | Get available TTS providers                                |
| `getSTTs({ apiKey, apiServer? })`                                                  | Get available STT providers                                |
| `getModelStyles({ apiKey, apiServer? })`                                           | Get available avatar styles                                |
| `getBackgroundImages({ apiKey, apiServer? })`                                      | Get available backgrounds                                  |
| `getPrompts({ apiKey, apiServer? })`                                               | Get available prompts                                      |
| `getDocuments({ apiKey, apiServer? })`                                             | Get available documents                                    |
| `getMcpServers({ apiKey, apiServer? })`                                            | Get available MCP servers                                  |
| `getTextNormalizations({ apiKey, apiServer? })`                                    | Get available text normalization configs                   |
| `getTextNormalization({ apiKey, configId, apiServer? })`                           | Download text normalization ruleset (pre-signed URL)       |
| `getAllSettings({ apiKey, apiServer? })`                                           | Get all settings at once                                   |
| `getSessionInfo({ sessionId, apiServer? })`                                        | Get session metadata                                       |
| `makeTTS({ sessionId, text, locale?, output_format?, apiServer? })`                | Generate TTS audio from text (standalone)                  |
| `createSessionId({ apiKey, sessionTemplateId, apiServer? })`                       | Create session ID from a SessionTemplate (exposes API key) |
| `createSessionId({ apiKey, params, apiServer? })`                                  | Create session ID (exposes API key in browser)             |
| `getSessionTemplates({ apiKey, apiServer? })`                                      | Get available session templates                            |
| `DEFAULT_API_SERVER`                                                               | The default API server URL (`https://platform.perso.ai`)   |
| `ApiError`                                                                         | Error class for API errors                                 |
| `LLMError`                                                                         | Error class for LLM errors                                 |
| `LLMStreamingResponseError`                                                        | Error class for streaming errors                           |
| `STTError`                                                                         | Error class for STT errors                                 |
| `TTSError`                                                                         | Error class for TTS errors                                 |
| `TTSDecodeError`                                                                   | Error class for TTS decode errors                          |
| `SessionCreationError`                                                             | Error class for session creation failures (extends `ApiError`) |
| `DoesNotExistError`                                                                | Session creation referenced a non-existent resource (extends `SessionCreationError`) |
| `NotInOrganizationError`                                                           | Session creation referenced a resource not assigned to the org (extends `SessionCreationError`) |
| `LlmProcessor`                                                                     | Standalone LLM streaming processor                         |
| `WavRecorder`                                                                      | Audio recorder producing WAV files                         |
| `createWavRecorder(options?)`                                                      | Factory function for WavRecorder                           |
| `getWavSampleRate(wavData)`                                                        | Extract sample rate from WAV data                          |
| `TTS_TARGET_SAMPLE_RATE`                                                           | TTS target sample rate constant (16000)                    |

### Session Methods

| Method                              | Description                                    |
| ----------------------------------- | ---------------------------------------------- |
| `setSrc(videoElement)`              | Bind session to video element                  |
| `processChat(message)`              | Send a message to the LLM                      |
| `processLLM(options)`               | Stream LLM responses with full control         |
| `processTTSTF(message)`             | Speak a message without LLM                    |
| `processTTS(message, options?)`     | Generate TTS audio from text (returns Blob). Options: `resample`, `locale`, `output_format` |
| `processSTF(file, format?, message?)` | Send audio to the STF pipeline. `format` accepts canonical (`'wav'` / `'mp3'`) or MIME (`'audio/wav'`, `'audio/mpeg'`, …); when omitted, derived from `file.type` |
| `startProcessSTT(timeout?)`         | Start recording voice for STT                  |
| `stopProcessSTT(language?)`         | Stop recording and get text                    |
| `isSTTRecording()`                  | Check if STT recording is in progress          |
| `transcribeAudio(audio, language?)` | Transcribe audio Blob/File to text             |
| `transcribeAudioDetailed(audio, language?)` | Transcribe audio Blob/File and return `STTResponse` (currently `{ text }`) |
| `getMessageHistory()`               | Get LLM conversation history                   |
| `getRemoteStream()`                 | Get AI human's media stream                    |
| `getLocalStream()`                  | ~~Get user's audio stream~~ (Deprecated)       |
| `getSessionId()`                    | Get session ID                                 |
| `clearBuffer()`                     | Stop AI human speaking                         |
| `changeSize(width, height)`         | Resize the avatar canvas                       |
| `logSessionEvent(detail?)`          | Send a SESSION_LOG event (string or object)    |
| `stopSession()`                     | Close the session                              |
| `subscribeChatStates(callback)`     | Subscribe to state changes                     |
| `subscribeChatLog(callback)`        | Subscribe to chat log updates                  |
| `setSttResultCallback(callback)`    | Set STT result callback                        |
| `setErrorHandler(callback)`         | Subscribe to errors                            |
| `onClose(callback)`                 | Subscribe to session close                     |

### Session Properties

| Property                 | Type           | Description                                    |
| ------------------------ | -------------- | ---------------------------------------------- |
| `lastRecordedAudioFile`  | `File \| null` | Last recorded WAV audio file from STT          |

For detailed API documentation, see the [API Reference site](https://perso-ai.github.io/perso-interactive-sdk-web/docs/api/).

## License

Apache-2.0
