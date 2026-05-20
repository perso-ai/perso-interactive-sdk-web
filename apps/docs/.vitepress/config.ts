import { defineConfig } from 'vitepress';

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
			{
				text: 'npm',
				link: 'https://www.npmjs.com/package/perso-interactive-sdk-web',
			},
			{
				text: 'GitHub',
				link: 'https://github.com/perso-ai/perso-interactive-sdk-web',
			},
		],
		sidebar: {
			'/guide/': [
				{
					text: 'Guide',
					items: [
						{ text: 'Getting Started', link: '/guide/getting-started' },
					],
				},
			],
			'/api/': [
				{
					text: 'API Reference',
					items: [
						{ text: 'PersoInteractive', link: '/api/#persointeractive' },
						{ text: 'Session', link: '/api/#session' },
						{ text: 'ChatState', link: '/api/#chatstate' },
						{ text: 'ChatTool', link: '/api/#chattool' },
					],
				},
				{
					text: 'Errors',
					items: [
						{ text: 'ApiError', link: '/api/#apierror' },
						{ text: 'SessionCreationError', link: '/api/#sessioncreationerror' },
						{ text: 'DoesNotExistError', link: '/api/#doesnotexisterror' },
						{
							text: 'NotInOrganizationError',
							link: '/api/#notinorganizationerror',
						},
						{ text: 'LLMError', link: '/api/#llmerror' },
						{
							text: 'LLMStreamingResponseError',
							link: '/api/#llmstreamingresponseerror',
						},
						{ text: 'STTError', link: '/api/#stterror' },
						{ text: 'TTSError', link: '/api/#ttserror' },
						{ text: 'TTSDecodeError', link: '/api/#ttsdecodeerror' },
					],
				},
				{
					text: 'Types & Helpers',
					items: [
						{ text: 'ProcessLLMOptions', link: '/api/#processllmoptions' },
						{ text: 'LLMStreamChunk', link: '/api/#llmstreamchunk' },
						{ text: 'LlmProcessor', link: '/api/#llmprocessor' },
						{ text: 'WavRecorder', link: '/api/#wavrecorder' },
						{ text: 'Audio Utilities', link: '/api/#audio-utilities' },
					],
				},
			],
		},
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
