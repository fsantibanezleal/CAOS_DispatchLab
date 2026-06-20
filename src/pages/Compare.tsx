import { useMemo, useState } from 'react';
import { useShellLang } from '@fasl-work/caos-app-shell';
import { CASES, caseById } from '../sim/cases';
import { comparePolicies, paretoFront, tieVerdict, POLICY_COLOR, type PolicyStats } from '../sim/compare';
import { ParetoScatter } from '../viz/ParetoScatter';

const SEEDS = [3, 7, 11, 17, 23, 29, 37, 42, 59, 71];

const T = {
  en: { title: 'Compare', lede: 'Every policy on the same case and the same seed set — because a policy\'s outcome is a distribution, not one number. Dispatch is multi-objective (tonnes vs truck wait), so the honest summary is a Pareto frontier and a tie rule.',
    case: 'Case', front: 'On the Pareto frontier', bars: 'Median tonnes & truck wait (p10–p90 band)', verdict: 'Verdict',
    tonnes: 'tonnes', wait: 'wait', band: 'band', leads: 'leads on tonnes beyond the seed band', ties: 'ties (within the seed band) with',
    note: 'A policy\'s ranking is case- and seed-specific — no single overconfident winner. On a balanced or over-trucked pit the policies are often statistically indistinguishable (overlapping bands); on an asymmetric pit they genuinely diverge. Synthetic, physics-grounded; deterministic in each seed.' },
  es: { title: 'Comparar', lede: 'Cada política sobre el mismo caso y el mismo conjunto de semillas — porque el resultado de una política es una distribución, no un número. El despacho es multi-objetivo (toneladas vs espera de camión), así que el resumen honesto es una frontera de Pareto y una regla de empate.',
    case: 'Caso', front: 'En la frontera de Pareto', bars: 'Toneladas y espera medianas (banda p10–p90)', verdict: 'Veredicto',
    tonnes: 'toneladas', wait: 'espera', band: 'banda', leads: 'lidera en toneladas más allá de la banda de semilla', ties: 'empata (dentro de la banda de semilla) con',
    note: 'El ranking de una política es específico del caso y la semilla — sin un ganador único sobreconfiado. En un rajo equilibrado o sobre-camionado las políticas suelen ser estadísticamente indistinguibles (bandas que se solapan); en uno asimétrico divergen de verdad. Sintético, físicamente fundado; determinista en cada semilla.' },
};

function Bars({ stats, lang }: { stats: PolicyStats[]; lang: 'en' | 'es' }) {
  const es = lang === 'es';
  const maxT = Math.max(...stats.map((s) => s.hiT));
  const maxW = Math.max(...stats.map((s) => s.hiW), 0.1);
  return (
    <div className="dl-bars">
      {[...stats].sort((a, b) => b.medTonnes - a.medTonnes).map((s) => (
        <div key={s.id} className="dl-bar-row">
          <div className="dl-bar-label"><span className="dl-dot" style={{ background: POLICY_COLOR[s.id] }} /> {(es ? s.es : s.en).split(' (')[0]}</div>
          <div className="dl-bar-pair">
            <div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${(s.medTonnes / maxT) * 100}%`, background: POLICY_COLOR[s.id] }} /><span className="dl-bar-band" style={{ left: `${(s.loT / maxT) * 100}%`, width: `${((s.hiT - s.loT) / maxT) * 100}%` }} /></div>
            <span className="dl-bar-num mono">{(s.medTonnes / 1000).toFixed(1)}k t</span>
          </div>
          <div className="dl-bar-pair">
            <div className="dl-bar"><span className="dl-bar-fill" style={{ width: `${(s.medWaitH / maxW) * 100}%`, background: 'var(--color-fg-subtle)' }} /><span className="dl-bar-band" style={{ left: `${(s.loW / maxW) * 100}%`, width: `${((s.hiW - s.loW) / maxW) * 100}%` }} /></div>
            <span className="dl-bar-num mono">{s.medWaitH.toFixed(1)} h</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Compare() {
  const lang = useShellLang(); const es = lang === 'es'; const t = T[lang];
  const [caseId, setCaseId] = useState('C05');
  const c = caseById(caseId);
  const stats = useMemo(() => comparePolicies(c, SEEDS), [c]);
  const front = useMemo(() => paretoFront(stats), [stats]);
  const tie = useMemo(() => tieVerdict(stats), [stats]);
  const name = (id: string) => { const s = stats.find((x) => x.id === id)!; return (es ? s.es : s.en).split(' (')[0]; };
  const frontNames = stats.filter((s) => front.has(s.id)).map((s) => name(s.id));

  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{t.title}</h1>
        <p className="lede">{t.lede}</p>
      </div>
      <section>
        <div className="dl-chips" style={{ marginBottom: '0.6rem' }}>
          {CASES.filter((x) => x.id !== 'C12').map((x) => <button key={x.id} className={`chip ${caseId === x.id ? 'on' : ''}`} onClick={() => setCaseId(x.id)} title={x.name}>{x.id}</button>)}
          <span className="muted small" style={{ alignSelf: 'center', marginLeft: '0.4rem' }}>{c.name}</span>
        </div>

        <ParetoScatter stats={stats} front={front} lang={lang} />
        <p className="muted small">{t.front}: <b>{frontNames.join(', ')}</b> · {SEEDS.length} {es ? 'semillas' : 'seeds'}</p>

        <h2>{t.bars}</h2>
        <Bars stats={stats} lang={lang} />

        <div className="dl-verdict card">
          <div className="dl-diag-h">{t.verdict}</div>
          <p className="small" style={{ margin: '0.3rem 0 0' }}>
            <b>{name(tie.leader)}</b> {tie.tied.length === 0 ? t.leads : <>{t.ties} <b>{tie.tied.map(name).join(', ')}</b></>}.
          </p>
        </div>
        <p className="hint dl-note">{t.note}</p>
      </section>
    </div>
  );
}
