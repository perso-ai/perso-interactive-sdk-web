import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapter(),
		files: {
			assets: 'public'
		},
		alias: {
			// Map SDK subpath imports to source files for IDE "Go to Definition"
			'perso-interactive-sdk-web/client':
				'../../packages/perso-interactive-sdk/src/client/index.ts',
			'perso-interactive-sdk-web/server': '../../packages/perso-interactive-sdk/src/server/index.ts'
		},
		typescript: {
			config(config) {
				config.extends = '@perso-interactive-sdk-web/tsconfig/tsconfig.base.json';
				return config;
			}
		}
	}
};

export default config;
