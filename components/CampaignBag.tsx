import { useState } from "react";
import { ITEMS, type Bag, type Item } from "../lib/campaign-items";

interface BagProps {
  bag: Bag;
  owners: (string | undefined)[];
  activeSlot: number | null;
  onSelect?: (slot: number) => void;
}
export function CampaignBag({ bag, owners, activeSlot, onSelect }: BagProps) {
  return <section className="field-bag" aria-label="队伍背包">
    <header><strong>队伍背包</strong><small>{bag.filter(Boolean).length} / 2 格</small></header>
    <div className="bag-slots">{bag.map((item, slot) => {
      const data = item && ITEMS[item];
      const content = <><i aria-hidden="true">{data?.icon ?? "＋"}</i>
        <span><b>{data?.name ?? "空格"}</b><small>{owners[slot] ?? (data ? (onSelect ? "选择使用" : "一次性") : "可放道具")}</small></span></>;
      return data && onSelect ? <button type="button" key={slot} className="bag-slot occupied" aria-label={"使用" + data.name + "，第" + (slot+1) + "格"}
        aria-pressed={activeSlot === slot} title={data.effect} onClick={() => onSelect(slot)}>{content}</button>
        : <div key={slot} className={"bag-slot" + (data ? " occupied" : "")} title={data?.effect}>{content}</div>;
    })}</div>
  </section>;
}

interface LootProps {
  bag: Bag; choices: readonly Item[]; supply?: boolean;
  onTake: (item: Item, replace?: number) => void; onSkip?: () => void;
}
export function CampaignLoot({ bag, choices, supply, onTake, onSkip }: LootProps) {
  const [picked, setPicked] = useState<Item | null>(choices.length === 1 ? choices[0] : null);
  const [replace, setReplace] = useState<number>();
  const full = bag.every(Boolean);
  return <section className="campaign-loot" aria-label={supply ? "驿站物资" : "战利品"}>
    <strong>{supply ? "驿站物资" : "战利品 · 二选一"}</strong>
    <div className="loot-choices">{choices.map(item => <button type="button" key={item} aria-pressed={picked === item}
      className="loot-card" onClick={() => setPicked(item)}>
      <b>{ITEMS[item].name}</b><small>{ITEMS[item].effect}</small></button>)}</div>
    {full && <><p>背包已满。选择要换下的道具，确认后替换。</p>
      <div className="loot-choices">{bag.map((item, slot) => item && <button type="button" className="loot-card"
        key={slot} aria-pressed={replace === slot} onClick={() => setReplace(slot)}>
        <b>换下第 {slot+1} 格 · {ITEMS[item].name}</b><small>{ITEMS[item].effect}</small></button>)}</div></>}
    <div className="loot-actions"><button type="button" className="campaign-primary" disabled={!picked || (full && replace === undefined)}
      onClick={() => picked && onTake(picked, replace)}>{supply ? "拾取烟幕弹" : "领取并结义"}</button>
      {onSkip && <button type="button" className="campaign-quiet" onClick={onSkip}>{supply ? "留在驿站" : "放弃战利品，结义"}</button>}</div>
  </section>;
}
