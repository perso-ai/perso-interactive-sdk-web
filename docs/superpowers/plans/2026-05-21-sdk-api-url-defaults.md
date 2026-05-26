# SDK API URL Defaults & Object Overloads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add object-form overloads with a default `apiServer` (`https://platform.perso.ai`) across the SDK's public surface so production callers can omit the URL while stage/custom callers pass it explicitly per call, without breaking any existing positional call site.

**Architecture:** A new pure resolver (`shared/api-server.ts`) exposes `DEFAULT_API_SERVER` + `resolveApiServer(apiServer?)`. Every public function (`createSessionId`, `createSession`, `getIntroMessage`, all settings helpers, `makeTTS`, `getSessionInfo`) gets one object overload prepended to its existing positional overloads; the body dispatches on `typeof firstArg === 'object'`, runs the resolver once, then delegates to the existing internal logic. No runtime context, no shared mutable state.

**Tech Stack:** TypeScript (strict), Jest + ts-jest (jsdom), Rollup build (`pnpm build:sdk`), pnpm monorepo. Source of truth: `docs/superpowers/specs/2026-05-21-sdk-api-url-defaults-design.md`.

---

## File Map

**Create:**
- `packages/perso-interactive-sdk/src/shared/api-server.ts` — resolver + default constant
- `packages/perso-interactive-sdk/src/__tests__/unit/api-server.unit.test.ts` — resolver tests
- `packages/perso-interactive-sdk/src/__tests__/unit/client-init.unit.test.ts` — client init overloads
- `packages/perso-interactive-sdk/src/__tests__/unit/create-session.unit.test.ts` — `createSession` overload
- `packages/perso-interactive-sdk/src/__tests__/unit/settings.unit.test.ts` — settings overloads

**Modify (SDK):**
- `packages/perso-interactive-sdk/src/server/init.ts` — object overloads for `createSessionId`, `getIntroMessage`
- `packages/perso-interactive-sdk/src/client/init.ts` — object overloads for `createSessionId`, `getIntroMessage`
- `packages/perso-interactive-sdk/src/client/PersoInteractive.ts` — object overload for `createSession`; re-export `DEFAULT_API_SERVER`
- `packages/perso-interactive-sdk/src/server/index.ts` — re-export `DEFAULT_API_SERVER`; update JSDoc example
- `packages/perso-interactive-sdk/src/shared/settings.ts` — object overloads for all 13 settings helpers + `makeTTS` + `getSessionInfo`
- `packages/perso-interactive-sdk/src/__tests__/unit/init.unit.test.ts` — augment with object-form tests for server init

**Modify (demos):**
- `apps/svelte/src/routes/session/+server.ts`
- `apps/svelte/src/lib/components/LiveChat.svelte`
- `apps/nextjs/src/app/api/session/route.ts`
- `apps/nextjs/src/lib/server-config.ts`
- `apps/nextjs/src/components/LiveChat.tsx`
- `apps/vanilla/src/index.js`
- `apps/vanilla/src/iife.js`
- `apps/typescript/src/index.ts`

**Modify (docs):**
- `core/api-docs.md`
- `packages/perso-interactive-sdk/README.md`
- `README.md`
- `packages/perso-interactive-sdk/example-guide/en/README.md` (if it references signatures)

---

## Task 1: Resolver module

**Files:**
- Create: `packages/perso-interactive-sdk/src/shared/api-server.ts`
- Test: `packages/perso-interactive-sdk/src/__tests__/unit/api-server.unit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/perso-interactive-sdk/src/__tests__/unit/api-server.unit.test.ts`:

```typescript
import { DEFAULT_API_SERVER, resolveApiServer } from '../../shared/api-server';

describe('api-server (unit)', () => {
	it('exposes the production default URL', () => {
		expect(DEFAULT_API_SERVER).toBe('https://platform.perso.ai');
	});

	it('returns the default when no argument is provided', () => {
		expect(resolveApiServer()).toBe('https://platform.perso.ai');
	});

	it('returns the default when explicitly undefined', () => {
		expect(resolveApiServer(undefined)).toBe('https://platform.perso.ai');
	});

	it('returns the custom URL unchanged when it has no trailing slash', () => {
		expect(resolveApiServer('https://stage-platform.perso.ai')).toBe(
			'https://stage-platform.perso.ai'
		);
	});

	it('strips a single trailing slash', () => {
		expect(resolveApiServer('https://stage-platform.perso.ai/')).toBe(
			'https://stage-platform.perso.ai'
		);
	});

	it('strips multiple trailing slashes', () => {
		expect(resolveApiServer('https://stage-platform.perso.ai///')).toBe(
			'https://stage-platform.perso.ai'
		);
	});

	it('preserves non-trailing slashes', () => {
		expect(resolveApiServer('https://example.com/sub/path')).toBe(
			'https://example.com/sub/path'
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- api-server.unit.test`
Expected: FAIL with `Cannot find module '../../shared/api-server'`.

- [ ] **Step 3: Implement the resolver**

Create `packages/perso-interactive-sdk/src/shared/api-server.ts`:

```typescript
export const DEFAULT_API_SERVER = 'https://platform.perso.ai';

export function resolveApiServer(apiServer?: string): string {
	const url = apiServer ?? DEFAULT_API_SERVER;
	return url.replace(/\/+$/, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- api-server.unit.test`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/perso-interactive-sdk/src/shared/api-server.ts \
        packages/perso-interactive-sdk/src/__tests__/unit/api-server.unit.test.ts
git commit -m "feat(sdk): add DEFAULT_API_SERVER and resolveApiServer

Stateless resolver that applies the production default
('https://platform.perso.ai') when apiServer is omitted and
strips trailing slashes."
```

---

## Task 2: `createSessionId` object overload (server)

**Files:**
- Modify: `packages/perso-interactive-sdk/src/server/init.ts`
- Test: `packages/perso-interactive-sdk/src/__tests__/unit/init.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

Append the following `describe` block inside the top-level `describe('Init helpers (unit)', ...)` in `packages/perso-interactive-sdk/src/__tests__/unit/init.unit.test.ts` (place after the existing `describe('createSessionId', ...)`):

```typescript
describe('createSessionId (object overload)', () => {
	const params = {
		using_stf_webrtc: true,
		llm_type: 'gpt-4o',
		tts_type: 'polly',
		stt_type: 'whisper',
		model_style: 'studio',
		prompt: 'greeting'
	};

	beforeEach(() => {
		fetchSpy.mockResolvedValue({} as Response);
		jest.spyOn(PersoUtil, 'parseJson').mockResolvedValue({ session_id: 'sess-obj' } as any);
	});

	it('uses DEFAULT_API_SERVER when apiServer is omitted', async () => {
		const sessionId = await createSessionId({ apiKey, params: params as any });
		expect(sessionId).toBe('sess-obj');
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://platform.perso.ai/api/v1/session/',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('uses the explicit apiServer when provided', async () => {
		await createSessionId({
			apiKey,
			params: params as any,
			apiServer: 'https://stage-platform.perso.ai'
		});
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://stage-platform.perso.ai/api/v1/session/',
			expect.anything()
		);
	});

	it('strips trailing slash on the provided apiServer', async () => {
		await createSessionId({
			apiKey,
			params: params as any,
			apiServer: 'https://stage-platform.perso.ai/'
		});
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://stage-platform.perso.ai/api/v1/session/',
			expect.anything()
		);
	});

	it('supports the sessionTemplateId shape', async () => {
		const template = {
			capability: [{ name: 'STF_WEBRTC' }, { name: 'LLM' }],
			model_style: { name: 'studio', platform_type: 'webrtc' },
			prompt: { prompt_id: 'p1' },
			llm_type: { name: 'gpt-4o' },
			tts_type: { name: 'polly' },
			stt_type: { name: 'whisper' }
		};
		jest.spyOn(PersoUtil, 'getSessionTemplate').mockResolvedValue(template as any);

		const sessionId = await createSessionId({
			apiKey,
			sessionTemplateId: 'tmpl-1',
			apiServer: 'https://stage-platform.perso.ai'
		});
		expect(sessionId).toBe('sess-obj');
		expect(PersoUtil.getSessionTemplate).toHaveBeenCalledWith(
			'https://stage-platform.perso.ai',
			apiKey,
			'tmpl-1'
		);
	});

	it('does not break the existing positional overload', async () => {
		const sessionId = await createSessionId(apiServer, apiKey, params as any);
		expect(sessionId).toBe('sess-obj');
		expect(fetchSpy).toHaveBeenCalledWith(
			`${apiServer}/api/v1/session/`,
			expect.anything()
		);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- init.unit.test`
