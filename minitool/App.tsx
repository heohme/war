"use client";
/* eslint-disable @next/next/no-img-element -- pre-compressed WebP game sprites need predictable transparent rendering. */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BOARD_CELLS, BOARD_IDS, BOARD_ROWS, WEAPONS, canRemove, createGame, legalMoveTargets,
  opponent, planBotTurn, resolveRound, weaponAimCells, weaponAttackCells, weaponHitChance,
  type GameState, type ResolutionEvent, type Side, type TurnPlan, type WeaponId,
} from "../lib/game";
import {
  DICE_ROLL_DURATION_MS, PLANNING_DURATION_SECONDS, replayDelay,
} from "../lib/timing";

type Screen = "home" | "matching" | "planning" | "resolving" | "finished";
type Locks = Record<Side, { remove: boolean; move: boolean; attack: boolean }>;
type RoomCredential = { roomId: string; side: Side; token: string; playerId: string };
type ActivityLogEntry = { at: number; type: string; detail: string };
type FeedbackStatus = "idle" | "submitting" | "success" | "error";
type WeaponGroup = "melee" | "ranged";

const WEAPON_ICONS: Record<WeaponId, string> = { sword: "剑", dagger: "匕", axe: "斧", spear: "枪", bow: "弓", staff: "杖" };
const WEAPON_ART: Record<WeaponId, string> = {
  sword: "./assets/weapon-sword.webp",
  dagger: "./assets/weapon-dagger.webp",
  axe: "./assets/weapon-axe.webp",
  spear: "./assets/weapon-spear.webp",
  bow: "./assets/weapon-bow.webp",
  staff: "./assets/weapon-staff.webp",
};
const WEAPON_THUMB_ART: Record<WeaponId, string> = {
  sword: "./assets/weapon-sword-thumb.webp",
  dagger: "./assets/weapon-dagger-thumb.webp",
  axe: "./assets/weapon-axe-thumb.webp",
  spear: "./assets/weapon-spear-thumb.webp",
  bow: "./assets/weapon-bow-thumb.webp",
  staff: "./assets/weapon-staff-thumb.webp",
};
const WEAPON_TRAITS: Record<WeaponId, string> = {
  sword: "均衡 / 近战",
  dagger: "贴身 / 爆发",
  axe: "爆发 / 扇形",
  spear: "突刺 / 直线",
  bow: "远射 / 压制",
  staff: "法术 / 爆裂",
};
const WEAPON_RANGE_SHORT: Record<WeaponId, string> = { sword: "0～2格", dagger: "0～1格", axe: "扇形1格", spear: "0～3格", bow: "2～4格", staff: "2格爆裂" };
const WEAPON_GROUPS: Record<WeaponGroup, WeaponId[]> = {
  melee: ["sword", "dagger", "axe", "spear"],
  ranged: ["bow", "staff"],
};
const GUIDE_STEPS = [
  { code: "CORE LOOP", title: "秘密规划，依次揭晓", copy: "双方在 45 秒内各自完成撤、搜、打。确认前对手看不到你的选择，双方确认后立即进入战斗回放。", art: "./assets/guide-loop.webp" },
  { code: "REMOVE", title: "先撤：改变战场", copy: "只能撤除外缘、无人占据且不会切断地图的地块。若双方选择同一块，后结算的一方本次机会作废。", art: "./assets/guide-remove.webp" },
  { code: "MOVE", title: "再搜：预测路线", copy: "每回合最多移动两格。依次点击相邻地块规划路线；如果路线中的砖先被撤掉，你会停在缺口前。", art: "./assets/guide-move.webp" },
  { code: "ATTACK", title: "最后打：武器与骰子", copy: "先选武器，再点击地图上的方向。金色格是攻击范围；掷骰达到武器门槛才会造成图中标注的伤害。", art: "./assets/guide-attack.webp" },
] as const;
const DIE_PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
const RANGE_DIAGRAM_CELLS = [
  { id: "0,-1", x: 0.5, y: 0 },
  { id: "2,-1", x: 2.5, y: 0 },
  { id: "0,0", x: 0, y: 1 },
  { id: "1,0", x: 1, y: 1 },
  { id: "2,0", x: 2, y: 1 },
  { id: "3,0", x: 3, y: 1 },
  { id: "4,0", x: 4, y: 1 },
  { id: "0,1", x: 0.5, y: 2 },
  { id: "2,1", x: 2.5, y: 2 },
] as const;
const AI_READY_LOCKS: Locks = {
  cyan: { remove: false, move: false, attack: false },
  red: { remove: true, move: true, attack: true },
};

function getPlayerId() {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem("multiwar-player-id", id);
  return id;
}

function sideName(side?: Side) {
  return side === "cyan" ? "青方" : "赤方";
}

function cellName(cell?: string) {
  if (!cell) return "未知地块";
  const [q, r] = cell.split(",");
  return `地块 ${q}·${r}`;
}

