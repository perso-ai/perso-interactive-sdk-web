# SDK API URL Defaults & Object Overloads — Design Spec

**Date:** 2026-05-21
**Status:** Approved for planning
**Scope:** `packages/perso-interactive-sdk` public API + four demo apps (svelte, nextjs, vanilla, typescript) + SDK docs

## 1. Problem

Every public SDK entry point currently requires the caller to pass `apiServer` as a positional first argument:

- `createSessionId(apiServer, apiKey, params|templateId)` (both `client/init.ts` and `server/init.ts`)
- `createSession(apiServer, sessionId, width, height, clientTools)` (`client/PersoInteractive.ts`)
- `getAllSettings(apiServer, apiKey)` and every individual `get*` helper in `shared/settings.ts`
- `getIntroMessage(apiServer, apiKey, promptId)` (both client and server)
- `makeTTS(apiServer, params)` and `getSessionInfo(apiServer, sessionId)`

Production users almost always target `https://platform.perso.ai`. Forcing them to repeat the URL at every call site is noise. Only stage/stable/custom test environments need to override it.

## 2. Goals

1. Production callers can use the SDK without ever typing a URL.
2. Stage/custom callers can override `apiServer` per call — explicitly, with no hidden state.
3. Every existing call site (apps, third-party integrators) keeps working unchanged. No breaking change.
4. Doc set (`core/api-docs.md`, `packages/perso-interactive-sdk/README.md`, root `README.md`) stays in sync.

## 3. Non-Goals

- No runtime context, module-level mutable defaults, or `setDefaultApiServer()` global setter. Default URL is resolved per call.
- No removal of the deprecated `createSession(..., enableVoiceChat, clientTools)` 6-arg overload. It stays as a positional-only path; the new object signature does not expose it.
- No changes to `core/1.0.0/`, `core/1.0.1/` (legacy SDK bundles).
- No changes to `PersoUtil.*` internal method signatures. The resolver runs at the public-API boundary; `PersoUtil` continues to receive a fully-resolved URL string.
- `apps/sdk-tester` and `apps/docs` are out of scope for this change. Only the four canonical demo apps named in CLAUDE.md are migrated.

## 4. Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Default URL strategy: stateless resolver, no runtime context | Hidden mutable defaults in a multi-tenant Node process / serverless lambda are a foot-gun. Test isolation stays trivial. |
| D2 | New shape: object overload added alongside existing positional overloads | Keeps backward compatibility; new code is URL-free; stage/custom callers pass `apiServer` per call. |
| D3 | `createSession` legacy boolean (`enableVoiceChat`) is **not** carried into the object signature | The object API stays clean; legacy callers keep using the positional 6-arg overload that is already `@deprecated`. |
| D4 | All 13 settings helpers + `makeTTS` + `getSessionInfo` get object overloads | Consistency — one rule for the whole surface, no per-function exceptions. |
| D5 | All four canonical demo apps migrate to the new object API | Dog-foods the new surface and demonstrates the recommended pattern. |
| D6 | Default URL constant lives in `shared/api-server.ts` and is re-exported as `DEFAULT_API_SERVER` from both `client` and `server` entry points | Lets advanced users reference the same constant for their own configuration. |

## 5. Architecture

### 5.1 Shared resolver (new module)

`packages/perso-interactive-sdk/src/shared/api-server.ts`:

```typescript
export const DEFAULT_API_SERVER = 'https://platform.perso.ai';

export function resolveApiServer(apiServer?: string): string {
  const url = apiServer ?? DEFAULT_API_SERVER;
  return url.replace(/\/+$/, '');
}
```

- Pure function, no I/O, no state.
- Strips trailing slashes so every downstream `${apiServer}/api/v1/...` template renders one canonical URL.
- `DEFAULT_API_SERVER` is re-exported from `src/client/PersoInteractive.ts` and `src/server/index.ts` (alongside the existing exports).

### 5.2 Call-site policy

Every public function that today takes `apiServer` as a positional argument:

1. Adds **one** object overload as the first declared overload (best IntelliSense surface for new callers).
2. Keeps **all** existing positional overloads.
3. In the implementation body, dispatches on `typeof firstArg === 'object'` to extract the relevant fields (`apiKey` may or may not be present — see §5.5 for the two shape families) or fall back to the positional path. Both paths call `resolveApiServer(...)` exactly once before any `fetch`/`PersoUtil` call.
4. Passes the resolved URL string into existing helpers (`PersoUtil.getX(resolved, apiKey, ...)`) — no change to internal signatures.

### 5.3 `createSessionId` — client & server

The body schema (`CreateSessionIdBody`) is unchanged. Two object shapes are supported:

