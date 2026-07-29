// ADR-0070 scenario focus view: one selected scenario, full page, nothing competing with the stage.
//
// ADDITIVE. The App (Tool.tsx) keeps every tab and all its explanation; this route is a second way to
// look at the SAME scenario through the SAME simulation, for operating it rather than reading about it.
// It renders OUTSIDE <AppShell> on purpose: the shell header and footer are exactly the chrome a focus
// view exists to escape.
//
// Style per the ADR-0070 spec: fixed full-viewport two-column grid with the rail on the right; stage at
// least 80% of the viewport, edge to edge; the state NAMED on the stage with one plain sentence; KPIs
// overlaid as a HUD column rather than stacked as cards; a mode toggle for parameter density; a visible
// return that lands back on the App with this scenario selected; starts PAUSED.

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useShellLang } from '@fasl-work/caos-app-shell';
import { CASES, caseById } from '../sim/cases';
import { runSimulation } from '../sim/model';
import { POLICIES, policyById } from '../policies/heuristics';
import { analyticalMatchFactor } from '../sim/matchfactor';
import { Pit3D } from '../viz/Pit3D';
import { PitMap } from '../viz/PitMap';

/** What the match factor MEANS, said on the stage. A user should be able to read the operating state
 *  off the visualization without leaving for a docs tab. */
function mfState(mf: number, es: boolean): { label: string; text: string } {
  if (mf < 0.85) {
    return {
      label: es ? 'Flota insuficiente' : 'Truck-limited',
      text: es
        ? 'Hay menos camiones de los que las palas pueden cargar: las palas esperan y la capacidad de carga se desperdicia.'
        : 'There are fewer trucks than the shovels can load: shovels wait and loading capacity is wasted.',
    };
  }
  if (mf > 1.15) {
    return {
      label: es ? 'Palas saturadas' : 'Shovel-limited',
      text: es
        ? 'Hay mas camiones de los que las palas pueden atender: se forman colas en las palas y el ciclo se alarga.'
        : 'There are more trucks than the shovels can serve: queues build at the shovels and cycle time stretches.',
    };
  }
  return {
    label: es ? 'Flota equilibrada' : 'Matched fleet',
    text: es
      ? 'Camiones y palas estan aproximadamente equilibrados: poca espera en ambos lados, que es donde vive el rendimiento.'
      : 'Trucks and shovels are roughly balanced: little waiting on either side, which is where throughput lives.',
  };
}

