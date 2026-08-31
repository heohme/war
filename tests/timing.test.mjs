import assert from "node:assert/strict";
import test from "node:test";

import {
  DICE_RESULT_HOLD_MS,
  DICE_ROLL_DURATION_MS,
  PLANNING_DURATION_MS,
  PLANNING_DURATION_SECONDS,
  replayDelay,
  resolutionPlaybackDuration,
} from "../lib/timing.ts";

test("planning gives both players a 45 second confirmation window", () => {
  assert.equal(PLANNING_DURATION_SECONDS, 45);
  assert.equal(PLANNING_DURATION_MS, 45_000);
});

test("dice result remains visible before the next resolution event", () => {
  assert.equal(DICE_ROLL_DURATION_MS, 1_050);
  assert.equal(DICE_RESULT_HOLD_MS, 1_500);
  assert.equal(replayDelay({ type: "die" }), 2_550);
  assert.ok(DICE_RESULT_HOLD_MS >= 1_000 && DICE_RESULT_HOLD_MS <= 2_000);
});

test("server resolution window includes the extended dice playback", () => {
  const events = [
    { type: "attack", side: "cyan" },
    { type: "die", side: "cyan", roll: 6 },
    { type: "damage", side: "cyan", damage: 2 },
    { type: "round_end", round: 2 },
  ];
  assert.ok(resolutionPlaybackDuration(events) >= 7_000);
  assert.ok(resolutionPlaybackDuration(events) > replayDelay(events[1]));
});
