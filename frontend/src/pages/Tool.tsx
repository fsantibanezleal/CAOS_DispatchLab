import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type uPlot from 'uplot';
import { Tabs, useShellLang } from '@fasl-work/caos-app-shell';
import { runSimulation } from '../sim/model';
import { analyticalMatchFactor, shovelCycle } from '../sim/matchfactor';
import { comparePolicies, paretoFront, tieVerdict, POLICY_COLOR } from '../sim/compare';
import { fleetSweep, kneeIndex, nAtMf1 } from '../sim/sweep';
import { CASES, caseById } from '../sim/cases';
import { POLICIES, policyById, type PolicyDef } from '../policies/heuristics';
import { loadLearnedPolicies } from '../policies/learnedRegistry';
import { shovelFeats } from '../policies/learned';
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

const SPEEDS = [50, 200, 600, 1800]; // 50x = slow lane for close visual review
const SWEEP_SEEDS = [3, 11, 19, 29, 41];
const CMP_SEEDS = [3, 7, 11, 17, 23, 29, 37, 42, 59, 71];
// #22: the demo operational-constraint set (applies to ANY synthetic case; the DES enforces it
// for EVERY policy, the feasible set is filtered before the policy sees the state)
const DEMO_CONSTRAINTS = { maxQueuePerShovel: 3, breaks: [{ startSec: 4 * 3600, endSec: 4.5 * 3600 }] } as const;
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

interface Decision { feats: number[][]; ids: number[]; names: string[]; chosen: number; t: number }

