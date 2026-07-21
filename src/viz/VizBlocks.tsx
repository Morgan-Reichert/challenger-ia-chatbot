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
import { shareVerdict, CARD_THEMES } from '../verdictShare';
import { getShareContext } from '../shareContext';
import type {
  VizSpec, BalanceSpec, ArgMapSpec, ConfidenceSpec, ConfidenceLevel,
  VerdictSpec, FactVerdict, RiskLevel, ConsensusLevel, ConfidenceBand,
} from './vizParse';
import { Scale, Puzzle, AlertTriangle } from 'lucide-react';

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
        <Scale className="w-3.5 h-3.5" />
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
        <Puzzle className="w-3.5 h-3.5" />
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
                  <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /><span>{p.flaw}</span>
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
const CONF_STEPS: { level: ConfidenceLevel; label: string; color: string }[] = [
  { level: 'non_verifie', label: 'Non vérifié', color: '#9CA3AF' },
  { level: 'a_confirmer', label: 'À confirmer', color: '#EF4444' },
  { level: 'etaye',       label: 'Étayé',       color: '#FBBF24' },
  { level: 'solide',      label: 'Solide',      color: '#10B981' },
];

function Confidence({ spec }: { spec: ConfidenceSpec }) {
  const activeIdx = CONF_STEPS.findIndex((s) => s.level === spec.level);
  const active = CONF_STEPS[activeIdx] ?? CONF_STEPS[0];

  return (
    <div className="my-4 border border-white/10 bg-[#15171f] rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Fiabilité</span>
        <span className="ml-auto text-[10px] font-black" style={{ color: active.color }}>
          {active.label}
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
// Phrase en clair de l'axe FAIT — c'est LA réponse, exprimée sans ambiguïté.
const FACT_PHRASE: Record<FactVerdict, string> = {
  vrai:          'Cette affirmation est exacte.',
  probable_vrai: 'Cette affirmation est probablement exacte.',
  inconnu:       'Impossible de trancher avec les éléments disponibles.',
  non_verifie:   'Non vérifié, faute de sources fiables.',
  inconcluant:   'Les éléments ne permettent pas de trancher.',
  probable_faux: 'Cette affirmation est probablement fausse.',
  faux:          'Cette affirmation est fausse.',
};
// Risque : « safe » en gris neutre (et non vert) — le vert reste réservé au
// FAIT vrai, pour qu'aucun vert ne soit lu comme « l'IA te donne raison ».
const RISK_META: Record<RiskLevel, { label: string; color: string }> = {
  safe:      { label: 'Aucun risque notable', color: '#64748B' },
  faible:    { label: 'Risque faible',        color: '#F59E0B' },
  modere:    { label: 'Risque modéré',        color: '#FBBF24' },
  dangereux: { label: 'Dangereux',            color: '#F97316' },
  critique:  { label: 'Critique',             color: '#EF4444' },
};
// Consensus : échelle NEUTRE (indigo = intensité de l'accord des spécialistes),
// jamais vert/rouge. Un consensus fort AUTOUR d'un fait FAUX ne doit pas verdir.
const CONSENSUS_META: Record<ConsensusLevel, { label: string; color: string }> = {
  fort:        { label: 'Consensus fort des spécialistes', color: '#6366F1' },
  modere:      { label: 'Consensus modéré',                color: '#818CF8' },
  debattu:     { label: 'Sujet débattu',                   color: '#94A3B8' },
  controverse: { label: 'Sujet controversé',               color: '#94A3B8' },
  marginal:    { label: 'Position marginale',              color: '#64748B' },
};
// Confiance : échelle NEUTRE (bleu = solidité des preuves du verdict), pas de
// vert/rouge — la confiance porte sur les PREUVES, pas sur l'opinion de l'user.
const CONF_BANDS: { band: ConfidenceBand; label: string; color: string }[] = [
  { band: 'speculatif',    label: 'Spéculatif',    color: '#CBD5E1' },
  { band: 'faible',        label: 'Faible',        color: '#94A3B8' },
  { band: 'plausible',     label: 'Plausible',     color: '#60A5FA' },
  { band: 'eleve',         label: 'Élevé',         color: '#3B82F6' },
  { band: 'quasi_certain', label: 'Quasi-certain', color: '#2563EB' },
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

  // Menu de partage : verdict seul (QR → vitrine) ou conversation (QR → lien
  // de consultation + appel à l'action au pseudo), avec choix du thème visuel.
  const [menu, setMenu] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [themeId, setThemeId] = React.useState<string>(() => {
    try { return localStorage.getItem('cia_card_theme') || 'nuit'; } catch { return 'nuit'; }
  });
  const choisirTheme = (id: string) => {
    setThemeId(id);
    try { localStorage.setItem('cia_card_theme', id); } catch { /* stockage indispo */ }
  };
  const ctx = getShareContext();
  const partagerVerdict = () => { setMenu(false); shareVerdict(spec, { themeId }).catch(() => {}); };
  const partagerConversation = async () => {
    setMenu(false);
    if (!ctx) { shareVerdict(spec, { themeId }).catch(() => {}); return; }
    setBusy(true);
    const url = await ctx.creerLienConversation().catch(() => null);
    setBusy(false);
    shareVerdict(spec, { conversationUrl: url, pseudo: ctx.pseudo, themeId }).catch(() => {});
  };

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
          <div className="relative">
            <button
              onClick={() => setMenu((o) => !o)}
              disabled={busy}
              className="text-[7px] font-black uppercase tracking-widest text-white/40 hover:text-white border border-white/15 hover:border-white/40 px-1.5 py-px rounded-sm transition-colors disabled:opacity-50"
              title="Partager ce verdict en image"
            >
              {busy ? '…' : '↗ Partager'}
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-[#1c1f2b] border border-white/15 rounded-lg shadow-xl overflow-hidden">
                  {/* Choix du thème visuel de la carte */}
                  <div className="px-3 py-2 border-b border-white/10">
                    <span className="block text-[8px] font-black uppercase tracking-widest text-white/40 mb-1.5">Thème de la carte</span>
                    <div className="flex items-center gap-1.5">
                      {CARD_THEMES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => choisirTheme(t.id)}
                          title={t.nom}
                          className={cx('w-7 h-7 rounded-md border-2 transition-all', themeId === t.id ? 'border-white scale-110' : 'border-white/20 hover:border-white/50')}
                          style={{ background: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})` }}
                        >
                          <span className="block w-1.5 h-1.5 mx-auto rounded-full" style={{ background: t.liser }} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={partagerVerdict} className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors">
                    <span className="block text-[10px] font-black text-white/90">Ce verdict</span>
                    <span className="block text-[8px] text-white/40">Image + QR vers Challenger IA</span>
                  </button>
                  <button
                    onClick={partagerConversation}
                    disabled={!ctx?.peutPartagerConversation}
                    className="w-full text-left px-3 py-2 border-t border-white/10 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="block text-[10px] font-black text-white/90">La conversation complète</span>
                    <span className="block text-[8px] text-white/40">
                      {ctx?.peutPartagerConversation ? 'QR vers la conversation + ton pseudo' : 'Connecte-toi pour partager'}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {spec.claim && (
        <p className="text-[11px] text-white/80 italic leading-snug mb-2.5">« {spec.claim} »</p>
      )}

      {/* FAIT — la réponse, dominante et sans ambiguïté. Seul axe où le vert
          veut dire « vrai » et le rouge « faux ». */}
      <div className="rounded-lg px-3 py-2.5" style={{ background: `${f.color}1A`, border: `1.5px solid ${f.color}` }}>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.color }} />
          <span className="text-[14px] font-black uppercase tracking-wide" style={{ color: f.color }}>{f.label}</span>
        </div>
        {FACT_PHRASE[spec.fact] && (
          <p className="text-[11px] mt-1 leading-snug font-semibold" style={{ color: f.color }}>{FACT_PHRASE[spec.fact]}</p>
        )}
      </div>

      {/* Solidité & contexte — axes NEUTRES qui QUALIFIENT le verdict ci-dessus.
          Aucun vert « validation » ici : ils ne disent pas si l'user a raison. */}
      <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mt-3 mb-1.5">
        Solidité &amp; contexte du verdict
      </p>
      <div className="space-y-1.5">
        <VerdictRow label="Consensus" value={c.label} color={c.color} />
        <VerdictRow label="Risque" value={r.label} color={r.color} />
      </div>

      {/* Confiance — bande d'intensité NEUTRE (solidité des preuves) */}
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

      <p className="text-[8px] text-white/35 mt-2.5 leading-snug">
        Consensus &amp; confiance mesurent la <strong className="text-white/55 font-black">solidité de ce verdict</strong>, pas si ton opinion est validée : un consensus fort peut confirmer qu'une affirmation est <em>fausse</em>.
      </p>

      {spec.note && <p className="text-[9px] text-white/45 mt-2 leading-snug">{spec.note}</p>}
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
        Un visuel était prévu ici mais son format n'a pas pu être affiché.
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
