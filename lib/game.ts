export type Side = "cyan" | "red";
export type WeaponId = "sword" | "dagger" | "axe" | "spear" | "bow" | "staff";

export interface Coord {
  q: number;
  r: number;
}

export interface PlayerState {
  id: string;
  name: string;
  side: Side;
  health: number;
  position: string;
  weapons: WeaponId[];
}

export interface GameState {
  round: number;
  initiative: Side;
  removed: string[];
  players: Record<Side, PlayerState>;
  winner: Side | "draw" | null;
}

export interface TurnPlan {
  remove?: string;
  moves: string[];
  weapon?: WeaponId;
  direction?: number;
}

export interface ResolutionEvent {
  type:
    | "remove"
    | "remove_skipped"
    | "remove_failed"
    | "move"
    | "move_stay"
    | "move_blocked"
    | "attack"
    | "attack_skipped"
    | "attack_missed_range"
    | "die"
    | "damage"
    | "defeated"
    | "round_end";
  side?: Side;
  targetSide?: Side;
  cell?: string;
  from?: string;
  to?: string;
  roll?: number;
  threshold?: number;
  hit?: boolean;
  damage?: number;
  health?: number;
  reason?: string;
  round?: number;
  step?: number;
  weapon?: WeaponId;
  direction?: number;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  threshold: number;
  description: string;
  melee: boolean;
  sameCellDamage: number;
  rangeLabel: string;
  damageLabel: string;
  role: string;
  pattern: AttackBand[];
}

export interface AttackBand {
  distance: number;
  damage: number;
  directionOffset?: -1 | 0 | 1;
  /** Move one adjacent cell around the impact point to form a small blast. */
  impactOffset?: -1 | 1;
}

export interface AttackCell {
  cell: string;
  damage: number;
  direction: number;
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  sword: {
    id: "sword",
    name: "长剑",
    threshold: 2,
    description: "同格或直线 2 格，伤害 2 / 1",
    melee: true,
    sameCellDamage: 2,
    rangeLabel: "直线 1～2 格",
    damageLabel: "2 / 1",
    role: "稳定近战",
    pattern: [
      { distance: 1, damage: 2 },
      { distance: 2, damage: 1 },
    ],
  },
  dagger: {
    id: "dagger",
    name: "匕首",
    threshold: 2,
    description: "同格 3 伤，相邻 1 伤；贴身命中时拥有最高爆发",
    melee: true,
    sameCellDamage: 3,
    rangeLabel: "同格 / 相邻 1 格",
    damageLabel: "同格 3 / 相邻 1",
    role: "贴身终结",
    pattern: [
      { distance: 1, damage: 1 },
    ],
  },
  axe: {
    id: "axe",
    name: "战斧",
    threshold: 3,
    description: "同格 1 伤；前方三格扇形，中央 2、两侧 1",
    melee: true,
    sameCellDamage: 1,
    rangeLabel: "相邻三格扇形",
    damageLabel: "中央 2 / 两侧 1",
    role: "范围压制",
    pattern: [
      { distance: 1, damage: 1, directionOffset: -1 },
      { distance: 1, damage: 2 },
      { distance: 1, damage: 1, directionOffset: 1 },
    ],
  },
  spear: {
    id: "spear",
    name: "长枪",
    threshold: 3,
    description: "同格或直线 3 格，伤害 1 / 2 / 1",
    melee: true,
    sameCellDamage: 1,
    rangeLabel: "直线 1～3 格",
    damageLabel: "1 / 2 / 1",
    role: "距离博弈",
    pattern: [
      { distance: 1, damage: 1 },
      { distance: 2, damage: 2 },
      { distance: 3, damage: 1 },
    ],
  },
  bow: {
    id: "bow",
    name: "弓箭",
    threshold: 4,
    description: "直线第 2～4 格，第 2 格 1 伤，第 3～4 格 2 伤",
    melee: false,
    sameCellDamage: 0,
    rangeLabel: "直线 2～4 格",
    damageLabel: "1 / 2 / 2",
    role: "远程狙击",
    pattern: [
      { distance: 2, damage: 1 },
      { distance: 3, damage: 2 },
      { distance: 4, damage: 2 },
    ],
  },
  staff: {
    id: "staff",
    name: "法杖",
    threshold: 4,
    description: "瞄准直线第 2 格并爆裂，中心 2 伤、两侧各 1 伤",
    melee: false,
    sameCellDamage: 0,
    rangeLabel: "第 2 格爆裂三格",
    damageLabel: "中心 2 / 两侧 1",
    role: "落点覆盖",
    pattern: [
      { distance: 2, damage: 1, impactOffset: -1 },
      { distance: 2, damage: 2 },
      { distance: 2, damage: 1, impactOffset: 1 },
    ],
  },
};

