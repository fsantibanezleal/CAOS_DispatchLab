// Benchmark (#19): the offline aggregate comparisons. Everything here is precomputed by the
// pipeline (data-pipeline/pipeline/science/bench_synthetic.mjs + bench_real.mjs) and committed,
// the page only reads /data/bench/*.json. No heavy compute in the browser.
// Layout rule (#49): no giant scrolls, per-case and per-shift detail renders one selection at a
// time behind a chip picker, with a compact collapsible overview table for the whole set.
import { useEffect, useState } from 'react';
import { Refs, Tabs, useShellLang } from '@fasl-work/caos-app-shell';
import { POLICY_COLOR } from '../sim/compare';
import { BarChart, type BarDatum } from '../viz/BarChart';

interface BenchPolicy { id: string; en: string; es: string; medTonnes: number; medWaitH: number; loT: number; hiT: number; loW: number; hiW: number; pareto: boolean; pctOfOracle?: number }
interface SweepCheck { kneeN: number | null; mf1N: number | null; agree: boolean }
interface BenchCase { name: string; oracle?: { tonnes: number; bindingSide: string }; policies: BenchPolicy[]; tie: { leader: string; tied: string[] }; learnedVsBestClassical: { id: string; deltaPct: number }[]; sweepCheck: SweepCheck | null }
interface SyntheticDoc { nSeeds: number; nCases: number; aggregate: { id: string; meanRank: number }[]; learnedMeta: { policyImitAcc: number; bcBestImitAcc: number; bcBestSelfAcc: number; bestPolicy: string; nEval: number }; cases: Record<string, BenchCase> }
interface RealPolicy { id: string; en: string; es: string; cfTonnes: number; loT: number; hiT: number; deltaPct: number; agreePct: number | null }
interface RealSampleRow { id: string; name: string; ok: boolean; generator?: string; actualTonnes?: number; realDispatcher?: string; nDecisions?: number; calibrationBiasPct?: number | null; mostSimilarPolicy?: string | null; oracleTonnes?: number; actualPctOfOracle?: number; policies?: RealPolicy[] }
interface RealDoc { caveat: string; syntheticRanking: string[]; samples: RealSampleRow[]; cross: { id: string; generator: string; realRank: string[]; tauVsSynthetic: number | null }[] }
interface RollDet { base: number; rollout: number; deltaT: number; deltaPct: number; atLeastBase: boolean }
interface RollCase { name: string; role: 'target' | 'control'; oracle: number; bestHeur: string; policies: Record<string, { medTonnes: number; ci: number; pctOfOracle: number }>; rolloutVsBestHeur: { meanDelta: number; ci: number; outsideCI: boolean }; rolloutVsHungarian: { meanDelta: number; ci: number; outsideCI: boolean }; deterministic: RollDet; verdict: string }
interface RollDoc { method: string; base: string; nEval: number; winThreshold: number; winCount: number; win: boolean; honestVerdict: string; cases: Record<string, RollCase> }

const base = import.meta.env.BASE_URL || '/';
const label = (p: { id: string; en: string; es: string }, es: boolean) =>
  (es ? p.es : p.en).replace('Learned, ', '').replace('Aprendida, ', '').split(' (')[0];

