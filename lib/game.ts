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

/** A deterministic training opponent that plans from the same public state as a player. */
export function planBotTurn(state: GameState, side: Side): TurnPlan {
  const target = state.players[opponent(side)].position;
  const visited = new Set<string>([state.players[side].position]);
  const moves: string[] = [];
  let position = state.players[side].position;

  for (let step = 0; step < 2 && position !== target; step += 1) {
    const currentDistance = cellDistance(position, target);
    const candidates = legalMoveTargets(state, position).sort((a, b) => {
      const distance = cellDistance(a, target) - cellDistance(b, target);
      if (distance) return distance;
      const visitedScore = Number(visited.has(a)) - Number(visited.has(b));
      return visitedScore || a.localeCompare(b);
    });
    const next = candidates[0];
    if (!next || cellDistance(next, target) > currentDistance) break;
    moves.push(next);
    visited.add(next);
    position = next;
  }

  const attack = state.players[side].weapons.reduce<{
    weapon: WeaponId;
    direction: number;
    score: number;
  } | null>((best, weapon) => {
    for (let direction = 1; direction <= 6; direction += 1) {
      const damage = attackDamage(weapon, position, target, direction);
      const nearest = Math.min(...weaponAttackCells(weapon, position, direction)
        .map((cell) => cellDistance(cell.cell, target)));
      const score = damage > 0
        ? 1_000 + damage * weaponHitChance(weapon) * 100
        : -nearest * 10 + weaponHitChance(weapon);
      if (!best || score > best.score) best = { weapon, direction, score };
    }
    return best;
  }, null);

  const remove = BOARD_CELLS.map(cellId)
    .filter((cell) => !moves.includes(cell) && canRemove(state, cell))
    .sort((a, b) => cellDistance(a, target) - cellDistance(b, target) || a.localeCompare(b))[0];

  return {
    remove,
    moves,
    weapon: attack?.weapon ?? state.players[side].weapons[0],
    direction: attack?.direction ?? 1,
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