export const DIRECTIONS: Coord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const BOARD_ROWS = [-2, -1, 0, 1, 2] as const;

export const BOARD_CELLS: Coord[] = BOARD_ROWS.reduce<Coord[]>((cells, r) => {
  const half = 4 - Math.abs(r);
  return cells.concat(Array.from({ length: half * 2 + 1 }, (_, index) => ({
    q: index - half,
    r,
  })));
}, []);

export const BOARD_IDS = new Set(BOARD_CELLS.map(cellId));

export function cellId(coord: Coord): string {
  return `${coord.q},${coord.r}`;
}

export function parseCell(id: string): Coord {
  const [q, r] = id.split(",").map(Number);
  return { q, r };
}

export function opponent(side: Side): Side {
  return side === "cyan" ? "red" : "cyan";
}

export function createGame(
  cyan: Pick<PlayerState, "id" | "name" | "weapons">,
  red: Pick<PlayerState, "id" | "name" | "weapons">,
  initiative: Side = "cyan",
): GameState {
  return {
    round: 1,
    initiative,
    removed: [],
    winner: null,
    players: {
      cyan: { ...cyan, side: "cyan", health: 6, position: "-4,0" },
      red: { ...red, side: "red", health: 6, position: "4,0" },
    },
  };
}

export function isAdjacent(a: string, b: string): boolean {
  return legalNeighbors(a).includes(b);
}

export function legalMoveTargets(
  state: GameState,
  from: string,
): string[] {
  const removed = new Set(state.removed);
  return DIRECTIONS.map((_, index) => directionCell(from, index + 1))
    .filter((id) => BOARD_IDS.has(id) && !removed.has(id));
}

