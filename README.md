![](/logo.png)

<div align="center">
  <h1>Perso Interactive SDK</h1>
  <p>Prototype and compare Perso Interactive integrations across SvelteKit, Vanilla JS, and TypeScript demos.</p>
</div>

<p align="center">
  <img alt="SDK Version" src="https://img.shields.io/badge/SDK-1.0.0-5d3fd3?style=for-the-badge&labelColor=151515" />
  <img alt="Node 20+" src="https://img.shields.io/badge/Node-20%2B-3cba92?style=for-the-badge&labelColor=151515" />
  <img alt="pnpm workspace" src="https://img.shields.io/badge/pnpm-workspace-f6921e?style=for-the-badge&labelColor=151515" />
  <img alt="Platforms" src="https://img.shields.io/badge/Platforms-Web%20%7C%20WebRTC-00b4d8?style=for-the-badge&labelColor=151515" />
</p>

<p align="center">
  <a href="#how-to-run">Get Started</a>
  &nbsp;•&nbsp;
  <a href="#sample-app-guide">Sample Apps</a>
  &nbsp;•&nbsp;
  <a href="#using-the-perso-interactive-sdk-type-in-typescript">Type Definitions</a>
  &nbsp;•&nbsp;
  <a href="#quick-look">Quick Look</a>
</p>

---

# Perso Interactive SDK

Provides Perso Interactive Web SDK and demo apps.

### embeded code

```html
<script defer src="https://cdn.jsdelivr.net/gh/perso-ai/perso-interactive-sdk-web/core/1.0.0/perso-interactive-sdk.js"></script>
```

### **Demo App Spec**

- Sveltekit
- VanlliaJS
- Typescript

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

3.  Start any demo with the dedicated script (each command runs from the repo root):
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

- **apps/svelte (`@perso-interactive-sdk-web/app-svelte`)**  
  Before running, fill in `persoInteractiveApiKey` and API server information in `src/lib/constant.ts`, then run `pnpm svelte`. Session creation is handled in `src/routes/session/+server.ts`.

  ```ts
  // .env
  PERSO_INTERACTIVE_API_KEY = "YOUR API KEY";
  // or
  // constant.ts
  export const persoInteractiveApiKey = "YOUR API KEY";
  ```

- **apps/vanilla (`@perso-interactive-sdk-web/app-vanilla`)**  
  An HTML/JS demo powered by Vite. Run `pnpm vanilla` to see the basic UI and SDK integration.

- **apps/typescript (`@perso-interactive-sdk-web/app-typescript`)**  
  TypeScript version of the Vanilla demo. Run `pnpm typescript` to see the same UI with type support.

## Using the Perso Interactive SDK Type in TypeScript

