import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type uPlot from 'uplot';
import { Link } from 'react-router-dom';
import { useShellLang } from '@fasl-work/caos-app-shell';
import { runSimulation } from '../sim/model';
import { analyticalMatchFactor, shovelCycle } from '../sim/matchfactor';
import { comparePolicies, paretoFront, tieVerdict, POLICY_COLOR } from '../sim/compare';
import { fleetSweep, kneeIndex, nAtMf1 } from '../sim/sweep';
import { CASES, caseById } from '../sim/cases';
import { POLICIES, policyById, shortestWait, type PolicyDef } from '../policies/heuristics';
import { loadLearnedPolicies } from '../policies/learnedRegistry';
import { shovelFeats } from '../policies/learned';
import { rolloutInspect, DEFAULT_ROLLOUT, type InspectResult } from '../policies/rollout';
import { onnxScore } from '../lib/ort';
import { PitMap } from '../viz/PitMap';
import { Pit3D } from '../viz/Pit3D';
import { Underground3D } from '../viz/Underground3D';
import { listSamples, loadSample, loadUserFile, type SampleMeta } from '../replay/samples';
import { replayCycleLog } from '../replay/replayEngine';
import { agreement, reconstructDecisions } from '../replay/counterfactual';
import { type IngestReport } from '../replay/ingest';
import { type CaseSpec } from '../sim/types';
import { ParetoScatter } from '../viz/ParetoScatter';
import { SweepChart } from '../viz/SweepChart';
import { UPlotChart } from '../viz/UPlotChart';
import { lineOpts } from '../viz/uplotKit';
import { BarChart, type BarDatum } from '../viz/BarChart';
import { PanelBoundary } from '../viz/PanelBoundary';

const SPEEDS = [50, 200, 600, 1800]; // 50x = slow lane for close visual review
const SWEEP_SEEDS = [3, 11, 19, 29, 41];
const CMP_SEEDS = [3, 7, 11, 17, 23, 29, 37, 42, 59, 71];
// #22: the demo operational-constraint set (applies to any synthetic case; the DES enforces it
// for every policy, the feasible set is filtered before the policy sees the state)
// The demo set is a binding, policy-discriminating stress test, not a soft cap everyone satisfies by
// construction. Queue is tightened to 2 (forces rerouting) and a crusher throughput ceiling is added,
// computed per case at 75% of that case's own unconstrained ore rate so it always bites (ore shovels
// pause when the trailing feed hits the cap, so the dispatcher must balance ore against waste, a
// look-ahead policy manages the commitment better than a myopic one). See demoCrusherTph below.
const DEMO_CONSTRAINTS = { maxQueuePerShovel: 2, breaks: [{ startSec: 4 * 3600, endSec: 4.5 * 3600 }], crusherFrac: 0.75 } as const;
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

interface Decision { feats: number[][]; ids: number[]; names: string[]; chosen: number; t: number }


/** Twelve sibling tabs is a list, not an architecture: the user must read every label to find one
 *  view, and measured on the deployed app they occupied TWO rows, permanently taking vertical space
 *  from the instrument on every render. Grouped by the question being asked; the sub-views are
 *  revealed from the same tab (ADR-0071 rules 4 and 5). */
const TAB_GROUPS: { id: string; en: string; es: string; members: string[] }[] = [
  { id: 'operation',  en: 'Operation',   es: 'Operacion',   members: ['pit3d', 'map', 'queue', 'cycle'] },
  { id: 'throughput', en: 'Throughput',  es: 'Rendimiento', members: ['shovel', 'feed'] },
  { id: 'policies',   en: 'Policies',    es: 'Politicas',   members: ['compare', 'bench', 'share'] },
  { id: 'decisions',  en: 'Decisions',   es: 'Decisiones',  members: ['inspect', 'rollout', 'counterfactual'] },
  { id: 'validation', en: 'Validation',  es: 'Validacion',  members: ['valid'] },
];

