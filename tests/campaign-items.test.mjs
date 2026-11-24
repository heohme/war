import assert from "node:assert/strict";
import test from "node:test";
import { CACHE_CELL, itemTargets } from "../lib/campaign-items.ts";
import { finishBattle, newCampaign, resolveOrders, retryBattle, takeSupply, travel } from "../lib/campaign.ts";
import { nextTrailCell } from "../lib/campaign-guide.ts";

function encounter(enemy, bag) {
  let state = { ...newCampaign(), bag, recruits: enemy === "lvbu" ? ["guanyu", "zhangfei"] : [] };
  while (!state.battle) state = travel(state, nextTrailCell(state.position, enemy));
  return state;
}
const stay = cell => ({ cell, target: null });
const use = (cell, slot, mark) => ({ cell, target: null, item: { slot, mark } });

test("map supply is optional, unique and never overwrites a full bag implicitly", () => {
  const start = newCampaign();
  assert.equal(takeSupply(start), start);
  const arrived = travel(travel(start, "-3,0"), CACHE_CELL);
  const found = takeSupply(arrived);
  assert.deepEqual(found.bag, ["smoke", null]);
  assert.equal(takeSupply(found), found);
  const full = { ...arrived, bag: ["hook", "barrier"] };
  assert.equal(takeSupply(full), full);
  assert.equal(takeSupply(full, 2), full);
  assert.deepEqual(takeSupply(full, 1).bag, ["hook", "smoke"]);
});

test("spoils allow duplicates, replacement or decline only on a recruit victory", () => {
  const first = encounter("guanyu", ["barrier", null]);
  assert.equal(finishBattle(first, "hook"), first);
  const won = { ...first, battle: { ...first.battle, status: "won" } };
  assert.equal(finishBattle(won, "smoke"), won);
  const duplicates = finishBattle(won, "barrier");
  assert.deepEqual(duplicates.bag, ["barrier", "barrier"]);
  assert.equal(finishBattle(duplicates, "hook"), duplicates);
  const full = { ...won, bag: duplicates.bag };
  assert.equal(finishBattle(full, "hook"), full);
  assert.deepEqual(finishBattle(full, "hook", 0).bag, ["hook", "barrier"]);
  assert.deepEqual(finishBattle(full).bag, full.bag);
});

test("smoke replaces an attack, blocks one counter and expires; retry restores the entry bag", () => {
  const start = encounter("guanyu", ["smoke", null]);
  const fight = { ...start, battle: { ...start.battle, demonstration: false } };
  const shielded = resolveOrders(fight, { liubei: use("0,0", 0, "liubei") });
  assert.deepEqual(shielded.bag, [null, null]);
  assert.equal(shielded.battle.hp, fight.battle.hp);
  assert.equal(shielded.battle.party[0].hp, fight.battle.party[0].hp);
  assert.match(shielded.battle.report, /烟幕抵消 1/);
  const exposed = resolveOrders(shielded, { liubei: stay("0,0") });
  assert.equal(exposed.battle.party[0].hp, fight.battle.party[0].hp - 1);
  const retry = retryBattle({ ...exposed, battle: { ...exposed.battle, status: "lost" } });
  assert.deepEqual(retry.bag, ["smoke", null]);
});

test("barricade prevents the step into E3 for exactly one enemy phase", () => {
  const fight = encounter("guanyu", ["barrier", null]);
  const ordinary = resolveOrders(fight, { liubei: stay("-1,0") });
  const blocked = resolveOrders(fight, { liubei: use("-1,0", 0, "0,0") });
  assert.equal(ordinary.battle.cell, "0,0");
  assert.notEqual(blocked.battle.cell, "0,0");
  assert.equal(resolveOrders(blocked, { liubei: stay("-1,0") }).battle.cell, "0,0");
  assert.equal(resolveOrders(fight, { liubei: use("0,0", 0, fight.battle.cell) }), fight);
});

test("hook pulls a living ally after its attack, invalid plans consume nothing", () => {
  const start = encounter("lvbu", ["hook", "smoke"]);
  const party = start.battle.party.map(p => p.hero === "guanyu" ? { ...p, cell: "1,0" } : p);
  const fight = { ...start, battle: { ...start.battle, party } };
  const orders = { liubei: use("-1,0", 0, "guanyu"), guanyu: { cell: "1,0", target: "1,0" }, zhangfei: stay("-1,1") };
  const next = resolveOrders(fight, orders);
  assert.equal(next.battle.party[1].cell, "0,0");
  assert.equal(next.battle.hp, 17);
  assert.deepEqual(next.bag, [null, "smoke"]);
  const duplicate = { ...orders, zhangfei: use("-1,1", 0, "guanyu") };
  assert.equal(resolveOrders(fight, duplicate), fight);
  assert.equal(resolveOrders(fight, { ...orders, guanyu: stay("0,0") }), fight);
  assert.equal(resolveOrders(fight, { ...orders, liubei: { ...orders.liubei, target: "1,0" } }), fight);
  const down = party.map(p => p.hero === "guanyu" ? { ...p, hp: 0 } : p);
  assert.equal(itemTargets("hook", "liubei", down, "1,0").length, 0);
});
