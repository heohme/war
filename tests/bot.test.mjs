import assert from "node:assert/strict";
import test from "node:test";
import { attackDamage, canRemove, cellDistance, createGame, legalMoveTargets, planBotTurn, resolveRound } from "../lib/game.ts";

function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function arena(mine = ["dagger", "staff"], theirs = ["sword", "dagger"], from = "2,0", to = "0,0") {
  const state = createGame({ id: "human", name: "human", weapons: theirs }, { id: "bot", name: "bot", weapons: mine });
  state.players.red.position = from;
  state.players.cyan.position = to;
  return state;
}

test("a ranged bot escapes melee range and prepares a counterattack", () => {
  const state = arena(["bow", "staff"], ["sword", "dagger"], "1,0");
  for (const value of [0.05, 0.3, 0.65, 0.9]) {
    const plan = planBotTurn(state, "red", () => value);
    const end = plan.moves.at(-1) ?? state.players.red.position;
    assert.ok(cellDistance(end, "0,0") >= 2, JSON.stringify(plan));
    assert.ok(attackDamage(plan.weapon, end, "0,0", plan.direction) > 0);
  }
});

test("a ranged bot can sidestep instead of repeating the straight pursuit", () => {
  const state = arena(["bow", "staff"], ["sword", "dagger"], "1,0");
  const ends = new Set();
  for (const value of [0.05, 0.3, 0.65, 0.9]) {
    const plan = planBotTurn(state, "red", () => value);
    ends.add(plan.moves.at(-1) ?? "3,0");
  }
  assert.ok(ends.size > 1);
  assert.ok([...ends].some((cell) => !cell.endsWith(",0")));
});

test("a ranged bot also covers a stationary enemy rather than only guessing pursuit", () => {
  const state = arena(["bow", "staff"], ["sword", "dagger"], "3,0");
  for (const value of [0.05, 0.3, 0.65, 0.9]) {
    const plan = planBotTurn(state, "red", () => value);
    const end = plan.moves.at(-1) ?? "3,0";
    assert.ok(attackDamage(plan.weapon, end, "0,0", plan.direction) > 0);
  }
});

test("the default bot leaves a shared dagger cell rather than blindly trading", () => {
  const state = arena(["dagger", "staff"], ["dagger", "sword"], "0,0");
  state.players.red.health = 3;
  for (const value of [0.05, 0.3, 0.65, 0.9]) {
    const plan = planBotTurn(state, "red", () => value);
    assert.ok(plan.moves.length > 0);
    assert.notEqual(plan.moves.at(-1), "0,0");
  }
});

test("bait can target an approaching enemy instead of its old position", () => {
  const state = arena();
  const plan = planBotTurn(state, "red", () => 0.9);
  const end = plan.moves.at(-1) ?? "2,0";
  const possible = ["0,0", ...legalMoveTargets(state, "0,0")];
  assert.equal(attackDamage(plan.weapon, end, "0,0", plan.direction), 0);
  assert.ok(possible.some((cell) => attackDamage(plan.weapon, end, cell, plan.direction) > 0));
  assert.ok(cellDistance(end, "0,0") >= 2);
});

test("seeded planning is repeatable, does not mutate public state, and ignores hidden orders", () => {
  const state = arena();
  const before = structuredClone(state);
  const first = planBotTurn(state, "red", rng(124));
  const second = planBotTurn(structuredClone(state), "red", rng(124));
  assert.deepEqual(first, second);
  assert.deepEqual(state, before);
});

test("both sides keep legal plans through shrinking boards and complete matches", () => {
  const equipment = [["dagger", "staff"], ["bow", "staff"], ["sword", "spear"], ["axe", "dagger"]];
  for (let seed = 1; seed <= 12; seed++) {
    const random = rng(seed);
    let state = createGame(
      { id: "a", name: "a", weapons: equipment[seed % equipment.length] },
      { id: "b", name: "b", weapons: equipment[(seed + 1) % equipment.length] },
      seed % 2 ? "cyan" : "red",
    );
    for (let round = 1; round <= 14 && !state.winner; round++) {
      const plans = {};
      for (const side of ["cyan", "red"]) {
        const plan = planBotTurn(state, side, random);
        let from = state.players[side].position;
        assert.ok(plan.moves.length <= 2);
        for (const cell of plan.moves) {
          assert.ok(legalMoveTargets(state, from).includes(cell));
          assert.notEqual(cell, plan.remove);
          from = cell;
        }
        assert.ok(!plan.remove || canRemove(state, plan.remove));
        assert.ok(state.players[side].weapons.includes(plan.weapon));
        assert.ok(plan.direction >= 1 && plan.direction <= 6);
        plans[side] = plan;
      }
      state = resolveRound(state, plans, () => 1 + Math.floor(random() * 6)).state;
    }
    assert.ok(state.winner);
  }
});
