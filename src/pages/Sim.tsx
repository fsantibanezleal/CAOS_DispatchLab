import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type uPlot from 'uplot';
import { useShellLang } from '@fasl-work/caos-app-shell';
import { runSimulation } from '../sim/model';
import { analyticalMatchFactor } from '../sim/matchfactor';
import { CASES, caseById } from '../sim/cases';
import { POLICIES, policyById } from '../policies/heuristics';
import { PitMap } from '../viz/PitMap';
import { UPlotChart } from '../viz/UPlotChart';
import { lineOpts } from '../viz/uplotKit';

const SPEEDS = [200, 600, 1800];
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const T = {
  en: { case: 'Case', policy: 'Policy', seed: 'Seed', play: 'Play', pause: 'Pause', speed: 'Speed',
    tonnes: 'Tonnes moved', mf: 'Match factor', util: 'Mean shovel util', wait: 'Truck wait',
    feed: 'Crusher feed — cumulative tonnes vs shift hour', diag: 'Diagnosis', perShovel: 'Per-shovel loads & utilisation',
    over: 'Over-trucked — trucks queue at shovels', under: 'Under-trucked — shovels sit idle', bal: 'Balanced — fleet matched to shovels',
    suggest: 'to reach MF≈1', addT: 'add', remT: 'remove', trucksW: 'trucks', truckW: 'truck', shovelBound: 'shovel-bound (shovels saturated)',
    queueBound: 'queue-bound (trucks waiting)', headroom: 'headroom (neither resource saturated)',
    note: 'A policy-comparison sandbox on a synthetic, physics-grounded pit — NOT a production dispatch system, never validated on a real mine. Every run is deterministic in the seed.' },
  es: { case: 'Caso', policy: 'Política', seed: 'Semilla', play: 'Reproducir', pause: 'Pausa', speed: 'Velocidad',
    tonnes: 'Toneladas movidas', mf: 'Match factor', util: 'Util. media de pala', wait: 'Espera de camión',
    feed: 'Alimentación al chancador — toneladas acumuladas vs hora de turno', diag: 'Diagnóstico', perShovel: 'Cargas y utilización por pala',
    over: 'Sobre-camionado — los camiones hacen cola', under: 'Sub-camionado — las palas quedan ociosas', bal: 'Equilibrado — flota ajustada a las palas',
    suggest: 'para llegar a MF≈1', addT: 'agregar', remT: 'quitar', trucksW: 'camiones', truckW: 'camión', shovelBound: 'limitado por pala (palas saturadas)',
    queueBound: 'limitado por cola (camiones esperando)', headroom: 'con holgura (ningún recurso saturado)',
    note: 'Un sandbox de comparación de políticas sobre un rajo sintético físicamente fundado — NO un sistema de despacho productivo, nunca validado en una mina real. Cada corrida es determinista en la semilla.' },
};

