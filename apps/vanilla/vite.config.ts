import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

export default defineConfig({
	root: path.resolve(__dirname, 'src'),
	publicDir: path.resolve(__dirname, 'public'),
	plugins: [
		{
			name: 'vanilla-index-js',
			apply: 'build',
			enforce: 'pre',
			transformIndexHtml(html) {
				return {
					html: html.replace(/<script[^>]*src=['"]\/?index\.js['"][^>]*><\/script>/, ''),
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
				const iifeJsPath = path.resolve(__dirname, 'src/iife.js');
				if (fs.existsSync(iifeJsPath)) {
					this.emitFile({
						type: 'asset',
						fileName: 'iife.js',
						source: fs.readFileSync(iifeJsPath, 'utf-8')
					});
				}

				const iifeHtmlPath = path.resolve(__dirname, 'src/iife.html');
				if (fs.existsSync(iifeHtmlPath)) {
					let iifeHtml = fs.readFileSync(iifeHtmlPath, 'utf-8');
					iifeHtml = iifeHtml.replace('src="/iife.js"', 'src="./iife.js"');
					this.emitFile({
						type: 'asset',
						fileName: 'iife.html',
						source: iifeHtml
					});
				}
			}
		}
	],
	build: {
		outDir: '../dist',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, 'src/index.html'),
				index: path.resolve(__dirname, 'src/index.js')
			},
			output: {
				entryFileNames: '[name].js',
				assetFileNames: '[name].[ext]'
			}
		}
	}
});
