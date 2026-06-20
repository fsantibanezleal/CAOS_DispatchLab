import { useEffect, useMemo, useState } from 'react';
import { Refs, useShellLang } from '@fasl-work/caos-app-shell';
import { comparePolicies, POLICY_COLOR } from '../sim/compare';
import { POLICIES, type PolicyDef } from '../policies/heuristics';
import { loadLearnedPolicies, loadLearnedMeta, type LearnedMeta } from '../policies/learnedRegistry';
import { caseById } from '../sim/cases';

const SEEDS = [3, 7, 11, 17, 23, 29, 37, 42, 59, 71];

export default function Benchmark() {
  const es = useShellLang() === 'es';
  const [learned, setLearned] = useState<PolicyDef[]>([]);
  const [meta, setMeta] = useState<LearnedMeta | null>(null);
  useEffect(() => { loadLearnedPolicies().then(setLearned).catch(() => {}); loadLearnedMeta().then(setMeta).catch(() => {}); }, []);
  const all = useMemo(() => [...POLICIES, ...learned], [learned]);
  const tn = (id: string) => { const p = all.find((x) => x.id === id); return p ? (es ? p.es : p.en).replace('Learned — ', '').replace('Aprendida — ', '').split(' (')[0] : id; };

  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>Benchmark</h1>
        <p className="lede">{es ? 'Políticas APRENDIDAS vs heurísticas CLÁSICAS — fidelidad de imitación held-out y, sobre todo, las TONELADAS que cada una mueve en el simulador (la prueba real). Números reales — sin victorias fabricadas.' : 'LEARNED vs CLASSICAL heuristic policies — held-out imitation fidelity and, above all, the TONNES each moves in the simulator (the real test). Real numbers — no fabricated wins.'}</p>
      </div>
      <section>
        {meta && (
          <>
            <h2>{es ? 'Fidelidad de imitación (held-out)' : 'Imitation fidelity (held-out)'}</h2>
            <div className="tw-stats">
              <Stat v={`${(meta.policyImitAcc * 100).toFixed(0)}%`} l={es ? 'RWP (todas las refs)' : 'RWR (all refs)'} />
              <Stat v={`${(meta.bcBestImitAcc * 100).toFixed(0)}%`} l={es ? 'BC-best (todas)' : 'BC-best (all)'} />
              <Stat v={`${(meta.bcBestSelfAcc * 100).toFixed(0)}%`} l={es ? `BC-best vs ${meta.bestPolicy}` : `BC-best vs ${meta.bestPolicy}`} />
              <Stat v={`${(meta.nEval / 1000).toFixed(1)}k`} l={es ? 'decisiones eval' : 'eval decisions'} />
            </div>
            <p className="tw-note">{es ? `Las redes reproducen las decisiones de referencia no vistas con ~${(meta.policyImitAcc * 100).toFixed(0)}% de fidelidad. Pero la fidelidad NO es el objetivo — lo que importa son las toneladas, abajo.` : `The nets reproduce unseen reference decisions with ~${(meta.policyImitAcc * 100).toFixed(0)}% fidelity. But fidelity is NOT the goal — what matters is the tonnes, below.`}</p>
          </>
        )}

        <h2>{es ? 'Toneladas movidas — aprendido vs heurística (la prueba real)' : 'Tonnes moved — learned vs heuristic (the real test)'}</h2>
        {learned.length === 0 ? <p className="dl-hint">{es ? 'Cargando políticas aprendidas…' : 'Loading learned policies…'}</p> : (
          <>
            {(['C06', 'C07', 'C05'] as const).map((cid) => <CaseBars key={cid} cid={cid} all={all} tn={tn} es={es} />)}
            <p className="tw-note">{es ? 'Honesto: las políticas APRENDIDAS (★) son COMPETITIVAS — dentro de ~1%, igualando a las mejores heurísticas (sus maestras). No las superan, y se dice claramente. El valor es una política aprendida única, rápida, recuperada de datos + la inferencia ONNX en vivo — no una afirmación de que «el RL gana todo».' : 'Honest: the LEARNED policies (★) are COMPETITIVE — within ~1%, matching the best heuristics (their teachers). They do not beat them, and we say so plainly. The value is a single fast learned policy recovered from data + live ONNX inference — not a claim that "RL beats everything".'}</p>
          </>
        )}
        <Refs ids={['noriega2024', 'peters2007', 'mnih2015']} label="Refs" />
      </section>
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) { return <div className="tw-stat"><div className="tw-stat-v">{v}</div><div className="tw-stat-l">{l}</div></div>; }

function CaseBars({ cid, all, tn, es }: { cid: string; all: PolicyDef[]; tn: (id: string) => string; es: boolean }) {
  const c = caseById(cid);
  const stats = useMemo(() => comparePolicies(c, SEEDS, all), [c, all]);
  const maxT = Math.max(...stats.map((s) => s.hiT));
  const ord = [...stats].sort((a, b) => b.medTonnes - a.medTonnes);
  return (
    <>
      <h3 style={{ marginBottom: '0.2rem' }}>{cid} — {c.name} ({c.mine.shovels.length} {es ? 'palas' : 'shovels'})</h3>
      <div className="dl-bars">{ord.map((s) => { const learned = s.id === 'rwr' || s.id === 'bcbest'; return (
        <div key={s.id} className="dl-bar-row"><div className="dl-bar-label"><span className="dl-dot" style={{ background: POLICY_COLOR[s.id] }} /> {tn(s.id)}{learned ? ' ★' : ''}</div>
          <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${(s.medTonnes / maxT) * 100}%`, background: POLICY_COLOR[s.id] }} /><span className="dl-bar-band" style={{ left: `${(s.loT / maxT) * 100}%`, width: `${((s.hiT - s.loT) / maxT) * 100}%` }} /></div><span className="dl-bar-num mono">{(s.medTonnes / 1000).toFixed(1)}k t</span></div>
        </div>); })}</div>
    </>
  );
}