Expected: New tests FAIL (object signature not yet accepted; either type error during compile or runtime error treating object as string).

- [ ] **Step 3: Implement the object overload**

Edit `packages/perso-interactive-sdk/src/server/init.ts`. Replace the entire `export async function createSessionId(...)` overload block + implementation with:

```typescript
import { resolveApiServer } from '../shared/api-server';
// ...existing imports unchanged

type CreateSessionIdObjectOptions =
	| { apiKey: string; params: CreateSessionIdBody; apiServer?: string }
	| { apiKey: string; sessionTemplateId: string; apiServer?: string };

/**
 * @overload Object-form. Uses DEFAULT_API_SERVER when apiServer is omitted.
 */
export async function createSessionId(options: CreateSessionIdObjectOptions): Promise<string>;
export async function createSessionId(
	apiServer: string,
	apiKey: string,
	sessionTemplateId: string
): Promise<string>;
export async function createSessionId(
	apiServer: string,
	apiKey: string,
	params: CreateSessionIdBody
): Promise<string>;
export async function createSessionId(
	apiServerOrOptions: string | CreateSessionIdObjectOptions,
	apiKey?: string,
	paramsOrTemplateId?: CreateSessionIdBody | string
): Promise<string> {
	let resolvedApiServer: string;
	let resolvedApiKey: string;
	let resolvedParamsOrTemplateId: CreateSessionIdBody | string;

	if (typeof apiServerOrOptions === 'object') {
		const options = apiServerOrOptions;
		resolvedApiServer = resolveApiServer(options.apiServer);
		resolvedApiKey = options.apiKey;
		resolvedParamsOrTemplateId =
			'sessionTemplateId' in options ? options.sessionTemplateId : options.params;
	} else {
		resolvedApiServer = resolveApiServer(apiServerOrOptions);
		resolvedApiKey = apiKey as string;
		resolvedParamsOrTemplateId = paramsOrTemplateId as CreateSessionIdBody | string;
	}

	return await createSessionIdInternal(
		resolvedApiServer,
		resolvedApiKey,
		resolvedParamsOrTemplateId
	);
}

async function createSessionIdInternal(
	apiServer: string,
	apiKey: string,
	paramsOrTemplateId: CreateSessionIdBody | string
): Promise<string> {
	try {
		let params: CreateSessionIdBody;

		if (typeof paramsOrTemplateId === 'string') {
			const template = await PersoUtil.getSessionTemplate(apiServer, apiKey, paramsOrTemplateId);

			if (template.model_style.platform_type !== 'webrtc') {
				throw new Error(
					`SessionTemplate "${paramsOrTemplateId}" uses platform_type "${template.model_style.platform_type}", but only "webrtc" is supported`
				);
			}

			params = sessionTemplateToParams(template);
		} else {
			params = paramsOrTemplateId;
		}

		const body: CreateSessionIdBody & {
			capability: Array<'LLM' | 'STT' | 'TTS' | 'STF_WEBRTC'>;
		} = {
			capability: [],
			...params
		};

		if (params.using_stf_webrtc) {
			body.capability.push('STF_WEBRTC');
		}
		if (params?.llm_type) {
			body.capability.push('LLM');
			body.llm_type = params.llm_type;
		}
		if (params?.tts_type) {
			body.capability.push('TTS');
			body.tts_type = params.tts_type;
		}
		if (params?.stt_type) {
			body.capability.push('STT');
			body.stt_type = params.stt_type;
		}

		const response = await fetch(`${apiServer}/api/v1/session/`, {
			body: JSON.stringify(body),
			headers: {
				'PersoLive-APIKey': apiKey,
				'Content-Type': 'application/json'
			},
			method: 'POST'
		});

		const json = await PersoUtil.parseJson(response);
		return json.session_id as string;
	} catch (err) {
		throw wrapSessionCreationApiError(err);
	}
}
```

(The existing `sessionTemplateToParams` helper stays unchanged below.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- init.unit.test`
Expected: All tests PASS (original + 5 new).

- [ ] **Step 5: Commit**

```bash
git add packages/perso-interactive-sdk/src/server/init.ts \
        packages/perso-interactive-sdk/src/__tests__/unit/init.unit.test.ts
git commit -m "feat(sdk): add object overload to server createSessionId

New shape: createSessionId({ apiKey, params|sessionTemplateId, apiServer? }).
apiServer defaults to https://platform.perso.ai. Existing positional
overloads remain unchanged."
```

---

## Task 3: `getIntroMessage` object overload (server)

**Files:**
- Modify: `packages/perso-interactive-sdk/src/server/init.ts`
- Test: `packages/perso-interactive-sdk/src/__tests__/unit/init.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

Append the following `describe` block inside `describe('Init helpers (unit)', ...)`:

```typescript
describe('getIntroMessage (object overload)', () => {
	const prompts = [
		{ prompt_id: 'p1', intro_message: 'hello' },
		{ prompt_id: 'p2', intro_message: 'world' }
	];

	beforeEach(() => {
		jest.spyOn(PersoUtil, 'getPrompts').mockResolvedValue(prompts as any);
	});

	it('uses DEFAULT_API_SERVER when apiServer is omitted', async () => {
		const message = await getIntroMessage({ apiKey, promptId: 'p1' });
		expect(message).toBe('hello');
		expect(PersoUtil.getPrompts).toHaveBeenCalledWith(
			'https://platform.perso.ai',
			apiKey
		);
	});

	it('uses the explicit apiServer when provided', async () => {
		await getIntroMessage({
			apiKey,
			promptId: 'p2',
			apiServer: 'https://stage-platform.perso.ai/'
		});
		expect(PersoUtil.getPrompts).toHaveBeenCalledWith(
			'https://stage-platform.perso.ai',
			apiKey
		);
	});

	it('does not break the existing positional overload', async () => {
		const message = await getIntroMessage(apiServer, apiKey, 'p1');
		expect(message).toBe('hello');
		expect(PersoUtil.getPrompts).toHaveBeenCalledWith(apiServer, apiKey);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- init.unit.test`
Expected: New tests FAIL.

- [ ] **Step 3: Implement the object overload**

In `packages/perso-interactive-sdk/src/server/init.ts`, replace the existing `getIntroMessage` export with:

```typescript
type GetIntroMessageObjectOptions = {
	apiKey: string;
	promptId: string;
	apiServer?: string;
};

export async function getIntroMessage(options: GetIntroMessageObjectOptions): Promise<string>;
export async function getIntroMessage(
	apiServer: string,
	apiKey: string,
	promptId: string
): Promise<string>;
export async function getIntroMessage(
	apiServerOrOptions: string | GetIntroMessageObjectOptions,
	apiKey?: string,
	promptId?: string
): Promise<string> {
	let resolvedApiServer: string;
	let resolvedApiKey: string;
	let resolvedPromptId: string;

	if (typeof apiServerOrOptions === 'object') {
		resolvedApiServer = resolveApiServer(apiServerOrOptions.apiServer);
		resolvedApiKey = apiServerOrOptions.apiKey;
		resolvedPromptId = apiServerOrOptions.promptId;
	} else {
		resolvedApiServer = resolveApiServer(apiServerOrOptions);
		resolvedApiKey = apiKey as string;
		resolvedPromptId = promptId as string;
	}

	try {
		const prompts = (await PersoUtil.getPrompts(
			resolvedApiServer,
			resolvedApiKey
		)) as PromptMetadata[];
		const prompt = prompts.find((item) => item.prompt_id === resolvedPromptId);

		if (!prompt) {
			throw new Error(`Prompt (${resolvedPromptId}) not found`, { cause: 404 });
		}

		return prompt.intro_message;
	} catch (err: unknown) {
		if (err instanceof ApiError) {
			throw new Error(err.detail, { cause: err.errorCode ?? 500 });
		}

		throw err;
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- init.unit.test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/perso-interactive-sdk/src/server/init.ts \
        packages/perso-interactive-sdk/src/__tests__/unit/init.unit.test.ts
git commit -m "feat(sdk): add object overload to server getIntroMessage

getIntroMessage({ apiKey, promptId, apiServer? }) defaults apiServer
to https://platform.perso.ai."
```

---

## Task 4: `createSessionId` + `getIntroMessage` object overload (client)

**Files:**
- Modify: `packages/perso-interactive-sdk/src/client/init.ts`
- Test (create): `packages/perso-interactive-sdk/src/__tests__/unit/client-init.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/perso-interactive-sdk/src/__tests__/unit/client-init.unit.test.ts`:

```typescript
import { PersoUtil } from '../../shared/perso_util';
import { createSessionId, getIntroMessage } from '../../client/init';

const apiServer = 'https://api.example.com';
const apiKey = 'perso-key';

describe('Client init helpers (unit)', () => {
	let fetchSpy: jest.SpyInstance;
	let warnSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.restoreAllMocks();
		if (!globalThis.fetch) {
			(globalThis as any).fetch = jest.fn();
		}
		fetchSpy = jest.spyOn(globalThis, 'fetch');
		warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	describe('createSessionId (object overload)', () => {
		const params = {
			using_stf_webrtc: true,
			llm_type: 'gpt-4o',
			tts_type: 'polly',
			stt_type: 'whisper',
			model_style: 'studio',
			prompt: 'greeting'
		};

		beforeEach(() => {
			fetchSpy.mockResolvedValue({} as Response);
			jest.spyOn(PersoUtil, 'parseJson').mockResolvedValue({ session_id: 'sess-obj' } as any);
		});

		it('uses DEFAULT_API_SERVER when apiServer is omitted', async () => {
			await createSessionId({ apiKey, params: params as any });
			expect(fetchSpy).toHaveBeenCalledWith(
				'https://platform.perso.ai/api/v1/session/',
				expect.anything()
			);
		});

		it('uses the explicit apiServer when provided', async () => {
			await createSessionId({
				apiKey,
				params: params as any,
				apiServer: 'https://stage-platform.perso.ai/'
			});
			expect(fetchSpy).toHaveBeenCalledWith(
				'https://stage-platform.perso.ai/api/v1/session/',
				expect.anything()
			);
		});

		it('emits a browser warning (window is defined under jsdom)', async () => {
			await createSessionId({ apiKey, params: params as any });
			expect(warnSpy).toHaveBeenCalled();
		});

		it('does not break the existing positional overload', async () => {
			await createSessionId(apiServer, apiKey, params as any);
			expect(fetchSpy).toHaveBeenCalledWith(
				`${apiServer}/api/v1/session/`,
				expect.anything()
			);
		});
	});

	describe('getIntroMessage (object overload)', () => {
		const prompts = [{ prompt_id: 'p1', intro_message: 'hello' }];

		beforeEach(() => {
			jest.spyOn(PersoUtil, 'getPrompts').mockResolvedValue(prompts as any);
		});

		it('uses DEFAULT_API_SERVER when apiServer is omitted', async () => {
			const message = await getIntroMessage({ apiKey, promptId: 'p1' });
			expect(message).toBe('hello');
			expect(PersoUtil.getPrompts).toHaveBeenCalledWith(
				'https://platform.perso.ai',
				apiKey
			);
		});

		it('uses the explicit apiServer when provided', async () => {
			await getIntroMessage({
				apiKey,
				promptId: 'p1',
				apiServer: 'https://stage-platform.perso.ai'
			});
			expect(PersoUtil.getPrompts).toHaveBeenCalledWith(
				'https://stage-platform.perso.ai',
				apiKey
			);
		});

		it('does not break the existing positional overload', async () => {
			const message = await getIntroMessage(apiServer, apiKey, 'p1');
			expect(message).toBe('hello');
			expect(PersoUtil.getPrompts).toHaveBeenCalledWith(apiServer, apiKey);
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- client-init.unit.test`
Expected: Tests FAIL (object signature not accepted).

- [ ] **Step 3: Implement the object overloads**

In `packages/perso-interactive-sdk/src/client/init.ts`:

a) Add the resolver import at the top with existing imports:

