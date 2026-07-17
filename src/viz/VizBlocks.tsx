/**
 * VizBlocks — Représentations visuelles HONNÊTES dans les réponses de l'IA.
 *
 * Principe : un visuel ne montre jamais de chiffre inventé. Il représente des
 * RELATIONS (opposition, structure, niveau), pas des mesures fabriquées.
 *
 * L'IA émet un marqueur sur sa propre ligne, ex :
 *   [CIA_VIZ:{"kind":"balance","basis":"qualitatif","pour":["..."],"contre":["..."]}]
 *
 * 3 visuels disponibles :
 *  - balance     → peser Pour / Contre (poids = nb d'arguments réellement listés)
 *  - argmap      → structure d'un raisonnement : prémisses → conclusion, failles
 *  - confidence  → fiabilité d'une affirmation par paliers (dérivé des sources)
 *
 * Le parsing est tolérant : marqueur invalide ou incomplet (streaming) → ignoré.
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { splitViz, normalizeMd } from './vizParse';
import { shareVerdict } from '../verdictShare';
import type {
  VizSpec, BalanceSpec, ArgMapSpec, ConfidenceSpec, ConfidenceLevel,
  VerdictSpec, FactVerdict, RiskLevel, ConsensusLevel, ConfidenceBand,
} from './vizParse';

export { splitViz, stripViz, normalizeMd } from './vizParse';
export type { VizSpec } from './vizParse';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ─── Petit badge "honnêteté" ──────────────────────────────────────────────────
function QualiTag({ label }: { label: string }) {
  return (
    <span className="text-[7px] font-black uppercase tracking-widest text-white/30 border border-white/15 px-1.5 py-0.5">
      {label}
    </span>
  );
}

// ─── Balance Pour / Contre ────────────────────────────────────────────────────
function Balance({ spec }: { spec: BalanceSpec }) {
  const pour = (spec.pour ?? []).filter(Boolean);
  const contre = (spec.contre ?? []).filter(Boolean);
  const total = pour.length + contre.length || 1;
  const pourPct = Math.round((pour.length / total) * 100);

  return (
    <div className="my-4 border border-white/10 bg-[#15171f] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <span className="text-sm">⚖️</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-white/60">
          {spec.title || 'Balance'}
        </span>
        <span className="ml-auto"><QualiTag label="Représentation qualitative" /></span>
      </div>

      {/* Barre de poids — proportionnelle au NOMBRE d'arguments listés */}
      <div className="flex h-1.5">
        <div className="bg-[#10B981]/70" style={{ width: `${pourPct}%` }} />
        <div className="bg-[#EF4444]/70" style={{ width: `${100 - pourPct}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/10">
        <div className="bg-black/30 p-3">
          <p className="text-[8px] font-black uppercase tracking-widest text-[#10B981] mb-2">
            Pour · {pour.length}
          </p>
          <ul className="space-y-1.5">
            {pour.map((t, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] text-white/85 leading-snug">
                <span className="text-[#10B981] flex-shrink-0">+</span><span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-black/30 p-3">
          <p className="text-[8px] font-black uppercase tracking-widest text-[#EF4444] mb-2">
            Contre · {contre.length}
          </p>
          <ul className="space-y-1.5">
            {contre.map((t, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] text-white/85 leading-snug">
                <span className="text-[#EF4444] flex-shrink-0">−</span><span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Carte d'arguments / arbre logique ─────────────────────────────────────────
function ArgMap({ spec }: { spec: ArgMapSpec }) {
  const premises = (spec.premises ?? []).filter((p) => p && p.text);

  return (
    <div className="my-4 border border-white/10 bg-[#15171f] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <span className="text-sm">🧩</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-white/60">
          {spec.title || "Structure de l'argument"}
        </span>
        <span className="ml-auto"><QualiTag label="Représentation qualitative" /></span>
      </div>

      <div className="p-3 space-y-2">
        {premises.map((p, i) => (
          <div key={i}>
            <div className={cx(
              'border-l-2 pl-2.5 py-1',
              p.flaw ? 'border-[#EF4444]' : 'border-[#5D7BFF]'
            )}>
              <p className="text-[7px] font-black uppercase tracking-widest text-white/40 mb-0.5">
                Prémisse {i + 1}
              </p>
              <p className="text-[11px] text-white/85 leading-snug">{p.text}</p>
              {p.flaw && (
                <p className="text-[10px] text-[#EF4444]/90 mt-1 flex gap-1">
                  <span className="flex-shrink-0">⚠</span><span>{p.flaw}</span>
                </p>
              )}
            </div>
          </div>
        ))}

        {spec.conclusion && (
          <>
            <div className="flex justify-center text-white/30 text-xs leading-none">↓</div>
            <div className="border-l-2 border-[#FBBF24] pl-2.5 py-1 bg-[#FBBF24]/5">
              <p className="text-[7px] font-black uppercase tracking-widest text-[#FBBF24]/80 mb-0.5">
                Conclusion
              </p>
              <p className="text-[11px] text-white leading-snug">{spec.conclusion}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Fiabilité par paliers ──────────────────────────────────────────────────────
const CONF_STEPS: { level: ConfidenceLevel; label: string; emoji: string; color: string }[] = [
  { level: 'non_verifie', label: 'Non vérifié', emoji: '❓', color: '#9CA3AF' },
  { level: 'a_confirmer', label: 'À confirmer', emoji: '⚠️', color: '#EF4444' },
  { level: 'etaye',       label: 'Étayé',       emoji: '✅', color: '#FBBF24' },
  { level: 'solide',      label: 'Solide',      emoji: '✅✅', color: '#10B981' },
];

function Confidence({ spec }: { spec: ConfidenceSpec }) {
  const activeIdx = CONF_STEPS.findIndex((s) => s.level === spec.level);
  const active = CONF_STEPS[activeIdx] ?? CONF_STEPS[0];

  return (
    <div className="my-4 border border-white/10 bg-[#15171f] rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Fiabilité</span>
        <span className="ml-auto text-[10px] font-black" style={{ color: active.color }}>
          {active.emoji} {active.label}
        </span>
      </div>

      {spec.claim && (
        <p className="text-[11px] text-white/80 italic leading-snug mb-2">« {spec.claim} »</p>
      )}

      {/* 4 paliers — seuls les paliers atteints sont colorés */}
      <div className="flex gap-1">
        {CONF_STEPS.map((s, i) => (
          <div
            key={s.level}
            className="h-1.5 flex-1"
            style={{ background: i <= activeIdx ? active.color : 'rgba(255,255,255,0.1)' }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        {CONF_STEPS.map((s, i) => (
          <span
            key={s.level}
            className="text-[6px] font-black uppercase tracking-wide"
            style={{ color: i === activeIdx ? active.color : 'rgba(255,255,255,0.25)' }}
          >
            {s.label}
          </span>
        ))}
      </div>

      {spec.note && <p className="text-[9px] text-white/45 mt-2">{spec.note}</p>}
    </div>
  );
}

// ─── Verdict (Fact-Checker V2) ───────────────────────────────────────────────────
const FACT_META: Record<FactVerdict, { label: string; color: string }> = {
  vrai:          { label: 'Vrai',              color: '#10B981' },
  probable_vrai: { label: 'Probablement vrai', color: '#34D399' },
  inconnu:       { label: 'Inconnu',           color: '#9CA3AF' },
  non_verifie:   { label: 'Non vérifié',       color: '#6B7280' },
  inconcluant:   { label: 'Inconcluant',       color: '#FBBF24' },
  probable_faux: { label: 'Probablement faux', color: '#F97316' },
  faux:          { label: 'Faux',              color: '#EF4444' },
};
const RISK_META: Record<RiskLevel, { label: string; color: string }> = {
  safe:      { label: 'Safe',      color: '#10B981' },
  faible:    { label: 'Faible',    color: '#84CC16' },
  modere:    { label: 'Modéré',    color: '#FBBF24' },
  dangereux: { label: 'Dangereux', color: '#F97316' },
  critique:  { label: 'Critique',  color: '#EF4444' },
};
const CONSENSUS_META: Record<ConsensusLevel, { label: string; color: string }> = {
  fort:        { label: 'Consensus fort',     color: '#10B981' },
  modere:      { label: 'Consensus modéré',   color: '#2DD4BF' },
  debattu:     { label: 'Sujet débattu',      color: '#FBBF24' },
  controverse: { label: 'Controversé',        color: '#F97316' },
  marginal:    { label: 'Position marginale', color: '#9CA3AF' },
};
const CONF_BANDS: { band: ConfidenceBand; label: string; color: string }[] = [
  { band: 'speculatif',    label: 'Spéculatif',    color: '#EF4444' },
  { band: 'faible',        label: 'Faible',        color: '#F97316' },
  { band: 'plausible',     label: 'Plausible',     color: '#FBBF24' },
  { band: 'eleve',         label: 'Élevé',         color: '#84CC16' },
  { band: 'quasi_certain', label: 'Quasi-certain', color: '#10B981' },
];

function VerdictRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] font-black uppercase tracking-widest text-white/40 w-[68px] shrink-0">{label}</span>
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
        style={{ color, background: `${color}1A`, border: `1px solid ${color}55` }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {value}
      </span>
    </div>
  );
}

function Verdict({ spec }: { spec: VerdictSpec }) {
  const f = FACT_META[spec.fact] ?? FACT_META.non_verifie;
  const r = RISK_META[spec.risk] ?? RISK_META.safe;
  const c = CONSENSUS_META[spec.consensus] ?? CONSENSUS_META.debattu;
  const confIdx = CONF_BANDS.findIndex((b) => b.band === spec.confidence);
  const conf = CONF_BANDS[confIdx] ?? CONF_BANDS[2];

  return (
    <div className="my-4 border border-white/10 bg-[#15171f] rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Verdict</span>
        <div className="ml-auto flex items-center gap-1.5">
          {spec.basis && (
            <span className="text-[7px] font-black uppercase tracking-widest text-white/30 border border-white/15 px-1 py-px">
              {spec.basis === 'sources' ? 'sources' : spec.basis === 'donnees_utilisateur' ? 'tes données' : 'qualitatif'}
            </span>
          )}
          <button
            onClick={() => { shareVerdict(spec).catch(() => {}); }}
            className="text-[7px] font-black uppercase tracking-widest text-white/40 hover:text-white border border-white/15 hover:border-white/40 px-1.5 py-px rounded-sm transition-colors"
            title="Partager ce verdict en image"
          >
            ↗ Partager
          </button>
        </div>
      </div>

      {spec.claim && (
        <p className="text-[11px] text-white/80 italic leading-snug mb-3">« {spec.claim} »</p>
      )}

      <div className="space-y-1.5">
        <VerdictRow label="Fact" value={f.label} color={f.color} />
        <VerdictRow label="Risque" value={r.label} color={r.color} />
        <VerdictRow label="Consensus" value={c.label} color={c.color} />
      </div>

      {/* Confiance — bande qualitative (jamais un décimal fabriqué) */}
      <div className="mt-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8px] font-black uppercase tracking-widest text-white/40 w-[68px] shrink-0">Confiance</span>
          <span className="text-[10px] font-black" style={{ color: conf.color }}>{conf.label}</span>
        </div>
        <div className="flex gap-1">
          {CONF_BANDS.map((b, i) => (
            <div key={b.band} className="h-1.5 flex-1" style={{ background: i <= confIdx ? conf.color : 'rgba(255,255,255,0.1)' }} />
          ))}
        </div>
      </div>

      {spec.note && <p className="text-[9px] text-white/45 mt-2.5 leading-snug">{spec.note}</p>}
    </div>
  );
}

// ─── Aiguilleur ─────────────────────────────────────────────────────────────────
function VizRenderer({ spec }: { spec: VizSpec }) {
  switch (spec.kind) {
    case 'balance':    return <Balance spec={spec} />;
    case 'argmap':     return <ArgMap spec={spec} />;
    case 'confidence': return <Confidence spec={spec} />;
    case 'verdict':    return <Verdict spec={spec} />;
    default:           return null;
  }
}

// Avis discret quand un marqueur a été émis mais que son JSON est invalide —
// évite que le visuel « disparaisse » silencieusement.
function VizFail() {
  return (
    <div className="my-3 border border-[#FBBF24]/30 bg-[#FBBF24]/5 px-3 py-2">
      <p className="text-[9px] text-[#FBBF24]/80 leading-snug">
        ⚠️ Un visuel était prévu ici mais son format n'a pas pu être affiché.
      </p>
    </div>
  );
}

// ─── Wrapper : remplace <ReactMarkdown> et intercale les visuels ────────────────
export function RichContent({
  text,
  components,
  streaming = false,
}: {
  text: string;
  components: Record<string, unknown>;
  streaming?: boolean;
}) {
  const segments = splitViz(text, { streaming });
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          seg.value.trim() ? (
            <ReactMarkdown key={i} components={components} remarkPlugins={[remarkGfm]}>
              {normalizeMd(seg.value)}
            </ReactMarkdown>
          ) : null
        ) : seg.type === 'vizfail' ? (
          <VizFail key={i} />
        ) : (
          <VizRenderer key={i} spec={seg.value} />
        )
      )}
    </>
  );
}
