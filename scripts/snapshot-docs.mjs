#!/usr/bin/env node
/**
 * Freeze the current API docs into apps/docs/v<X.Y>/ so the VitePress site
 * can keep serving them under /v<X.Y>/api and /v<X.Y>/guide after a new
 * release replaces core/api-docs.md.
 *
 * Usage:
 *   node scripts/snapshot-docs.mjs --version 1.5
 *   node scripts/snapshot-docs.mjs --version 1.5 --from-git master
 *   node scripts/snapshot-docs.mjs --version 1.5 --from-file path/to/api-docs.md
 *
 * Flags:
 *   --version <X.Y>      Required. Major.minor of the version being archived.
 *   --from-git <ref>     Pull api-docs.md and apps/docs/guide/ from a git ref.
 *   --from-file <path>   Pull api-docs.md from a local file. Guide is copied
 *                        from the current working tree.
 *
 * versions.ts is NOT auto-edited. The script prints the line to paste.
 */

import { execFileSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
	const args = { version: null, fromGit: null, fromFile: null };
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const value = argv[i + 1];
		switch (flag) {
			case '--version':
				args.version = value;
				i++;
				break;
			case '--from-git':
				args.fromGit = value;
				i++;
				break;
			case '--from-file':
				args.fromFile = value;
				i++;
				break;
			default:
				if (flag.startsWith('--')) {
					die(`Unknown flag: ${flag}`);
				}
		}
	}
	return args;
}

function die(msg) {
	console.error(`snapshot-docs: ${msg}`);
	process.exit(1);
}

function readGit(ref, path) {
	return execFileSync('git', ['show', `${ref}:${path}`], {
		cwd: repoRoot,
		encoding: 'utf8',
	});
}

function listGitTree(ref, path) {
	const out = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', path], {
		cwd: repoRoot,
		encoding: 'utf8',
	});
	return out.split('\n').filter((line) => line.length > 0);
}

const FRONTMATTER = (versionLabel) =>
	`---\nsearch: false\n---\n\n` +
	`::: warning Archived version\n` +
	`You're viewing **${versionLabel}**. The latest version is **[here](/api/)**.\n` +
	`:::\n\n`;

const GUIDE_FRONTMATTER = (versionLabel) =>
	`---\nsearch: false\n---\n\n` +
	`::: warning Archived version\n` +
	`You're viewing **${versionLabel}**. The latest version is **[here](/guide/getting-started.md)**.\n` +
	`:::\n\n`;

function prependIfMissing(body, prefix) {
	if (body.startsWith('---\nsearch: false')) return body;
	return prefix + body;
}

/**
 * Rewrite intra-doc links from latest paths (`/api/...`, `/guide/...`) to the
 * archived version's paths (`/v<X.Y>/api/...`, `/v<X.Y>/guide/...`) so a
 * v<X.Y> reader stays inside their version when following links.
 *
 * Matches markdown link targets `(...)` and only rewrites paths that start
 * at the site root with `/api` or `/guide`. Anchor-only links (`#section`)
 * and external URLs are left alone.
 */
function rewriteIntraDocLinks(body, versionLabel) {
	const prefix = `/${versionLabel}`;
	return body.replace(/\]\((\/(api|guide)(?:[\/#)][^)]*)?)\)/g, (_match, path) => {
		if (path.startsWith(`${prefix}/`)) return `](${path})`;
		return `](${prefix}${path})`;
	});
}

function processGuideMarkdown(body, versionLabel) {
	const rewritten = rewriteIntraDocLinks(body, versionLabel);
	return prependIfMissing(rewritten, GUIDE_FRONTMATTER(versionLabel));
}

function copyGuideFromTree(srcDir, destDir, versionLabel) {
	cpSync(srcDir, destDir, { recursive: true });
	walkMarkdown(destDir, (filePath) => {
		const body = readFileSync(filePath, 'utf8');
		writeFileSync(filePath, processGuideMarkdown(body, versionLabel));
	});
}

function copyGuideFromGit(ref, srcRelDir, destDir, versionLabel) {
	const files = listGitTree(ref, srcRelDir);
	for (const file of files) {
		const body = readGit(ref, file);
		const destPath = join(destDir, relative(srcRelDir, file));
		mkdirSync(dirname(destPath), { recursive: true });
		const out = file.endsWith('.md')
			? processGuideMarkdown(body, versionLabel)
			: body;
		writeFileSync(destPath, out);
	}
}

function walkMarkdown(dir, visit) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const s = statSync(full);
		if (s.isDirectory()) walkMarkdown(full, visit);
		else if (entry.endsWith('.md')) visit(full);
	}
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.version) die('--version <X.Y> is required');
	if (!/^\d+\.\d+$/.test(args.version)) {
		die(`--version must look like '1.5', got '${args.version}'`);
	}
	if (args.fromGit && args.fromFile) {
		die('--from-git and --from-file are mutually exclusive');
	}

	const versionLabel = `v${args.version}`;
	const versionDir = resolve(repoRoot, 'apps/docs', versionLabel);
	if (existsSync(versionDir)) {
		die(`${relative(repoRoot, versionDir)} already exists. Remove it before snapshotting again.`);
	}

	const apiSrcRel = 'core/api-docs.md';
	const guideSrcRel = 'apps/docs/guide';

	let apiBody;
	if (args.fromFile) {
		const resolved = resolve(repoRoot, args.fromFile);
		const rel = relative(repoRoot, resolved);
		if (rel.startsWith('..') || resolved === repoRoot) {
			die(`--from-file must point inside the repo (got: ${args.fromFile})`);
		}
		apiBody = readFileSync(resolved, 'utf8');
	} else if (args.fromGit) {
		apiBody = readGit(args.fromGit, apiSrcRel);
	} else {
		apiBody = readFileSync(resolve(repoRoot, apiSrcRel), 'utf8');
	}

	mkdirSync(versionDir, { recursive: true });
	mkdirSync(join(versionDir, 'api'), { recursive: true });

	writeFileSync(join(versionDir, 'api-docs.md'), apiBody);
	writeFileSync(
		join(versionDir, 'api/index.md'),
		FRONTMATTER(versionLabel) + '<!--@include: ../api-docs.md-->\n',
	);

	const guideDest = join(versionDir, 'guide');
	if (args.fromGit) {
		copyGuideFromGit(args.fromGit, guideSrcRel, guideDest, versionLabel);
	} else {
		copyGuideFromTree(resolve(repoRoot, guideSrcRel), guideDest, versionLabel);
	}

	console.log(`✓ Snapshot written to ${relative(repoRoot, versionDir)}`);
	console.log('');
	console.log('Add this entry to apps/docs/.vitepress/versions.ts:');
	console.log('');
	console.log(`	{`);
	console.log(`		label: '${versionLabel}',`);
	console.log(`		base: '/${versionLabel}',`);
	console.log(`		apiDocsPath: resolve(docsRoot, '${versionLabel}/api-docs.md'),`);
	console.log(`	},`);
	console.log('');
	console.log("Don't forget to bump the latest version's label too.");
}

main();
