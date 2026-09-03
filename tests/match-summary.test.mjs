import assert from "node:assert/strict";
import test from "node:test";
import { addResolutionEvents, createMatchStats, primaryWeapon, resultFlavor, resultSummary, resultTitle } from "../lib/match-summary.ts";

test("battle summary accumulates only the current player's actions", () => {
  const stats = addResolutionEvents(createMatchStats(), [
    { type: "remove", side: "cyan", cell: "0,2" },
    { type: "move_blocked", side: "red", reason: "removed" },
    { type: "attack", side: "cyan", weapon: "sword", direction: 1 },
    { type: "die", side: "cyan", weapon: "sword", roll: 6, hit: true },
    { type: "damage", side: "cyan", targetSide: "red", weapon: "sword", damage: 2 },
    { type: "attack", side: "red", weapon: "staff", direction: 4 },
    { type: "die", side: "red", weapon: "staff", roll: 4, hit: true },
  ], "cyan");

  assert.deepEqual({
    attacks: stats.attacks,
    diceRolls: stats.diceRolls,
    hits: stats.hits,
    damage: stats.damage,
    maxRoll: stats.maxRoll,
    removals: stats.removals,
    routeBreaks: stats.routeBreaks,
  }, { attacks: 1, diceRolls: 1, hits: 1, damage: 2, maxRoll: 6, removals: 1, routeBreaks: 1 });
  assert.equal(primaryWeapon(stats, "bow"), "sword");
  assert.equal(resultTitle(stats, "cyan", "cyan"), "断路工程师");
  assert.equal(resultSummary(stats, "sword"), "长剑主战 · 100% 命中 · 2 点伤害");
  assert.deepEqual(resultFlavor(stats, "cyan", "cyan", 4), {
    grade: "A",
    gradeLabel: "战术在线",
    style: "封路派",
    quote: "路不是没了，是我替你选好了。",
    moments: [
      { mark: "断", value: "1 次", label: "截断走位" },
      { mark: "准", value: "100%", label: "攻击命中" },
      { mark: "伤", value: "2 点", label: "累计伤害" },
    ],
  });
});

test("battle summary creates useful defeat and draw labels", () => {
  const unlucky = addResolutionEvents(createMatchStats(), [
    { type: "attack", side: "cyan", weapon: "bow", direction: 1 },
    { type: "die", side: "cyan", weapon: "bow", roll: 2, hit: false },
  ], "cyan");
  assert.equal(resultTitle(unlucky, "red", "cyan"), "骰运欠你一局");
  assert.equal(resultTitle(createMatchStats(), "draw", "cyan"), "棋逢对手");
  assert.equal(resultFlavor(unlucky, "red", "cyan", 0).quote, "方向已经猜中，只差骰子站到我这边。");
});
