// In-app Architecture / "How it works" modal config (ADR-0058) for DispatchLab.
// Passed to <AppShell config={{ ...config, architecture }}>. The ⓘ header button
// (provided by @fasl-work/caos-app-shell >= 0.1.2) opens the modal. Each tab pairs
// one hand-authored themed SVG (frontend/public/svg/tech/, shell CSS-var tokens →
// repaints with the active theme, fetched + inlined) with a bilingual ES/EN body.
import type { ArchitectureConfig } from '@fasl-work/caos-app-shell';

export const architecture: ArchitectureConfig = {
  tabs: [
    {
      id: 'app',
      en: 'The app',
      es: 'La app',
      svg: 'svg/tech/01-the-app.svg',
      body_en:
        'DispatchLab is an open-pit haulage product: given N trucks, M shovels and different haul roads, it simulates a ' +
        'shift under a dispatch policy and shows the throughput (tons), the match factor and the truck-wait, answering ' +
        '"which truck→shovel assignment maximises tons and minimises queueing?". Picking a case, a fleet and a policy ' +
        're-runs the whole shift live.\n\n' +
        'It is a real system, not a demo. A centisecond discrete-event simulation (frontend/src/sim/) re-runs on every ' +
        'control; truck travel is physical (speed by grade, rolling resistance and load); shovels load on a real cycle ' +
        'and queues form at both ends. Heuristic policies compete with a learned dispatch NN and a behaviour-clone of ' +
        'the best, both ONNX, client-side. The analytical match factor anchors it and a closed-form 1x1 oracle (a test fixture) pins determinism.',
      body_es:
        'DispatchLab es un producto de transporte en rajo abierto: dados N camiones, M palas y distintos caminos de ' +
        'acarreo, simula un turno bajo una política de despacho y muestra el throughput (toneladas), el match factor y ' +
        'la espera de camiones, respondiendo "¿qué asignación camión→pala maximiza toneladas y minimiza colas?". Al elegir ' +
        'un caso, una flota y una política, el turno completo se vuelve a ejecutar en vivo.\n\n' +
        'Es un sistema real, no un demo. Una simulación de eventos discretos en centésimas (frontend/src/sim/) se ' +
        'se vuelve a ejecutar con cada control; el viaje del camión es físico (velocidad por pendiente, resistencia a la rodadura y ' +
        'carga); las palas cargan en un ciclo real y se forman colas en ambos extremos. Las políticas heurísticas ' +
        'compiten con una NN de despacho aprendida y un clon de comportamiento de la mejor, ambos ONNX, en el cliente. ' +
        'El match factor analítico la ancla y un oráculo 1x1 de forma cerrada (un fixture de test) fija el determinismo.',
    },
    {
      id: 'roads',
      en: 'Haul-road network & traffic',
      es: 'Red de caminos y tráfico',
      svg: 'svg/tech/06-haul-road-traffic.svg',
      body_en:
        'Trucks travel a real road network, not straight magic lines. Every haul leaves the pit through a single ' +
        'portal onto a shared surface trunk to a junction, then a curved spur to its destination (crusher, waste ' +
        'dump or stockpile); the empty return reverses it. The 2D map and the 3D view both draw and travel these roads.\n\n' +
        'Travel time emerges from traffic, it is not a fixed rimpull value. Per directed road: (1) a posted speed limit ' +
        'caps every truck; (2) FIFO car-following with a security-distance headway, so a fast truck caught behind a slow ' +
        'one is held and bunches, never overtaking; (3) a passing-bay meeting slowdown on opposing traffic. The live ' +
        'engine (model.ts) and the forkable rollout sim (rolloutSim.ts) apply these identically, checked by a ' +
        'byte-for-byte parity test, and the capacity oracle respects the same speed limit so it stays a valid bound.\n\n' +
        'The full-fidelity model (direction zones, per-section capacity, per-segment rimpull/retarder curves) lives in ' +
        'the minehaulsim PyPI package; its samples ship the real network as topo.json roads/v1, which the app renders and ' +
        'can mirror. So the synthetic cases carry a faithful per-road approximation and the structure-real samples carry ' +
        'minehaulsim’s exact roads.',
      body_es:
        'Los camiones recorren una red de caminos real, no líneas rectas mágicas. Cada acarreo sale del rajo por un ' +
        'portal único a un tronco de superficie compartido hasta un empalme, y luego un ramal curvo a su destino ' +
        '(chancador, botadero o acopio); el retorno vacío lo invierte. El mapa 2D y la vista 3D dibujan y recorren estos ' +
        'caminos.\n\n' +
        'El tiempo de viaje emerge del tráfico, no es un valor de rimpull fijo. Por camino dirigido: (1) un límite de ' +
        'velocidad posteado acota a todo camión; (2) seguimiento FIFO con distancia de seguridad, un camión rápido ' +
        'atrapado tras uno lento se retiene y forma pelotón, sin adelantar; (3) una demora de cruce en la berma ante ' +
        'tráfico opuesto. El motor en vivo (model.ts) y el simulador de rollout (rolloutSim.ts) los aplican idénticos, ' +
        'verificado por un test de paridad byte a byte, y el oráculo de capacidad respeta el mismo límite para seguir ' +
        'siendo cota válida.\n\n' +
        'El modelo de fidelidad plena (zonas de dirección, capacidad por tramo, curvas rimpull/retardador por segmento) ' +
        'vive en el paquete minehaulsim (PyPI); sus muestras traen la red real como topo.json roads/v1, que la app ' +
        'renderiza y puede reflejar. Así los casos sintéticos llevan una aproximación fiel por camino y las muestras ' +
        'estructura-real llevan los caminos exactos de minehaulsim.',
    },
    {
      id: 'lanes',
      en: 'Lanes, web / offline / compute',
      es: 'Carriles, web / offline / cómputo',
      svg: 'svg/tech/02-lanes.svg',
      body_en:
        'Three lanes, and the split is the point. Web (live, in the browser): the TypeScript discrete-event simulation ' +
        '(frontend/src/sim/) re-runs on every control and onnxruntime-web runs dl-policy.onnx + dl-bcbest.onnx in the ' +
        'decision inspector, no server. Offline / compute (a local machine, isolated .venv): the Python pipeline bakes ' +
        'the canonical case artifacts (the policy comparisons + replays) and the heavy lane (--retrain, .venv-precompute, ' +
        'torch) trains the learned dispatch policy + the behaviour-clone and exports them to ONNX. Replay: the small, ' +
        'committed artifacts in data/derived are overlaid into the SPA by copy-data.mjs and loaded live; the typed ' +
        'mirror (contract.types.ts) fails the build if the web and the pipeline shapes ever diverge.',
      body_es:
        'Tres carriles, y la división es lo central. Web (en vivo, en el navegador): la simulación de eventos discretos ' +
        'en TypeScript (frontend/src/sim/) se vuelve a ejecutar con cada control y onnxruntime-web ejecuta dl-policy.onnx + ' +
        'dl-bcbest.onnx en el inspector de decisión, sin servidor. Offline / cómputo (máquina local, .venv aislado): el ' +
        'pipeline Python precalcula los artefactos canónicos por caso (las comparaciones de políticas + replays) y el carril ' +
        'pesado (--retrain, .venv-precompute, torch) entrena la política de despacho aprendida + el clon de comportamiento ' +
        'y los exporta a ONNX. Replay: los artefactos pequeños y versionados en data/derived se superponen al SPA con ' +
        'copy-data.mjs y se cargan en vivo; el espejo tipado (contract.types.ts) rompe el build si la web y el pipeline divergen.',
    },
    {
      id: 'web-flow',
      en: 'Web-app flow',
      es: 'Flujo de la web',
      svg: 'svg/tech/03-web-flow.svg',
      body_en:
        'The App page recomputes live: inputs (the case selector or a custom mine/fleet, plus the policy and seed ' +
        'controls) feed the TypeScript discrete-event simulation and the onnxruntime-web decision inspector, which feed ' +
        'the interactive viz, the pit map, the throughput/match-factor/wait KPIs, the policy Pareto front and the ' +
        'per-decision scoring, each reading values back on hover/click. The six sibling pages (App · Introduction · ' +
        'Methodology · Implementation · Experiments · Benchmark) are identical across every CAOS product. The build is ' +
        'gated by the contract-type mirror, the artifacts are overlaid by copy-data, vite builds the static output, and ' +
        'GitHub Pages serves it at dispatchlab.fasl-work.com.',
      body_es:
        'La página App recalcula en vivo: las entradas (el selector de casos o una mina/flota propia, más los controles ' +
        'de política y semilla) alimentan la simulación de eventos discretos en TypeScript y el inspector de decisión ' +
        'onnxruntime-web, que alimentan la visualización interactiva, el mapa del rajo, los KPIs de throughput/match ' +
        'factor/espera, el frente de Pareto de políticas y el scoring por decisión, cada uno devolviendo valores al ' +
        'pasar/hacer clic. Las seis páginas hermanas (App · Introducción · Metodología · Implementación · Experimentos · ' +
        'Benchmark) son idénticas en todos los productos CAOS. El build lo controla el espejo de tipos del contrato, los ' +
        'artefactos los superpone copy-data, vite construye el estático y GitHub Pages lo sirve en dispatchlab.fasl-work.com.',
    },
    {
      id: 'science',
      en: 'The science',
      es: 'La ciencia',
      svg: 'svg/tech/04-the-science.svg',
      body_en:
        'The model is a discrete-event haulage simulation: ① a min-heap event queue advances the clock through load / ' +
        'haul / dump / return events (no fixed time step); ② kinematics give the travel time per segment from the grade, ' +
        'rolling resistance and load, plus the shovel load cycle; ③ at each truck-free event a dispatch policy (a ' +
        'heuristic or the learned NN) picks a shovel from its features; ④ over many seeds the policies are compared on ' +
        'tons / match factor / truck-wait and a Pareto front + a tie test pick the verdict. The analytical match factor ' +
        'MF = (n_trucks·t_shovel)/(n_shovels·t_truckcycle) anchors the balanced cases.\n\n' +
        'The deterministic DES + the heuristic policies are always on and transparent, the reference every learned ' +
        'policy is measured against. The learned lane: a dispatch NN (dl-policy) scores each shovel from features, and a ' +
        'behaviour-clone (dl-bcbest) imitates the best heuristic; both run client-side as ONNX in the decision inspector, ' +
        'reported by imitation accuracy, never as a black box.',
      body_es:
        'El modelo es una simulación de transporte por eventos discretos: ① una cola de eventos min-heap avanza el reloj ' +
        'por eventos de carga / acarreo / descarga / retorno (sin paso de tiempo fijo); ② la cinemática da el tiempo de ' +
        'viaje por segmento desde la pendiente, la resistencia a la rodadura y la carga, más el ciclo de carga de la ' +
        'pala; ③ en cada evento de camión libre una política de despacho (una heurística o la NN aprendida) elige una ' +
        'pala desde sus features; ④ sobre muchas semillas las políticas se comparan en toneladas / match factor / espera ' +
        'y un frente de Pareto + un test de empate eligen el veredicto. El match factor analítico MF = ' +
        '(n_camiones·t_pala)/(n_palas·t_ciclocamión) ancla los casos balanceados.\n\n' +
        'El DES determinista + las políticas heurísticas están siempre activos y son transparentes, la referencia ' +
        'contra la que se mide toda política aprendida. El carril aprendido: una NN de despacho (dl-policy) puntúa cada ' +
        'pala desde features, y un clon de comportamiento (dl-bcbest) imita la mejor heurística; ambos se ejecutan en el ' +
        'cliente como ONNX en el inspector de decisión, reportados por precisión de imitación, nunca como caja negra.',
    },
    {
      id: 'design',
      en: 'Data contracts / design',
      es: 'Contratos de datos / diseño',
      svg: 'svg/tech/05-data-contracts.svg',
      body_en:
        'Two validated data contracts bracket the pipeline. Contract 1 (ingestion) defines a valid mine + fleet, the ' +
        'shovels, roads (distance/grade/rolling resistance), truck specs and shift length, with range/NaN guards, so ' +
        'the app accepts external data, not just the built-in cases. Contract 2 (artifact) defines the output the web reads ' +
        '(per-case policy comparisons + replays, the learned imitation accuracy, the model index), mirrored exactly by ' +
        'contract.types.ts. Between them the staged, deterministic pipeline runs the lane gate (numpy-light by default, ' +
        '--retrain for the heavy torch lane) and writes a provenance manifest, so every result is reproducible and the ' +
        'web can never silently drift.',
      body_es:
        'Dos contratos de datos validados encierran el pipeline. El Contrato 1 (ingesta) define una mina + flota válida, ' +
        'las palas, caminos (distancia/pendiente/resistencia a la rodadura), specs de camión y largo de turno, con ' +
        'guardas de rango/NaN, para que la app acepte datos propios, no solo los casos incluidos. El Contrato 2 (artefacto) ' +
        'define la salida que lee la web (comparaciones de políticas + replays por caso, la precisión de imitación ' +
        'aprendida, el índice de modelos), espejada exactamente por contract.types.ts. Entre ambos, el pipeline por ' +
        'etapas y determinista ejecuta el lane gate (numpy-light por defecto, --retrain para el carril pesado de torch) y ' +
        'escribe un manifest de procedencia, de modo que cada resultado es reproducible y la web nunca diverge en silencio.',
    },
  ],
};