export default function Sim() {
  const lang = useShellLang(); const es = lang === 'es'; const t = T[lang];
  const [caseId, setCaseId] = useState('C05');
  const [policyId, setPolicyId] = useState('greedy');
  const [seed, setSeed] = useState(7);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(600);
  const [playT, setPlayT] = useState(0);

  const c = caseById(caseId);
  const pol = policyById(policyId);
  const result = useMemo(() => runSimulation(c, pol.fn, seed, { trace: true }), [c, pol, seed]);
  const mf = useMemo(() => analyticalMatchFactor(c), [c]);
  const shiftSec = c.shiftSec;

  // playback clock
  const raf = useRef(0); const last = useRef(0); const ptRef = useRef(0);
  useEffect(() => { ptRef.current = playT; }, [playT]);
  useEffect(() => {
    if (!playing) return;
    last.current = 0;
    const tick = (ts: number) => {
      if (!last.current) last.current = ts;
      const dt = (ts - last.current) / 1000; last.current = ts;
      let nt = ptRef.current + dt * speed;
      if (nt >= shiftSec) nt = 0;
      ptRef.current = nt; setPlayT(nt);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, shiftSec]);

  // KPIs
  const tonnes = result.tonnes;
  const truckWaitH = result.truckWaitSec / 3600;
  const meanUtil = result.meanShovelUtil;
  const nTrucks = c.fleet.trucks.length;
  const targetN = mf > 0 ? nTrucks / mf : nTrucks;
  const delta = Math.round(targetN - nTrucks);
  const balance = mf > 1.1 ? 'over' : mf < 0.9 ? 'under' : 'bal';
  const bottleneck = meanUtil > 0.95 ? 'shovelBound' : truckWaitH > nTrucks * 0.15 ? 'queueBound' : 'headroom';

  // crusher feed series (hours, tonnes)
  const feed = useMemo<uPlot.AlignedData>(() => {
    const xs = result.crusherFeed.map((p) => p.t / 3600), ys = result.crusherFeed.map((p) => p.tonnes);
    return [xs, ys];
  }, [result]);
  const buildFeed = useCallback((w: number, h: number) => {
    const o = lineOpts(w, h, { label: es ? 'ton' : 't', color: '#d29922', xUnit: 'h', yUnit: 't', xPrec: 1, yPrec: 0 });
    o.axes![1].values = (_u, vals) => vals.map((v) => (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : String(v)));
    o.axes![1].size = 38;
    return o;
  }, [es]);

  const MAXMF = 2.2;
  const mfPct = Math.min(1, mf / MAXMF);

  return (
    <div className="page-body dl-layout">
      <aside className="dl-controls">
        <div className="dl-ctl"><span>{t.case}</span>
          <div className="dl-chips">{CASES.map((x) => <button key={x.id} className={`chip ${caseId === x.id ? 'on' : ''}`} onClick={() => { setCaseId(x.id); setPlayT(0); }} title={x.name}>{x.id}</button>)}</div>
          <div className="muted small">{c.name}</div>
        </div>
        <div className="dl-ctl"><span>{t.policy}</span>
          <div className="dl-chips">{POLICIES.map((p) => <button key={p.id} className={`chip ${policyId === p.id ? 'on' : ''}`} onClick={() => setPolicyId(p.id)} title={es ? p.es : p.en}>{(es ? p.es : p.en).split(' (')[0]}</button>)}</div>
        </div>
        <label className="dl-ctl">{t.seed}: {seed}
          <input className="range" type="range" min={1} max={40} step={1} value={seed} onChange={(e) => setSeed(+e.target.value)} />
        </label>
        <div className="dl-ctl dl-play">
          <button className="chip on" onClick={() => setPlaying((p) => !p)}>{playing ? `❚❚ ${t.pause}` : `▶ ${t.play}`}</button>
          <select className="dl-sel" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label={t.speed}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </div>
        <input className="range dl-scrub" type="range" min={0} max={shiftSec} step={60} value={playT} onChange={(e) => { setPlayT(+e.target.value); ptRef.current = +e.target.value; }} />
        <div className="small muted dl-clock">{(playT / 3600).toFixed(2)} h / {(shiftSec / 3600).toFixed(0)} h</div>

        <div className="dl-diag card">
          <div className="dl-diag-h">{t.diag}</div>
          <div className="dl-mfgauge">
            <div className="dl-mfbar">
              <span className="dl-mfzone ok" />
              <span className="dl-mfref" style={{ left: `${(1 / MAXMF) * 100}%` }} />
              <span className="dl-mfmark" style={{ left: `${mfPct * 100}%` }} />
            </div>
            <div className="small"><b className="mono">MF {mf.toFixed(2)}</b> · {balance === 'over' ? t.over : balance === 'under' ? t.under : t.bal}</div>
          </div>
          <div className="small">{delta !== 0 ? <><b>{delta > 0 ? t.addT : t.remT} {Math.abs(delta)}</b> {Math.abs(delta) === 1 ? t.truckW : t.trucksW} {t.suggest}</> : <>✓ {t.suggest}</>}</div>
          <div className="small muted">{t[bottleneck as 'shovelBound' | 'queueBound' | 'headroom']}</div>
        </div>
      </aside>

      <div className="dl-main">
        <PitMap c={c} result={result} t={playT} lang={lang} />
        <div className="dl-kpis">
          <div className="dl-kpi"><div className="dl-kpi-v">{fmt(tonnes)}</div><div className="dl-kpi-l">{t.tonnes} (t)</div></div>
          <div className="dl-kpi"><div className="dl-kpi-v">{mf.toFixed(2)}</div><div className="dl-kpi-l">{t.mf}</div></div>
          <div className="dl-kpi"><div className="dl-kpi-v">{(meanUtil * 100).toFixed(0)}%</div><div className="dl-kpi-l">{t.util}</div></div>
          <div className="dl-kpi"><div className="dl-kpi-v">{truckWaitH.toFixed(1)}</div><div className="dl-kpi-l">{t.wait} (h)</div></div>
        </div>

        <div className="dl-panel">
          <div className="dl-panel-t">{t.perShovel}</div>
          <div className="dl-shovels">
            {result.shovels.map((s) => (
              <div key={s.id} className="dl-shovel">
                <div className="small"><b>{s.name.split('(')[0].trim()}</b> · {s.served} {es ? 'cargas' : 'loads'} · {(s.util * 100).toFixed(0)}%</div>
                <div className="dl-ubar"><span style={{ width: `${s.util * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="dl-panel"><div className="dl-panel-t">{t.feed}</div><UPlotChart data={feed} build={buildFeed} height={150} /></div>
        <p className="hint dl-note">{t.note}</p>
      </div>
    </div>
  );
}