export default function Benchmark() {
  const es = useShellLang() === 'es';
  const [syn, setSyn] = useState<SyntheticDoc | null>(null);
  const [real, setReal] = useState<RealDoc | null>(null);
  const [roll, setRoll] = useState<RollDoc | null>(null);
  useEffect(() => {
    fetch(`${base}data/bench/synthetic.json`).then((r) => r.json()).then(setSyn).catch(() => {});
    fetch(`${base}data/bench/real.json`).then((r) => r.json()).then(setReal).catch(() => {});
    fetch(`${base}data/bench/rollout.json`).then((r) => r.json()).then(setRoll).catch(() => {});
  }, []);

  if (!syn || !real) return <div className="page-body prose"><div className="page-head"><h1>Benchmark</h1><p className="dl-hint">{es ? 'Cargando artefactos precomputados…' : 'Loading precomputed artifacts…'}</p></div></div>;

  const tabs = [
    { id: 'corpus', label: es ? 'Corpus sintético' : 'Synthetic corpus', content: <CorpusTab syn={syn} es={es} /> },
    { id: 'learned', label: es ? 'Aprendido vs clásico' : 'Learned vs classical', content: <LearnedTab syn={syn} es={es} /> },
    { id: 'mf', label: 'Match factor', content: <MfTab syn={syn} es={es} /> },
    ...(roll ? [{ id: 'rollout', label: es ? 'Rollout (beyond-SOTA)' : 'Rollout (beyond-SOTA)', content: <RolloutTab roll={roll} es={es} /> }] : []),
    { id: 'cf', label: es ? 'Counterfactual real' : 'Real counterfactual', content: <CfTab real={real} es={es} /> },
    { id: 'cross', label: 'Cross-source', content: <CrossTab real={real} es={es} /> },
  ];

  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>Benchmark</h1>
        <p className="lede">{es
          ? `Comparaciones agregadas offline, ${syn.nCases} casos sintéticos × ${syn.aggregate.length} políticas (5 heurísticas + OR/Hungarian + 2 aprendidas + el rollout destilado) × ${syn.nSeeds} seeds, más el rollout Monte-Carlo beyond-SOTA (pestaña Rollout) y el counterfactual calibrado sobre los ${real.samples.filter((s) => s.ok).length} turnos reales, todo contra el oráculo de capacidad (cota superior sin colas). Cada corrida es bajo el modelo de tráfico en la ruta (límite de velocidad, seguimiento con bunching, cruce en doble vía), así el tiempo de ciclo emerge, no es de flujo libre. Todo precomputado por el pipeline y commiteado; esta página solo lee los artefactos. Números honestos, los resultados nulos y las discrepancias se muestran.`
          : `Offline aggregate comparisons, ${syn.nCases} synthetic cases × ${syn.aggregate.length} policies (5 heuristics + OR/Hungarian + 2 learned + the distilled rollout) × ${syn.nSeeds} seeds, plus the beyond-SOTA Monte-Carlo rollout (Rollout tab) and the calibrated counterfactual over the corpus of ${real.samples.filter((s) => s.ok).length} real shifts, all scored against the capacity oracle (queue-free upper bound). Every run is under the haul-road traffic model (speed limit, car-following bunching, two-way meeting), so cycle times are emergent, not free-flow. Everything precomputed by the pipeline and committed; this page only reads the artifacts. Honest numbers, null results and discrepancies are shown.`}</p>
      </div>
      <Tabs tabs={tabs} />
      <Refs ids={['noriega2024', 'peters2007', 'mnih2015']} label="Refs" />
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) { return <div className="tw-stat"><div className="tw-stat-v">{v}</div><div className="tw-stat-l">{l}</div></div>; }

function Bars({ rows, es }: { rows: { id: string; en: string; es: string; med: number; lo: number; hi: number; mark?: string }[]; max: number; es: boolean }) {
  return (
    <BarChart
      ariaLabel={es ? 'Toneladas medianas por política (agregado)' : 'Median tonnes per policy (aggregate)'}
      unit="t" defaultBaseline="fit" valueFmt={(v) => (v / 1000).toFixed(1) + 'k'}
      data={rows.map<BarDatum>((s) => ({ key: s.id, label: label(s, es), value: s.med, ci: [s.lo, s.hi], color: POLICY_COLOR[s.id] ?? '#8b949e', mark: s.mark?.trim() || undefined }))}
      note={es ? 'Barra = mediana; bigote = banda entre semillas. Modo Fit para ver las diferencias pequeñas; From 0 para la escala absoluta.' : 'Bar = median; whisker = seed band. Fit mode surfaces the small gaps; From 0 for absolute scale.'}
    />
  );
}