```typescript
import { resolveApiServer } from '../shared/api-server';
```

b) Replace the existing `createSessionId` overload + implementation with:

```typescript
type CreateSessionIdObjectOptions =
	| { apiKey: string; params: CreateSessionIdBody; apiServer?: string }
	| { apiKey: string; sessionTemplateId: string; apiServer?: string };

/**
 * @overload Object-form. Uses DEFAULT_API_SERVER when apiServer is omitted.
 */
export async function createSessionId(options: CreateSessionIdObjectOptions): Promise<string>;
export async function createSessionId(
	apiServer: string,
	apiKey: string,
	sessionTemplateId: string
): Promise<string>;
export async function createSessionId(
	apiServer: string,
	apiKey: string,
	params: CreateSessionIdBody
): Promise<string>;
export async function createSessionId(
	apiServerOrOptions: string | CreateSessionIdObjectOptions,
	apiKey?: string,
	paramsOrTemplateId?: CreateSessionIdBody | string
): Promise<string> {
	if (typeof window !== 'undefined') {
		console.warn(
			'[perso-interactive-sdk-web] WARNING: createSessionId is being called from the browser. ' +
				'This exposes your API key and is not recommended for production. ' +
				"Use server-side session creation with 'perso-interactive-sdk-web/server' instead. " +
				'See: https://github.com/perso-ai/perso-interactive-sdk-web#server-side'
		);
	}

	let resolvedApiServer: string;
	let resolvedApiKey: string;
	let resolvedParamsOrTemplateId: CreateSessionIdBody | string;

	if (typeof apiServerOrOptions === 'object') {
		const options = apiServerOrOptions;
		resolvedApiServer = resolveApiServer(options.apiServer);
		resolvedApiKey = options.apiKey;
		resolvedParamsOrTemplateId =
			'sessionTemplateId' in options ? options.sessionTemplateId : options.params;
	} else {
		resolvedApiServer = resolveApiServer(apiServerOrOptions);
		resolvedApiKey = apiKey as string;
		resolvedParamsOrTemplateId = paramsOrTemplateId as CreateSessionIdBody | string;
	}

	return await createSessionIdInternal(
		resolvedApiServer,
		resolvedApiKey,
		resolvedParamsOrTemplateId
	);
}

async function createSessionIdInternal(
	apiServer: string,
	apiKey: string,
	paramsOrTemplateId: CreateSessionIdBody | string
): Promise<string> {
	try {
		let params: CreateSessionIdBody;

		if (typeof paramsOrTemplateId === 'string') {
			const template = await PersoUtil.getSessionTemplate(apiServer, apiKey, paramsOrTemplateId);

			if (template.model_style.platform_type !== 'webrtc') {
				throw new Error(
					`SessionTemplate "${paramsOrTemplateId}" uses platform_type "${template.model_style.platform_type}", but only "webrtc" is supported`
				);
			}

			params = sessionTemplateToParams(template);
		} else {
			params = paramsOrTemplateId;
		}

		const body: CreateSessionIdBody & {
			capability: Array<SessionCapabilityName>;
		} = {
			capability: [],
			...params
		};

		if (params.using_stf_webrtc) {
			body.capability.push(SessionCapabilityName.STF_WEBRTC);
		}
		if (params?.llm_type) {
			body.capability.push(SessionCapabilityName.LLM);
			body.llm_type = params.llm_type;
		}
		if (params?.tts_type) {
			body.capability.push(SessionCapabilityName.TTS);
			body.tts_type = params.tts_type;
		}
		if (params?.stt_type) {
			body.capability.push(SessionCapabilityName.STT);
			body.stt_type = params.stt_type;
		}

		const response = await fetch(`${apiServer}/api/v1/session/`, {
			body: JSON.stringify(body),
			headers: {
				'PersoLive-APIKey': apiKey,
				'Content-Type': 'application/json'
			},
			method: 'POST'
		});

		const json = await PersoUtil.parseJson(response);
		return json.session_id as string;
	} catch (err) {
		throw wrapSessionCreationApiError(err);
	}
}
```

c) Replace the existing `getIntroMessage` with:

