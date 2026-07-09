import { Equation, InlineMath, Refs, SubTabs, useShellLang } from '@fasl-work/caos-app-shell';

const AR = (id: string) => <defs><marker id={id} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--color-fg-subtle)" /></marker></defs>;
const sv = { maxWidth: 560, display: 'block', margin: '0.5rem auto', font: '11px var(--font-sans, sans-serif)' } as const;

export default function Methodology() {
  const es = useShellLang() === 'es';
  const tabs = [
    { id: 'des', label: es ? 'Núcleo DES' : 'DES core', content: <Des es={es} /> },
    { id: 'pol', label: es ? 'Políticas de despacho' : 'Dispatch policies', content: <Pol es={es} /> },
    { id: 'or', label: es ? 'Tier OR + restricciones' : 'OR tier + constraints', content: <Or es={es} /> },
    { id: 'mf', label: es ? 'Match factor + colas' : 'Match factor + queueing', content: <Mf es={es} /> },
    { id: 'learned', label: es ? 'Tier aprendido' : 'Learned tier', content: <Learned es={es} /> },
    { id: 'rollout', label: es ? 'Look-ahead y rollout' : 'Look-ahead & rollout', content: <Rollout es={es} /> },
  ];
  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es ? 'Metodología' : 'Methodology'}</h1>
        <p className="lede">{es ? 'El motor de eventos discretos, las políticas clásicas, el match factor como verdad analítica y el tier aprendido, con la matemática término por término y un diagrama por método.' : 'The discrete-event engine, the classical policies, the match factor as analytical ground truth, and the learned tier, with the maths term by term and a diagram per method.'}</p>
      </div>
      <section><SubTabs tabs={tabs} ariaLabel="methodology" /></section>
    </div>
  );
}

function Des({ es }: { es: boolean }) {
  return (<>
    <p>{es ? 'El núcleo es una simulación de eventos discretos con avance al próximo evento: el reloj salta al mínimo de la lista de eventos futuros (una cola binaria), se procesa un evento, y así. El orden es un orden total estricto (tiempo, prioridad, secuencia), el contador de secuencia monótono es la piedra angular: sin él, eventos simultáneos se resolverían por accidente interno de la cola.' : 'The core is a next-event-time-advance discrete-event simulation: the clock jumps to the minimum of the future-event list (a binary heap), one event is processed, and so on. Order is a strict total order (time, priority, sequence), the monotonic sequence counter is the keystone: without it, simultaneous events would resolve by heap-internal accident.'}</p>
    <svg viewBox="0 0 560 110" width="100%" style={sv} role="img" aria-label="event timeline">
      {AR('des-a')}
      <line x1="20" y1="60" x2="540" y2="60" stroke="var(--color-fg-subtle)" markerEnd="url(#des-a)" />
      {[60, 150, 240, 330, 420].map((x, i) => <g key={i}><line x1={x} y1="52" x2={x} y2="68" stroke="var(--color-accent)" strokeWidth="2" /><circle cx={x} cy="60" r="4" fill="var(--color-accent)" /><text x={x} y="44" textAnchor="middle" fill="var(--color-fg-subtle)" fontSize="10">e{i + 1}</text></g>)}
      <text x="20" y="30" fill="var(--color-fg-subtle)">{es ? 'el reloj salta de evento en evento (no por incremento fijo)' : 'the clock jumps event to event (not by fixed step)'}</text>
      <text x="535" y="80" textAnchor="end" fill="var(--color-fg-subtle)">{es ? 'tiempo (ticks enteros)' : 'time (integer ticks)'}</text>
    </svg>
    <p>{es ? 'El reloj es entero (centisegundos); las duraciones (carga Erlang, viaje/descarga lognormal) se muestrean y redondean a ticks al agendar; no se simulan averías de equipos. El PRNG xoshiro128** sobre enteros con flujos nombrados hace válida la comparación con números aleatorios comunes (mismas llegadas/servicios entre políticas).' : 'The clock is integer (centiseconds); durations (Erlang load, lognormal travel/dump) are sampled and rounded to ticks at schedule time; equipment breakdowns are not simulated. The xoshiro128** PRNG over integers with named streams makes common-random-numbers comparison valid (same arrivals/services across policies).'}</p>
    <Refs ids={['banks2010', 'law2015', 'lecuyer2002']} label="Refs" />
  </>);
}

