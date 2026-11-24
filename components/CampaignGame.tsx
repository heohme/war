"use client";

import { useState, type CSSProperties } from "react";
import { BOARD_CELLS, BOARD_ROWS, WEAPONS, cellId, isAdjacent, parseCell, weaponAttackCells } from "../lib/game";
import {
  ENCOUNTERS, ENEMIES, HEROES, ROUND_LIMIT, enemyReach, finishBattle, gridLabel, aimedStrike, heroDamage, maxHp,
  newCampaign, planItems, resolveOrders, retryBattle, takeSupply, travel, type Campaign, type Hero, type Orders,
} from "../lib/campaign";
import { nextTrailCell } from "../lib/campaign-guide";
import { CACHE_CELL, ITEMS, SPOILS, itemTargets, type ItemPlay } from "../lib/campaign-items";
import { CampaignBag, CampaignLoot } from "./CampaignBag";

function Route({ from, to, enemy = false, piece }: { from: string; to: string; enemy?: boolean; piece?: string }) {
  if (from === to) return null;
  const point = (id: string) => {
    const { q, r } = parseCell(id);
    return { x: 4.5 + q + Math.abs(r % 2) / 2, y: .57735 + (r + 2) * .866 };
  };
  const a = point(from), b = point(to);
  const dx = b.x - a.x, dy = b.y - a.y;
  const style: CSSProperties = {
    left: `calc(var(--tile) * ${a.x + dx * .26})`, top: `calc(var(--tile) * ${a.y + dy * .26})`,
    width: `calc(var(--tile) * ${Math.hypot(dx, dy) * .48})`, transform: `rotate(${Math.atan2(dy, dx)}rad)`,
  };
  const pawnStyle = {
    left: `calc(var(--tile) * ${b.x})`, top: `calc(var(--tile) * ${b.y})`,
    "--from-x": `calc(var(--tile) * ${-dx})`, "--from-y": `calc(var(--tile) * ${-dy})`,
  } as CSSProperties;
  return <><span aria-hidden="true" className={"campaign-route" + (enemy ? " enemy" : "")} style={style} />
    {piece && <span aria-hidden="true" className={"campaign-travel-token" + (enemy ? " enemy" : "")} style={pawnStyle}>{piece}</span>}</>;
}
const INVITATIONS = {
  guanyu: "某姓关，名羽。听说玄德善使双剑，可愿与我走上两招？",
  zhangfei: "俺叫张飞！且来试试你的剑，打得痛快，俺就跟你走！",
  lvbu: "三人齐至？好，便一起上吧！",
};

