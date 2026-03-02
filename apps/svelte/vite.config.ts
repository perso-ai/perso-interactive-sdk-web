import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';
import { defineConfig } from 'vite';

const sdkPath = path.resolve(__dirname, '../../packages/perso-interactive-sdk/src');

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			'@core': path.resolve(__dirname, '../../core/1.0.0'),
			// Map SDK subpath imports to source files for IDE "Go to Definition"
			'perso-interactive-sdk-web/client': path.join(sdkPath, 'client/index.ts'),
			'perso-interactive-sdk-web/server': path.join(sdkPath, 'server/index.ts')
		}
	}
});