function Pol({ es }: { es: boolean }) {
  return (<>
    <p>{es ? 'Las políticas comparten una base de costo (viaje + espera esperada + desviación del plan) pero optimizan objetivos distintos. Las dos criterios clásicas, minimizar espera de camión ("maximizar camiones") y minimizar espera de pala ("maximizar palas"), entran en conflicto: no se pueden minimizar ambas, y ahí está el corazón multi-objetivo del despacho.' : 'Policies share a cost basis (travel + expected wait + plan deviation) but optimise different objectives. The two classic criteria, minimise truck wait ("maximise trucks") and minimise shovel wait ("maximise shovels"), conflict: you cannot minimise both, and that is the multi-objective heart of dispatch.'}</p>
    <svg viewBox="0 0 560 130" width="100%" style={sv} role="img" aria-label="conflicting criteria">
      {AR('pol-a')}
      <line x1="50" y1="110" x2="520" y2="110" stroke="var(--color-fg-subtle)" markerEnd="url(#pol-a)" /><line x1="50" y1="110" x2="50" y2="15" stroke="var(--color-fg-subtle)" markerEnd="url(#pol-a)" />
      <text x="525" y="125" textAnchor="end" fill="var(--color-fg-subtle)">{es ? 'espera de camión →' : 'truck wait →'}</text>
      <text x="44" y="14" textAnchor="end" fill="var(--color-fg-subtle)">{es ? 'espera de pala' : 'shovel wait'}</text>
      <path d="M 70 30 Q 180 40 250 70 T 480 100" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeDasharray="4 3" />
      <circle cx="90" cy="34" r="4" fill="#d29922" /><text x="98" y="30" fill="var(--color-fg)">{es ? 'min-pala' : 'min-shovel'}</text>
      <circle cx="470" cy="98" r="4" fill="#58a6ff" /><text x="430" y="92" fill="var(--color-fg)">{es ? 'min-camión' : 'min-truck'}</text>
      <text x="230" y="55" fill="var(--color-fg-subtle)">{es ? 'frontera: no se pueden minimizar ambas' : 'frontier: cannot minimise both'}</text>
    </svg>
    <p>{es ? 'Se implementan: fija (piso), greedy (fin más temprano, miope), espera-esperada-mínima, los dos criterios en conflicto, y la asignación Hungarian (óptima para el match instantáneo). La página Benchmark mide las toneladas reales de cada una.' : 'Implemented: fixed (floor), greedy (earliest completion, myopic), shortest-expected-wait, the two conflicting criteria, and Hungarian assignment (optimal for the instantaneous match). The Benchmark page measures each one\'s real tonnes.'}</p>
    <Refs ids={['alarie2002', 'white1986', 'kuhn1955', 'moradi2019']} label="Refs" />
  </>);
}

