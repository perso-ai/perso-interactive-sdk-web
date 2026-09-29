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

## Migration

Upgrading from an earlier version? See the migration guide in the API reference:

- [Migrating from 1.7.x](https://github.com/perso-ai/perso-interactive-sdk-web/blob/master/core/api-docs.md#migrating-from-17x)
- [Migrating from 1.6.x](https://github.com/perso-ai/perso-interactive-sdk-web/blob/master/core/api-docs.md#migrating-from-16x)

## Usage

> 📖 **Looking for step-by-step examples?** See the [Example Guide](https://github.com/perso-ai/perso-interactive-sdk-web/blob/master/packages/perso-interactive-sdk/example-guide/en/README.md) for annotated code snippets covering LLM, TTS, STT, STF, and full pipeline patterns.

The SDK provides two entry points:

### Server-side (`perso-interactive-sdk-web/server`)

Use this module in Node.js server environments to create sessions securely without exposing your API key. The client examples below (ES Module, TypeScript, IIFE) all call this server endpoint to obtain a `sessionId`.

Every option here selects or configures a capability, and omitting one leaves that capability out of the session — `model_style` the avatar, `llm_type` the conversation, `tts_type` and `stt_type` the voice. A blank string counts as omitted; the SDK drops it rather than sending an id the server would reject. See [Capabilities](https://github.com/perso-ai/perso-interactive-sdk-web/blob/master/core/api-docs.md#capabilities).

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

// 3. Animate avatar with audio — decoded locally and streamed to the server,
//    so the avatar starts speaking before the whole clip has been transmitted
if (audioBlob) {
  await session.processSTF(audioBlob, undefined, llmResponse);
}
```

With voice input (STT → LLM → TTS → STF):

```typescript
await session.startProcessSTT();
const text = await session.stopProcessSTT();
// Pass `text` to the processLLM pipeline above
```

#### Streaming TTS

`processTTS()` resolves with a finished `Blob`, so nothing is audible until
synthesis completes. `processStreamingTTS()` resolves as soon as the stream is
established and hands back a stream of PCM chunks, so playback can start on the
first chunk.

**`processStreamingTTS()` requires a streamable voice.** The SDK reads the
session row once when the session is created and checks `tts_type.streamable`.
Unless it is `true` the call rejects with `TTSNotStreamableError` before any
request goes out — the TTS type is fixed for the session's lifetime, so no retry
or error handler can make that session stream. A confirmed `true` is required:
`false`, `null`, an absent field, a session created without TTS, and a row the
SDK could not read all reject, because a request built on an unconfirmed flag
can only fail later and less clearly. A failed lookup is not cached, so the next
call reads the row again.

`processTTS()` is never gated this way — it works on every voice and is the
fallback.

The flag is server-side data and **can differ per environment for the same
voice**. Read the value for the environment you target with
`getSessionInfo({ sessionId })` before assuming a voice can stream there.

```typescript
import { PcmStreamDecoder, TTSNotStreamableError } from 'perso-interactive-sdk-web/client';

try {
  const stream = await session.processStreamingTTS('Hello, world!');
  if (stream) {
    const decoder = new PcmStreamDecoder();
    for await (const chunk of stream) {
      const samples = decoder.decode(chunk); // Float32Array, [-1, 1]
      // feed `samples` to playback at `stream.sampleRate` (24000, mono)
    }
  }
} catch (error) {
  if (error instanceof TTSNotStreamableError) {
    // This session's voice cannot stream — the one-shot path works on every voice
    const audioBlob = await session.processTTS('Hello, world!');
  }
}
```

On a streamable voice `processTTS()` synthesizes progressively and reassembles
the audio internally, so synthesis and download overlap and the clip is ready
sooner. That is an internal detail: the return value is a single `Blob` either
way, and existing callers need no change. This path carries PCM only, so an
`output_format` other than `pcm`/`pcm_24000` — and any non-streamable voice —
keeps the one-shot `POST /tts/` endpoint, which is the only one that produces
containers (mp3/wav).

Two things the chunks cannot tell you, which is why the SDK carries them:

- The bytes are **little-endian** 16-bit PCM. Treating them as big-endian
  produces noise.
- The sample rate is not carried in the frames. Read it from `stream.sampleRate`
  or `STREAMING_TTS_SAMPLE_RATE`.

Chunk boundaries do not respect sample boundaries — 1-byte chunks occur — so use
`PcmStreamDecoder` rather than decoding each chunk on its own; it carries a split
sample forward. Cancel an abandoned turn with `await stream.cancel()`.

> **`streamable` decides whether you may stream, not how fast the audio
> arrives.** Progressive delivery is up to the voice's TTS provider: some voices
> deliver first audio early in the synthesis, others withhold everything until it
> finishes — a `streamable: true` voice may still deliver everything at the end.
> Either way the stream yields the same chunks and callers need no special case.

#### Streaming STT

An STT type works in one of two modes, fixed when the session is created.
`NON_STREAMING` records the whole utterance and transcribes it on stop via
`startProcessSTT()` / `stopProcessSTT()`. `STREAMING` streams audio as the user
speaks; use `startRealtimeSTT()` which returns an event stream you iterate with
`for await`. The two modes require different calling code.

`NON_STREAMING`:

```typescript
await session.startProcessSTT({ language: 'ko' });
const text = await session.stopProcessSTT();
```

`STREAMING` — one cycle per press, interim text arrives as `partial` events:

```typescript
const stt = session.startRealtimeSTT({ language: 'ko' });
button.onpointerup = () => stt.stop();
for await (const event of stt) {
  if (event.type === 'partial') showInterim(event.text);
  if (event.type === 'utterance') await reply(event.text);
}
```

`STREAMING` + `end_of_turn_detection` — one cycle for the whole conversation:

```typescript
const stt = session.startRealtimeSTT({ language: 'ko' });
endButton.onclick = () => stt.stop();
for await (const event of stt) {
  if (event.type === 'utterance') {
    for await (const chunk of session.processLLM({ message: event.text })) {
      if (chunk.type === 'message' && chunk.finish) session.processTTSTF(chunk.message);
    }
  }
}
```

With `end_of_turn_detection`, the microphone stays open for the whole conversation,
so the UI needs a live indicator rather than a press-and-hold button.
`mode` picks the call; `end_of_turn_detection` then shapes the UI.
The SDK always requests echo cancellation from the browser. With `end_of_turn_detection`
it also discards committed utterances that closely match what the avatar just spoke,
so its own voice is not fed back into the LLM.

> Streaming STT requires a backend serving `/api/v1/settings/stt_type/v2/`.
> Against an older server every STT type is treated as `NON_STREAMING`.
> Since SDK 1.8.0 it also needs server 2026.09.06 or later (`realtime_stt.*` frames).

See [STT interaction modes](https://github.com/perso-ai/perso-interactive-sdk-web/blob/master/core/api-docs.md#stt-interaction-modes) for the full reference.

**startRealtimeSTT lifecycle**: one call opens one mic-to-server cycle. `stop()` (or
breaking out of the loop) ends it immediately: the mic closes, any unconfirmed speech
arrives as one last `utterance`, then `finished`, and the loop exits. Called before
the mic opens, `stop()` keeps it from opening and the loop yields only `finished`.
Called while the stream is still connecting, captured speech is sent once the socket
is ready, then the cycle stops. `clearBuffer()` leaves a running cycle open — to stop
the avatar during STT, call `clearBuffer()` and then `stt.stop()` if you want to end
the cycle too. Failures throw from the loop; there is no timeout option: server limits
are `stream_max_duration` (600 s, or 3600 s with `end_of_turn_detection`) and
`stream_idle_timeout` (30 s); an app limit is a `stop()` call (e.g. from
`AbortSignal.timeout`).

#### Direct Speech — processTTSTF

Avatar speaks text directly without LLM. Useful for scripted greetings, announcements, or guided messages. The text is handed to the server over the WebRTC control channel; TTS synthesis and lip-sync run in the server pipeline.

```typescript
session.processTTSTF("Welcome! How can I help you today?");
```

#### Lip-sync your own audio — processSTF

`processSTF` is the one way client-side audio reaches the avatar, and it **always streams**: the SDK converts the audio to mono 24 kHz PCM and sends it as `stf-streaming-start / -data / -end` frames, so the server starts lip-syncing before the last byte arrives.

```typescript
// A finished clip — any container the browser can decode
await session.processSTF(audioBlob, undefined, "Hello");

// Audio still being produced — a streaming TTS, a microphone, a synthesizer.
// Chunks must already be mono 24 kHz (Float32 in [-1, 1] or s16le bytes).
async function* chunks(): AsyncGenerator<Float32Array> {
  for await (const chunk of vendorTts.stream(text)) yield chunk;  // turn opens here
}                                                                 // source ends -> turn ends
await session.processSTF(chunks(), undefined, text);

// Stop mid-speech (also stops consuming a live source)
await session.clearBuffer();
```

Resolving means the audio was **transmitted**, not played — playback is reported by the server's `stf` response, which drives `ChatState.SPEAKING`. Overlapping calls are serialized, one turn at a time.

A server that rejects the turn (`error` frame) never sends that `stf` response. The SDK gives the turn's `ANALYZING` state back, cancels the stream, and reports an `STFError` with `code: 'server_rejected'` through `setErrorHandler` — one per rejected turn. A server without streaming STF rejects `stf-streaming-start` with `unknown_command`, so **watch for this error if the avatar stays silent**.

Because the audio comes from your side, this path works on a session created **without a TTS** — leave `tts_type` out of `createSessionId`. Only the server-synthesized path (`processTTSTF` / `processChat`) requires one.

An always-on microphone needs one extra decision: because the frames carry no timestamps, a mute has to end the turn (or be filled with silence), otherwise the server concatenates across the gap and the avatar falls behind. See [How audio reaches the avatar (STF)](https://github.com/perso-ai/perso-interactive-sdk-web/blob/master/core/api-docs.md#how-audio-reaches-the-avatar-stf) for the full guidance.

```typescript
// Stop session
session.stopSession();
```

#### Legacy — processChat

> **Deprecated.** `processChat()` predates the step-controlled pipeline and is marked `@deprecated`. It still works, but new integrations should use [Chat (Recommended)](#chat-recommended--processllm--processtts--processstf) instead.

All-in-one call that runs LLM → TTS → lip-sync internally, with synthesis and lip-sync handled server-side. Nothing is exposed between the steps, so you cannot read the LLM response before it is spoken, substitute your own audio, or start playback on the first TTS chunk.

```typescript
session.processChat("Hello!");
```

`processCustomChat()` belongs to the same family and is **deprecated**: use `processTTSTF()` and manage history yourself with `getMessageHistory()`.

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
| `makeTTS({ sessionId, text, locale?, output_format?, apiServer? })`             | Generate TTS audio from text (standalone). Returns `TTSResponse` (`{ audio, locale?, normalized_text? }`) |
| `DEFAULT_API_SERVER`                                                            | The default API server URL (`https://platform.perso.ai`) |
| `PersoUtilServer`                                                               | Low-level API utilities                              |
| `ApiError`                                                                      | Error class for API errors                           |
| `SessionCreationError`                                                          | Error class for session creation failures (extends `ApiError`) |
| `DoesNotExistError`                                                             | Session creation referenced a non-existent resource (extends `SessionCreationError`) |
| `NotInOrganizationError`                                                        | Session creation referenced a resource not assigned to the org (extends `SessionCreationError`) |

Type-only exports, for naming what the getters above return: `STTType`,
`STTMode`, `LLMType`, `TTSType`, `ModelStyle`, `ModelStyleConfig`,
`ModelFile`, `BackgroundImage`, `Prompt`, `Document`, `MCPServer`,
`SessionCapability`, `TextNormalizationConfig`, `TextNormalizationDownload`,
`SessionTemplate`, `SessionInfo`, `SessionStatus`, `STTResponse`,
`TTSOutputFormat`, `TTSResponse`.

Choosing a streaming `stt_type` is a server-side decision, since `getSTTs`
takes the API key — which is why these live on the server entry too, not only in
the client bundle.

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
| `makeTTS({ sessionId, text, locale?, output_format?, apiServer? })`                | Generate TTS audio from text (standalone). Returns `TTSResponse` (`{ audio, locale?, normalized_text? }`) |
| `createSessionId({ apiKey, sessionTemplateId, apiServer? })`                       | Create session ID from a SessionTemplate (exposes API key) |
| `createSessionId({ apiKey, params, apiServer? })`                                  | Create session ID (exposes API key in browser)             |
| `getSessionTemplates({ apiKey, apiServer? })`                                      | Get available session templates                            |
| `getSessionTemplate({ apiKey, sessionTemplateId, apiServer? })`                     | Get a single session template by ID (exposes API key)      |
| `DEFAULT_API_SERVER`                                                               | The default API server URL (`https://platform.perso.ai`)   |
| `ApiError`                                                                         | Error class for API errors                                 |
| `LLMError`                                                                         | LLM failure over REST or the streaming transport, including a connection that would not open. `.code` carries the protocol/API code — match against `LLM_ERROR_CODE`; `undefined` for a streaming-response parse failure; transport-origin failures have `underlyingError.errorCode === 0` |
| `LLMStreamingResponseError`                                                        | Error class for streaming errors                           |
| `LLM_ERROR_CODE`                                                                   | Known `LLMError.code` values (open set)                    |
| `STFError`                                                                         | Error class for streaming STF failures (carries `reason`, `code`) |
| `STTError`                                                                         | STT failure over REST or the streaming transport, including a connection that would not open. `.code` carries the protocol/API code — match against `STT_ERROR_CODE`; transport-origin failures have `underlyingError.errorCode === 0` |
| `STT_ERROR_CODE`                                                                   | Known `STTError.code` values (open set)                    |
| `TTSError`                                                                         | TTS failure over REST or the streaming transport, including a connection that would not open. `.code` carries the protocol/API code — match against `TTS_ERROR_CODE`; `undefined` for a decode failure; transport-origin failures have `underlyingError.errorCode === 0` |
| `TTSDecodeError`                                                                   | Error class for TTS decode errors                          |
| `TTSNotStreamableError`                                                            | `processStreamingTTS()` was called on a session whose TTS type does not report `streamable: true` |
| `TTS_ERROR_CODE`                                                                   | Known `TTSError.code` values (open set)                    |
| `SessionCreationError`                                                             | Error class for session creation failures (extends `ApiError`) |
| `DoesNotExistError`                                                                | Session creation referenced a non-existent resource (extends `SessionCreationError`) |
| `NotInOrganizationError`                                                           | Session creation referenced a resource not assigned to the org (extends `SessionCreationError`) |
| `LlmProcessor`                                                                     | Standalone LLM streaming processor                         |
| `WavRecorder`                                                                      | Audio recorder producing WAV files                         |
| `createWavRecorder(options?)`                                                      | Factory function for WavRecorder                           |
| `getWavSampleRate(wavData)`                                                        | Extract sample rate from WAV data                          |
| `TTS_TARGET_SAMPLE_RATE`                                                           | TTS target sample rate constant (16000)                    |
| `STF_STREAM_SAMPLE_RATE`                                                           | Sample rate live STF PCM chunks must be at (24000)          |
| `PcmStreamDecoder`                                                                 | Decodes streaming-TTS PCM chunks to floats, carrying samples split across chunk boundaries |
| `STREAMING_TTS_SAMPLE_RATE`                                                        | Sample rate of streaming-TTS PCM, which the response omits (24000) |
| `STREAMING_TTS_CHANNELS`                                                           | Channel count of streaming-TTS PCM (1)                     |

Type-only exports: `Chat`, `LLMStreamChunk`, `ProcessLLMOptions`,
`StartProcessSTTOptions`, `SttPartial`, `SttUtterance`,
`RealtimeSttEvent`, `RealtimeSttOptions`, `RealtimeSttStream`,
`StfAudioSource`, `StfPcmChunk`,
`StreamingTTSStream`, `StreamingTTSOutputFormat`,
`STTType`, `STTMode`, `STTResponse`, `LLMType`, `TTSType`, `TTSOutputFormat`,
`TTSResponse`, `ModelStyle`,
`ModelStyleConfig`, `ModelFile`, `BackgroundImage`, `Prompt`, `Document`,
`MCPServer`, `SessionCapability`, `TextNormalizationConfig`,
`TextNormalizationDownload`, `SessionTemplate`, `SessionInfo`, `SessionStatus`,
`LlmProcessorCallbacks`, `LlmProcessorConfig`, `WavRecorderOptions`, and the
`*Options` argument types.

`AIHumanModelFile` is still exported from the client entry as a deprecated alias
of `ModelFile`. Prefer `ModelFile` in new code.

### Session Methods

| Method                              | Description                                    |
| ----------------------------------- | ---------------------------------------------- |
| `setSrc(videoElement)`              | Bind session to video element                  |
| `processChat(message)`              | ~~Send a message to the LLM and let the server speak the reply~~ (Deprecated) — use `processLLM` → `processTTS` → `processSTF` |
| `processLLM(options)`               | Stream LLM responses with full control         |
| `processTTSTF(message)`             | Speak a message without LLM. The text goes to the server; TTS and lip-sync are server-side |
| `processTTS(message, options?)`     | Generate TTS audio (`Promise<Blob \| undefined>`; `undefined` if the message is empty or the request failed — see `setErrorHandler`). Options: `resample`, `locale`, `output_format` (a `TTSOutputFormat`). On a streamable voice with `pcm`/`pcm_24000` or no `output_format`, synthesis runs over the session's streaming transport and is reassembled into a 24 kHz `audio/wav` Blob. Non-streamable voices, mp3/wav formats and `pcm_44100` use `POST /tts/`; there `pcm_44100` arrives headerless and does not decode, so ask for `wav*`/`mp3*` |
| `processStreamingTTS(message, options?)` | Stream TTS audio as PCM chunks, playable from the first chunk. Options: `locale`, `output_format`. Rejects with `TTSNotStreamableError` unless the session's TTS type reports `streamable: true` |
| `processSTF(audio, format?, message?)` | Lip-sync audio. A `Blob` clip is decoded locally and streamed; a live source (`ReadableStream`/`AsyncIterable` of mono 24 kHz PCM chunks) streams as it produces and the turn closes when the source ends. `format` is a legacy hint and ignored |
| `startProcessSTT(timeoutOrOptions?)` | Start recording voice for STT on a `NON_STREAMING` session. Object form: `{ timeout?, language? }`. Rejects with `STTError` `code: 'mode_unsupported'` on a `STREAMING` session |
| `stopProcessSTT(language?)`         | Stop recording and get text. `language` overrides the default set in `startProcessSTT()` |
| `startRealtimeSTT(options?)`        | Start one realtime STT cycle on a `STREAMING` session; returns a `for await` stream of `started` / `partial` / `utterance` / `finished`, ended by `stop()`. On a `NON_STREAMING` session the loop throws `STTError` `code: 'mode_unsupported'` |
| `isSTTRecording()`                  | Check if STT recording is in progress          |
| `transcribeAudio(audio, language?)` | Transcribe audio Blob/File to text. Rejects on a streaming session |
| `transcribeAudioDetailed(audio, language?)` | Transcribe audio Blob/File and return `STTResponse` (currently `{ text }`). Rejects on a `STREAMING` session like `transcribeAudio` |
| `getMessageHistory()`               | Get LLM conversation history                   |
| `getRemoteStream()`                 | Get AI avatar's media stream                    |
| `getLocalStream()`                  | ~~Get user's audio stream~~ (Deprecated)       |
| `getSessionId()`                    | Get session ID                                 |
| `clearBuffer()`                     | Stop AI avatar speaking                         |
| `changeSize(width, height)`         | Resize the avatar canvas                       |
| `logSessionEvent(detail?)`          | Send a SESSION_LOG event (string or object)    |
| `stopSession()`                     | Close the session                              |
| `subscribeChatStates(callback)`     | Subscribe to state changes                     |
| `subscribeChatLog(callback)`        | Subscribe to chat log updates                  |
| `setSttResultCallback(callback)`    | ~~Receive STT results — `(text)`~~ (Deprecated) — serves only the legacy DataChannel voice-chat path (`startVoiceChat`). Take transcripts from `stopProcessSTT()` or `startRealtimeSTT()` instead |
| `setErrorHandler(callback)`         | Subscribe to errors                            |
| `onClose(callback)`                 | Subscribe to session close                     |

### Session Properties

| Property                 | Type           | Description                                    |
| ------------------------ | -------------- | ---------------------------------------------- |
| `lastRecordedAudioFile`  | `File \| null` | Last recorded WAV audio file from STT          |

For detailed API documentation, see the [API Reference site](https://perso-ai.github.io/perso-interactive-sdk-web/docs/api/).

## License

Apache-2.0
