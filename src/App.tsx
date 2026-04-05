import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Scale, Search, Swords, Plus, Send, Loader2, AlertCircle,
  RotateCcw, Zap, Menu, X, ChevronRight, MessageSquare,
  BookOpen, Target, TrendingUp, Brain,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// ─── Types ────────────────────────────────────────────────────────────────────

type Persona = 'architect' | 'factchecker' | 'opponent';
type FrictionLevel = 'doux' | 'moyen' | 'extreme';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  persona: Persona;
  level: FrictionLevel;
  createdAt: Date;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const PERSONAS = {
  architect: {
    id: 'architect' as const,
    name: "L'Architecte Logique",
    shortName: 'Architecte',
    desc: 'Analyse la structure et la cohérence argumentative',
    icon: Scale,
  },
  factchecker: {
    id: 'factchecker' as const,
    name: 'Le Fact-Checker',
    shortName: 'Fact-Checker',
    desc: 'Vérifie chaque preuve, donnée et source',
    icon: Search,
  },
  opponent: {
    id: 'opponent' as const,
    name: "L'Opposant Idéologique",
    shortName: 'Opposant',
    desc: 'Teste vos valeurs en adoptant le point de vue inverse',
    icon: Swords,
  },
} as const;

const FRICTION = {
  doux: { label: 'Doux', hint: 'Maïeutique bienveillante' },
  moyen: { label: 'Moyen', hint: 'Sceptique rationnel' },
  extreme: { label: 'Extrême', hint: 'Avocat du diable' },
} as const;

const SUGGESTIONS: Record<Persona, { text: string; icon: React.ElementType }[]> = {
  architect: [
    { text: "L'intelligence artificielle va rendre le travail humain obsolète dans 20 ans.", icon: Brain },
    { text: 'La démocratie directe est supérieure à la démocratie représentative.', icon: Target },
    { text: 'Les réseaux sociaux sont fondamentalement néfastes pour la société.', icon: TrendingUp },
  ],
  factchecker: [
    { text: 'Les énergies renouvelables peuvent seules remplacer toutes les énergies fossiles.', icon: TrendingUp },
    { text: 'La criminalité est en hausse constante dans les grandes villes occidentales.', icon: Target },
    { text: 'Les produits bio sont systématiquement meilleurs pour la santé.', icon: BookOpen },
  ],
  opponent: [
    { text: 'Le capitalisme libéral est le meilleur système économique jamais inventé.', icon: TrendingUp },
    { text: "L'État devrait contrôler internet pour protéger les citoyens.", icon: Target },
    { text: 'La mondialisation a globalement amélioré la condition humaine.', icon: Brain },
  ],
};

// ─── System Prompts ───────────────────────────────────────────────────────────

