// Corpus tuning + invariant harness (dev only). Runs every case and reports the round-2 acceptance signals.
import { CASES } from '../src/sim/cases.ts';
import { runSimulation } from '../src/sim/model.ts';
import { RolloutSim } from '../src/sim/rolloutSim.ts';
import { capacityOracle } from '../src/sim/oracle.ts';
import { POLICIES, policyById } from '../src/policies/heuristics.ts';

const laneOfDump = (mine, id) => (mine.dumps.find((d) => d.id === id)?.kind === 'waste' ? 'waste' : 'ore');
const validPaths = (mine) => {
  // valid loaded: shovel(ore)->crusher, shovel(ore)->stockpile, shovel(waste)->waste
  const errs = [];
  for (const key of Object.keys(mine.routes)) {
    const [s, d] = key.split('->').map(Number);
    const sh = mine.shovels.find((x) => x.id === s), du = mine.dumps.find((x) => x.id === d);
    if (!sh || !du) { errs.push(`route ${key} references missing node`); continue; }
    const ok = (sh.faceType === 'ore' && (du.kind === 'crusher' || du.kind === 'stockpile'))
            || (sh.faceType === 'waste' && du.kind === 'waste');
    if (!ok) errs.push(`INVALID path ${key}: ${sh.faceType} -> ${du.kind}`);
  }
  return errs;
};

for (const c of CASES) {
  const mine = c.mine;
  const nOre = mine.shovels.filter((s) => s.faceType === 'ore').length;
  const nWaste = mine.shovels.length - nOre;
  const crushers = mine.dumps.filter((d) => d.kind === 'crusher');
  const stocks = mine.dumps.filter((d) => d.kind === 'stockpile');
  const oracle = capacityOracle(c);
  const pathErrs = validPaths(mine);

  // deterministic run with trace (greedy) for the invariant checks
  let det, thrown = null;
  try { det = runSimulation(c, policyById('greedy').fn, 7, { deterministic: true, trace: true }); }
  catch (e) { thrown = String(e); }
  const rows = [];
  rows.push(`${c.id}  ${c.name}`);
  rows.push(`   shovels=${mine.shovels.length} (ore ${nOre}/waste ${nWaste})  dumps=${mine.dumps.length} crush=${crushers.length} stock=${stocks.length}  bays=[${crushers.map((d) => d.bays ?? 1).join(',')}]  fleet=${c.fleet.trucks.length} models=${[...new Set(c.fleet.trucks.map((t) => t.spec.model))].length}`);
  rows.push(`   portal=${mine.portal ? 'yes' : 'NO'}  oracle=${oracle.tonnes.toFixed(0)} (${oracle.bindingSide})`);
  if (pathErrs.length) rows.push(`   PATH ERRORS: ${pathErrs.join(' | ')}`);
  if (thrown) { rows.push(`   THREW: ${thrown}`); console.log(rows.join('\n')); continue; }
  rows.push(`   det tonnes=${det.tonnes.toFixed(0)}  (<=oracle: ${det.tonnes <= oracle.tonnes + 1e-6})`);

  // stockpile cycling: deterministic level series max% + does it draw down after the max
  const levelAt = (series, t) => { let v = 0; for (const p of series) { if (p.t <= t) v = p.level; else break; } return v; };
  for (const sp of stocks) {
    const series = det.stockLevels?.[sp.id] ?? [];
    const cap = sp.areaCapacityT ?? 1;
    let max = 0, peak = 0, maxDD = 0;
    for (const p of series) { peak = Math.max(peak, p.level); max = Math.max(max, p.level); maxDD = Math.max(maxDD, peak - p.level); }
    const hourly = Array.from({ length: 9 }, (_, h) => (levelAt(series, h * 3600) / cap * 100).toFixed(0)).join(' ');
    const cycles = max >= 0.30 * cap && maxDD >= 0.10 * cap;
    rows.push(`   stock ${sp.id}: max=${(max / cap * 100).toFixed(0)}%  maxDrawdown=${(maxDD / cap * 100).toFixed(0)}pts  cycles=${cycles}  hourly%=[${hourly}]`);
  }
  // rehandle legs (haulFull to a stockpile) + off-road / origin checks
  const trace = det.trace ?? [];
  let rehandle = 0, offRoad = 0, atOrigin = 0;
  for (const l of trace) {
    if (l.state === 'haulFull' && stocks.some((s) => s.id === l.node)) rehandle++;
    if (l.x0 === 0 && l.y0 === 0) atOrigin++;
    if (l.x1 === 0 && l.y1 === 0) atOrigin++;
    if (l.state === 'haulEmpty') {
      // empty leg node is the target shovel; its lane must match the dump the truck left (x0,y0 == a dump)
      const dump = mine.dumps.find((d) => Math.abs(d.pos.x - l.x0) < 1 && Math.abs(d.pos.y - l.y0) < 1);
      const sh = mine.shovels.find((s) => s.id === l.node);
      if (dump && sh && sh.faceType !== laneOfDump(mine, dump.id)) offRoad++;
    }
  }
  rows.push(`   rehandle legs=${rehandle}  cross-lane empty legs=${offRoad}  legs-at-origin=${atOrigin}  totalLegs=${trace.length}`);

  // rollout parity (det) on greedy + shortestWait
  let parityOK = true;
  for (const pid of ['greedy', 'shortestWait']) {
    const m = runSimulation(c, policyById(pid).fn, 7, { deterministic: true }).tonnes;
    const o = new RolloutSim(c, 7, { deterministic: true }).runWithPolicy(policyById(pid).fn, c.shiftSec).tonnes;
    if (m !== o) { parityOK = false; rows.push(`   PARITY FAIL ${pid}: model ${m} != rollout ${o}`); }
  }
  rows.push(`   parity(det)=${parityOK}`);
  console.log(rows.join('\n'));
}
