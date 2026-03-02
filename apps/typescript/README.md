# Perso Interactive SDK Sample (Typescript)

Static HTML/TypeScript implementation of the Perso Interactive SDK demo. TypeScript version of the Vanilla demo with full type support, keeping the UI logic in `src/index.ts`.

## File map

- `src/index.html` – demo page and control panel
- `src/index.ts` – session orchestration, UI interactions, and client tool definitions written in TypeScript
- `src/global.css`, `src/*.png` – UI assets referenced by the page

## Development workflow

Install workspace dependencies at the repository root and launch the static dev server:

```bash
pnpm install
pnpm typescript
```

When the page loads:

1. Enter the Perso Interactive API server URL and API key.
2. Click **Authenticate** to fetch the available LLM, TTS/STT, prompt, document, and MCP options.
3. Configure the desired session settings, padding, and client tools.
4. Press **START** to initialize Perso Interactive through the Web SDK.
