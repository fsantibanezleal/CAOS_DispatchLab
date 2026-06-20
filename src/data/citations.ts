import { type Citation } from '@fasl-work/caos-app-shell';

// DOI-verified references (from the adversarial deep-research pass; the refuters corrected several DOIs and
// venues). Citations without a DOI are pre-DOI-era articles or handbooks (text only, no fabricated link).
export const CITATIONS: Citation[] = [
  // discrete-event simulation + determinism
  { id: 'banks2010', label: 'Banks et al. 2010', citation: 'Banks, J., Carson, J.S., Nelson, B.L., Nicol, D.M. (2010). Discrete-Event System Simulation, 5th ed., ch. 3 (event-scheduling, the future-event list). Pearson. ISBN 978-0136062127.' },
  { id: 'law2015', label: 'Law 2015', citation: 'Law, A.M. (2015). Simulation Modeling and Analysis, 5th ed., ch. 1 (event-list time advance), ch. 7 (RNGs), ch. 11 (common random numbers). McGraw-Hill. ISBN 978-0073401324.' },
  { id: 'lecuyer2002', label: "L'Ecuyer et al. 2002", citation: "L'Ecuyer, P., Simard, R., Chen, E.J., Kelton, W.D. (2002). An object-oriented random-number package with many long streams and substreams. Operations Research 50(6), 1073–1075.", doi: '10.1287/opre.50.6.1073.358' },
  { id: 'ieee754', label: 'IEEE 754-2019', citation: 'IEEE Std 754-2019. Correctly-rounded +, −, ×, ÷, √ are mandated; transcendental functions (exp, log, pow, sin) are only recommended — hence the per-engine determinism contract.' },
  // dispatch policies + OR
  { id: 'morgan1968', label: 'Morgan & Peterson 1968', citation: 'Morgan, W.C., Peterson, L.L. (1968). Determining shovel-truck productivity. Mining Engineering 20(12), 76–80. Origin of the classic (homogeneous) match factor (no DOI; pre-DOI era).' },
  { id: 'burt2007', label: 'Burt & Caccetta 2007', citation: 'Burt, C.N., Caccetta, L. (2007). Match factor for heterogeneous truck and loader fleets. International Journal of Mining, Reclamation and Environment 21(4), 262–270.', doi: '10.1080/17480930701388606' },
  { id: 'alarie2002', label: 'Alarie & Gamache 2002', citation: 'Alarie, S., Gamache, M. (2002). Overview of solution strategies used in truck dispatching systems for open-pit mines. International Journal of Surface Mining, Reclamation and Environment 16(1), 59–76.', doi: '10.1076/ijsm.16.1.59.3408' },
  { id: 'white1986', label: 'White & Olson 1986', citation: 'White, J.W., Olson, J.P. (1986). Computer-based dispatching in mines with concurrent operating objectives. Mining Engineering 38(11), 1045–1054. The multi-stage DISPATCH classic (commercialised as Modular Mining DISPATCH).' },
  { id: 'kuhn1955', label: 'Kuhn 1955', citation: 'Kuhn, H.W. (1955). The Hungarian method for the assignment problem. Naval Research Logistics Quarterly 2(1–2), 83–97.', doi: '10.1002/nav.3800020109' },
  { id: 'moradi2019', label: 'Moradi Afrapoli et al. 2019', citation: 'Moradi Afrapoli, A., Tabesh, M., Askari-Nasab, H. (2019). A multiple-objective transportation problem approach to dynamic truck dispatching in surface mines. European Journal of Operational Research 276(1), 331–342.', doi: '10.1016/j.ejor.2019.01.008' },
  // physics + stochastics
  { id: 'catHandbook', label: 'Caterpillar Performance Handbook', citation: 'Caterpillar Inc. Caterpillar Performance Handbook (many editions). Total resistance % = grade % + rolling-resistance %; enter the rimpull chart at TR %, intersect the gross-machine-weight line, read the gear and speed.' },
  { id: 'soofastaei2016', label: 'Soofastaei et al. 2016', citation: 'Soofastaei, A., Aminossadati, S.M., Kizil, M.S., Knights, P. (2016). A discrete-event model to simulate truck bunching due to payload variance. International Journal of Mining Science and Technology 26(5), 745–752.', doi: '10.1016/j.ijmst.2016.05.046' },
];
