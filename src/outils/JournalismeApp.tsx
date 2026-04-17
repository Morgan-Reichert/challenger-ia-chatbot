import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Send, Loader2, X, Sparkles,
  Search, AlertTriangle, FileText, Mic, Scale, Eye,
  Zap, Target, RotateCcw, Plus, ChevronRight,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function cx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ModeId =
  | 'fact_check' | 'biais' | 'sources' | 'interview_prep'
  | 'communique' | 'spin' | 'redaction' | 'angle';

interface ModeConfig {
  id: ModeId;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  systemPrompt: string;
  accentColor: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modeId: ModeId;
  timestamp: Date;
}

interface Session {
  id: string;
  title: string;
  modeId: ModeId;
  messages: ChatMessage[];
  createdAt: Date;
}

// ─── Modes config ─────────────────────────────────────────────────────────────

const MODES: ModeConfig[] = [
  {
    id: 'fact_check',
    label: 'Fact-Check',
    shortLabel: 'Fact',
    icon: Search,
    description: 'Vérification rigoureuse d\'affirmations et déclarations',
    inputLabel: 'Affirmation à vérifier',
    inputPlaceholder: 'Collez l\'affirmation, le chiffre ou la déclaration à vérifier…',
    accentColor: '#E85D04',
    systemPrompt: `Tu es un fact-checker professionnel senior, méthodique et impartial.

Analyse l'affirmation soumise avec la rigueur d'une rédaction de vérification des faits.

Structure OBLIGATOIRE de ta réponse :

## Verdict
**VRAI / FAUX / TROMPEUR / NON VÉRIFIABLE / NUANCÉ** — justification en une phrase.

## Analyse détaillée
Déconstruction factuelle de chaque élément de l'affirmation.

## Sources & références
Données officielles, études, organismes de référence pertinents.

## Contexte manquant
Ce que l'affirmation omet, déforme ou simplifie abusivement.

## Conclusion
Reformulation précise et honnête de la réalité.

Sois direct, sans concession. Si tu ne peux pas vérifier, dis-le clairement.`,
  },
  {
    id: 'biais',
    label: 'Détection de biais',
    shortLabel: 'Biais',
    icon: Scale,
    description: 'Identification des biais cognitifs, rhétoriques et idéologiques',
    inputLabel: 'Texte ou article à analyser',
    inputPlaceholder: 'Collez l\'article, le discours ou l\'extrait à analyser…',
    accentColor: '#7C3AED',
    systemPrompt: `Tu es un expert en analyse critique des médias et en détection des biais.

## Biais détectés
Liste exhaustive : nom du biais, définition courte, exemple précis dans le texte.

## Biais cognitifs
Anchoring, confirmation bias, framing effect, disponibilité heuristique, etc.

## Biais rhétoriques
Appel à l'émotion, strawman, cherry-picking, faux dilemme, etc.

## Biais idéologiques
Orientation politique, économique ou culturelle identifiable.

## Techniques de manipulation
Loaded language, whataboutism, fausse équivalence, etc.

## Score de neutralité
X/10 — justification.

## Reformulation neutre
Comment réécrire l'argument clé de façon impartiale.

Ne fais aucun compromis. Si le texte est partial, dis-le.`,
  },
  {
    id: 'sources',
    label: 'Analyse de sources',
    shortLabel: 'Sources',
    icon: Eye,
    description: 'Évaluation de la crédibilité et fiabilité des sources',
    inputLabel: 'Sources à analyser',
    inputPlaceholder: 'Listez les sources, experts, organismes ou un extrait avec références…',
    accentColor: '#0891B2',
    systemPrompt: `Tu es un expert en évaluation des sources journalistiques et scientifiques.

Pour chaque source identifiée :

## [Nom de la source]
- **Crédibilité** : A/B/C/D
- **Intérêts & conflits** : financement, affiliations, partis pris
- **Expertise réelle** : est-ce un expert du sujet précis ?
- **Vérifiabilité** : source primaire / secondaire / anonyme
- **Signaux d'alerte** : antécédents, rétractations, biais connus
- **Recommandation** : utiliser / utiliser avec précaution / éviter

## Synthèse globale
Niveau de fiabilité de l'ensemble. Sans concession.`,
  },
  {
    id: 'interview_prep',
    label: 'Prép. Interview',
    shortLabel: 'Interview',
    icon: Mic,
    description: 'Questions incisives pour interviews journalistiques',
    inputLabel: 'Sujet & profil de l\'interviewé',
    inputPlaceholder: 'Ex: "PDG de Total sur la transition énergétique — il défend le maintien du pétrole jusqu\'en 2050"',
    accentColor: '#E85D04',
    systemPrompt: `Tu es un journaliste d'investigation senior spécialisé dans les interviews confrontationnelles.

## Contexte stratégique
Ce que l'interviewé veut éviter, ses angles morts, ses contradictions publiques connues.

## Questions d'ouverture (3)
Directes, non-complaisantes, qui mettent d'emblée en position de justification.

## Questions de fond (6)
Structurées pour creuser les contradictions, chiffres contestables, positions fragiles.

## Questions pièges (3)
En apparence anodines mais révélatrices des angles morts.

## Relances préparées
Pour les 3 réponses évasives les plus probables — comment les contrer.

## Documents à avoir en main
Chiffres, déclarations passées, rapports à citer.

## Question à ne pas manquer
Celle qu'il faut absolument poser, même si inconfortable.`,
  },
  {
    id: 'communique',
    label: 'Décryptage CP',
    shortLabel: 'Communiqué',
    icon: FileText,
    description: 'Analyse critique de communiqués de presse officiels',
    inputLabel: 'Communiqué de presse',
    inputPlaceholder: 'Collez le communiqué ou la déclaration officielle à analyser…',
    accentColor: '#059669',
    systemPrompt: `Tu es un journaliste senior expert en décryptage de communication institutionnelle.

## Message voulu
Ce que l'émetteur veut que vous reteniez.

## Ce qui est dit vs ce qui est tu
Informations absentes, données manquantes, contexte omis délibérément.

## Chiffres & données
Vérification des ordres de grandeur, cherry-picking, absence de comparaisons.

## Langage codé
Traduction en langage direct de chaque formulation édulcorée.

## Spin identifié
Techniques de communication pour orienter la perception.

## 5 questions à poser
Ce que tout journaliste devrait soumettre à l'émetteur.

## Angle journalistique
Comment traiter ce communiqué de façon indépendante.

## Note de transparence
X/10 — évaluation globale de l'honnêteté.`,
  },
  {
    id: 'spin',
    label: 'Anti-Spin',
    shortLabel: 'Spin',
    icon: AlertTriangle,
    description: 'Détection de propagande et manipulation de l\'opinion',
    inputLabel: 'Discours ou message à analyser',
    inputPlaceholder: 'Collez le discours politique, message publicitaire ou tout contenu suspect…',
    accentColor: '#DC2626',
    systemPrompt: `Tu es un expert en techniques de propagande, spin politique et manipulation de l'opinion.

## Techniques de spin
Liste exhaustive avec exemple précis dans le texte.

## Charged language
Mots émotionnellement chargés, connotations manipulatrices.

## Structures de manipulation
Fausse urgence, faux consensus, enemy framing, us vs them, etc.

## Omissions stratégiques
Ce qui est délibérément absent du message.

## Appels irrationnels
À la peur, à la fierté, à l'identité, à l'autorité fictive.

## Réalité vs message
Ce que les faits disent versus ce que le message implique.

## Objectif caché
Quel comportement ou opinion veut-on induire ?

## Version désintoxiquée
Réécriture du message clé sans manipulation.

**Score de manipulation : X/10** — verdict final.`,
  },
  {
    id: 'redaction',
    label: 'Critique Rédac.',
    shortLabel: 'Rédac.',
    icon: Zap,
    description: 'Critique professionnelle sans concession de textes',
    inputLabel: 'Article ou texte à critiquer',
    inputPlaceholder: 'Collez votre article ou brouillon pour une critique de rédacteur en chef…',
    accentColor: '#B45309',
    systemPrompt: `Tu es un rédacteur en chef exigeant d'un grand quotidien national.

## Jugement global
**Publiable tel quel / À retravailler / À refaire** — avec justification immédiate.

## Structure
Accroche, pyramide inversée, transitions, conclusion — ce qui fonctionne et non.

## Clarté & précision
Formulations vagues, jargon inutile, ambiguïtés.

## Équilibre & contradictoire
Les voix manquantes, les points de vue absents.

## Solidité factuelle
Affirmations non sourcées, approximations, erreurs.

## Style
Longueur des phrases, répétitions, ton inadapté.

## Titre & chapeau
Reflètent-ils honnêtement le contenu ?

## 3 coupures prioritaires
Ce qu'on enlèverait en premier.

## 3 ajouts nécessaires
Ce qui manque impérativement.

Sois sans ménagement. Un bon rédac' en chef ne ment pas.`,
  },
  {
    id: 'angle',
    label: 'Story Angle',
    shortLabel: 'Angle',
    icon: Target,
    description: 'Trouver l\'angle original et percutant d\'un sujet',
    inputLabel: 'Sujet ou événement',
    inputPlaceholder: 'Décrivez l\'événement, le sujet ou la thématique…',
    accentColor: '#0891B2',
    systemPrompt: `Tu es un journaliste d'investigation créatif, reconnu pour tes angles originaux.

## Angle principal recommandé
Le plus fort, le plus original. Titre provisoire + pourquoi ça marche.

## 4 angles alternatifs
Chacun avec titre, problématique centrale et pourquoi ça fonctionne.

## L'angle contre-intuitif
Celui que personne ne prendrait mais qui révèle quelque chose de plus profond.

## L'angle données
Si des chiffres peuvent transformer ce sujet en investigation.

## Public cible
Pour chaque angle — qui ça intéresse vraiment et pourquoi.

## Potentiel de série
Est-ce qu'un angle peut devenir une enquête long terme ?

## À éviter
Les angles trop évidents, déjà traités, sans intérêt public.`,
  },
];

