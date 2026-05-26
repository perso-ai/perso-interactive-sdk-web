# Perso Interactive SDK — Documentation Site

VitePress site at `apps/docs/`. Latest version mirrors `core/api-docs.md` via
`@include`. Past versions live under `apps/docs/v<X.Y>/` as frozen snapshots.

## Local development

```bash
pnpm docs:dev      # http://localhost:5173
pnpm docs:build    # static build into .vitepress/dist
pnpm docs:preview  # serve the built site
```

## Layout

```
apps/docs/
├── .vitepress/
│   ├── config.ts        # nav/sidebar wired through versions.ts
│   └── versions.ts      # version metadata + sidebar builder
├── index.md             # home (latest)
├── api/index.md         # @include core/api-docs.md (latest)
├── guide/               # latest guide pages
└── v<X.Y>/              # frozen archived versions
    ├── api-docs.md
    ├── api/index.md
    └── guide/
```

URLs:

- Latest: `/api`, `/guide/getting-started`
- Archived: `/v1.5/api`, `/v1.5/guide/getting-started`

## Source-of-truth policy

`core/api-docs.md` is the only live source for the latest API reference.
Archived snapshots under `apps/docs/v<X.Y>/api-docs.md` are intentionally
frozen — they do not pick up later edits automatically. A typo in v1.5
documentation must be fixed by editing `apps/docs/v1.5/api-docs.md` directly.

## Cutting a new version

When a breaking-ish release is about to ship, snapshot the outgoing docs
**before** `core/api-docs.md` is overwritten with the new API:

```bash
# Pull the about-to-be-replaced docs from master (or any git ref).
pnpm docs:snapshot --version 1.5 --from-git master

# Or, if the previous docs only exist as a local file:
pnpm docs:snapshot --version 1.5 --from-file path/to/old-api-docs.md

# Default (no flag): snapshot the current working tree.
pnpm docs:snapshot --version 1.5
```

The script:

1. Creates `apps/docs/v<X.Y>/` (errors out if it already exists).
2. Copies `core/api-docs.md` and the entire `apps/docs/guide/` tree into it.
3. Injects `search: false` frontmatter and an archived-version callout into
   every `.md` so the archived pages don't pollute the local search index.
4. Prints the `versions.ts` entry to paste — it does **not** edit
   `versions.ts` automatically.

Then by hand:

1. Open `apps/docs/.vitepress/versions.ts`.
2. Paste the printed entry into the `versions` array.
3. Bump the `label` of the existing `isLatest: true` entry to the new
   release (e.g. `'v1.6.0 (latest)'`).

Verify with `pnpm docs:dev` — the version dropdown in the nav should now
list both the new latest and the freshly archived version.

## Rollback

The snapshot script is intentionally non-idempotent: if a snapshot ends up
wrong, undo it manually before re-running:

1. `rm -rf apps/docs/v<X.Y>/`
2. Remove the corresponding entry from `versions.ts`.
3. `pnpm docs:snapshot ...` again.

## Why this shape

- **Single VitePress site, directory versioning** — keeps one build,
  one deploy, one search index (with archived pages excluded via
  `search: false`).
- **Archived sidebars are generated from each version's own headings** —
  if a heading is renamed in `core/api-docs.md`, the archived sidebar still
  points at anchors that exist in the archived markdown, not anchors that
  exist only in latest.
- **No auto-edit of `versions.ts`** — a printed line you paste in is
  harder to break than a regex that rewrites code.
