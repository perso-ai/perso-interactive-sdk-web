---
search: false
---

::: warning Archived version
You're viewing **v1.7**. The latest version is **[here](/guide/getting-started.md)**.
:::

# Getting Started

The Perso Interactive SDK lets you embed a real-time, WebRTC-based AI avatar
session in a web app, with LLM chat, TTS/STT, and client-side tool calls.

This page is a short orientation. For the complete API surface, see the
[API Reference](/v1.7/api/).

## Install

```bash
# npm
npm install perso-interactive-sdk-web

# yarn
yarn add perso-interactive-sdk-web

# pnpm
pnpm add perso-interactive-sdk-web
```

## Entry points

The package exposes two subpath exports:

| Subpath                                  | Use from                | Purpose                                                                |
| ---------------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `perso-interactive-sdk-web/client`       | Browser                 | `createSession`, `ChatTool`, `ChatState`, error classes.               |
| `perso-interactive-sdk-web/server`       | Node.js / SSR runtime   | `createSessionId`, `getIntroMessage` — keeps your API key off the wire. |

::: warning Security
Never call the server-only `createSessionId` from browser code with a real API
key. Create the session id on your server and pass only the id to the client.
:::

## Quick start

The two functions you need are `createSessionId` (server) and `createSession`
(browser). Both take a single options object — no API server URL to wire up.

```ts
// --- Server (Node.js) ---
import { createSessionId } from 'perso-interactive-sdk-web/server';

const sessionId = await createSessionId({
  apiKey: process.env.PERSO_INTERACTIVE_API_KEY!,
  params: {
    using_stf_webrtc: true,
    model_style: '<model_style_name>',
    prompt: '<prompt_id>',
    llm_type: '<llm_name>',
    tts_type: '<tts_name>',
    stt_type: '<stt_name>',
  },
});
// Return `sessionId` to the browser via your API endpoint.
```

```ts
// --- Browser ---
import { createSession } from 'perso-interactive-sdk-web/client';

const session = await createSession({
  sessionId,           // received from your server endpoint
  width: 1920,
  height: 1080,
  clientTools: [],
});

session.setSrc(document.getElementById('video') as HTMLVideoElement);
```

## Minimal flow

1. Fetch settings (LLMs, TTSs, STTs, model styles, prompts, …) from the API
   server using the helpers under `PersoInteractive` — e.g. `getAllSettings({ apiKey })`.
2. On your server, call `createSessionId({ apiKey, params })` (or pass
   `sessionTemplateId` instead of `params`) and return the id to the browser.
3. In the browser, call `createSession({ sessionId, width, height, clientTools })`.
4. Bind media: `session.setSrc(videoElement)` or use `session.getRemoteStream()`.
5. Subscribe to state and chat log:
   - `session.subscribeChatStates(handler)`
   - `session.subscribeChatLog(handler)`
   - `session.setErrorHandler(handler)`
6. Drive interaction with one of the main APIs below.

## Main interaction APIs

### Chat (Recommended) — processLLM → processTTS → processSTF

Full pipeline with individual step control. Use this when you need to handle
each stage (LLM response, TTS audio, avatar animation) separately.

```ts
// 1. Get LLM response
const llmGenerator = session.processLLM({ message: 'Hello!' });
let llmResponse = '';
for await (const chunk of llmGenerator) {
  if (chunk.type === 'message' && chunk.finish) {
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

`processSTF()` always streams: the clip is decoded in the browser and sent as PCM
rather than uploaded as a file. The second argument is a legacy format hint and is
**ignored** — the container is detected from the audio bytes — and the call
resolves with `void`, not a file reference. See
[How audio reaches the avatar (STF)](/v1.7/api/#how-audio-reaches-the-avatar-stf).

With voice input (STT → LLM → TTS → STF):

```ts
await session.startProcessSTT();
const text = await session.stopProcessSTT();
// Pass `text` to the processLLM pipeline above
```

### Streaming TTS

`processTTS()` resolves with a finished `Blob`, so nothing is audible until
synthesis completes. `processStreamingTTS()` resolves as soon as the stream is
established and hands back PCM chunks, so playback can start on the first one.

```ts
import { PcmStreamDecoder } from 'perso-interactive-sdk-web/client';

const stream = await session.processStreamingTTS('Hello, world!');
if (stream) {
  const decoder = new PcmStreamDecoder();
  for await (const chunk of stream) {
    const samples = decoder.decode(chunk); // Float32Array, [-1, 1]
    // feed `samples` to playback at `stream.sampleRate` (24000, mono)
  }
}
```

Decode with `PcmStreamDecoder` rather than per chunk. The chunks cannot
describe themselves: the bytes are little-endian 16-bit PCM, the sample rate is
not carried in the frames — read `stream.sampleRate` — and chunk boundaries
split samples, so decoding a chunk on its own turns speech into noise. Abandon a
turn with `await stream.cancel()`.

**Unlike STT, this transport is not chosen for you.** `processStreamingTTS()`
requires a session whose TTS type reports `streamable: true`. Every other state
rejects with `TTSNotStreamableError` before any request goes out — `false`, a
null or absent field, a session created without TTS, or a session row the SDK
could not read — because the TTS type is fixed when the session is created, so no
retry can make that session stream.

```ts
import { TTSNotStreamableError } from 'perso-interactive-sdk-web/client';

