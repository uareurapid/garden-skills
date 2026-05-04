/**
 * extract-narrations.ts — collect every chapter's narration array and emit
 * a flat segment list that the TTS pipeline can consume.
 *
 * Run via:
 *   npm run extract-narrations           # writes audio-segments.json
 *   npm run extract-narrations -- --print # also prints to stdout
 *
 * Reads chapter order from src/registry/chapters.ts via a simple regex
 * (no React/CSS evaluation needed). For each chapter it dynamically
 * imports `src/chapters/<NN>-<id>/narrations.ts` (which is React-free)
 * and flattens to:
 *
 *   [
 *     { chapter, step, text, minHoldMs?, audio: "<chapter>/<step>.mp3" },
 *     ...
 *   ]
 *
 * Step indices in the JSON are 1-indexed, matching the audio file naming
 * convention (`public/audio/<chapter>/<N>.mp3`).
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const REGISTRY_PATH = resolve(ROOT, "src/registry/chapters.ts");
const CHAPTERS_DIR = resolve(ROOT, "src/chapters");
const OUT_PATH = resolve(ROOT, "audio-segments.json");

interface Segment {
  chapter: string;
  step: number;
  text: string;
  minHoldMs?: number;
  audio: string;
}

/** Parse `src/registry/chapters.ts` to learn chapter id order. */
async function readChapterOrder(): Promise<{ id: string; folder: string }[]> {
  const src = await readFile(REGISTRY_PATH, "utf8");
  // Match: id: "..."   AND   from "../chapters/<folder>/narrations"
  const ids: string[] = [];
  const folders: Record<string, string> = {};

  for (const m of src.matchAll(/id:\s*["']([^"']+)["']/g)) ids.push(m[1]!);
  for (const m of src.matchAll(
    /from\s+["']\.\.\/chapters\/([^"'\/]+)\/narrations["']/g,
  )) {
    // We map by import order; pair 1:1 with `ids`. Both orders are the
    // chapter declaration order in CHAPTERS so they line up.
    const folder = m[1]!;
    folders[folder] = folder;
  }

  // Map id → folder by reading each chapter's narrations.ts existence.
  // Folders are typically `<NN>-<id>`; fall back to plain `<id>` if not.
  const result: { id: string; folder: string }[] = [];
  for (const id of ids) {
    const candidates = Object.keys(folders).filter((f) => f.endsWith(`-${id}`));
    const folder = candidates[0] ?? Object.keys(folders).find((f) => f === id);
    if (!folder) {
      throw new Error(
        `chapter id "${id}" registered but no matching folder found ` +
          `under src/chapters/. Expected something like NN-${id}/narrations.ts`,
      );
    }
    result.push({ id, folder });
  }
  return result;
}

async function loadNarrations(folder: string): Promise<unknown[]> {
  const file = join(CHAPTERS_DIR, folder, "narrations.ts");
  if (!existsSync(file)) {
    throw new Error(`missing narrations.ts: ${file}`);
  }
  const url = pathToFileURL(file).href;
  const mod = await import(url);
  if (!Array.isArray(mod.narrations)) {
    throw new Error(
      `narrations.ts in ${folder} must export an array named "narrations"`,
    );
  }
  return mod.narrations as unknown[];
}

async function main() {
  const print = process.argv.includes("--print");
  const order = await readChapterOrder();

  const segments: Segment[] = [];
  for (const { id, folder } of order) {
    const arr = await loadNarrations(folder);
    arr.forEach((entry, i) => {
      const step = i + 1;
      const text = typeof entry === "string" ? entry : (entry as any).text;
      const minHoldMs =
        typeof entry === "string" ? undefined : (entry as any).minHoldMs;
      if (typeof text !== "string" || text.trim() === "") {
        throw new Error(
          `chapter "${id}" step ${step}: narration text is empty or not a string`,
        );
      }
      segments.push({
        chapter: id,
        step,
        text,
        ...(minHoldMs != null ? { minHoldMs } : {}),
        audio: `${id}/${step}.mp3`,
      });
    });
  }

  await writeFile(OUT_PATH, JSON.stringify(segments, null, 2) + "\n", "utf8");

  console.error(
    `✓ extracted ${segments.length} segments from ${order.length} chapters`,
  );
  console.error(`  → ${OUT_PATH}`);
  if (print) console.log(JSON.stringify(segments, null, 2));
}

main().catch((err) => {
  console.error(`✗ ${err.message ?? err}`);
  process.exit(1);
});
