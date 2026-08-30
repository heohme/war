import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_CELLS, attackDamage, canRemove, createGame, isConnected, isOuterEdge, resolveRound, weaponAimCells, weaponAttackCells, weaponHitChance } from "../lib/game.ts";

const cyan = { id: "c", name: "青", weapons: ["sword", "bow"] };
const red = { id: "r", name: "赤", weapons: ["sword", "bow"] };

test("elliptical arena has 33 connected cells and protects occupied cells", () => {
  const game = createGame(cyan, red);
  assert.equal(BOARD_CELLS.length, 33);
  assert.equal(isConnected([]), true);
  assert.equal(isOuterEdge(game, "0,0"), false);
  assert.equal(canRemove(game, "0,0"), false);
  assert.equal(canRemove(game, "0,2"), true);
  assert.equal(canRemove(game, "-4,0"), false);
  assert.equal(canRemove(game, "4,0"), false);
});

test("a newly removed tile interrupts a preplanned route", () => {
  const game = createGame(cyan, red, "red");
  const { state, events } = resolveRound(game, {
    cyan: { moves: ["-3,-1", "-2,-1"], weapon: "sword", direction: 1 },
    red: { remove: "-3,-1", moves: [], weapon: "bow", direction: 4 },
  }, () => 6);
  assert.equal(state.players.cyan.position, "-4,0");
  assert.ok(events.some((event) => event.type === "move_blocked" && event.side === "cyan"));
});

test("both players removing one tile consumes the second chance", () => {
  const game = createGame(cyan, red, "cyan");
  const { events } = resolveRound(game, {
    cyan: { remove: "0,2", moves: [] }, red: { remove: "0,2", moves: [] },
  });
  assert.equal(events.filter((event) => event.type === "remove").length, 1);
  assert.equal(events.filter((event) => event.type === "remove_failed").length, 1);
});

test("melee can hit the same cell while bow cannot", () => {
  assert.equal(attackDamage("sword", "0,0", "0,0", 1), 2);
  assert.equal(attackDamage("spear", "0,0", "0,0", 1), 1);
  assert.equal(attackDamage("axe", "0,0", "0,0", 1), 1);
  assert.equal(attackDamage("bow", "0,0", "0,0", 1), 0);
});

test("weapon patterns expose balanced damage, hit chance, and click targets", () => {
  assert.equal(weaponHitChance("sword"), 5 / 6);
  assert.equal(weaponHitChance("axe"), 4 / 6);
  assert.equal(weaponHitChance("spear"), 4 / 6);
  assert.equal(weaponHitChance("bow"), 3 / 6);

  assert.equal(attackDamage("sword", "0,0", "1,0", 1), 2);
  assert.equal(attackDamage("sword", "0,0", "2,0", 1), 1);
  assert.equal(attackDamage("spear", "0,0", "1,-2", 2), 2);
  assert.equal(attackDamage("bow", "0,0", "2,0", 1), 1);
  assert.equal(attackDamage("bow", "0,0", "3,0", 1), 2);

  const axe = new Map(weaponAttackCells("axe", "0,0", 1).map((item) => [item.cell, item.damage]));
  assert.equal(axe.get("1,0"), 2);
  assert.equal(axe.get("0,-1"), 1);
  assert.equal(axe.get("0,1"), 1);
  assert.equal(weaponAimCells("bow", "0,0").filter((item) => item.direction === 1).length, 3);
});

test("initiative kill cancels the defeated player's attack", () => {
  const game = createGame(cyan, red, "cyan");
  game.players.cyan.position = "0,0"; game.players.red.position = "0,0";
  game.players.cyan.health = 1; game.players.red.health = 1;
  const { state, events } = resolveRound(game, {
    cyan: { moves: [], weapon: "sword", direction: 1 },
    red: { moves: [], weapon: "sword", direction: 1 },
  }, () => 2);
  assert.equal(state.winner, "cyan");
  assert.equal(events.filter((event) => event.type === "die").length, 1);
});
