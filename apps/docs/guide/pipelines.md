# Pipeline Recipes

Task-oriented recipes that compose `Session` methods into complete flows. Each
recipe is a copy-paste function with a "Best for" note. For an API-by-API
orientation see [Getting Started](/guide/getting-started); for full signatures
and return shapes see the [API Reference](/api/).

All recipes assume a session created as in
[Session lifecycle boilerplate](#session-lifecycle-boilerplate) below.

## Building blocks (Session methods)

| Method | Input → Output |
| --- | --- |
| `session.processLLM(options)` | text → `AsyncGenerator<LLMStreamChunk>` |
| `session.processTTS(text, options?)` | text → audio `Blob` |
| `session.processStreamingTTS(text)` | text → PCM chunk stream (streamable voices only) |
| `session.processSTF(audio, format?, message?)` | audio → avatar lip-sync (`Promise<void>`) |
| `session.processTTSTF(message)` | text → TTS + STF + history + chat log |
| `session.startProcessSTT(options?)` | start microphone capture |
| `session.stopProcessSTT(language?)` | stop capture → transcribed text |
| `session.subscribeSttPartials(cb)` | interim hypotheses on a streaming type (returns unsubscribe) |
| `session.subscribeSttUtterances(cb)` | committed utterances in continuous (end-of-turn) STT mode |
| `session.transcribeAudio(file, language?)` | audio file → text (no session mic) |
| `session.subscribeChatStates(cb)` | observe `Set<ChatState>` changes |
| `session.subscribeChatLog(cb)` | observe chat messages |
| `session.setErrorHandler(cb)` | handle typed errors |
| `session.onClose(cb)` | detect session close |
| `session.clearBuffer()` | barge-in: stop the avatar mid-speech |
| `session.setSrc(video)` | bind remote stream to a `<video>` element |
| `session.stopSession()` | tear down WebRTC + media |

::: warning Deprecated
`processChat()`, `processCustomChat()`, `startVoiceChat()`, and `stopVoiceChat()`
are `@deprecated`. Prefer the step-controlled pipeline (`processLLM` →
`processTTS` → `processSTF`) or `processTTSTF()`. See
[Legacy](#legacy-deprecated) at the end.
:::

## Choosing a pipeline

```
Need avatar speech?
├── Yes
│   ├── AI response needed?
│   │   ├── Yes
│   │   │   ├── Need to read/transform the response, or start playback early?
│   │   │   │   ├── Yes → Recipe 1 (Text chat, streaming: LLM → TTS → STF)
│   │   │   │   │        or Recipe 2 (sequential) for debugging
│   │   │   │   └── No  → Recipe 3 (LLM → processTTSTF)
│   │   │   └── Voice input? wrap any of the above with Recipe 5 / 6
│   │   └── No (pre-written text) → Recipe 7 (processTTSTF)
│   └── Want audio without the avatar? → Recipe 4 (streaming TTS playback)
└── No
    ├── Need an AI response only? → Recipe 9 (LLM only)
    ├── Need speech transcription? → Recipe 8 (STT only)
    └── Need to observe tool calls? → Recipe 10 (LLM + tool calling)
```

## Recipe 1: Text chat, streaming (LLM → TTS → STF)

Enqueues TTS/STF as each LLM chunk arrives, so the avatar starts speaking before
the full response is generated. Lowest time-to-first-speech.

```ts
async function textChatStreaming(session: Session, text: string): Promise<string> {
  const generator = session.processLLM({ message: text });
  const spoken: string[] = [];
  let queue = Promise.resolve();
  let full = '';

  for await (const chunk of generator) {
    if (chunk.type === 'message') {
      full = chunk.message;
      const fresh = chunk.chunks.slice(spoken.length);
      spoken.push(...fresh);

      for (const c of fresh) {
        if (c.trim().length === 0) continue;
        queue = queue.then(async () => {
          const audioBlob = await session.processTTS(c);
          if (audioBlob) await session.processSTF(audioBlob, undefined, c);
        });
      }
    } else if (chunk.type === 'error') {
      console.error('LLM error:', chunk.error);
      return '';
    }
  }

  await queue;
  return full;
}
```

`processSTF()` always streams: the clip is decoded in the browser and sent as PCM,
so lip-sync starts before the whole clip is transmitted. The second argument is a
legacy format hint and is **ignored** (the container is detected from the bytes);
the call resolves with `void`.

Best for: production text chat with low-latency avatar response.

## Recipe 2: Text chat, sequential (LLM → TTS → STF)

Collects the whole LLM response first, then speaks it. Simpler to reason about
when debugging or when you post-process the text before speaking.

```ts
async function textChatSequential(session: Session, text: string) {
  const generator = session.processLLM({ message: text });
  let response = '';

  for await (const chunk of generator) {
    if (chunk.type === 'message' && chunk.finish) response = chunk.message;
    else if (chunk.type === 'error') return console.error('LLM error:', chunk.error);
  }
  if (response.trim().length === 0) return;

  const audioBlob = await session.processTTS(response);
  if (audioBlob) await session.processSTF(audioBlob, undefined, response);
}
```

Best for: debugging, or transforming the LLM response before speaking.

## Recipe 3: Text chat via TTSTF (LLM → processTTSTF)

`processTTSTF()` handles TTS, STF, history, and chat log in one call. Use it when
you do not need separate control over the TTS and STF steps.

Call it once with the finished response. Each `processTTSTF()` call appends its own
assistant entry to the history and chat log and speaks as one turn, so feeding it
partial LLM chunks would split one reply into many fragmented entries — collect the
response first. (When you do want to speak each chunk as it arrives, use Recipe 1,
which controls TTS and STF directly.)

```ts
async function textChatTTSTF(session: Session, text: string) {
  const generator = session.processLLM({ message: text });
  let response = '';

  for await (const chunk of generator) {
    if (chunk.type === 'message' && chunk.finish) response = chunk.message;
    else if (chunk.type === 'error') return console.error('LLM error:', chunk.error);
  }

  if (response.trim().length > 0) session.processTTSTF(response);
}
```

Best for: the common case — speak the AI response without touching the audio.

## Recipe 4: Streaming TTS playback (audio only, no avatar)

`processStreamingTTS()` resolves as soon as the stream is established and yields
PCM chunks, so you can play speech through Web Audio without the avatar. It
requires a voice whose TTS type reports `streamable: true`; every other case
rejects with `TTSNotStreamableError` before any request goes out, so fall back to
`processTTS()`.

```ts
import { PcmStreamDecoder, TTSNotStreamableError } from 'perso-interactive-sdk-web/client';

async function speakStreaming(session: Session, text: string) {
  try {
    const stream = await session.processStreamingTTS(text);
    if (!stream) return;
    const decoder = new PcmStreamDecoder();
    for await (const chunk of stream) {
      const samples = decoder.decode(chunk); // Float32Array in [-1, 1]
      // feed `samples` to playback at `stream.sampleRate` (24000, mono)
    }
  } catch (error) {
    if (error instanceof TTSNotStreamableError) {
      const audioBlob = await session.processTTS(text); // works on every voice
      // play `audioBlob`
    } else {
      throw error;
    }
  }
}
```

Decode with a single `PcmStreamDecoder` across the stream — chunk boundaries split
samples, so decoding a chunk alone turns speech into noise. Abandon a turn with
`await stream.cancel()`. See
[Streaming TTS (PCM)](/api/#streaming-tts-pcm) for the wire format and
[Only a streamable voice may stream](/api/#only-a-streamable-voice-may-stream)
for the gating rules.

Best for: voice-only playback, or driving your own audio UI.

## Recipe 5: Voice chat, press-to-talk (STT → LLM → speech)

Record an utterance, transcribe it on stop, then reuse any text-chat recipe.

```ts
async function voiceChat(session: Session) {
  await session.startProcessSTT({ language: 'en' });
  // ... user speaks; call on button release or voice-activity detection ...
  const userText = await session.stopProcessSTT();
  if (userText.trim().length === 0) return;

  await textChatStreaming(session, userText); // or textChatTTSTF(...)
}
```

Set the recognition language at `startProcessSTT({ language })`. On a **streaming**
STT type `stopProcessSTT(language)` ignores its argument — the language is fixed at
start — and only a non-streaming type reads it on stop, so declaring it at start is
the one form that works for both.

For interim results on a streaming STT type, subscribe with `subscribeSttPartials`:

```ts
session.subscribeSttPartials(({ text, finalText }) => showInterim(text, finalText));
await session.startProcessSTT({ language: 'ko' });
const userText = await session.stopProcessSTT();
```

The transport (recorded vs. streaming) is chosen from the session's STT
type — you do not select it. See
[STT interaction modes](/api/#stt-interaction-modes).

Best for: push-to-talk voice conversation.

## Recipe 6: Continuous voice (end-of-turn detection)

When the STT type sets `end_of_turn_detection`, the provider detects utterance
boundaries itself: the microphone stays open and each committed utterance arrives
on a subscriber as a whole `SttUtterance`. Subscribe **before** starting — without
a subscriber the call is rejected rather than dropping utterances.

```ts
session.subscribeSttUtterances(async (utterance) => {
  for await (const chunk of session.processLLM({ message: utterance.text })) {
    if (chunk.type === 'message' && chunk.finish) session.processTTSTF(chunk.message);
  }
});

await session.startProcessSTT(); // mic stays open; utterances arrive via the subscriber
```

Branch your UI on `end_of_turn_detection` (a live mic indicator instead of a
press-and-hold button), not on `mode`.

The subscriber is not awaited between utterances, so if a new utterance is committed
before the previous `processLLM` turn finishes, two turns run at once and their
history can interleave. For a strict one-at-a-time flow, serialize the callback
(chain a per-session promise) or drop incoming utterances while a turn is in
flight.

Best for: hands-free, always-listening conversation.

## Recipe 7: Direct speech (processTTSTF)

The avatar speaks pre-written text with no LLM involved.

```ts
session.processTTSTF('Welcome! How can I help you today?');
```

Best for: intro messages, announcements, scripted content.

## Recipe 8: STT only (speech → text)

Transcribe speech without any avatar output.

```ts
async function transcribe(session: Session, language?: string): Promise<string> {
  await session.startProcessSTT(language ? { language } : undefined);
  // ... user speaks ...
  return session.stopProcessSTT(language);
}
```

Passing `language` at both start and stop covers both STT modes: a streaming type
reads it at start, a non-streaming type reads it on stop.

To transcribe an existing audio file instead of the microphone, use
`session.transcribeAudio(file, language?)`.

Best for: speech input for search, forms, or custom processing.

## Recipe 9: LLM only (text → AI response)

Get an AI response without speaking it.

```ts
async function askLLM(session: Session, message: string): Promise<string> {
  for await (const chunk of session.processLLM({ message })) {
    if (chunk.type === 'message' && chunk.finish) return chunk.message;
    if (chunk.type === 'error') throw chunk.error;
  }
  return '';
}
```

Best for: text-only chat, background AI queries.

## Recipe 10: LLM with tool-call observation

Watch tool calls and results as the LLM streams. Client tools are registered on
`createSession()` via `clientTools`; see [Client tools](/guide/getting-started#client-tools-—-chattool).

```ts
async function llmWithTools(session: Session, message: string) {
  for await (const chunk of session.processLLM({ message })) {
    switch (chunk.type) {
      case 'message':
        if (chunk.finish) console.log('Complete:', chunk.message);
        break;
      case 'tool_call':
        console.log('Tool called:', chunk.tool_calls);
        break;
      case 'tool_result':
        console.log('Tool result:', chunk.tool_call_id, chunk.result);
        break;
      case 'error':
        return console.error('Error:', chunk.error);
    }
  }
}
```

Best for: debugging tool calls, or building a custom tool-result UI.

## Session lifecycle boilerplate

Common setup that wraps around any recipe above. The session id must come from
your server — never call `createSessionId` in the browser with a real API key.

```ts
import {
  createSession,
  getSessionInfo,
  ChatState,
  ApiError,
  LLMError,
  LLMStreamingResponseError,
  TTSError,
  TTSDecodeError,
  type Session,
} from 'perso-interactive-sdk-web/client';

// 1. Create the session (sessionId comes from your server endpoint)
const session = await createSession({
  sessionId,
  width: 1920,
  height: 1080,
  clientTools: [],
});

// 2. Bind the avatar video
session.setSrc(videoElement);

// 3. Subscribe to state, chat log, and errors
const unsubs: Array<() => void> = [];

unsubs.push(
  session.subscribeChatStates((states: Set<ChatState>) => {
    // update UI (RECORDING / LLM / TTS / SPEAKING ...)
  }),
);

unsubs.push(
  session.subscribeChatLog((chatLog) => {
    // render chat messages
  }),
);

session.setErrorHandler((err: Error) => {
  if (err instanceof LLMError) {
    if (err.underlyingError instanceof ApiError) console.error('LLM API error:', err.underlyingError);
    else if (err.underlyingError instanceof LLMStreamingResponseError)
      console.error('LLM streaming error:', err.underlyingError.description);
  } else if (err instanceof TTSError) {
    if (err.underlyingError instanceof ApiError) console.error('TTS API error:', err.underlyingError);
    else if (err.underlyingError instanceof TTSDecodeError)
      console.error('TTS decode error:', err.underlyingError.description);
  }
});

session.onClose((manualClosed: boolean) => {
  if (!manualClosed) {
    getSessionInfo({ sessionId }).then((info) => {
      if (info?.termination_reason) console.warn('Session ended:', info.termination_reason);
    });
  }
});

// 4. Drive interaction with any recipe above, e.g.
//    await textChatStreaming(session, 'Hello!');

// 5. Cleanup on unmount
unsubs.forEach((fn) => fn());
session.stopSession();
```

`clearBuffer()` is what a "stop speaking" button calls: it drops audio the avatar
has not spoken yet and stops a live source `processSTF()` is still consuming, so a
barged-in turn ends instead of queueing behind the old one.

## Error handling

Every recipe may surface errors. Use `setErrorHandler` for pipeline errors, and
catch the throwing calls (`processStreamingTTS`, `stopProcessSTT`) directly.

| Error | Underlying / meaning |
| --- | --- |
| `LLMError` | wraps `ApiError` (request failed) or `LLMStreamingResponseError` (streaming/server error); `.code` carries the LLM protocol error code |
| `TTSError` | wraps `ApiError` (request failed) or `TTSDecodeError` (audio decode failed); `.code` carries the TTS protocol error code |
| `TTSNotStreamableError` | `processStreamingTTS()` on a non-streamable voice — fall back to `processTTS()` |
| `STTError` | STT request failed (`code` names the cause) |
| `STFError` | avatar lip-sync (STF) failed |
| `ApiError` | a REST call returned a non-2xx response |

See the [error hierarchy](/api/) in the API Reference for the full list.

## Legacy (deprecated)

::: warning Deprecated
These predate the step-controlled pipeline and are kept only for backward
compatibility. New integrations should not use them.
:::

- `processChat(message)` — runs LLM → TTS → lip-sync internally with nothing
  exposed between steps. Use Recipe 1 or Recipe 3 instead.
- `processCustomChat(message)` — use `processTTSTF()` and manage history with
  `getMessageHistory()`.
- `startVoiceChat()` / `stopVoiceChat()` — use `startProcessSTT()` /
  `stopProcessSTT()` (Recipe 5).