export function cellDistance(a: string, b: string): number {
  const start = offsetToAxial(parseCell(a));
  const end = offsetToAxial(parseCell(b));
  const q = start.q - end.q;
  const r = start.r - end.r;
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

interface BotRoute {
  moves: string[];
  end: string;
}

type BotTactic = "pressure" | "kite" | "flank" | "bait";

/** Short, loop-free routes; one safest route per destination, including holding. */
function botRoutes(state: GameState, side: Side, removable: Set<string>): BotRoute[] {
  const start = state.players[side].position;
  const routes = new Map<string, BotRoute>([[start, { moves: [], end: start }]]);
  const risk = (moves: string[]) => moves.reduce((sum, cell) => sum + Number(removable.has(cell)), 0);
  const visit = (moves: string[], from: string) => {
    if (moves.length === 2) return;
    for (const end of legalMoveTargets(state, from)) {
      if (end === start || moves.includes(end)) continue;
      const next = [...moves, end];
      const previous = routes.get(end);
      if (!previous || risk(next) < risk(previous.moves)
        || (risk(next) === risk(previous.moves) && next.length < previous.moves.length)) {
        routes.set(end, { moves: next, end });
      }
      visit(next, end);
    }
  };
  visit([], start);
  return [...routes.values()];
}

function botDamage(weapons: WeaponId[], from: string, to: string): number {
  let best = 0;
  for (const weapon of weapons) {
    for (let direction = 1; direction <= 6; direction += 1) {
      best = Math.max(best, attackDamage(weapon, from, to, direction) * weaponHitChance(weapon));
    }
  }
  return best;
}

function botIdealRange(weapons: WeaponId[]): number {
  // With mixed equipment, keep the longer weapon useful instead of always diving in.
  return Math.max(...weapons.map((weapon) => {
    const item = WEAPONS[weapon];
    let range = 0;
    let damage = item.sameCellDamage;
    for (const band of item.pattern) {
      if (band.damage > damage || (band.damage === damage && band.distance > range)) {
        range = band.distance;
        damage = band.damage;
      }
    }
    return range;
  }));
}

/**
 * Plans only from public round-start state, never the human's submitted orders.
 * RNG is injectable for reproducible tests; all callers share this implementation.
 */
export function planBotTurn(
  state: GameState,
  side: Side,
  random: () => number = Math.random,
): TurnPlan {
  const me = state.players[side];
  const enemy = state.players[opponent(side)];
  const idealRange = botIdealRange(me.weapons);
  const enemyRange = botIdealRange(enemy.weapons);
  const cautious = me.health <= 3 || state.initiative !== side;
  const roll = random();
  const tactic: BotTactic = roll < 0.25 ? "pressure"
    : roll < (cautious || idealRange >= 2 ? 0.55 : 0.4) ? "kite"
      : roll < 0.8 ? "flank" : "bait";
  const removable = new Set(BOARD_CELLS.map(cellId).filter((cell) => canRemove(state, cell)));
  const routes = botRoutes(state, side, removable);
  const damageCache = new Map<string, number>();
  const enemyDamage = (from: string, to: string) => {
    const key = `${from}:${to}`;
    if (!damageCache.has(key)) damageCache.set(key, botDamage(enemy.weapons, from, to));
    return damageCache.get(key)!;
  };
  const responses = botRoutes(state, opponent(side), removable).map((route) => {
    const distance = cellDistance(route.end, me.position);
    const previousDistance = cellDistance(enemy.position, me.position);
    // Model holding, advancing, and moving to useful firing positions. The actual
    // enemy plan is unknown; no single guessed destination receives certainty.
    const rangeFit = Math.exp(-Math.abs(distance - enemyRange) * 0.65);
    const approach = distance < previousDistance ? 1.4 : 0.65;
    return { ...route, weight: rangeFit + approach };
  });
  // Holding is one strategic choice, not one of ~19 equally likely cells.
  // Reserve probability for it so a stationary player isn't ignored forever.
  const movingWeight = responses.filter((item) => item.moves.length > 0)
    .reduce((sum, item) => sum + item.weight, 0);
  const predictions = responses.map((item) => ({ ...item,
    weight: movingWeight === 0 ? 1 : item.moves.length === 0 ? 0.35 : item.weight / movingWeight * 0.65,
  }));
  const threats = predictions.map((item) => {
    let best = { weapon: enemy.weapons[0], direction: 1, damage: -1 };
    for (const weapon of enemy.weapons) {
      for (let direction = 1; direction <= 6; direction += 1) {
        const damage = attackDamage(weapon, item.end, me.position, direction) * weaponHitChance(weapon);
        if (damage > best.damage) best = { weapon, direction, damage };
      }
    }
    return { ...item, attack: best };
  });
  const bestAttack = (from: string, forecast: { end: string; weight: number }[]) => {
    let best = { weapon: me.weapons[0], direction: 1, score: -Infinity };
    for (const weapon of me.weapons) {
      for (let direction = 1; direction <= 6; direction += 1) {
        const score = forecast.reduce((sum, item) => {
          const damage = attackDamage(weapon, from, item.end, direction);
          const kill = damage >= enemy.health && damage > 0 ? 0.9 : 0;
          return sum + item.weight * (damage + kill) * weaponHitChance(weapon);
        }, 0);
        if (score > best.score) best = { weapon, direction, score };
      }
    }
    return best;
  };
  const originDanger = predictions.reduce((sum, item) =>
    sum + item.weight * enemyDamage(item.end, me.position), 0);
  const ranked = routes.map((route) => {
    const attack = bestAttack(route.end, predictions);
    let danger = 0;
    for (const item of threats) {
      // Blend attacks aimed at our old position with possible enemy anticipation.
      const aimed = attackDamage(item.attack.weapon, item.end, route.end, item.attack.direction)
        * weaponHitChance(item.attack.weapon);
      const adaptive = enemyDamage(item.end, route.end);
      danger += item.weight * (aimed * 0.65 + adaptive * 0.35);
    }
    const distance = cellDistance(route.end, enemy.position);
    const rangeError = Math.abs(distance - idealRange);
    const mobility = legalMoveTargets(state, route.end).length;
    const fragile = route.moves.reduce((sum, cell) => sum + Number(removable.has(cell)), 0);
    const lateral = route.moves.length > 0 && parseCell(route.end).r !== parseCell(me.position).r;
    const retreat = distance > cellDistance(me.position, enemy.position);
    const exposureSaved = Math.max(0, originDanger - danger);
    let style = 0;
    if (tactic === "pressure") style = attack.score * 0.45 - distance * 0.08;
    if (tactic === "kite") style = -rangeError * 0.22 + exposureSaved * 0.5;
    if (tactic === "flank") style = Number(lateral) * 0.75 + exposureSaved * 0.4;
    // Hold a useful range or retreat into a counterattack; do not reward fleeing
    // when neither side can interact. Bait relies on the forecast of pursuit.
    if (tactic === "bait") style = attack.score * Number(retreat || route.moves.length === 0) * 0.55
      + exposureSaved * 0.35 - rangeError * 0.16;
    const sameCellDagger = route.end === enemy.position && enemy.weapons.includes("dagger") ? 0.5 : 0;
    const score = attack.score * 2.4 - danger * (cautious ? 2.6 : 1.8)
      - rangeError * 0.2 + mobility * 0.045 - fragile * 0.15
      - route.moves.length * 0.025 - sameCellDagger + style;
    return { ...route, score, attack };
  }).sort((a, b) => b.score - a.score);
  // Variety stays inside a narrow quality band, rather than random legal moves.
  const shortlist = ranked.filter((route) => route.score >= ranked[0].score - 0.28);
  const chosen = shortlist[Math.min(shortlist.length - 1, Math.floor(random() * shortlist.length))];

  // Evaluate route interception and the resulting attack, rather than removing
  // whichever brick happens to be nearest. Never remove our own planned route.
  let removal: { cell?: string; score: number; attack: typeof chosen.attack } = {
    score: chosen.attack.score * 2.4,
    attack: chosen.attack,
  };
  for (const cell of BOARD_CELLS.map(cellId)) {
    if (chosen.moves.includes(cell) || !removable.has(cell)) continue;
    let intercepted = 0;
    const forecast = predictions.map((item) => {
      const index = item.moves.indexOf(cell);
      if (index < 0) return item;
      intercepted += item.weight;
      return { ...item, end: index === 0 ? enemy.position : item.moves[index - 1] };
    });
    const attack = bestAttack(chosen.end, forecast);
    const danger = forecast.reduce((sum, item) =>
      sum + item.weight * enemyDamage(item.end, chosen.end), 0);
    const originalDanger = predictions.reduce((sum, item) =>
      sum + item.weight * enemyDamage(item.end, chosen.end), 0);
    const escapeLoss = legalMoveTargets(state, chosen.end).includes(cell) ? 0.16 : 0;
    const score = attack.score * 2.4 + intercepted * 0.3
      + (originalDanger - danger) * 1.6 - escapeLoss;
    if (score > removal.score + 0.001) removal = { cell, score, attack };
  }
  return {
    remove: removal.cell,
    moves: chosen.moves,
    weapon: removal.attack.weapon,
    direction: removal.attack.direction,
  };
}

export function validateMovePlan(
  state: GameState,
  side: Side,
  moves: string[],
): boolean {
  if (moves.length > 2) return false;
  let current = state.players[side].position;
  for (const target of moves) {
    if (!BOARD_IDS.has(target) || !isAdjacent(current, target)) return false;
    current = target;
  }
  return true;
}

export function isConnected(removedCells: Iterable<string>): boolean {
  const removed = new Set(removedCells);
  const available = BOARD_CELLS.map(cellId).filter((id) => !removed.has(id));
  if (available.length <= 1) return true;
  const unseen = new Set(available);
  const queue = [available[0]];
  unseen.delete(available[0]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of legalNeighbors(current)) {
      if (unseen.delete(next) && !removed.has(next)) queue.push(next);
    }
  }
  return unseen.size === 0;
}