const MODES_MAP = Object.fromEntries(MODES.map(m => [m.id, m])) as Record<ModeId, ModeConfig>;

function uid() { return Math.random().toString(36).slice(2, 11); }

// ─── Logo component ───────────────────────────────────────────────────────────

function CRLogo({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/logo-journalisme.png"
      alt="Challenger Reporter"
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
      onError={e => {
        // Fallback if logo not placed yet
        (e.currentTarget as HTMLImageElement).style.display = 'none';
        (e.currentTarget.nextSibling as HTMLElement | null)?.style.setProperty('display', 'flex');
      }}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = { onBack: () => void; user: FirebaseUser | null };

export default function JournalismeApp({ onBack }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<ModeConfig>(MODES[0]);
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [followUpText, setFollowUpText] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, sending]);

  // ── Open mode modal ──────────────────────────────────────────────────────
  const openMode = (mode: ModeConfig) => {
    setActiveMode(mode);
    setInputText('');
    setInputModalOpen(true);
    setMobileSidebarOpen(false);
  };

  // ── Stream AI response ────────────────────────────────────────────────────
  const streamResponse = useCallback(async (
    sessionId: string,
    msgId: string,
    mode: ModeConfig,
    history: { role: 'user' | 'assistant'; content: string }[],
    userText: string
  ) => {
    setSending(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: 'mistral-large-latest',
          temperature: 0.3,
          stream: true,
          messages: [
            { role: 'system', content: mode.systemPrompt },
            ...history,
            { role: 'user', content: userText },
          ],
        }),
      });

      if (!res.ok || !res.body) throw new Error('API error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.replace(/^data:\s*/, '').trim();
          if (!trimmed || trimmed === '[DONE]') continue;
          try {
            const delta = JSON.parse(trimmed).choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              setSessions(prev => prev.map(s =>
                s.id !== sessionId ? s : {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === msgId ? { ...m, content: accumulated } : m
                  ),
                }
              ));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setSessions(prev => prev.map(s =>
          s.id !== sessionId ? s : {
            ...s,
            messages: s.messages.map(m =>
              m.id === msgId ? { ...m, content: '*Erreur lors de l\'analyse. Vérifiez votre connexion.*' } : m
            ),
          }
        ));
      }
    } finally {
      setSending(false);
    }
  }, []);

  // ── Start new analysis ────────────────────────────────────────────────────
  const startAnalysis = useCallback(async () => {
    if (!inputText.trim()) return;
    const mode = activeMode;
    const text = inputText.trim();
    setInputModalOpen(false);
    setInputText('');

    const sessionId = uid();
    const userMsgId = uid();
    const asstMsgId = uid();
    const now = new Date();

    const session: Session = {
      id: sessionId,
      title: `${mode.label} — ${text.slice(0, 45)}${text.length > 45 ? '…' : ''}`,
      modeId: mode.id,
      createdAt: now,
      messages: [
        { id: userMsgId, role: 'user', content: text, modeId: mode.id, timestamp: now },
        { id: asstMsgId, role: 'assistant', content: '', modeId: mode.id, timestamp: now },
      ],
    };

    setSessions(prev => [session, ...prev]);
    setActiveSessionId(sessionId);

    await streamResponse(sessionId, asstMsgId, mode, [], text);
  }, [inputText, activeMode, streamResponse]);

  // ── Follow-up in current session ──────────────────────────────────────────
  const sendFollowUp = useCallback(async () => {
    if (!followUpText.trim() || !activeSession || sending) return;
    const text = followUpText.trim();
    setFollowUpText('');
    const mode = MODES_MAP[activeSession.modeId];
    const now = new Date();
    const userMsgId = uid();
    const asstMsgId = uid();

    const history = activeSession.messages.map(m => ({ role: m.role, content: m.content }));

    setSessions(prev => prev.map(s =>
      s.id !== activeSession.id ? s : {
        ...s,
        messages: [
          ...s.messages,
          { id: userMsgId, role: 'user' as const, content: text, modeId: s.modeId, timestamp: now },
          { id: asstMsgId, role: 'assistant' as const, content: '', modeId: s.modeId, timestamp: now },
        ],
      }
    ));

    await streamResponse(activeSession.id, asstMsgId, mode, history, text);
  }, [followUpText, activeSession, sending, streamResponse]);

  const currentMode = activeSession ? MODES_MAP[activeSession.modeId] : null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden" style={{ background: '#0d0d0d' }}>

      {/* ── Top bar ── */}
      <div
        className="flex-shrink-0 flex items-center gap-0 border-b-2 z-10"
        style={{ background: '#111', borderColor: '#E85D04', minHeight: '56px' }}
      >
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center justify-center px-4 h-full hover:bg-white/5 transition-colors flex-shrink-0"
          style={{ color: '#E85D04', borderRight: '1px solid rgba(232,93,4,0.2)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Logo + title */}
        <div className="flex items-center gap-3 px-4 flex-1 min-w-0">
          <div className="flex-shrink-0 relative">
            <CRLogo size={32} />
            {/* Fallback logo */}
            <div
              className="w-8 h-8 flex items-center justify-center text-xs font-black absolute inset-0"
              style={{ display: 'none', background: '#E85D04', color: 'white', fontSize: '10px' }}
            >
              CR
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-black uppercase tracking-widest text-white leading-none">
              Challenger Reporter
            </p>
            <p className="text-[8px] font-bold uppercase tracking-widest mt-0.5" style={{ color: 'rgba(232,93,4,0.6)' }}>
              {currentMode ? `Mode ${currentMode.label}` : 'Suite journalisme · Moteur Challenger IA'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0 flex-shrink-0" style={{ borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
          {activeSession && (
            <button
              onClick={() => { abortRef.current?.abort(); setSessions([]); setActiveSessionId(null); setSending(false); }}
              className="flex items-center gap-1.5 px-4 h-full text-white/25 hover:text-white/60 transition-colors text-[9px] font-black uppercase tracking-widest"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setMobileSidebarOpen(v => !v)}
            className="flex items-center justify-center px-4 h-full text-white/30 hover:text-white/70 transition-colors md:hidden"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Body: sidebar + main ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ── Left sidebar ── */}
        <div
          className={cx(
            'flex-shrink-0 flex flex-col border-r overflow-y-auto transition-all duration-200',
            'md:w-56 md:translate-x-0',
            mobileSidebarOpen
              ? 'fixed inset-0 z-40 w-full md:relative md:w-56'
              : 'hidden md:flex'
          )}
          style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          {/* Mobile overlay close */}
          {mobileSidebarOpen && (
            <button
              className="md:hidden absolute top-4 right-4 text-white/30 hover:text-white/70 z-50"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Sidebar header */}
          <div className="flex-shrink-0 px-4 pt-5 pb-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Modes d'analyse</p>
          </div>

          {/* Mode list */}
          <div className="flex-1 px-2 pb-4 space-y-0.5">
            {MODES.map((mode) => {
              const Icon = mode.icon;
              const isActive = activeSession?.modeId === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => openMode(mode)}
                  className={cx(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all group',
                    isActive
                      ? 'bg-white/5'
                      : 'hover:bg-white/[0.04]'
                  )}
                  style={{
                    borderLeft: isActive ? `2px solid ${mode.accentColor}` : '2px solid transparent',
                  }}
                >
                  <div
                    className="w-6 h-6 flex items-center justify-center flex-shrink-0"
                    style={{
                      background: isActive ? `${mode.accentColor}20` : 'transparent',
                    }}
                  >
                    <Icon
                      className="w-3 h-3 transition-colors"
                      style={{ color: isActive ? mode.accentColor : 'rgba(255,255,255,0.3)' }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[10px] font-bold truncate transition-colors"
                      style={{ color: isActive ? mode.accentColor : 'rgba(255,255,255,0.45)' }}
                    >
                      {mode.label}
                    </p>
                  </div>
                  <Plus
                    className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: mode.accentColor }}
                  />
                </button>
              );
            })}
          </div>

          {/* Sessions history */}
          {sessions.length > 0 && (
            <div className="flex-shrink-0 border-t px-4 pt-4 pb-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Sessions</p>
              <div className="space-y-1">
                {sessions.map(s => {
                  const m = MODES_MAP[s.modeId];
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setActiveSessionId(s.id); setMobileSidebarOpen(false); }}
                      className={cx(
                        'w-full text-left px-2.5 py-2 transition-all',
                        activeSessionId === s.id ? 'bg-white/8' : 'hover:bg-white/4'
                      )}
                    >
                      <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: m.accentColor }}>
                        {m.shortLabel}
                      </p>
                      <p className="text-[10px] text-white/40 leading-tight truncate">{s.title.replace(`${m.label} — `, '')}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Main chat area ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {!activeSession ? (
            /* ── Empty state ── */
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-lg w-full text-center"
              >
                {/* Big logo */}
                <div className="flex justify-center mb-8">
                  <div className="relative">
                    <div
                      className="w-20 h-20 flex items-center justify-center"
                      style={{ background: 'rgba(232,93,4,0.1)', border: '2px solid rgba(232,93,4,0.2)' }}
                    >
                      <CRLogo size={52} />
                      <div
                        className="w-12 h-12 flex items-center justify-center text-base font-black absolute inset-4"
                        style={{ display: 'none', color: '#E85D04' }}
                      >
                        CR
                      </div>
                    </div>
                    <div
                      className="absolute -bottom-1.5 -right-1.5 w-5 h-5 flex items-center justify-center"
                      style={{ background: '#E85D04' }}
                    >
                      <Sparkles className="w-2.5 h-2.5 text-white" />
                    </div>
                  </div>
                </div>

                <h2 className="text-[22px] font-black text-white uppercase tracking-tight mb-2">
                  Challenger Reporter
                </h2>
                <p className="text-[11px] text-white/35 leading-relaxed mb-10">
                  Suite d'analyse journalistique propulsée par Challenger IA.<br />
                  Choisissez un mode dans la barre latérale pour commencer.
                </p>

                {/* Quick mode cards */}
                <div className="grid grid-cols-2 gap-3 text-left">
                  {MODES.slice(0, 4).map((mode, i) => {
                    const Icon = mode.icon;
                    return (
                      <motion.button
                        key={mode.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.07 }}
                        onClick={() => openMode(mode)}
                        className="p-4 text-left transition-all group border"
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          borderColor: `${mode.accentColor}20`,
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = `${mode.accentColor}08`;
                          (e.currentTarget as HTMLButtonElement).style.borderColor = `${mode.accentColor}50`;
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.02)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = `${mode.accentColor}20`;
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: mode.accentColor }} />
                          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: mode.accentColor }}>
                            {mode.shortLabel}
                          </span>
                        </div>
                        <p className="text-[10px] text-white/35 leading-snug">{mode.description}</p>
                      </motion.button>
                    );
                  })}
                </div>

                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setMobileSidebarOpen(true)}
                    className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white/50 transition-colors md:hidden"
                  >
                    Voir tous les modes <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            </div>
          ) : (
            /* ── Active session ── */
            <>
              {/* Mode header bar */}
              {currentMode && (
                <div
                  className="flex-shrink-0 flex items-center gap-3 px-5 py-2 border-b"
                  style={{
                    background: `${currentMode.accentColor}08`,
                    borderColor: `${currentMode.accentColor}15`,
                  }}
                >
                  {(() => { const Icon = currentMode.icon; return <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: currentMode.accentColor }} />; })()}
                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: currentMode.accentColor }}>
                    {currentMode.label}
                  </span>
                  <span className="text-[8px] text-white/20">·</span>
                  <span className="text-[9px] text-white/25 font-medium truncate flex-1">{activeSession.title.replace(`${currentMode.label} — `, '')}</span>
                  <button
                    onClick={() => openMode(activeMode)}
                    className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest flex-shrink-0 transition-colors hover:opacity-80"
                    style={{ color: currentMode.accentColor }}
                  >
                    <Plus className="w-2.5 h-2.5" />
                    Nouvelle analyse
                  </button>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
                {activeSession.messages.map((msg) => {
                  const modeCfg = MODES_MAP[msg.modeId];
                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div
                          className="max-w-[75%] px-4 py-3 text-[12px] font-medium text-white leading-relaxed border"
                          style={{
                            background: `${modeCfg.accentColor}12`,
                            borderColor: `${modeCfg.accentColor}25`,
                          }}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            {(() => { const Icon = modeCfg.icon; return <Icon className="w-2.5 h-2.5" style={{ color: modeCfg.accentColor }} />; })()}
                            <span className="text-[7px] font-black uppercase tracking-widest" style={{ color: modeCfg.accentColor }}>
                              {modeCfg.shortLabel}
                            </span>
                          </div>
                          <p className="text-white/80 whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div
                          className="w-5 h-5 flex items-center justify-center flex-shrink-0"
                          style={{ background: `${modeCfg.accentColor}20` }}
                        >
                          <CRLogo size={12} />
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: modeCfg.accentColor }}>
                          Challenger Reporter
                        </span>
                        <span className="text-[7px] text-white/15 font-medium">— {modeCfg.label}</span>
                      </div>

                      <div
                        className="max-w-[92%] px-5 py-4 border text-[12px] text-white/80 leading-relaxed"
                        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}
                      >
                        {msg.content ? (
                          <div className="prose-dark">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                h2: ({ children }) => (
                                  <h2 className="text-[11px] font-black uppercase tracking-widest mt-4 mb-2 first:mt-0" style={{ color: modeCfg.accentColor }}>
                                    {children}
                                  </h2>
                                ),
                                h3: ({ children }) => (
                                  <h3 className="text-[10px] font-black uppercase tracking-wider mt-3 mb-1 text-white/60">{children}</h3>
                                ),
                                p: ({ children }) => (
                                  <p className="text-[12px] text-white/70 mb-3 leading-relaxed">{children}</p>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-bold text-white">{children}</strong>
                                ),
                                ul: ({ children }) => (
                                  <ul className="mb-3 space-y-1.5 pl-2">{children}</ul>
                                ),
                                li: ({ children }) => (
                                  <li className="flex items-start gap-2 text-[11px] text-white/65">
                                    <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: modeCfg.accentColor }} />
                                    <span>{children}</span>
                                  </li>
                                ),
                                hr: () => <div className="my-3 border-t border-white/8" />,
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {[0, 1, 2].map(i => (
                              <div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full animate-bounce"
                                style={{ backgroundColor: modeCfg.accentColor, animationDelay: `${i * 150}ms` }}
                              />
                            ))}
                            <span className="text-white/20 text-[10px] font-medium ml-1">Analyse en cours…</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div
                className="flex-shrink-0 border-t px-5 py-4"
                style={{ background: '#111', borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <div className="flex gap-3 items-end">
                  <div className="flex-1 flex flex-col gap-2">
                    {currentMode && (
                      <div className="flex items-center gap-2">
                        <div
                          className="flex items-center gap-1.5 px-2 py-0.5 text-[7px] font-black uppercase tracking-widest"
                          style={{ background: `${currentMode.accentColor}18`, color: currentMode.accentColor }}
                        >
                          {(() => { const Icon = currentMode.icon; return <Icon className="w-2.5 h-2.5" />; })()}
                          {currentMode.shortLabel}
                        </div>
                        <span className="text-[8px] text-white/20">Question de suivi ou demande d'approfondissement</span>
                      </div>
                    )}
                    <textarea
                      value={followUpText}
                      onChange={e => setFollowUpText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey && !sending) {
                          e.preventDefault();
                          sendFollowUp();
                        }
                      }}
                      placeholder="Approfondis tel point… Vérifie aussi… Compare avec…"
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 px-4 py-2.5 text-[12px] text-white placeholder:text-white/20 focus:outline-none resize-none leading-relaxed transition-colors"
                      style={{ focusBorderColor: currentMode?.accentColor } as React.CSSProperties}
                      onFocus={e => { if (currentMode) e.currentTarget.style.borderColor = `${currentMode.accentColor}50`; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                    />
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => openMode(currentMode ?? MODES[0])}
                      className="w-11 h-8 flex items-center justify-center border border-white/10 hover:border-white/25 transition-all text-white/30 hover:text-white/70"
                      title="Nouvelle analyse"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={sendFollowUp}
                      disabled={!followUpText.trim() || sending}
                      className="w-11 h-8 flex items-center justify-center transition-all disabled:opacity-30"
                      style={{ background: currentMode?.accentColor ?? '#E85D04' }}
                    >
                      {sending ? (
                        <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Input modal ── */}
      <AnimatePresence>
        {inputModalOpen && (
          <motion.div
            key="input-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) setInputModalOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="w-full max-w-2xl border"
              style={{
                background: '#141414',
                borderColor: `${activeMode.accentColor}30`,
                boxShadow: `0 0 60px ${activeMode.accentColor}15, 8px 8px 0px 0px ${activeMode.accentColor}20`,
              }}
            >
              {/* Accent bar */}
              <div className="h-1 w-full" style={{ backgroundColor: activeMode.accentColor }} />

              {/* Header */}
              <div className="flex items-start justify-between gap-4 px-7 py-5 border-b border-white/6">
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                    style={{ background: `${activeMode.accentColor}15`, border: `1.5px solid ${activeMode.accentColor}25` }}
                  >
                    {(() => { const Icon = activeMode.icon; return <Icon className="w-5 h-5" style={{ color: activeMode.accentColor }} />; })()}
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: activeMode.accentColor }}>
                      Challenger Reporter
                    </p>
                    <h2 className="text-[18px] font-black text-white leading-tight">{activeMode.label}</h2>
                    <p className="text-[10px] text-white/30 font-medium mt-0.5">{activeMode.description}</p>
                  </div>
                </div>
                <button onClick={() => setInputModalOpen(false)} className="text-white/15 hover:text-white/50 transition-colors mt-1 flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-7 py-5">
                <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-2">
                  {activeMode.inputLabel}
                </label>
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={activeMode.inputPlaceholder}
                  rows={7}
                  autoFocus
                  className="w-full border px-4 py-3 text-[12px] text-white placeholder:text-white/18 focus:outline-none resize-none leading-relaxed transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderColor: 'rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = `${activeMode.accentColor}45`)}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) startAnalysis(); }}
                />
                <p className="text-[7px] text-white/12 mt-1.5">⌘ + Entrée pour lancer</p>
              </div>

              {/* CTA */}
              <div className="px-7 pb-7">
                <button
                  onClick={startAnalysis}
                  disabled={!inputText.trim()}
                  className="w-full flex items-center justify-center gap-2.5 py-4 text-white text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-30 hover:opacity-90"
                  style={{
                    backgroundColor: activeMode.accentColor,
                    boxShadow: `4px 4px 0px 0px ${activeMode.accentColor}40`,
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  Lancer l'analyse
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
