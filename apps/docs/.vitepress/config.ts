import { defineConfig } from 'vitepress';

import { buildSidebar, buildVersionNavItem } from './versions';

const rawBase = process.env.DOCS_BASE ?? '/';
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export default defineConfig({
	title: 'Perso Interactive SDK',
	description:
		'WebRTC-based real-time interactive AI avatar SDK for the web — LLM chat, TTS/STT, and client-side tool calling.',
	lang: 'en-US',
	base,
	lastUpdated: true,
	cleanUrls: true,
	srcExclude: ['**/api-docs.md'],
	markdown: {
		lineNumbers: true,
	},
	themeConfig: {
		outline: [2, 3],
		search: {
			provider: 'local',
		},
		nav: [
			{ text: 'Guide', link: '/guide/getting-started' },
			{ text: 'API Reference', link: '/api/' },
			buildVersionNavItem(),
			{
				text: 'npm',
				link: 'https://www.npmjs.com/package/perso-interactive-sdk-web',
			},
			{
				text: 'GitHub',
				link: 'https://github.com/perso-ai/perso-interactive-sdk-web',
			},
		],
		sidebar: buildSidebar(),
		socialLinks: [
			{
				icon: 'github',
				link: 'https://github.com/perso-ai/perso-interactive-sdk-web',
			},
		],
		editLink: {
			pattern:
				'https://github.com/perso-ai/perso-interactive-sdk-web/edit/master/apps/docs/:path',
			text: 'Edit this page on GitHub',
		},
		footer: {
			message: 'Released under the MIT License.',
			copyright: 'Copyright © Perso AI',
		},
	},
});