function CorpusTab({ syn, es }: { syn: SyntheticDoc; es: boolean }) {
  const caseIds = Object.keys(syn.cases);
  const [sel, setSel] = useState(caseIds[0]);
  const c = syn.cases[sel] ?? syn.cases[caseIds[0]];
  const maxT = Math.max(...c.policies.map((p) => p.hiT), c.oracle?.tonnes ?? 0);
  const ord = [...c.policies].sort((a, b) => b.medTonnes - a.medTonnes);
  const best = ord[0];
  return (
    <section>
      <h2>{es ? 'Ranking agregado (rango medio por toneladas medianas, 1 = mejor)' : 'Aggregate ranking (mean rank by median tonnes, 1 = best)'}</h2>
      <div className="tw-stats">{syn.aggregate.slice(0, 4).map((a) => <Stat key={a.id} v={a.meanRank.toFixed(2)} l={a.id} />)}</div>
      <p className="tw-note">{es
        ? 'greedy (menor tiempo de compleción esperado) lidera el corpus; las políticas aprendidas son competitivas pero no superan a sus maestras, y así se reporta.'
        : 'greedy (earliest expected completion) leads the corpus; the learned policies are competitive but do not beat their teachers, stated plainly.'}</p>

      <details className="dl-fold">
        <summary>{es ? `Panorama de los ${caseIds.length} casos (líder · % del oráculo · empates)` : `Overview of all ${caseIds.length} cases (leader · % of oracle · ties)`}</summary>
        <table><thead><tr><th>{es ? 'Caso' : 'Case'}</th><th>{es ? 'Líder' : 'Leader'}</th><th>% oracle</th><th>{es ? 'Empates' : 'Ties'}</th></tr></thead>
          <tbody>{caseIds.map((cid) => {
            const cc = syn.cases[cid];
            const bb = [...cc.policies].sort((a, b) => b.medTonnes - a.medTonnes)[0];
            return (
              <tr key={cid} onClick={() => setSel(cid)} style={{ cursor: 'pointer' }} title={es ? 'click para abrir el detalle' : 'click to open the detail'}>
                <td className="mono">{cid}</td><td>{bb.id}</td>
                <td className="mono">{bb.pctOfOracle != null ? `${bb.pctOfOracle.toFixed(0)}%` : ', '}</td>
                <td>{cc.tie.tied.length || ', '}</td>
              </tr>
            );
          })}</tbody></table>
      </details>

      <h2 style={{ marginTop: '0.9rem' }}>{es ? 'Detalle por caso' : 'Per-case detail'}</h2>
      <div className="dl-chips" role="tablist" aria-label={es ? 'caso' : 'case'}>
        {caseIds.map((cid) => (
          <button key={cid} role="tab" aria-selected={sel === cid} className={`chip ${sel === cid ? 'on' : ''}`}
                  title={syn.cases[cid].name} onClick={() => setSel(cid)}>{cid}</button>
        ))}
      </div>
      <h3 style={{ marginBottom: '0.2rem' }}>{sel}, {c.name}</h3>
      {c.oracle && (
        <p className="tw-note" style={{ marginTop: 0 }}>{es
          ? `oráculo de capacidad: ${(c.oracle.tonnes / 1000).toFixed(1)}k t (lado limitante: ${c.oracle.bindingSide === 'shovels' ? 'palas' : 'camiones'}) · mejor política: ${best.pctOfOracle?.toFixed(0)}% del oráculo`
          : `capacity oracle: ${(c.oracle.tonnes / 1000).toFixed(1)}k t (binding: ${c.oracle.bindingSide}) · best policy: ${best.pctOfOracle?.toFixed(0)}% of oracle`}</p>
      )}
      <Bars es={es} max={maxT} rows={ord.map((p) => ({ ...p, med: p.medTonnes, lo: p.loT, hi: p.hiT, mark: `${p.pareto ? ' ◆' : ''}${p.id === 'rwr' || p.id === 'bcbest' ? ' ★' : ''}${p.id === 'hungarian' ? ' ⬡' : ''}` }))} />
      <p className="tw-note">{es ? `Empate estadístico (bandas p10–p90 solapadas con el líder): ${c.tie.tied.length ? c.tie.tied.join(', ') : 'ninguno'} · ◆ = frontera de Pareto · ⬡ = tier OR (asignación conjunta Hungarian)` : `Statistical tie (p10–p90 bands overlap the leader): ${c.tie.tied.length ? c.tie.tied.join(', ') : 'none'} · ◆ = Pareto frontier · ⬡ = OR tier (Hungarian joint assignment)`}</p>
    </section>
  );
}

