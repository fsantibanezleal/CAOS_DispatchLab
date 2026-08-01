// Contract 2 mirror (frontend side). Must stay in lock-step with the Python schemas in
// data-pipeline/pipeline/core/{trace.py, manifest.py}. A drift here makes `tsc` fail -> the contract is enforced at
// build time (the web cannot ship reading a shape the pipeline does not produce).

// ---------- per-case replay trace (dispatchlab.trace/v1) ----------

export interface PolicyStat {
  id: string;
  en: string;
  es: string;
  medTonnes: number;
  medWaitH: number;
  loT: number;
  hiT: number;
  loW: number;
  hiW: number;
  pareto: boolean;
}

export interface CaseTrace {
  schema: string; // "dispatchlab.trace/v1"
  case_id: string;
  name: string;
  category: string;
  real_or_synthetic: string;
  expected_band: string;
  scenario: { n_shovels: number; n_trucks: number; truck_model: string; shift_sec: number };
  policies: PolicyStat[];
  pareto: string[];
  tie: { leader: string; tied: string[] } | null;
  learned: { policyImitAcc: number; bcBestImitAcc: number; bestPolicy: string; nTrain: number; nEval: number };
}

// ---------- manifest (dispatchlab.manifest/v2) + index ----------

export interface ArtifactRef { path: string; format: string; trace_schema: string; bytes: number; }

export interface GateVerdict {
  lane: string;
  client_side: boolean;
  runtimes: string[];
  trace_bytes: number;
  run_ms_budget: number;
  trace_bytes_budget: number;
  reasons: string[];
}

export interface SharedArtifacts {
  models: Array<{ id: string; file: string; opset: number; kind: string }>;
  learned_metrics: string;
  case_results: string;
}

export interface CaseManifest {
  schema: string; // "dispatchlab.manifest/v2"
  case_id: string;
  name: string;
  category: string;
  real_or_synthetic: string;
  expected_band: string;
  validation_anchor: string;
  engine: { package: string; version: string; model: string };
  seed: number;
  shared: SharedArtifacts;
  artifact: ArtifactRef;
  lane: 'live' | 'precompute';
  gate: GateVerdict;
  flags: Array<Record<string, unknown>>;
  metrics: Record<string, number>;
  honesty: string;
}

export interface CaseIndexEntry { case_id: string; category: string; manifest_path: string; }

export interface CaseIndex {
  schema: string; // "dispatchlab.index/v1"
  engine_version: string;
  n_cases: number;
  cases: CaseIndexEntry[];
}
