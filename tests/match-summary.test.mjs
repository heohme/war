import assert from "node:assert/strict";
import test from "node:test";
import { addResolutionEvents, createMatchStats, primaryWeapon, resultFlavor, resultReview, resultSummary, resultTitle } from "../lib/match-summary.ts";
import { createGame, resolveRound } from "../lib/game.ts";

test("battle summary accumulates only the current player's actions", () => {
  const stats = addResolutionEvents(createMatchStats(), [
    { type: "remove", side: "cyan", cell: "0,2" },
    { type: "move_blocked", side: "red", reason: "removed", to: "0,2" },
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
  assert.equal(resultSummary(stats, "sword"), "长剑主战 · 1/1 次攻击命中 · 2 点伤害");
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
  assert.equal(resultTitle(unlucky, "red", "cyan"), "入围后未命中");
  assert.equal(resultTitle(createMatchStats(), "draw", "cyan"), "棋逢对手");
  assert.match(resultFlavor(unlucky, "red", "cyan", 0).quote, /进入了攻击范围，但骰点未达门槛/);
});

function arena() {
  return createGame({ id: "c", name: "c", weapons: ["sword", "bow"] },
    { id: "r", name: "r", weapons: ["sword", "bow"] });
}

test("out-of-range attacks are prediction misses, not unlucky dice", () => {
  const game = arena();
  game.players.cyan.position = "0,0"; game.players.red.position = "2,0";
  const { events } = resolveRound(game, {
    cyan: { moves: [], weapon: "sword", direction: 1 }, red: { moves: ["2,1"] },
  }, () => assert.fail("an out-of-range attack must not roll"));
  const stats = addResolutionEvents(createMatchStats(), events, "cyan");
  assert.equal(stats.predictionMisses, 1);
  assert.equal(stats.diceRolls, 0); assert.equal(stats.diceMisses, 0);
  assert.equal(resultReview(stats).kind, "prediction");
  assert.doesNotMatch(resultFlavor(stats, "red", "cyan", 0).quote, /骰/);
  assert.match(resultSummary(stats, "sword"), /0\/1 次攻击命中/);
});

test("a route-induced range miss is reported once without blaming prediction or dice", () => {
  const game = arena();
  game.players.cyan.position = "-3,0"; game.players.red.position = "0,-1";
  const { events } = resolveRound(game, {
    cyan: { moves: ["-3,-1", "-2,-1"], weapon: "bow", direction: 1 },
    red: { remove: "-3,-1", moves: [] },
  });
  const stats = addResolutionEvents(createMatchStats(), events, "cyan");
  assert.equal(stats.routesInterrupted, 1); assert.equal(stats.blockedAttackMisses, 1);
  assert.equal(stats.predictionMisses, 0); assert.equal(stats.diceMisses, 0);
  assert.equal(stats.routeBreaks, 0); assert.equal(resultReview(stats).kind, "route");
  assert.match(resultFlavor(stats, "red", "cyan", 0).quote, /实际停下的位置/);
});

test("a failed roll only counts after the target enters attack range", () => {
  const game = arena();
  game.players.cyan.position = "0,0"; game.players.red.position = "1,0";
  const { events } = resolveRound(game, {
    cyan: { moves: [], weapon: "sword", direction: 1 }, red: { moves: [] },
  }, () => 1);
  const stats = addResolutionEvents(createMatchStats(), events, "cyan");
  assert.equal(stats.diceMisses, 1); assert.equal(stats.predictionMisses, 0);
  assert.equal(resultReview(stats).kind, "dice");
});

test("route attribution resets between rounds and tracks both player perspectives", () => {
  const current = createMatchStats();
  const events = [
    { type: "remove", side: "red", cell: "-3,-1" },
    { type: "move_blocked", side: "cyan", to: "-3,-1", reason: "removed" },
    { type: "attack", side: "cyan", weapon: "bow" },
    { type: "attack_missed_range", side: "cyan" },
    { type: "round_end" },
    { type: "attack", side: "cyan", weapon: "bow" },
    { type: "attack_missed_range", side: "cyan" },
  ];
  const stats = addResolutionEvents(current, events, "cyan");
  assert.equal(stats.blockedAttackMisses, 1); assert.equal(stats.predictionMisses, 1);
  assert.equal(resultReview(stats).kind, "mixed");
  assert.equal(addResolutionEvents(current, events, "red").routeBreaks, 1);
  assert.equal(current.routesInterrupted, 0);
  assert.equal(addResolutionEvents(stats, [{ type: "attack_missed_range", side: "cyan" }], "cyan").predictionMisses, 2);
  // An opponent removing its own route must not earn us interception credit.
  assert.equal(addResolutionEvents(current, [
    { type: "remove", side: "red", cell: "0,2" },
    { type: "move_blocked", side: "red", to: "0,2", reason: "removed" },
  ], "cyan").routeBreaks, 0);
});

test("blocked routes can still hit, and successful hits do not erase the interruption", () => {
  const stats = addResolutionEvents(createMatchStats(), [
    { type: "move_blocked", side: "cyan", reason: "removed" },
    { type: "attack", side: "cyan", weapon: "sword" },
    { type: "die", side: "cyan", roll: 2, hit: true },
  ], "cyan");
  assert.equal(stats.routesInterrupted, 1); assert.equal(stats.blockedAttackMisses, 0);
  assert.equal(stats.hits, 1); assert.equal(resultReview(stats).title, "路线受阻");
});

test("no-attack and lethal initiative losses are explained without inventing dice failures", () => {
  const game = arena();
  game.initiative = "red";
  game.players.cyan.position = game.players.red.position = "0,0";
  game.players.cyan.health = 1;
  const { events } = resolveRound(game, {
    cyan: { moves: [], weapon: "sword", direction: 1 },
    red: { moves: [], weapon: "sword", direction: 1 },
  }, () => 6);
  const stats = addResolutionEvents(createMatchStats(), events, "cyan");
  assert.equal(stats.attacks, 0); assert.equal(stats.attacksCancelled, 1);
  assert.equal(stats.damageTaken, 2); assert.match(resultReview(stats).advice, /先后手/);
  assert.equal(resultSummary(stats, "sword"), "长剑主战 · 尚未出手 · 0 点伤害");
  const skipped = addResolutionEvents(createMatchStats(), [{ type: "attack_skipped", side: "cyan" }], "cyan");
  assert.equal(skipped.skippedAttacks, 1); assert.match(resultReview(skipped).advice, /未完成攻击/);
  assert.equal(addResolutionEvents(skipped, [
    { type: "attack_skipped", side: "cyan" },
    { type: "defeated", side: "red", targetSide: "cyan" },
  ], "cyan").attacksCancelled, 0);
});

test("low successful rolls and a six alone do not create an unlucky-loss narrative", () => {
  const stats = addResolutionEvents(createMatchStats(), [
    { type: "attack", side: "cyan", weapon: "sword" },
    { type: "die", side: "cyan", roll: 2, hit: true },
    { type: "damage", side: "cyan", damage: 2 },
    { type: "damage", side: "red", targetSide: "cyan", damage: 6 },
  ], "cyan");
  assert.equal(resultReview(stats).kind, "trade");
  assert.match(resultFlavor(stats, "red", "cyan", 0).quote, /承受 6 点伤害/);
  assert.doesNotMatch(resultTitle(stats, "red", "cyan"), /骰/);
  assert.equal(createMatchStats().diceMisses, 0);
});