export function canRemove(
  state: GameState,
  cell: string,
  additionalRemoved: Iterable<string> = [],
): boolean {
  if (!BOARD_IDS.has(cell) || state.removed.includes(cell)) return false;
  if (Object.values(state.players).some((player) => player.position === cell)) {
    return false;
  }
  if (!isOuterEdge(state, cell, additionalRemoved)) return false;
  return isConnected([...state.removed, ...additionalRemoved, cell]);
}

/** A removable tile must touch the outside or an existing gap of the current arena. */
export function isOuterEdge(
  state: GameState,
  cell: string,
  additionalRemoved: Iterable<string> = [],
): boolean {
  if (!BOARD_IDS.has(cell) || state.removed.includes(cell)) return false;
  const removed = new Set([...state.removed, ...additionalRemoved]);
  const neighbors = legalNeighbors(cell);
  return neighbors.length < 6 || neighbors.some((neighbor) => removed.has(neighbor));
}

function legalNeighbors(id: string): string[] {
  return DIRECTIONS.map((_, index) => directionCell(id, index + 1))
    .filter((next) => BOARD_IDS.has(next));
}

function rowParity(r: number): number {
  return ((r % 2) + 2) % 2;
}

/** Convert the visible odd-row offset coordinates to axial coordinates. */
function offsetToAxial(coord: Coord): Coord {
  return { q: coord.q - (coord.r - rowParity(coord.r)) / 2, r: coord.r };
}