export default function Tool() {
  const lang = useShellLang(); const es = lang === 'es';
  const [caseId, setCaseId] = useState('C08');   // default = the showcase boss (all node types + dynamics)
  const [policyId, setPolicyId] = useState('greedy');
  const [activeTab, setActiveTab] = useState('pit3d');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seed, setSeed] = useState(7);
  const [playing, setPlaying] = useState(false); // default paused (no-autoplay rule: an unattended page must not burn CPU)
  const [speed, setSpeed] = useState(600);
  const [playT, setPlayT] = useState(0);
  const [learned, setLearned] = useState<PolicyDef[]>([]);
  useEffect(() => { loadLearnedPolicies().then(setLearned).catch(() => {}); }, []);
  const allPolicies = useMemo(() => [...POLICIES, ...learned], [learned]);

  // ---- source selector (#14): Synthetic scenario | Real cycle-log sample ----
  const [source, setSource] = useState<'synthetic' | 'real'>('synthetic');
  const [samples, setSamples] = useState<SampleMeta[]>([]);
  const [sampleId, setSampleId] = useState('');
  const [realReport, setRealReport] = useState<IngestReport | null>(null);
  const [realErr, setRealErr] = useState('');
  useEffect(() => { listSamples().then((s) => { setSamples(s); if (s.length && !sampleId) setSampleId(s[0].id); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (source !== 'real' || !sampleId) return;
    const meta = samples.find((s) => s.id === sampleId); if (!meta) return;
    setRealErr('');
    loadSample(meta).then((r) => { setRealReport(r); setPlayT(0); if (!r.ok) setRealErr(r.rejected.map((x) => x.reason).join('; ')); })
      .catch((e: unknown) => { setRealReport(null); setRealErr(String(e)); });
  }, [source, sampleId, samples]);
  const onUserFile = (f: File) => {
    setRealErr('');
    loadUserFile(f).then((r) => { setRealReport(r); setPlayT(0); setSampleId(''); if (!r.ok) setRealErr(r.rejected.slice(0, 3).map((x) => x.reason).join('; ')); })
      .catch((e: unknown) => setRealErr(String(e)));
  };
  const realOK = source === 'real' && !!realReport?.ok;
  // sample families (#47): the flat mhs-*/openmines-* list was unreadable, group behind mini-tabs
  const famOf = (id: string) => (id.startsWith('mhs-ug') ? 'ug' : id.startsWith('mhs-pit') ? 'pit' : 'legacy');
  const FAMS = [
    { key: 'pit', en: 'open-pit', es: 'rajo' },
    { key: 'ug', en: 'underground', es: 'subterránea' },
    { key: 'legacy', en: 'openmines', es: 'openmines' },
  ] as const;
  const [famTab, setFamTab] = useState<'pit' | 'ug' | 'legacy'>('pit');
  useEffect(() => { if (sampleId) setFamTab(famOf(sampleId)); }, [sampleId]);
  const sampleLabel = (id: string) => {
    const t = id.replace('huolinhe-northpit-', '').replace(/^mhs-(pit|ug)-/, '');
    const k = t.lastIndexOf('-');
    return k > 0 ? `${t.slice(0, k)} · ${t.slice(k + 1)}` : t;
  };
  const realRun = useMemo(() => (realReport?.ok && realReport.sample ? replayCycleLog(realReport.sample) : null), [realReport]);
  // counterfactual (#18): reconstruct every real decision point + score policy agreement (heuristics + learned)
  const cfDecisions = useMemo(() => (realReport?.ok && realReport.sample ? reconstructDecisions(realReport.sample) : []), [realReport]);
  const cfAgree = useMemo(() => (cfDecisions.length ? agreement(cfDecisions, allPolicies, es) : []), [cfDecisions, allPolicies, es]);

  const [consOn, setConsOn] = useState(false);
  // reference ore throughput of the unconstrained case (greedy), used to size a crusher ceiling that binds.
  const demoCrusherTph = useMemo(() => {
    const base = caseById(caseId);
    const run = runSimulation(base, policyById('greedy').fn, seed, { trace: false });
    const feed = run.crusherFeed;
    const totalOre = feed.length ? feed[feed.length - 1].tonnes : 0;
    const hours = base.shiftSec / 3600;
    const oreTph = hours > 0 ? totalOre / hours : 0;
    if (!(oreTph > 0)) return undefined;
    const cap = Math.round((oreTph * DEMO_CONSTRAINTS.crusherFrac) / 10) * 10;   // round to 10 t/h
    // never loosen a case's own (tighter) baked ceiling
    return Math.min(cap, base.constraints?.crusherMaxTph ?? Infinity);
  }, [caseId, seed]);
  const c = useMemo<CaseSpec>(() => {
    const base = caseById(caseId);
    if (!consOn) return base;
    // the demo set merges over any baked case constraints (never overwrites a case's own break/blend);
    // the crusher ceiling is the discriminating constraint, tightened to bite on this case.
    return { ...base, constraints: {
      ...base.constraints,
      maxQueuePerShovel: DEMO_CONSTRAINTS.maxQueuePerShovel,
      breaks: [...DEMO_CONSTRAINTS.breaks],
      ...(demoCrusherTph != null && Number.isFinite(demoCrusherTph) ? { crusherMaxTph: demoCrusherTph } : {}),
    } };
  }, [caseId, consOn, demoCrusherTph]);
  const pol = useMemo(() => allPolicies.find((p) => p.id === policyId) ?? policyById(policyId), [allPolicies, policyId]);
  const decisions = useRef<Decision[]>([]);
  const synResult = useMemo(() => {
    decisions.current = [];
    let k = 0;
    return runSimulation(c, pol.fn, seed, {
      trace: true,
      onDecision: (state, chosen) => {
        if (k++ % 7 === 0) decisions.current.push({
          feats: state.shovels.map((v) => shovelFeats(v, state.travelEmptySec(v.id))),
          ids: state.shovels.map((v) => v.id), names: state.shovels.map((v) => v.spec.name.split('(')[0].trim()),
          chosen: state.shovels.findIndex((v) => v.id === chosen), t: state.now,
        });
      },
    });
  }, [c, pol, seed]);
  const mfSyn = useMemo(() => analyticalMatchFactor(c), [c]);

  // ---- the unified run every tab reads: branched once on source ----
  const activeC: CaseSpec = useMemo(() => {
    if (!realOK || !realReport?.sample) return c;
    const s = realReport.sample;
    return {
      id: s.id, name: s.name, mine: s.mine,
      fleet: { trucks: s.trucks.map((id) => ({ id, spec: { model: 'measured', payloadT: s.empirical.payloadMeanT, tareT: 0, powerKW: 0, maxSpeedKmh: 0 }, startShovel: s.shovels[0] })) },
      shiftSec: s.shiftSec,
    };
  }, [realOK, realReport, c]);
  const result = realOK && realRun ? realRun.result : synResult;
  const mf = realOK && realReport?.sample ? realReport.sample.empirical.matchFactor : mfSyn;
  const shiftSec = activeC.shiftSec;

  // playback clock
  const raf = useRef(0); const last = useRef(0); const ptRef = useRef(0);
  useEffect(() => { ptRef.current = playT; }, [playT]);
  useEffect(() => {
    if (!playing) return; last.current = 0;
    const tick = (ts: number) => {
      if (!last.current) last.current = ts;
      const dt = (ts - last.current) / 1000; last.current = ts;
      let nt = ptRef.current + dt * speed; if (nt >= shiftSec) nt = 0;
      ptRef.current = nt; setPlayT(nt); raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    // halt on a hidden tab (compute-bomb rule); resume the clock cleanly on return
    const onVis = () => {
      cancelAnimationFrame(raf.current);
      if (!document.hidden) { last.current = 0; raf.current = requestAnimationFrame(tick); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf.current); document.removeEventListener('visibilitychange', onVis); };
  }, [playing, speed, shiftSec]);

  // KPIs + diagnosis
  const tonnes = result.tonnes, truckWaitH = result.truckWaitSec / 3600, meanUtil = result.meanShovelUtil;
  const nTrucks = c.fleet.trucks.length, delta = Math.round((mf > 0 ? nTrucks / mf : nTrucks) - nTrucks);
  const balance = mf > 1.1 ? 'over' : mf < 0.9 ? 'under' : 'bal';
  const bottleneck = meanUtil > 0.95 ? 'shovelBound' : truckWaitH > nTrucks * 0.15 ? 'queueBound' : 'headroom';
  const MAXMF = 2.6;

  // comparison (incl learned) + sweep
  const cmp = useMemo(() => comparePolicies(c, CMP_SEEDS, allPolicies), [c, allPolicies]);
  const front = useMemo(() => paretoFront(cmp), [cmp]);
  const tie = useMemo(() => tieVerdict(cmp), [cmp]);
  const sweep = useMemo(() => fleetSweep(c.mine.shovels.length >= 2 ? c : caseById('C04'), policyById('greedy').fn, c.mine.shovels.length >= 3 ? 24 : 14, SWEEP_SEEDS), [c]);
  const knee = useMemo(() => kneeIndex(sweep), [sweep]); const nMf1 = useMemo(() => nAtMf1(sweep), [sweep]);

  const feed = useMemo<uPlot.AlignedData>(() => [result.crusherFeed.map((p) => p.t / 3600), result.crusherFeed.map((p) => p.tonnes)], [result]);
  const buildFeed = useCallback((w: number, h: number) => { const o = lineOpts(w, h, { label: 't', color: '#d29922', xUnit: 'h', yUnit: 't', xPrec: 1, yPrec: 0 }); o.axes![1].values = (_u, v) => v.map((x) => (x >= 1000 ? (x / 1000).toFixed(0) + 'k' : String(x))); o.axes![1].size = 38; return o; }, []);

  const tn = (id: string) => { const p = allPolicies.find((x) => x.id === id)!; return (es ? p.es : p.en).split(' (')[0]; };

  const tabs = [
    { id: 'pit3d', label: es ? (activeC.mine.minetopo ? 'Mina 3D' : 'Rajo 3D') : (activeC.mine.minetopo ? 'Mine 3D' : 'Pit 3D'), content: (
      <Panel t={activeC.mine.minetopo
        ? (es ? 'Mina subterránea, rampa, niveles, piques y flota en 3D (color = estado del camión)' : 'Underground mine, decline, levels, ore passes and the fleet in 3D (colour = truck state)')
        : (es ? 'Topografía del rajo, bancos, rampa espiral y flota en 3D (color = estado del camión); política actual' : 'Pit topography, benches, spiral ramp and the fleet in 3D (colour = truck state); current policy')}>
        {activeC.mine.minetopo
          ? <Underground3D c={activeC} result={result} t={playT} lang={lang} />
          : <Pit3D c={activeC} result={result} t={playT} lang={lang} playing={playing} />}
        <div className="dl-play" style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="chip on" onClick={() => setPlaying((p) => !p)}>{playing ? `❚❚ ${es ? 'Pausa' : 'Pause'}` : `▶ ${es ? 'Reproducir' : 'Play'}`}</button>
          <select className="dl-sel" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="speed">{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}</select>
        </div>
        <input className="range dl-scrub" type="range" min={0} max={shiftSec} step={60} value={playT} onChange={(e) => { setPlayT(+e.target.value); ptRef.current = +e.target.value; }} style={{ marginTop: '0.4rem' }} />
        <div className="dl-kpis" style={{ marginTop: '0.5rem' }}>
          <KPI v={fmt(tonnes)} l={es ? 'Toneladas (t)' : 'Tonnes (t)'} /><KPI v={mf.toFixed(2)} l="Match factor" /><KPI v={`${(meanUtil * 100).toFixed(0)}%`} l={es ? 'Util. pala' : 'Shovel util'} /><KPI v={truckWaitH.toFixed(1)} l={es ? 'Espera (h)' : 'Wait (h)'} />
        </div>
      </Panel>) },
    { id: 'map', label: es ? 'Mapa del rajo' : 'Pit map', content: (
      <Panel t={es ? 'Mapa animado, camiones, palas y chancador (color = cola); política actual' : 'Animated pit, trucks, shovels and crusher (colour = queue); current policy'}>
        <PitMap c={activeC} result={result} t={playT} lang={lang} />
        {/* playback controls live with the animation (they drive only this tab), not in the global sidebar */}
        <div className="dl-play" style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="chip on" onClick={() => setPlaying((p) => !p)}>{playing ? `❚❚ ${es ? 'Pausa' : 'Pause'}` : `▶ ${es ? 'Reproducir' : 'Play'}`}</button>
          <select className="dl-sel" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="speed">{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}</select>
        </div>
        <input className="range dl-scrub" type="range" min={0} max={shiftSec} step={60} value={playT} onChange={(e) => { setPlayT(+e.target.value); ptRef.current = +e.target.value; }} style={{ marginTop: '0.4rem' }} />
        <div className="dl-kpis" style={{ marginTop: '0.5rem' }}>
          <KPI v={fmt(tonnes)} l={es ? 'Toneladas (t)' : 'Tonnes (t)'} /><KPI v={mf.toFixed(2)} l="Match factor" /><KPI v={`${(meanUtil * 100).toFixed(0)}%`} l={es ? 'Util. pala' : 'Shovel util'} /><KPI v={truckWaitH.toFixed(1)} l={es ? 'Espera (h)' : 'Wait (h)'} />
        </div>
      </Panel>) },
    { id: 'shovel', label: es ? 'Por pala' : 'Per-shovel', content: (
      <Panel t={es ? 'Cargas y utilización por pala' : 'Per-shovel loads & utilisation'}>
        {(() => {
          // #50: when the sample carries oreblocks geology, show each shovel's face grade + bench +
          // ore fraction (from the exact ultimate pit), joined by shovel node id.
          const faces = realOK ? realReport?.sample?.provenance.geology?.faces : undefined;
          const faceOf = faces ? Object.fromEntries(faces.map((f) => [f.shovelId, f])) : null;
          return (<>
            <BarChart fill
              ariaLabel={es ? 'Utilización por pala' : 'Per-shovel utilization'}
              unit="%" defaultBaseline="zero" valueFmt={(v) => v.toFixed(0)}
              data={result.shovels.map<BarDatum>((s) => { const f = faceOf?.[s.id]; return {
                key: String(s.id),
                label: s.name.split('(')[0].trim() + (f ? ` · ${es ? 'banco' : 'bench'} ${f.bench} · ${(f.grade * 100).toFixed(2)}%` : ''),
                value: s.util * 100, sub: `${s.served}`, color: 'var(--color-accent)',
              }; })}
              note={faceOf
                ? (es ? 'Barra = utilización · nº = camiones servidos. Etiqueta = geología del banco (banco · ley) del pit exacto (oreblocks).' : 'Bar = utilization · number = trucks served. Label = bench geology (bench · grade) from the exact pit (oreblocks).')
                : (es ? 'Barra = utilización de la pala · número = camiones servidos en la corrida.' : 'Bar = shovel utilization · number = trucks served this run.')}
            />
          </>);
        })()}
      </Panel>) },
    { id: 'feed', label: es ? 'Aliment. chancador' : 'Crusher feed', content: <Panel t={es ? 'Alimentación al chancador, toneladas acumuladas vs hora' : 'Crusher feed, cumulative tonnes vs shift hour'}><UPlotChart data={feed} build={buildFeed} fill minHeight={220} /></Panel> },
    { id: 'compare', label: es ? 'Comparar políticas' : 'Compare policies', content: (
      <Panel t={es ? 'Pareto: toneladas (↑) vs espera (←), heurísticas + aprendidas, banda de semillas' : 'Pareto: tonnes (↑) vs wait (←), heuristics + learned, seed bands'}>
        <ParetoScatter stats={cmp} front={front} lang={lang} />
        <p className="dl-hint small">{es ? 'En la frontera' : 'On the frontier'}: <b>{cmp.filter((s) => front.has(s.id)).map((s) => tn(s.id)).join(', ')}</b> · {CMP_SEEDS.length} {es ? 'semillas' : 'seeds'}</p>
        <p className="tw-note dl-note"><b>{tn(tie.leader)}</b> {tie.tied.length === 0 ? (es ? 'lidera más allá de la banda' : 'leads beyond the band') : <>{es ? 'empata (en la banda) con' : 'ties (within the band) with'} <b>{tie.tied.map(tn).join(', ')}</b></>}. {es ? 'Las políticas aprendidas son competitivas, honesto, sin victoria fabricada.' : 'The learned policies are competitive, honest, no fabricated win.'}</p>
      </Panel>) },
    { id: 'bench', label: es ? 'Aprendida vs heurística' : 'Learned vs heuristic', content: (
      <Panel t={es ? 'Toneladas medianas, políticas aprendidas vs heurísticas (mismo caso + semillas)' : 'Median tonnes, learned vs heuristic policies (same case + seeds)'}>
        <LearnedBars stats={cmp} es={es} tn={tn} />
      </Panel>) },
    { id: 'inspect', label: es ? 'Inspector de decisión' : 'Decision inspector', content: <DecisionInspector decisions={decisions.current} es={es} /> },
    { id: 'rollout', label: es ? 'Inspector de rollout' : 'Rollout inspector', content: <RolloutInspector c={activeC} seed={seed} es={es} /> },
    { id: 'valid', label: es ? 'Validación MF' : 'MF validation', content: (
      <Panel t={es ? 'Producción vs tamaño de flota, la rodilla cae en MF=1 (valida el simulador)' : 'Throughput vs fleet size, the knee lands at MF=1 (validates the simulator)'}>
        <SweepChart pts={sweep} knee={knee} nMf1={nMf1} lang={lang} />
        <p className="dl-hint small">{es ? 'Rodilla medida' : 'Measured knee'}: <b>{sweep[knee].n}</b> ({es ? 'camiones' : 'trucks'}, MF {sweep[knee].mf.toFixed(2)}) · MF=1 {es ? 'en' : 'at'} <b>{nMf1.toFixed(1)}</b></p>
      </Panel>) },
    { id: 'queue', label: es ? 'Colas' : 'Queues', content: (
      <Panel t={es ? 'Tiempo de espera en cola por pala (horas, esta corrida)' : 'Per-shovel queue wait (hours, this run)'}>
        <BarChart fill
          ariaLabel={es ? 'Espera en cola por pala' : 'Per-shovel queue wait'}
          unit="h" defaultBaseline="zero" valueFmt={(v) => v.toFixed(1)}
          data={result.shovels.map<BarDatum>((s) => ({ key: String(s.id), label: s.name.split('(')[0].trim(), value: s.queueWaitSec / 3600, color: '#d29922' }))}
          note={es ? 'Cola por pala en esta corrida; al cambiar de política o caso, la espera se redistribuye.' : 'Per-shovel queue this run; change policy or case and watch the wait redistribute.'}
        />
      </Panel>) },
    { id: 'share', label: es ? 'Reparto de decisiones' : 'Decision share', content: (
      <Panel t={es ? 'Fracción de decisiones de despacho a cada pala (la política actual, esta corrida)' : 'Fraction of dispatch decisions to each shovel (current policy, this run)'}>
        {(() => { const cnt: Record<number, number> = {}; for (const d of decisions.current) { const id = d.ids[d.chosen]; cnt[id] = (cnt[id] || 0) + 1; } const tot = decisions.current.length || 1;
          return <BarChart fill
            ariaLabel={es ? 'Reparto de decisiones por pala' : 'Decision share per shovel'}
            unit="%" defaultBaseline="zero" valueFmt={(v) => v.toFixed(0)}
            data={c.mine.shovels.map<BarDatum>((s) => ({ key: String(s.id), label: s.name.split('(')[0].trim(), value: ((cnt[s.id] || 0) / tot) * 100, sub: `(${cnt[s.id] || 0})`, color: 'var(--color-accent)' }))}
            note={es ? 'Una política que reparte desigual sobre-camiona la pala cercana; al cambiar de política o caso, el reparto se ajusta.' : 'A policy that splits unevenly over-trucks the near shovel; change the policy or case and watch the split.'}
          />; })()}
      </Panel>) },
    { id: 'cycle', label: es ? 'Tiempo de ciclo' : 'Cycle time', content: (
      <Panel t={realOK
        ? (es ? 'Tiempo de ciclo medido por pala (mediana de carga vs viaje+descarga observados en el turno)' : 'Measured cycle time per shovel (median observed load vs haul+dump this shift)')
        : (es ? 'Tiempo de ciclo ideal por pala (carga vs viaje+descarga), de la cinemática rimpull/pendiente' : 'Ideal cycle time per shovel (load vs haul+dump), from the rimpull/grade kinematics')}>
        {(() => {
          const cycleOf = (id: number): { tLoad: number; tCycle: number } => {
            if (realOK && realReport?.sample) {
              const emp = realReport.sample.empirical;
              const hauls = Object.entries(emp.fullTravelMedianSec).filter(([k]) => k.startsWith(`${id}->`)).map(([, v]) => v);
              const rets = Object.entries(emp.emptyTravelMedianSec).filter(([k]) => k.endsWith(`->${id}`)).map(([, v]) => v);
              const tLoad = emp.loadMeanSecByShovel[id] ?? 0;
              const haul = hauls.length ? hauls.reduce((a, b) => a + b, 0) / hauls.length : 0;
              const ret = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
              return { tLoad, tCycle: tLoad + haul + emp.dumpMeanSec + ret };
            }
            const cy = shovelCycle(c, id); return { tLoad: cy.tLoad, tCycle: cy.tCycle };
          };
          return <BarChart fill
            ariaLabel={es ? 'Tiempo de ciclo por pala' : 'Per-shovel cycle time'}
            unit="min" defaultBaseline="zero" valueFmt={(v) => v.toFixed(1)}
            data={activeC.mine.shovels.map<BarDatum>((s) => { const cy = cycleOf(s.id); return { key: String(s.id), label: s.name.split('(')[0].trim(), value: cy.tCycle / 60, sub: es ? `carga ${(cy.tLoad / 60).toFixed(1)}` : `load ${(cy.tLoad / 60).toFixed(1)}`, color: 'var(--color-accent)' }; })}
            note={es ? 'Total del ciclo (carga + viaje + descarga + retorno). Las palas lejanas tienen ciclos más largos → menos viajes posibles por turno.' : 'Total cycle (load + haul + dump + return). Far shovels have longer cycles → fewer possible trips per shift.'}
          />; })()}
      </Panel>) },
  ];
  // real mode: the measured-shift tabs + the counterfactual dispatcher (#18); the multi-seed synthetic
  // comparisons + MF sweep stay synthetic-only (their aggregate versions land in Benchmark, #19)
  const cfTab = {
    id: 'counterfactual', label: es ? 'Despacho contrafactual' : 'Counterfactual dispatch', content: (
      <Panel t={es ? 'Re-decidir el turno real bajo cada política, acuerdo con el despachador real en cada punto de decisión' : 'Re-deciding the real shift under each policy, agreement with the real dispatcher at each decision point'}>
        {cfDecisions.length === 0 ? (
          <p className="dl-hint">{es ? 'Esta muestra no tiene puntos de decisión (ningún ciclo return→load completo).' : 'This sample has no decision points (no complete return→load cycle).'}</p>
        ) : (
          <>
            <div className="dl-bars">{cfAgree.map((r) => (
              <div key={r.id} className="dl-bar-row"><div className="dl-bar-label"><span className="dl-dot" style={{ background: POLICY_COLOR[r.id] ?? 'var(--color-accent)' }} /> {r.label}</div>
                <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${r.pct}%`, background: POLICY_COLOR[r.id] ?? 'var(--color-accent)' }} /></div><span className="dl-bar-num mono">{r.agree}/{r.n} · {r.pct.toFixed(0)}%</span></div>
              </div>))}</div>
            <p className="dl-hint small">{es
              ? `Estado reconstruido desde el log en cada dump-complete real (colas/inbound/cargando; estimación p10 declarada). Acuerdo en la decisión, no toneladas contrafactuales (eso exige re-simulación calibrada y va en Benchmark). ${cfDecisions.length} puntos de decisión.`
              : `State reconstructed from the log at every real dump-complete (queues/inbound/loading; stated p10 estimate). Decision agreement, not counterfactual tonnes (that needs a calibrated re-simulation and lands in Benchmark). ${cfDecisions.length} decision points.`}</p>
            <RealDecisionInspector decisions={cfDecisions} es={es} />
          </>
        )}
      </Panel>) };
  const rawTabs = realOK
    ? [...tabs.filter((t) => ['pit3d', 'map', 'shovel', 'feed', 'queue', 'share', 'cycle'].includes(t.id)), cfTab]
    : tabs;
  // wrap every panel in an error boundary so one failing view never blanks the whole app (#78)
  const visibleTabs = rawTabs.map((t) => ({ ...t, content: <PanelBoundary label={typeof t.label === 'string' ? t.label : undefined}>{t.content}</PanelBoundary> }));

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((x) => x.id === activeTab)) setActiveTab(visibleTabs[0].id);
  }, [visibleTabs.length, activeTab]);

  return (
    <div className="page-body dl-layout">
      <aside className="dl-controls">
        {/* ADR-0070 entry: without a visible control in the App the focus route is an orphan that
            passes route tests and no user ever reaches. It carries the SELECTED scenario. */}
        <Link className="dl-focus-enter" to={`/focus/${caseId}`}>
          <span className="dl-focus-enter-t">{es ? 'Modo enfoque' : 'Focus mode'}</span>
          <span className="dl-focus-enter-d">
            {es ? 'Abrir este escenario a pantalla completa' : 'Open this scenario full screen'}
          </span>
        </Link>
        {/* first-level source selector (#14): the workbench runs on a synthetic scenario or a real cycle-log */}
        <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Fuente' : 'Source'}</span>
          <div className="dl-chips">
            <button className={`chip ${source === 'synthetic' ? 'on' : ''}`} onClick={() => { setSource('synthetic'); setPlayT(0); }}>{es ? 'Sintética' : 'Synthetic'}</button>
            <button className={`chip ${source === 'real' ? 'on' : ''}`} onClick={() => { setSource('real'); setPlayT(0); }}>{es ? 'Muestra real' : 'Real sample'}</button>
          </div>
        </div>
        {source === 'real' && (
          <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Muestra (turno)' : 'Sample (shift)'}</span>
            {/* family mini-tabs (#47): one group visible at a time; • marks the family of the ACTIVE sample */}
            <div className="dl-chips" role="tablist" aria-label={es ? 'familia de muestra' : 'sample family'} style={{ marginBottom: '0.35rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--color-border)' }}>
              {FAMS.map((f) => (
                <button key={f.key} role="tab" aria-selected={famTab === f.key} className={`chip ${famTab === f.key ? 'on' : ''}`}
                        onClick={() => setFamTab(f.key)}>
                  {es ? f.es : f.en}{sampleId && famOf(sampleId) === f.key ? ' •' : ''}
                </button>
              ))}
            </div>
            <div className="dl-chips">{samples.filter((s) => famOf(s.id) === famTab).map((s) => (
              <button key={s.id} className={`chip ${sampleId === s.id ? 'on' : ''}`} onClick={() => setSampleId(s.id)} title={s.name}>{sampleLabel(s.id)}</button>
            ))}</div>
            <label className="dl-hint" style={{ display: 'block', marginTop: '0.3rem' }}>
              {es ? 'o cargar un log propio (CSV cyclelog/v1): ' : 'or bring your own log (cyclelog/v1 CSV): '}
              <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUserFile(f); }} />
            </label>
            {realErr && <span className="dl-hint" style={{ color: '#f85149' }}>{es ? 'Rechazado por el contrato: ' : 'Rejected by the contract: '}{realErr}</span>}
            {realOK && realReport?.sample && (
              <>
                {realReport.flags.length > 0 && <div className="small" style={{ color: '#d29922', marginTop: '0.3rem' }}>⚑ {realReport.flags.join(' · ')}</div>}
                {/* provenance folds away (#47): the prose was pushing every control below the fold */}
                <details className="dl-fold" style={{ marginTop: '0.35rem' }}>
                  <summary>{es ? 'Procedencia' : 'Provenance'} · <b>{realReport.sample.provenance.kind}</b> · <span className="mono">{realReport.sample.trucks.length}t · {realReport.sample.shovels.length}s · {(realReport.sample.shiftSec / 3600).toFixed(1)}h</span></summary>
                  <div className="small">{realReport.sample.provenance.source}</div>
                  <div className="small muted">{realReport.sample.provenance.caveats}</div>
                  {realReport.sample.provenance.geology && (
                    <div className="small" style={{ marginTop: '0.3rem' }}>
                      {es ? 'Geología' : 'Geology'} (oreblocks): <b>{realReport.sample.provenance.geology.archetype}</b> · {es ? 'ley de corte' : 'cutoff'} {(realReport.sample.provenance.geology.cutoffGrade * 100).toFixed(3)}% · {es ? 'pit exacto' : 'exact pit'} ${(realReport.sample.provenance.geology.stampedPitValue / 1e6).toFixed(0)}M
                      <div className="muted">{realReport.sample.provenance.geology.note}</div>
                    </div>
                  )}
                </details>
              </>
            )}
          </div>
        )}
        {/* scenario knobs, author the synthetic case; in real mode the case is read from the sample,
            so the authoring grid hides entirely instead of rendering locked-but-clickable-looking (#47) */}
        {source === 'synthetic' ? (
          <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Caso' : 'Case'}</span>
            {/* ADR-0071 rule 7: a one-of-N choice is a select, not N buttons. Eight case chips spent
                rail height listing ids the user then had to hover to identify; the dropdown shows the
                id AND its name in one row. */}
            <select className="dl-select" value={caseId} aria-label={es ? 'caso' : 'case'}
                    onChange={(e) => { setCaseId(e.target.value); setPlayT(0); }}>
              {CASES.map((x) => <option key={x.id} value={x.id}>{x.id} - {x.name}</option>)}
            </select>
            <span className="dl-hint">{c.name}</span>
          </div>
        ) : (
          <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Caso' : 'Case'}</span>
            <span className="dl-hint">{realOK
              ? (es ? `leído de la muestra: ${activeC.name}` : `read from the sample: ${activeC.name}`)
              : (es ? 'se lee de la muestra al cargarla' : 'read from the sample once it loads')}</span>
          </div>
        )}
        {/* operational constraints (#22): enforced by the DES for every policy, the chips show
            the effective set (a case's own baked constraints + the demo toggle).
            In real mode they do not apply (the replay reproduces the logged shift), so say that
            in one line instead of a greyed-out interactive-looking block (#47). */}
        {source === 'synthetic' ? (
        <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Restricciones operativas' : 'Operational constraints'}</span>
          <div className="dl-chips">
            <button className={`chip ${consOn ? 'on' : ''}`} onClick={() => { setConsOn((v) => !v); setPlayT(0); }}>{consOn ? (es ? '+ set demo' : '+ demo set') : (es ? 'añadir set demo' : 'add demo set')}</button>
            {c.constraints?.crusherMaxTph != null && <span className="chip" style={{ pointerEvents: 'none' }}>{es ? `chancador ≤ ${(c.constraints.crusherMaxTph / 1000).toFixed(1)} kt/h` : `crusher ≤ ${(c.constraints.crusherMaxTph / 1000).toFixed(1)} kt/h`}</span>}
            {c.constraints?.maxQueuePerShovel != null && <span className="chip" style={{ pointerEvents: 'none' }}>{es ? `cola ≤ ${c.constraints.maxQueuePerShovel}/pala` : `queue ≤ ${c.constraints.maxQueuePerShovel}/shovel`}</span>}
            {(c.constraints?.breaks?.length ?? 0) > 0 && <span className="chip" style={{ pointerEvents: 'none' }}>{es ? 'pausa 4.0–4.5 h' : 'break 4.0–4.5 h'}</span>}
            {!c.constraints && <span className="chip" style={{ pointerEvents: 'none', opacity: 0.6 }}>{es ? 'sin restricciones' : 'unconstrained'}</span>}
          </div>
          {c.constraints && <span className="dl-hint">{es
            ? `El DES filtra el conjunto factible antes de cada política, todas cumplen por construcción. Elecciones inválidas: ${synResult.invalidChoices ?? 0}.`
            : `The DES filters the feasible set before every policy, all of them comply by construction. Invalid choices: ${synResult.invalidChoices ?? 0}.`}</span>}
        </div>
        ) : (
          <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Restricciones operativas' : 'Operational constraints'}</span>
            <span className="dl-hint">{es ? 'n/a en el replay medido (el turno reproduce lo registrado); la re-decisión con restricciones vive en Benchmark' : 'n/a on the measured replay (the shift reproduces what was logged); constrained re-deciding lives in Benchmark'}</span>
          </div>
        )}
        {source === 'synthetic' ? (
        <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Política' : 'Policy'}</span>
          {/* Same rule. Nine policy chips wrapped over several rail rows; grouped by tier a dropdown
              also makes the heuristic / optimal / learned distinction visible, which the flat chip
              list never did. */}
          <select className="dl-select" value={policyId} aria-label={es ? 'politica' : 'policy'}
                  onChange={(e) => setPolicyId(e.target.value)}>
            {['heuristic', 'optimal', 'learned'].map((tier) => {
              const inTier = allPolicies.filter((p) => (p.tier ?? 'heuristic') === tier);
              if (!inTier.length) return null;
              const label = tier === 'heuristic' ? (es ? 'Heuristicas' : 'Heuristics')
                : tier === 'optimal' ? (es ? 'Optimas' : 'Optimal')
                : (es ? 'Aprendidas' : 'Learned');
              return (
                <optgroup key={tier} label={label}>
                  {inTier.map((p) => (
                    <option key={p.id} value={p.id}>
                      {(es ? p.es : p.en).replace('Learned, ', '').replace('Aprendida, ', '').split(' (')[0]}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {pol.tier === 'learned' && <span className="dl-hint" style={{ color: '#f85149' }}>{es ? 'política aprendida (red entrenada offline)' : 'learned policy (net trained offline)'}</span>}
        </div>
        ) : (
          <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Política' : 'Policy'}</span>
            <span className="dl-hint">{es ? 'la muestra trae al despachador real; el acuerdo por política vive en el tab Despacho contrafactual' : 'the sample carries the real dispatcher; per-policy agreement lives in the Counterfactual tab'}</span>
          </div>
        )}
        {source === 'synthetic' && (
        <label className="dl-ctl">{es ? 'Semilla' : 'Seed'}: {seed}<input className="range" type="range" min={1} max={40} value={seed} onChange={(e) => setSeed(+e.target.value)} /></label>
        )}
        <div className="dl-diag">
          <div className="dl-diag-h">{es ? 'Diagnóstico' : 'Diagnosis'}</div>
          {/* policy-dependent outcome first: these numbers change when the policy switches (the MF block below
              is a fleet property and is the same for every policy, which is why it does not move) */}
          <div className="dl-diag-pol" style={{ marginBottom: '0.5rem' }}>
            <div className="small" style={{ opacity: 0.85 }}>{realOK ? (es ? 'Turno medido' : 'Measured shift') : <>{es ? 'Esta política' : 'This policy'}: <b>{tn(policyId)}</b></>}</div>
            <div className="small mono"><b>{(tonnes / 1000).toFixed(1)}k t</b> · {es ? 'espera' : 'wait'} {truckWaitH.toFixed(1)} h · util {(meanUtil * 100).toFixed(0)}%</div>
            {!realOK && <div className="small muted">{es ? 'al cambiar de política estos números cambian; el reparto, las colas y el ciclo también' : 'switch policy and these numbers change; the share, queues and cycle move too'}</div>}
          </div>
          <div className="dl-mfbar"><span className="dl-mfref" style={{ left: `${(1 / MAXMF) * 100}%` }} /><span className="dl-mfmark" style={{ left: `${Math.min(1, mf / MAXMF) * 100}%` }} /></div>
          <div className="small"><b className="mono">MF {mf.toFixed(2)}</b> · {balance === 'over' ? (es ? 'sobre-camionado' : 'over-trucked') : balance === 'under' ? (es ? 'sub-camionado' : 'under-trucked') : (es ? 'equilibrado' : 'balanced')}</div>
          <div className="small">{delta !== 0 ? <>{delta > 0 ? (es ? 'agregar' : 'add') : (es ? 'quitar' : 'remove')} <b>{Math.abs(delta)}</b> {es ? 'camiones para MF≈1' : 'trucks for MF≈1'}</> : <>✓ MF≈1</>}</div>
          <div className="small muted">{bottleneck === 'shovelBound' ? (es ? 'limitado por pala' : 'shovel-bound') : bottleneck === 'queueBound' ? (es ? 'limitado por cola' : 'queue-bound') : (es ? 'con holgura' : 'headroom')}</div>
          <div className="small muted" style={{ marginTop: '0.2rem', fontStyle: 'italic' }}>{es ? 'MF es una propiedad de la flota (analítica), igual para todas las políticas' : 'MF is a fleet property (analytical), the same for every policy'}</div>
        </div>
        <p className="tw-note dl-note">{realOK
          ? (es ? 'Turno medido reproducido desde un cycle-log (contrato cyclelog/v1). La geometría del mapa es esquemática (los logs no traen coordenadas). No es un sistema de despacho productivo.' : 'Measured shift replayed from a cycle log (cyclelog/v1 contract). Map geometry is schematic (logs carry no coordinates). Not a production dispatch system.')
          : (es ? 'Rajo sintético físicamente fundado (validado vs match-factor + oráculo); políticas aprendidas entrenadas offline, inferencia ONNX viva. No es un sistema de despacho productivo.' : 'Synthetic physics-grounded pit (validated vs match-factor + oracle); learned policies trained offline, live ONNX inference. Not a production dispatch system.')}</p>
      </aside>
      <div className="dl-main">
        <div className="dl-tabrow" role="tablist" aria-label={es ? 'vistas' : 'views'}>
          {TAB_GROUPS.filter((g) => visibleTabs.some((x) => g.members.includes(x.id))).map((g) => {
            const mine = visibleTabs.filter((x) => g.members.includes(x.id));
            const activeHere = mine.some((x) => x.id === activeTab);
            const shown = activeHere ? mine.find((x) => x.id === activeTab)! : mine[0];
            const multi = mine.length > 1;
            return (
              <div key={g.id} className="dl-tabwrap"
                   onPointerEnter={() => { if (multi) { if (closeTimer.current) clearTimeout(closeTimer.current); setOpenMenu(g.id); } }}
                   onPointerLeave={() => {
                     if (closeTimer.current) clearTimeout(closeTimer.current);
                     closeTimer.current = setTimeout(() => setOpenMenu((m) => (m === g.id ? null : m)), 240);
                   }}>
                <button role="tab" aria-selected={activeHere}
                        className={`dl-tab ${activeHere ? 'on' : ''}`}
                        onClick={() => {
                          if (!multi) { setActiveTab(mine[0].id); setOpenMenu(null); return; }
                          setOpenMenu(openMenu === g.id ? null : g.id);
                          if (!activeHere) setActiveTab(shown.id);
                        }}>
                  {activeHere ? shown.label : (es ? g.es : g.en)}{multi ? <span className="dl-caret">v</span> : null}
                </button>
                {multi && openMenu === g.id && (
                  <div className="dl-tabmenu" role="menu">
                    {mine.map((x) => (
                      <button key={x.id} role="menuitem" className={x.id === activeTab ? 'on' : ''}
                              onClick={() => { setActiveTab(x.id); setOpenMenu(null); }}>{x.label}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="dl-tabpanel">
          {(visibleTabs.find((x) => x.id === activeTab) ?? visibleTabs[0])?.content}
        </div>
      </div>
    </div>
  );
}

function Panel({ t, children }: { t: string; children: ReactNode }) { return <div className="dl-panel"><div className="dl-panel-t">{t}</div>{children}</div>; }
function KPI({ v, l }: { v: string; l: string }) { return <div className="dl-kpi"><div className="dl-kpi-v">{v}</div><div className="dl-kpi-l">{l}</div></div>; }

function LearnedBars({ stats, es, tn }: { stats: ReturnType<typeof comparePolicies>; es: boolean; tn: (id: string) => string }) {
  const ord = [...stats].sort((a, b) => b.medTonnes - a.medTonnes);
  return (
    <BarChart fill
      ariaLabel={es ? 'Toneladas medianas por política, aprendidas vs heurísticas' : 'Median tonnes per policy, learned vs heuristic'}
      unit="t" defaultBaseline="fit" valueFmt={(v) => (v / 1000).toFixed(1) + 'k'}
      data={ord.map<BarDatum>((s) => ({ key: s.id, label: tn(s.id), value: s.medTonnes, ci: [s.loT, s.hiT], color: POLICY_COLOR[s.id], mark: (s.id === 'rwr' || s.id === 'bcbest') ? '★' : undefined }))}
      note={es ? '★ = política aprendida. Barra = mediana; el bigote = banda entre semillas. En modo Fit las diferencias (~1-3%) se ven; las aprendidas igualan a sus maestras, no las superan.' : '★ = learned policy. Bar = median; whisker = seed band. Fit mode makes the ~1-3% differences visible; the learned policies match their teachers, they do not beat them.'}
    />
  );
}

function RealDecisionInspector({ decisions, es }: { decisions: ReturnType<typeof reconstructDecisions>; es: boolean }) {
  const [i, setI] = useState(0);
  const [scores, setScores] = useState<number[] | null>(null);
  const d = decisions.length ? decisions[Math.min(i, decisions.length - 1)] : null;
  const feats = useMemo(() => (d ? d.state.shovels.map((v) => shovelFeats(v, d.state.travelEmptySec(v.id))) : null), [d]);
  useEffect(() => {
    let a = true; setScores(null);
    if (feats) onnxScore('dl-policy.onnx', feats).then((s) => { if (a) setScores(s); }).catch(() => { if (a) setScores(null); });
    return () => { a = false; };
  }, [feats]);
  if (!d) return null;
  // same defensive contract as DecisionInspector (#78): use the ONNX vector only when finite + aligned
  const sv = scores && scores.length === d.state.shovels.length && scores.every((x) => Number.isFinite(x)) ? scores : null;
  const argmax = sv ? sv.indexOf(Math.max(...sv)) : -1;
  return (
    <div style={{ marginTop: '0.8rem' }}>
      <div className="dl-panel-t">{es ? 'Inspector, la red (RWR, ONNX en vivo) sobre el punto de decisión real' : 'Inspector, the net (RWR, live ONNX) on the real decision point'}</div>
      {sv ? (
        <BarChart fill
          ariaLabel={es ? 'Puntajes de la red sobre la decisión real' : 'Net scores on the real decision'}
          defaultBaseline="fit" valueFmt={(x) => x.toFixed(2)}
          data={d.state.shovels.map<BarDatum>((v, k) => ({ key: String(v.id), label: v.spec.name, value: sv[k], color: k === argmax ? '#f85149' : 'var(--color-accent)', mark: k === argmax ? '★' : undefined, sub: v.id === d.chosen ? (es ? '(real)' : '(real)') : undefined }))}
        />
      ) : <p className="dl-hint small">{es ? 'Calculando puntajes ONNX…' : 'Computing ONNX scores…'}</p>}
      <input className="range" type="range" min={0} max={decisions.length - 1} value={i} onChange={(e) => setI(+e.target.value)} style={{ width: '100%', marginTop: '0.5rem' }} />
      <p className="dl-hint small">{es ? 'Decisión' : 'Decision'} {i + 1}/{decisions.length} · t={(d.t / 3600).toFixed(2)} h · truck {d.truck} · ★ = {es ? 'argmax de la red' : 'argmax of the net'}</p>
    </div>
  );
}

function RolloutInspector({ c, seed, es }: { c: CaseSpec; seed: number; es: boolean }) {
  const [di, setDi] = useState(0);
  const [res, setRes] = useState<InspectResult | null>(null);
  const [busy, setBusy] = useState(false);
  const K = 6;
  const multi = c.mine.shovels.length >= 2;
  // reset the computed result whenever the case/seed/decision changes (never auto-compute, no compute-bomb)
  useEffect(() => { setRes(null); }, [c.id, seed, di]);
  const compute = () => {
    if (!multi) return;
    setBusy(true);
    // yield to the paint so the "computing" state shows, then run the bounded rollout (one decision,
    // shovels x K short forks). Never on a timer, only on this explicit click.
    setTimeout(() => {
      try {
        const r = rolloutInspect(c, seed, { ...DEFAULT_ROLLOUT, base: shortestWait, K, planModel: 'sample' }, di);
        setRes(r);
      } finally { setBusy(false); }
    }, 20);
  };
  if (!multi) return <Panel t={es ? 'Inspector de rollout' : 'Rollout inspector'}><p className="dl-hint">{es ? 'El rollout necesita una decisión multi-pala (cualquier caso complejo, C04-C08).' : 'The rollout needs a multi-shovel decision (any complex case, C04-C08).'}</p></Panel>;
  const cands = res?.candidates ?? [];
  const maxT = cands.length ? Math.max(...cands.flatMap((x) => x.samples.map((s) => s.tonnes))) : 1;
  const minT = cands.length ? Math.min(...cands.flatMap((x) => x.samples.map((s) => s.tonnes))) : 0;
  return (
    <Panel t={es ? 'Inspector de rollout, los K futuros simulados por candidato en UNA decisión (bajo demanda, acotado)' : 'Rollout inspector, the K simulated futures per candidate at ONE decision (on demand, bounded)'}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="chip on" onClick={compute} disabled={busy}>{busy ? (es ? 'Calculando…' : 'Computing…') : (es ? `Calcular rollout (K=${K})` : `Compute rollout (K=${K})`)}</button>
        <label className="dl-hint" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>{es ? 'Decisión' : 'Decision'} #{di}
          <input className="range" type="range" min={0} max={20} value={di} onChange={(e) => setDi(+e.target.value)} style={{ width: 120 }} /></label>
      </div>
      {res == null ? (
        <p className="dl-hint small" style={{ marginTop: '0.5rem' }}>{es
          ? 'Al pulsar Calcular: para cada pala candidata, el DES se bifurca, se aplica la pala y se simula el resto del turno K veces con la política base; se elige el mejor objetivo esperado. Nada se ejecuta solo (sin bomba de cómputo).'
          : 'Press Compute: for each candidate shovel, the DES forks, the shovel is applied, and the rest of the shift is simulated K times under the base policy; the best expected objective is chosen. Nothing runs on its own (no compute-bomb).'}</p>
      ) : cands.length === 0 ? (
        <p className="dl-hint small" style={{ marginTop: '0.5rem' }}>{es ? 'No hay una decisión en ese índice (turno más corto).' : 'No decision at that index (shorter shift).'}</p>
      ) : (<>
        <div className="dl-bars" style={{ marginTop: '0.5rem' }}>{cands.map((cand) => {
          const w = (cand.meanTonnes - minT) / (maxT - minT || 1);
          return (
            <div key={cand.id} className="dl-bar-row">
              <div className="dl-bar-label">{cand.name.split('(')[0].trim()}{cand.chosen ? ' · ★' : ''}{cand.base ? ` · ${es ? 'base ▷' : 'base ▷'}` : ''}</div>
              <div className="dl-bar-pair">
                <div className="dl-bar" style={{ position: 'relative' }}>
                  <span className="dl-bar-fill" style={{ width: `${w * 100}%`, background: cand.chosen ? '#e3b341' : 'var(--color-accent)' }} />
                  {/* each simulated future as a dot along the tonnes axis (the Monte-Carlo spread) */}
                  {cand.samples.map((s, j) => <span key={j} style={{ position: 'absolute', left: `${((s.tonnes - minT) / (maxT - minT || 1)) * 100}%`, top: '50%', width: 5, height: 5, marginLeft: -2, marginTop: -2, borderRadius: '50%', background: 'var(--color-fg)', opacity: 0.55 }} />)}
                </div>
                <span className="dl-bar-num mono">{(cand.meanTonnes / 1000).toFixed(1)}k t</span>
              </div>
            </div>); })}</div>
        <p className="dl-hint small">{es
          ? `Decisión #${res.decisionIndex} · t=${(res.nowSec / 3600).toFixed(1)} h · camión ${res.truckId} · K=${res.K} futuros/candidato · ★ = elegido por el rollout · ▷ = elección de la base (shortest-wait). Los puntos son los K futuros simulados (la dispersión Monte-Carlo). En vivo la política desplegada es la destilación (dl-rollout.onnx); esto muestra la búsqueda real.`
          : `Decision #${res.decisionIndex} · t=${(res.nowSec / 3600).toFixed(1)} h · truck ${res.truckId} · K=${res.K} futures/candidate · ★ = rollout's choice · ▷ = base choice (shortest-wait). Dots are the K simulated futures (the Monte-Carlo spread). Live, the deployed policy is the distillation (dl-rollout.onnx); this shows the real search.`}</p>
      </>)}
    </Panel>
  );
}

function DecisionInspector({ decisions, es }: { decisions: Decision[]; es: boolean }) {
  const [i, setI] = useState(0);
  const [scores, setScores] = useState<number[] | null>(null);
  const d = decisions.length ? decisions[Math.min(i, decisions.length - 1)] : null;
  useEffect(() => { let a = true; setScores(null); if (d) onnxScore('dl-policy.onnx', d.feats).then((s) => { if (a) setScores(s); }).catch(() => { if (a) setScores(null); }); return () => { a = false; }; }, [d]);
  if (!d) return <Panel t="Decision inspector"><p className="dl-hint">{es ? 'No hay decisiones capturadas (caso de una sola pala).' : 'No captured decisions (single-shovel case).'}</p></Panel>;
  // Only trust the ONNX output when it is a finite-number array aligned with the shovel rows. The model
  // has a fixed input width; a case whose shovel count differs returns a mismatched vector, indexing past
  // it yielded undefined.toFixed and blanked the app (#78). Mismatch/NaN => render the loading state.
  const sv = scores && scores.length === d.names.length && scores.every((x) => Number.isFinite(x)) ? scores : null;
  const argmax = sv ? sv.indexOf(Math.max(...sv)) : -1;
  return (
    <Panel t={es ? 'Inspector de decisión, puntajes de la política aprendida (RWR) vía onnxruntime-web, por pala' : 'Decision inspector, learned (RWR) policy scores via onnxruntime-web, per shovel'}>
      {sv ? (
        <BarChart fill
          ariaLabel={es ? 'Puntajes de la red por pala' : 'Per-shovel net scores'}
          defaultBaseline="fit" valueFmt={(v) => v.toFixed(2)}
          data={d.names.map<BarDatum>((nm, k) => ({ key: String(k), label: nm, value: sv[k], color: k === argmax ? '#f85149' : 'var(--color-accent)', mark: k === argmax ? '★' : undefined, sub: k === d.chosen ? (es ? '(heur.)' : '(heur.)') : undefined }))}
        />
      ) : <p className="dl-hint small">{es ? 'Calculando puntajes ONNX en el navegador…' : 'Computing ONNX scores in the browser…'}</p>}
      <input className="range" type="range" min={0} max={decisions.length - 1} value={i} onChange={(e) => setI(+e.target.value)} style={{ width: '100%', marginTop: '0.5rem' }} />
      <p className="dl-hint small">{es ? 'Decisión' : 'Decision'} {i + 1}/{decisions.length} · t={(d.t / 3600).toFixed(1)} h · ★ = {es ? 'pala elegida por la red (argmax). La inferencia ONNX se ejecuta en vivo en el navegador.' : 'shovel the net picks (argmax). The ONNX inference runs live in the browser.'}</p>
    </Panel>
  );
}
