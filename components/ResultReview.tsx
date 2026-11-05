import type { MatchStats } from "../lib/match-summary";

export function ResultReview({ stats }: { stats: MatchStats }) {
  const rows = [
    { label: "预判落空", count: stats.predictionMisses, detail: "对手未进入攻击范围，没有掷骰。" },
    { label: "路线被截断", count: stats.routesInterrupted,
      detail: `移动被已撤地砖阻挡，其中 ${stats.blockedAttackMisses} 次随后攻击落空。` },
    { label: "骰子未命中", count: stats.diceMisses, detail: "对手已在攻击范围内，骰点未达门槛。" },
  ];
  return <section className="result-review" aria-label="本局复盘">
    <header>本局复盘<span>按实际结算记录</span></header>
    <dl>{rows.map((row) => <div key={row.label}>
      <dt>{row.label}</dt><dd><b>{row.count} 次</b><small>{row.detail}</small></dd>
    </div>)}</dl>
    {stats.skippedAttacks > 0 && <p>另有 {stats.skippedAttacks} 回合未提交完整攻击。</p>}
    {stats.attacksCancelled > 0 && <p>最后一回合被击败前未能出手。</p>}
  </section>;
}