export function CampaignGame({ onExit }: { onExit: () => void }) {
  const [state, setState] = useState(newCampaign);
  const [walkFrom, setWalkFrom] = useState<string | null>(null);
  const [selected, setSelected] = useState<Hero>("liubei");
  const [orders, setOrders] = useState<Orders>({});
  const [guided, setGuided] = useState(true);
  const [invitation, setInvitation] = useState<Campaign | null>(null);
  const [previous, setPrevious] = useState<Campaign | null>(null);
  const [positions, setPositions] = useState<Partial<Record<Hero, string>>>({});
  const [leaving, setLeaving] = useState(false);
  const [itemSlot, setItemSlot] = useState<number | null>(null);
  const [sharedCell, setSharedCell] = useState<string | null>(null);
  const [supplyClosed, setSupplyClosed] = useState(false);
  const { battle, recruits } = state;
  const level = recruits.length + 1;
  const active = battle?.status === "active";
  const last = previous?.battle;
  const meeting = invitation?.battle?.enemy;
  const foe = battle && ENCOUNTERS[battle.enemy];
  const goal = ENEMIES.find(e => e === "lvbu" || !recruits.includes(e))!;
  const living = battle?.party.filter(p => p.hp > 0) ?? [];
  const actor = living.find(p => p.hero === selected) ?? living[0];
  const order = actor && orders[actor.hero];
  const position = actor && positions[actor.hero];
  const ready = living.filter(p => orders[p.hero]).length;
  const { error: planningError, pulls } = planItems(state, orders);
  const allReady = active && ready === living.length && !planningError && itemSlot === null;
  const using = itemSlot === null ? null : state.bag[itemSlot];
  const plannedParty = living.map(p => ({ ...p, cell: positions[p.hero] ?? p.cell }));
  const targets = using && actor && battle ? itemTargets(using, actor.hero, plannedParty, battle.cell) : [];
  const supplyHere = !battle && !state.cleared && !state.cacheTaken && state.position === CACHE_CELL;
  const direction = order && actor ? aimedStrike(actor.hero, order).direction : 0;
  const covered = new Map(actor && order && direction && !using
    ? weaponAttackCells(HEROES[actor.hero].weapon, order.cell, direction)
      .map(a => [a.cell, a.damage + (actor.hero === "liubei" ? recruits.length : 0)] as const) : []);
  const holding = !!(battle && actor && order?.target && !heroDamage(actor.hero, order, battle.cell, recruits.length));
  const suggestedCell = guided && !battle && !invitation && !state.cleared ? nextTrailCell(state.position, goal) : undefined;
  const forecast = battle ? living.reduce((sum, p) => {
    const command = orders[p.hero];
    return sum + (command ? heroDamage(p.hero, command, battle.cell, recruits.length) : 0);
  }, 0) : 0;
  const title = state.cleared ? "虎牢关告捷" : battle && battle.enemy !== "lvbu" ? "与" + foe!.name + "切磋" : "三英战吕布";

  function apply(next: Campaign) {
    setState(next);
    setOrders({});
    setPositions({});
    setPrevious(null);
    setSelected(next.battle?.party.find(p => p.hp > 0)?.hero ?? "liubei");
    setInvitation(null);
    setWalkFrom(null);
    setItemSlot(null);
    setSharedCell(null);
    setSupplyClosed(false);
  }
  function selectItem(slot: number) {
    if (!actor || !active || leaving) return;
    const owner = living.find(p => orders[p.hero]?.item?.slot === slot);
    if (owner && owner.hero !== actor.hero) {
      setSelected(owner.hero);
      setItemSlot(null);
    } else {
      if (!position) setPositions({ ...positions, [actor.hero]: actor.cell });
      setItemSlot(itemSlot === slot ? null : slot);
    }
    setSharedCell(null);
  }
  function chooseCell(id: string) {
    if (invitation || leaving) return;
    if (!battle) {
      const next = travel(state, id);
      if (next.battle) setInvitation(next);
      else {
        apply(next);
        if (next.position !== state.position) setWalkFrom(state.position);
      }
      return;
    }
    if (!actor || !active) return;
    if (using && position && itemSlot !== null) {
      const matches = targets.filter(t => t.cell === id);
      if (matches.length === 1) act(position, null, { slot: itemSlot, mark: matches[0].mark });
      else if (matches.length > 1) setSharedCell(id);
      return;
    }
    if (position) {
      if (aimedStrike(actor.hero, { cell: position, target: id }).damage) act(position, id);
    } else if (id === actor.cell || isAdjacent(actor.cell, id)) {
      setPositions({ ...positions, [actor.hero]: id });
    }
  }
  function act(cell: string, target: string | null, item?: ItemPlay) {
    if (!actor || !active) return;
    const next = { ...orders, [actor.hero]: { cell, target, item } };
    setItemSlot(null);
    setSharedCell(null);
    setOrders(next);
    setPositions({ ...positions, [actor.hero]: cell });
    const pending = living.find(p => !next[p.hero]);
    if (pending) setSelected(pending.hero);
  }
  function changeMove() {
    if (!actor) return;
    const remaining = { ...orders }, cells = { ...positions };
    delete remaining[actor.hero];
    delete cells[actor.hero];
    setOrders(remaining);
    setPositions(cells);
    setItemSlot(null);
    setSharedCell(null);
  }
  function commit() {
    if (!allReady) return;
    const next = resolveOrders(state, orders);
    if (next === state) return;
    apply(next);
    setPrevious(state);
  }

  return <main className="game-shell campaign-shell">
    <div className="campaign-layout">
      <header className="campaign-heading">
        <div><p>单人战役 / 虎牢关</p><h1>{title}</h1></div>
        <div className="campaign-nav">{!battle && <button type="button" className="campaign-quiet" aria-pressed={guided}
          onClick={() => setGuided(!guided)}>{guided ? "关闭路标" : "开启路标"}</button>}
          <button type="button" className="campaign-quiet" onClick={() => state.cleared ? onExit() : setLeaving(true)}>返回大厅</button></div>
      </header>
      {leaving && <section className="campaign-exit" aria-label="离开战役">
        <span>离开将结束本次战役。</span><button type="button" onClick={() => setLeaving(false)}>继续战役</button><button type="button" onClick={onExit}>离开</button>
      </section>}
      <section className="campaign-map" aria-label={battle ? "战斗棋盘" : "探索棋盘"}>
        <div className="campaign-map-heading"><strong>{battle ? foe!.site : "关前行军图"}</strong>
          <span>{battle ? "第 " + battle.round + " / " + ROUND_LIMIT + " 回合" : "已结义 " + recruits.length + " / 2"}</span></div>
        {!battle && !meeting && !state.cleared && <div className="campaign-board-order"><span aria-live="polite">
          <strong>{goal === "lvbu" ? "前往虎牢关，挑战吕布" : "前往" + ENCOUNTERS[goal].site + "，拜访" + ENCOUNTERS[goal].name}</strong>
          <small>{guided ? "点「前进」行军。" : "点相邻亮格行军。"}{state.cacheTaken ? "长亭和石桥的切磋各有一份战利品。" : "也可以绕到 B4 驿站，拾取烟幕弹。"}</small></span></div>}
        {supplyHere && !meeting && (supplyClosed
          ? <button type="button" className="campaign-quiet" onClick={() => setSupplyClosed(false)}>查看驿站物资</button>
          : <CampaignLoot supply bag={state.bag} choices={["smoke"]} onTake={(_, slot) => apply(takeSupply(state, slot))}
              onSkip={() => setSupplyClosed(true)} />)}
        {meeting && invitation && <section className="campaign-invite" aria-label="武将邀战">
          <p>{ENCOUNTERS[meeting].site} · {ENCOUNTERS[meeting].name}</p>
          <blockquote>{INVITATIONS[meeting]}</blockquote>
          <p>我方先手。每人走一格或留在原地，再选攻击、使用背包道具或待命。点「结束回合」后，仍有体力的敌将才行动。</p>
          <p>{ROUND_LIMIT} 回合内将{ENCOUNTERS[meeting].name}体力打到 0，{meeting === "lvbu" ? "即可通关。" : "即可结义。"}</p>
          <div><button type="button" className="campaign-primary" onClick={() => apply(invitation)}>{meeting === "lvbu" ? "三英迎战" : "接受切磋"}</button>
            <button type="button" className="campaign-quiet" onClick={() => setInvitation(null)}>稍后再来</button></div>
        </section>}
        {battle && <div className="campaign-objective"><strong>{battle.enemy === "lvbu" ? "战役目标" : "切磋目标"}</strong>
          <span>{ROUND_LIMIT} 回合内击败{foe!.name} · {battle.enemy === "lvbu" ? "胜利即通关" : "胜利后结义"}</span>
          <b>{foe!.name}体力 {battle.hp} / {foe!.hp}</b></div>}
        {battle && !active && <section className={"campaign-verdict " + battle.status} aria-live="polite">
          <h2>{battle.status === "won" ? (battle.enemy === "lvbu" ? "战役胜利 · 吕布败退" : "切磋胜利 · " + foe!.name + "认输") :
            battle.party.every(p => !p.hp) ? "战败 · 我方全员退阵" : "战败 · 十回合已尽"}</h2>
          {battle.status === "won" && <p>{battle.enemy === "lvbu" ? "三英合力击退吕布，虎牢关战役完成。" : foe!.name + "愿意同行。刘备升一级，体力上限 +2，命中伤害 +1。"}</p>}
          {battle.status === "won" && battle.enemy !== "lvbu"
            ? <CampaignLoot bag={state.bag} choices={SPOILS[battle.enemy]} onTake={(item, slot) => apply(finishBattle(state, item, slot))}
                onSkip={() => apply(finishBattle(state))} />
            : <div className="campaign-review-actions"><button type="button" className="campaign-submit" onClick={() =>
            apply(battle.status === "won" ? finishBattle(state) : retryBattle(state))}>
            {battle.status === "won" ? "查看战果" : "重试本场"}</button></div>}
        </section>}
        {active && actor && <>
          {battle.enemy === "lvbu" && <div className="campaign-party" aria-label="我方武将">{battle.party.map(p =>
            <button type="button" key={p.hero} disabled={!p.hp} aria-pressed={p.hero === actor.hero} onClick={() => {
              setSelected(p.hero); setItemSlot(null); setSharedCell(null);
            }}>
              <b>{HEROES[p.hero].name}</b><small>{!p.hp ? "退阵" : orders[p.hero] ? "已安排" : "待行动"}</small></button>)}</div>}
          <div className="campaign-board-order"><span aria-live="polite">
            <strong>{using ? HEROES[actor.hero].name + " · " + ITEMS[using].name : allReady ? "行动已就绪" : HEROES[actor.hero].name + (position ? " · 攻击" : " · 移动")}</strong>
            <small>{using ? ITEMS[using].effect + (targets.length ? " 点蓝色目标格。" : " 当前站位没有可选目标，可重选站位或取消。")
              : order?.item ? ITEMS[state.bag[order.item.slot]!].name + " · " +
                (state.bag[order.item.slot] === "barrier" ? gridLabel(order.item.mark) : HEROES[order.item.mark as Hero].name) + "，结束回合时消耗。"
              : holding ? (pulls.has(actor.hero) ? "绳钩会拉走这名武将，本次守候将取消。" : "守候金色格，敌将本回合走入时按格上数值受伤。")
              : order ? (order.target ? "敌将已在金色格内，将立即命中。" : "本回合待命，可改选攻击格。") :
              position ? (aimedStrike(actor.hero, { cell: position, target: battle.cell }).damage
                ? "点" + foe!.name + "所在格攻击，或点亮格选其他方向。" : "点亮格选守候方向，敌将走入就能命中。") : "点青色格走一步，或留在原地。"}</small></span>
            <button type="button" className="campaign-quiet" onClick={() => position ? changeMove() : chooseCell(actor.cell)}>
              {position ? "重选站位" : "留在原地"}</button></div>
        </>}
        <CampaignBag bag={state.bag} activeSlot={itemSlot} owners={state.bag.map((_, slot) => {
          const owner = living.find(p => orders[p.hero]?.item?.slot === slot);
          return owner && (HEROES[owner.hero].name + "已选");
        })} onSelect={active ? selectItem : undefined} />
        {using && <div className="item-controls"><span>{using === "barrier" ? "选相邻空格" : "选我方武将"} · 占用本次攻击</span>
          {using === "smoke" && battle?.demonstration && <small>首回合敌将收招，可将烟幕留到下回合。</small>}
          <button type="button" onClick={() => { setItemSlot(null); setSharedCell(null); }}>取消使用</button>
          {sharedCell && position && itemSlot !== null && targets.filter(t => t.cell === sharedCell).map(t =>
            <button type="button" key={t.mark} onClick={() => act(position, null, { slot: itemSlot, mark: t.mark })}>{HEROES[t.mark as Hero].name}</button>)}</div>}
        <div className="campaign-board"><div className="campaign-grid">
          {BOARD_ROWS.map(row => <div className={"campaign-row" + (Math.abs(row) % 2 ? " shifted" : "")} key={row}>
            {BOARD_CELLS.filter(c => c.r === row).map(coord => {
              const id = cellId(coord);
              const site = !battle && ENEMIES.find(k => ENCOUNTERS[k].cell === id);
              const heroes = battle?.party.filter(p => p.hp > 0 && (positions[p.hero] ?? p.cell) === id).map(p => HEROES[p.hero].name) ?? [];
              const here = !battle && state.position === id;
              const supply = !battle && !state.cleared && !state.cacheTaken && id === CACHE_CELL;
              const itemTarget = !!using && targets.some(t => t.cell === id);
              const barricade = living.some(p => {
                const play = orders[p.hero]?.item;
                return play && state.bag[play.slot] === "barrier" && play.mark === id;
              });
              const enemyHere = battle?.cell === id;
              const canMove = !battle ? !invitation && !state.cleared && isAdjacent(state.position, id)
                : active && !position && actor && (actor.cell === id || isAdjacent(actor.cell, id));
              const canAttack = !!(!using && active && position && actor && aimedStrike(actor.hero, {cell:position, target:id}).damage);
              const suggested = suggestedCell === id;
              const label = [...heroes, ...(enemyHere && foe ? [foe.name] : []), ...(here ? ["刘备"] : []), ...(site ? [ENCOUNTERS[site].site] : []), ...(supply ? ["驿站"] : [])].join("·");
              const classes = [canMove && "can-move", (here || heroes.length > 0) && "ally", (enemyHere || site === "lvbu") && "foe",
                site && "site", supply && "supply", itemTarget && "item-target", canAttack && "can-aim", order?.target === id && "targeted", active && covered.has(id) && "covered", suggested && "suggested"].filter(Boolean).join(" ");
              return <button type="button" key={id} className={"campaign-cell " + classes} disabled={(!canMove && !canAttack && !itemTarget) || leaving}
                aria-label={[gridLabel(id), label, supply && "烟幕弹", canMove && "可走", canAttack && "可攻击", covered.has(id) && "命中伤害 " + covered.get(id), itemTarget && "道具目标", suggested && "前进"].filter(Boolean).join(" ")}
                onClick={() => chooseCell(id)}>
                <small>{gridLabel(id)}</small><b>{label}</b>
                {itemTarget ? <em>可选</em> : barricade ? <em>路障</em> : supply ? <em>烟幕弹</em> : suggested ? <em className="campaign-mark">前进</em> : covered.has(id) ? <em>{covered.get(id)} 伤</em> : canAttack && enemyHere ? <em>可攻击</em> :
                  site && !here && <em>{site === "lvbu" ? (level === 3 ? "可挑战" : "待结义") : recruits.includes(site) ? "已结义" : ENCOUNTERS[site].name}</em>}
              </button>;
            })}
          </div>)}
          {!battle && walkFrom && <div className="campaign-paths"><Route key={state.position} from={walkFrom} to={state.position} piece="刘" /></div>}
          {battle && <div className="campaign-paths">
            {last && !Object.keys(positions).length && <div key={last.round}>
              {last.party.map(p => <Route key={p.hero} from={p.cell} to={battle.party.find(after => after.hero === p.hero)!.cell} piece={HEROES[p.hero].name[0]} />)}
              <Route from={last.cell} to={battle.cell} enemy piece={foe!.name[0]} /></div>}
            {living.map(p => positions[p.hero] ? <Route key={p.hero} from={p.cell} to={positions[p.hero]!} /> : null)}
          </div>}
        </div></div>
        {active && actor && <>
          {position && <div className="campaign-forecast"><span>{HEROES[actor.hero].name}：{actor.cell === position ? "原地" : gridLabel(actor.cell) + " → " + gridLabel(position)}</span>
            {forecast > 0 && <strong>立即命中 · {Math.min(battle.hp, forecast)} 点伤害</strong>}
            {!using && (order?.target !== null || order?.item) && <button type="button" className="campaign-quiet" onClick={() => act(position, null)}>待命</button>}</div>}
          {planningError && <p role="alert" className="campaign-report">{planningError}</p>}
          <button type="button" disabled={!allReady} className="campaign-submit" onClick={commit}>结束回合</button>
        </>}
        {battle?.report && <div className="campaign-recap"><p className="campaign-report" role="status">{battle.report}</p>
          {previous && <button type="button" className="campaign-quiet" onClick={() => apply(previous)}>撤回上次行动</button>}</div>}
      </section>
      <aside className="campaign-panel">
        {!battle ? <>
          <p className="campaign-kicker">{state.cleared ? "战役完成" : "同行武将"}</p>
          <h2>{state.cleared ? "三英齐名" : "刘备的队伍"}</h2>
          <dl className="campaign-stats"><dt>刘备 · 等级 {level}</dt><dd>体力 {maxHp("liubei", level)}</dd></dl>
          <ul className="campaign-objectives">{ENEMIES.map(key => <li key={key}><span>{ENCOUNTERS[key].site} · {ENCOUNTERS[key].name}</span>
            <b>{key === "lvbu" ? (state.cleared ? "已通关" : level === 3 ? "可挑战" : "待结义") : recruits.includes(key) ? "已结义" : "待拜访"}</b></li>)}</ul>
          <p className="campaign-report" role="status">{state.message}</p>
          {state.cleared && <button type="button" className="campaign-submit" onClick={() => apply(newCampaign())}>再玩一次</button>}
        </> : <>
          <h2>双方体力</h2>
          {[{ name: foe!.name, hp: battle.hp, max: foe!.hp, enemy: true }, ...battle.party.map(p => ({
            name: HEROES[p.hero].name, hp: p.hp, max: maxHp(p.hero, level), enemy: false,
          }))].map(p => <div key={p.name} className={p.enemy ? "campaign-vitals enemy" : "campaign-vitals"}>
            <div><strong>{p.name}</strong><span>{p.hp} / {p.max}</span></div><progress aria-label={p.name + "体力"} value={p.hp} max={p.max} /></div>)}
          {active && <p className="campaign-instruction">{battle.demonstration ? "本场切磋的第一回合，对手让你先试招，免受反击伤害。" :
            battle.enemy === "zhangfei" ? "张飞走完后，只反击与他相距两格的武将，造成 " + foe!.power + " 点伤害。" :
            foe!.name + "走完后，会对距离 " + enemyReach(battle) + " 格以内的武将造成 " + foe!.power + " 点伤害。"}</p>}
          {active && actor && <details className="campaign-more"><summary>回合规则</summary>
            <p>先走 0～1 格，再攻击、使用道具或待命。敌将在所选攻击格内时立即命中，否则守候到敌将走完。走入金色格会在反击前受伤，每人每回合只攻击一次。被绳钩拉离站位会结束守候。</p>
            <p>{HEROES[actor.hero].name} · {HEROES[actor.hero].art}，{WEAPONS[HEROES[actor.hero].weapon].rangeLabel}。</p></details>}
        </>}
      </aside>
    </div>
  </main>;
}
