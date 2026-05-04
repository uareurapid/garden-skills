import type { Narration } from "../../registry/types";

/**
 * Per-step narration for this chapter.
 *
 * Length === number of steps the chapter component renders.
 * Index i === the spoken text for `step === i` in `Example.tsx`.
 *
 * Audio synthesis uses this file directly (see scripts/extract-narrations.ts).
 * Auto-play mode plays `public/audio/<chapter-id>/<i+1>.mp3` at each step
 * and advances when the audio ends (or after `minHoldMs`, whichever is
 * later).
 *
 * Plain string  → step duration is bounded by the audio length only.
 * `{ text, minHoldMs }` → also wait at least `minHoldMs` before advancing
 *    (use this when the visual animation in this step is longer than the
 *    audio narration).
 */
export const narrations: Narration[] = [
  // step 0 — magazine cover
  "这是示例章节的第一步。把这一行换成你这一步的口播文案。",
  // step 1 — split layout
  "第二步。每个数组元素对应章节里 step === N 的那一屏。长度必须严格相等。",
  // step 2 — pull-quote close
  "第三步。这个数组就是音频合成 + 自动播放的唯一真相源——再也不会和章节代码漂移。",
];