```typescript
type GetIntroMessageObjectOptions = {
	apiKey: string;
	promptId: string;
	apiServer?: string;
};

export async function getIntroMessage(options: GetIntroMessageObjectOptions): Promise<string>;
export async function getIntroMessage(
	apiServer: string,
	apiKey: string,
	promptId: string
): Promise<string>;
export async function getIntroMessage(
	apiServerOrOptions: string | GetIntroMessageObjectOptions,
	apiKey?: string,
	promptId?: string
): Promise<string> {
	let resolvedApiServer: string;
	let resolvedApiKey: string;
	let resolvedPromptId: string;

	if (typeof apiServerOrOptions === 'object') {
		resolvedApiServer = resolveApiServer(apiServerOrOptions.apiServer);
		resolvedApiKey = apiServerOrOptions.apiKey;
		resolvedPromptId = apiServerOrOptions.promptId;
	} else {
		resolvedApiServer = resolveApiServer(apiServerOrOptions);
		resolvedApiKey = apiKey as string;
		resolvedPromptId = promptId as string;
	}

	try {
		const prompts = (await PersoUtil.getPrompts(
			resolvedApiServer,
			resolvedApiKey
		)) as PromptMetadata[];
		const prompt = prompts.find((item) => item.prompt_id === resolvedPromptId);

		if (!prompt) {
			throw new Error(`Prompt (${resolvedPromptId}) not found`, { cause: 404 });
		}

		return prompt.intro_message;
	} catch (err: unknown) {
		if (err instanceof ApiError) {
			throw new Error(err.detail, { cause: err.errorCode ?? 500 });
		}

		throw err;
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- client-init.unit.test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/perso-interactive-sdk/src/client/init.ts \
        packages/perso-interactive-sdk/src/__tests__/unit/client-init.unit.test.ts
git commit -m "feat(sdk): add object overloads to client init helpers

createSessionId + getIntroMessage now accept the object form with
optional apiServer. Browser warning still fires for createSessionId."
```

---

## Task 5: `createSession` object overload

**Files:**
- Modify: `packages/perso-interactive-sdk/src/client/PersoInteractive.ts`
- Test (create): `packages/perso-interactive-sdk/src/__tests__/unit/create-session.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/perso-interactive-sdk/src/__tests__/unit/create-session.unit.test.ts`:

```typescript
import { createSession } from '../../client/PersoInteractive';
import { ChatTool } from '../../client/types';
import * as sessionModule from '../../client/session';

describe('createSession (object overload)', () => {
	let csSpy: jest.SpyInstance;

	beforeEach(() => {
		csSpy = jest
			.spyOn(sessionModule, 'createSession')
			.mockResolvedValue({} as any);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('forwards to internal createSession with DEFAULT_API_SERVER when apiServer is omitted', async () => {
		const tools: Array<ChatTool> = [];
		await createSession({
			sessionId: 'sess-1',
			width: 640,
			height: 480,
			clientTools: tools
		});
		expect(csSpy).toHaveBeenCalledWith(
			'https://platform.perso.ai',
			'sess-1',
			640,
			480,
			tools
		);
	});

	it('uses the explicit apiServer when provided (and strips trailing slash)', async () => {
		const tools: Array<ChatTool> = [];
		await createSession({
			sessionId: 'sess-2',
			width: 800,
			height: 600,
			clientTools: tools,
			apiServer: 'https://stage-platform.perso.ai/'
		});
		expect(csSpy).toHaveBeenCalledWith(
			'https://stage-platform.perso.ai',
			'sess-2',
			800,
			600,
			tools
		);
	});

	it('does not break the existing 5-arg positional overload', async () => {
		const tools: Array<ChatTool> = [];
		await createSession('https://api.example.com', 'sess-3', 320, 240, tools);
		expect(csSpy).toHaveBeenCalledWith(
			'https://api.example.com',
			'sess-3',
			320,
			240,
			tools
		);
	});

	it('does not break the legacy 6-arg positional overload (enableVoiceChat)', async () => {
		const tools: Array<ChatTool> = [];
		await createSession('https://api.example.com', 'sess-4', 320, 240, true, tools);
		expect(csSpy).toHaveBeenCalledWith(
			'https://api.example.com',
			'sess-4',
			320,
			240,
			true,
			tools
		);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- create-session.unit.test`
Expected: Tests FAIL (object overload not accepted).

- [ ] **Step 3: Implement the object overload**

Edit `packages/perso-interactive-sdk/src/client/PersoInteractive.ts`. Add the resolver import:

```typescript
import { DEFAULT_API_SERVER, resolveApiServer } from '../shared/api-server';
```

Replace the existing `createSession` overload + implementation block with:

```typescript
type CreateSessionObjectOptions = {
	sessionId: string;
	width: number;
	height: number;
	clientTools: Array<ChatTool>;
	apiServer?: string;
};

/**
 * @overload Object-form. Uses DEFAULT_API_SERVER when apiServer is omitted.
 */
export function createSession(options: CreateSessionObjectOptions): Promise<Session>;
/**
 * Creates a Session with REST-based STT/TTS (current mode).
 */
export function createSession(
	apiServer: string,
	sessionId: string,
	width: number,
	height: number,
	clientTools: Array<ChatTool>
): Promise<Session>;
/**
 * Creates a Session with bidirectional WebRTC audio (legacy mode).
 * @deprecated Legacy voice chat mode will be removed in a future version.
 *   Use the 5-argument overload with REST-based STT/TTS instead.
 */
export function createSession(
	apiServer: string,
	sessionId: string,
	width: number,
	height: number,
	enableVoiceChat: boolean,
	clientTools: Array<ChatTool>
): Promise<Session>;
export async function createSession(
	apiServerOrOptions: string | CreateSessionObjectOptions,
	sessionId?: string,
	width?: number,
	height?: number,
	enableVoiceChatOrClientTools?: boolean | Array<ChatTool>,
	clientTools?: Array<ChatTool>
): Promise<Session> {
	if (typeof apiServerOrOptions === 'object') {
		const options = apiServerOrOptions;
		const resolved = resolveApiServer(options.apiServer);
		return await cs(
			resolved,
			options.sessionId,
			options.width,
			options.height,
			options.clientTools
		);
	}

	if (typeof enableVoiceChatOrClientTools === 'boolean') {
		return await cs(
			apiServerOrOptions,
			sessionId as string,
			width as number,
			height as number,
			enableVoiceChatOrClientTools,
			clientTools ?? []
		);
	}
	return await cs(
		apiServerOrOptions,
		sessionId as string,
		width as number,
		height as number,
		enableVoiceChatOrClientTools as Array<ChatTool>
	);
}

export { DEFAULT_API_SERVER };
```

Note: `DEFAULT_API_SERVER` is also re-exported here so client consumers can reference it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- create-session.unit.test`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/perso-interactive-sdk/src/client/PersoInteractive.ts \
        packages/perso-interactive-sdk/src/__tests__/unit/create-session.unit.test.ts
git commit -m "feat(sdk): add object overload to createSession

createSession({ sessionId, width, height, clientTools, apiServer? })
defaults apiServer to https://platform.perso.ai. Re-exports
DEFAULT_API_SERVER from the client entry point."
```

---

## Task 6: Settings helpers — object overloads (all 15 functions)

**Files:**
- Modify: `packages/perso-interactive-sdk/src/shared/settings.ts`
- Test (create): `packages/perso-interactive-sdk/src/__tests__/unit/settings.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/perso-interactive-sdk/src/__tests__/unit/settings.unit.test.ts`:

