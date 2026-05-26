import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type { DefaultTheme } from 'vitepress';

export type DocsVersion = {
	/** Display label, e.g. 'v1.6.0 (latest)' or 'v1.5'. */
	label: string;
	/** URL base segment. '' for latest, '/v1.5' etc. for archived. */
	base: string;
	/**
	 * Absolute path to the version's api-docs.md.
	 * Latest reads from `core/api-docs.md`; archived reads from
	 * `apps/docs/<base>/api-docs.md`.
	 */
	apiDocsPath: string;
	isLatest?: boolean;
};

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(docsRoot, '..', '..');

export const versions: DocsVersion[] = [
	{
		label: 'v1.6.0 (latest)',
		base: '',
		apiDocsPath: resolve(repoRoot, 'core/api-docs.md'),
		isLatest: true,
	},
	{
		label: 'v1.5',
		base: '/v1.5',
		apiDocsPath: resolve(docsRoot, 'v1.5/api-docs.md'),
	},
];

export const latestVersion = versions.find((v) => v.isLatest) ?? versions[0];

// Mirrors VitePress's default heading anchor generation (github-slugger style)
// closely enough for the heading shapes used here (alphanumerics + spaces +
// hyphens + CJK). If we ever add headings with punctuation like `()` or `&`,
// switch to `@mdit-vue/shared`'s `slugify` for guaranteed parity with the
// IDs VitePress assigns at render time.
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w一-龥\- ]/g, '')
		.trim()
		.replace(/\s+/g, '-');
}

function readHeadings(filePath: string): string[] {
	let src: string;
	try {
		src = readFileSync(filePath, 'utf8');
	} catch (err) {
		throw new Error(
			`[versions.ts] Failed to read api-docs for sidebar generation: ${filePath}. ` +
				`Check that the version entry in versions.ts points at an existing snapshot. ` +
				`Original error: ${(err as Error).message}`,
		);
	}
	const headings: string[] = [];
	let inFence = false;
	for (const line of src.split('\n')) {
		if (/^```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const match = /^##\s+(.+?)\s*$/.exec(line);
		if (match) headings.push(match[1]);
	}
	return headings;
}

const MAIN_API = new Set(['PersoInteractive', 'Session', 'ChatState', 'ChatTool']);

function categorize(heading: string): 'main' | 'errors' | 'helpers' {
	if (MAIN_API.has(heading)) return 'main';
	if (/error$/i.test(heading)) return 'errors';
	return 'helpers';
}

export function buildApiSidebar(version: DocsVersion): DefaultTheme.SidebarItem[] {
	const headings = readHeadings(version.apiDocsPath);
	const apiBase = `${version.base}/api/`;

	const main: DefaultTheme.SidebarItem[] = [];
	const errors: DefaultTheme.SidebarItem[] = [];
	const helpers: DefaultTheme.SidebarItem[] = [];

	for (const heading of headings) {
		const item = { text: heading, link: `${apiBase}#${slugify(heading)}` };
		switch (categorize(heading)) {
			case 'main':
				main.push(item);
				break;
			case 'errors':
				errors.push(item);
				break;
			case 'helpers':
				helpers.push(item);
				break;
		}
	}

	const groups: DefaultTheme.SidebarItem[] = [];
	if (main.length) groups.push({ text: 'API Reference', items: main });
	if (errors.length) groups.push({ text: 'Errors', items: errors });
	if (helpers.length) groups.push({ text: 'Types & Helpers', items: helpers });
	return groups;
}

export function buildGuideSidebar(version: DocsVersion): DefaultTheme.SidebarItem[] {
	const guideBase = `${version.base}/guide`;
	return [
		{
			text: 'Guide',
			items: [{ text: 'Getting Started', link: `${guideBase}/getting-started` }],
		},
	];
}

export function buildSidebar(): DefaultTheme.Sidebar {
	const sidebar: DefaultTheme.Sidebar = {};
	for (const version of versions) {
		sidebar[`${version.base}/api/`] = buildApiSidebar(version);
		sidebar[`${version.base}/guide/`] = buildGuideSidebar(version);
	}
	return sidebar;
}

export function buildVersionNavItem(): DefaultTheme.NavItemWithChildren {
	return {
		text: latestVersion.label,
		items: versions.map((v) => ({
			text: v.label,
			link: `${v.base}/api`,
		})),
	};
}
