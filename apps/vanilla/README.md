# Perso Interactive SDK Sample (Vanilla)

Static HTML/JavaScript implementation of the Perso Interactive SDK demo. Two demo pages are provided: an ES Module version and an IIFE (script tag) version.

## File map

- `src/index.html` – ES Module demo page (loads SDK via `import`)
- `src/index.js` – session orchestration, UI interactions, and client tool definitions (ES Module)
- `src/iife.html` – IIFE demo page (loads SDK via `<script>` tag from jsDelivr CDN)
- `src/iife.js` – same functionality as `index.js`, using the global `PersoInteractive` namespace
- `src/global.css`, `src/*.png` – UI assets referenced by both pages

## Development workflow

Install workspace dependencies at the repository root and launch the static dev server:

```bash
pnpm install
pnpm vanilla
```

| Page      | URL                               | SDK loading                                                                                              |
| --------- | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| ES Module | `http://localhost:5173/`          | `import * as PersoInteractive from 'perso-interactive-sdk-web/client'`                                   |
| IIFE      | `http://localhost:5173/iife.html` | `<script src="https://cdn.jsdelivr.net/npm/perso-interactive-sdk-web@latest/dist/client/index.iife.js">` |

When the page loads:

1. Enter the Perso Interactive API server URL and API key.
2. Click **Authenticate** to fetch the available LLM, TTS/STT, prompt, document, and MCP options.
3. Configure the desired session settings, padding, and client tools.
4. Press **START** to initialize Perso Interactive through the Web SDK.
