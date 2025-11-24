# Perso Interactive SDK Sample (Svelte)

SvelteKit implementation of the Perso Interactive SDK demo. The app renders a fully hosted perso-interactive surface together with the WebRTC/voice controls exposed by the SDK script.

## Target environment

- Visual Studio Code (recommended)
- Node.js v20.11.0 (minimum Node.js 20)

## File map

- `src/routes/+page.svelte` – entry page that loads the SDK and binds UI state
- `src/routes/session/+server.ts` – SvelteKit endpoint that creates chat sessions
- `src/hooks.server.ts` – server-side bootstrap that loads defaults (LLM, voice, prompt, etc.)
- `src/lib/constant.ts` – stores the API server URL and API key
- `src/lib/perso-interactive.ts` – shared PersoInteractive config utilities and sample client tools
- `src/lib/components/*.svelte` – UI widgets (video, chat log, inputs, etc.)
- `static/global.css`, `static/favicon.png` – styling assets referenced by the root page
- `@perso-interactive-sdk-web/perso-interactive-sdk` – internal package that exposes the global SDK types

## Development workflow

Install dependencies at the repository root, then run the Svelte dev server:

```bash
pnpm install
pnpm dev:svelte
# open the browser automatically
pnpm dev:svelte -- --open
```

Before starting the app, update the following files:

- `src/lib/constant.ts`: set `persoInteractiveApiServerUrl` and `persoInteractiveApiKey`.
- `src/hooks.server.ts`: adjust `config` to match the LLM, TTS/STT engines, prompt, documents, background, MCP servers, and padding required for your environment.

## Production build

```bash
pnpm --filter @perso-interactive-sdk-web/app-svelte build
pnpm --filter @perso-interactive-sdk-web/app-svelte preview
```