function eventText(event?: ResolutionEvent) {
  if (!event) return "正在展开双方的秘密计划…";
  const who = sideName(event.side);
  const target = sideName(event.targetSide);
  const weapon = event.weapon ? WEAPONS[event.weapon].name : "武器";
  switch (event.type) {
    case "remove": return `${who} 撤除了 ${cellName(event.cell)}`;
    case "remove_skipped": return `${who} 放弃本回合撤除`;
    case "remove_failed": return `${who} 选择的 ${cellName(event.cell)} 已不可撤，本次机会作废`;
    case "move": return `${who} 第 ${event.step} 步移动到 ${cellName(event.to)}`;
    case "move_stay": return `${who} 选择原地观察`;
    case "move_blocked": return `${who} 前往 ${cellName(event.to)} 的路线被缺口截断`;
    case "attack": return `${who} 举起${weapon}，瞄准 ${event.direction} 号方向`;
    case "attack_skipped": return `${who} 本回合没有发动攻击`;
    case "attack_missed_range": return `${who} 的${weapon}攻向 ${event.direction} 号方向，目标不在范围内`;
    case "die": return `${who} 使用${weapon}攻向 ${event.direction} 号方向，掷出 ${event.roll} 点：${event.hit ? "命中！" : "攻击无效"}`;
    case "damage": return `${who} 造成 ${event.damage} 点伤害，${target}剩余 ${event.health} 点生命`;
    case "defeated": return `${target} 生命归零，被击败`;
    case "round_end": return `第 ${event.round} 回合即将开始`;
    default: return "结算中";
  }
}

function phaseOf(event?: ResolutionEvent) {
  if (!event) return "揭晓";
  if (event.type.startsWith("remove")) return "撤";
  if (event.type.startsWith("move")) return "搜";
  if (["attack", "attack_skipped", "attack_missed_range", "die", "damage", "defeated"].includes(event.type)) return "打";
  return "终";
}

function replayEvent(current: GameState, event: ResolutionEvent, after: GameState, isLast: boolean) {
  if (event.type === "round_end" || (isLast && after.winner)) return after;
  const next: GameState = {
    ...current,
    removed: [...current.removed],
    players: {
      cyan: { ...current.players.cyan, weapons: [...current.players.cyan.weapons] },
      red: { ...current.players.red, weapons: [...current.players.red.weapons] },
    },
  };
  if (event.type === "remove" && event.cell && !next.removed.includes(event.cell)) next.removed.push(event.cell);
  if (event.type === "move" && event.side && event.to) next.players[event.side].position = event.to;
  if (event.type === "damage" && event.targetSide && event.health !== undefined) next.players[event.targetSide].health = event.health;
  return next;
}

function Board({ game, side, mode, selectedRemove, movePath, activeEvent, attackWeapon, attackDirection, onCell, onDirection }: {
  game: GameState; side: Side; mode: "view" | "remove" | "move" | "attack";
  selectedRemove?: string; movePath: string[]; activeEvent?: ResolutionEvent;
  attackWeapon?: WeaponId; attackDirection?: number; onCell?: (cell: string) => void; onDirection?: (direction: number) => void;
}) {
  const removed = new Set(game.removed);
  const previewPosition = (movePath.length ? movePath[movePath.length - 1] : undefined) || game.players[side].position;
  const previewGame = selectedRemove ? { ...game, removed: [...game.removed, selectedRemove] } : game;
  const legalMoves = new Set(mode === "move" ? legalMoveTargets(previewGame, previewPosition) : []);
  const removable = useMemo(() => mode === "remove"
    ? new Set(BOARD_CELLS.map(({ q, r }) => `${q},${r}`).filter((id) => canRemove(game, id)))
    : new Set<string>(), [game, mode]);
  const visibleDirection = attackDirection || activeEvent?.direction;
  const visibleWeapon = attackWeapon || activeEvent?.weapon;
  const attackOrigin = mode === "attack"
    ? previewPosition
    : activeEvent?.side ? game.players[activeEvent.side].position : previewPosition;
  const attackCells = useMemo(() => {
    const result = new Map<string, number>();
    if (!visibleWeapon || !visibleDirection) return result;
    for (const item of weaponAttackCells(visibleWeapon, attackOrigin, visibleDirection)) {
      if (BOARD_IDS.has(item.cell) && !game.removed.includes(item.cell)) {
        result.set(item.cell, Math.max(result.get(item.cell) ?? 0, item.damage));
      }
    }
    return result;
  }, [attackOrigin, game.removed, visibleDirection, visibleWeapon]);
  const aimDirections = useMemo(() => {
    const result = new Map<string, number>();
    if (mode !== "attack" || !visibleWeapon) return result;
    for (const item of weaponAimCells(visibleWeapon, attackOrigin)) {
      if (BOARD_IDS.has(item.cell) && !game.removed.includes(item.cell)) result.set(item.cell, item.direction);
    }
    return result;
  }, [attackOrigin, game.removed, mode, visibleWeapon]);
  const showCompass = mode === "attack" || Boolean(visibleDirection);

  return (
    <div className="board-wrap" aria-label="六边格战场">
      <div className={`board-field phase-${phaseOf(activeEvent)}`}>
        <div className="board">
        {BOARD_ROWS.map((row) => (
          <div className={`hex-row ${Math.abs(row) % 2 ? "is-offset" : ""}`} key={row}>
            {BOARD_CELLS.filter((cell) => cell.r === row).map(({ q, r }) => {
              const id = `${q},${r}`;
              const cyanHere = game.players.cyan.position === id;
              const redHere = game.players.red.position === id;
              const pathIndex = movePath.indexOf(id);
              const isActive = activeEvent?.cell === id || activeEvent?.to === id;
              const aimDirection = aimDirections.get(id);
              const attackDamage = attackCells.get(id);
              const selectable = removable.has(id) || legalMoves.has(id) || Boolean(aimDirection);
              return (
                <button type="button" key={id}
                  className={["hex", removed.has(id) ? "is-removed" : "", removable.has(id) ? "is-removable" : "", selectedRemove === id ? "is-remove-target" : "", legalMoves.has(id) ? "is-move-target" : "", aimDirection ? "is-aim-option" : "", attackDamage ? "is-attack-cell" : "", id === attackOrigin && visibleWeapon && WEAPONS[visibleWeapon].melee ? "is-attack-origin" : "", isActive ? "is-event" : ""].filter(Boolean).join(" ")}
                  disabled={mode === "view" || !selectable} onClick={() => mode === "attack" && aimDirection ? onDirection?.(aimDirection) : onCell?.(id)}
                  aria-label={`地块 ${id}${selectable ? "，可选择" : ""}`}>
                  {selectedRemove === id && <span className="remove-choice">撤</span>}
                  {attackDamage !== undefined && <span className="attack-damage">{attackDamage}<small>伤</small></span>}
                  {pathIndex >= 0 && mode !== "attack" && <span className="path-step">{pathIndex + 1}</span>}
                  {cyanHere && !(mode === "attack" && side === "cyan" && movePath.length) && <span className="piece cyan-piece"><b>青</b></span>}
                  {redHere && !(mode === "attack" && side === "red" && movePath.length) && <span className="piece red-piece"><b>赤</b></span>}
                  {movePath.length > 0 && previewPosition === id && <span className={`piece planned-piece ${side}-piece`}><b>{side === "cyan" ? "青" : "赤"}</b></span>}
                </button>
              );
            })}
          </div>
        ))}
        </div>
        {showCompass && <div className="direction-compass" aria-label="地图六方向">
          {[1,2,3,4,5,6].map((item) => <span key={item}
            className={`map-direction dir-${item} ${visibleDirection === item ? "selected" : ""}`}><b>{item}</b><small>方向</small></span>)}
        </div>}
      </div>
    </div>
  );
}

