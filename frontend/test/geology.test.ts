// #50 geology grounding: the oreblocks face stamps ride in the provenance (scenario metadata), so
// the cyclelog/v1 rows are byte-identical and every existing consumer is unaffected. These tests
// prove (a) a geology block ingests cleanly and is exposed on the sample, and (b) a cyclelog with
// only the v1 columns still ingests when a geology block is present in provenance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestCycleLog, parseCycleCsv, type Geology, type Provenance } from '../src/replay/ingest';

const REAL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'examples', 'real');

const CSV = `t,truck_id,shovel_id,event,payload_t
0,1,1,load,0
150,1,1,haul,220
450,1,10,dump,220
510,1,10,return,0
60,2,2,load,0
220,2,2,haul,230
620,2,10,dump,230
680,2,10,return,0`;

const GEO: Geology = {
  engine: 'oreblocks', archetype: 'porphyry', cutoffGrade: 0.00114, stampedPitValue: 1.24e9,
  gradeUnit: 'mass fraction',
  faces: [
    { shovelId: 1, bench: 4, grade: 0.0107, oreFraction: 1.0, levelTonnes: 5.6e6 },
    { shovelId: 2, bench: 2, grade: 0.0046, oreFraction: 0.65, levelTonnes: 4.9e6 },
  ],
  note: 'synthetic bench-aligned deposit',
};

test('a geology-carrying sample ingests and exposes the faces', () => {
  const prov: Provenance = { source: 's', license: 'Apache-2.0', kind: 'structure-real', caveats: 'c', geology: GEO };
  const r = ingestCycleLog(parseCycleCsv(CSV), { id: 't', name: 't', provenance: prov });
  assert.ok(r.ok && r.sample);
  assert.equal(r.sample.provenance.geology?.archetype, 'porphyry');
  assert.equal(r.sample.provenance.geology?.faces.length, 2);
  assert.equal(r.sample.provenance.geology?.faces[0].bench, 4);
});

test('geology is OPTIONAL — a sample without it still ingests (backward compatible)', () => {
  const prov: Provenance = { source: 's', license: 'MIT', kind: 'structure-real', caveats: 'c' };
  const r = ingestCycleLog(parseCycleCsv(CSV), { id: 't', name: 't', provenance: prov });
  assert.ok(r.ok && r.sample);
  assert.equal(r.sample.provenance.geology, undefined);
});

test('the committed mhs-pit samples carry geology; ug samples do not', () => {
  if (!existsSync(REAL)) return; // skip if the data lane is absent
  const provs = readdirSync(REAL).filter((f) => f.endsWith('.provenance.json'));
  const pit = provs.filter((f) => f.startsWith('mhs-pit-'));
  const ug = provs.filter((f) => f.startsWith('mhs-ug-'));
  assert.ok(pit.length >= 6, 'expected several open-pit samples');
  for (const f of pit) {
    const d = JSON.parse(readFileSync(join(REAL, f), 'utf8'));
    assert.ok(d.geology, `${f} must carry geology`);
    assert.ok(['porphyry', 'vein', 'layered', 'core_halo'].includes(d.geology.archetype));
    assert.ok(d.geology.faces.length >= 1 && d.geology.stampedPitValue > 0);
  }
  for (const f of ug) {
    const d = JSON.parse(readFileSync(join(REAL, f), 'utf8'));
    assert.equal(d.geology, undefined, `${f} (underground) must NOT carry geology in v1`);
  }
});

test('a geology sample still writes the exact cyclelog/v1 columns (contract untouched)', () => {
  if (!existsSync(REAL)) return;
  const csvFiles = readdirSync(REAL).filter((f) => f.startsWith('mhs-pit-') && f.endsWith('.csv'));
  assert.ok(csvFiles.length >= 1);
  const header = readFileSync(join(REAL, csvFiles[0]), 'utf8').split('\n')[0].trim();
  assert.equal(header, 't,truck_id,shovel_id,event,payload_t', 'cyclelog/v1 header must be unchanged');
});