function LearnedTab({ syn, es }: { syn: SyntheticDoc; es: boolean }) {
  const m = syn.learnedMeta;
  const cases = Object.entries(syn.cases);
  return (
    <section>
      <h2>{es ? 'Fidelidad de imitación (held-out)' : 'Imitation fidelity (held-out)'}</h2>
      <div className="tw-stats">
        <Stat v={`${(m.policyImitAcc * 100).toFixed(0)}%`} l="RWR" />
        <Stat v={`${(m.bcBestImitAcc * 100).toFixed(0)}%`} l="BC-best" />
        <Stat v={`${(m.bcBestSelfAcc * 100).toFixed(0)}%`} l={`BC-best vs ${m.bestPolicy}`} />
        <Stat v={`${(m.nEval / 1000).toFixed(1)}k`} l={es ? 'decisiones eval' : 'eval decisions'} />
      </div>
      <h2>{es ? 'Toneladas vs la mejor clásica, caso a caso' : 'Tonnes vs the best classical, case by case'}</h2>
      <table><thead><tr><th>{es ? 'Caso' : 'Case'}</th><th>RWR Δ%</th><th>BC-best Δ%</th></tr></thead>
        <tbody>{cases.map(([cid, c]) => (
          <tr key={cid}><td>{cid}</td>
            {c.learnedVsBestClassical.map((l) => <td key={l.id} className="mono">{l.deltaPct > 0 ? '+' : ''}{l.deltaPct.toFixed(2)}%</td>)}
          </tr>))}</tbody></table>
      <p className="tw-note">{es
        ? 'Honesto: las aprendidas (★) quedan típicamente dentro de ~1–3% de la mejor heurística de cada caso, imitan a sus maestras, no las superan. El valor es una política única, rápida, recuperada de datos, con inferencia ONNX en vivo.'
        : 'Honest: the learned policies (★) land typically within ~1–3% of each case’s best heuristic, they imitate their teachers, they do not beat them. The value is a single fast policy recovered from data, with live ONNX inference.'}</p>
    </section>
  );
}

function MfTab({ syn, es }: { syn: SyntheticDoc; es: boolean }) {
  const rows = Object.entries(syn.cases).filter(([, c]) => c.sweepCheck);
  const agreeN = rows.filter(([, c]) => c.sweepCheck!.agree).length;
  return (
    <section>
      <h2>{es ? 'Validación del match factor a escala' : 'Match-factor validation at scale'}</h2>
      <p>{es
        ? 'Para cada caso multi-pala, el codo del barrido de flota (rendimiento marginal decreciente) debería caer donde el match factor analítico cruza 1. Comprobado sobre el banco de semillas del barrido:'
        : 'For every multi-shovel case, the fleet-sweep knee (diminishing marginal return) should land where the analytical match factor crosses 1. Checked over the sweep seed bank:'}</p>
      <table><thead><tr><th>{es ? 'Caso' : 'Case'}</th><th>{es ? 'Codo (N camiones)' : 'Knee (N trucks)'}</th><th>N @ MF=1</th><th>{es ? 'Concuerda (±2)' : 'Agrees (±2)'}</th></tr></thead>
        <tbody>{rows.map(([cid, c]) => (
          <tr key={cid}><td>{cid}</td><td className="mono">{c.sweepCheck!.kneeN ?? ', '}</td><td className="mono">{c.sweepCheck!.mf1N ?? ', '}</td><td>{c.sweepCheck!.agree ? '✓' : '✗'}</td></tr>
        ))}</tbody></table>
      <p className="tw-note">{es ? `${agreeN}/${rows.length} casos concuerdan, la teoría (MF) y el DES cuentan la misma historia; las excepciones se muestran, no se esconden.` : `${agreeN}/${rows.length} cases agree, the theory (MF) and the DES tell the same story; exceptions are shown, not hidden.`}</p>
    </section>
  );
}

