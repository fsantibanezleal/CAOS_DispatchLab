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
        <p>{es ? 'Ocho casos multi-fuente / multi-destino con un modelo de flujo de material correcto (mineral->chancador, mineral->acopio (rehandle), estéril->botadero; retorno vacío al punto->pala; el acopio->planta es la recuperadora). Cada rajo tiene una SALIDA/portal por la que pasa todo transporte (pala->caminos internos->portal->tramo directo->destino). Tres casos SIMPLES de enseñanza (C01-C03: >= 4 palas, >= 2 destinos, ruteo + match factor + la decisión de dos plantas); el resto son COMPLEJOS y DINÁMICOS (>= 6 palas hasta 12, un ACOPIO de mineral que se cicla activamente por rehandle + recuperadora, varias plantas + botaderos, más fallas / ciclos estocásticos / ventanas de mezcla / fases). C08 es el showcase de 12 palas y 3 fases. La compuerta de cobertura de ejes (axisCoverage.test.ts) falla la build si el corpus se degrada a juguete.' : 'Eight multi-source / multi-destination cases with a domain-correct material-flow model (ore->crusher, ore->stockpile (rehandle), waste->waste dump; empty return delivery-point->shovel; stockpile->plant is the reclaimer). Every pit has an EXIT/portal all haulage passes through (shovel->internal pit roads->portal->a direct haul->destination). Three SIMPLE teaching cases (C01-C03: >= 4 shovels, >= 2 destinations, routing + match factor + the two-plant decision); the rest are COMPLEX and DYNAMIC (>= 6 shovels scaling to 12, an ore STOCKPILE actively cycled by rehandle + a reclaimer, multiple plants + waste dumps, plus breakdowns / stochastic cycles / blend windows / phases). C08 is the 12-shovel, 3-phase showcase. The axis-coverage gate (axisCoverage.test.ts) fails the build if the corpus regresses to a toy.'}</p>
        <table className="cmp-table">
          <thead><tr><th className="lo">{es ? 'Caso' : 'Case'}</th><th>{es ? 'Palas' : 'Shovels'}</th><th>{es ? 'Destinos' : 'Destinations'}</th><th>{es ? 'Acopio cicla' : 'Stockpile cycles'}</th><th>{es ? 'Rasgo' : 'Trait'}</th></tr></thead>
          <tbody>
            {([
              ['C01', 4, es ? 'chancador + botadero' : 'crusher + waste', false, es ? 'simple: ruteo mineral/estéril (rajo somero)' : 'simple: ore/waste routing (shallow pit)'],
              ['C02', 4, es ? '2 plantas' : '2 plants', false, es ? 'simple: decisión de dos plantas' : 'simple: two-plant decision'],
              ['C03', 4, es ? 'chancador + botadero' : 'crusher + waste', false, es ? 'simple: caminos asimétricos (el despacho importa)' : 'simple: asymmetric roads (dispatch matters)'],
              ['C04', 6, es ? 'chancador + botadero + acopio' : 'crusher + waste + stockpile', true, es ? 'rajo profundo estrecho + ciclos estocásticos' : 'deep narrow pit + stochastic cycles'],
              ['C05', 8, es ? 'chancador + botadero + acopio' : 'crusher + waste + stockpile', true, es ? 'rajo somero amplio (limitan las palas)' : 'shallow wide pit (shovel-bound)'],
              ['C06', 8, es ? '2 plantas + botadero + acopio' : '2 plants + waste + stockpile', true, es ? 'falla de pala + flota mixta 793F+930E' : 'breakdown + mixed 793F+930E fleet'],
              ['C07', 8, es ? 'chancador + botadero + acopio' : 'crusher + waste + stockpile', true, es ? 'planta lenta: rehandle intenso + mezcla' : 'slow plant: heavy rehandle + blend'],
              ['C08', 12, es ? '2 plantas + 2 botaderos + acopio' : '2 plants + 2 waste + stockpile', true, es ? 'jefe: 3 fases, todo tipo de nodo + toda dinámica' : 'boss: 3 phases, every node type + every dynamic'],
            ] as [string, number, string, boolean, string][]).map(([id, n, dest, cyc, ax]) => (
              <tr key={id}><th className="lo">{id}</th><td className="mono">{n}</td><td>{dest}</td><td className="mono">{cyc ? (es ? 'sí' : 'yes') : '-'}</td><td>{ax}</td></tr>))}
          </tbody>
        </table>

        <h2>{es ? 'Validación del simulador (match factor)' : 'Simulator validation (match factor)'}</h2>
        <p>{es ? 'El simulador se valida contra la teoría cerrada del match factor: al barrer el tamaño de la flota, la producción escala mientras MF<1 y SATURA al cruzar MF=1 (la rodilla de sobre-camionamiento cae en MF≈1). La pestaña «Validación MF» del banco lo muestra en vivo. El oráculo cerrado 1×1 y los controles de empate/positivo viven como fixtures de test.' : 'The simulator is validated against closed-form match-factor theory: sweeping the fleet size, throughput scales while MF<1 and SATURATES as MF crosses 1 (the over-trucking knee lands at MF≈1). The bench\'s "MF validation" tab shows this live. The closed-form 1x1 oracle + the tie/positive controls live as test fixtures.'}</p>
        <p>{es ? 'El tráfico en la ruta (límite de velocidad, seguimiento con bunching, cruce en doble vía) hace que el tiempo de ciclo EMERJA en vez de ser un valor fijo: alarga el ciclo bajo carga y desplaza la rodilla del match factor, exactamente el efecto de congestión que un banco realista debe mostrar. El oráculo de capacidad respeta el mismo límite de velocidad para seguir siendo cota superior válida (test), y model.ts y rolloutSim.ts comparten las reglas byte a byte (test de paridad).' : 'Haul-road traffic (speed limit, car-following bunching, two-way meeting) makes the cycle time EMERGE rather than be a fixed value: it lengthens the cycle under load and shifts the match-factor knee, exactly the congestion effect a realistic bench must show. The capacity oracle respects the same speed limit so it stays a valid upper bound (tested), and model.ts and rolloutSim.ts share the rules byte-for-byte (parity test).'}</p>

        <h2>{es ? 'Honestidad' : 'Honesty'}</h2>
        <p>{es ? 'Sin fuga (split de decisiones train/eval); sin números fabricados (la fidelidad sale de los artefactos, las toneladas de la simulación). Las políticas aprendidas se entrenan sobre el MISMO simulador que las evalúa, igualan a las mejores heurísticas pero no las superan, y se dice. Los resultados aprendido-vs-heurística están en la página Benchmark.' : 'No leakage (train/eval decision split); no fabricated numbers (fidelity from the artifacts, tonnes from the simulation). The learned policies train on the SAME simulator that evaluates them, they match the best heuristics but do not beat them, and we say so. The learned-vs-heuristic results are on the Benchmark page.'}</p>
        <Refs ids={['morgan1968', 'burt2007', 'soofastaei2016', 'peters2007']} label="Refs" />
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