try {
  const stream = await session.processStreamingTTS(text);
  // consume `stream` as above
} catch (error) {
  if (error instanceof TTSNotStreamableError) {
    const audioBlob = await session.processTTS(text); // works on every voice
  }
}
```

`processTTS()` is never gated this way, and on a streamable voice it synthesizes
progressively and reassembles the audio internally — so the clip is ready sooner
while the return value stays a single `Blob`. An `output_format`
other than `pcm`/`pcm_24000` — and any non-streamable voice — keeps it on the
one-shot `POST /tts/` endpoint, the only one that produces containers.

::: warning
Whether audio arrives progressively is decided by the voice's TTS provider, not
by this method — a `streamable: true` voice may still deliver everything at the
end. The flag governs availability, not latency. Its value is server-side data
that can differ per environment for the same voice, so check the environment you
target with `getSessionInfo()`.
:::

See [Only a streamable voice may stream](/v1.7/api/#only-a-streamable-voice-may-stream)
for the full table and [Streaming TTS (PCM)](/v1.7/api/#streaming-tts-pcm) for the
wire format.

### Speech recognition modes

An STT type works in one of two modes, fixed when the session is created.
`NON_STREAMING` records the whole utterance and transcribes it on stop.
`STREAMING` streams audio as the user speaks, so interim text
arrives mid-utterance.

**You do not select the transport.** `startProcessSTT()` reads the session's STT
type and uses the matching one, so the snippet above works unchanged for both.
To use streaming, pass a streaming `stt_type` to `createSessionId()` — find one
with `getSTTs()`, whose `mode` and `end_of_turn_detection` fields identify them.

Interim results are opt-in, since a hypothesis is not a settled transcript.
Subscribe with `subscribeSttPartials` — it never fires on a non-streaming session:

```ts
session.subscribeSttPartials(({ text, finalText }) => showInterim(text, finalText));
await session.startProcessSTT({ language: 'ko' });
const text = await session.stopProcessSTT();
```

When the STT type sets `end_of_turn_detection`, the provider detects utterance
boundaries itself: the microphone stays open for the whole conversation and each
committed utterance (one turn) is delivered as a whole `SttUtterance`. Subscribe
with `subscribeSttUtterances` **before** starting — without a subscriber there is
nowhere for utterances to go, so the call is rejected rather than dropping them
silently. (The interim partials within each utterance come from
`subscribeSttPartials`, linked by `utteranceSeq`.)

```ts
session.subscribeSttUtterances(async (utterance) => {
  for await (const chunk of session.processLLM({ message: utterance.text })) {
    if (chunk.type === 'message' && chunk.finish) session.processTTSTF(chunk.message);
  }
});

await session.startProcessSTT(); // mic stays open; utterances arrive via the subscriber
```

So `end_of_turn_detection` — not `mode` — is the value your UI branches on: a
microphone that stays open needs a live indicator rather than a press-and-hold
button, and each transcript arrives on the subscriber instead of as a return value.

::: warning
Streaming STT requires a backend serving `/api/v1/settings/stt_type/v2/`.
Against an older server every STT type is treated as `NON_STREAMING`.
:::

See [STT interaction modes](/v1.7/api/#stt-interaction-modes) for the full reference.

### Direct Speech — processTTSTF

Avatar speaks text directly without LLM. Useful for scripted greetings,
announcements, or guided messages.

```ts
session.processTTSTF('Welcome! How can I help you today?');
```

### Client tools — ChatTool

The `clientTools` array passed to `createSession()` is how the LLM calls back
into your app. Each entry is a `ChatTool`: a name, a description the model reads
to decide when to call it, a JSON-schema parameter spec, and the function to run.

```ts
import { ChatTool, createSession } from 'perso-interactive-sdk-web/client';

const weatherTool = new ChatTool(
  'get_weather',
  'Get current weather for a location',
  {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' }
    },
    required: ['location']
  },
  async (args) => {
    return { temperature: 22, condition: 'Sunny' };
  },
  false // executeOnly: true runs the tool without a follow-up LLM response
);

const session = await createSession({
  sessionId,
  width: 1920,
  height: 1080,
  clientTools: [weatherTool]
});
```

See [ChatTool](/v1.7/api/#chattool) for the argument shapes and a full interaction
trace.

### Legacy — processChat

::: warning Deprecated
`processChat()` predates the step-controlled pipeline and is marked
`@deprecated`. It still works, but new integrations should use the
[processLLM → processTTS → processSTF](#chat-recommended-—-processllm-→-processtts-→-processstf)
flow above.
:::

One call that runs LLM → TTS → lip-sync internally, with synthesis and lip-sync
handled server-side. Nothing is exposed between the steps, so you cannot read the
LLM response before it is spoken, substitute your own audio, or start playback on
the first TTS chunk — which is why the pipeline above is the recommended shape.

```ts
session.processChat('Hello!');
```

`processCustomChat()` belongs to the same family and is **deprecated**: use
`processTTSTF()` and manage history yourself with `getMessageHistory()`.

## Lifecycle & observability

```ts
session.setSrc(videoElement);        // bind remote video stream
session.subscribeChatStates(handler) // ChatState set updates
session.subscribeChatLog(handler);   // full chat log updates
session.setErrorHandler(handler);    // typed Error reporting
session.onClose((manual) => { ... }) // 200 close vs disconnect
await session.clearBuffer();         // barge-in: stop the avatar mid-sentence
session.stopSession();               // tear down WebRTC + media
```

`clearBuffer()` is what a "stop speaking" button calls. It drops the audio the
avatar has not spoken yet and also stops a live source `processSTF()` is still
consuming, so a barged-in turn ends instead of queueing behind the old one.

## Where to go next

- [Pipeline Recipes](/v1.7/guide/pipelines) — task-oriented, copy-paste recipes that
  compose these APIs into complete flows, with a pipeline-selection guide.
- [API Reference](/v1.7/api/) — full function/type signatures, return shapes, and
  error hierarchy.
- [README on npm](https://www.npmjs.com/package/perso-interactive-sdk-web) —
  quick install snippets and project links.