```typescript
type CreateSessionIdObjectOptions =
  | { apiKey: string; params: CreateSessionIdBody; apiServer?: string }
  | { apiKey: string; sessionTemplateId: string; apiServer?: string };

export async function createSessionId(options: CreateSessionIdObjectOptions): Promise<string>;
export async function createSessionId(apiServer: string, apiKey: string, sessionTemplateId: string): Promise<string>;
export async function createSessionId(apiServer: string, apiKey: string, params: CreateSessionIdBody): Promise<string>;
```

Dispatch:

1. If first arg is `string` → positional path (legacy).
2. Else, `'sessionTemplateId' in options` → template path; otherwise → explicit-params path.
3. Both paths funnel into a single internal helper that takes `(resolvedApiServer, apiKey, paramsOrTemplateId)` and contains today's body-building logic.

The client variant retains its existing browser-side `console.warn` when `typeof window !== 'undefined'`; the server variant does not warn.

### 5.4 `createSession` (client)

Three overloads, declared in this order:

```typescript
type CreateSessionObjectOptions = {
  sessionId: string;
  width: number;
  height: number;
  clientTools: Array<ChatTool>;
  apiServer?: string;
};

export function createSession(options: CreateSessionObjectOptions): Promise<Session>;
export function createSession(apiServer: string, sessionId: string, width: number, height: number, clientTools: Array<ChatTool>): Promise<Session>;
/** @deprecated Legacy voice-chat mode. */
export function createSession(apiServer: string, sessionId: string, width: number, height: number, enableVoiceChat: boolean, clientTools: Array<ChatTool>): Promise<Session>;
```

Dispatch: first arg `object` → new path with `resolveApiServer(options.apiServer)`; first arg `string` → existing positional logic untouched (including the legacy boolean branch). The object path never carries `enableVoiceChat`.

### 5.5 Settings & related helpers (`shared/settings.ts`)

Every helper gets an object overload. Two shape families:

**With `apiKey`** (13 functions):
`getLLMs`, `getTTSs`, `getSTTs`, `getModelStyles`, `getBackgroundImages`, `getPrompts`, `getDocuments`, `getMcpServers`, `getTextNormalizations`, `getTextNormalization`, `getSessionTemplates`, `getSessionTemplate`, `getAllSettings`.

```typescript
export async function getLLMs(options: { apiKey: string; apiServer?: string }): Promise<...>;
export async function getLLMs(apiServer: string, apiKey: string): Promise<...>;
```

For the two that take an extra positional arg today:

```typescript
export async function getTextNormalization(options: { apiKey: string; configId: string; apiServer?: string }): Promise<TextNormalizationDownload>;
export async function getTextNormalization(apiServer: string, apiKey: string, configId: string): Promise<TextNormalizationDownload>;

export async function getSessionTemplate(options: { apiKey: string; sessionTemplateId: string; apiServer?: string }): Promise<SessionTemplate>;
export async function getSessionTemplate(apiServer: string, apiKey: string, sessionTemplateId: string): Promise<SessionTemplate>;
```

**Without `apiKey`** (`makeTTS`, `getSessionInfo`):

```typescript
export async function makeTTS(options: {
  sessionId: string;
  text: string;
  locale?: string;
  output_format?: string;
  apiServer?: string;
}): Promise<{ audio: string }>;
export async function makeTTS(apiServer: string, params: { sessionId: string; text: string; locale?: string; output_format?: string }): Promise<{ audio: string }>;

export async function getSessionInfo(options: { sessionId: string; apiServer?: string }): Promise<...>;
export async function getSessionInfo(apiServer: string, sessionId: string): Promise<...>;
```

`getAllSettings`'s object path is implemented as `Promise.all` over the object-overload calls of each individual helper (no behavior change in the underlying URLs / 9-call fan-out).

### 5.6 `getIntroMessage` — client & server

Same shape pattern as the settings helpers:

```typescript
export async function getIntroMessage(options: { apiKey: string; promptId: string; apiServer?: string }): Promise<string>;
export async function getIntroMessage(apiServer: string, apiKey: string, promptId: string): Promise<string>;
```

## 6. Migration Plan

### 6.1 SDK package

1. Add `shared/api-server.ts` with `DEFAULT_API_SERVER` and `resolveApiServer`.
2. Modify `client/init.ts`, `server/init.ts`, `client/PersoInteractive.ts`, `shared/settings.ts` per §5.
3. Re-export `DEFAULT_API_SERVER` from `client/PersoInteractive.ts` and `server/index.ts`.

### 6.2 Demo apps

