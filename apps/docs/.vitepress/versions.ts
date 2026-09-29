import { existsSync, readFileSync } from 'node:fs';
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
		label: 'v1.8.0 (latest)',
		base: '',
		apiDocsPath: resolve(repoRoot, 'core/api-docs.md'),
		isLatest: true,
	},
	{
		label: 'v1.7',
		base: '/v1.7',
		apiDocsPath: resolve(docsRoot, 'v1.7/api-docs.md'),
	},
	{
		label: 'v1.6',
		base: '/v1.6',
		apiDocsPath: resolve(docsRoot, 'v1.6/api-docs.md'),
	},
	{
		label: 'v1.5',
		base: '/v1.5',
		apiDocsPath: resolve(docsRoot, 'v1.5/api-docs.md'),
	},
];

export const latestVersion = versions.find((v) => v.isLatest) ?? versions[0];

// VitePress's own heading-id rule (vitepress 1.6 / @mdit-vue/shared `slugify`),
// copied so sidebar links match the ids it renders. A lossy approximation broke
// headings with punctuation: "Migrating from 1.6.x" is `migrating-from-1-6-x`,
// not `migrating-from-16x`. Re-check against the build after a VitePress upgrade.
const rControl = /[\u0000-\u001f]/g;
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;
const rCombining = /[\u0300-\u036F]/g;

function slugify(text: string): string {
	return text
		.normalize('NFKD')
		.replace(rCombining, '')
		.replace(rControl, '')
		.replace(rSpecial, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/^(\d)/, '_$1')
		.toLowerCase();
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
	const items: DefaultTheme.SidebarItem[] = [
		{ text: 'Getting Started', link: `${guideBase}/getting-started` },
	];
	// Pipeline Recipes first shipped with v1.7. Each version lists it only if its
	// own guide has the page, so older snapshots keep just Getting Started.
	if (existsSync(resolve(docsRoot, `.${guideBase}/pipelines.md`))) {
		items.push({ text: 'Pipeline Recipes', link: `${guideBase}/pipelines` });
	}
	return [{ text: 'Guide', items }];
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
