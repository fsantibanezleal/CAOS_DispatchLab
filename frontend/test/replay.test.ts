import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestCycleLog, parseCycleCsv, type Provenance } from '../src/replay/ingest';
import { replayCycleLog } from '../src/replay/replayEngine';

const PROV: Provenance = { source: 'hand-written test fixture', license: 'MIT', kind: 'structure-real', caveats: 'test fixture only' };

// two trucks × two shovels × one dump, two full cycles each — a minimal, legal cyclelog/v1 shift
const CSV = `t,truck_id,shovel_id,event,payload_t
0,1,1,load,0
150,1,1,haul,220
450,1,10,dump,220
510,1,10,return,0
760,1,2,load,0
910,1,2,haul,215
1310,1,10,dump,215
1370,1,10,return,0
60,2,2,load,0
220,2,2,haul,230
620,2,10,dump,230
680,2,10,return,0
930,2,1,load,0
1080,2,1,haul,210
1380,2,10,dump,210
1440,2,10,return,0`;

test('contract: a legal log ingests, rosters + empirical derived', () => {
  const rep = ingestCycleLog(parseCycleCsv(CSV), { id: 'FX1', name: 'fixture', provenance: PROV });
  assert.ok(rep.ok, JSON.stringify(rep.rejected));
  const s = rep.sample!;
  assert.deepEqual(s.trucks, [1, 2]);
  assert.deepEqual(s.shovels, [1, 2]);
  assert.deepEqual(s.dumps, [10]);
  assert.ok(s.shiftSec > 0);
  assert.ok(s.empirical.loadMeanSecByShovel[1] > 0);
  assert.ok(s.empirical.payloadMeanT > 200);
  // synthesized layout carries every routed pair seen in the log
  assert.ok(s.mine.routes['1->10'] && s.mine.routes['2->10']);
});

test('contract: rejects NaN, unknown events, illegal transitions, non-monotonic time', () => {
  const bad1 = ingestCycleLog(parseCycleCsv('t,truck_id,shovel_id,event,payload_t\nx,1,1,load,0'), { id: 'b', name: 'b', provenance: PROV });
  assert.ok(!bad1.ok || bad1.rejected.length > 0);
  const bad2 = ingestCycleLog(parseCycleCsv('t,truck_id,shovel_id,event,payload_t\n0,1,1,fly,0'), { id: 'b', name: 'b', provenance: PROV });
  assert.ok(!bad2.ok || bad2.rejected.length > 0);
  // load -> dump skips haul: illegal machine → whole sample rejected
  const bad3 = ingestCycleLog(parseCycleCsv(`t,truck_id,shovel_id,event,payload_t
0,1,1,load,0
100,1,1,dump,220
200,1,1,return,0
300,1,1,load,0
400,1,1,haul,220
500,1,10,dump,220
600,1,10,return,0
700,1,1,load,0
800,1,1,haul,220`), { id: 'b', name: 'b', provenance: PROV });
  assert.ok(!bad3.ok);
  assert.ok(bad3.rejected.some((r) => r.reason.includes('illegal')));
});

test('replay: folds the log into the SimResult shape (tonnes, legs, decisions, waits)', () => {
  const rep = ingestCycleLog(parseCycleCsv(CSV), { id: 'FX1', name: 'fixture', provenance: PROV });
  const { result, decisions } = replayCycleLog(rep.sample!);
  // tonnes = sum of dumped payloads
  assert.equal(result.tonnes, 220 + 215 + 230 + 210);
  // crusher feed is cumulative + monotone
  for (let i = 1; i < result.crusherFeed.length; i++) assert.ok(result.crusherFeed[i].tonnes >= result.crusherFeed[i - 1].tonnes);
  // legs cover all four states and are time-ordered
  const states = new Set(result.trace!.map((l) => l.state));
  for (const st of ['atShovel', 'haulFull', 'atDump', 'haulEmpty']) assert.ok(states.has(st as never), st);
  for (const l of result.trace!) assert.ok(l.t1 >= l.t0);
  // per-shovel KPIs: both shovels served twice
  assert.deepEqual(result.shovels.map((s) => s.served), [2, 2]);
  // real dispatcher decisions: one per return->load (2 trucks × 1 mid-shift redirect each)
  assert.equal(decisions.length, 2);
  assert.ok(decisions.every((d) => [1, 2].includes(d.chosen)));
  // policy label is honest
  assert.match(result.policy, /measured/);
});

test('replay: deterministic (same sample → identical result)', () => {
  const rep = ingestCycleLog(parseCycleCsv(CSV), { id: 'FX1', name: 'fixture', provenance: PROV });
  const a = replayCycleLog(rep.sample!);
  const b = replayCycleLog(rep.sample!);
  assert.deepEqual(a.result, b.result);
  assert.deepEqual(a.decisions, b.decisions);
});

test('counterfactual: reconstructs real decision states and scores policy agreement', async () => {
  const { reconstructDecisions, agreement } = await import('../src/replay/counterfactual');
  const { POLICIES } = await import('../src/policies/heuristics');
  const rep = ingestCycleLog(parseCycleCsv(CSV), { id: 'FX1', name: 'fixture', provenance: PROV });
  const ds = reconstructDecisions(rep.sample!);
  assert.equal(ds.length, 2);                       // one per return->load in the fixture
  for (const d of ds) {
    assert.equal(d.state.shovels.length, 2);
    assert.ok([1, 2].includes(d.chosen));
    assert.ok(d.state.travelEmptySec(1) > 0);
    // features are finite for every shovel (the ONNX/heuristic input)
    for (const v of d.state.shovels) { assert.ok(Number.isFinite(v.freeInSec)); assert.ok(v.loadMeanSec > 0); }
  }
  const rows = agreement(ds, POLICIES, false);
  assert.equal(rows.length, POLICIES.length);
  for (const r of rows) { assert.ok(r.pct >= 0 && r.pct <= 100); assert.equal(r.n, 2); }
});
