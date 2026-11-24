import { BOARD_IDS, isAdjacent } from "./game.ts";
import { ENCOUNTERS, ENEMIES, type Enemy } from "./campaign.ts";

export function nextTrailCell(start: string, goal: Enemy): string | undefined {
  const target = ENCOUNTERS[goal].cell;
  const seen = new Set<string>([start, ...ENEMIES.filter(e => e !== goal).map(e => ENCOUNTERS[e].cell)]);
  const queue = [{ cell: start, first: start }];
  for (const step of queue) {
    if (step.cell === target) return step.first;
    for (const cell of BOARD_IDS) {
      if (seen.has(cell) || !isAdjacent(step.cell, cell)) continue;
      seen.add(cell);
      queue.push({ cell, first: step.cell === start ? cell : step.first });
    }
  }
}
