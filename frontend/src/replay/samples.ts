// Real-sample loading (#14): list the shipped cycle-log samples (public/data/real/index.json), load one through
// CONTRACT 1 (ingest), and accept a bring-your-own-data CSV file through the SAME gate. Everything the App uses
// in real mode flows through ingestCycleLog, shipped and user data alike.
// minehaulsim samples (#30) additionally ship `<id>.topo.json`: the PitTopoSpec of the REAL generated
// geometry, attached to the ingested mine so the 3D view renders it instead of the derived default.
// Underground samples ship minehaulsim.minetopo/v1 instead (#21): levels + decline + passes.
import type { MineTopo, PitTopoSpec } from '../sim/types';
import { ingestCycleLog, parseCycleCsv, type IngestReport, type Provenance } from './ingest';

export interface SampleMeta { id: string; name: string; kind: string; csv: string; topo?: string; }

const base = import.meta.env.BASE_URL;

export async function listSamples(): Promise<SampleMeta[]> {
  try {
    const res = await fetch(`${base}data/real/index.json`);
    if (!res.ok) return [];
    return ((await res.json()) as { samples: SampleMeta[] }).samples ?? [];
  } catch {
    return [];
  }
}

export async function loadSample(meta: SampleMeta): Promise<IngestReport> {
  const [csvRes, provRes, topoRes] = await Promise.all([
    fetch(`${base}data/real/${meta.csv}`),
    fetch(`${base}data/real/${meta.id}.provenance.json`),
    meta.topo ? fetch(`${base}data/real/${meta.topo}`) : Promise.resolve(null),
  ]);
  if (!csvRes.ok) throw new Error(`sample ${meta.id}: HTTP ${csvRes.status}`);
  const prov = provRes.ok ? await provRes.json() : {};
  const provenance: Provenance = {
    source: prov.source ?? 'shipped sample',
    license: prov.license ?? 'unknown',
    kind: (prov.kind as Provenance['kind']) ?? 'structure-real',
    caveats: prov.caveats ?? '',
    ...(prov.geology ? { geology: prov.geology as Provenance['geology'] } : {}),
  };
  const report = ingestCycleLog(parseCycleCsv(await csvRes.text()), { id: meta.id, name: meta.name, provenance });
  if (report.ok && report.sample && topoRes?.ok) {
    const t: unknown = await topoRes.json().catch(() => null);
    if (t && typeof (t as PitTopoSpec).rimRx === 'number' && typeof (t as PitTopoSpec).nBenches === 'number') {
      report.sample.mine.topo = t as PitTopoSpec;                       // open pit
    } else if (t && (t as MineTopo).schema === 'minehaulsim.minetopo/v1'
               && Array.isArray((t as MineTopo).decline) && Array.isArray((t as MineTopo).levels)) {
      report.sample.mine.minetopo = t as MineTopo;                      // underground (#21)
    }
  }
  return report;
}

/** BYOD: a user-provided cyclelog CSV goes through the SAME contract; rejects surface in the UI. */
export async function loadUserFile(file: File): Promise<IngestReport> {
  const text = await file.text();
  const provenance: Provenance = {
    source: `user file: ${file.name}`,
    license: 'user-provided',
    kind: 'real-field-log',
    caveats: 'User-provided log: provenance not verified by the app.',
  };
  return ingestCycleLog(parseCycleCsv(text), { id: `byod-${file.name}`, name: file.name, provenance });
}