export default function Tool() {
  const lang = useShellLang(); const es = lang === 'es';
  const [caseId, setCaseId] = useState('C06');
  const [policyId, setPolicyId] = useState('greedy');
  const [seed, setSeed] = useState(7);
  const [playing, setPlaying] = useState(false); // default PAUSED (no-autoplay rule: an unattended page must not burn CPU)
  const [speed, setSpeed] = useState(600);
  const [playT, setPlayT] = useState(0);
  const [learned, setLearned] = useState<PolicyDef[]>([]);
  useEffect(() => { loadLearnedPolicies().then(setLearned).catch(() => {}); }, []);
  const allPolicies = useMemo(() => [...POLICIES, ...learned], [learned]);

  // ---- SOURCE selector (#14): Synthetic scenario | Real cycle-log sample ----
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
  // sample FAMILIES (#47): the flat mhs-*/openmines-* list was unreadable, group behind mini-tabs
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
  const c = useMemo<CaseSpec>(() => {
    const base = caseById(caseId);
    if (!consOn) return base;
    // the demo set MERGES over any baked case constraints (never overwrites e.g. C10's cap)
    return { ...base, constraints: { ...base.constraints, maxQueuePerShovel: DEMO_CONSTRAINTS.maxQueuePerShovel, breaks: [...DEMO_CONSTRAINTS.breaks] } };
  }, [caseId, consOn]);
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

  // ---- the unified run every tab reads: branched ONCE on source ----
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
          : <Pit3D c={activeC} result={result} t={playT} lang={lang} />}
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
          // #50: when the sample carries oreblocks geology, show each shovel's FACE grade + bench +
          // ore fraction (from the exact ultimate pit), joined by shovel node id.
          const faces = realOK ? realReport?.sample?.provenance.geology?.faces : undefined;
          const faceOf = faces ? Object.fromEntries(faces.map((f) => [f.shovelId, f])) : null;
          return (<>
            <div className="dl-bars">{result.shovels.map((s) => {
              const f = faceOf?.[s.id];
              return (
                <div key={s.id} className="dl-bar-row"><div className="dl-bar-label">{s.name.split('(')[0].trim()}{f ? <span className="chip" style={{ marginLeft: 6, pointerEvents: 'none', fontSize: '0.7rem' }}>{es ? 'banco' : 'bench'} {f.bench} · {(f.grade * 100).toFixed(2)}% · {(f.oreFraction * 100).toFixed(0)}% {es ? 'min.' : 'ore'}</span> : null}</div>
                  <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${s.util * 100}%`, background: 'var(--color-accent)' }} /></div><span className="dl-bar-num mono">{s.served} · {(s.util * 100).toFixed(0)}%</span></div>
                </div>);
            })}</div>
            {faceOf && <p className="dl-hint small">{es ? 'Chip = geología del banco de cada pala en el pit exacto (oreblocks): banco · ley · fracción de mineral al corte económico.' : 'Chip = each shovel bench geology in the exact pit (oreblocks): bench · grade · ore fraction at the economic cutoff.'}</p>}
          </>);
        })()}
      </Panel>) },
    { id: 'feed', label: es ? 'Aliment. chancador' : 'Crusher feed', content: <Panel t={es ? 'Alimentación al chancador, toneladas acumuladas vs hora' : 'Crusher feed, cumulative tonnes vs shift hour'}><UPlotChart data={feed} build={buildFeed} height={200} /></Panel> },
    { id: 'compare', label: es ? 'Comparar políticas' : 'Compare policies', content: (
      <Panel t={es ? 'Pareto: toneladas (↑) vs espera (←), heurísticas + APRENDIDAS, banda de semillas' : 'Pareto: tonnes (↑) vs wait (←), heuristics + LEARNED, seed bands'}>
        <ParetoScatter stats={cmp} front={front} lang={lang} />
        <p className="dl-hint small">{es ? 'En la frontera' : 'On the frontier'}: <b>{cmp.filter((s) => front.has(s.id)).map((s) => tn(s.id)).join(', ')}</b> · {CMP_SEEDS.length} {es ? 'semillas' : 'seeds'}</p>
        <p className="tw-note dl-note"><b>{tn(tie.leader)}</b> {tie.tied.length === 0 ? (es ? 'lidera más allá de la banda' : 'leads beyond the band') : <>{es ? 'empata (en la banda) con' : 'ties (within the band) with'} <b>{tie.tied.map(tn).join(', ')}</b></>}. {es ? 'Las políticas APRENDIDAS son competitivas, honesto, sin victoria fabricada.' : 'The LEARNED policies are competitive, honest, no fabricated win.'}</p>
      </Panel>) },
    { id: 'bench', label: es ? 'Aprendida vs heurística' : 'Learned vs heuristic', content: (
      <Panel t={es ? 'Toneladas medianas, políticas APRENDIDAS vs heurísticas (mismo caso + semillas)' : 'Median tonnes, LEARNED vs heuristic policies (same case + seeds)'}>
        <LearnedBars stats={cmp} es={es} tn={tn} />
      </Panel>) },
    { id: 'inspect', label: es ? 'Inspector de decisión' : 'Decision inspector', content: <DecisionInspector decisions={decisions.current} es={es} /> },
    { id: 'valid', label: es ? 'Validación MF' : 'MF validation', content: (
      <Panel t={es ? 'Producción vs tamaño de flota, la rodilla cae en MF=1 (valida el simulador)' : 'Throughput vs fleet size, the knee lands at MF=1 (validates the simulator)'}>
        <SweepChart pts={sweep} knee={knee} nMf1={nMf1} lang={lang} />
        <p className="dl-hint small">{es ? 'Rodilla medida' : 'Measured knee'}: <b>{sweep[knee].n}</b> ({es ? 'camiones' : 'trucks'}, MF {sweep[knee].mf.toFixed(2)}) · MF=1 {es ? 'en' : 'at'} <b>{nMf1.toFixed(1)}</b></p>
      </Panel>) },
    { id: 'queue', label: es ? 'Colas' : 'Queues', content: (
      <Panel t={es ? 'Tiempo de espera en cola por pala (horas, esta corrida)' : 'Per-shovel queue wait (hours, this run)'}>
        <div className="dl-bars">{result.shovels.map((s) => { const maxQ = Math.max(...result.shovels.map((x) => x.queueWaitSec)) || 1; return (
          <div key={s.id} className="dl-bar-row"><div className="dl-bar-label">{s.name.split('(')[0].trim()}</div>
            <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${(s.queueWaitSec / maxQ) * 100}%`, background: '#d29922' }} /></div><span className="dl-bar-num mono">{(s.queueWaitSec / 3600).toFixed(1)} h</span></div>
          </div>); })}</div>
      </Panel>) },
    { id: 'share', label: es ? 'Reparto de decisiones' : 'Decision share', content: (
      <Panel t={es ? 'Fracción de decisiones de despacho a cada pala (la política actual, esta corrida)' : 'Fraction of dispatch decisions to each shovel (current policy, this run)'}>
        {(() => { const cnt: Record<number, number> = {}; for (const d of decisions.current) { const id = d.ids[d.chosen]; cnt[id] = (cnt[id] || 0) + 1; } const tot = decisions.current.length || 1;
          return <div className="dl-bars">{c.mine.shovels.map((s) => { const f = (cnt[s.id] || 0) / tot; return (
            <div key={s.id} className="dl-bar-row"><div className="dl-bar-label">{s.name.split('(')[0].trim()}</div>
              <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${f * 100}%`, background: 'var(--color-accent)' }} /></div><span className="dl-bar-num mono">{(f * 100).toFixed(0)}%</span></div>
            </div>); })}</div>; })()}
        <p className="dl-hint small">{es ? 'Una política que reparte desigual sobre-camiona la pala cercana; cambia de política o caso y observa el reparto.' : 'A policy that splits unevenly over-trucks the near shovel; change the policy or case and watch the split.'}</p>
      </Panel>) },
    { id: 'cycle', label: es ? 'Tiempo de ciclo' : 'Cycle time', content: (
      <Panel t={realOK
        ? (es ? 'Tiempo de ciclo MEDIDO por pala (mediana de carga vs viaje+descarga observados en el turno)' : 'MEASURED cycle time per shovel (median observed load vs haul+dump this shift)')
        : (es ? 'Tiempo de ciclo ideal por pala (carga vs viaje+descarga), de la cinemática rimpull/pendiente' : 'Ideal cycle time per shovel (load vs haul+dump), from the rimpull/grade kinematics')}>
        <div className="dl-bars">{activeC.mine.shovels.map((s) => {
          let tLoad: number, tCycle: number;
          if (realOK && realReport?.sample) {
            const emp = realReport.sample.empirical;
            tLoad = emp.loadMeanSecByShovel[s.id] ?? 0;
            const hauls = Object.entries(emp.fullTravelMedianSec).filter(([k]) => k.startsWith(`${s.id}->`)).map(([, v]) => v);
            const rets = Object.entries(emp.emptyTravelMedianSec).filter(([k]) => k.endsWith(`->${s.id}`)).map(([, v]) => v);
            const haul = hauls.length ? hauls.reduce((a, b) => a + b, 0) / hauls.length : 0;
            const ret = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
            tCycle = tLoad + haul + emp.dumpMeanSec + ret;
          } else {
            const cy = shovelCycle(c, s.id); tLoad = cy.tLoad; tCycle = cy.tCycle;
          }
          const maxC = Math.max(...activeC.mine.shovels.map((x) => {
            if (realOK && realReport?.sample) {
              const emp = realReport.sample.empirical;
              const hauls = Object.entries(emp.fullTravelMedianSec).filter(([k]) => k.startsWith(`${x.id}->`)).map(([, v]) => v);
              const rets = Object.entries(emp.emptyTravelMedianSec).filter(([k]) => k.endsWith(`->${x.id}`)).map(([, v]) => v);
              return (emp.loadMeanSecByShovel[x.id] ?? 0) + (hauls.length ? hauls.reduce((a, b) => a + b, 0) / hauls.length : 0) + emp.dumpMeanSec + (rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0);
            }
            return shovelCycle(c, x.id).tCycle;
          })) || 1;
          return (
          <div key={s.id} className="dl-bar-row"><div className="dl-bar-label">{s.name.split('(')[0].trim()}</div>
            <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${(tLoad / maxC) * 100}%`, background: '#3fb950' }} /><span className="dl-bar-fill" style={{ left: `${(tLoad / maxC) * 100}%`, width: `${((tCycle - tLoad) / maxC) * 100}%`, background: 'var(--color-accent)', position: 'absolute' }} /></div><span className="dl-bar-num mono">{(tCycle / 60).toFixed(1)} min</span></div>
          </div>); })}</div>
        <p className="dl-hint small">{es ? 'Verde = carga · azul = viaje+descarga. Las palas lejanas tienen ciclos más largos → menos viajes posibles por turno.' : 'Green = load · blue = haul+dump. Far shovels have longer cycles → fewer possible trips per shift.'}</p>
      </Panel>) },
  ];
  // real mode: the measured-shift tabs + the counterfactual dispatcher (#18); the multi-seed synthetic
  // comparisons + MF sweep stay synthetic-only (their aggregate versions land in Benchmark, #19)
  const cfTab = {
    id: 'counterfactual', label: es ? 'Despacho contrafactual' : 'Counterfactual dispatch', content: (
      <Panel t={es ? 'Re-decidir el turno REAL bajo cada política, acuerdo con el despachador real en cada punto de decisión' : 'Re-deciding the REAL shift under each policy, agreement with the real dispatcher at each decision point'}>
        {cfDecisions.length === 0 ? (
          <p className="dl-hint">{es ? 'Esta muestra no tiene puntos de decisión (ningún ciclo return→load completo).' : 'This sample has no decision points (no complete return→load cycle).'}</p>
        ) : (
          <>
            <div className="dl-bars">{cfAgree.map((r) => (
              <div key={r.id} className="dl-bar-row"><div className="dl-bar-label"><span className="dl-dot" style={{ background: POLICY_COLOR[r.id] ?? 'var(--color-accent)' }} /> {r.label}</div>
                <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${r.pct}%`, background: POLICY_COLOR[r.id] ?? 'var(--color-accent)' }} /></div><span className="dl-bar-num mono">{r.agree}/{r.n} · {r.pct.toFixed(0)}%</span></div>
              </div>))}</div>
            <p className="dl-hint small">{es
              ? `Estado reconstruido DESDE el log en cada dump-complete real (colas/inbound/cargando; estimación p10 declarada). Acuerdo en la DECISIÓN, no toneladas contrafactuales (eso exige re-simulación calibrada y va en Benchmark). ${cfDecisions.length} puntos de decisión.`
              : `State reconstructed FROM the log at every real dump-complete (queues/inbound/loading; stated p10 estimate). DECISION agreement, not counterfactual tonnes (that needs a calibrated re-simulation and lands in Benchmark). ${cfDecisions.length} decision points.`}</p>
            <RealDecisionInspector decisions={cfDecisions} es={es} />
          </>
        )}
      </Panel>) };
  const visibleTabs = realOK
    ? [...tabs.filter((t) => ['pit3d', 'map', 'shovel', 'feed', 'queue', 'share', 'cycle'].includes(t.id)), cfTab]
    : tabs;

  return (
    <div className="page-body dl-layout">
      <aside className="dl-controls">
        {/* FIRST-LEVEL SOURCE selector (#14): the workbench runs on a synthetic scenario OR a real cycle-log */}
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
              {es ? 'o trae tu propio log (CSV cyclelog/v1): ' : 'or bring your own log (cyclelog/v1 CSV): '}
              <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUserFile(f); }} />
            </label>
            {realErr && <span className="dl-hint" style={{ color: '#f85149' }}>{es ? 'RECHAZADO por el contrato: ' : 'REJECTED by the contract: '}{realErr}</span>}
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
        {/* SCENARIO knobs, author the synthetic case; in real mode the case is READ from the sample,
            so the authoring grid hides entirely instead of rendering locked-but-clickable-looking (#47) */}
        {source === 'synthetic' ? (
          <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Caso' : 'Case'}</span>
            <div className="dl-chips">{CASES.map((x) => <button key={x.id} className={`chip ${caseId === x.id ? 'on' : ''}`} onClick={() => { setCaseId(x.id); setPlayT(0); }} title={x.name}>{x.id}</button>)}</div>
            <span className="dl-hint">{c.name}</span>
          </div>
        ) : (
          <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Caso' : 'Case'}</span>
            <span className="dl-hint">{realOK
              ? (es ? `leído de la muestra: ${activeC.name}` : `read from the sample: ${activeC.name}`)
              : (es ? 'se lee de la muestra al cargarla' : 'read from the sample once it loads')}</span>
          </div>
        )}
        {/* operational constraints (#22): enforced by the DES for EVERY policy, the chips show
            the EFFECTIVE set (baked case constraints like C10's crusher cap + the demo toggle).
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
            ? `El DES filtra el conjunto factible ANTES de cada política, todas la respetan por construcción. Elecciones inválidas: ${synResult.invalidChoices ?? 0}.`
            : `The DES filters the feasible set BEFORE every policy, all of them comply by construction. Invalid choices: ${synResult.invalidChoices ?? 0}.`}</span>}
        </div>
        ) : (
          <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Restricciones operativas' : 'Operational constraints'}</span>
            <span className="dl-hint">{es ? 'n/a en el replay medido (el turno reproduce lo registrado); la re-decisión con restricciones vive en Benchmark' : 'n/a on the measured replay (the shift reproduces what was logged); constrained re-deciding lives in Benchmark'}</span>
          </div>
        )}
        {source === 'synthetic' ? (
        <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Política' : 'Policy'}</span>
          <div className="dl-chips">{allPolicies.map((p) => <button key={p.id} className={`chip ${policyId === p.id ? 'on' : ''} ${p.tier === 'learned' ? 'dl-learned-chip' : ''}`} onClick={() => setPolicyId(p.id)} title={es ? p.es : p.en}>{(es ? p.es : p.en).replace('Learned, ', '').replace('Aprendida, ', '').split(' (')[0]}</button>)}</div>
          {pol.tier === 'learned' && <span className="dl-hint" style={{ color: '#f85149' }}>{es ? 'política APRENDIDA (red entrenada offline)' : 'LEARNED policy (net trained offline)'}</span>}
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
          <div className="dl-mfbar"><span className="dl-mfref" style={{ left: `${(1 / MAXMF) * 100}%` }} /><span className="dl-mfmark" style={{ left: `${Math.min(1, mf / MAXMF) * 100}%` }} /></div>
          <div className="small"><b className="mono">MF {mf.toFixed(2)}</b> · {balance === 'over' ? (es ? 'sobre-camionado' : 'over-trucked') : balance === 'under' ? (es ? 'sub-camionado' : 'under-trucked') : (es ? 'equilibrado' : 'balanced')}</div>
          <div className="small">{delta !== 0 ? <>{delta > 0 ? (es ? 'agregar' : 'add') : (es ? 'quitar' : 'remove')} <b>{Math.abs(delta)}</b> {es ? 'camiones para MF≈1' : 'trucks for MF≈1'}</> : <>✓ MF≈1</>}</div>
          <div className="small muted">{bottleneck === 'shovelBound' ? (es ? 'limitado por pala' : 'shovel-bound') : bottleneck === 'queueBound' ? (es ? 'limitado por cola' : 'queue-bound') : (es ? 'con holgura' : 'headroom')}</div>
        </div>
        <p className="tw-note dl-note">{realOK
          ? (es ? 'Turno MEDIDO reproducido desde un cycle-log (contrato cyclelog/v1). La geometría del mapa es esquemática (los logs no traen coordenadas). NO es un sistema de despacho productivo.' : 'MEASURED shift replayed from a cycle log (cyclelog/v1 contract). Map geometry is schematic (logs carry no coordinates). NOT a production dispatch system.')
          : (es ? 'Rajo sintético físicamente fundado (validado vs match-factor + oráculo); políticas aprendidas entrenadas offline, inferencia ONNX viva. NO es un sistema de despacho productivo.' : 'Synthetic physics-grounded pit (validated vs match-factor + oracle); learned policies trained offline, live ONNX inference. NOT a production dispatch system.')}</p>
      </aside>
      <div className="dl-main"><Tabs tabs={visibleTabs} ariaLabel="methods" /></div>
    </div>
  );
}

function Panel({ t, children }: { t: string; children: ReactNode }) { return <div className="dl-panel"><div className="dl-panel-t">{t}</div>{children}</div>; }
function KPI({ v, l }: { v: string; l: string }) { return <div className="dl-kpi"><div className="dl-kpi-v">{v}</div><div className="dl-kpi-l">{l}</div></div>; }

function LearnedBars({ stats, es, tn }: { stats: ReturnType<typeof comparePolicies>; es: boolean; tn: (id: string) => string }) {
  const maxT = Math.max(...stats.map((s) => s.hiT));
  const ord = [...stats].sort((a, b) => b.medTonnes - a.medTonnes);
  return (
    <div className="dl-bars">{ord.map((s) => { const learned = s.id === 'rwr' || s.id === 'bcbest'; return (
      <div key={s.id} className="dl-bar-row"><div className="dl-bar-label"><span className="dl-dot" style={{ background: POLICY_COLOR[s.id] }} /> {tn(s.id)}{learned ? ' ★' : ''}</div>
        <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${(s.medTonnes / maxT) * 100}%`, background: POLICY_COLOR[s.id] }} /><span className="dl-bar-band" style={{ left: `${(s.loT / maxT) * 100}%`, width: `${((s.hiT - s.loT) / maxT) * 100}%` }} /></div><span className="dl-bar-num mono">{(s.medTonnes / 1000).toFixed(1)}k t</span></div>
      </div>); })}
      <p className="tw-note dl-note">{es ? '★ = política APRENDIDA. Honesto: igualan a las mejores heurísticas (sus maestras), el valor es una política aprendida única + rápida desde datos, no superarlas.' : '★ = LEARNED policy. Honest: they match the best heuristics (their teachers), the value is a single fast learned policy from data, not beating them.'}</p>
    </div>
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
  const argmax = scores ? scores.indexOf(Math.max(...scores)) : -1;
  const maxS = scores ? Math.max(...scores) : 1, minS = scores ? Math.min(...scores) : 0;
  return (
    <div style={{ marginTop: '0.8rem' }}>
      <div className="dl-panel-t">{es ? 'Inspector, la red (RWR, ONNX en vivo) sobre el punto de decisión REAL' : 'Inspector, the net (RWR, live ONNX) on the REAL decision point'}</div>
      <div className="dl-bars">{d.state.shovels.map((v, k) => { const sc = scores ? scores[k] : 0; const w = scores ? (sc - minS) / (maxS - minS || 1) : 0; return (
        <div key={v.id} className="dl-bar-row"><div className="dl-bar-label">{v.spec.name}{v.id === d.chosen ? ` · ${es ? 'despachador real eligió' : 'real dispatcher chose'}` : ''}{k === argmax ? ' · ★' : ''}</div>
          <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${w * 100}%`, background: k === argmax ? '#f85149' : 'var(--color-accent)' }} /></div><span className="dl-bar-num mono">{scores ? sc.toFixed(2) : '…'}</span></div>
        </div>); })}</div>
      <input className="range" type="range" min={0} max={decisions.length - 1} value={i} onChange={(e) => setI(+e.target.value)} style={{ width: '100%', marginTop: '0.5rem' }} />
      <p className="dl-hint small">{es ? 'Decisión' : 'Decision'} {i + 1}/{decisions.length} · t={(d.t / 3600).toFixed(2)} h · truck {d.truck} · ★ = argmax de la red</p>
    </div>
  );
}

function DecisionInspector({ decisions, es }: { decisions: Decision[]; es: boolean }) {
  const [i, setI] = useState(0);
  const [scores, setScores] = useState<number[] | null>(null);
  const d = decisions.length ? decisions[Math.min(i, decisions.length - 1)] : null;
  useEffect(() => { let a = true; setScores(null); if (d) onnxScore('dl-policy.onnx', d.feats).then((s) => { if (a) setScores(s); }).catch(() => { if (a) setScores(null); }); return () => { a = false; }; }, [d]);
  if (!d) return <Panel t="Decision inspector"><p className="dl-hint">{es ? 'No hay decisiones capturadas (caso de una sola pala).' : 'No captured decisions (single-shovel case).'}</p></Panel>;
  const argmax = scores ? scores.indexOf(Math.max(...scores)) : -1;
  const maxS = scores ? Math.max(...scores) : 1, minS = scores ? Math.min(...scores) : 0;
  return (
    <Panel t={es ? 'Inspector de decisión, puntajes de la política APRENDIDA (RWR) vía onnxruntime-web, por pala' : 'Decision inspector, LEARNED (RWR) policy scores via onnxruntime-web, per shovel'}>
      <div className="dl-bars">{d.names.map((nm, k) => { const sc = scores ? scores[k] : 0; const w = scores ? (sc - minS) / (maxS - minS || 1) : 0; return (
        <div key={k} className="dl-bar-row"><div className="dl-bar-label">{nm}{k === d.chosen ? ` · ${es ? 'heurística eligió' : 'heuristic chose'}` : ''}{k === argmax ? ' · ★' : ''}</div>
          <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${w * 100}%`, background: k === argmax ? '#f85149' : 'var(--color-accent)' }} /></div><span className="dl-bar-num mono">{scores ? sc.toFixed(2) : '…'}</span></div>
        </div>); })}</div>
      <input className="range" type="range" min={0} max={decisions.length - 1} value={i} onChange={(e) => setI(+e.target.value)} style={{ width: '100%', marginTop: '0.5rem' }} />
      <p className="dl-hint small">{es ? 'Decisión' : 'Decision'} {i + 1}/{decisions.length} · t={(d.t / 3600).toFixed(1)} h · ★ = {es ? 'pala elegida por la red (argmax). La inferencia ONNX corre EN VIVO en el navegador.' : 'shovel the net picks (argmax). The ONNX inference runs LIVE in the browser.'}</p>
    </Panel>
  );
}