function buildSystemPrompt(persona: Persona, level: FrictionLevel): string {
  const map: Record<Persona, Record<FrictionLevel, string>> = {
    architect: {
      doux: `Tu es l'Architecte Logique, un guide intellectuel bienveillant spécialisé dans l'analyse de la structure argumentative. Ton rôle est d'aider l'utilisateur à solidifier sa pensée par des questions précises et constructives — tu ne juges pas, tu construis.

Révèle les présupposés implicites avec des questions du type : "Comment définis-tu exactement ce terme ?", "Quelle est la prémisse centrale de ton argument ?", "As-tu envisagé cette perspective alternative ?"

Ton ton est celui d'un professeur passionné et encourageant. Ton objectif : aider l'utilisateur à formuler un raisonnement plus rigoureux et plus solide.

Règles : Réponds en français. Sois concis (3-4 phrases). Ne commence jamais par un jugement négatif global sur l'idée. Pose toujours au moins une question en retour.`,

      moyen: `Tu es l'Architecte Logique. Tu analyses rigoureusement la structure argumentative et tu exiges de la précision intellectuelle.

Identifie les syllogismes défaillants, les généralisations abusives, les non-sequitur et les équivoques. Exige une définition précise des termes clés. Pour chaque faille identifiée, propose une piste de reformulation plus solide.

Tu n'es pas hostile, mais tu es intransigeant sur la rigueur logique. Tu construis la pensée critique de l'utilisateur, pas son inconfort.

Règles : Réponds en français. Sois direct et concis. Ne commence jamais par "tu as tort" ou un jugement d'ensemble. Pose une question de fond.`,

      extreme: `Tu es l'Architecte Logique en mode expert. Tu disséques chaque argument avec une précision chirurgicale : sophismes, biais cognitifs, pétitions de principe, faux dilemmes — rien ne t'échappe.

Sois direct et sans concession sur les erreurs de raisonnement. Après chaque critique, propose systématiquement une reformulation plus rigoureuse. Tu attaques les failles du raisonnement, jamais la personne.

Règles : Réponds en français. Sois dense et précis. Identifie au moins deux failles distinctes. Conclus toujours par une question de fond qui force à reconsidérer la prémisse.`,
    },

    factchecker: {
      doux: `Tu es le Fact-Checker accompagnateur. Tu aides l'utilisateur à solidifier les bases factuelles de ses arguments, de façon encourageante et curieuse.

Pose des questions ouvertes sur les sources : "D'où provient cette information ?", "Cette étude a-t-elle été répliquée ?", "Sur quel échantillon cette statistique est-elle basée ?" Ton but est de renforcer la solidité factuelle, pas d'embarrasser.

Ton ton est celui d'un journaliste curieux et bienveillant, qui aide l'utilisateur à devenir plus rigoureux.

Règles : Réponds en français. Sois concis. Pose toujours une question sur les sources ou le contexte.`,

      moyen: `Tu es le Fact-Checker rigoureux. Tu examines chaque affirmation avec méthode : distingue faits et opinions, corrélations et causalités, données fiables et approximations.

Demande des sources vérifiables. Si une donnée te semble inexacte, extrapolée ou sortie de son contexte, dis-le clairement et propose une formulation plus précise. Sois direct, jamais condescendant.

Règles : Réponds en français. Sois concis et factuel. Cite toujours une reformulation ou une nuance plus précise.`,

      extreme: `Tu es le Fact-Checker en mode audit complet. Chaque chiffre, chaque "selon les experts", chaque affirmation présentée comme un fait passe à l'examen critique.

Identifie les biais de confirmation, les données hors contexte, les fausses corrélations, les sources non vérifiées. Sois direct et précis : reformule chaque affirmation incorrecte avec la version factuelle la plus exacte possible.

Ton objectif est de construire l'esprit scientifique de l'utilisateur.

Règles : Réponds en français. Sois dense et précis. Identifie au moins deux problèmes factuels distincts. Ne te contente jamais de critiquer : apporte toujours une reformulation ou une donnée alternative.`,
    },

    opponent: {
      doux: `Tu es l'Opposant Bienveillant. Tu explores le point de vue contraire non pour blesser, mais pour enrichir la pensée.

Présente l'argument adverse de façon juste et respectueuse : "Voici comment quelqu'un qui pense différemment verrait les choses…". Ton but est d'élargir la perspective de l'utilisateur et de renforcer sa thèse en l'exposant à la meilleure objection possible.

Règles : Réponds en français. Sois concis et constructif. Présente la thèse adverse honnêtement. Conclus par une question qui invite l'utilisateur à affiner sa position.`,

      moyen: `Tu es l'Opposant Idéologique. Tu défends systématiquement la position contraire avec des arguments solides et documentés. Ce n'est pas une attaque personnelle — c'est un entraînement intellectuel.

Présente la version la plus cohérente et documentée de la thèse opposée. Ton but est de rendre la pensée de l'utilisateur plus robuste par le frottement des idées.

Règles : Réponds en français. Sois direct et concis. Défends la position adverse avec honnêteté intellectuelle. Pose une question qui met en lumière la tension entre les deux positions.`,

      extreme: `Tu es l'Avocat du Diable. Tu adoptes la position diamétralement opposée avec une argumentation serrée et des exemples concrets.

Tu exposes les angles morts, les contradictions internes, les implications non dites. Tu combats les idées, jamais la personne — avec la rigueur d'un débatteur professionnel. Sois incisif sans être blessant.

Règles : Réponds en français. Sois dense et précis. Développe au moins deux arguments adverses distincts. Conclus par la question la plus déstabilisante pour la thèse de départ.`,
    },
  };
  return map[persona][level];
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function cx(...cs: (string | false | null | undefined)[]): string {
  return cs.filter(Boolean).join(' ');
}

// ─── Markdown Components ──────────────────────────────────────────────────────

const mdWhite = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-white leading-relaxed mb-2 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-black text-white">{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside space-y-1 mb-2 text-sm text-white">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside space-y-1 mb-2 text-sm text-white">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="text-white">{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono text-xs bg-white/15 px-1 rounded text-white">{children}</code>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-white/40 pl-3 italic text-white/80 mb-2">{children}</blockquote>
  ),
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [persona, setPersona] = useState<Persona>('architect');
  const [level, setLevel] = useState<FrictionLevel>('moyen');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const startNewConv = useCallback(() => {
    const id = uid();
    const conv: Conversation = {
      id,
      title: 'Nouvelle session',
      messages: [],
      persona,
      level,
      createdAt: new Date(),
    };
    setConversations((p) => [conv, ...p]);
    setActiveId(id);
    setError(null);
    setInput('');
  }, [persona, level]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;

      const userMsg: Message = { id: uid(), role: 'user', content: text, timestamp: new Date() };
      let convId = activeId;
      let prevMessages: Message[] = [];

      if (!convId) {
        const newId = uid();
        const title = text.length > 48 ? text.slice(0, 48) + '…' : text;
        const conv: Conversation = {
          id: newId,
          title,
          messages: [userMsg],
          persona,
          level,
          createdAt: new Date(),
        };
        setConversations((p) => [conv, ...p]);
        setActiveId(newId);
        convId = newId;
        prevMessages = [];
      } else {
        const existing = conversations.find((c) => c.id === convId);
        prevMessages = existing?.messages ?? [];
        setConversations((p) =>
          p.map((c) => {
            if (c.id !== convId) return c;
            const title =
              c.messages.length === 0
                ? text.length > 48
                  ? text.slice(0, 48) + '…'
                  : text
                : c.title;
            return { ...c, title, messages: [...c.messages, userMsg] };
          })
        );
      }

      const allMessages = [...prevMessages, userMsg];
      setSending(true);
      setError(null);
      setInput('');

      try {
        const apiKey = import.meta.env.VITE_MISTRAL_API_KEY;
        if (!apiKey)
          throw new Error(
            'Clé API manquante. Ajoutez VITE_MISTRAL_API_KEY dans votre fichier .env'
          );

        const temperature = level === 'extreme' ? 0.9 : level === 'moyen' ? 0.7 : 0.5;

        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'mistral-small-latest',
            temperature,
            messages: [
              { role: 'system', content: buildSystemPrompt(persona, level) },
              ...allMessages.map((m) => ({ role: m.role, content: m.content })),
            ],
          }),
        });

        if (!res.ok) {
          const e = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
          throw new Error(e?.message ?? e?.error?.message ?? `Erreur ${res.status}`);
        }

        const data = await res.json();
        const reply = data.choices[0].message.content ?? '…';
        const asstMsg: Message = { id: uid(), role: 'assistant', content: reply, timestamp: new Date() };

        setConversations((p) =>
          p.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, asstMsg] } : c))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        setSending(false);
      }
    },
    [activeId, conversations, sending, persona, level]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const CurrentIcon = PERSONAS[persona].icon;

  return (
    <div
      className="flex h-screen overflow-hidden bg-[#F0F4FF]"
      style={{ fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif' }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="flex-shrink-0 h-full overflow-hidden flex flex-col bg-[#141414] text-white border-r-4 border-[#5D7BFF]"
            style={{ minWidth: 0 }}
          >
            {/* Logo */}
            <div className="px-5 py-4 border-b-2 border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#5D7BFF] flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#5D7BFF]">
                    Challenger IA
                  </p>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">
                    Intelligence Critique
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-white/30 hover:text-white/70 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* New session */}
            <div className="px-5 py-4 border-b-2 border-white/10">
              <button
                onClick={startNewConv}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#5D7BFF] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#4a68e8] transition-colors"
                style={{ boxShadow: '4px 4px 0px 0px rgba(255,255,255,0.06)' }}
              >
                <span>Nouvelle Session</span>
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {/* Persona selector */}
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-3">
                  Persona
                </p>
                <div className="space-y-2">
                  {(
                    Object.values(PERSONAS) as (typeof PERSONAS[keyof typeof PERSONAS])[]
                  ).map((p) => {
                    const Icon = p.icon;
                    const active = persona === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPersona(p.id)}
                        className={cx(
                          'w-full flex items-center gap-3 px-4 py-3 text-left border-2 transition-all',
                          active
                            ? 'bg-[#5D7BFF] border-[#5D7BFF] text-white'
                            : 'bg-transparent border-white/10 text-white/50 hover:border-white/25 hover:text-white/80'
                        )}
                        style={
                          active
                            ? { boxShadow: '4px 4px 0px 0px rgba(93,123,255,0.2)' }
                            : {}
                        }
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-wider">
                            {p.shortName}
                          </p>
                          <p className="text-[8px] opacity-60 truncate">{p.desc}</p>
                        </div>
                        {active && <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Friction level */}
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-3">
                  Niveau de Friction
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    Object.entries(FRICTION) as [
                      FrictionLevel,
                      (typeof FRICTION)[FrictionLevel]
                    ][]
                  ).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setLevel(key)}
                      className={cx(
                        'py-2 px-1 text-center border-2 transition-all',
                        level === key
                          ? 'bg-[#5D7BFF] border-[#5D7BFF] text-white'
                          : 'bg-transparent border-white/10 text-white/35 hover:border-white/25 hover:text-white/60'
                      )}
                    >
                      <p className="text-[9px] font-black uppercase tracking-wider leading-none">
                        {val.label}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-center text-[8px] text-white/20">
                  {FRICTION[level].hint}
                </p>
              </div>

              {/* Conversation history */}
              {conversations.length > 0 && (
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-3">
                    Sessions
                  </p>
                  <div className="space-y-0.5">
                    {conversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setActiveId(conv.id);
                          setPersona(conv.persona);
                          setLevel(conv.level);
                        }}
                        className={cx(
                          'w-full flex items-center gap-2 px-3 py-2 text-left transition-all border-l-2',
                          conv.id === activeId
                            ? 'bg-[#5D7BFF]/15 text-white border-[#5D7BFF]'
                            : 'text-white/35 hover:text-white/60 hover:bg-white/5 border-transparent'
                        )}
                      >
                        <MessageSquare className="w-3 h-3 flex-shrink-0" />
                        <span className="text-[9px] font-medium truncate">{conv.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar footer */}
            <div className="px-5 py-3 border-t-2 border-white/10">
              <p className="text-center text-[7px] font-black uppercase tracking-widest text-white/15">
                Stariax Group &copy; 2026
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top bar */}
        <div className="flex-shrink-0 bg-white border-b-4 border-[#5D7BFF] px-6 py-4 flex items-center gap-4">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-[#5D7BFF] hover:opacity-70 transition-opacity flex-shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div
            className="w-8 h-8 bg-[#5D7BFF] flex items-center justify-center flex-shrink-0"
            style={{ boxShadow: '3px 3px 0px 0px rgba(20,20,20,0.15)' }}
          >
            <CurrentIcon className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#141414] truncate">
              {PERSONAS[persona].name}
            </p>
            <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/35">
              Mode {FRICTION[level].label} — {FRICTION[level].hint}
            </p>
          </div>
          {activeConv && activeConv.messages.length > 0 && (
            <button
              onClick={startNewConv}
              className="ml-auto flex-shrink-0 flex items-center gap-2 px-3 py-2 border-2 border-[#5D7BFF]/20 hover:border-[#5D7BFF] transition-all text-[#141414]/40 hover:text-[#5D7BFF]"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="text-[8px] font-black uppercase tracking-widest">Nouvelle</span>
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-8">
          {!activeConv || activeConv.messages.length === 0 ? (
            // Empty state
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto"
            >
              <div className="text-center mb-10">
                <div
                  className="w-16 h-16 bg-[#5D7BFF] mx-auto mb-6 flex items-center justify-center"
                  style={{ boxShadow: '8px 8px 0px 0px rgba(20,20,20,1)' }}
                >
                  <CurrentIcon className="w-8 h-8 text-white" />
                </div>
                <h1
                  className="text-3xl font-black uppercase tracking-tighter text-[#141414] mb-3"
                  style={{ fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif' }}
                >
                  {PERSONAS[persona].name}
                </h1>
                <p className="text-sm font-medium text-[#141414]/50 max-w-sm mx-auto leading-relaxed">
                  Soumettez une thèse ou une conviction.{' '}
                  <span className="font-bold text-[#5D7BFF]">
                    {PERSONAS[persona].shortName}
                  </span>{' '}
                  l'analysera avec rigueur en mode{' '}
                  <span className="font-bold">{FRICTION[level].label.toLowerCase()}</span>.
                </p>
              </div>

              <div className="w-full space-y-3">
                <p className="text-[8px] font-black uppercase tracking-widest text-[#141414]/25 text-center mb-4">
                  Suggestions
                </p>
                {SUGGESTIONS[persona].map((s, i) => {
                  const SIcon = s.icon;
                  return (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      onClick={() => send(s.text)}
                      disabled={sending}
                      className="w-full text-left px-5 py-4 bg-white border-2 border-[#5D7BFF]/15 hover:border-[#5D7BFF] hover:shadow-[4px_4px_0px_0px_rgba(93,123,255,1)] transition-all group disabled:opacity-40"
                    >
                      <div className="flex items-start gap-3">
                        <SIcon className="w-4 h-4 text-[#5D7BFF] opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                        <p className="text-sm font-medium text-[#141414] group-hover:text-[#5D7BFF] transition-colors">
                          {s.text}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            // Messages list
            <div className="max-w-3xl mx-auto space-y-5">
              {activeConv.messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cx(
                      'max-w-[78%] border-2',
                      msg.role === 'user'
                        ? 'bg-white border-[#5D7BFF]/25'
                        : 'bg-[#5D7BFF] border-[#5D7BFF] text-white'
                    )}
                    style={
                      msg.role === 'assistant'
                        ? { boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.12)' }
                        : { boxShadow: '4px 4px 0px 0px rgba(93,123,255,0.15)' }
                    }
                  >
                    {/* Message header */}
                    <div
                      className={cx(
                        'px-3 py-1 border-b flex items-center justify-between gap-4',
                        msg.role === 'user' ? 'border-[#5D7BFF]/10' : 'border-white/20'
                      )}
                    >
                      <p
                        className={cx(
                          'text-[7px] font-black uppercase tracking-widest',
                          msg.role === 'user' ? 'text-[#141414]/30' : 'text-white/60'
                        )}
                      >
                        {msg.role === 'user' ? 'Vous' : PERSONAS[persona].shortName}
                      </p>
                      <p
                        className={cx(
                          'text-[7px] font-mono',
                          msg.role === 'user' ? 'text-[#141414]/25' : 'text-white/40'
                        )}
                      >
                        {fmtTime(msg.timestamp)}
                      </p>
                    </div>

                    {/* Message body */}
                    <div className="px-4 py-3">
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown components={mdWhite}>{msg.content}</ReactMarkdown>
                      ) : (
                        <p className="text-sm text-[#141414] leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              {sending && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div
                    className="bg-[#5D7BFF] border-2 border-[#5D7BFF] px-4 py-3 text-white"
                    style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.12)' }}
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-70">
                        {PERSONAS[persona].shortName} analyse…
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-center"
                >
                  <div
                    className="flex items-start gap-3 bg-red-50 border-2 border-red-400 px-4 py-3 max-w-md"
                    style={{ boxShadow: '4px 4px 0px 0px rgba(239,68,68,0.2)' }}
                  >
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-red-600 mb-1">
                        Erreur
                      </p>
                      <p className="text-xs text-red-600">{error}</p>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 bg-white border-t-4 border-[#5D7BFF] px-6 py-4">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={`Soumettez une thèse à ${PERSONAS[persona].shortName}…`}
                rows={1}
                disabled={sending}
                className="w-full bg-[#F0F4FF] border-2 border-[#5D7BFF]/20 focus:border-[#5D7BFF] px-4 py-3 text-sm font-medium text-[#141414] placeholder:text-[#141414]/30 focus:outline-none resize-none transition-all leading-relaxed"
              />
              <p className="absolute bottom-2 right-3 text-[7px] font-mono text-[#141414]/15 pointer-events-none select-none hidden sm:block">
                ↵ envoyer &middot; Shift+↵ saut
              </p>
            </div>
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex-shrink-0 bg-[#5D7BFF] text-white px-5 py-3 hover:bg-[#4a68e8] disabled:opacity-40 transition-all active:translate-x-0.5 active:translate-y-0.5"
              style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.2)' }}
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
