import { WEAPONS, type ResolutionEvent, type Side, type WeaponId } from "./game.ts";

export interface MatchStats {
  attacks: number;
  diceRolls: number;
  hits: number;
  damage: number;
  maxRoll: number;
  removals: number;
  routeBreaks: number;
  predictionMisses: number;
  routesInterrupted: number;
  blockedAttackMisses: number;
  diceMisses: number;
  damageTaken: number;
  skippedAttacks: number;
  attacksCancelled: number;
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
    predictionMisses: 0,
    routesInterrupted: 0,
    blockedAttackMisses: 0,
    diceMisses: 0,
    damageTaken: 0,
    skippedAttacks: 0,
    attacksCancelled: 0,
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

  let ownRouteBlocked = false;
  let ownAttackStarted = false;
  const ownRemoved = new Set<string>();
  for (const event of events) {
    if (event.type === "round_end") {
      ownRouteBlocked = false; ownAttackStarted = false; ownRemoved.clear();
    }
    if (event.type === "remove" && event.side === side) next.removals += 1;
    if (event.type === "remove" && event.side === side && event.cell) ownRemoved.add(event.cell);
    if (event.type === "move_blocked" && event.reason === "removed") {
      if (event.side === side) {
        next.routesInterrupted += 1;
        ownRouteBlocked = true;
      } else if (event.side && event.to && ownRemoved.has(event.to)) next.routeBreaks += 1;
    }
    if (event.type === "attack" && event.side === side) {
      ownAttackStarted = true;
      next.attacks += 1;
      if (event.weapon) next.weaponUses[event.weapon] += 1;
    }
    if (event.type === "attack_missed_range" && event.side === side) {
      if (ownRouteBlocked) next.blockedAttackMisses += 1;
      else next.predictionMisses += 1;
    }
    if (event.type === "attack_skipped" && event.side === side) {
      next.skippedAttacks += 1;
      ownAttackStarted = true;
    }
    if (event.type === "defeated" && event.targetSide === side && !ownAttackStarted) next.attacksCancelled += 1;
    if (event.type === "die" && event.side === side) {
      next.diceRolls += 1;
      if (event.hit) next.hits += 1;
      else if (event.hit === false) next.diceMisses += 1;
      next.maxRoll = Math.max(next.maxRoll, event.roll ?? 0);
    }
    if (event.type === "damage" && event.side === side) next.damage += event.damage ?? 0;
    if (event.type === "damage" && event.targetSide === side) next.damageTaken += event.damage ?? 0;
  }

  return next;
}

export interface ResultReview {
  kind: "prediction" | "route" | "dice" | "mixed" | "trade" | "no_attack";
  title: string;
  advice: string;
}

/** Observed missed opportunities, not a claim that one event alone caused defeat. */
export function resultReview(stats: MatchStats): ResultReview {
  const reasons: { kind: ResultReview["kind"]; count: number; title: string; advice: string }[] = [
    { kind: "prediction", count: stats.predictionMisses, title: "预判落空较多",
      advice: "对手没有进入攻击范围。下局先判断移动后的落点，再选择武器和方向。" },
    { kind: "route", count: stats.blockedAttackMisses, title: "路线被截断",
      advice: "路线被截后，攻击仍从实际停下的位置发出。下局留意可被拆掉的路径。" },
    { kind: "dice", count: stats.diceMisses, title: "入围后未命中",
      advice: "对手进入了攻击范围，但骰点未达门槛。可尝试命中门槛更低的武器。" },
  ];
  const maximum = Math.max(...reasons.map((reason) => reason.count));
  const leading = reasons.filter((reason) => maximum > 0 && reason.count === maximum);
  if (leading.length > 1) return { kind: "mixed", title: "多种落空叠加",
    advice: "这局有多种攻击落空。先检查路线能否走完，再判断攻击范围和命中门槛。" };
  if (leading.length === 1) {
    const { kind, title, advice } = leading[0];
    return { kind, title, advice };
  }
  if (stats.routesInterrupted > 0) return { kind: "route", title: "路线受阻",
    advice: "这局有移动被截断。即使仍能命中，也要留意被迫停下后的位置风险。" };
  if (stats.attacks === 0 || stats.skippedAttacks > 0) return { kind: "no_attack", title: "出手机会不足",
    advice: stats.attacksCancelled > 0 ? "最后一回合被击败前未能出手。下局注意先后手与剩余生命。"
      : "这局有回合未完成攻击。可先确认走位，再及时提交武器和方向。" };
  return { kind: "trade", title: "复盘交锋时机",
    advice: stats.attacksCancelled > 0 ? "最后一回合被击败前未能出手。下局注意先后手与剩余生命。"
      : `造成 ${stats.damage} 点、承受 ${stats.damageTaken} 点伤害。下局可尝试控距，减少换血。` };
}

export function primaryWeapon(stats: MatchStats, fallback: WeaponId): WeaponId {
  return (Object.keys(stats.weaponUses) as WeaponId[]).reduce((best, weapon) => (
    stats.weaponUses[weapon] > stats.weaponUses[best] ? weapon : best
  ), fallback);
}

export function resultTitle(stats: MatchStats, winner: Side | "draw" | null, side: Side): string {
  if (winner === "draw") return "棋逢对手";
  if (winner !== side) {
    return resultReview(stats).title;
  }
  if (stats.routeBreaks > 0) return "断路工程师";
  if (stats.damage >= 5) return "火力全开";
  if (stats.diceRolls >= 2 && stats.hits === stats.diceRolls) return "百发百中";
  return "预判兑现";
}

export function resultSummary(stats: MatchStats, weapon: WeaponId): string {
  const attacks = stats.attacks ? `${stats.hits}/${stats.attacks} 次攻击命中` : "尚未出手";
  return `${WEAPONS[weapon].name}主战 · ${attacks} · ${stats.damage} 点伤害`;
}

export function resultFlavor(
  stats: MatchStats,
  winner: Side | "draw" | null,
  side: Side,
  ownHealth: number,
): ResultFlavor {
  const accuracy = stats.attacks ? Math.round((stats.hits / stats.attacks) * 100) : 0;
  const score = (winner === side ? 42 : winner === "draw" ? 32 : 18)
    + Math.min(24, stats.damage * 4)
    + Math.round(accuracy * .16)
    + Math.min(10, ownHealth * 2)
    + Math.min(8, stats.routeBreaks * 4);
  const grade = score >= 86 ? "S" : score >= 68 ? "A" : score >= 48 ? "B" : "C";
  const gradeLabel = grade === "S" ? "表现出色" : grade === "A" ? "战术在线" : grade === "B" ? "有来有回" : "继续调整";

  let style = "观察派";
  if (stats.routeBreaks > 0) style = "封路派";
  else if (accuracy >= 80 && stats.diceRolls >= 2) style = "读心派";
  else if (stats.removals >= 3) style = "地形派";
  else if (stats.damage >= 5) style = "猛攻派";
  else if (stats.attacks >= 4) style = "尝试派";

  let quote = "这一局留下的路线，会变成下一局的伏笔。";
  if (winner !== side) quote = resultReview(stats).advice;
  else if (winner === side && stats.routeBreaks > 0) quote = "路不是没了，是我替你选好了。";
  else if (winner === side && accuracy === 100 && stats.attacks > 0) quote = "这局每次攻击都造成了命中，继续观察对手的走位。";
  else if (winner === side) quote = "这局赢下了交锋，回顾攻击落点与路线，找到可复用的选择。";

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