```typescript
import { PersoUtil } from '../../shared/perso_util';
import {
	getLLMs,
	getTTSs,
	getSTTs,
	getModelStyles,
	getBackgroundImages,
	getPrompts,
	getDocuments,
	getMcpServers,
	getTextNormalizations,
	getTextNormalization,
	getSessionTemplates,
	getSessionTemplate,
	getAllSettings,
	makeTTS,
	getSessionInfo
} from '../../shared/settings';

const apiKey = 'perso-key';
const DEFAULT = 'https://platform.perso.ai';
const STAGE = 'https://stage-platform.perso.ai';

describe('Settings helpers (unit) - object overloads', () => {
	beforeEach(() => {
		jest.restoreAllMocks();
	});

	type Case = {
		name: string;
		method: keyof typeof PersoUtil;
		call: (server: string | undefined) => Promise<unknown>;
		expectedArgs: (resolved: string) => unknown[];
	};

	const apiKeyCases: Array<Case> = [
		{
			name: 'getLLMs',
			method: 'getLLMs',
			call: (s) => getLLMs(s === undefined ? { apiKey } : { apiKey, apiServer: s }),
			expectedArgs: (r) => [r, apiKey]
		},
		{
			name: 'getTTSs',
			method: 'getTTSs',
			call: (s) => getTTSs(s === undefined ? { apiKey } : { apiKey, apiServer: s }),
			expectedArgs: (r) => [r, apiKey]
		},
		{
			name: 'getSTTs',
			method: 'getSTTs',
			call: (s) => getSTTs(s === undefined ? { apiKey } : { apiKey, apiServer: s }),
			expectedArgs: (r) => [r, apiKey]
		},
		{
			name: 'getModelStyles',
			method: 'getModelStyles',
			call: (s) => getModelStyles(s === undefined ? { apiKey } : { apiKey, apiServer: s }),
			expectedArgs: (r) => [r, apiKey]
		},
		{
			name: 'getBackgroundImages',
			method: 'getBackgroundImages',
			call: (s) =>
				getBackgroundImages(s === undefined ? { apiKey } : { apiKey, apiServer: s }),
			expectedArgs: (r) => [r, apiKey]
		},
		{
			name: 'getPrompts',
			method: 'getPrompts',
			call: (s) => getPrompts(s === undefined ? { apiKey } : { apiKey, apiServer: s }),
			expectedArgs: (r) => [r, apiKey]
		},
		{
			name: 'getDocuments',
			method: 'getDocuments',
			call: (s) => getDocuments(s === undefined ? { apiKey } : { apiKey, apiServer: s }),
			expectedArgs: (r) => [r, apiKey]
		},
		{
			name: 'getMcpServers',
			method: 'getMcpServers',
			call: (s) => getMcpServers(s === undefined ? { apiKey } : { apiKey, apiServer: s }),
			expectedArgs: (r) => [r, apiKey]
		},
		{
			name: 'getTextNormalizations',
			method: 'getTextNormalizations',
			call: (s) =>
				getTextNormalizations(s === undefined ? { apiKey } : { apiKey, apiServer: s }),
			expectedArgs: (r) => [r, apiKey]
		},
		{
			name: 'getSessionTemplates',
			method: 'getSessionTemplates',
			call: (s) =>
				getSessionTemplates(s === undefined ? { apiKey } : { apiKey, apiServer: s }),
			expectedArgs: (r) => [r, apiKey]
		}
	];

	describe.each(apiKeyCases)('$name (apiKey-only family)', ({ method, call, expectedArgs }) => {
		it('uses DEFAULT_API_SERVER when apiServer is omitted', async () => {
			const spy = jest.spyOn(PersoUtil, method as any).mockResolvedValue([]);
			await call(undefined);
			expect(spy).toHaveBeenCalledWith(...expectedArgs(DEFAULT));
		});

		it('uses the explicit apiServer when provided', async () => {
			const spy = jest.spyOn(PersoUtil, method as any).mockResolvedValue([]);
			await call(STAGE + '/');
			expect(spy).toHaveBeenCalledWith(...expectedArgs(STAGE));
		});

		it('does not break the positional overload', async () => {
			const spy = jest.spyOn(PersoUtil, method as any).mockResolvedValue([]);
			const positional = (apiKeyCases.find((c) => c.method === method)!.name) as
				| 'getLLMs'
				| 'getTTSs';
			const fns: Record<string, (server: string, key: string) => Promise<unknown>> = {
				getLLMs,
				getTTSs,
				getSTTs,
				getModelStyles,
				getBackgroundImages,
				getPrompts,
				getDocuments,
				getMcpServers,
				getTextNormalizations,
				getSessionTemplates
			};
			await fns[method as string](STAGE, apiKey);
			expect(spy).toHaveBeenCalledWith(STAGE, apiKey);
		});
	});

	describe('getTextNormalization', () => {
		it('uses DEFAULT_API_SERVER when apiServer is omitted', async () => {
			const spy = jest
				.spyOn(PersoUtil, 'downloadTextNormalization')
				.mockResolvedValue({} as any);
			await getTextNormalization({ apiKey, configId: 'cfg-1' });
			expect(spy).toHaveBeenCalledWith(DEFAULT, apiKey, 'cfg-1');
		});

		it('uses the explicit apiServer when provided', async () => {
			const spy = jest
				.spyOn(PersoUtil, 'downloadTextNormalization')
				.mockResolvedValue({} as any);
			await getTextNormalization({ apiKey, configId: 'cfg-1', apiServer: STAGE });
			expect(spy).toHaveBeenCalledWith(STAGE, apiKey, 'cfg-1');
		});

		it('does not break the positional overload', async () => {
			const spy = jest
				.spyOn(PersoUtil, 'downloadTextNormalization')
				.mockResolvedValue({} as any);
			await getTextNormalization(STAGE, apiKey, 'cfg-1');
			expect(spy).toHaveBeenCalledWith(STAGE, apiKey, 'cfg-1');
		});
	});

	describe('getSessionTemplate', () => {
		it('uses DEFAULT_API_SERVER when apiServer is omitted', async () => {
			const spy = jest.spyOn(PersoUtil, 'getSessionTemplate').mockResolvedValue({} as any);
			await getSessionTemplate({ apiKey, sessionTemplateId: 'tmpl-1' });
			expect(spy).toHaveBeenCalledWith(DEFAULT, apiKey, 'tmpl-1');
		});

		it('uses the explicit apiServer when provided', async () => {
			const spy = jest.spyOn(PersoUtil, 'getSessionTemplate').mockResolvedValue({} as any);
			await getSessionTemplate({
				apiKey,
				sessionTemplateId: 'tmpl-1',
				apiServer: STAGE
			});
			expect(spy).toHaveBeenCalledWith(STAGE, apiKey, 'tmpl-1');
		});

		it('does not break the positional overload', async () => {
			const spy = jest.spyOn(PersoUtil, 'getSessionTemplate').mockResolvedValue({} as any);
			await getSessionTemplate(STAGE, apiKey, 'tmpl-1');
			expect(spy).toHaveBeenCalledWith(STAGE, apiKey, 'tmpl-1');
		});
	});

	describe('getAllSettings', () => {
		const stubAll = () => {
			jest.spyOn(PersoUtil, 'getLLMs').mockResolvedValue([] as any);
			jest.spyOn(PersoUtil, 'getTTSs').mockResolvedValue([] as any);
			jest.spyOn(PersoUtil, 'getSTTs').mockResolvedValue([] as any);
			jest.spyOn(PersoUtil, 'getModelStyles').mockResolvedValue([] as any);
			jest.spyOn(PersoUtil, 'getBackgroundImages').mockResolvedValue([] as any);
			jest.spyOn(PersoUtil, 'getPrompts').mockResolvedValue([] as any);
			jest.spyOn(PersoUtil, 'getDocuments').mockResolvedValue([] as any);
			jest.spyOn(PersoUtil, 'getMcpServers').mockResolvedValue([] as any);
			jest.spyOn(PersoUtil, 'getTextNormalizations').mockResolvedValue([] as any);
		};

		it('uses DEFAULT_API_SERVER when apiServer is omitted', async () => {
			stubAll();
			await getAllSettings({ apiKey });
			expect(PersoUtil.getLLMs).toHaveBeenCalledWith(DEFAULT, apiKey);
		});

		it('uses the explicit apiServer when provided', async () => {
			stubAll();
			await getAllSettings({ apiKey, apiServer: STAGE });
			expect(PersoUtil.getLLMs).toHaveBeenCalledWith(STAGE, apiKey);
		});

		it('does not break the positional overload', async () => {
			stubAll();
			await getAllSettings(STAGE, apiKey);
			expect(PersoUtil.getLLMs).toHaveBeenCalledWith(STAGE, apiKey);
		});
	});

	describe('makeTTS (no apiKey)', () => {
		it('uses DEFAULT_API_SERVER when apiServer is omitted', async () => {
			const spy = jest.spyOn(PersoUtil, 'makeTTS').mockResolvedValue({ audio: 'b64' });
			await makeTTS({ sessionId: 's1', text: 'hi' });
			expect(spy).toHaveBeenCalledWith(DEFAULT, { sessionId: 's1', text: 'hi' });
		});

		it('uses the explicit apiServer when provided', async () => {
			const spy = jest.spyOn(PersoUtil, 'makeTTS').mockResolvedValue({ audio: 'b64' });
			await makeTTS({ sessionId: 's1', text: 'hi', apiServer: STAGE });
			expect(spy).toHaveBeenCalledWith(STAGE, { sessionId: 's1', text: 'hi' });
		});

		it('does not break the positional overload', async () => {
			const spy = jest.spyOn(PersoUtil, 'makeTTS').mockResolvedValue({ audio: 'b64' });
			await makeTTS(STAGE, { sessionId: 's1', text: 'hi' });
			expect(spy).toHaveBeenCalledWith(STAGE, { sessionId: 's1', text: 'hi' });
		});
	});

	describe('getSessionInfo (no apiKey)', () => {
		it('uses DEFAULT_API_SERVER when apiServer is omitted', async () => {
			const spy = jest.spyOn(PersoUtil, 'getSessionInfo').mockResolvedValue({} as any);
			await getSessionInfo({ sessionId: 'sess-x' });
			expect(spy).toHaveBeenCalledWith(DEFAULT, 'sess-x');
		});

		it('uses the explicit apiServer when provided', async () => {
			const spy = jest.spyOn(PersoUtil, 'getSessionInfo').mockResolvedValue({} as any);
			await getSessionInfo({ sessionId: 'sess-x', apiServer: STAGE });
			expect(spy).toHaveBeenCalledWith(STAGE, 'sess-x');
		});

		it('does not break the positional overload', async () => {
			const spy = jest.spyOn(PersoUtil, 'getSessionInfo').mockResolvedValue({} as any);
			await getSessionInfo(STAGE, 'sess-x');
			expect(spy).toHaveBeenCalledWith(STAGE, 'sess-x');
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- settings.unit.test`
Expected: All new tests FAIL (object signatures not yet accepted).