function axialToOffset(coord: Coord): Coord {
  return { q: coord.q + (coord.r - rowParity(coord.r)) / 2, r: coord.r };
}

function directionCell(origin: string, direction: number, distance = 1): string {
  const start = offsetToAxial(parseCell(origin));
  const delta = DIRECTIONS[direction - 1];
  return cellId(axialToOffset({
    q: start.q + delta.q * distance,
    r: start.r + delta.r * distance,
  }));
}

function wrapDirection(direction: number): number {
  return ((direction - 1 + 6) % 6) + 1;
}

export function weaponHitChance(weapon: WeaponId): number {
  return (7 - WEAPONS[weapon].threshold) / 6;
}

export function weaponAttackCells(
  weapon: WeaponId,
  origin: string,
  direction: number,
): AttackCell[] {
  if (direction < 1 || direction > 6) return [];
  const definition = WEAPONS[weapon];
  const cells = definition.pattern.map((band) => {
    const impact = directionCell(
      origin,
      wrapDirection(direction + (band.directionOffset ?? 0)),
      band.distance,
    );
    return {
      cell: band.impactOffset
        ? directionCell(impact, wrapDirection(direction + band.impactOffset))
        : impact,
      damage: band.damage,
      direction,
    };
  });
  if (definition.sameCellDamage > 0) {
    cells.push({ cell: origin, damage: definition.sameCellDamage, direction });
  }
  return cells;
}

/** Central ray cells that can be clicked to choose one of the six directions. */
export function weaponAimCells(weapon: WeaponId, origin: string): AttackCell[] {
  const centralBands = WEAPONS[weapon].pattern.filter(
    (band) => (band.directionOffset ?? 0) === 0 && !band.impactOffset,
  );
  return DIRECTIONS.reduce<AttackCell[]>((cells, _, index) => cells.concat(
    centralBands.map((band) => ({
      cell: directionCell(origin, index + 1, band.distance),
      damage: band.damage,
      direction: index + 1,
    })),
  ), []);
}

