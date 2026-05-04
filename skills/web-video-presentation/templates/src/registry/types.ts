import type { ComponentType } from "react";

export interface ChapterStepProps {
  step: number; // 0..(narrations.length - 1)
}

/**
 * One narration entry. Either a plain string (the spoken text), or an
 * object with a minimum hold time in milliseconds.
 *
 * Use `{ text, minHoldMs }` when the visual animation in this step takes
 * longer than the audio narration — Auto mode will wait for whichever
 * finishes last before advancing.
 */
export type Narration = string | { text: string; minHoldMs?: number };

export interface ChapterDef {
  id: string;
  title: string;
  /**
   * Per-step narration text. **Length === total steps in this chapter.**
   * This is the single source of truth for step count and audio synthesis.
   */
  narrations: Narration[];
  Component: ComponentType<ChapterStepProps>;
}

/** Helper: extract the spoken text from a Narration entry. */
export function narrationText(n: Narration): string {
  return typeof n === "string" ? n : n.text;
}

/** Helper: extract the optional minimum hold (ms) from a Narration entry. */
export function narrationMinHold(n: Narration): number | undefined {
  return typeof n === "string" ? undefined : n.minHoldMs;
}
