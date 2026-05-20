# Getting Started

The Perso Interactive SDK lets you embed a real-time, WebRTC-based AI avatar
session in a web app, with LLM chat, TTS/STT, and client-side tool calls.

This page is a short orientation. For the complete API surface, see the
[API Reference](/api/).

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

## Minimal flow

1. Fetch settings (LLMs, TTSs, STTs, model styles, prompts, …) from the API
   server using the helpers under `PersoInteractive`.
2. On your server, call `createSessionId(apiServer, apiKey, config)` and return
   the id to the browser.
3. In the browser, call `createSession(apiServer, sessionId, width, height, clientTools)`.
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

// 3. Animate avatar with audio
if (audioBlob) {
  await session.processSTF(audioBlob, audioBlob.type, llmResponse);
}
```

With voice input (STT → LLM → TTS → STF):

```ts
await session.startProcessSTT();
const text = await session.stopProcessSTT();
// Pass `text` to the processLLM pipeline above
```

### Direct Speech — processTTSTF

Avatar speaks text directly without LLM. Useful for scripted greetings,
announcements, or guided messages.

```ts
session.processTTSTF('Welcome! How can I help you today?');
```

## Lifecycle & observability

```ts
session.setSrc(videoElement);        // bind remote video stream
session.subscribeChatStates(handler) // ChatState set updates
session.subscribeChatLog(handler);   // full chat log updates
session.setErrorHandler(handler);    // typed Error reporting
session.onClose((manual) => { ... }) // 200 close vs disconnect
session.stopSession();               // tear down WebRTC + media
```

## Where to go next

- [API Reference](/api/) — full function/type signatures, return shapes, and
  error hierarchy.
- [README on npm](https://www.npmjs.com/package/perso-interactive-sdk-web) —
  quick install snippets and project links.
