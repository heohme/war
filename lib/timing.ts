import type { ResolutionEvent } from "./game";

export const PLANNING_DURATION_SECONDS = 45;
export const PLANNING_DURATION_MS = PLANNING_DURATION_SECONDS * 1_000;

export const DICE_ROLL_DURATION_MS = 1_050;
export const DICE_RESULT_HOLD_MS = 1_500;

export function replayDelay(event?: ResolutionEvent) {
  if (!event) return 650;
  if (event.type === "die") return DICE_ROLL_DURATION_MS + DICE_RESULT_HOLD_MS;
  if (event.type === "damage" || event.type === "remove") return 1_050;
  if (event.type === "round_end") return 850;
  return 900;
}

export function resolutionPlaybackDuration(events: ResolutionEvent[]) {
  const eventDelays = events.reduce((duration, _event, index) => (
    duration + replayDelay(index > 0 ? events[index - 1] : undefined)
  ), 0);
  return Math.max(7_000, eventDelays + 900);
}
