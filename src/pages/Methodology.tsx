import { Equation, InlineMath, Refs, useShellLang } from '@fasl-work/caos-app-shell';

export default function Methodology() {
  const es = useShellLang() === 'es';
  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es ? 'Metodología' : 'Methodology'}</h1>
        <p className="lede">{es
          ? 'Desde la decisión de despacho hasta la simulación de eventos discretos determinista, la física de los camiones y el match factor que sirve de verdad analítica — con el registro honesto de qué se simula y qué se sobre-afirma.'
          : 'From the dispatch decision to the deterministic discrete-event simulation, the truck physics, and the match factor that serves as analytical ground truth — with an honest register of what is simulated and what is over-claimed.'}</p>
      </div>

      <section>
        <h2>{es ? 'La decisión de despacho' : 'The dispatch decision'}</h2>
        <p>{es
          ? 'En un rajo de camiones y palas, cada vez que un camión termina de descargar debe asignarse a su próxima pala. Esa única decisión recurrente determina las toneladas por turno, la cola de camiones, la ociosidad de las palas (el recurso caro) y el cumplimiento de la mezcla. DispatchLab compara políticas de despacho sobre la MISMA mina sintética y la misma semilla, así que la comparación es manzana-con-manzana.'
          : 'In a truck-shovel open pit, each time a truck finishes dumping it must be assigned to its next shovel. That single recurring decision sets the tonnes per shift, the truck queue, the shovel idle time (the expensive resource) and blend compliance. DispatchLab compares dispatch policies on the SAME synthetic mine and seed, so the comparison is apples-to-apples.'}</p>
        <Refs ids={['white1986', 'alarie2002']} label="Refs" />

        <h2>{es ? 'El motor de eventos discretos + el contrato de determinismo' : 'The discrete-event engine + the determinism contract'}</h2>
        <p>{es
          ? 'El núcleo es una simulación de eventos discretos con avance al próximo evento: el reloj salta al mínimo de la lista de eventos futuros (una cola binaria), se procesa un evento, y así. El orden es un orden total estricto (tiempo, prioridad, secuencia) — el contador de secuencia monótono es la piedra angular: sin él, dos eventos simultáneos se resolverían por accidente interno de la cola.'
          : 'The core is a next-event-time-advance discrete-event simulation: the clock jumps to the minimum of the future-event list (a binary heap), one event is processed, and so on. Order is a strict total order (time, priority, sequence) — the monotonic sequence counter is the keystone: without it, two simultaneous events would resolve by heap-internal accident.'}</p>
        <p>{es
          ? <>El reloj es un contador entero de centisegundos, y las duraciones muestreadas (exponencial/lognormal/Erlang) se redondean a ticks AL agendarlas. Esto importa: la aritmética IEEE-754 básica es exacta por motor, pero las funciones trascendentes (exp/log) NO están obligadas a redondeo correcto y difieren en el último bit entre V8/SpiderMonkey/JSC. Por eso el contrato honesto es: <b>bit-determinista por motor</b>, y la traza de eventos cuantizada en ticks es la verdad entre entornos — no la re-ejecución en vivo.</>
          : <>The clock is an integer centisecond counter, and sampled durations (exponential/lognormal/Erlang) are rounded to ticks AT schedule time. This matters: basic IEEE-754 arithmetic is exact per engine, but transcendental functions (exp/log) are NOT required to be correctly rounded and differ in the last bit across V8/SpiderMonkey/JSC. So the honest contract is: <b>bit-deterministic per engine</b>, with the tick-quantised event trace as the cross-environment truth — not live re-execution.</>}</p>
        <p className="muted small">{es
          ? 'El generador pseudoaleatorio es xoshiro128** sobre enteros de 32 bits (no de 64: el float64 de JS no representa u64 exacto), con flujos NOMBRADOS por propósito (carga/viaje/descarga/avería) sembrados desde (semilla, nombre). Así, agregar un camión no desplaza los sorteos de los demás — lo que hace válida la comparación de políticas con números aleatorios comunes.'
          : 'The PRNG is xoshiro128** over 32-bit integers (not 64: JS float64 cannot hold an exact u64), with per-purpose NAMED streams (load/travel/dump/breakdown) seeded from (seed, name). So adding a truck does not shift the others\' draws — which is what makes common-random-numbers policy comparison valid.'}</p>
        <Refs ids={['banks2010', 'law2015', 'lecuyer2002', 'ieee754']} label="Refs" />

        <h2>{es ? 'Cinemática del camión (rimpull / pendiente)' : 'Truck kinematics (rimpull / grade)'}</h2>
        <p>{es
          ? 'El tiempo de viaje por segmento sale de la física, no de una constante. La resistencia total es la pendiente más la resistencia a la rodadura; la fuerza tractiva para vencerla y la velocidad de equilibrio limitada por potencia son:'
          : 'Segment travel time comes from physics, not a constant. Total resistance is grade plus rolling resistance; the tractive force to overcome it and the power-limited equilibrium speed are:'}</p>
        <Equation tex={String.raw`\mathrm{TR}\% = \text{grade}\% + \text{RR}\%,\qquad F = \tfrac{\mathrm{TR}}{100}\, m\, g,\qquad v = \min\!\left(v_{\max},\ \frac{\eta\,P}{F}\right)`} />
        <p>{es
          ? <>con <InlineMath tex={String.raw`m`} /> la masa bruta (tara + carga subiendo cargado; sólo tara bajando vacío), <InlineMath tex={String.raw`\eta`} /> la eficiencia de transmisión y <InlineMath tex={String.raw`P`} /> la potencia. Cuesta abajo el camión está limitado por el retardador, no por la potencia. El tiempo de ciclo ideal (sin cola) que alimenta el match factor es <InlineMath tex={String.raw`t_c = t_{\text{carga}} + t_{\text{lleno}} + t_{\text{desc}} + t_{\text{vacío}}`} />. Anclas: CAT 793F ≈ 218 t de carga, ~166 t tara, ~1976 kW, ~60 km/h gobernada.</>
          : <>with <InlineMath tex={String.raw`m`} /> the gross mass (tare + payload climbing loaded; tare only descending empty), <InlineMath tex={String.raw`\eta`} /> the drivetrain efficiency and <InlineMath tex={String.raw`P`} /> the power. Downhill the truck is retarder-limited, not power-limited. The ideal (no-queue) cycle time feeding the match factor is <InlineMath tex={String.raw`t_c = t_{\text{load}} + t_{\text{full}} + t_{\text{dump}} + t_{\text{empty}}`} />. Anchors: CAT 793F ≈ 218 t payload, ~166 t tare, ~1976 kW, ~60 km/h governed.</>}</p>
        <Refs ids={['catHandbook', 'soofastaei2016']} label="Refs" />

        <h2>{es ? 'Match factor — la verdad analítica' : 'Match factor — the analytical ground truth'}</h2>
        <p>{es
          ? 'El match factor compara la demanda de los camiones con la capacidad de servicio de las palas. Se fija UNA definición y se usa idéntica en todas partes:'
          : 'The match factor compares the trucks\' demand to the shovels\' service capacity. ONE definition is pinned and used identically everywhere:'}</p>
        <Equation tex={String.raw`\mathrm{MF} = \frac{N_{\text{trucks}}\; t_{\text{load}}}{N_{\text{shovels}}\; t_{\text{cycle}}}`} />
        <p>{es
          ? <>MF ≈ 1 equilibrado; &gt; 1 sobre-camionado (los camiones hacen cola); &lt; 1 sub-camionado (las palas quedan ociosas). El simulador se valida contra esta curva cerrada. La fórmula clásica supone flota homogénea (Morgan & Peterson); la corrección heterogénea (mezcla de clases de camión) de Burt & Caccetta se usa en el caso de flota mixta — y discrepan, así que prescribir tamaño de flota con la clásica sobre una flota mixta es un error que el banco demuestra.</>
          : <>MF ≈ 1 balanced; &gt; 1 over-trucked (trucks queue); &lt; 1 under-trucked (shovels idle). The simulator is validated against this closed form. The classic formula assumes a homogeneous fleet (Morgan & Peterson); the heterogeneous (mixed truck-class) correction of Burt & Caccetta is used for the mixed-fleet case — and they disagree, so sizing a mixed fleet with the classic formula is an error the bench demonstrates.</>}</p>
        <Refs ids={['morgan1968', 'burt2007']} label="Refs" />

        <h2>{es ? 'Taxonomía de políticas + registro honesto' : 'Policy taxonomy + honesty register'}</h2>
        <p>{es
          ? 'Las políticas comparten una base de costo (viaje + espera esperada + desviación del plan) pero optimizan objetivos distintos. Las dos criterios clásicas — minimizar espera de camión ("maximizar camiones") y minimizar espera de pala ("maximizar palas") — entran en conflicto: no se pueden minimizar ambas a la vez, y ahí está el corazón multi-objetivo del despacho.'
          : 'Policies share a cost basis (travel + expected wait + plan deviation) but optimise different objectives. The two classic criteria — minimise truck wait ("maximise trucks") and minimise shovel wait ("maximise shovels") — conflict: you cannot minimise both at once, and that is the multi-objective heart of dispatch.'}</p>
        <ul>
          <li>{es ? <><b>Fija</b> — el camión vuelve a su pala de origen; el piso sin reacción.</> : <><b>Fixed</b> — the truck returns to its home shovel; the no-reaction floor.</>}</li>
          <li>{es ? <><b>Greedy (fin más temprano)</b> — minimiza cuándo ESTE camión termina de cargar; miope, sobre-camiona la pala cercana. En MF≈1 empata a los optimizadores.</> : <><b>Greedy (earliest completion)</b> — minimises when THIS truck finishes loading; myopic, over-trucks the near shovel. At MF≈1 it ties the optimisers.</>}</li>
          <li>{es ? <><b>Espera esperada mínima</b> — minimiza el tiempo de cola usando cola + en-tránsito; el mejor default barato.</> : <><b>Shortest expected wait</b> — minimises queue time using queue + in-transit; the best cheap default.</>}</li>
          <li>{es ? <><b>Mín. espera de camión / Mín. espera de pala</b> — los dos criterios clásicos en conflicto.</> : <><b>Min truck-wait / Min shovel-wait</b> — the two conflicting classic criteria.</>}</li>
        </ul>
        <p className="muted small">{es
          ? 'Honestidad: el ranking de una política es específico del caso y la semilla. Ninguna ruta del código imprime un ganador único — se reporta la distribución sobre semillas. Greedy a menudo casi empata a un optimizador cuando el rajo está equilibrado; el banco lo muestra en vez de ocultarlo. Y el match factor explica el tamaño de flota, pero la rodilla de saturación de la simulación es la recomendación real (con varianza de bunching, el óptimo se corre a MF algo bajo 1). Las políticas exactas (Hungarian, LP multi-etapa, MILP con mezcla) y la de aprendizaje por refuerzo se construyen sobre esta base en los próximos incrementos.'
          : 'Honesty: a policy\'s ranking is case- and seed-specific. No code path prints a single winner — the distribution over seeds is reported. Greedy often nearly ties an optimiser when the pit is balanced; the bench shows this rather than hiding it. And the match factor explains fleet size, but the simulation saturation knee is the real recommendation (with bunching/payload variance the optimum drifts to MF slightly below 1). The exact policies (Hungarian, multi-stage LP, blend-MILP) and the reinforcement-learning policy build on this base in the next increments.'}</p>
        <Refs ids={['alarie2002', 'kuhn1955', 'moradi2019']} label="Refs" />
      </section>
    </div>
  );
}