function PlayerHud({ game, side, me }: { game: GameState; side: Side; me: Side }) {
  const player = game.players[side];
  const badge = side === me ? "你" : player.id.startsWith("bot-") ? "AI" : "对手";
  return (
    <div className={`player-hud ${side} ${side === me ? "is-me" : ""}`}>
      <div className="avatar">{side === "cyan" ? "青" : "赤"}</div>
      <div className="player-copy">
        <div><strong>{player.name}</strong><span>{badge}</span></div>
        <div className="health-pips" aria-label={`${player.health} 点生命`}>
          {Array.from({ length: 6 }, (_, i) => <i className={i < player.health ? "full" : ""} key={i} />)}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [name, setName] = useState("");
  const [weapons, setWeapons] = useState<WeaponId[]>(["sword", "bow"]);
  const [detailWeapon, setDetailWeapon] = useState<WeaponId | null>(null);
  const [credential, setCredential] = useState<RoomCredential | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [locks, setLocks] = useState<Locks>(AI_READY_LOCKS);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(PLANNING_DURATION_SECONDS);
  const [removeCell, setRemoveCell] = useState<string>();
  const [moves, setMoves] = useState<string[]>([]);
  const [attackWeapon, setAttackWeapon] = useState<WeaponId>("sword");
  const [direction, setDirection] = useState(1);
  const [events, setEvents] = useState<ResolutionEvent[]>([]);
  const [eventIndex, setEventIndex] = useState(-1);
  const [settledDieKey, setSettledDieKey] = useState("");
  const [resolutionAfter, setResolutionAfter] = useState<GameState | null>(null);
  const [notice, setNotice] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackDescription, setFeedbackDescription] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>("idle");
  const [feedbackLogs, setFeedbackLogs] = useState<ActivityLogEntry[]>([]);
  const [restartOpen, setRestartOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [matchMode] = useState<"solo">("solo");
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const activityLogRef = useRef<ActivityLogEntry[]>([]);

  const side = credential?.side || "cyan";
  const myLocks = locks[side];
  const stage = !myLocks.remove ? 0 : !myLocks.move ? 1 : !myLocks.attack ? 2 : 3;

  const resetDraft = useCallback(() => {
    setRemoveCell(undefined); setMoves([]); setDirection(1);
  }, []);

  const recordActivity = useCallback((type: string, detail: string) => {
    activityLogRef.current = [...activityLogRef.current, {
      at: Date.now(), type: type.slice(0, 40), detail: detail.slice(0, 240),
    }].slice(-40);
  }, []);

  const resolveLocalRound = useCallback(() => {
    if (!game || screen !== "planning") return;
    const playerPlan: TurnPlan = { remove: removeCell, moves, weapon: attackWeapon, direction };
    const botPlan = planBotTurn(game, "red");
    const outcome = resolveRound(game, { cyan: playerPlan, red: botPlan });
    recordActivity("AI", `第 ${game.round} 回合计划已生成`);
    for (const event of outcome.events.slice(-12)) recordActivity("结算", eventText(event));
    setEvents(outcome.events); setEventIndex(-1); setResolutionAfter(outcome.state);
    setDeadlineAt(null); setLocks({ cyan: { remove: true, move: true, attack: true }, red: { remove: true, move: true, attack: true } });
    setScreen("resolving");
  }, [attackWeapon, direction, game, moves, recordActivity, removeCell, screen]);

  useEffect(() => {
    if (localStorage.getItem("multiwar-guide-v2")) return;
    const guideTimer = setTimeout(() => setGuideOpen(true), 0);
    return () => clearTimeout(guideTimer);
  }, []);

  useEffect(() => {
    if (!deadlineAt) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));
    tick(); const timer = setInterval(tick, 250); return () => clearInterval(timer);
  }, [deadlineAt]);

  useEffect(() => {
    if (screen !== "resolving" || !resolutionAfter) return;
    const nextIndex = eventIndex + 1;
    if (nextIndex >= events.length) {
      const nextTimer = setTimeout(() => {
        setGame(resolutionAfter);
        if (resolutionAfter.winner) {
          setScreen("finished");
          return;
        }
        setEvents([]); setEventIndex(-1); setResolutionAfter(null); resetDraft();
        setLocks(AI_READY_LOCKS); setSeconds(PLANNING_DURATION_SECONDS);
        setDeadlineAt(Date.now() + PLANNING_DURATION_SECONDS * 1000); setScreen("planning");
      }, 700);
      return () => clearTimeout(nextTimer);
    }
    const timer = setTimeout(() => {
      const event = events[nextIndex];
      setEventIndex(nextIndex);
      setGame((current) => current ? replayEvent(current, event, resolutionAfter, nextIndex === events.length - 1) : current);
    }, replayDelay(nextIndex > 0 ? events[nextIndex - 1] : undefined));
    return () => clearTimeout(timer);
  }, [eventIndex, events, resetDraft, resolutionAfter, screen]);

  useEffect(() => {
    if (screen !== "planning" || seconds !== 0) return;
    const timer = window.setTimeout(resolveLocalRound, 0);
    return () => window.clearTimeout(timer);
  }, [resolveLocalRound, screen, seconds]);

  const match = () => {
    const playerId = getPlayerId();
    recordActivity("对局", "开始离线 AI 对战");
    localStorage.setItem("multiwar-name", name.trim() || "旅行者");
    const next = createGame(
      { id: playerId, name: name.trim() || "旅行者", weapons },
      { id: "bot-local", name: "训练机器人", weapons: ["dagger", "staff"] },
    );
    setCredential({ roomId: "offline", side: "cyan", token: "local", playerId });
    setGame(next); setLocks(AI_READY_LOCKS); setAttackWeapon(weapons[0]);
    setSeconds(PLANNING_DURATION_SECONDS); setDeadlineAt(Date.now() + PLANNING_DURATION_SECONDS * 1000);
    setEvents([]); setEventIndex(-1); setResolutionAfter(null); resetDraft(); setScreen("planning");
  };

  const cancelMatch = () => {
    recordActivity("对局", "取消离线开局"); setScreen("home");
  };
  const toggleWeapon = (weapon: WeaponId) => setWeapons((current) => current.includes(weapon)
    ? current.length === 1 ? current : current.filter((item) => item !== weapon)
    : current.length < 2 ? [...current, weapon] : [current[1], weapon]);
  const holdWeapon = (weapon: WeaponId) => {
    longPressTriggeredRef.current = false;
    longPressRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setDetailWeapon(weapon);
    }, 420);
  };
  const clearHold = () => { if (longPressRef.current) clearTimeout(longPressRef.current); };
  const clickWeapon = (weapon: WeaponId) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    toggleWeapon(weapon);
  };
  const confirmStage = () => {
    if (!game) return;
    if (stage === 0) {
      recordActivity("撤", removeCell ? `确认 ${cellName(removeCell)}` : "跳过撤除");
      setLocks((current) => ({ ...current, cyan: { ...current.cyan, remove: true } }));
    }
    if (stage === 1) {
      recordActivity("搜", moves.length ? `确认 ${moves.length} 步路线` : "原地不动");
      setLocks((current) => ({ ...current, cyan: { ...current.cyan, move: true } }));
    }
    if (stage === 2) {
      recordActivity("打", `使用${WEAPONS[attackWeapon].name}攻击 ${direction} 方向`);
      resolveLocalRound();
    }
  };
  const chooseCell = (cell: string) => {
    if (stage === 0) {
      recordActivity("撤", `选择 ${cellName(cell)}`);
      setRemoveCell((current) => current === cell ? undefined : cell);
    }
    if (stage === 1 && moves.length < 2) {
      recordActivity("搜", `规划移动到 ${cellName(cell)}`);
      setMoves((current) => [...current, cell]);
    }
  };
  const leaveGame = () => {
    recordActivity("对局", "离开当前进度并返回主页");
    setCredential(null); setGame(null); setLocks(AI_READY_LOCKS); setEvents([]); setResolutionAfter(null); resetDraft(); setScreen("home");
  };

  const confirmRestart = () => {
    setRestartOpen(false);
    if (screen === "home") {
      recordActivity("重开", "恢复默认开局配置");
      setName(""); setWeapons(["sword", "bow"]); setNotice("");
      return;
    }
    leaveGame();
  };

  const openFeedback = () => {
    recordActivity("反馈", "打开问题反馈");
    setFeedbackLogs([...activityLogRef.current]);
    setFeedbackStatus("idle"); setFeedbackOpen(true);
  };

  const openGuide = () => {
    setGuideStep(0); setGuideOpen(true);
    recordActivity("引导", "打开新手战术简报");
  };

  const closeGuide = () => {
    localStorage.setItem("multiwar-guide-v2", "complete");
    setGuideOpen(false);
  };

  const submitFeedback = () => {
    const description = feedbackDescription.trim();
    if (!description || feedbackStatus === "submitting") return;
    const payload = { description, logs: activityLogRef.current.slice(-40), context: { screen, round: game?.round, stage, mode: matchMode } };
    localStorage.setItem("multiwar-offline-feedback", JSON.stringify(payload));
    recordActivity("反馈", "问题记录已保存在本机");
    setFeedbackStatus("success"); setFeedbackDescription("");
  };

  const commonOverlay = <>
    <GlobalActions onRestart={() => setRestartOpen(true)} onGuide={openGuide} onFeedback={openFeedback} />
    {guideOpen && <GuideSheet step={guideStep} onStep={setGuideStep} onClose={closeGuide} />}
    {feedbackOpen && <FeedbackSheet description={feedbackDescription} status={feedbackStatus}
      logs={feedbackLogs} onDescription={setFeedbackDescription} onSubmit={submitFeedback}
      onClose={() => setFeedbackOpen(false)} />}
    {restartOpen && <RestartSheet active={screen !== "home"} onConfirm={confirmRestart} onClose={() => setRestartOpen(false)} />}
  </>;

  if (screen === "home") return (
    <main className="game-shell home-screen">
      {commonOverlay}
      <header className="brand-bar"><strong><i>MW</i>MULTI·WAR</strong><span><b />六边格预测对战</span></header>
      <section className="home-copy">
        <div className="season-mark"><span>TACTICAL DUEL</span><b>01</b></div>
        <div className="eyebrow"><i />搜 · 打 · 撤<i /></div>
        <h1>猜中对手的<br /><em>下一步</em></h1>
        <p>搜走位、打预判、撤地砖。双方同时秘密规划，一局约十分钟。</p>
        <div className="battle-features"><span><b>37</b>格动态战场</span><span><b>D6</b>骰运博弈</span><span><b>10′</b>快速对局</span></div>
      </section>
      <section className="match-card">
        <header className="match-card-head"><div><small>战前整备</small><strong>建立你的作战配置</strong></div><span>READY</span></header>
        <label className="name-field"><span>你的代号</span><input aria-label="你的代号" placeholder="旅行者" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} /></label>
        <div className="loadout-title"><span>武器库 <b>{weapons.length}/2</b></span><small>点击装备 · 长按看范围图</small></div>
        <div className="weapon-arsenal" aria-label="全部武器">
          {(["melee", "ranged"] as WeaponGroup[]).map((group) => {
            const equipped = WEAPON_GROUPS[group].filter((weapon) => weapons.includes(weapon)).length;
            return <section className={`weapon-column ${group}`} key={group} aria-label={group === "melee" ? "近战武器" : "远程武器"}>
              <header><span>{group === "melee" ? "近战兵装" : "远程兵装"}<small>{WEAPON_GROUPS[group].length} 件</small></span><b>{equipped ? `${equipped} 已装备` : "未装备"}</b></header>
              <div className="weapon-stack">{WEAPON_GROUPS[group].map((weapon) => (
                <button type="button" key={weapon} className={`weapon-card ${weapons.includes(weapon) ? "selected" : ""}`}
                  onClick={() => clickWeapon(weapon)} onPointerDown={() => holdWeapon(weapon)} onPointerUp={clearHold}
                  onPointerLeave={clearHold} onContextMenu={(event) => event.preventDefault()}>
                  <span className="weapon-art"><img src={WEAPON_THUMB_ART[weapon]} alt="" width="320" height="320" decoding="async" draggable={false} /><i>{WEAPON_ICONS[weapon]}</i></span>
                  <span className="weapon-card-copy"><strong>{WEAPONS[weapon].name}</strong><small>{WEAPONS[weapon].role} · {WEAPON_TRAITS[weapon]}</small></span>
                  <span className="weapon-card-desc">{WEAPONS[weapon].description}</span>
                  <span className="weapon-card-stats"><b>范围 {WEAPON_RANGE_SHORT[weapon]}</b><em>伤害 {WEAPONS[weapon].damageLabel}</em><small>{Math.round(weaponHitChance(weapon) * 100)}% 命中</small></span>
                </button>
              ))}</div>
            </section>;
          })}
        </div>
        <div className="mode-actions solo-only">
          <button type="button" className="primary-action" onClick={match}>开始 AI 对战<span>离线运行 · 即时开局</span></button>
        </div>
      </section>
      {notice && <button className="toast" onClick={() => setNotice("")}>{notice}</button>}
      {detailWeapon && <WeaponSheet weapon={detailWeapon} onClose={() => setDetailWeapon(null)} />}
    </main>
  );

  if (screen === "matching" || !game || !credential) return (
    <main className="game-shell matching-screen">
      {commonOverlay}
      <div className="radar"><i /><i /><i /><span>VS</span></div>
      <div><h1>{credential ? "等待对手进入房间" : "正在寻找对手"}</h1><p>已为你保留武器配置</p></div>
      <button type="button" className="ghost-action" onClick={credential ? leaveGame : cancelMatch}>取消</button>
    </main>
  );

  const activeEvent = eventIndex >= 0 ? events[eventIndex] : undefined;
  const activeDieKey = activeEvent?.type === "die" ? `${eventIndex}-${activeEvent.roll}` : "";
  const activePhase = phaseOf(activeEvent);
  const activePhaseIndex = ["撤", "搜", "打", "终"].indexOf(activePhase);
  const recentEvents = events.slice(Math.max(0, eventIndex - 2), eventIndex + 1);
  const opponentSide = opponent(side);
  const winnerText = game.winner === "draw" ? "平局" : game.winner === side ? "你赢了" : "对手获胜";
  return (
    <main className={`game-shell battle-shell ${screen}`}>
      {commonOverlay}
      <header className="battle-header">
        <PlayerHud game={game} side="cyan" me={side} />
        <div className="round-counter"><span>ROUND</span><strong>{game.round}<i>/14</i></strong><small>{game.initiative === side ? "本回合你先结算" : "本回合对手先结算"}</small></div>
        <PlayerHud game={game} side="red" me={side} />
      </header>
      <section className="battle-stage">
        <Board game={game} side={side} mode={screen === "planning" ? stage === 0 ? "remove" : stage === 1 ? "move" : stage === 2 ? "attack" : "view" : "view"}
          selectedRemove={screen === "planning" ? removeCell : undefined} movePath={screen === "planning" ? moves : []}
          activeEvent={activeEvent} attackWeapon={screen === "planning" && stage === 2 ? attackWeapon : undefined}
          attackDirection={screen === "planning" && stage === 2 ? direction : undefined}
          onCell={chooseCell} onDirection={setDirection} />
      </section>

      {screen === "planning" && <aside className="operation-panel">
        <div className="phase-track">{["撤", "搜", "打"].map((label, index) => <span key={label} className={index < stage ? "done" : index === stage ? "active" : ""}><i>{index < stage ? "✓" : index + 1}</i>{label}</span>)}</div>
        <div className={`timer ${seconds <= 8 ? "urgent" : ""}`}><strong>{seconds}</strong><span>秒</span></div>
        <div className={`operation-copy stage-${stage}`}><small>{stage === 3 ? "计划已锁定" : `步骤 ${stage + 1} / 3`}</small>
          <h2><b>{stage === 0 ? "撤" : stage === 1 ? "搜" : stage === 2 ? "打" : "✓"}</b>{stage === 0 ? "从外缘撤掉一块地砖" : stage === 1 ? "规划最多两步路线" : stage === 2 ? "选择武器和攻击方向" : "等待对手确认"}</h2>
          <p>{stage === 0 ? "地图只标出可安全撤除的外缘。点一次选中，再点一次取消；占人或会切断地图的地块不会亮起。" : stage === 1 ? "依次点击相邻地块。若对手先撤掉路线中的砖，你会停在缺口前。" : stage === 2 ? "先点武器，再直接点击地图上带虚线的格子选择方向；金色地块就是该方向的真实攻击范围。" : "双方完成后，将自动播放撤、搜、打的结算。"}</p>
        </div>
        {stage === 0 && <div className={`remove-summary ${removeCell ? "has-choice" : ""}`}><i>{removeCell ? "✓" : "—"}</i><span>{removeCell ? `已选择 ${cellName(removeCell)}` : "尚未选择，确认后将跳过"}<small>只可选外缘且撤后地图保持连通的地块</small></span></div>}
        {stage === 1 && <div className="move-summary"><span>{moves.length ? `已走 ${moves.length} / 2 步` : "原地不动也是策略"}</span><button type="button" onClick={() => setMoves((path) => path.slice(0, -1))} disabled={!moves.length}>撤回一步</button></div>}
        {stage === 2 && <><div className="attack-weapons">{game.players[side].weapons.map((weapon) => <button key={weapon} type="button" onClick={() => setAttackWeapon(weapon)} className={attackWeapon === weapon ? "selected" : ""}><i><img src={WEAPON_THUMB_ART[weapon]} alt="" width="320" height="320" decoding="async" draggable={false} /></i><span>{WEAPONS[weapon].name}<small>{WEAPONS[weapon].rangeLabel} · {Math.round(weaponHitChance(weapon) * 100)}%</small></span><b>{WEAPONS[weapon].role}</b></button>)}</div>
          <div className="direction-choice"><span>地图点击瞄准</span><strong>{direction} 号方向</strong><small>格内数字为命中后的伤害</small></div></>}
        {stage < 3 && <button type="button" className="confirm-action" onClick={confirmStage}>{stage === 0 ? removeCell ? "确认撤除" : "跳过撤除" : stage === 1 ? moves.length ? "确认路线" : "原地不动" : `用${WEAPONS[attackWeapon].name}攻击 ${direction} 方向`}</button>}
        {stage === 3 && <div className="locked-state"><i>✓</i><span>你的计划已加密提交<small>{locks[opponentSide].attack ? "对手也已就绪" : "等待对手…"}</small></span></div>}
      </aside>}

      {screen === "resolving" && <aside className={`resolution-panel event-${activeEvent?.type || "intro"}`}>
        <div className="resolution-kicker"><span>战斗回放</span><b>{Math.max(0, eventIndex + 1)} / {events.length}</b></div>
        <div className="resolution-track">{["撤", "搜", "打"].map((label, index) => <span key={label} className={index < activePhaseIndex ? "done" : index === activePhaseIndex ? "active" : ""}><i>{index < activePhaseIndex ? "✓" : label}</i><small>{label === "撤" ? "地形" : label === "搜" ? "走位" : "交锋"}</small></span>)}</div>
        <div className={`resolution-actor ${activeEvent?.side || "neutral"}`}><i>{activeEvent?.side === "cyan" ? "青" : activeEvent?.side === "red" ? "赤" : "!"}</i><span>{activeEvent?.side ? `${sideName(activeEvent.side)}行动` : "秘密计划公开"}<small>{activePhase === "终" ? "回合结束" : `${activePhase}阶段`}</small></span>{activeEvent?.weapon && <img src={WEAPON_THUMB_ART[activeEvent.weapon]} alt={WEAPONS[activeEvent.weapon].name} width="320" height="320" decoding="async" />}</div>
        {activeEvent?.type === "die" ? <AnimatedDie key={activeDieKey} event={activeEvent} onSettled={() => setSettledDieKey(activeDieKey)} /> : <h2>{eventText(activeEvent)}</h2>}
        <div className="battle-log">{recentEvents.map((event, index) => {
          const current = index === recentEvents.length - 1;
          const rolling = current && event.type === "die" && settledDieKey !== activeDieKey;
          return <div key={`${eventIndex}-${index}`} className={current ? "current" : ""}><i>{phaseOf(event)}</i><span>{rolling ? `${sideName(event.side)}正在掷骰…` : eventText(event)}</span></div>;
        })}</div>
        <div className="event-progress">{events.map((_, index) => <i key={index} className={index <= eventIndex ? "active" : ""} />)}</div>
        <p>只播放双方的公开结算，播放完成后自动进入下一回合</p>
      </aside>}

      {screen === "finished" && <aside className="result-panel"><small>对局结束</small><h1>{winnerText}</h1>
        <div className="final-score"><span>{game.players[side].health} HP</span><i>:</i><span>{game.players[opponentSide].health} HP</span></div>
        <button type="button" className="primary-action" onClick={leaveGame}>返回匹配</button>
      </aside>}
      {notice && <button className="toast" onClick={() => setNotice("")}>{notice}</button>}
    </main>
  );
}

