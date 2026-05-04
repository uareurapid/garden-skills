#!/usr/bin/env node
// Rewrites the <!-- DOWNLOAD:<skill>:start --> ... <!-- DOWNLOAD:<skill>:end -->
// blocks in README.md and README.zh-CN.md so they always reflect the current
// version declared in skills/<name>/manifest.json.
//
// Idempotent: running it twice in a row produces no diff.
//
// Usage:
//   node scripts/release/update-readme.mjs           # rewrite both READMEs
//   node scripts/release/update-readme.mjs --check   # exit 1 if anything would change
//   node scripts/release/update-readme.mjs --repo ConardLi/garden-skills

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { REPO_ROOT, loadAllManifests, buildTag, zipName } from "./lib/skills.mjs";

const DEFAULT_REPO = "ConardLi/garden-skills";

const FILES = [
  { path: path.join(REPO_ROOT, "README.md"), lang: "en" },
  { path: path.join(REPO_ROOT, "README.zh-CN.md"), lang: "zh" },
];

const COPY = {
  en: { label: "Download v%V .zip" },
  zh: { label: "下载 v%V .zip" },
};

// Per-skill block is intentionally a single inline link — appended to the
// existing "Links:" / "链接：" row of each skill section. All other install
// flavours (npx, marketplace, manual copy, submodule) live in the unified
// Install section below.
//
// The URL points at the pinned zip for the current manifest version. It's
// auto-rewritten on every release, so the README always advertises the most
// recent immutable artifact for that skill — no rolling-tag plumbing needed.
function buildBlock(skill, version, repo, lang) {
  const tag = buildTag(skill, version);
  const zip = zipName(skill, version);
  const url = `https://github.com/${repo}/releases/download/${tag}/${zip}`;
  const label = COPY[lang].label.replace("%V", version);
  return `[${label}](${url})`;
}

function rewrite(content, blocks) {
  let out = content;
  for (const [skill, body] of Object.entries(blocks)) {
    const re = new RegExp(
      `(<!--\\s*DOWNLOAD:${escapeRe(skill)}:start\\s*-->)([\\s\\S]*?)(<!--\\s*DOWNLOAD:${escapeRe(skill)}:end\\s*-->)`,
      "g",
    );
    if (!re.test(out)) {
      console.warn(`[readme] WARNING: no DOWNLOAD marker found for "${skill}"`);
      continue;
    }
    out = out.replace(
      new RegExp(
        `(<!--\\s*DOWNLOAD:${escapeRe(skill)}:start\\s*-->)([\\s\\S]*?)(<!--\\s*DOWNLOAD:${escapeRe(skill)}:end\\s*-->)`,
        "g",
      ),
      (_m, start, _mid, end) => `${start}${body}${end}`,
    );
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const args = { check: false, repo: process.env.GITHUB_REPOSITORY || DEFAULT_REPO };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--repo") args.repo = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log("Usage: update-readme.mjs [--check] [--repo owner/repo]");
    return;
  }

  const manifests = await loadAllManifests();
  console.log(`[readme] repo=${args.repo}  skills=${manifests.length}`);

  let drift = false;
  for (const file of FILES) {
    const original = await readFile(file.path, "utf8");
    const blocks = Object.fromEntries(
      manifests.map((m) => [
        m.name,
        buildBlock(m.name, m.manifest.version, args.repo, file.lang),
      ]),
    );
    const updated = rewrite(original, blocks);

    if (updated === original) {
      console.log(`[readme] ${path.relative(REPO_ROOT, file.path)}: up-to-date`);
      continue;
    }
    drift = true;
    if (args.check) {
      console.error(
        `[readme] ${path.relative(REPO_ROOT, file.path)}: OUT OF DATE (run \`node scripts/release/update-readme.mjs\`)`,
      );
    } else {
      await writeFile(file.path, updated, "utf8");
      console.log(`[readme] ${path.relative(REPO_ROOT, file.path)}: rewritten`);
    }
  }

  if (args.check && drift) process.exit(1);
}

main().catch((err) => {
  console.error(`[readme] ERROR: ${err.message}`);
  process.exit(1);
});
