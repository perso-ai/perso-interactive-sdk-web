import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

export default defineConfig({
	root: path.resolve(__dirname, 'src'),
	publicDir: path.resolve(__dirname, 'public'),
	plugins: [
		{
			name: 'static-index-js',
			apply: 'build',
			enforce: 'pre',
			transformIndexHtml(html) {
				return {
					html: html.replace(/<script[^>]*src=['"]\/index\.js['"][^>]*><\/script>/, ''),
					tags: [
						{
							tag: 'script',
							attrs: { src: './index.js' },
							injectTo: 'body'
						}
					]
				};
			},
			generateBundle() {
				this.emitFile({
					type: 'asset',
					fileName: 'index.js',
					source: fs.readFileSync(path.resolve(__dirname, 'src/index.js'), 'utf-8')
				});
			}
		}
	],
	build: {
		outDir: '../dist',
		emptyOutDir: true
	}
});