| App | File | Existing call | New call |
|-----|------|---------------|----------|
| svelte | `src/routes/session/+server.ts:6` | `createSessionId(persoInteractiveApiServerUrl, persoInteractiveApiKey, { ... })` | `createSessionId({ apiKey, params: { ... }, apiServer })` — `apiServer` only if a non-default URL is configured |
| svelte | `src/routes/session/+server.ts:23` | `getIntroMessage(url, key, promptId)` | `getIntroMessage({ apiKey, promptId, apiServer? })` |
| svelte | `src/lib/components/LiveChat.svelte:53` | `createSession(apiServer, sessionId, w, h, tools)` | `createSession({ sessionId, width, height, clientTools, apiServer? })` |
| nextjs | `src/app/api/session/route.ts:14,26` | same as svelte | object form |
| nextjs | `src/lib/server-config.ts:32` | `getAllSettings(url, key)` | `getAllSettings({ apiKey, apiServer? })` |
| nextjs | `src/components/LiveChat.tsx:72` | `createSession(...)` | object form |
| vanilla | `src/index.js`, `src/iife.js` | `getAllSettings`, `createSessionId`, `createSession` | object form |
| typescript | `src/index.ts:321,544,559` | `getAllSettings`, `createSessionId`, `createSession` | object form |

**Per-app `apiServer` policy:** if the app's current `apiServer` URL equals `https://platform.perso.ai` after trailing-slash normalization, the new call omits `apiServer`. Otherwise it forwards the configured URL. This is determined by reading each app's existing `constant.ts` / env-loading code; no env-var changes in this spec.

### 6.3 Docs

Per `.claude/rules/doc-sync.md`, the following must be updated in lockstep with the SDK change:

1. `core/api-docs.md` — function signatures, parameter tables, examples (source of truth).
2. `packages/perso-interactive-sdk/README.md` — quick-start examples, export summary table, install snippet.
3. `README.md` (root) — quick-start examples.
4. `packages/perso-interactive-sdk/example-guide/en/README.md` — if it references signatures, update.
5. JSDoc `@example` block at the top of `packages/perso-interactive-sdk/src/server/index.ts` — currently shows the positional form; update to the object form to match the recommended pattern.

Both new (object) and legacy (positional) forms are documented. Object form is presented first as recommended.

## 7. Error Handling

Unchanged behavior for all error paths:

- `ApiError`, `SessionCreationError`, `DoesNotExistError`, `NotInOrganizationError` are thrown from the same call sites as today.
- The resolver does not validate URL shape (no protocol check, no host check). An empty string `''` would be treated as a literal `apiServer = ''`; the spec explicitly does not guard against this — callers either pass a valid URL or omit the field.
- Trailing slash stripping is the only normalization. No lowercasing, no path stripping.

## 8. Testing Strategy

TDD per `.claude/rules/tdd.md` and `.claude/rules/auto-test.md`. RED tests written first; GREEN implementation passes them; REFACTOR cleans up.

### 8.1 New test files

- `packages/perso-interactive-sdk/src/__tests__/unit/api-server.unit.test.ts`
  - Returns `DEFAULT_API_SERVER` when no arg is provided.
  - Returns custom URL when provided.
  - Strips trailing slashes (one, multiple).
  - Does **not** modify a URL with no trailing slash.

### 8.2 Augmented existing test files

For each of `createSessionId` (client + server), `createSession`, settings helpers, `getIntroMessage`:

1. Object form with no `apiServer` → `fetch` is called against `https://platform.perso.ai/...`.
2. Object form with custom `apiServer` → `fetch` is called against that URL (after trailing-slash strip).
3. Existing positional form continues to call the same URL as today (regression assertion).
4. Object-form template path (`createSessionId({ apiKey, sessionTemplateId, ... })`) follows the same fetch sequence as today's positional template path.
5. For `createSession`: object form does not accept `enableVoiceChat`; legacy 6-arg positional still works.

### 8.3 Verification

After implementation:

```
pnpm build:sdk
pnpm test
pnpm tsc           # all apps type-check after demo migration
```

All three must pass before claiming completion.

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Overload resolution ambiguity if a positional `apiServer` argument happens to be an object | First positional arg is typed `string` in the existing overloads; object overload is a separate signature with a non-string first arg. TS resolution picks correctly. |
| Demo migration touches three layers (server route, components, libs) and four apps | Migration is mechanical and covered by `pnpm tsc` per app. Each app builds independently — failures localized. |
| Doc drift across four files | `.claude/rules/doc-sync.md` already mandates sync check. Spec lists all four docs explicitly in §6.3. |
| Users who currently rely on `apiServer` containing a sub-path (e.g., `https://platform.perso.ai/api`) | Out of scope; today's behavior is to template `${apiServer}/api/v1/...`, so a sub-path apiServer would already produce broken URLs. Spec preserves that exact behavior. |

## 10. Out-of-Scope Follow-ups

- Eventually deprecating the positional overloads (next major version).
- Migrating `apps/sdk-tester` to the new API.
- Adding a fluent client wrapper class (`new PersoClient({ apiKey, apiServer })`) — would be a separate design.
