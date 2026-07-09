import { useEffect, useState } from 'react';
import { Refs, useShellLang } from '@fasl-work/caos-app-shell';
import { loadLearnedMeta, type LearnedMeta } from '../policies/learnedRegistry';

export default function Experiments() {
  const es = useShellLang() === 'es';
  const [m, setM] = useState<LearnedMeta | null>(null);
  useEffect(() => { loadLearnedMeta().then(setM).catch(() => {}); }, []);
  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es ? 'Experimentos' : 'Experiments'}</h1>
        <p className="lede">{es ? 'El diseño experimental honesto, ILUSTRADO: el split sin fuga del dataset de decisiones, la cobertura de casos, y la validación del simulador contra la teoría del match factor.' : 'The honest experimental design, ILLUSTRATED: the leakage-safe split of the decision dataset, the case coverage, and the validation of the simulator against match-factor theory.'}</p>
      </div>
      <section>
        <h2>{es ? 'Dataset + split sin fuga' : 'Dataset + leakage-safe split'}</h2>
        <p>{es ? 'El DES real se corre sobre los casos multi-pala × 12 semillas × las políticas de referencia, logueando la matriz de features por pala + la acción + las toneladas del episodio. Las decisiones se separan en entrenamiento y evaluación de forma determinista, así que la fidelidad de imitación se mide sobre decisiones NO usadas en el entrenamiento.' : 'The real DES is run over the multi-shovel cases × 12 seeds × the reference policies, logging the per-shovel feature matrix + the action + the episode tonnes. The decisions are split into train and eval deterministically, so the imitation fidelity is measured on decisions NOT used in training.'}</p>
        {m && (
          <div className="tw-stats">
            <Stat v={`${(m.nTrain / 1000).toFixed(1)}k`} l={es ? 'decisiones de entrenamiento' : 'training decisions'} />
            <Stat v={`${(m.nEval / 1000).toFixed(1)}k`} l={es ? 'decisiones de evaluación' : 'evaluation decisions'} />
            <Stat v={`${(m.policyImitAcc * 100).toFixed(0)}%`} l={es ? 'fidelidad RWR (held-out)' : 'RWR fidelity (held-out)'} />
            <Stat v={`${(m.bcBestImitAcc * 100).toFixed(0)}%`} l={es ? 'fidelidad BC-best' : 'BC-best fidelity'} />
          </div>
        )}
        <SplitSVG es={es} />

        <h2>{es ? 'Cobertura de casos' : 'Case coverage'}</h2>
        <p>{es ? 'Dieciséis casos multi-fuente / multi-destino. El piso es >= 4 palas (los únicos casos sub-4 son los controles: barrido MF de una pala C01-C03 y el oráculo 1x1 C12). El mineral va al chancador, el estéril a botadero; C07 corre dos plantas; C13/C14 agregan tolvas del chancador (1-2) y un acopio (rehandle + recuperación); C11/C14 usan flota mixta 793F+930E. La compuerta de cobertura de ejes (axisCoverage.test.ts) falla la build si falta alguna primitiva.' : 'Sixteen multi-source / multi-destination cases. The floor is >= 4 shovels (the only sub-4 cases are the controls: single-shovel MF sweep C01-C03 and the 1x1 oracle C12). Ore routes to the crusher, waste to a waste dump; C07 runs two plants; C13/C14 add crusher receiving bays (1-2) and a stockpile (rehandle + reclaim); C11/C14 run a mixed 793F+930E fleet. The axis-coverage gate (axisCoverage.test.ts) fails the build if any primitive is missing.'}</p>
        <table className="cmp-table">
          <thead><tr><th className="lo">{es ? 'Caso' : 'Case'}</th><th>{es ? 'Palas' : 'Shovels'}</th><th>{es ? 'Eje' : 'Axis'}</th></tr></thead>
          <tbody>
            {([['C01', 1, es ? 'balanceado (control)' : 'balanced (control)'], ['C02', 1, es ? 'sobre-camionado' : 'over-trucked'], ['C03', 1, es ? 'sub-camionado' : 'under-trucked'], ['C04', 4, es ? 'simétrico (control empate)' : 'symmetric (tie control)'], ['C05', 4, es ? 'asimétrico (control positivo)' : 'asymmetric (positive control)'], ['C06', 4, es ? 'mineral + estéril (2 destinos)' : 'ore + waste (2 destinations)'], ['C07', 4, es ? 'dos chancadores' : 'two crushers'], ['C08', 4, es ? 'rampas 8% profundas (limita la flota)' : 'deep 8% ramps (truck-bound)'], ['C09', 4, es ? 'rajo somero (limitan las palas)' : 'shallow pit (shovel-bound)'], ['C10', 4, es ? 'chancador limitado (2.6 kt/h)' : 'crusher-limited (2.6 kt/h)'], ['C11', 4, es ? 'flota mixta 793F+930E' : 'mixed fleet 793F+930E'], ['C12', 1, es ? 'oráculo 1×1' : '1×1 oracle'], ['C13', 4, es ? 'tolvas + acopio (rehandle)' : 'bays + stockpile (rehandle)'], ['C14', 6, es ? 'jefe: 2 fases, 3 destinos, flota mixta' : 'boss: 2 phases, 3 dumps, mixed fleet'], ['C15', 4, es ? 'ciclos estocásticos' : 'stochastic cycles'], ['C16', 4, es ? 'fallas de pala' : 'shovel breakdowns']] as [string, number, string][]).map(([id, n, ax]) => (
              <tr key={id}><th className="lo">{id}</th><td className="mono">{n}</td><td>{ax}</td></tr>))}
          </tbody>
        </table>

        <h2>{es ? 'Validación del simulador (match factor)' : 'Simulator validation (match factor)'}</h2>
        <p>{es ? 'El simulador se valida contra la teoría cerrada del match factor: al barrer el tamaño de la flota, la producción escala mientras MF<1 y SATURA al cruzar MF=1 (la rodilla de sobre-camionamiento cae en MF≈1). La pestaña «Validación MF» del banco lo muestra en vivo. Los controles oráculo (1×1) dan la respuesta exacta.' : 'The simulator is validated against closed-form match-factor theory: sweeping the fleet size, throughput scales while MF<1 and SATURATES as MF crosses 1 (the over-trucking knee lands at MF≈1). The bench\'s "MF validation" tab shows this live. The oracle controls (1×1) give the exact answer.'}</p>

        <h2>{es ? 'Honestidad' : 'Honesty'}</h2>
        <p>{es ? 'Sin fuga (split de decisiones train/eval); sin números fabricados (la fidelidad sale de los artefactos, las toneladas de la simulación). Las políticas aprendidas se entrenan sobre el MISMO simulador que las evalúa, igualan a las mejores heurísticas pero no las superan, y se dice. Los resultados aprendido-vs-heurística están en la página Benchmark.' : 'No leakage (train/eval decision split); no fabricated numbers (fidelity from the artifacts, tonnes from the simulation). The learned policies train on the SAME simulator that evaluates them, they match the best heuristics but do not beat them, and we say so. The learned-vs-heuristic results are on the Benchmark page.'}</p>
        <Refs ids={['morgan1968', 'burt2007', 'peters2007']} label="Refs" />
      </section>
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) { return <div className="tw-stat"><div className="tw-stat-v">{v}</div><div className="tw-stat-l">{l}</div></div>; }

function SplitSVG({ es }: { es: boolean }) {
  return (
    <svg viewBox="0 0 600 70" width="100%" style={{ maxWidth: 600, display: 'block', margin: '0.5rem 0', font: '11px var(--font-sans, sans-serif)' }} role="img" aria-label={es ? 'Split del dataset' : 'Dataset split'}>
      <rect x="10" y="20" width="435" height="26" rx="4" fill="color-mix(in oklab, var(--color-accent) 22%, var(--color-surface))" stroke="var(--color-border)" />
      <rect x="447" y="20" width="143" height="26" rx="4" fill="color-mix(in oklab, #d29922 30%, var(--color-surface))" stroke="var(--color-border)" />
      <text x="227" y="37" textAnchor="middle" fill="var(--color-fg)">{es ? '≈75% entrenamiento' : '≈75% train'}</text>
      <text x="518" y="37" textAnchor="middle" fill="var(--color-fg)">{es ? '≈25% eval' : '≈25% eval'}</text>
      <text x="10" y="62" fill="var(--color-fg-subtle)">{es ? 'decisiones de despacho, separadas determinísticamente, la fidelidad se mide sólo en eval' : 'dispatch decisions, split deterministically, fidelity measured only on eval'}</text>
    </svg>
  );
}
