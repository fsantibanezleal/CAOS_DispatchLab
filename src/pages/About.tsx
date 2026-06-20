import { useShellLang } from '@fasl-work/caos-app-shell';

export default function About() {
  const es = useShellLang() === 'es';
  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es ? 'Acerca' : 'About'}</h1>
        <p className="lede">{es
          ? 'DispatchLab es un banco didáctico y transparente para comparar políticas de despacho camión-pala en un rajo simulado.'
          : 'DispatchLab is a didactic, transparent bench for comparing truck-shovel dispatch policies on a simulated open pit.'}</p>
      </div>
      <section>
        <h2>{es ? 'Qué es — y qué no es' : 'What it is — and is not'}</h2>
        <p>{es
          ? 'ES un sandbox de comparación de políticas: una simulación de eventos discretos determinista de un rajo, con física de camiones (rimpull/pendiente), tiempos de carga estocásticos y un conjunto de políticas que van de heurísticas simples a optimización exacta. NO es un sistema de despacho productivo (Modular DISPATCH, Wenco, MineStar) ni un rastreo en planta: nunca se ha validado contra una mina real, porque no existe un benchmark público con verdad de terreno de los registros de ciclo.'
          : 'It IS a policy-comparison sandbox: a deterministic discrete-event simulation of an open pit, with truck physics (rimpull/grade), stochastic load times and a policy set spanning simple heuristics to exact optimisation. It is NOT a production dispatch system (Modular DISPATCH, Wenco, MineStar) nor in-plant tracking: it has never been validated against a real mine, because no public ground-truthed cycle-log benchmark exists.'}</p>
        <h2>{es ? 'Honestidad de datos' : 'Data honesty'}</h2>
        <p>{es
          ? 'Toda la mina es sintética pero físicamente fundada, y se valida contra el match factor de forma cerrada y los controles oráculo. Cada corrida lleva su semilla; cada cantidad aproximada se etiqueta como aproximada. El código es abierto.'
          : 'The whole mine is synthetic but physics-grounded, and validated against the closed-form match factor and oracle controls. Every run carries its seed; every approximate quantity is labelled approximate. The code is open source.'}</p>
        <p className="muted small">{es ? 'Parte del hub de analítica minera Faena.' : 'Part of the Faena mining-analytics hub.'}</p>
      </section>
    </div>
  );
}
