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
