// In-memory parameter sweep to find stockpile-cycling settings per case (dev only).
import { CASES } from '../src/sim/cases.ts';
import { runSimulation } from '../src/sim/model.ts';
import { policyById } from '../src/policies/heuristics.ts';

const target = process.argv[2];           // case id
const c0 = CASES.find((c) => c.id === target);
if (!c0) { console.log('unknown case', target); process.exit(1); }

const clone = (o) => JSON.parse(JSON.stringify(o));
const oreTrucks = c0.fleet.trucks.filter((t) => c0.mine.shovels.find((s) => s.id === t.startShovel)?.faceType === 'ore').length;

// sweep the main (buffered) crusher dumpMeanSec, the stockpile reclaim + cap, and an ore-truck scale
const crusherId = c0.mine.dumps.find((d) => d.kind === 'crusher' && (d.bays ?? 1) >= 2)?.id ?? c0.mine.dumps.find((d) => d.kind === 'crusher').id;
const stockId = c0.mine.dumps.find((d) => d.kind === 'stockpile').id;
const cap0 = c0.mine.dumps.find((d) => d.id === stockId).areaCapacityT;

function run(dm, reclaim, cap, oreScale) {
  const c = clone(c0);
  c.mine.dumps.find((d) => d.id === crusherId).dumpMeanSec = dm;
  const sp = c.mine.dumps.find((d) => d.id === stockId);
  sp.reclaimRateTph = reclaim; sp.areaCapacityT = cap;
  // scale ore trucks: duplicate/trim ore-lane trucks
  const ore = c0.fleet.trucks.filter((t) => c0.mine.shovels.find((s) => s.id === t.startShovel)?.faceType === 'ore');
  const waste = c0.fleet.trucks.filter((t) => c0.mine.shovels.find((s) => s.id === t.startShovel)?.faceType === 'waste');
  const nOre = Math.max(2, Math.round(ore.length * oreScale));
  const newOre = Array.from({ length: nOre }, (_, i) => ({ ...clone(ore[i % ore.length]) }));
  c.fleet = { trucks: [...newOre, ...clone(waste)].map((t, i) => ({ ...t, id: i + 1 })) };
  const r = runSimulation(c, policyById('greedy').fn, 7, { deterministic: true });
  const series = r.stockLevels?.[stockId] ?? [];
  let max = 0, iMax = 0; series.forEach((p, i) => { if (p.level > max) { max = p.level; iMax = i; } });
  const minAfter = Math.min(...series.slice(iMax).map((p) => p.level), max);
  return { dm, reclaim, cap, nOre, maxPct: max / cap * 100, drawPct: (max - minAfter) / cap * 100, tonnes: r.tonnes };
}

const dmList = target === 'C08' || target === 'C06' ? [110, 125, 140, 155] : [70, 80, 90, 100, 115];
const results = [];
for (const dm of dmList)
  for (const reclaim of [2600, 3000, 3400, 3800])
    for (const cap of [10000, 12000, 14000])
      for (const oreScale of [0.5, 0.65, 0.8, 1.0]) {
        const r = run(dm, reclaim, cap, oreScale);
        // want max in [40,85] and a clear draw >= 15 pts
        r.score = (r.maxPct >= 40 && r.maxPct <= 88 ? 1 : 0) + (r.drawPct >= 15 ? 1 : 0) + Math.min(1, r.drawPct / 40);
        results.push(r);
      }
results.sort((a, b) => b.score - a.score || b.drawPct - a.drawPct);
console.log(`${target}  (base oreTrucks=${oreTrucks}, cap0=${cap0}, crusher=${crusherId})`);
for (const r of results.slice(0, 8))
  console.log(`  dm=${r.dm} reclaim=${r.reclaim} cap=${r.cap} nOre=${r.nOre}  max=${r.maxPct.toFixed(0)}% draw=${r.drawPct.toFixed(0)}pts tonnes=${r.tonnes.toFixed(0)} score=${r.score.toFixed(2)}`);
