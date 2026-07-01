// Real-sample loading (#14): list the shipped cycle-log samples (public/data/real/index.json), load one through
// CONTRACT 1 (ingest), and accept a bring-your-own-data CSV file through the SAME gate. Everything the App uses
// in real mode flows through ingestCycleLog — shipped and user data alike.
import { ingestCycleLog, parseCycleCsv, type IngestReport, type Provenance } from './ingest';

export interface SampleMeta { id: string; name: string; kind: string; csv: string; }

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
  const [csvRes, provRes] = await Promise.all([
    fetch(`${base}data/real/${meta.csv}`),
    fetch(`${base}data/real/${meta.id}.provenance.json`),
  ]);
  if (!csvRes.ok) throw new Error(`sample ${meta.id}: HTTP ${csvRes.status}`);
  const prov = provRes.ok ? await provRes.json() : {};
  const provenance: Provenance = {
    source: prov.source ?? 'shipped sample',
    license: prov.license ?? 'unknown',
    kind: (prov.kind as Provenance['kind']) ?? 'structure-real',
    caveats: prov.caveats ?? '',
  };
  return ingestCycleLog(parseCycleCsv(await csvRes.text()), { id: meta.id, name: meta.name, provenance });
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