- [ ] **Step 3: Implement the object overloads**

Replace the entire body of `packages/perso-interactive-sdk/src/shared/settings.ts` with:

```typescript
import { PersoUtil, type TextNormalizationDownload } from './perso_util';
import { resolveApiServer } from './api-server';
import type { SessionTemplate } from './types';

type ApiKeyOptions = { apiKey: string; apiServer?: string };

function isOptions(arg: unknown): arg is ApiKeyOptions {
	return typeof arg === 'object' && arg !== null;
}

/**
 * Retrieves the list of available LLM providers from the API.
 */
export async function getLLMs(options: ApiKeyOptions): Promise<unknown>;
export async function getLLMs(apiServer: string, apiKey: string): Promise<unknown>;
export async function getLLMs(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<unknown> {
	if (isOptions(arg1)) {
		return await PersoUtil.getLLMs(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getLLMs(resolveApiServer(arg1), arg2 as string);
}

export async function getTTSs(options: ApiKeyOptions): Promise<unknown>;
export async function getTTSs(apiServer: string, apiKey: string): Promise<unknown>;
export async function getTTSs(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<unknown> {
	if (isOptions(arg1)) {
		return await PersoUtil.getTTSs(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getTTSs(resolveApiServer(arg1), arg2 as string);
}

export async function getSTTs(options: ApiKeyOptions): Promise<unknown>;
export async function getSTTs(apiServer: string, apiKey: string): Promise<unknown>;
export async function getSTTs(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<unknown> {
	if (isOptions(arg1)) {
		return await PersoUtil.getSTTs(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getSTTs(resolveApiServer(arg1), arg2 as string);
}

export async function getModelStyles(options: ApiKeyOptions): Promise<unknown>;
export async function getModelStyles(apiServer: string, apiKey: string): Promise<unknown>;
export async function getModelStyles(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<unknown> {
	if (isOptions(arg1)) {
		return await PersoUtil.getModelStyles(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getModelStyles(resolveApiServer(arg1), arg2 as string);
}

export async function getBackgroundImages(options: ApiKeyOptions): Promise<unknown>;
export async function getBackgroundImages(apiServer: string, apiKey: string): Promise<unknown>;
export async function getBackgroundImages(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<unknown> {
	if (isOptions(arg1)) {
		return await PersoUtil.getBackgroundImages(
			resolveApiServer(arg1.apiServer),
			arg1.apiKey
		);
	}
	return await PersoUtil.getBackgroundImages(resolveApiServer(arg1), arg2 as string);
}

export async function getPrompts(options: ApiKeyOptions): Promise<unknown>;
export async function getPrompts(apiServer: string, apiKey: string): Promise<unknown>;
export async function getPrompts(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<unknown> {
	if (isOptions(arg1)) {
		return await PersoUtil.getPrompts(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getPrompts(resolveApiServer(arg1), arg2 as string);
}

export async function getDocuments(options: ApiKeyOptions): Promise<unknown>;
export async function getDocuments(apiServer: string, apiKey: string): Promise<unknown>;
export async function getDocuments(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<unknown> {
	if (isOptions(arg1)) {
		return await PersoUtil.getDocuments(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getDocuments(resolveApiServer(arg1), arg2 as string);
}

export async function getMcpServers(options: ApiKeyOptions): Promise<unknown>;
export async function getMcpServers(apiServer: string, apiKey: string): Promise<unknown>;
export async function getMcpServers(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<unknown> {
	if (isOptions(arg1)) {
		return await PersoUtil.getMcpServers(resolveApiServer(arg1.apiServer), arg1.apiKey);
	}
	return await PersoUtil.getMcpServers(resolveApiServer(arg1), arg2 as string);
}

export async function getTextNormalizations(options: ApiKeyOptions): Promise<unknown>;
export async function getTextNormalizations(
	apiServer: string,
	apiKey: string
): Promise<unknown>;
export async function getTextNormalizations(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<unknown> {
	if (isOptions(arg1)) {
		return await PersoUtil.getTextNormalizations(
			resolveApiServer(arg1.apiServer),
			arg1.apiKey
		);
	}
	return await PersoUtil.getTextNormalizations(resolveApiServer(arg1), arg2 as string);
}

type GetTextNormalizationOptions = {
	apiKey: string;
	configId: string;
	apiServer?: string;
};

export async function getTextNormalization(
	options: GetTextNormalizationOptions
): Promise<TextNormalizationDownload>;
export async function getTextNormalization(
	apiServer: string,
	apiKey: string,
	configId: string
): Promise<TextNormalizationDownload>;
export async function getTextNormalization(
	arg1: string | GetTextNormalizationOptions,
	arg2?: string,
	arg3?: string
): Promise<TextNormalizationDownload> {
	if (typeof arg1 === 'object') {
		return await PersoUtil.downloadTextNormalization(
			resolveApiServer(arg1.apiServer),
			arg1.apiKey,
			arg1.configId
		);
	}
	return await PersoUtil.downloadTextNormalization(
		resolveApiServer(arg1),
		arg2 as string,
		arg3 as string
	);
}

export async function getSessionTemplates(options: ApiKeyOptions): Promise<SessionTemplate[]>;
export async function getSessionTemplates(
	apiServer: string,
	apiKey: string
): Promise<SessionTemplate[]>;
export async function getSessionTemplates(
	arg1: string | ApiKeyOptions,
	arg2?: string
): Promise<SessionTemplate[]> {
	if (isOptions(arg1)) {
		return await PersoUtil.getSessionTemplates(
			resolveApiServer(arg1.apiServer),
			arg1.apiKey
		);
	}
	return await PersoUtil.getSessionTemplates(resolveApiServer(arg1), arg2 as string);
}

type GetSessionTemplateOptions = {
	apiKey: string;
	sessionTemplateId: string;
	apiServer?: string;
};

export async function getSessionTemplate(
	options: GetSessionTemplateOptions
): Promise<SessionTemplate>;
export async function getSessionTemplate(
	apiServer: string,
	apiKey: string,
	sessionTemplateId: string
): Promise<SessionTemplate>;
export async function getSessionTemplate(
	arg1: string | GetSessionTemplateOptions,
	arg2?: string,
	arg3?: string
): Promise<SessionTemplate> {
	if (typeof arg1 === 'object') {
		return await PersoUtil.getSessionTemplate(
			resolveApiServer(arg1.apiServer),
			arg1.apiKey,
			arg1.sessionTemplateId
		);
	}
	return await PersoUtil.getSessionTemplate(
		resolveApiServer(arg1),
		arg2 as string,
		arg3 as string
	);
}

export async function getAllSettings(options: ApiKeyOptions): Promise<{
	llms: unknown;
	ttsTypes: unknown;
	sttTypes: unknown;
	modelStyles: unknown;
	backgroundImages: unknown;
	prompts: unknown;
	documents: unknown;
	mcpServers: unknown;
	textNormalizations: unknown;
}>;
export async function getAllSettings(
	apiServer: string,
	apiKey: string
): Promise<{
	llms: unknown;
	ttsTypes: unknown;
	sttTypes: unknown;
	modelStyles: unknown;
	backgroundImages: unknown;
	prompts: unknown;
	documents: unknown;
	mcpServers: unknown;
	textNormalizations: unknown;
}>;
export async function getAllSettings(
	arg1: string | ApiKeyOptions,
	arg2?: string
) {
	const resolved = isOptions(arg1)
		? { apiServer: resolveApiServer(arg1.apiServer), apiKey: arg1.apiKey }
		: { apiServer: resolveApiServer(arg1), apiKey: arg2 as string };

	const [
		llms,
		ttsTypes,
		sttTypes,
		modelStyles,
		backgroundImages,
		prompts,
		documents,
		mcpServers,
		textNormalizations
	] = await Promise.all([
		PersoUtil.getLLMs(resolved.apiServer, resolved.apiKey),
		PersoUtil.getTTSs(resolved.apiServer, resolved.apiKey),
		PersoUtil.getSTTs(resolved.apiServer, resolved.apiKey),
		PersoUtil.getModelStyles(resolved.apiServer, resolved.apiKey),
		PersoUtil.getBackgroundImages(resolved.apiServer, resolved.apiKey),
		PersoUtil.getPrompts(resolved.apiServer, resolved.apiKey),
		PersoUtil.getDocuments(resolved.apiServer, resolved.apiKey),
		PersoUtil.getMcpServers(resolved.apiServer, resolved.apiKey),
		PersoUtil.getTextNormalizations(resolved.apiServer, resolved.apiKey).catch(() => [])
	]);

	return {
		llms,
		ttsTypes,
		sttTypes,
		modelStyles,
		backgroundImages,
		prompts,
		documents,
		mcpServers,
		textNormalizations
	};
}

type MakeTTSParams = {
	sessionId: string;
	text: string;
	locale?: string;
	output_format?: string;
};

type MakeTTSObjectOptions = MakeTTSParams & { apiServer?: string };

export async function makeTTS(options: MakeTTSObjectOptions): Promise<{ audio: string }>;
export async function makeTTS(
	apiServer: string,
	params: MakeTTSParams
): Promise<{ audio: string }>;
export async function makeTTS(
	arg1: string | MakeTTSObjectOptions,
	arg2?: MakeTTSParams
): Promise<{ audio: string }> {
	if (typeof arg1 === 'object') {
		const { apiServer, ...params } = arg1;
		return await PersoUtil.makeTTS(resolveApiServer(apiServer), params);
	}
	return await PersoUtil.makeTTS(resolveApiServer(arg1), arg2 as MakeTTSParams);
}

type GetSessionInfoOptions = { sessionId: string; apiServer?: string };

export async function getSessionInfo(options: GetSessionInfoOptions): Promise<unknown>;
export async function getSessionInfo(
	apiServer: string,
	sessionId: string
): Promise<unknown>;
export async function getSessionInfo(
	arg1: string | GetSessionInfoOptions,
	arg2?: string
): Promise<unknown> {
	if (typeof arg1 === 'object') {
		return await PersoUtil.getSessionInfo(resolveApiServer(arg1.apiServer), arg1.sessionId);
	}
	return await PersoUtil.getSessionInfo(resolveApiServer(arg1), arg2 as string);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- settings.unit.test`
