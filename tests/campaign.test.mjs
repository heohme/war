import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_IDS, cellDistance, isAdjacent } from "../lib/game.ts";
import {
  ENCOUNTERS, ROUND_LIMIT, aimedStrike, heroDamage, finishBattle, maxHp, newCampaign,
  resolveOrders, retryBattle, travel,
} from "../lib/campaign.ts";

import { nextTrailCell } from "../lib/campaign-guide.ts";

// Walk just as a player would, one adjacent tile at a time.
function walk(state, enemy) {
  const goal = ENCOUNTERS[enemy].cell;
  while (state.position !== goal) {
    const next = [...BOARD_IDS].find(cell => isAdjacent(cell, state.position)
      && cellDistance(cell, goal) < cellDistance(state.position, goal));
    const moved = travel(state, next);
    if (moved.position === state.position) return moved;
    state = moved;
  }
  return state;
}

function plan(state) {
  const { battle } = state;
  const orders = {};
  for (const p of battle.party.filter(p => p.hp > 0)) {
    let best = -Infinity;
    for (const cell of BOARD_IDS) {
      if (cell !== p.cell && !isAdjacent(p.cell, cell)) continue;
      const order = {cell, target:battle.cell};
      const damage = heroDamage(p.hero, order, battle.cell, state.recruits.length);
      const score = damage * 10 - cellDistance(cell,battle.cell);
      if (score > best) { best = score; orders[p.hero] = damage ? order : {cell,target:null}; }
    }
  }
  return orders;
}
test("exploration protects the gate and rejects jumps", () => {
  const start = newCampaign();
  assert.equal(travel(start, ENCOUNTERS.lvbu.cell), start);
  const locked = walk(start, "lvbu");
  assert.equal(locked.battle, null);
  assert.match(locked.message, /关门紧闭/);
});
test("the opening sword hits the current enemy tile before the enemy can step or retaliate", () => {
  const state = walk(newCampaign(), "guanyu");
  const battle = state.battle;
  const orders = {liubei:{cell:"0,0",target:battle.cell}};
  const next = resolveOrders(state,orders).battle;
  assert.equal(next.hp,battle.hp-2);
  assert.equal(next.party[0].cell,"0,0");
  assert.equal(next.party[0].hp,battle.party[0].hp);
  assert.equal(next.round,2);
  const final = resolveOrders({...state,battle:{...battle,hp:2,demonstration:false}},orders).battle;
  assert.equal(final.status,"won");
  assert.equal(final.cell,battle.cell);
  assert.equal(final.party[0].hp,battle.party[0].hp);
});
test("Liu Bei at C3 catches Guan Yu entering E3 only when facing the correct way", () => {
  const state = walk(newCampaign(), "guanyu");
  assert.equal(state.battle.cell, "1,0"); // F3
  for (const target of ["-1,0", "0,0"]) { // Both D3 and E3 select the eastward swing.
    const next = resolveOrders(state, { liubei: { cell: "-2,0", target } }).battle;
    assert.equal(next.cell, "0,0");
    assert.equal(next.hp, 6);
    assert.match(next.report, /从 F3 走到 E3。刘备在 E3 截击命中，造成 1 点伤害。关羽体力 7 → 6/);
  }
  const away = resolveOrders(state, { liubei: { cell: "-2,0", target: "-3,0" } }).battle;
  assert.equal(away.cell, "0,0");
  assert.equal(away.hp, 7);
  assert.match(away.report, /E3 在所选攻击范围外/);
});
test("an immediate hit is counted once even if the enemy moves deeper into the sword's reach", () => {
  const state = walk(newCampaign(), "guanyu");
  const next = resolveOrders(state, { liubei: { cell: "-1,0", target: "1,0" } }).battle;
  assert.equal(next.cell, "0,0");
  assert.equal(next.hp, 6);
  assert.doesNotMatch(next.report, /截击/);
});
test("a lethal interception wins on the last turn before any enemy retaliation", () => {
  const state = walk(newCampaign(), "guanyu");
  // Guan Yu would counter the adjacent ally at D3 if he survived at E3.
  const battle = { ...state.battle, hp: 1, demonstration: false, round: ROUND_LIMIT,
    party: [...state.battle.party, { hero: "zhangfei", cell: "-1,0", hp: 1 }] };
  const next = resolveOrders({ ...state, battle }, {
    liubei: { cell: "-2,0", target: "0,0" }, zhangfei: { cell: "-1,0", target: null },
  }).battle;
  assert.equal(next.cell, "0,0");
  assert.equal(next.status, "won");
  assert.equal(next.party[1].hp, 1);
  assert.match(next.report, /截击命中/);
});
test("guided steps reach each available destination without triggering another encounter", () => {
  let state = newCampaign();
  for (const goal of ["guanyu", "zhangfei", "lvbu"]) {
    for (let i = 0; !state.battle && i < BOARD_IDS.size; i++) {
      const next = nextTrailCell(state.position, goal);
      assert.ok(next && isAdjacent(state.position, next));
      state = travel(state, next);
    }
    assert.equal(state.battle?.enemy, goal);
    state = finishBattle({ ...state, battle: { ...state.battle, status: "won" } });
  }
  assert.equal(state.cleared, true);
});
test("staying still and moving without attacking are legal, invalid moves and shots are rejected", () => {
  const state = walk(newCampaign(),"zhangfei");
  const b = state.battle, origin = b.party[0].cell;
  const stay = resolveOrders(state,{liubei:{cell:origin,target:b.cell}}).battle;
  assert.equal(stay.hp,b.hp-1);
  const wait = resolveOrders(state,{liubei:{cell:"0,0",target:null}}).battle;
  assert.equal(wait.hp,b.hp);
  assert.equal(wait.party[0].cell,"0,0");
  assert.equal(resolveOrders(state,{liubei:{cell:"3,0",target:null}}),state);
  assert.equal(resolveOrders(state,{liubei:{cell:origin,target:"4,0"}}),state);
  assert.equal(resolveOrders(state,{}),state);
});
test("empty-cell attacks use the weapon pattern, without a bonus for naming the enemy tile", () => {
  const cell = "0,0", target = "2,0";
  assert.equal(aimedStrike("liubei",{cell,target}).direction,1);
  assert.equal(heroDamage("liubei",{cell,target},"1,0",0),2);
  assert.equal(heroDamage("liubei",{cell,target},"-1,0",0),0);
});
for (const order of [["guanyu", "zhangfei"], ["zhangfei", "guanyu"]]) {
  test("complete the campaign via " + order.join(" then "), () => {
    let state = newCampaign();
    for (const enemy of [...order, "lvbu"]) {
      state = walk(state, enemy);
      assert.equal(state.battle.enemy, enemy);
      assert.equal(state.battle.party[0].hp, maxHp("liubei", state.recruits.length + 1));
      assert.equal(state.battle.party.length, enemy === "lvbu" ? 3 : 1);
      while (state.battle.status === "active") {
        const startHp = state.battle.hp;
        assert.equal(resolveOrders(state, {}), state);
        const orders = plan(state);
        if (enemy === "lvbu" && state.battle.round === 1) {
          assert.equal(resolveOrders(state, { ...orders, guanyu: undefined }), state);
          assert.equal(resolveOrders(state, { ...orders, zhangfei: { cell: "98,99", target: null } }), state);
        }
        state = resolveOrders(state, orders);
        assert.ok(state.battle.hp <= startHp);
      }
      assert.equal(state.battle.status, "won");
      state = finishBattle(state);
    }
    assert.equal(state.cleared, true);
    assert.deepEqual(state.recruits, order);
  });
}
test("failed battle retries with full health, retaining recruits", () => {
  const visit = walk({ ...newCampaign(), recruits: ["zhangfei"] }, "guanyu");
  const last = { ...visit, battle: { ...visit.battle, hp: 4, round: ROUND_LIMIT } };
  const lost = resolveOrders(last, { liubei: { cell: "-2,0", target: null } });
  assert.equal(lost.battle.status, "lost");
  assert.equal(finishBattle(lost), lost);
  const retry = retryBattle(lost);
  assert.deepEqual(retry.recruits, ["zhangfei"]);
  assert.equal(retry.battle.round, 1);
  assert.equal(retry.battle.party[0].hp, 9);
  assert.equal(retry.battle.hp,ENCOUNTERS.guanyu.hp);
});