export function attackDamage(
  weapon: WeaponId,
  origin: string,
  target: string,
  direction: number,
): number {
  if (direction < 1 || direction > 6) return 0;
  return weaponAttackCells(weapon, origin, direction)
    .find((attackCell) => attackCell.cell === target)?.damage ?? 0;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    removed: [...state.removed],
    players: {
      cyan: { ...state.players.cyan, weapons: [...state.players.cyan.weapons] },
      red: { ...state.players.red, weapons: [...state.players.red.weapons] },
    },
  };
}

export function resolveRound(
  source: GameState,
  plans: Record<Side, TurnPlan>,
  rollDie: () => number = () => Math.floor(Math.random() * 6) + 1,
): { state: GameState; events: ResolutionEvent[] } {
  const state = cloneState(source);
  const events: ResolutionEvent[] = [];
  const order: Side[] = [state.initiative, opponent(state.initiative)];

  for (const side of order) {
    const target = plans[side]?.remove;
    if (!target) {
      events.push({ type: "remove_skipped", side });
      continue;
    }
    if (canRemove(state, target)) {
      state.removed.push(target);
      events.push({ type: "remove", side, cell: target });
    } else {
      events.push({ type: "remove_failed", side, cell: target, reason: "invalid" });
    }
  }

  const blocked = new Set<Side>();
  for (let step = 0; step < 2; step += 1) {
    for (const side of order) {
      if (blocked.has(side)) continue;
      const target = plans[side]?.moves?.[step];
      if (step === 0 && !target) {
        events.push({ type: "move_stay", side });
        continue;
      }
      if (!target) continue;
      const player = state.players[side];
      if (
        !BOARD_IDS.has(target) ||
        state.removed.includes(target) ||
        !isAdjacent(player.position, target)
      ) {
        blocked.add(side);
        events.push({
          type: "move_blocked",
          side,
          from: player.position,
          to: target,
          step: step + 1,
          reason: state.removed.includes(target) ? "removed" : "invalid",
        });
        continue;
      }
      const from = player.position;
      player.position = target;
      events.push({ type: "move", side, from, to: target, step: step + 1 });
    }
  }

  for (const side of order) {
    const attacker = state.players[side];
    const targetSide = opponent(side);
    const defender = state.players[targetSide];
    if (attacker.health <= 0 || defender.health <= 0) continue;
    const plan = plans[side];
    if (!plan?.weapon || !plan.direction) {
      events.push({ type: "attack_skipped", side, targetSide });
      continue;
    }
    events.push({
      type: "attack",
      side,
      targetSide,
      weapon: plan.weapon,
      direction: plan.direction,
    });
    const damage = attackDamage(
      plan.weapon,
      attacker.position,
      defender.position,
      plan.direction,
    );
    if (!damage) {
      events.push({
        type: "attack_missed_range",
        side,
        targetSide,
        weapon: plan.weapon,
        direction: plan.direction,
      });
      continue;
    }
    const threshold = WEAPONS[plan.weapon].threshold;
    const roll = Math.max(1, Math.min(6, Math.floor(rollDie())));
    const hit = roll === 6 || (roll !== 1 && roll >= threshold);
    events.push({
      type: "die",
      side,
      targetSide,
      roll,
      threshold,
      hit,
      weapon: plan.weapon,
      direction: plan.direction,
    });
    if (!hit) continue;
    defender.health = Math.max(0, defender.health - damage);
    events.push({
      type: "damage",
      side,
      targetSide,
      damage,
      health: defender.health,
      weapon: plan.weapon,
      direction: plan.direction,
    });
    if (defender.health === 0) {
      state.winner = side;
      events.push({
        type: "defeated",
        side,
        targetSide,
        weapon: plan.weapon,
        direction: plan.direction,
      });
      return { state, events };
    }
  }

  if (state.round >= 14) {
    const cyanHealth = state.players.cyan.health;
    const redHealth = state.players.red.health;
    state.winner =
      cyanHealth === redHealth ? "draw" : cyanHealth > redHealth ? "cyan" : "red";
    return { state, events };
  }

  state.round += 1;
  state.initiative = opponent(state.initiative);
  events.push({ type: "round_end", round: state.round });
  return { state, events };
}