Expected: All tests PASS.

Run the full SDK test suite to ensure no regression elsewhere:

Run: `pnpm test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/perso-interactive-sdk/src/shared/settings.ts \
        packages/perso-interactive-sdk/src/__tests__/unit/settings.unit.test.ts
git commit -m "feat(sdk): add object overloads to settings helpers

All 13 settings helpers + makeTTS + getSessionInfo accept the object
form with optional apiServer (defaults to https://platform.perso.ai)."
```

---

## Task 7: Re-export `DEFAULT_API_SERVER` from server entry & update JSDoc

**Files:**
- Modify: `packages/perso-interactive-sdk/src/server/index.ts`

- [ ] **Step 1: Edit server/index.ts**

Replace the file content of `packages/perso-interactive-sdk/src/server/index.ts` with:

```typescript
/**
 * Server-side entry point for perso-interactive-sdk-web.
 * Use this module in Node.js/SvelteKit/Next.js server environments.
 *
 * @example
 * ```typescript
 * import {
 *   createSessionId,
 *   getIntroMessage,
 *   getAllSettings
 * } from 'perso-interactive-sdk-web/server';
 *
 * const settings = await getAllSettings({ apiKey });
 *
 * const sessionId = await createSessionId({
 *   apiKey,
 *   params: {
 *     using_stf_webrtc: true,
 *     model_style: settings.modelStyles[0].name,
 *     prompt: settings.prompts[0].prompt_id,
 *     llm_type: settings.llms[0].name,
 *     tts_type: settings.ttsTypes[0].name,
 *     stt_type: settings.sttTypes[0].name
 *   }
 * });
 * ```
 */

export { createSessionId, getIntroMessage } from './init';
export {
	getLLMs,
	getTTSs,
	getSTTs,
	getModelStyles,
	getBackgroundImages,
	getPrompts,
	getDocuments,
	getMcpServers,
	getTextNormalizations,
	getTextNormalization,
	getSessionTemplates,
	getSessionTemplate,
	getAllSettings,
	makeTTS,
	getSessionInfo
} from '../shared/settings';
export { DEFAULT_API_SERVER } from '../shared/api-server';
export { PersoUtil as PersoUtilServer } from '../shared/perso_util';
export {
	ApiError,
	SessionCreationError,
	DoesNotExistError,
	NotInOrganizationError
} from '../shared/error';
export type { SessionTemplate, STTResponse } from '../shared/types';
```

- [ ] **Step 2: Build the SDK to verify exports compile**

Run: `pnpm build:sdk`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/perso-interactive-sdk/src/server/index.ts
git commit -m "feat(sdk): re-export DEFAULT_API_SERVER + update server JSDoc

Adds DEFAULT_API_SERVER to server entry point and updates the
@example block to the recommended object form."
```

---

## Task 8: Migrate Svelte demo

**Files:**
- Modify: `apps/svelte/src/routes/session/+server.ts`
- Modify: `apps/svelte/src/lib/components/LiveChat.svelte`

- [ ] **Step 1: Update the session route**

Read `apps/svelte/src/routes/session/+server.ts` first. Then modify the `createSessionId` call (around line 6) and the `getIntroMessage` call (around line 23).

Existing pattern:
```typescript
const sessionId = await createSessionId(persoInteractiveApiServerUrl, persoInteractiveApiKey, { ... });
// ...
introMessage = await getIntroMessage(persoInteractiveApiServerUrl, persoInteractiveApiKey, promptId);
```

Replace with object-form. If `persoInteractiveApiServerUrl` is `'https://platform.perso.ai'`, omit `apiServer`; otherwise keep it. Inspect `apps/svelte/src/lib/constant.ts` first to determine which case applies, and keep forwarding `apiServer: persoInteractiveApiServerUrl` if the constant is dynamic (env-driven) — preserving stage support.

New pattern (with explicit `apiServer` forwarding to preserve env override):
```typescript
const sessionId = await createSessionId({
	apiKey: persoInteractiveApiKey,
	params: { /* same body as before */ },
	apiServer: persoInteractiveApiServerUrl
});
// ...
introMessage = await getIntroMessage({
	apiKey: persoInteractiveApiKey,
	promptId,
	apiServer: persoInteractiveApiServerUrl
});
```

- [ ] **Step 2: Update LiveChat.svelte**

Modify the `createSession` call around line 53. Existing:
```typescript
session = await createSession(apiServer, sessionId, width, height, clientTools);
```

Replace with:
```typescript
session = await createSession({
	sessionId,
	width,
	height,
	clientTools,
	apiServer
});
```

(Keep `apiServer` forwarding to preserve env-driven override.)

- [ ] **Step 3: Type-check the svelte app**

Run: `pnpm tsc:svelte`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/svelte/src/routes/session/+server.ts \
        apps/svelte/src/lib/components/LiveChat.svelte
git commit -m "refactor(demo): migrate svelte app to SDK object overloads

Uses createSessionId/getIntroMessage/createSession in object form
while still forwarding apiServer so env overrides keep working."
```

---

## Task 9: Migrate Next.js demo

**Files:**
- Modify: `apps/nextjs/src/app/api/session/route.ts`
- Modify: `apps/nextjs/src/lib/server-config.ts`
- Modify: `apps/nextjs/src/components/LiveChat.tsx`