function CfTab({ real, es }: { real: RealDoc; es: boolean }) {
  const ok = real.samples.filter((s) => s.ok && s.policies);
  const [sel, setSel] = useState(ok[0]?.id ?? '');
  const s = ok.find((x) => x.id === sel) ?? ok[0];
  if (!s) return <section><p className="tw-note">{es ? 'sin turnos' : 'no shifts'}</p></section>;
  const maxT = Math.max(...s.policies!.map((p) => p.hiT), s.actualTonnes!);
  const ord = [...s.policies!].sort((a, b) => b.cfTonnes - a.cfTonnes);
  return (
    <section>
      <h2>{es ? 'Counterfactual sobre el corpus real: ¿cuánto habría cambiado el throughput?' : 'Counterfactual over the real corpus: how much would throughput have changed?'}</h2>
      <p className="tw-note">{real.caveat}</p>

      <details className="dl-fold">
        <summary>{es ? `Panorama de los ${ok.length} turnos (real · mejor cf · sesgo)` : `Overview of all ${ok.length} shifts (actual · best cf · bias)`}</summary>
        <table><thead><tr><th>{es ? 'Turno' : 'Shift'}</th><th>{es ? 'real (kt)' : 'actual (kt)'}</th><th>{es ? 'mejor cf' : 'best cf'}</th><th>{es ? 'sesgo' : 'bias'}</th></tr></thead>
          <tbody>{ok.map((x) => {
            const bb = [...x.policies!].sort((a, b) => b.cfTonnes - a.cfTonnes)[0];
            return (
              <tr key={x.id} onClick={() => setSel(x.id)} style={{ cursor: 'pointer' }} title={es ? 'click para abrir el detalle' : 'click to open the detail'}>
                <td className="mono">{x.id}</td>
                <td className="mono">{(x.actualTonnes! / 1000).toFixed(1)}</td>
                <td>{bb.id}</td>
                <td className="mono">{x.calibrationBiasPct != null ? `${x.calibrationBiasPct > 0 ? '+' : ''}${x.calibrationBiasPct.toFixed(1)}%` : ', '}</td>
              </tr>
            );
          })}</tbody></table>
      </details>

      <h2 style={{ marginTop: '0.9rem' }}>{es ? 'Detalle por turno' : 'Per-shift detail'}</h2>
      <div className="dl-chips" role="tablist" aria-label={es ? 'turno' : 'shift'}>
        {ok.map((x) => (
          <button key={x.id} role="tab" aria-selected={sel === x.id} className={`chip ${sel === x.id ? 'on' : ''}`}
                  title={x.name} onClick={() => setSel(x.id)}>{x.id}</button>
        ))}
      </div>
      <h3 style={{ marginBottom: '0.2rem' }}>{s.id}</h3>
      <p className="tw-note" style={{ marginTop: 0 }}>{es
        ? `real: ${(s.actualTonnes! / 1000).toFixed(1)}k t (${s.realDispatcher}${s.actualPctOfOracle != null ? `, ${s.actualPctOfOracle.toFixed(0)}% del oráculo empírico` : ''}) · ${s.nDecisions} decisiones · sesgo de calibración ${s.calibrationBiasPct != null ? `${s.calibrationBiasPct > 0 ? '+' : ''}${s.calibrationBiasPct.toFixed(1)}% (vía ${s.mostSimilarPolicy})` : 'n/d'}`
        : `actual: ${(s.actualTonnes! / 1000).toFixed(1)}k t (${s.realDispatcher}${s.actualPctOfOracle != null ? `, ${s.actualPctOfOracle.toFixed(0)}% of the empirical oracle` : ''}) · ${s.nDecisions} decisions · calibration bias ${s.calibrationBiasPct != null ? `${s.calibrationBiasPct > 0 ? '+' : ''}${s.calibrationBiasPct.toFixed(1)}% (via ${s.mostSimilarPolicy})` : 'n/a'}`}</p>
      <Bars es={es} max={maxT} rows={ord.map((p) => ({ ...p, med: p.cfTonnes, lo: p.loT, hi: p.hiT, mark: p.agreePct != null ? ` · ${p.agreePct.toFixed(0)}%↔` : '' }))} />
      <p className="tw-note">{es
        ? '↔ = acuerdo de decisiones con el despachador real. Comparar políticas entre sí (cf-vs-cf); el delta vs real carga el sesgo de calibración mostrado arriba.'
        : '↔ = decision agreement with the real dispatcher. Compare policies against each other (cf-vs-cf); the delta vs actual carries the calibration bias shown above.'}</p>
    </section>
  );
}

