# Perso Interactive SDK Sample (Typescript)

Static HTML/TypeScript implementation of the Perso Interactive SDK demo. The page loads the published SDK script directly and drives the experience without any framework dependencies while keeping the UI logic in `src/index.ts`.

## File map
- `src/index.html` – demo page and control panel
- `src/index.ts` – session orchestration, UI interactions, and client tool definitions written in TypeScript
- `src/global.css`, `src/*.png` – UI assets referenced by the page
- `https://perso-ai.github.io/livechat-sdk-web/core/1.0.0/perso-interactive-sdk.js` – hosted SDK script

## Development workflow
Install workspace dependencies at the repository root and launch the static dev server:
```bash
pnpm install
pnpm dev:typescript
```

When the page loads:
1. Enter the Perso Interactive API server URL and API key.
2. Click **Authenticate** to fetch the available LLM, TTS/STT, prompt, document, and MCP options.
3. Configure the desired session settings, padding, and client tools.
4. Press **START** to initialize Perso Interactive through the Web SDK.