- [ ] **Step 1: Update `route.ts`**

In `apps/nextjs/src/app/api/session/route.ts`, replace the existing `createSessionId(url, key, { ... })` (around line 14) with the object form:

```typescript
const sessionId = await createSessionId({
	apiKey: persoInteractiveApiKey,
	params: { /* same body as before */ },
	apiServer: persoInteractiveApiServerUrl
});
```

And the `getIntroMessage` call (around line 26):

```typescript
introMessage = await getIntroMessage({
	apiKey: persoInteractiveApiKey,
	promptId,
	apiServer: persoInteractiveApiServerUrl
});
```

- [ ] **Step 2: Update `server-config.ts`**

Replace the existing `getAllSettings(persoInteractiveApiServerUrl, persoInteractiveApiKey)` (around line 32) with:

```typescript
await getAllSettings({
	apiKey: persoInteractiveApiKey,
	apiServer: persoInteractiveApiServerUrl
});
```

- [ ] **Step 3: Update `LiveChat.tsx`**

Replace the existing `createSession(apiServer, sessionId, width, height, tools)` (around line 72) with:

```typescript
const sess = await createSession({
	sessionId,
	width,
	height,
	clientTools: tools,
	apiServer
});
```

- [ ] **Step 4: Type-check the nextjs app**

Run: `pnpm tsc:nextjs`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/nextjs/src/app/api/session/route.ts \
        apps/nextjs/src/lib/server-config.ts \
        apps/nextjs/src/components/LiveChat.tsx
git commit -m "refactor(demo): migrate nextjs app to SDK object overloads

Updates server route, server-config, and LiveChat to the new
object-form public API. Keeps apiServer forwarding."
```

---

## Task 10: Migrate Vanilla demo

**Files:**
- Modify: `apps/vanilla/src/index.js`
- Modify: `apps/vanilla/src/iife.js`

- [ ] **Step 1: Update `apps/vanilla/src/index.js`**

Replace three call sites:

Around line 300:
```javascript
config = await PersoInteractive.getAllSettings({ apiKey, apiServer });
```

Around line 521:
```javascript
const sessionId = await PersoInteractive.createSessionId({
	apiKey,
	params: { /* same body */ },
	apiServer
});
```

Around line 535:
```javascript
session = await PersoInteractive.createSession({
	sessionId,
	width,
	height,
	clientTools,
	apiServer
});
```

- [ ] **Step 2: Apply the same three changes to `apps/vanilla/src/iife.js`**

Same edits at lines 267, 488, 502 in `iife.js`.

- [ ] **Step 3: Lint the vanilla app**

Run: `pnpm lint:vanilla`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/vanilla/src/index.js apps/vanilla/src/iife.js
git commit -m "refactor(demo): migrate vanilla app to SDK object overloads"
```

---

## Task 11: Migrate TypeScript demo

**Files:**
- Modify: `apps/typescript/src/index.ts`

- [ ] **Step 1: Update the three call sites**

Around line 321:
```typescript
config = await getAllSettings({ apiKey, apiServer });
```

Around line 544:
```typescript
const sessionId = await createSessionId({
	apiKey,
	params: { /* same body */ },
	apiServer
});
```

Around line 559:
```typescript
const newSession = await createSession({
	sessionId,
	width,
	height,
	clientTools,
	apiServer
});
```

- [ ] **Step 2: Type-check the typescript app**

Run: `pnpm tsc:typescript`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/typescript/src/index.ts
git commit -m "refactor(demo): migrate typescript app to SDK object overloads"
```

---

## Task 12: Documentation sync

**Files:**
- Modify: `core/api-docs.md`
- Modify: `packages/perso-interactive-sdk/README.md`
- Modify: `README.md`
- Modify: `packages/perso-interactive-sdk/example-guide/en/README.md` (if it references signatures)

- [ ] **Step 1: Update `core/api-docs.md`**

This is the source of truth per `.claude/rules/doc-sync.md`. For each affected function (`createSessionId`, `createSession`, `getIntroMessage`, all 13 settings helpers, `makeTTS`, `getSessionInfo`):

- Add a new "Object form (recommended)" subsection above the existing positional documentation showing the object signature, parameter table (`apiKey`, `params|sessionTemplateId|...`, `apiServer?` with default `https://platform.perso.ai`), and a code example.
- Keep the existing positional signature documentation, retitled "Positional form (legacy)".
- Add a new top-level section "Default API server" early in the doc that documents `DEFAULT_API_SERVER = 'https://platform.perso.ai'` and the trailing-slash normalization rule.

- [ ] **Step 2: Update `packages/perso-interactive-sdk/README.md`**

Per `doc-sync.md`, this is the quick-start. Update:

- Quick start example to use the object form: `createSessionId({ apiKey, params })`, `createSession({ sessionId, width, height, clientTools })`, `getAllSettings({ apiKey })`.
- Express.js server example to use the object form (and mirror the same example in `core/api-docs.md` per the Hard Sync rule).
- Export summary table — list each function with both signatures available (e.g., "object | positional"). Note that the object form omits `apiServer` by default.
- Add a short "Stage / custom API server" section pointing out that `apiServer: 'https://...'` can be passed on any object-form call to override.

- [ ] **Step 3: Update root `README.md`**

Update any quick-start example here to use the object form. Keep the example identical to the one in `packages/perso-interactive-sdk/README.md` (mirror).

- [ ] **Step 4: Check example-guide**

Read `packages/perso-interactive-sdk/example-guide/en/README.md`. If it shows any of the affected signatures, update them to the object form. If it references positional signatures only as part of an "API surface" overview, prefer the object form and note that positional is still supported.

- [ ] **Step 5: Commit**

```bash
git add core/api-docs.md \
        packages/perso-interactive-sdk/README.md \
        README.md \
        packages/perso-interactive-sdk/example-guide/en/README.md
git commit -m "docs(sdk): document object overloads and DEFAULT_API_SERVER

Adds object-form examples (recommended) alongside the existing
positional documentation. Documents the production default URL and
trailing-slash normalization."
```

---

## Task 13: Final verification

- [ ] **Step 1: Build the SDK**

Run: `pnpm build:sdk`
Expected: Build succeeds. `dist/client/` and `dist/server/` contain ESM/CJS/IIFE/typings.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: All tests PASS, no skipped or failed.

- [ ] **Step 3: Type-check every app**

Run: `pnpm tsc`
Expected: No type errors across all apps.

- [ ] **Step 4: Lint each demo**

Run in parallel-friendly order:
```
pnpm lint:svelte
pnpm lint:nextjs
pnpm lint:vanilla
pnpm lint:typescript
```
Expected: All pass.

- [ ] **Step 5: Smoke-confirm the new shape works at runtime**

Start one of the demo apps (e.g., `pnpm svelte`) and confirm a session can be created end-to-end through a browser. (Requires `PERSO_INTERACTIVE_API_KEY` configured.)

- [ ] **Step 6: No commit needed — this task is verification only**

If any step above fails, return to the corresponding earlier task to fix and re-run verification.

---

## Self-Review Notes

**Spec coverage:**
- §5.1 (resolver) → Task 1 ✓
- §5.3 (createSessionId object overload, server + client) → Tasks 2 + 4 ✓
- §5.4 (createSession object overload) → Task 5 ✓
- §5.5 (settings) → Task 6 ✓
- §5.6 (getIntroMessage object overload) → Tasks 3 + 4 ✓
- §6.1.3 (re-export DEFAULT_API_SERVER) → Tasks 5 + 7 ✓
- §6.2 (demo migration) → Tasks 8–11 ✓
- §6.3 (docs sync, including JSDoc in server/index.ts) → Tasks 7 + 12 ✓
- §8 (testing strategy) → embedded in Tasks 1–6, verified in Task 13 ✓

**Placeholder scan:** No TBDs, no "handle edge cases", no "similar to Task N" — every code-changing step has full code. ✓

**Type consistency:**
- `DEFAULT_API_SERVER` / `resolveApiServer` names stable across Tasks 1, 4, 5, 6, 7.
- `CreateSessionIdObjectOptions`, `CreateSessionObjectOptions`, `GetIntroMessageObjectOptions` referenced consistently across tasks.
- Demo migrations use the exact field names from the spec (`apiKey`, `params`, `apiServer`, `sessionId`, `width`, `height`, `clientTools`, `promptId`).
