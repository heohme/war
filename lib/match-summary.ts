import { WEAPONS, type ResolutionEvent, type Side, type WeaponId } from "./game.ts";

export interface MatchStats {
  attacks: number;
  diceRolls: number;
  hits: number;
  damage: number;
  maxRoll: number;
  removals: number;
  routeBreaks: number;
  weaponUses: Record<WeaponId, number>;
}

export interface ResultMoment {
  mark: string;
  value: string;
  label: string;
}

export interface ResultFlavor {
  grade: "S" | "A" | "B" | "C";
  gradeLabel: string;
  style: string;
  quote: string;
  moments: ResultMoment[];
}

export function createMatchStats(): MatchStats {
  return {
    attacks: 0,
    diceRolls: 0,
    hits: 0,
    damage: 0,
    maxRoll: 0,
    removals: 0,
    routeBreaks: 0,
    weaponUses: { sword: 0, dagger: 0, axe: 0, spear: 0, bow: 0, staff: 0 },
  };
}

export function addResolutionEvents(
  current: MatchStats,
  events: ResolutionEvent[],
  side: Side,
): MatchStats {
  const next: MatchStats = {
    ...current,
    weaponUses: { ...current.weaponUses },
  };

  for (const event of events) {
    if (event.type === "remove" && event.side === side) next.removals += 1;
    if (event.type === "move_blocked" && event.side !== side && event.reason === "removed") {
      next.routeBreaks += 1;
    }
    if (event.type === "attack" && event.side === side) {
      next.attacks += 1;
      if (event.weapon) next.weaponUses[event.weapon] += 1;
    }
    if (event.type === "die" && event.side === side) {
      next.diceRolls += 1;
      if (event.hit) next.hits += 1;
      next.maxRoll = Math.max(next.maxRoll, event.roll ?? 0);
    }
    if (event.type === "damage" && event.side === side) next.damage += event.damage ?? 0;
  }

  return next;
}

export function primaryWeapon(stats: MatchStats, fallback: WeaponId): WeaponId {
  return (Object.keys(stats.weaponUses) as WeaponId[]).reduce((best, weapon) => (
    stats.weaponUses[weapon] > stats.weaponUses[best] ? weapon : best
  ), fallback);
}

export function resultTitle(stats: MatchStats, winner: Side | "draw" | null, side: Side): string {
  if (winner === "draw") return "棋逢对手";
  if (winner !== side) {
    if (stats.diceRolls > 0 && stats.maxRoll <= 2) return "骰运欠你一局";
    if (stats.attacks > 0 && stats.hits === 0) return "下一局，换个方向";
    return "路线已记录，等待反击";
  }
  if (stats.routeBreaks > 0) return "断路工程师";
  if (stats.maxRoll === 6) return "六点绝杀";
  if (stats.damage >= 5) return "火力全开";
  if (stats.diceRolls >= 2 && stats.hits === stats.diceRolls) return "百发百中";
  return "预判兑现";
}

export function resultSummary(stats: MatchStats, weapon: WeaponId): string {
  const accuracy = stats.diceRolls ? Math.round((stats.hits / stats.diceRolls) * 100) : 0;
  return `${WEAPONS[weapon].name}主战 · ${accuracy}% 命中 · ${stats.damage} 点伤害`;
}

export function resultFlavor(
  stats: MatchStats,
  winner: Side | "draw" | null,
  side: Side,
  ownHealth: number,
): ResultFlavor {
  const accuracy = stats.diceRolls ? Math.round((stats.hits / stats.diceRolls) * 100) : 0;
  const score = (winner === side ? 42 : winner === "draw" ? 32 : 18)
    + Math.min(24, stats.damage * 4)
    + Math.round(accuracy * .16)
    + Math.min(10, ownHealth * 2)
    + Math.min(8, stats.routeBreaks * 4)
    + (stats.maxRoll === 6 ? 4 : 0);
  const grade = score >= 86 ? "S" : score >= 68 ? "A" : score >= 48 ? "B" : "C";
  const gradeLabel = grade === "S" ? "神级预判" : grade === "A" ? "战术在线" : grade === "B" ? "有来有回" : "蓄力反击";

  let style = "预判派";
  if (stats.routeBreaks > 0) style = "封路派";
  else if (winner === side && stats.maxRoll === 6) style = "回首掏";
  else if (accuracy >= 80 && stats.diceRolls >= 2) style = "读心派";
  else if (stats.removals >= 3) style = "地形派";
  else if (stats.damage >= 5) style = "猛攻派";
  else if (stats.attacks >= 4) style = "赌徒派";

  let quote = "这一局留下的路线，会变成下一局的伏笔。";
  if (winner === "draw") quote = "棋盘缩到最后，谁也没让出那一步。";
  else if (winner === side && stats.routeBreaks > 0) quote = "路不是没了，是我替你选好了。";
  else if (winner === side && stats.maxRoll === 6) quote = "走位走位，回首就是一记六点。";
  else if (winner === side && accuracy === 100) quote = "你以为我在赌，其实方向早就选好了。";
  else if (winner === side) quote = "最后一步不是运气，是我先猜到了。";
  else if (stats.attacks > 0 && stats.hits === 0) quote = "方向已经猜中，只差骰子站到我这边。";

  const signatureMoment: ResultMoment = stats.routeBreaks > 0
    ? { mark: "断", value: `${stats.routeBreaks} 次`, label: "截断走位" }
    : stats.maxRoll === 6
      ? { mark: "六", value: "6 点", label: "最高骰点" }
      : { mark: "撤", value: `${stats.removals} 块`, label: "改造战场" };

  return {
    grade,
    gradeLabel,
    style,
    quote,
    moments: [
      signatureMoment,
      { mark: "准", value: `${accuracy}%`, label: "攻击命中" },
      { mark: "伤", value: `${stats.damage} 点`, label: "累计伤害" },
    ],
  };
}
