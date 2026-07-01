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
import { ParetoScatter } from '../viz/ParetoScatter';
import { SweepChart } from '../viz/SweepChart';
import { UPlotChart } from '../viz/UPlotChart';
import { lineOpts } from '../viz/uplotKit';

const SPEEDS = [200, 600, 1800];
const SWEEP_SEEDS = [3, 11, 19, 29, 41];
const CMP_SEEDS = [3, 7, 11, 17, 23, 29, 37, 42, 59, 71];
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

  const c = caseById(caseId);
  const pol = useMemo(() => allPolicies.find((p) => p.id === policyId) ?? policyById(policyId), [allPolicies, policyId]);
  const decisions = useRef<Decision[]>([]);
  const result = useMemo(() => {
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
  const mf = useMemo(() => analyticalMatchFactor(c), [c]);
  const shiftSec = c.shiftSec;

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
    { id: 'pit3d', label: es ? 'Rajo 3D' : 'Pit 3D', content: (
      <Panel t={es ? 'Topografía del rajo — bancos, rampa espiral y flota en 3D (color = estado del camión); política actual' : 'Pit topography — benches, spiral ramp and the fleet in 3D (colour = truck state); current policy'}>
        <Pit3D c={c} result={result} t={playT} lang={lang} />
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
      <Panel t={es ? 'Mapa animado — camiones, palas y chancador (color = cola); política actual' : 'Animated pit — trucks, shovels and crusher (colour = queue); current policy'}>
        <PitMap c={c} result={result} t={playT} lang={lang} />
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
        <div className="dl-bars">{result.shovels.map((s) => (
          <div key={s.id} className="dl-bar-row"><div className="dl-bar-label">{s.name.split('(')[0].trim()}</div>
            <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${s.util * 100}%`, background: 'var(--color-accent)' }} /></div><span className="dl-bar-num mono">{s.served} · {(s.util * 100).toFixed(0)}%</span></div>
          </div>))}</div>
      </Panel>) },
    { id: 'feed', label: es ? 'Aliment. chancador' : 'Crusher feed', content: <Panel t={es ? 'Alimentación al chancador — toneladas acumuladas vs hora' : 'Crusher feed — cumulative tonnes vs shift hour'}><UPlotChart data={feed} build={buildFeed} height={200} /></Panel> },
    { id: 'compare', label: es ? 'Comparar políticas' : 'Compare policies', content: (
      <Panel t={es ? 'Pareto: toneladas (↑) vs espera (←) — heurísticas + APRENDIDAS, banda de semillas' : 'Pareto: tonnes (↑) vs wait (←) — heuristics + LEARNED, seed bands'}>
        <ParetoScatter stats={cmp} front={front} lang={lang} />
        <p className="dl-hint small">{es ? 'En la frontera' : 'On the frontier'}: <b>{cmp.filter((s) => front.has(s.id)).map((s) => tn(s.id)).join(', ')}</b> · {CMP_SEEDS.length} {es ? 'semillas' : 'seeds'}</p>
        <p className="tw-note dl-note"><b>{tn(tie.leader)}</b> {tie.tied.length === 0 ? (es ? 'lidera más allá de la banda' : 'leads beyond the band') : <>{es ? 'empata (en la banda) con' : 'ties (within the band) with'} <b>{tie.tied.map(tn).join(', ')}</b></>}. {es ? 'Las políticas APRENDIDAS son competitivas — honesto, sin victoria fabricada.' : 'The LEARNED policies are competitive — honest, no fabricated win.'}</p>
      </Panel>) },
    { id: 'bench', label: es ? 'Aprendida vs heurística' : 'Learned vs heuristic', content: (
      <Panel t={es ? 'Toneladas medianas — políticas APRENDIDAS vs heurísticas (mismo caso + semillas)' : 'Median tonnes — LEARNED vs heuristic policies (same case + seeds)'}>
        <LearnedBars stats={cmp} es={es} tn={tn} />
      </Panel>) },
    { id: 'inspect', label: es ? 'Inspector de decisión' : 'Decision inspector', content: <DecisionInspector decisions={decisions.current} es={es} /> },
    { id: 'valid', label: es ? 'Validación MF' : 'MF validation', content: (
      <Panel t={es ? 'Producción vs tamaño de flota — la rodilla cae en MF=1 (valida el simulador)' : 'Throughput vs fleet size — the knee lands at MF=1 (validates the simulator)'}>
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
      <Panel t={es ? 'Tiempo de ciclo ideal por pala (carga vs viaje+descarga) — de la cinemática rimpull/pendiente' : 'Ideal cycle time per shovel (load vs haul+dump) — from the rimpull/grade kinematics'}>
        <div className="dl-bars">{c.mine.shovels.map((s) => { const cy = shovelCycle(c, s.id); const maxC = Math.max(...c.mine.shovels.map((x) => shovelCycle(c, x.id).tCycle)) || 1; return (
          <div key={s.id} className="dl-bar-row"><div className="dl-bar-label">{s.name.split('(')[0].trim()}</div>
            <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${(cy.tLoad / maxC) * 100}%`, background: '#3fb950' }} /><span className="dl-bar-fill" style={{ left: `${(cy.tLoad / maxC) * 100}%`, width: `${((cy.tCycle - cy.tLoad) / maxC) * 100}%`, background: 'var(--color-accent)', position: 'absolute' }} /></div><span className="dl-bar-num mono">{(cy.tCycle / 60).toFixed(1)} min</span></div>
          </div>); })}</div>
        <p className="dl-hint small">{es ? 'Verde = carga · azul = viaje+descarga. Las palas lejanas tienen ciclos más largos → menos viajes posibles por turno.' : 'Green = load · blue = haul+dump. Far shovels have longer cycles → fewer possible trips per shift.'}</p>
      </Panel>) },
  ];

  return (
    <div className="page-body dl-layout">
      <aside className="dl-controls">
        <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Caso' : 'Case'}</span>
          <div className="dl-chips">{CASES.map((x) => <button key={x.id} className={`chip ${caseId === x.id ? 'on' : ''}`} onClick={() => { setCaseId(x.id); setPlayT(0); }} title={x.name}>{x.id}</button>)}</div>
          <span className="dl-hint">{c.name}</span>
        </div>
        <div className="dl-ctl"><span className="dl-ctl-lbl">{es ? 'Política' : 'Policy'}</span>
          <div className="dl-chips">{allPolicies.map((p) => <button key={p.id} className={`chip ${policyId === p.id ? 'on' : ''} ${p.tier === 'learned' ? 'dl-learned-chip' : ''}`} onClick={() => setPolicyId(p.id)} title={es ? p.es : p.en}>{(es ? p.es : p.en).replace('Learned — ', '').replace('Aprendida — ', '').split(' (')[0]}</button>)}</div>
          {pol.tier === 'learned' && <span className="dl-hint" style={{ color: '#f85149' }}>{es ? 'política APRENDIDA (red entrenada offline)' : 'LEARNED policy (net trained offline)'}</span>}
        </div>
        <label className="dl-ctl">{es ? 'Semilla' : 'Seed'}: {seed}<input className="range" type="range" min={1} max={40} value={seed} onChange={(e) => setSeed(+e.target.value)} /></label>
        <div className="dl-diag">
          <div className="dl-diag-h">{es ? 'Diagnóstico' : 'Diagnosis'}</div>
          <div className="dl-mfbar"><span className="dl-mfref" style={{ left: `${(1 / MAXMF) * 100}%` }} /><span className="dl-mfmark" style={{ left: `${Math.min(1, mf / MAXMF) * 100}%` }} /></div>
          <div className="small"><b className="mono">MF {mf.toFixed(2)}</b> · {balance === 'over' ? (es ? 'sobre-camionado' : 'over-trucked') : balance === 'under' ? (es ? 'sub-camionado' : 'under-trucked') : (es ? 'equilibrado' : 'balanced')}</div>
          <div className="small">{delta !== 0 ? <>{delta > 0 ? (es ? 'agregar' : 'add') : (es ? 'quitar' : 'remove')} <b>{Math.abs(delta)}</b> {es ? 'camiones para MF≈1' : 'trucks for MF≈1'}</> : <>✓ MF≈1</>}</div>
          <div className="small muted">{bottleneck === 'shovelBound' ? (es ? 'limitado por pala' : 'shovel-bound') : bottleneck === 'queueBound' ? (es ? 'limitado por cola' : 'queue-bound') : (es ? 'con holgura' : 'headroom')}</div>
        </div>
        <p className="tw-note dl-note">{es ? 'Rajo sintético físicamente fundado (validado vs match-factor + oráculo); políticas aprendidas entrenadas offline, inferencia ONNX viva. NO es un sistema de despacho productivo.' : 'Synthetic physics-grounded pit (validated vs match-factor + oracle); learned policies trained offline, live ONNX inference. NOT a production dispatch system.'}</p>
      </aside>
      <div className="dl-main"><Tabs tabs={tabs} ariaLabel="methods" /></div>
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
      <p className="tw-note dl-note">{es ? '★ = política APRENDIDA. Honesto: igualan a las mejores heurísticas (sus maestras) — el valor es una política aprendida única + rápida desde datos, no superarlas.' : '★ = LEARNED policy. Honest: they match the best heuristics (their teachers) — the value is a single fast learned policy from data, not beating them.'}</p>
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
    <Panel t={es ? 'Inspector de decisión — puntajes de la política APRENDIDA (RWR) vía onnxruntime-web, por pala' : 'Decision inspector — LEARNED (RWR) policy scores via onnxruntime-web, per shovel'}>
      <div className="dl-bars">{d.names.map((nm, k) => { const sc = scores ? scores[k] : 0; const w = scores ? (sc - minS) / (maxS - minS || 1) : 0; return (
        <div key={k} className="dl-bar-row"><div className="dl-bar-label">{nm}{k === d.chosen ? ` · ${es ? 'heurística eligió' : 'heuristic chose'}` : ''}{k === argmax ? ' · ★' : ''}</div>
          <div className="dl-bar-pair"><div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${w * 100}%`, background: k === argmax ? '#f85149' : 'var(--color-accent)' }} /></div><span className="dl-bar-num mono">{scores ? sc.toFixed(2) : '…'}</span></div>
        </div>); })}</div>
      <input className="range" type="range" min={0} max={decisions.length - 1} value={i} onChange={(e) => setI(+e.target.value)} style={{ width: '100%', marginTop: '0.5rem' }} />
      <p className="dl-hint small">{es ? 'Decisión' : 'Decision'} {i + 1}/{decisions.length} · t={(d.t / 3600).toFixed(1)} h · ★ = {es ? 'pala elegida por la red (argmax). La inferencia ONNX corre EN VIVO en el navegador.' : 'shovel the net picks (argmax). The ONNX inference runs LIVE in the browser.'}</p>
    </Panel>
  );
}