export default function Focus() {
  const { caseId } = useParams();
  const lang = useShellLang();
  const es = lang === 'es';
  const theCase = useMemo(() => caseById(caseId ?? CASES[0].id), [caseId]);

  const [policyId, setPolicyId] = useState('greedy');
  const [seed, setSeed] = useState(7);
  const [view, setView] = useState<'3d' | 'map'>('3d');
  const [playing, setPlaying] = useState(false);   // starts PAUSED: no autoplay compute bomb
  const [t, setT] = useState(0);
  const [advanced, setAdvanced] = useState(false);

  // Selecting a different scenario must actually change the scenario. Re-seed on case change, or the
  // chips move the URL and the title while the simulation stays exactly as it was.
  useEffect(() => { setT(0); setPlaying(false); }, [theCase.id]);

  const pol = useMemo(() => policyById(policyId) ?? POLICIES[0], [policyId]);
  const result = useMemo(
    () => runSimulation(theCase, pol.fn, seed, { trace: true }),
    [theCase, pol, seed],
  );
  const mf = useMemo(() => analyticalMatchFactor(theCase), [theCase]);
  const state = mfState(mf, es);

  // clock
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setT((v) => (v + dt * 60) % Math.max(1, theCase.shiftSec));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, theCase.shiftSec]);

  // A physics or animation loop left running on a hidden tab is a compute bomb.
  useEffect(() => {
    const onVis = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // SimResult carries flat fields; there is no `kpis` object. Truck utilisation is derived from the
  // measured wait against the shift, which is what the App's own KPI row does.
  const nTrucks = theCase.fleet.trucks.length;
  const truckUtil = Math.max(0, 1 - result.truckWaitSec / Math.max(1, theCase.shiftSec * nTrucks));
  const hud = [
    { v: `${result.tonnes.toFixed(0)}`, l: es ? 't movidas' : 'tonnes moved', tone: 'accent' },
    { v: `${mf.toFixed(2)}`, l: 'match factor', tone: 'blue' },
    { v: `${(truckUtil * 100).toFixed(0)}%`, l: es ? 'uso camion' : 'truck util' },
    { v: `${(result.meanShovelUtil * 100).toFixed(0)}%`, l: es ? 'uso pala' : 'shovel util' },
    { v: `${(result.truckWaitSec / 60).toFixed(0)} min`, l: es ? 'espera total' : 'total wait' },
    { v: `${result.shovels.length}`, l: es ? 'palas' : 'shovels' },
    { v: `${nTrucks}`, l: es ? 'camiones' : 'trucks' },
    { v: `${(theCase.shiftSec / 3600).toFixed(1)} h`, l: es ? 'turno' : 'shift' },
  ];

  return (
    <div className="dlf">
      <div className="dlf-stage">
        {view === '3d'
          ? <Pit3D c={theCase} result={result} t={t} lang={es ? 'es' : 'en'} playing={playing} />
          : <PitMap c={theCase} result={result} t={t} lang={es ? 'es' : 'en'} />}

        <div className="dlf-badge">
          <div className="dlf-badge-t">{state.label}</div>
          <div className="dlf-badge-d">{state.text}</div>
        </div>

        <div className="dlf-hud">
          {hud.map((h) => (
            <div className="dlf-hud-item" key={h.l}>
              <div className={`dlf-hud-v${h.tone ? ' ' + h.tone : ''}`}>{h.v}</div>
              <div className="dlf-hud-l">{h.l}</div>
            </div>
          ))}
        </div>

        <Link className="dlf-exit" to="/">{es ? 'Volver a la app' : 'Back to the app'}</Link>
      </div>

      <aside className="dlf-rail">
        <div className="dlf-rail-h">
          <div>
            <div className="dlf-title">{theCase.name}</div>
            <div className="dlf-sub">{theCase.id}</div>
          </div>
          <button className="dlf-mode" onClick={() => setAdvanced((a) => !a)}>
            {advanced ? (es ? 'Basico' : 'Basic') : (es ? 'Avanzado' : 'Advanced')}
          </button>
        </div>

        <div className="dlf-seg">
          <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>{es ? 'Pit 3D' : 'Pit 3D'}</button>
          <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>{es ? 'Mapa' : 'Map'}</button>
        </div>

        <div className="dlf-seg">
          <button className={playing ? 'on' : ''} onClick={() => setPlaying((v) => !v)}>
            {playing ? (es ? 'Pausar' : 'Pause') : (es ? 'Reproducir' : 'Play')}
          </button>
          <button onClick={() => { setT(0); setPlaying(false); }}>{es ? 'Reiniciar' : 'Reset'}</button>
        </div>

        <label className="dlf-ctl">
          <span className="dlf-ctl-l">{es ? 'Momento del turno' : 'Time in shift'}
            <b>{(t / 3600).toFixed(2)} h</b></span>
          <input type="range" min={0} max={theCase.shiftSec} step={60} value={t}
                 onChange={(e) => { setPlaying(false); setT(+e.target.value); }} />
        </label>

        <div className="dlf-lbl">{es ? 'Politica de despacho' : 'Dispatch policy'}</div>
        <select className="dlf-select" value={policyId} onChange={(e) => setPolicyId(e.target.value)}
                aria-label={es ? 'politica' : 'policy'}>
          {POLICIES.map((p) => (
            <option key={p.id} value={p.id}>{(es ? p.es : p.en).split(' (')[0]}</option>
          ))}
        </select>

        {advanced && (
          <label className="dlf-ctl">
            <span className="dlf-ctl-l">{es ? 'Semilla' : 'Seed'}<b>{seed}</b></span>
            <input type="range" min={1} max={40} step={1} value={seed}
                   onChange={(e) => setSeed(+e.target.value)} />
          </label>
        )}

        <div className="dlf-note">
          {es
            ? 'El match factor compara la capacidad de carga de las palas con la capacidad de acarreo de la flota. Bajo 0.85 sobran palas, sobre 1.15 sobran camiones y se forman colas. La simulacion es de eventos discretos sobre la topologia real del rajo.'
            : 'The match factor compares shovel loading capacity against fleet hauling capacity. Below 0.85 the shovels wait, above 1.15 the trucks queue. The simulation is discrete-event over the pit topology.'}
        </div>

        <div className="dlf-cases">
          {CASES.slice(0, 10).map((cc) => (
            <Link key={cc.id} to={`/focus/${cc.id}`} className={cc.id === theCase.id ? 'on' : ''}>{cc.id}</Link>
          ))}
        </div>
      </aside>
    </div>
  );
}
