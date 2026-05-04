import { useEffect, useRef } from "react";

export type PlaybackMode = "manual" | "audio" | "auto";

interface Options {
  /** Audio file path. `null` = no audio for this step (silent). */
  src: string | null;
  /** `manual` = no playback. `audio` = play but don't auto-advance.
   *  `auto` = play and auto-advance when finished. */
  mode: PlaybackMode;
  /** Optional minimum hold (ms) for the current step in `auto` mode.
   *  Effective hold = max(audio duration, minHoldMs). */
  minHoldMs?: number;
  /** Extra ms to wait after audio (or minHold) finishes, in `auto` mode.
   *  Gives chapter close-out animations a small breathing room. */
  trailMs?: number;
  /** Called when `auto` mode determines the step is finished. */
  onAutoAdvance: () => void;
  /** Has the user started auto playback? (Browsers block autoplay until
   *  the page receives a user gesture; the AutoStartGate flips this.) */
  autoStarted: boolean;
}

/**
 * Per-step audio playback for the presentation.
 *
 * Manages a single hidden `<audio>` element. Switches `src` whenever the
 * current step changes. In `auto` mode, advances to the next step when
 * audio finishes (or after `minHoldMs`, whichever is later) plus a small
 * trailing pad.
 *
 * If the audio file 404s (synthesis hasn't run yet), `auto` mode falls
 * back to a duration estimate of (text length × ~250ms / char) so the
 * presentation can still be previewed end-to-end without TTS output.
 *
 * The fallback duration is provided externally via `minHoldMs` — pass
 * `Math.max(estimateMs, narrationMinHold)` from the App.
 */
export function useAudioPlayer({
  src,
  mode,
  minHoldMs = 0,
  trailMs = 600,
  onAutoAdvance,
  autoStarted,
}: Options) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Latest callback ref so timers don't capture stale closures.
  const onAdvanceRef = useRef(onAutoAdvance);
  onAdvanceRef.current = onAutoAdvance;

  useEffect(() => {
    // Tear down any previous audio instance.
    const prev = audioRef.current;
    if (prev) {
      prev.pause();
      prev.removeAttribute("src");
      prev.load();
      audioRef.current = null;
    }

    if (mode === "manual") return;
    if (mode === "auto" && !autoStarted) return;

    const startedAt = Date.now();
    let advanced = false;
    let trailTimer: number | null = null;
    let estimateTimer: number | null = null;

    const scheduleAdvance = (audioEndedAt: number) => {
      if (mode !== "auto" || advanced) return;
      const minHoldDoneAt = startedAt + minHoldMs;
      const advanceAt = Math.max(audioEndedAt, minHoldDoneAt) + trailMs;
      const wait = Math.max(0, advanceAt - Date.now());
      trailTimer = window.setTimeout(() => {
        if (advanced) return;
        advanced = true;
        onAdvanceRef.current();
      }, wait);
    };

    if (src) {
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.preload = "auto";

      audio.addEventListener("ended", () => scheduleAdvance(Date.now()));
      audio.addEventListener("error", () => {
        // Audio file missing or undecodable — fall back to estimate.
        if (mode === "auto") scheduleEstimateOnly();
      });

      audio.play().catch((err) => {
        // Autoplay blocked (rare, AutoStartGate should prevent this) or
        // file missing — fall back to estimate in auto mode.
        console.warn("audio play failed:", err);
        if (mode === "auto") scheduleEstimateOnly();
      });
    } else if (mode === "auto") {
      // No audio src at all — use minHoldMs only.
      scheduleEstimateOnly();
    }

    function scheduleEstimateOnly() {
      if (advanced) return;
      const advanceAt = startedAt + Math.max(minHoldMs, 1500);
      const wait = Math.max(0, advanceAt - Date.now()) + trailMs;
      estimateTimer = window.setTimeout(() => {
        if (advanced) return;
        advanced = true;
        onAdvanceRef.current();
      }, wait);
    }

    return () => {
      advanced = true;
      if (trailTimer != null) clearTimeout(trailTimer);
      if (estimateTimer != null) clearTimeout(estimateTimer);
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
        audioRef.current = null;
      }
    };
  }, [src, mode, minHoldMs, trailMs, autoStarted]);
}