The SDK ships a global type definition file at [`perso-interactive-sdk.d.ts`](https://github.com/perso-ai/perso-interactive-sdk-web/blob/main/core/1.0.0/perso-interactive-sdk.d.ts), which exposes the `PersoInteractive` namespace (session helpers, `ChatState`, `ChatTool`, error classes, etc.). To use it in any TypeScript app:

Create or update an ambient declaration (e.g., `src/app.d.ts`) with a triple-slash reference to the SDK d.ts.

```ts
// `app.d.ts` or `global.d.ts`
/// <reference types="/perso-interactive-sdk.d.ts" />
```

If you are using `perso-interactive-sdk.d.ts` in your project, copy the file and write `reference` at the top of `app.d.ts` or `global.d.ts` to gain typing access to `PersoInteractive`.

**Exports**

- `PersoUtil`: thin wrappers over the REST endpoints (`getLLMs`, `getModelStyles`, `getBackgroundImages`, `getTTSs`, `getSTTs`, `getPrompts`, `getDocuments`, `getMcpServers`, `getSessionInfo`, `sessionEvent`). All helpers accept `(apiServerUrl, apiKey)` and return parsed JSON with SDK-specific typings.
- `createSessionId` / `getIntroMessage`: shared helpers that encapsulate the auth headers and payload format needed before the web client calls `PersoInteractive.createSession`.
- `ApiError`: an error subclass thrown when the HTTP response is not `2xx`. It carries `status`, `code`, `detail`, and `attr` fields coming from the Perso API so you can map failures to user-friendly responses.

## Session flow overview

1. Collect the Perso Interactive API server URL and API key from the operator.
2. Call `PersoInteractive.getAllSettings` to fetch LLM, TTS/STT, model style, prompt, document, background, toolcalling and MCP server options for the UI.
3. When the user clicks **START**, invoke `createSessionId` with the selected options (plus optional padding, voice chat toggle, and client tool selections), then `createSession` to bind the media stream to a `<video>` element.
4. Subscribe to chat logs and chat states to render transcripts, voice/speech controls, and availability indicators. Use client tools for app-specific actions and handle SDK errors via the provided callbacks.

## Quick Look

### Server Side

#### 1. Create Session ID

```ts
// 1. Initialize SDK
const apiServerUrl = "https://live-api.perso.ai";
const apiKey = "YOUR API KEY";

// 2. Fetch features and config setting
const configs = {
  llm_type: await getLLMs(apiServerUrl, apiKey),
  tts_type: await getTTSs(apiServerUrl, apiKey),
  stt_type: await getSTTs(apiServerUrl, apiKey),
  model_style: await getModelStyles(apiServerUrl, apiKey),
  background_image: await getBackgroundImages(apiServerUrl, apiKey),
  mcp_servers: await getMcpServers(apiServerUrl, apiKey),
  prompt: await getPrompts(apiServerUrl, apiKey),
  document: await getDocuments(apiServerUrl, apiKey),
  background_imge,
};

// 3. Create session id
const response = await fetch(`${apiServerUrl}/api/v1/session/`, {
  body: JSON.stringify({
    capability: ["LLM", "STF_WEBRTC"],
    ...configs
    padding_left,
    padding_top,
    padding_height,
  }),
  headers: {
    "PersoLive-APIKey": apiKey,
    "Content-Type": "application/json",
  },
  method: "POST",
});

let json = await response.json();
const sessionId = json.session_id;

return sessionId;
```

### 2. Create Session WebRTC(Browser)

```ts
// 3. Create PersoInteractive WebRTC Session Info
const session = await PersoInteractive.createSession(
  apiServerUrl,
  sessionId,
  chatbotWidth,
  chatbotHeight,
  enableVoiceChat,
  introMessage ?? "", // [Get] getPrompts(...)
  clientTools ?? [] // Refer to the following reference
);
```

### Client Side

### 1. Create Session ID + Create Session WebRTC

```ts
// 1. Initialize SDK
const apiServerUrl = "https://live-api.perso.ai";
const apiKey = "YOUR API KEY";

// 2. Fetch features and get session id
const sessionId = await PersoInteractive.createSessionId(apiServerUrl, apiKey, {
  using_stf_webrtc: true,
  model_style, // [Get] getModelStyles(...)
  prompt, // [Get] getPrompts(...)
  llm_type, // [Get] getLLMs(...)
  tts_type, // [Get] getTTSs(...)
  stt_type, // [Get] getSTTs(...)
  document, // [Get] getDocuments(...)
  background_image, // [Get] getBackgroundImages(...)
  mcp_servers, // [Get] getMcpServers(...)
  padding_left,
  padding_top,
  padding_height,
});

// 3. Create PersoInteractive WebRTC Session Info
const session = await PersoInteractive.createSession(
  apiServerUrl,
  sessionId,
  chatbotWidth,
  chatbotHeight,
  enableVoiceChat,
  introMessage ?? "", // [Get] getPrompts(...)
  clientTools ?? [] // Refer to the following reference
);
...
```

> reference) [Tool calling example](https://github.com/perso-ai/perso-interactive-sdk-web/blob/dabcd677b3e610b335dca16536ec25fba501455c/apps/svelte/src/lib/perso-interactive.ts#L14)

# License

Perso Interactive SDK for Web is commercial software. [Contact our sales team](https://perso.ai/contact).
