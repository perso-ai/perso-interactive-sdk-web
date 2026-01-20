![](/logo.png)

<div align="center">
  <h1>Perso Interactive SDK</h1>
  <p>Prototype and compare Perso Interactive integrations across SvelteKit, Vanilla JS, and TypeScript demos.</p>
</div>

<p align="center">
  <img alt="Node 20+" src="https://img.shields.io/badge/Node-20%2B-3cba92?style=for-the-badge&labelColor=151515" />
  <img alt="pnpm workspace" src="https://img.shields.io/badge/pnpm-workspace-f6921e?style=for-the-badge&labelColor=151515" />
  <img alt="Platforms" src="https://img.shields.io/badge/Platforms-Web%20%7C%20WebRTC-00b4d8?style=for-the-badge&labelColor=151515" />
</p>

<p align="center">
  <a href="#installation">Installation</a>
  &nbsp;•&nbsp;
  <a href="#how-to-run">Get Started</a>
  &nbsp;•&nbsp;
  <a href="#sample-app-guide">Sample Apps</a>
  &nbsp;•&nbsp;
  <a href="#quick-look">Quick Look</a>
  &nbsp;•&nbsp;
  <a href="./core/api-docs.md">API Reference</a>
</p>

---

# Perso Interactive SDK

Provides Perso Interactive Web SDK and demo apps.

### **Demo App Spec**

- Sveltekit
- VanlliaJS
- Typescript

## Installation

Install the SDK using your preferred package manager:

```bash
# npm
npm install perso-interactive-sdk-web

# yarn
yarn add perso-interactive-sdk-web

# pnpm
pnpm add perso-interactive-sdk-web
```

### Usage

**Client-side (browser):**

```ts
import {
  createSession,
  ChatTool,
  ChatState,
} from "perso-interactive-sdk-web/client";
```

**Server-side (Node.js/SvelteKit):**

```ts
import { createSessionId, getIntroMessage } from "perso-interactive-sdk-web/server";
```

## How to run

1.  [Install `nodejs`(+v20)](https://nodejs.org/ko/download) and [Install `pnpm`](https://pnpm.io/ko/installation):

    ```bash
      nvm install 20
    ```

    ```bash
      npm install -g pnpm
    ```

2.  Install dependencies once at the repo root:

    ```bash
      pnpm install
    ```

3.  Build the SDK:

    ```bash
      pnpm build
    ```

4.  Start any demo with the dedicated script (each command runs from the repo root):
    - SvelteKit app:
      ```bash
        pnpm svelte
      ```
    - Vanilla app:
      ```bash
        pnpm vanilla
      ```
    - TypeScript app:
      ```bash
        pnpm typescript
      ```

## Sample app guide

- **apps/svelte (`@perso-interactive-sdk-web-web/app-svelte`)**  
  Before running, fill in `persoInteractiveApiKey` and API server information in `src/lib/constant.ts`, then run `pnpm svelte`. Session creation is handled in `src/routes/session/+server.ts`.

  ```ts
  // .env
  PERSO_INTERACTIVE_API_KEY = "YOUR API KEY";
  // or
  // constant.ts
  export const persoInteractiveApiKey = "YOUR API KEY";
  ```

- **apps/vanilla (`@perso-interactive-sdk-web-web/app-vanilla`)**  
  An HTML/JS demo powered by Vite. Run `pnpm vanilla` to see the basic UI and SDK integration.

- **apps/typescript (`@perso-interactive-sdk-web-web/app-typescript`)**  
  TypeScript version of the Vanilla demo. Run `pnpm typescript` to see the same UI with type support.

## Session flow overview

1. Collect the Perso Interactive API server URL and API key from the operator.
2. Fetch configuration options using `getLLMs()`, `getTTSs()`, `getSTTs()`, `getModelStyles()`, `getPrompts()`, `getDocuments()`, `getBackgroundImages()`, and `getMcpServers()` for the UI.
3. When the user clicks **START**, invoke `createSessionId` with the selected options (plus optional padding, voice chat toggle, and client tool selections), then `createSession` to bind the media stream to a `<video>` element.
4. Subscribe to chat logs and chat states to render transcripts, voice/speech controls, and availability indicators. Use client tools for app-specific actions and handle SDK errors via the provided callbacks.

## Quick Look

### Server Side

#### 1. Create Session ID

```ts
// Import from server subpath
import { createSessionId, getIntroMessage } from "perso-interactive-sdk-web/server";

// 1. Initialize SDK
const apiServerUrl = "https://live-api.perso.ai";
const apiKey = "YOUR API KEY";

// 2. Create session id with configuration
const sessionId = await createSessionId(apiServerUrl, apiKey, {
  using_stf_webrtc: true,
  model_style, // Selected model style
  prompt, // Selected prompt
  llm_type, // Selected LLM
  tts_type, // Selected TTS
  stt_type, // Selected STT
  document, // Selected document
  background_image, // Selected background
  mcp_servers, // Selected MCP servers
  padding_left,
  padding_top,
  padding_height,
});

// 3. Get intro message (optional)
const introMessage = await getIntroMessage(apiServerUrl, apiKey, prompt);

return { sessionId, introMessage };
```

#### 2. Create Session WebRTC (Browser)

```ts
// Import from client subpath
import { createSession } from "perso-interactive-sdk-web/client";

// Create WebRTC session
const session = await createSession(
  apiServerUrl,
  sessionId,
  chatbotWidth,
  chatbotHeight,
  enableVoiceChat,
  introMessage ?? "",
  clientTools ?? [], // Refer to the following reference
);
```

### Client Side

> ⚠️ **Warning**: Using `createSessionId` on the client side is **not recommended**. This exposes your API KEY in the browser, making it vulnerable to theft. If your API KEY is compromised due to client-side implementation, the SDK provider assumes no responsibility. For security, please use server-side session creation instead.

#### 1. Create Session ID + Create Session WebRTC

```ts
// Import from client subpath
import {
  createSessionId,
  createSession,
  ChatTool,
  ChatState,
} from "perso-interactive-sdk-web/client";

// 1. Initialize SDK
const apiServerUrl = "https://live-api.perso.ai";
const apiKey = "YOUR API KEY";

// 2. Fetch features and get session id
const sessionId = await createSessionId(apiServerUrl, apiKey, {
  using_stf_webrtc: true,
  model_style, // Selected model style
  prompt, // Selected prompt
  llm_type, // Selected LLM
  tts_type, // Selected TTS
  stt_type, // Selected STT
  document, // Selected document
  background_image, // Selected background
  mcp_servers, // Selected MCP servers
  padding_left,
  padding_top,
  padding_height,
});

// 3. Create WebRTC Session
const session = await createSession(
  apiServerUrl,
  sessionId,
  chatbotWidth,
  chatbotHeight,
  enableVoiceChat,
  introMessage ?? "",
  clientTools ?? [], // Refer to the following reference
);
```

> reference) [Tool calling example](https://github.com/perso-ai/perso-interactive-sdk-web-web/blob/dabcd677b3e610b335dca16536ec25fba501455c/apps/svelte/src/lib/perso-interactive.ts#L14)

## API Reference

For detailed API documentation, see the **[API Reference](./core/api-docs.md)**.

# License

Perso Interactive SDK for Web is commercial software. [Contact our sales team](https://perso.ai/contact).