function RolloutTab({ roll, es }: { roll: RollDoc; es: boolean }) {
  const ids = Object.keys(roll.cases);
  const verdictLabel = (v: string): string => {
    const map: Record<string, [string, string]> = {
      'control-tie-ok': ['tie (control) OK', 'empate (control) OK'],
      'control-tie-VIOLATED': ['control violated', 'control violado'],
      'rollout-win': ['rollout win', 'gana rollout'],
      'rollout-ahead': ['rollout ahead', 'rollout adelante'],
      'tie-within-CI': ['tie (within CI)', 'empate (dentro del IC)'],
      'myopic-ahead': ['myopic ahead', 'miope adelante'],
    };
    return (map[v] ?? [v, v])[es ? 1 : 0];
  };
  return (
    <section>
      <h2>{es ? 'El dispatcher beyond-SOTA: rollout Monte-Carlo de horizonte deslizante' : 'The beyond-SOTA dispatcher: receding-horizon Monte-Carlo rollout'}</h2>
      <div className={`dl-verdict ${roll.win ? 'ok' : 'null'}`} style={{ padding: '0.6rem 0.8rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', margin: '0.5rem 0' }}>
        <strong>{roll.win ? (es ? `Victoria en ${roll.winCount} casos objetivo` : `Win on ${roll.winCount} target cases`) : (es ? 'Resultado nulo (honesto)' : 'Null result (honest)')}</strong>
        <p className="tw-note" style={{ marginBottom: 0 }}>{es
          ? `Un rollout es un paso de mejora de política (Bertsekas, Tsitsiklis y Wu 1997): sobre el modelo determinista es demostrablemente >= su base. Regla de victoria: superar a la mejor heurística y a Hungarian fuera del IC en >= ${roll.winThreshold} casos objetivo (${roll.winCount}/${roll.winThreshold}). Base: ${roll.base}. Eval: ${roll.nEval} seeds held-out (disjuntos del entrenamiento).`
          : `A rollout is one policy-improvement step (Bertsekas, Tsitsiklis & Wu 1997): on the deterministic model it is provably >= its base. Win rule: beat the best heuristic and Hungarian outside the CI on >= ${roll.winThreshold} target cases (${roll.winCount}/${roll.winThreshold}). Base: ${roll.base}. Eval: ${roll.nEval} held-out seeds (disjoint from training).`}</p>
      </div>

      <h3>{es ? 'Cota de mejora determinista (garantía exacta)' : 'Deterministic improvement bound (exact guarantee)'}</h3>
      <table><thead><tr><th>{es ? 'Caso' : 'Case'}</th><th>base (kt)</th><th>rollout (kt)</th><th>Δ%</th><th>{es ? '>= base' : '>= base'}</th></tr></thead>
        <tbody>{ids.map((id) => { const d = roll.cases[id].deterministic; return (
          <tr key={id}><td className="mono">{id}</td><td className="mono">{(d.base / 1000).toFixed(1)}</td><td className="mono">{(d.rollout / 1000).toFixed(1)}</td>
            <td className="mono">{d.deltaPct > 0 ? '+' : ''}{d.deltaPct.toFixed(2)}%</td><td>{d.atLeastBase ? '✓' : '✗'}</td></tr>
        ); })}</tbody></table>
      <p className="tw-note">{es
        ? 'El rollout nunca es peor que su base (garantía de mejora). La ganancia estricta se demuestra en el control positivo asimétrico (fixture): la mirada de horizonte evita comprometer camiones a la pala lejana que hambrea a la cercana. El rajo simétrico y el oráculo 1×1 (fixtures) empatan exactamente (una victoria ahí sería una fuga).'
        : 'The rollout is never worse than its base (improvement guarantee). The strict gain is demonstrated on the asymmetric positive-control fixture: the horizon view avoids committing trucks to the far shovel that starves the near one. The symmetric pit and the 1x1 oracle (fixtures) tie exactly (a win there would be a leak).'}</p>

      <h3>{es ? 'Bajo incertidumbre de tiempos de ciclo (IC Monte-Carlo)' : 'Under cycle-time uncertainty (Monte-Carlo CIs)'}</h3>
      <table><thead><tr><th>{es ? 'Caso' : 'Case'}</th><th>{es ? 'rol' : 'role'}</th><th>{es ? 'mejor heur.' : 'best heur.'}</th><th>rollout Δ vs best</th><th>rollout Δ vs Hung.</th><th>{es ? 'veredicto' : 'verdict'}</th></tr></thead>
        <tbody>{ids.map((id) => { const c = roll.cases[id]; const fmt = (x: { meanDelta: number; ci: number }) => `${x.meanDelta > 0 ? '+' : ''}${x.meanDelta.toFixed(0)} ±${x.ci.toFixed(0)}`; return (
          <tr key={id}><td className="mono">{id}</td><td>{c.role === 'control' ? (es ? 'control' : 'control') : (es ? 'objetivo' : 'target')}</td>
            <td>{c.bestHeur}</td><td className="mono">{fmt(c.rolloutVsBestHeur)}</td><td className="mono">{fmt(c.rolloutVsHungarian)}</td>
            <td>{verdictLabel(c.verdict)}</td></tr>
        ); })}</tbody></table>
      <p className="tw-note">{es
        ? roll.honestVerdict
        : roll.honestVerdict}</p>
      <p className="tw-note">{es
        ? 'La política en vivo es una destilación del rollout (dl-rollout.onnx), se ejecuta con onnxruntime-web como las redes RWR/BC; sus números verdaderos offline son estos. El «Rollout inspector» de la App muestra los K futuros por candidato en una decisión.'
        : 'The live policy is a distillation of the rollout (dl-rollout.onnx), run via onnxruntime-web like the RWR/BC nets; its true offline numbers are these. The App\'s "Rollout inspector" shows the K futures per candidate at one decision.'}</p>
      <Refs ids={['bertsekas1997', 'bertsekas1999', 'seiler2022', 'mininggym2025', 'meng2025']} label="Refs" />
    </section>
  );
}

