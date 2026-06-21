import { Refs, useShellLang } from '@fasl-work/caos-app-shell';

export default function Introduction() {
  const es = useShellLang() === 'es';
  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es ? 'Introducción' : 'Introduction'}</h1>
        <p className="lede">{es
          ? 'DispatchLab es un banco para comparar políticas de despacho camión-pala sobre una simulación de eventos discretos determinista de un rajo — desde heurísticas clásicas hasta políticas APRENDIDAS (redes entrenadas offline, inferencia ONNX en vivo).'
          : 'DispatchLab is a bench for comparing truck-to-shovel dispatch policies on a deterministic discrete-event simulation of an open pit — from classical heuristics to LEARNED policies (nets trained offline, live ONNX inference).'}</p>
      </div>
      <section>
        <h2>{es ? 'El problema' : 'The problem'}</h2>
        <p>{es
          ? 'En un rajo de camiones y palas, cada vez que un camión termina de descargar debe asignarse a su próxima pala. Esa decisión recurrente determina las toneladas por turno, la cola de camiones, la ociosidad de las palas (el recurso caro) y el cumplimiento de mezcla. Es EL problema de investigación de operaciones de la minería a cielo abierto — Codelco, BHP, Rio Tinto corren sistemas comerciales (Modular DISPATCH, Wenco, MineStar) sobre exactamente este lazo.'
          : 'In a truck-shovel open pit, each time a truck finishes dumping it must be assigned to its next shovel. That recurring decision sets the tonnes per shift, the truck queue, the shovel idle time (the expensive resource) and blend compliance. It is THE operations-research problem of open-pit mining — Codelco, BHP, Rio Tinto run commercial systems (Modular DISPATCH, Wenco, MineStar) on exactly this loop.'}</p>
        <Refs ids={['white1986', 'alarie2002']} label="Refs" />

        <h2>{es ? 'El enfoque — clásico + aprendido' : 'The approach — classical + learned'}</h2>
        <ArchSVG es={es} />
        <p>{es
          ? 'Sobre un motor de eventos discretos determinista corren las políticas: las CLÁSICAS (fija, greedy, espera-mínima, los dos criterios en conflicto, asignación Hungarian) y las APRENDIDAS — dos redes de puntuación por pala entrenadas offline sobre las decisiones logueadas del propio simulador (imitación ponderada por recompensa + clon de la mejor heurística), exportadas a ONNX y ejecutadas en vivo en el navegador. El banco mide honestamente las toneladas que cada una mueve, valida el simulador contra el match factor cerrado, y muestra el reparto de decisiones, las colas y el ciclo.'
          : 'On a deterministic discrete-event engine the policies run: the CLASSICAL (fixed, greedy, shortest-wait, the two conflicting criteria, Hungarian assignment) and the LEARNED — two per-shovel scoring nets trained offline on the simulator\'s own logged decisions (reward-weighted imitation + behaviour-clone of the best heuristic), exported to ONNX and run live in the browser. The bench honestly measures the tonnes each moves, validates the simulator against the closed-form match factor, and shows the decision split, queues and cycle.'}</p>
        <Refs ids={['noriega2024', 'mnih2015', 'peters2007']} label="Refs" />

        <h2>{es ? 'Quién lo usa' : 'Who uses it'}</h2>
        <p>{es ? 'Ingenieros de planificación y despacho, estudiantes/educadores de minería, investigadores de OR/RL. Es un sandbox didáctico y transparente de comparación de políticas — NO un sistema de despacho productivo ni rastreo en planta.' : 'Mine planning + dispatch engineers, mining students/educators, OR/RL researchers. A didactic, transparent policy-comparison sandbox — NOT a production dispatch system nor in-plant tracking.'}</p>

        <h2>{es ? 'Alcance honesto' : 'Honest scope'}</h2>
        <ul>
          <li>{es ? 'No existe un benchmark público con verdad de terreno de despacho (los logs DISPATCH/Wenco son propietarios). El rajo es sintético pero físicamente fundado y se valida contra el match factor + los controles oráculo.' : 'No public ground-truthed dispatch benchmark exists (DISPATCH/Wenco logs are proprietary). The pit is synthetic but physics-grounded and validated against the match factor + oracle controls.'}</li>
          <li>{es ? 'Las políticas aprendidas se entrenan sobre el MISMO simulador que las evalúa; igualan a las mejores heurísticas (sus maestras) pero no las superan — se reporta honestamente, sin victoria fabricada.' : 'The learned policies train on the SAME simulator that evaluates them; they match the best heuristics (their teachers) but do not beat them — reported honestly, no fabricated win.'}</li>
        </ul>
      </section>
    </div>
  );
}

function ArchSVG({ es }: { es: boolean }) {
  const box = (x: number, y: number, w: number, t: string, sub: string, fill: string) => (
    <g><rect x={x} y={y} width={w} height="44" rx="7" fill={fill} stroke="var(--color-border)" /><text x={x + w / 2} y={y + 19} textAnchor="middle" fill="var(--color-fg)" fontSize="12" fontWeight="600">{t}</text><text x={x + w / 2} y={y + 34} textAnchor="middle" fill="var(--color-fg-subtle)" fontSize="10">{sub}</text></g>
  );
  const arr = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-fg-subtle)" strokeWidth="1.4" markerEnd="url(#ar-a)" />;
  return (
    <svg viewBox="0 0 700 200" width="100%" style={{ maxWidth: 700, display: 'block', margin: '0.6rem auto', font: '12px var(--font-sans, sans-serif)' }} role="img" aria-label={es ? 'Arquitectura' : 'Architecture'}>
      <defs><marker id="ar-a" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--color-fg-subtle)" /></marker></defs>
      {box(20, 80, 150, es ? 'Motor DES' : 'DES engine', es ? 'determinista' : 'deterministic', 'var(--color-surface)')}
      {box(250, 20, 200, es ? 'Políticas clásicas' : 'Classical policies', es ? 'greedy · criterios · Hungarian' : 'greedy · criteria · Hungarian', 'color-mix(in oklab, var(--color-accent) 12%, var(--color-surface))')}
      {box(250, 140, 200, es ? 'Políticas aprendidas' : 'Learned policies', 'RWR · BC (ONNX)', 'color-mix(in oklab, #f85149 16%, var(--color-surface))')}
      {arr(170, 92, 250, 50)} {arr(170, 110, 250, 162)}
      {box(520, 80, 160, es ? 'Workbench web' : 'Web workbench', es ? '10 vistas + benchmark' : '10 views + benchmark', 'var(--color-surface)')}
      {arr(450, 42, 520, 95)} {arr(450, 162, 520, 120)}
      <text x="600" y="140" textAnchor="middle" fill="var(--color-fg-subtle)" fontSize="10.5">{es ? 'inferencia ONNX viva' : 'live ONNX inference'}</text>
    </svg>
  );
}