function Or({ es }: { es: boolean }) {
  return (<>
    <p>{es
      ? 'El tier OR resuelve, en cada decisión, la asignación CONJUNTA camión→pala sobre la vista de flota (todos los camiones que pedirán despacho en la ventana), al estilo DISPATCH: cada pala aporta k SLOTS (posiciones sucesivas de servicio; el slot k paga k cargas extra de cola) y se minimiza el tiempo de compleción total con el algoritmo Hungarian (Kuhn–Munkres, O(n³)):'
      : 'The OR tier solves, at each decision, the JOINT truck→shovel assignment over the fleet view (every truck that will ask for dispatch within the window), DISPATCH-style: each shovel contributes k SLOTS (successive service positions; slot k pays k extra queue loads) and total completion time is minimised with the Hungarian algorithm (Kuhn–Munkres, O(n³)):'}</p>
    <Equation tex={String.raw`\min_{x}\ \sum_{t,\,(s,k)} c_{t,(s,k)}\, x_{t,(s,k)}\quad \text{s.a.}\ \sum_{(s,k)} x_{t,(s,k)} = 1,\ \ \sum_{t} x_{t,(s,k)} \le 1,\ \ x \in \{0,1\}`} />
    <Equation tex={String.raw`c_{t,(s,k)} = \max\big(\mathrm{ready}_t + \mathrm{eta}_{t,s},\ \mathrm{free}_s\big) + k\, t^{\text{load}}_s + t^{\text{load}}_s`} />
    <p>{es
      ? <>donde <InlineMath tex={String.raw`\mathrm{free}_s`} /> incluye el backlog COMPROMETIDO (cola + camiones ya despachados en tránsito), omitir el en-tránsito re-crea el amontonamiento que la asignación conjunta existe para evitar (hallazgo de test). Resultado honesto del corpus: hungarian queda 3.º (rango medio 3.75 en el corpus de 12 casos) tras greedy y shortest-wait, con flotas homogéneas y ventanas de decisión pequeñas, la asignación instantánea NO supera a las buenas heurísticas miopes, consistente con la literatura.</>
      : <>where <InlineMath tex={String.raw`\mathrm{free}_s`} /> includes the COMMITTED backlog (queue + already-dispatched in-transit trucks), omitting in-transit re-creates the herding the joint assignment exists to avoid (a test-caught finding). Honest corpus result: hungarian ranks 3rd (mean rank 3.75 on the 12-case corpus) behind greedy and shortest-wait, with homogeneous fleets and small decision windows, instantaneous assignment does NOT beat the good myopic heuristics, consistent with the literature.</>}</p>
    <h3>{es ? 'Restricciones operativas (la física del despacho)' : 'Operational constraints (the physics of dispatch)'}</h3>
    <p>{es
      ? 'Compatibilidad pala-camión, tope de cola por pala (cola + en-tránsito + cargando), tope de recepción del chancador (tph de la hora móvil: pausa las palas de mineral) y pausas de turno (las decisiones ESPERAN al fin de la ventana). El DES filtra el conjunto FACTIBLE antes de que la política vea el estado, TODAS las políticas respetan las restricciones por construcción; una elección infactible se re-asigna a la factible más cercana y se CUENTA (invalidChoices).'
      : 'Shovel-truck compatibility, per-shovel commitment cap (queue + in-transit + loading), crusher acceptance cap (trailing-hour tph: pauses ore shovels) and shift breaks (decisions HOLD to the window end). The DES filters the FEASIBLE set before any policy sees the state, EVERY policy respects constraints by construction; an infeasible choice is re-assigned to the nearest feasible and COUNTED (invalidChoices).'}</p>
    <h3>{es ? 'El oráculo de capacidad (cota superior)' : 'The capacity oracle (upper bound)'}</h3>
    <Equation tex={es
      ? String.raw`T^{\ast} = \min\Big(\underbrace{\textstyle\sum_s \big(1 + \tfrac{T_{\text{shift}}}{t^{\text{load}}_s}\big)\, p_{\max}}_{\text{palas sin parar}},\ \underbrace{\textstyle\sum_t \big(1 + \tfrac{T_{\text{shift}}}{c^{\min}_t}\big)\, p_t}_{\text{camiones sin colas}}\Big)`
      : String.raw`T^{\ast} = \min\Big(\underbrace{\textstyle\sum_s \big(1 + \tfrac{T_{\text{shift}}}{t^{\text{load}}_s}\big)\, p_{\max}}_{\text{shovels nonstop}},\ \underbrace{\textstyle\sum_t \big(1 + \tfrac{T_{\text{shift}}}{c^{\min}_t}\big)\, p_t}_{\text{trucks queue-free}}\Big)`} />
    <p>{es
      ? 'La relajación de transporte agregada por familia de recursos: ignora colas, interferencia e integralidad, así que ninguna política la supera (exacta en dinámica determinista; el ruido de piernas media-1 puede rozarla, el Benchmark puntúa medianas como «% del oráculo»). La brecha entre la mejor política y el oráculo es el precio de la congestión + la miopía.'
      : 'The transportation relaxation aggregated per resource family: it ignores queueing, interference and integrality, so no policy exceeds it (exact under deterministic dynamics; mean-1 leg noise can graze it, the Benchmark scores medians as "% of oracle"). The gap between the best policy and the oracle is the price of congestion + myopia.'}</p>
    <Refs ids={['kuhn1955', 'white1986', 'alarie2002', 'moradi2019']} label="Refs" />
  </>);
}

