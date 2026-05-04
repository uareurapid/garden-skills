# Release tooling

Zero-dependency Node ESM scripts that drive the per-skill release pipeline.
Used both locally (by maintainers) and in CI (by `.github/workflows/`).

## Files

| File | What it does |
|---|---|
| `lib/skills.mjs` | Shared helpers: enumerate skills, read/validate `manifest.json`, git/tag helpers, SemVer bump, hash files. |
| **`cut-release.mjs`** | **The "one button" release helper.** Interactive scan-bump-commit-tag-push flow. Use this for all routine releases. |
| `pack-skill.mjs` | Build `<skill>-<version>.zip` (+ `.sha256`) from `skills/<name>/`. Validates manifest first. Used by CI. |
| `update-readme.mjs` | Rewrite the `<!-- DOWNLOAD:<skill>:start --><!-- DOWNLOAD:<skill>:end -->` inline marker (one per skill, sits at the end of each "Links:" row) so the `Download v<version> .zip` link always points at the current pinned release artifact. Idempotent. |
| `list-skills.mjs` | Pretty-print all skills with their manifest version + structure status. Exit 1 if anything fails validation. |

## Conventions

- **Tag format**: `<skill-name>-v<semver>` — e.g. `web-design-engineer-v1.2.0`.
- **Zip name**: `<skill>-<version>.zip` — e.g. `web-design-engineer-1.2.0.zip`.
- **Top-level entry inside the zip**: always `<skill>/`, so users can extract
  straight into `.claude/skills/`, `.agents/skills/`, `.codex/skills/`, etc.
- **Excluded from zip**: `.DS_Store`, `Thumbs.db`, `node_modules`, `*.log`,
  `*.swp`, `*.swo`, `.idea`, `.vscode`. (See `EXCLUDE` in `pack-skill.mjs`.)

## Cutting a release — the easy way

```bash
node scripts/release/cut-release.mjs
```

That's the whole thing. The script will:

1. Sanity-check (on `main`, clean tree, in sync with `origin`).
2. Scan every skill, find its last release tag, list commits since.
3. For each candidate, prompt **patch / minor / major / skip** (or auto-pick
   "initial release" for skills that have never been tagged).
4. Show a final plan + diff summary.
5. Bump manifests, run `update-readme.mjs`, commit + tag, then push the
   commit and all tags atomically with one `git push`.

The `release-skill` workflow takes over from there: builds zips, creates
GitHub Releases, re-syncs README download links.

### Variants

```bash
# Preview without writing anything (works even on a dirty tree).
node scripts/release/cut-release.mjs --dry-run

# Skip the final "proceed?" confirmation (useful in scripts).
node scripts/release/cut-release.mjs --yes

# Pre-pick bumps for one or more skills (still prompts for the rest).
node scripts/release/cut-release.mjs \
  --skill web-design-engineer --bump minor \
  --skill gpt-image-2 --bump patch

# Release from a non-default branch.
node scripts/release/cut-release.mjs --branch release/2026-q2
```

### Bump rules of thumb

- **patch** — small content tweaks, typo fixes, new optional reference doc
- **minor** — workflow changes in `SKILL.md`, restructured `references/`, new required step
- **major** — renamed skill, removed files, breaking frontmatter changes

For initial releases (skills with no prior tag), the manifest version is used
as-is — `--bump` is ignored. To start at a different version, edit the
manifest first.

## Cutting a release — the manual way

If you want to bypass the helper (or you're debugging it), you can do it by
hand — same end result:

```bash
# 1. Bump the version in manifest.json
# 2. Sync the README download links
node scripts/release/update-readme.mjs

# 3. Commit + tag + push (atomically!)
git commit -am "release(web-design-engineer): 1.2.0"
git tag web-design-engineer-v1.2.0
git push origin main web-design-engineer-v1.2.0
```

The `release-skill` workflow validates that the tag matches `manifest.json#version`
and refuses to publish if they drift, so a typo here just fails CI rather than
shipping the wrong artifact.

## Other local commands

```bash
# Inspect everything
node scripts/release/list-skills.mjs
node scripts/release/list-skills.mjs --json

# Smoke-pack one or all skills (writes to dist/release/)
node scripts/release/pack-skill.mjs --skill web-design-engineer
node scripts/release/pack-skill.mjs --all

# Override the output directory
node scripts/release/pack-skill.mjs --all --out /tmp/release

# Sync README download links to current manifest versions
node scripts/release/update-readme.mjs

# CI-style check (exit 1 if any block is stale)
node scripts/release/update-readme.mjs --check
```

## Adding a new skill

1. Create `skills/<new-name>/` with at minimum `SKILL.md` + `manifest.json`.
2. Append the `<!-- DOWNLOAD:<new-name>:start --><!-- DOWNLOAD:<new-name>:end -->`
   inline marker to the end of the new skill's "Links:" / "链接：" row in both
   `README.md` and `README.zh-CN.md` (preceded by ` · ` for visual consistency).
3. Run `node scripts/release/update-readme.mjs` to populate the placeholder.
4. Commit, then tag the first release: `git tag <new-name>-v0.1.0`.

That's it — no other files need to change. The release workflow is generic.

## Design notes

- **Why a separate `manifest.json` instead of new fields in `SKILL.md` frontmatter?**
  We want the manifest to be machine-readable JSON without depending on a YAML
  parser at runtime, and we want fields like `version` / `compat` to be
  decoupled from the agent-facing `SKILL.md` contract.
- **Why per-skill SemVer instead of repo-wide versioning?**
  Skills evolve at very different cadences (`web-video-presentation` may iterate
  weekly, `web-design-engineer` may sit at v1.x for months). Coupling them
  punishes downstream pinning.
- **Why no rolling-latest tag?**
  GitHub already provides `releases/latest/download/<asset>` for the most-recent
  release in the repo, and per-skill pinned URLs in the README are auto-rewritten
  on every release — so there's no value in maintaining a third URL flavour.
- **Why no npm package?**
  The community-maintained [`npx skills`](https://www.npmjs.com/package/skills)
  CLI already understands this repo's layout (sub-paths, tag URLs, agent
  detection), so re-implementing the same install UX as a private CLI would only
  fragment the ecosystem.
