import { BOARD_IDS, attackDamage, cellDistance, isAdjacent, type WeaponId } from "./game.ts";

export type Ally = "guanyu" | "zhangfei";
export type Hero = "liubei" | Ally;
export type Enemy = Ally | "lvbu";

export const HEROES: Record<Hero, { name: string; weapon: WeaponId; art: string; hp: number; start: string }> = {
  liubei: { name: "刘备", weapon: "sword", art: "双股剑", hp: 7, start: "-1,0" },
  guanyu: { name: "关羽", weapon: "axe", art: "青龙刀", hp: 7, start: "-1,-1" },
  zhangfei: { name: "张飞", weapon: "spear", art: "丈八矛", hp: 7, start: "-1,1" },
};
export const ENCOUNTERS = {
  guanyu: { name: "关羽", site: "长亭", cell: "-2,-2", hp: 7, power: 1, minReach: 0, reach: 1, idealRange: 1 },
  zhangfei: { name: "张飞", site: "石桥", cell: "0,2", hp: 8, power: 2, minReach: 2, reach: 2, idealRange: 2 },
  lvbu: { name: "吕布", site: "虎牢关", cell: "4,0", hp: 18, power: 3, minReach: 0, reach: 1, idealRange: 1 },
} as const;
export const ENEMIES: Enemy[] = ["guanyu", "zhangfei", "lvbu"];
export const ROUND_LIMIT = 10;

interface Piece { hero: Hero; cell: string; hp: number }
export interface Order { cell: string; target: string | null }
export type Orders = Partial<Record<Hero, Order>>;
export interface Battle {
  enemy: Enemy; cell: string; hp: number; party: Piece[]; round: number;
  demonstration: boolean;
  status: "active" | "won" | "lost"; report: string;
}
export interface Campaign {
  position: string; recruits: Ally[]; battle: Battle | null; cleared: boolean; message: string;
}

export function newCampaign(): Campaign {
  return { position: "-4,0", recruits: [], battle: null, cleared: false, message: "从涿郡出发。长亭有关羽，石桥有张飞，两人都愿与来客切磋。" };
}
export function gridLabel(cell: string) {
  const [q, r] = cell.split(",").map(Number);
  return String.fromCharCode(65 + q + 4) + (r + 3);
}
export function maxHp(hero: Hero, level: number) {
  return HEROES[hero].hp + (hero === "liubei" ? (level - 1) * 2 : 0);
}

function startBattle(state: Campaign, enemy: Enemy): Campaign {
  const heroes: Hero[] = enemy === "lvbu" ? ["liubei", ...state.recruits] : ["liubei"];
  const party = heroes.map(hero => ({ hero, cell: HEROES[hero].start, hp: maxHp(hero, state.recruits.length + 1) }));
  return { ...state, battle: { enemy, cell: "1,0", hp: ENCOUNTERS[enemy].hp, party, round: 1,
    demonstration: enemy !== "lvbu" && state.recruits.length === 0, status: "active", report: "" } };
}

export function travel(state: Campaign, cell: string): Campaign {
  if (state.battle || state.cleared || !BOARD_IDS.has(cell) || !isAdjacent(state.position, cell)) return state;
  const enemy = ENEMIES.find(key => ENCOUNTERS[key].cell === cell);
  if (enemy === "lvbu" && state.recruits.length !== 2) return { ...state, message: "关门紧闭。先去长亭和石桥，集齐三英后再来挑战。" };
  const arrived = { ...state, position: cell };
  if (enemy && (enemy === "lvbu" || !state.recruits.includes(enemy))) return startBattle(arrived, enemy);
  return { ...arrived, message: enemy ? "故地重游，这里的武将已入队。" : "已行至 " + gridLabel(cell) + "。点击相邻亮格继续探索。" };
}
export function retryBattle(state: Campaign): Campaign {
  return state.battle?.status === "lost" ? startBattle(state, state.battle.enemy) : state;
}
export function finishBattle(state: Campaign): Campaign {
  if (state.battle?.status !== "won") return state;
  const enemy = state.battle.enemy;
  if (enemy === "lvbu") return { ...state, battle: null, cleared: true, message: "三英合击，吕布退入虎牢关。" };
  return { ...state, battle: null, recruits: [...state.recruits, enemy], message: ENCOUNTERS[enemy].name + "入队。刘备升至 " + (state.recruits.length + 2) + " 级，生命上限 +2，命中伤害 +1。" };
}
export function enemyReach(battle: Battle) {
  return battle.enemy === "lvbu" && battle.round % 3 === 0 ? 2 : ENCOUNTERS[battle.enemy].reach;
}
// A tile selects the swing direction with the strongest contact at that tile.
export function aimedStrike(hero: Hero, order: Order) {
  const weapon = HEROES[hero].weapon;
  let damage = 0, direction = 0;
  if (order.target !== null && BOARD_IDS.has(order.target)) {
    for (let facing = 1; facing <= 6; facing++) {
      const hit = attackDamage(weapon, order.cell, order.target, facing);
      if (hit > damage) { damage = hit; direction = facing; }
    }
  }
  return { damage, direction };
}
export function heroDamage(hero: Hero, order: Order, enemyCell: string, recruits: number) {
  const { direction } = aimedStrike(hero, order);
  const hit = direction ? attackDamage(HEROES[hero].weapon, order.cell, enemyCell, direction) : 0;
  return hit > 0 && hero === "liubei" ? hit + recruits : hit;
}