function CrossTab({ real, es }: { real: RealDoc; es: boolean }) {
  const taus = real.cross.map((c) => c.tauVsSynthetic).filter((t): t is number => t != null).sort((a, b) => a - b);
  const medTau = taus.length ? taus[Math.floor(taus.length / 2)] : null;
  const low = real.cross.filter((c) => (c.tauVsSynthetic ?? 1) < 0.4);
  return (
    <section>
      <h2>{es ? '¿El ranking sintético sobrevive en los turnos reales?' : 'Does the synthetic ranking survive on real shifts?'}</h2>
      <p>{es
        ? `Concordancia de rankings (tau de Kendall) entre el agregado sintético [${real.syntheticRanking.slice(0, 3).join(' > ')} > …] y el ranking counterfactual de cada turno real:`
        : `Ranking concordance (Kendall’s tau) between the synthetic aggregate [${real.syntheticRanking.slice(0, 3).join(' > ')} > …] and each real shift’s counterfactual ranking:`}</p>
      <table><thead><tr><th>{es ? 'Turno real' : 'Real shift'}</th><th>{es ? 'Generador' : 'Generator'}</th><th>Top-3 (cf)</th><th>τ</th></tr></thead>
        <tbody>{real.cross.map((c) => (
          <tr key={c.id}><td>{c.id}</td><td>{c.generator}</td><td className="mono">{c.realRank.slice(0, 3).join(' > ')}</td><td className="mono">{c.tauVsSynthetic?.toFixed(2) ?? ', '}</td></tr>
        ))}</tbody></table>
      <p className="tw-note">{es
        ? `Mediana τ = ${medTau?.toFixed(2)}, el orden sintético transfiere en general. Discrepancias honestas: ${low.length ? low.map((c) => `${c.id} (τ=${c.tauVsSynthetic?.toFixed(2)})`).join(', ') : 'ninguna'}, turnos generados con despachadores tipo nearest reordenan las políticas queue-aware; hallazgo válido, no se esconde. El tier OR (hungarian) se excluye del τ: dentro del counterfactual ejecuta su fallback solo (sin vista de flota), así que compararlo entre fuentes sería comparar dos algoritmos distintos.`
        : `Median τ = ${medTau?.toFixed(2)}, the synthetic ordering largely transfers. Honest discrepancies: ${low.length ? low.map((c) => `${c.id} (τ=${c.tauVsSynthetic?.toFixed(2)})`).join(', ') : 'none'}, shifts generated by nearest-style dispatchers reorder the queue-aware policies; a valid finding, not hidden. The OR tier (hungarian) is excluded from τ: inside the counterfactual it runs its solo fallback (no fleet view), so ranking it across sources would compare two different algorithms.`}</p>
    </section>
  );
}
