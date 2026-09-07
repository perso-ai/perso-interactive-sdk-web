# Perso Interactive SDK Sample (Svelte)

SvelteKit implementation of the Perso Interactive SDK demo. The app renders a fully hosted perso-interactive surface together with the WebRTC/voice controls exposed by the SDK script.

## Target environment

- Visual Studio Code (recommended)
- Node.js v20.11.0 (minimum Node.js 20)

## File map

- `src/routes/+page.svelte` – entry page that loads the SDK and binds UI state
- `src/routes/session/+server.ts` – SvelteKit endpoint that creates chat sessions
- `src/hooks.server.ts` – server-side bootstrap that loads defaults (LLM, voice, prompt, etc.)
- `src/lib/constant.ts` – API server URL constant; reads the API key from the `PERSO_INTERACTIVE_API_KEY` environment variable
- `src/lib/perso-interactive.ts` – shared PersoInteractive config utilities and sample client tools
- `src/lib/components/*.svelte` – UI widgets (video, chat log, inputs, etc.)
- `src/global.css`, `public/favicon.png` – styling assets referenced by the root page
- `perso-interactive-sdk-web` – SDK package that exposes the client and server modules

## Development workflow

Install dependencies at the repository root, then run the Svelte dev server:

```bash
pnpm install
pnpm svelte
# open the browser automatically
pnpm svelte -- --open
```

Before starting the app, update the following files:

- `.env` (in `apps/svelte`): set `PERSO_INTERACTIVE_API_KEY=your-api-key`. `src/lib/constant.ts` reads it through SvelteKit's `$env/dynamic/private`, so the key never has to be hard-coded.
- `src/lib/constant.ts`: `persoInteractiveApiServerUrl` defaults to `https://platform.perso.ai`; change it only if you target another environment.
- `src/hooks.server.ts`: adjust `config` to match the LLM, TTS/STT engines, prompt, documents, background, MCP servers, and padding required for your environment.

## Production build

```bash
pnpm --filter @perso-interactive-sdk-web/app-svelte build
pnpm --filter @perso-interactive-sdk-web/app-svelte preview
```
