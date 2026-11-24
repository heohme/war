import { BOARD_IDS, cellDistance, directionCell, isAdjacent } from "./game.ts";
import type { Hero } from "./campaign.ts";

export const ITEMS = {
  smoke: { name: "烟幕弹", icon: "◌", effect: "保护两格内一名我方武将（可选自己），抵消本回合下一次反击。" },
  hook: { name: "绳钩", icon: "⌁", effect: "合战时，把直线两格处的一名队友向自己拉一格，在我方攻击后生效。" },
  barrier: { name: "路障", icon: "▥", effect: "在相邻空格放置路障。敌将本回合不能走入该格，随后路障消失。" },
};
export type Item = keyof typeof ITEMS;
export type Bag = [Item | null, Item | null];
export type ItemPlay = { slot: number; mark: string };
export const CACHE_CELL = "-3,1"; // B4, one step off the road to the pavilion.
export const SPOILS: Record<"guanyu" | "zhangfei", readonly Item[]> = {
  guanyu: ["hook", "barrier"], zhangfei: ["smoke", "barrier"],
};

export function packItem(bag: Bag, item: Item, replace?: number): Bag | null {
  const free = bag.indexOf(null);
  const slot = free >= 0 ? free : replace;
  if (slot !== 0 && slot !== 1) return null;
  const next: Bag = [...bag];
  next[slot] = item;
  return next;
}

type Standing = { hero: Hero; cell: string; hp: number };
export interface ItemTarget { mark: string; cell: string; pullTo?: string }

export function itemTargets(item: Item, user: Hero, party: Standing[], enemy: string): ItemTarget[] {
  const living = party.filter(p => p.hp > 0);
  const origin = living.find(p => p.hero === user)?.cell;
  if (!origin) return [];
  if (item === "smoke") return living.filter(p => cellDistance(origin, p.cell) <= 2)
    .map(p => ({ mark: p.hero, cell: p.cell }));
  if (item === "barrier") return [...BOARD_IDS].filter(cell => isAdjacent(origin, cell)
    && cell !== enemy && living.every(p => p.cell !== cell)).map(cell => ({ mark: cell, cell }));
  const targets: ItemTarget[] = [];
  for (let direction = 1; direction <= 6; direction++) {
    const end = directionCell(origin, direction, 2);
    const pullTo = directionCell(origin, direction, 1);
    if (!BOARD_IDS.has(pullTo)) continue;
    for (const p of living.filter(p => p.cell === end)) targets.push({ mark: p.hero, cell: end, pullTo });
  }
  return targets;
}