function Mf({ es }: { es: boolean }) {
  return (<>
    <p>{es ? 'El match factor compara la demanda de los camiones con la capacidad de servicio de las palas, la verdad analítica contra la que se valida el simulador:' : 'The match factor compares the trucks\' demand to the shovels\' service capacity, the analytical ground truth the simulator is validated against:'}</p>
    <Equation tex={String.raw`\mathrm{MF} = \frac{N_{\text{trucks}}\; t_{\text{load}}}{N_{\text{shovels}}\; t_{\text{cycle}}}`} />
    <svg viewBox="0 0 560 150" width="100%" style={sv} role="img" aria-label="throughput saturation">
      {AR('mf-a')}
      <line x1="50" y1="120" x2="520" y2="120" stroke="var(--color-fg-subtle)" markerEnd="url(#mf-a)" /><line x1="50" y1="120" x2="50" y2="20" stroke="var(--color-fg-subtle)" markerEnd="url(#mf-a)" />
      <path d="M 50 120 L 120 90 L 190 64 L 260 48 L 330 42 L 400 41 L 480 41" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
      <line x1="260" y1="20" x2="260" y2="120" stroke="var(--color-fg)" strokeDasharray="4 3" /><text x="265" y="32" fill="var(--color-fg)">MF=1</text>
      <circle cx="260" cy="48" r="6" fill="none" stroke="#d29922" strokeWidth="2" /><text x="270" y="60" fill="#d29922">{es ? 'rodilla' : 'knee'}</text>
      <text x="525" y="135" textAnchor="end" fill="var(--color-fg-subtle)">{es ? 'tamaño de flota →' : 'fleet size →'}</text>
      <text x="44" y="20" textAnchor="end" fill="var(--color-fg-subtle)">{es ? 'producción' : 'throughput'}</text>
    </svg>
    <p>{es ? <>MF ≈ 1 equilibrado; &gt; 1 sobre-camionado (los camiones hacen cola); &lt; 1 sub-camionado (las palas quedan ociosas). La producción satura al cruzar MF=1, la pestaña «Validación MF» del banco muestra que la rodilla medida cae en MF=1. La fórmula clásica supone flota homogénea (Morgan & Peterson); la corrección heterogénea es de Burt & Caccetta. <InlineMath tex={String.raw`t_{\text{cycle}}`} /> incluye carga + viaje + descarga + retorno.</> : <>MF ≈ 1 balanced; &gt; 1 over-trucked (trucks queue); &lt; 1 under-trucked (shovels idle). Throughput saturates as MF crosses 1, the bench\'s "MF validation" tab shows the measured knee lands at MF=1. The classic formula assumes a homogeneous fleet (Morgan & Peterson); the heterogeneous correction is Burt & Caccetta. <InlineMath tex={String.raw`t_{\text{cycle}}`} /> includes load + haul + dump + return.</>}</p>
    <Refs ids={['morgan1968', 'burt2007']} label="Refs" />
  </>);
}

function Learned({ es }: { es: boolean }) {
  return (<>
    <p>{es ? 'El tier aprendido entrena, offline, dos redes de PUNTUACIÓN POR PALA (una MLP compartida → un escalar por pala, así un modelo maneja cualquier número de palas). En cada decisión se puntúa cada pala candidata y se elige el argmax.' : 'The learned tier trains, offline, two PER-SHOVEL SCORING nets (a shared MLP → one scalar per shovel, so one model handles any number of shovels). At each decision every candidate shovel is scored and the argmax is chosen.'}</p>
    <Equation tex={String.raw`s_j = \mathrm{MLP}(x_j),\qquad a = \arg\max_j s_j,\qquad \mathcal{L}_{\text{RWR}} = \mathbb{E}\big[w\cdot \mathrm{CE}(\mathrm{softmax}(s), a^{\text{ref}})\big]`} />
    <svg viewBox="0 0 560 120" width="100%" style={sv} role="img" aria-label="per-shovel scoring net">
      {AR('ml-a')}
      {[40, 40, 40].map((_, i) => <rect key={i} x={60} y={26 + i * 26} width="70" height="18" rx="3" fill="color-mix(in oklab, var(--color-accent) 20%, var(--color-surface))" stroke="var(--color-border)" />)}
      <text x="95" y="18" textAnchor="middle" fill="var(--color-fg-subtle)">{es ? 'features por pala (×6)' : 'per-shovel features (×6)'}</text>
      {[180, 240, 300].map((x, i) => <rect key={i} x={x} y={26} width="44" height="70" rx="3" fill="color-mix(in oklab, #f85149 16%, var(--color-surface))" stroke="var(--color-border)" />)}
      <text x="262" y="18" textAnchor="middle" fill="var(--color-fg-subtle)">MLP 6→32→32→1</text>
      <line x1="344" y1="61" x2="380" y2="61" stroke="var(--color-fg-subtle)" markerEnd="url(#ml-a)" />
      {[40, 64, 88].map((y, i) => <g key={i}><rect x="390" y={y - 8} width={[70, 40, 24][i]} height="14" rx="2" fill={i === 0 ? '#f85149' : 'var(--color-accent)'} /><text x={390 + [70, 40, 24][i] + 6} y={y + 3} fill="var(--color-fg-subtle)" fontSize="10">{es ? 'puntaje' : 'score'} {i + 1}{i === 0 ? ' ★' : ''}</text></g>)}
      <text x="430" y="110" textAnchor="middle" fill="#f85149" fontSize="10">{es ? 'argmax → pala elegida' : 'argmax → chosen shovel'}</text>
    </svg>
    <p>{es ? 'La POLÍTICA usa imitación ponderada por recompensa (RWR, Peters & Schaal 2007): reproduce las decisiones de referencia ponderadas por las toneladas del episodio. BC-best clona la mejor heurística. Ambas se exportan a ONNX y corren en vivo. Honesto: igualan a las heurísticas, no las superan, la SOTA del RL de despacho (Noriega 2024) muestra ganancias solo con entornos más ricos.' : 'The POLICY uses reward-weighted imitation (RWR, Peters & Schaal 2007): it reproduces the reference decisions weighted by episode tonnes. BC-best clones the best heuristic. Both export to ONNX and run live. Honest: they match the heuristics, not beat them, the SOTA of dispatch RL (Noriega 2024) shows gains only with richer environments.'}</p>
    <h3>{es ? '¿Por qué BC y (todavía) no RL offline?' : 'Why BC, and why not (yet) offline RL?'}</h3>
    <p>{es
      ? 'El tier aprendido clona comportamiento (BC); no aprende una política nueva. El sucesor natural es RL offline sobre el flujo de decisiones registrado (CQL, Kumar 2020; IQL, Kostrikov 2021), que puede en principio SUPERAR a la mejor heurística en vez de igualarla. No se incluye aún: sin garantía de mejora y propenso a sobre-afirmar en la instancia de evaluación; el rollout (pestaña siguiente) trae una garantía, así que es la apuesta beyond-SOTA primero.'
      : 'The learned tier clones behaviour (BC); it does not learn a new policy. The natural successor is offline RL on the logged decision stream (CQL, Kumar 2020; IQL, Kostrikov 2021), which can in principle BEAT the best heuristic rather than match it. Not shipped yet: no improvement guarantee and overclaim-prone on the eval instance; the rollout (next tab) comes with a theorem, so it is the beyond-SOTA bet first.'}</p>
    <Refs ids={['peters2007', 'mnih2015', 'hasselt2016', 'noriega2024', 'kumar2020cql', 'kostrikov2021iql']} label="Refs" />
  </>);
}

function Rollout({ es }: { es: boolean }) {
  return (<>
    <p>{es
      ? 'Toda la escalera anterior (greedy, shortest-wait, los dos criterios, Hungarian, el tier aprendido) es MIOPE: decide sobre el estado instantáneo. El único eje sin explorar es la NO-MIOPÍA: una mirada real a las consecuencias río abajo de una asignación. El dispatcher beyond-SOTA es un ROLLOUT Monte-Carlo de horizonte deslizante sobre el propio modelo de eventos discretos.'
      : 'The whole ladder above (greedy, shortest-wait, the two criteria, Hungarian, the learned tier) is MYOPIC: it decides on the instantaneous state. The one unexplored axis is NON-MYOPIA: a genuine look at the downstream consequences of an assignment. The beyond-SOTA dispatcher is a receding-horizon Monte-Carlo ROLLOUT over the discrete-event model itself.'}</p>
    <p>{es
      ? <>En cada decisión, para cada pala candidata <InlineMath tex={String.raw`a`} />, se BIFURCA la simulación en su estado actual <InlineMath tex={String.raw`s`} />, se aplica <InlineMath tex={String.raw`a`} /> y se simula el resto del horizonte con una POLÍTICA BASE <InlineMath tex={String.raw`\pi`} /> (la mejor heurística miope). Se elige el <InlineMath tex={String.raw`a`} /> que optimiza el factor-Q simulado:</>
      : <>At each decision, for every candidate shovel <InlineMath tex={String.raw`a`} />, the simulation is FORKED at its current state <InlineMath tex={String.raw`s`} />, <InlineMath tex={String.raw`a`} /> is applied, and the rest of the horizon is simulated under a BASE policy <InlineMath tex={String.raw`\pi`} /> (the best myopic heuristic). The <InlineMath tex={String.raw`a`} /> optimising the simulated Q-factor is chosen:</>}</p>
    <Equation tex={String.raw`Q_\pi(s,a) = g(s,a) + J_\pi\big(f(s,a)\big), \qquad \tilde\pi(s) = \arg\max_{a\in A(s)} Q_\pi(s,a)`} />
    <p>{es
      ? <>donde <InlineMath tex={String.raw`f(s,a)`} /> es el estado sucesor, <InlineMath tex={String.raw`g`} /> la recompensa inmediata (toneladas) y <InlineMath tex={String.raw`J_\pi`} /> el retorno de la base desde ahí. Esto es UN paso de mejora de política (Bertsekas, Tsitsiklis y Wu 1997). Con un modelo determinista y una base secuencialmente consistente, el rollout NO puede ser peor que su base:</>
      : <>where <InlineMath tex={String.raw`f(s,a)`} /> is the successor state, <InlineMath tex={String.raw`g`} /> the immediate reward (tonnes) and <InlineMath tex={String.raw`J_\pi`} /> the base return from there. This is ONE policy-improvement step (Bertsekas, Tsitsiklis & Wu 1997). On a deterministic model with a sequentially consistent base, the rollout can NEVER be worse than its base:</>}</p>
    <Equation tex={String.raw`J_{\tilde\pi}(s)\ \ge\ J_\pi(s)\qquad \forall s \quad\text{(deterministic model, sequentially consistent base)}`} />
    <svg viewBox="0 0 560 190" width="100%" style={sv} role="img" aria-label="rollout: fork the DES, simulate K futures per candidate, argmax">
      {AR('ro-a')}
      <circle cx="46" cy="95" r="7" fill="var(--color-accent)" /><text x="46" y="78" textAnchor="middle" fill="var(--color-fg-subtle)" fontSize="10">{es ? 'decisión s' : 'decision s'}</text>
      {[{ y: 40, c: '#3fb950', l: 'a₁' }, { y: 95, c: '#e3b341', l: 'a₂ ★' }, { y: 150, c: '#58a6ff', l: 'a₃' }].map((r, i) => (
        <g key={i}>
          <line x1="53" y1="95" x2="150" y2={r.y} stroke="var(--color-fg-subtle)" markerEnd="url(#ro-a)" />
          <rect x="150" y={r.y - 14} width="86" height="28" rx="4" fill={`color-mix(in oklab, ${r.c} 18%, var(--color-surface))`} stroke="var(--color-border)" />
          <text x="193" y={r.y + 4} textAnchor="middle" fill="var(--color-fg)" fontSize="10">{es ? 'fork + ' : 'fork + '}{r.l}</text>
          {[0, 1, 2].map((k) => <line key={k} x1="236" y1={r.y} x2="300" y2={r.y - 10 + k * 10} stroke={r.c} strokeWidth="1" strokeDasharray="3 2" markerEnd="url(#ro-a)" />)}
          <text x="330" y={r.y + 4} fill="var(--color-fg-subtle)" fontSize="10">{es ? 'K futuros con π base' : 'K futures under base π'}</text>
        </g>
      ))}
      <rect x="470" y="80" width="80" height="30" rx="4" fill="color-mix(in oklab, #e3b341 26%, var(--color-surface))" stroke="#e3b341" />
      <text x="510" y="99" textAnchor="middle" fill="var(--color-fg)" fontSize="10">argmax Q</text>
      <text x="300" y="182" fill="var(--color-fg-subtle)" fontSize="10">{es ? 'promedio sobre K = E[objetivo] (números aleatorios comunes)' : 'average over K = E[objective] (common random numbers)'}</text>
    </svg>
    <p>{es
      ? <>Bajo INCERTIDUMBRE de tiempos de ciclo (los casos complejos estocásticos C04-C08) el rollout muestrea <InlineMath tex={String.raw`K`} /> realizaciones de ruido por candidato y estima el objetivo ESPERADO (variante estocástica, Bertsekas y Castanon 1999); la garantía se debilita a empírica-con-IC, así que el Benchmark reporta intervalos de confianza Monte-Carlo, nunca una victoria pelada. Una regla de conmutación (desviar de la base solo con ganancia simulada &gt; 0.4%) hace que el rollout se reduzca a la base cuando no hay ganancia robusta.</>
      : <>Under cycle-time UNCERTAINTY (the complex stochastic cases C04-C08) the rollout samples <InlineMath tex={String.raw`K`} /> noise realizations per candidate and estimates the EXPECTED objective (the stochastic variant, Bertsekas & Castanon 1999); the guarantee weakens to empirical-with-CI, so the Benchmark reports Monte-Carlo confidence intervals, never a bare win. A switching margin (deviate from the base only on a simulated gain &gt; 0.4%) makes the rollout reduce to its base when there is no robust gain.</>}</p>
    <h3>{es ? 'Resultado honesto (medido, no afirmado)' : 'Honest result (measured, not asserted)'}</h3>
    <p>{es
      ? 'Sobre el modelo DETERMINISTA la cota de mejora se cumple exactamente: el rollout es >= su base en todo el corpus. La ganancia estricta se demuestra en el control positivo asimétrico (fixture de test), donde la mirada de horizonte evita hambrear la pala cercana; en el rajo simétrico (fixture de empate) y el oráculo 1×1 empata exactamente (una victoria ahí sería una fuga). Bajo ruido, el rollout de equivalencia-cierta NO supera a la asignación miope (la base ya está a pocos % del oráculo de capacidad). Se publica el NULO honesto: la cota de mejora determinista es la contribución validada. Ver Benchmark.'
      : 'On the DETERMINISTIC model the improvement bound holds exactly: the rollout is >= its base across the whole corpus. The strict gain is demonstrated on the asymmetric positive-control fixture, where the horizon view avoids starving the near shovel; on the symmetric tie fixture and the 1x1 oracle it ties exactly (a win there would be a leak). Under noise, the certainty-equivalent rollout does NOT beat myopic assignment (the base is already within a few % of the capacity oracle). The honest NULL is shipped: the deterministic improvement bound is the validated contribution. See Benchmark.'}</p>
    <h3>{es ? 'En vivo: destilación estilo AlphaGo' : 'Live: AlphaGo-style distillation'}</h3>
    <p>{es
      ? 'El rollout verdadero (K x horizonte pasos DES por decisión) es demasiado pesado para el navegador. Así que corre OFFLINE sobre el corpus y sus acciones elegidas se DESTILAN en una MLP por-pala pequeña -> dl-rollout.onnx, que corre en vivo con onnxruntime-web como las redes RWR/BC. El panel «Rollout inspector» de la App corre un rollout ACOTADO bajo demanda (K y horizonte pequeños, nunca en autoplay) para mostrar los K futuros por candidato.'
      : 'The true rollout (K x horizon DES steps per decision) is too heavy for the browser. So it runs OFFLINE over the corpus and its chosen actions are DISTILLED into a small per-shovel MLP -> dl-rollout.onnx, run live via onnxruntime-web like the RWR/BC nets. The App\'s "Rollout inspector" panel runs a BOUNDED rollout on demand (small K and horizon, never on autoplay) to show the K futures per candidate.'}</p>
    <Refs ids={['bertsekas1997', 'bertsekas1999', 'seiler2022', 'mininggym2025', 'meng2025', 'zhang2020', 'white1986', 'alarie2002']} label="Refs" />
  </>);
}