function enemyStep(battle: Battle, party: Piece[]) {
  const foe = ENCOUNTERS[battle.enemy];
  const living = party.filter(p => p.hp > 0);
  const distance = (cell: string) => Math.min(...living.map(p => cellDistance(cell, p.cell)));
  const options = [...BOARD_IDS].filter(cell => isAdjacent(battle.cell, cell));
  // Prefer a useful attack range, then hold an already good position.
  return [battle.cell, ...options].sort((a, b) =>
    Math.abs(distance(a) - foe.idealRange) - Math.abs(distance(b) - foe.idealRange))[0];
}

export function resolveOrders(state: Campaign, orders: Orders): Campaign {
  const battle = state.battle;
  if (!battle || battle.status !== "active") return state;
  const actors = battle.party.filter(p => p.hp > 0);
  if (!actors.every(p => {
    const order = orders[p.hero];
    return order && BOARD_IDS.has(order.cell) && (order.cell === p.cell || isAdjacent(p.cell, order.cell))
      && (order.target === null || aimedStrike(p.hero, order).damage > 0);
  })) return state;

  const foe = ENCOUNTERS[battle.enemy];
  const log: string[] = [];
  let damage = 0;
  const moved = battle.party.map(p => {
    if (p.hp <= 0) return p;
    const order = orders[p.hero]!;
    const dealt = heroDamage(p.hero, order, battle.cell, state.recruits.length);
    const action = order.target === null ? "待命" : dealt ? "命中 " + dealt : "挥空";
    log.push(HEROES[p.hero].name + (order.cell === p.cell ? "原地" : "走到 " + gridLabel(order.cell) + "，") + action);
    damage += dealt;
    return { ...p, cell: order.cell };
  });
  const hp = Math.max(0, battle.hp - damage);
  const after = { ...battle, party: moved, hp };
  log.push(foe.name + "体力 " + battle.hp + " → " + hp);
  if (hp === 0) return { ...state, battle: { ...after, status: "won", report: log.join("。") + "。" } };

  const cell = enemyStep(battle, moved);
  log.push(foe.name + (cell === battle.cell ? "留在原地" : "走到 " + gridLabel(cell)));
  let struck = false;
  const party = moved.map(p => {
    const range = cellDistance(p.cell, cell);
    if (!p.hp || battle.demonstration || range < foe.minReach || range > enemyReach(battle)) return p;
    struck = true;
    log.push(HEROES[p.hero].name + "受到 " + foe.power + " 点反击伤害");
    return { ...p, hp: Math.max(0, p.hp - foe.power) };
  });
  if (!struck) log.push(battle.demonstration ? "首回合切磋收招" : "我方避开反击");
  const resolved = { ...after, cell, party, report: log.join("。") + "。" };
  if (party.every(p => p.hp === 0) || battle.round >= ROUND_LIMIT) return { ...state, battle: { ...resolved, status: "lost" } };
  return { ...state, battle: { ...resolved, demonstration: false, round: battle.round + 1 } };
}
