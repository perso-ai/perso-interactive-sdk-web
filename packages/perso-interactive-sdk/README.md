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

The SDK provides two entry points:

### Server-side (`perso-interactive-sdk-web/server`)

Use this module in Node.js/SvelteKit/Next.js server environments to create sessions securely without exposing your API key.

```typescript
import { createSessionId, getIntroMessage } from "perso-interactive-sdk-web/server";

// Create a session on the server
const sessionId = await createSessionId(apiServer, apiKey, {
  using_stf_webrtc: true,
  model_style: "<model_style_name>",
  prompt: "<prompt_id>",
  llm_type: "<llm_name>",
  tts_type: "<tts_name>",
  stt_type: "<stt_name>",
});

// Get intro message for a prompt
const introMessage = await getIntroMessage(apiServer, apiKey, promptId);
```

> ⚠️ **Security Warning**: Never use `createSessionId` on the client-side. Exposing your API key in browser code can lead to unauthorized access and quota abuse. Always create sessions on the server and pass only the `sessionId` to the client.

### Client-side (`perso-interactive-sdk-web/client`)

Use this module in browser environments to create and manage interactive sessions.

```typescript
import {
  createSession,
  ChatTool,
  ChatState,
  getAllSettings,
} from "perso-interactive-sdk-web/client";

// Create a session (sessionId should come from server)
const session = await createSession(
  apiServer,
  sessionId,
  width,
  height,
  enableVoiceChat,
  clientTools,
);

// Bind to video element
session.setSrc(videoElement);

// Subscribe to chat states
session.subscribeChatStates((states) => {
  console.log("Chat states:", states);
});

// Subscribe to chat log
session.subscribeChatLog((chatLog) => {
  console.log("Chat log:", chatLog);
});

// Send a message
session.processChat("Hello!");

// Start voice chat
session.startVoiceChat();

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
  enableVoiceChat,
  [weatherTool],
);
```

### Browser (IIFE)

For direct browser usage via script tag:

```html
<script src="https://cdn.jsdelivr.net/npm/perso-interactive-sdk-web@2/dist/client/index.iife.js"></script>
<script>
  const session = await PersoInteractive.createSession(
    apiServer,
    sessionId,
    width,
    height,
    enableVoiceChat,
    []
  );
</script>
```

## API Reference

### Server Exports

| Export                                         | Description                    |
| ---------------------------------------------- | ------------------------------ |
| `createSessionId(apiServer, apiKey, params)`   | Create a new session ID        |
| `getIntroMessage(apiServer, apiKey, promptId)` | Get intro message for a prompt |
| `PersoUtilServer`                              | Low-level API utilities        |
| `ApiError`                                     | Error class for API errors     |

### Client Exports

| Export                                                                             | Description                                                |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `createSession(apiServer, sessionId, width, height, enableVoiceChat, clientTools)` | Create a session                                           |
| `Session`                                                                          | Session class                                              |
| `ChatTool`                                                                         | Client tool class                                          |
| `ChatState`                                                                        | Enum for chat states (RECORDING, LLM, ANALYZING, SPEAKING) |
| `getLLMs(apiServer, apiKey)`                                                       | Get available LLM providers                                |
| `getTTSs(apiServer, apiKey)`                                                       | Get available TTS providers                                |
| `getSTTs(apiServer, apiKey)`                                                       | Get available STT providers                                |
| `getModelStyles(apiServer, apiKey)`                                                | Get available avatar styles                                |
| `getBackgroundImages(apiServer, apiKey)`                                           | Get available backgrounds                                  |
| `getPrompts(apiServer, apiKey)`                                                    | Get available prompts                                      |
| `getDocuments(apiServer, apiKey)`                                                  | Get available documents                                    |
| `getMcpServers(apiServer, apiKey)`                                                 | Get available MCP servers                                  |
| `getAllSettings(apiServer, apiKey)`                                                | Get all settings at once                                   |
| `getSessionInfo(apiServer, sessionId)`                                             | Get session metadata                                       |
| `ApiError`                                                                         | Error class for API errors                                 |
| `LLMError`                                                                         | Error class for LLM errors                                 |
| `LLMStreamingResponseError`                                                        | Error class for streaming errors                           |

### Session Methods

| Method                          | Description                    |
| ------------------------------- | ------------------------------ |
| `setSrc(videoElement)`          | Bind session to video element  |
| `processChat(message)`          | Send a message to the LLM      |
| `processTTSTF(message)`         | Speak a message without LLM    |
| `startVoiceChat()`              | Start recording voice          |
| `stopVoiceChat()`               | Stop recording and send to STT |
| `clearBuffer()`                 | Cancel ongoing operations      |
| `changeSize(width, height)`     | Resize the avatar canvas       |
| `stopSession()`                 | Close the session              |
| `subscribeChatStates(callback)` | Subscribe to state changes     |
| `subscribeChatLog(callback)`    | Subscribe to chat log updates  |
| `setErrorHandler(callback)`     | Subscribe to errors            |
| `onClose(callback)`             | Subscribe to session close     |

## API Reference

For detailed API documentation, see [api-docs.md](../../core/api-docs.md).

## License

Apache-2.0
