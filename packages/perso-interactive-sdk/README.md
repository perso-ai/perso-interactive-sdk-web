# perso-interactive-sdk-web

WebRTC-based real-time interactive AI avatar SDK for web applications.

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

app.listen(3000, () => console.log("Server running on port 3000"));
```

#### Using a SessionTemplate

If you have pre-configured session templates, pass the template ID directly instead of assembling params manually:

```javascript
const sessionId = await createSessionId(API_SERVER, API_KEY, "<sessiontemplate_id>");
```

> ⚠️ **Security Warning**: Never use `createSessionId` on the client-side in production. Exposing your API key in browser code can lead to unauthorized access and quota abuse. Always create sessions on the server and pass only the `sessionId` to the client.

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

### Client-side (`perso-interactive-sdk-web/client`)

Use this module in browser environments to create and manage interactive sessions.

```typescript
import {
  createSession,
  ChatTool,
  ChatState,
} from "perso-interactive-sdk-web/client";

const apiServer = "https://live-api.perso.ai";

// Obtain sessionId from your server (see Express.js example above)
const sessionId = await fetch("/api/session", { method: "POST" })
  .then((res) => res.json())
  .then((data) => data.sessionId);

// Create a session
const session = await createSession(apiServer, sessionId, 1920, 1080, []);

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
  await session.processSTF(audioBlob, "wav", llmResponse);
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

const session = await createSession(
  apiServer,
  sessionId,
  width,
  height,
  [weatherTool]
);
```

### Browser (IIFE)

For direct browser usage via `<script>` tag without a bundler. The SDK exposes a global `PersoInteractive` namespace:

```html
<script src="https://cdn.jsdelivr.net/npm/perso-interactive-sdk-web@latest/dist/client/index.iife.js"></script>
<script>
  async function start() {
    const apiServer = "https://live-api.perso.ai";

    // Obtain sessionId from your server (see Express.js example above)
    const sessionId = await fetch("/api/session", { method: "POST" })
      .then((res) => res.json())
      .then((data) => data.sessionId);

    const session = await PersoInteractive.createSession(
      apiServer,
      sessionId,
      1920,
      1080,
      []
    );

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

### Server Exports

| Export                                         | Description                    |
| ---------------------------------------------- | ------------------------------ |
| `createSessionId(apiServer, apiKey, sessionTemplateId)` | Create a session ID from a SessionTemplate |
| `createSessionId(apiServer, apiKey, params)`   | Create a new session ID        |
| `getIntroMessage(apiServer, apiKey, promptId)` | Get intro message for a prompt |
| `getSessionTemplates(apiServer, apiKey)`                                           | Get available session templates                            |
| `getSessionTemplate(apiServer, apiKey, sessionTemplateId)`                         | Get a single session template by ID                        |
| `PersoUtilServer`                              | Low-level API utilities        |
| `ApiError`                                     | Error class for API errors     |

### Client Exports

| Export                                                                             | Description                                                |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `createSession(apiServer, sessionId, width, height, clientTools)`                  | Create a session                                           |
| `Session`                                                                          | Session class                                              |
| `ChatTool`                                                                         | Client tool class                                          |
| `ChatState`                                                                        | Enum for chat states (RECORDING, LLM, ANALYZING, SPEAKING, TTS) |
| `getLLMs(apiServer, apiKey)`                                                       | Get available LLM providers                                |
| `getTTSs(apiServer, apiKey)`                                                       | Get available TTS providers                                |
| `getSTTs(apiServer, apiKey)`                                                       | Get available STT providers                                |
| `getModelStyles(apiServer, apiKey)`                                                | Get available avatar styles                                |
| `getBackgroundImages(apiServer, apiKey)`                                           | Get available backgrounds                                  |
| `getPrompts(apiServer, apiKey)`                                                    | Get available prompts                                      |
| `getDocuments(apiServer, apiKey)`                                                  | Get available documents                                    |
| `getMcpServers(apiServer, apiKey)`                                                 | Get available MCP servers                                  |
| `getTextNormalizations(apiServer, apiKey)`                                         | Get available text normalization configs                   |
| `getTextNormalization(apiServer, apiKey, configId)`                                | Download text normalization ruleset (pre-signed URL)       |
| `getAllSettings(apiServer, apiKey)`                                                | Get all settings at once                                   |
| `getSessionInfo(apiServer, sessionId)`                                             | Get session metadata                                       |
| `makeTTS(apiServer, params)`                                                       | Generate TTS audio from text (standalone)                  |
| `createSessionId(apiServer, apiKey, sessionTemplateId)`                            | Create session ID from a SessionTemplate (exposes API key) |
| `createSessionId(apiServer, apiKey, params)`                                       | Create session ID (exposes API key in browser)             |
| `getSessionTemplates(apiServer, apiKey)`                                           | Get available session templates                            |
| `ApiError`                                                                         | Error class for API errors                                 |
| `LLMError`                                                                         | Error class for LLM errors                                 |
| `LLMStreamingResponseError`                                                        | Error class for streaming errors                           |
| `STTError`                                                                         | Error class for STT errors                                 |
| `TTSError`                                                                         | Error class for TTS errors                                 |
| `TTSDecodeError`                                                                   | Error class for TTS decode errors                          |
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
| `processSTF(file, format, message)` | Send audio/video to STF pipeline                |
| `startProcessSTT(timeout?)`         | Start recording voice for STT                  |
| `stopProcessSTT(language?)`         | Stop recording and get text                    |
| `isSTTRecording()`                  | Check if STT recording is in progress          |
| `transcribeAudio(audio, language?)` | Transcribe audio Blob/File to text             |
| `getMessageHistory()`               | Get LLM conversation history                   |
| `getRemoteStream()`                 | Get AI human's media stream                    |
| `getLocalStream()`                  | ~~Get user's audio stream~~ (Deprecated)       |
| `getSessionId()`                    | Get session ID                                 |
| `clearBuffer()`                     | Stop AI human speaking                         |
| `changeSize(width, height)`         | Resize the avatar canvas                       |
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

For detailed API documentation, see [api-docs.md](https://github.com/perso-ai/perso-interactive-sdk-web/blob/master/core/api-docs.md).

## License

Apache-2.0