function GlobalActions({ onRestart, onGuide, onFeedback }: { onRestart: () => void; onGuide: () => void; onFeedback: () => void }) {
  return <nav className="global-actions" aria-label="全局操作">
    <button type="button" onClick={onRestart} aria-label="重新开始" title="重新开始"><span aria-hidden="true">↻</span></button>
    <button type="button" onClick={onGuide} aria-label="新手引导" title="新手引导"><span aria-hidden="true">✦</span></button>
    <button type="button" onClick={onFeedback} aria-label="问题反馈" title="问题反馈"><span aria-hidden="true">?</span></button>
  </nav>;
}

function GuideSheet({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const item = GUIDE_STEPS[step];
  const last = step === GUIDE_STEPS.length - 1;
  return <div className="sheet-backdrop guide-backdrop">
    <section className="guide-sheet" aria-modal="true" role="dialog" aria-labelledby="guide-title">
      <button className="sheet-close" type="button" onClick={onClose} aria-label="关闭新手引导">×</button>
      <div className="guide-visual">
        <div className="guide-visual-label"><span>TACTICAL BRIEFING</span><b>0{step + 1}</b></div>
        <img src={item.art} alt="" draggable={false} />
      </div>
      <div className="guide-copy">
        <small>{item.code} · 0{step + 1}/0{GUIDE_STEPS.length}</small>
        <h2 id="guide-title">{item.title}</h2>
        <p>{item.copy}</p>
        <div className="guide-dots" aria-label="引导进度">{GUIDE_STEPS.map((guide, index) => <button key={guide.code} type="button" aria-label={`第 ${index + 1} 页`} className={index === step ? "active" : ""} onClick={() => onStep(index)} />)}</div>
        <div className="guide-actions">
          <button type="button" className="guide-skip" onClick={onClose}>{step === 0 ? "跳过引导" : "结束引导"}</button>
          <button type="button" className="guide-next" onClick={() => last ? onClose() : onStep(step + 1)}>{last ? "开始作战" : "下一步"}<span>→</span></button>
        </div>
      </div>
    </section>
  </div>;
}

function AnimatedDie({ event, onSettled }: { event: ResolutionEvent; onSettled: () => void }) {
  const roll = event.roll || 1;
  const [face, setFace] = useState(((roll + 2) % 6) + 1);
  const [settled, setSettled] = useState(false);
  const onSettledRef = useRef(onSettled);
  useEffect(() => { onSettledRef.current = onSettled; }, [onSettled]);
  useEffect(() => {
    let tick = 0;
    const interval = setInterval(() => {
      tick += 1;
      setFace(((roll + tick * 5) % 6) + 1);
    }, 80);
    const settleTimer = setTimeout(() => {
      clearInterval(interval); setFace(roll); setSettled(true); onSettledRef.current();
    }, DICE_ROLL_DURATION_MS);
    return () => { clearInterval(interval); clearTimeout(settleTimer); };
  }, [roll]);
  return <div className={`die-roll ${settled ? "settled" : "rolling"} ${event.hit ? "hit" : "miss"}`}>
    <div className={`big-die ${settled ? event.hit ? "hit" : "miss" : ""}`}>
      <div className="die-face" aria-label={settled ? `骰子 ${roll} 点` : "骰子滚动中"}>{Array.from({ length: 9 }, (_, index) => <i key={index} className={DIE_PIPS[face].includes(index) ? "show" : ""} />)}</div>
      <small>{settled ? `掷出 ${roll} · 需要 ${event.threshold}+` : "骰子滚动中"}</small>
    </div>
    <span className={`die-outcome ${settled ? "visible" : ""}`}>{event.hit ? "命中" : "落空"}</span>
    <h2>{settled ? eventText(event) : `${sideName(event.side)}掷出骰子，等待结果…`}</h2>
  </div>;
}

function FeedbackSheet({ description, status, logs, onDescription, onSubmit, onClose }: {
  description: string; status: FeedbackStatus; logs: ActivityLogEntry[];
  onDescription: (value: string) => void; onSubmit: () => void; onClose: () => void;
}) {
  const recent = logs.slice(-8).reverse();
  return <div className="sheet-backdrop feedback-backdrop">
    <button type="button" className="sheet-dismiss" aria-label="关闭问题反馈" onClick={onClose} />
    <section className="feedback-sheet" aria-modal="true" role="dialog" aria-labelledby="feedback-title">
      <button className="sheet-close" type="button" onClick={onClose}>×</button>
      <small>帮助我们变得更好</small><h2 id="feedback-title">问题反馈</h2>
      {status === "success" ? <div className="feedback-success"><i>✓</i><strong>问题记录已保存</strong><p>离线模式会把描述和近期操作保存在本机；你可以在入口笔记评论区反馈给我们。</p><button type="button" onClick={onClose}>完成</button></div> : <>
        <label className="feedback-description"><span>问题描述</span><textarea maxLength={600} value={description}
          onChange={(event) => onDescription(event.target.value)}
          placeholder="例如：第 3 回合点击 2 号方向后，攻击范围没有更新……" /></label>
        <div className="feedback-meta"><span>{description.length} / 600</span><small>将附带最近 {logs.length} 条操作记录，不包含房间令牌</small></div>
        <details className="feedback-logs"><summary>查看将要保存在本机的近期记录</summary>
          {recent.length ? recent.map((log, index) => <div key={`${log.at}-${index}`}><time>{new Date(log.at).toLocaleTimeString("zh-CN", { hour12: false })}</time><b>{log.type}</b><span>{log.detail}</span></div>) : <p>还没有可附带的操作记录</p>}
        </details>
        {status === "error" && <p className="feedback-error">保存失败，请稍后重试。</p>}
        <button type="button" className="feedback-submit" disabled={!description.trim() || status === "submitting"} onClick={onSubmit}>{status === "submitting" ? "正在保存…" : "保存问题记录"}</button>
      </>}
    </section>
  </div>;
}

function RestartSheet({ active, onConfirm, onClose }: { active: boolean; onConfirm: () => void; onClose: () => void }) {
  return <div className="sheet-backdrop restart-backdrop">
    <button type="button" className="sheet-dismiss" aria-label="取消重新开始" onClick={onClose} />
    <section className="restart-sheet" aria-modal="true" role="dialog" aria-labelledby="restart-title">
      <i className="restart-glyph">↻</i><small>重新开始</small><h2 id="restart-title">{active ? "离开当前进度？" : "恢复默认配置？"}</h2>
      <p>{active ? "你会退出当前对局并回到开局页；武器配置会保留，当前进度无法恢复。" : "代号会清空，武器恢复为长剑与弓箭。"}</p>
      <div><button type="button" className="restart-cancel" onClick={onClose}>取消</button><button type="button" className="restart-confirm" onClick={onConfirm}>确认重开</button></div>
    </section>
  </div>;
}

function WeaponSheet({ weapon, onClose }: { weapon: WeaponId; onClose: () => void }) {
  const item = WEAPONS[weapon];
  return <div className="sheet-backdrop"><button type="button" className="sheet-dismiss" aria-label="关闭武器属性" onClick={onClose} /><section className="weapon-sheet" aria-modal="true" role="dialog">
    <button className="sheet-close" type="button" onClick={onClose}>×</button>
    <div className="weapon-sheet-hero"><img src={WEAPON_ART[weapon]} alt={item.name} /><div><small>兵装档案 · {WEAPON_TRAITS[weapon]}</small><h2>{item.name}</h2><p>{item.description}</p></div></div>
    <div className="weapon-sheet-body"><WeaponRangeDiagram weapon={weapon} /><div className="weapon-stats">
      <div className="weapon-stat"><span>命中条件</span><strong>D6 ≥ {item.threshold}</strong></div>
      <div className="weapon-stat"><span>命中率</span><strong>{Math.round(weaponHitChance(weapon) * 100)}%</strong></div>
      <div className="weapon-stat"><span>范围 / 伤害</span><strong>{item.rangeLabel} · {item.damageLabel}</strong></div>
      <div className="weapon-stat"><span>攻击类型</span><strong>{item.melee ? `近战 · 同格 ${item.sameCellDamage} 伤` : weapon === "staff" ? "范围 · 可跨缺口" : "远程 · 可跨缺口"}</strong></div>
    </div></div>
  </section></div>;
}

function WeaponRangeDiagram({ weapon }: { weapon: WeaponId }) {
  const attacks = new Map(weaponAttackCells(weapon, "0,0", 1).map((cell) => [cell.cell, cell.damage]));
  return <section className="range-diagram" aria-label={`${WEAPONS[weapon].name}向 1 号方向攻击范围图`}>
    <header><span>攻击范围示意</span><b>1 号方向 →</b></header>
    <div className="range-diagram-grid">
      {RANGE_DIAGRAM_CELLS.map((cell) => {
        const damage = attacks.get(cell.id);
        const origin = cell.id === "0,0";
        const blind = weapon === "bow" && cell.id === "1,0";
        const style = { "--range-x": cell.x, "--range-y": cell.y } as CSSProperties;
        return <span key={cell.id} style={style} className={`range-hex ${damage ? "is-hit" : ""} ${origin ? "is-origin" : ""} ${blind ? "is-blind" : ""}`}>
          {origin ? <><strong>我</strong><small>{damage ? `同格 ${damage}伤` : "起点"}</small></>
            : damage ? <><strong>{damage}</strong><small>伤害</small></>
              : blind ? <><strong>×</strong><small>盲区</small></> : null}
        </span>;
      })}
    </div>
    <footer><span><i className="legend-hit" />命中格</span><span><i className="legend-origin" />当前位置</span><small>图中数字为命中后的伤害</small></footer>
  </section>;
}
