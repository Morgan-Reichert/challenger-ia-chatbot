import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Scale, Search, Swords, Plus, Send, Loader2, AlertCircle,
  RotateCcw, Zap, Menu, X, ChevronRight, MessageSquare,
  BookOpen, Target, TrendingUp, Brain, LogIn, LogOut, User,
  Cloud, CloudOff, Trash2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  FIREBASE_ENABLED, auth, db, googleProvider,
  signInWithPopup, signOut as fbSignOut, onAuthStateChanged,
  collection, doc, setDoc, getDocs, deleteDoc, query, orderBy,
} from './firebase';

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
  updatedAt: Date;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const PERSONAS = {
  architect: {
    id: 'architect' as const,
    name: "L'Architecte Logique",
    shortName: 'Architecte',
    desc: 'Structure et cohérence argumentative',
    icon: Scale,
  },
  factchecker: {
    id: 'factchecker' as const,
    name: 'Le Fact-Checker',
    shortName: 'Fact-Checker',
    desc: 'Vérification des preuves et données',
    icon: Search,
  },
  opponent: {
    id: 'opponent' as const,
    name: "L'Opposant Idéologique",
    shortName: 'Opposant',
    desc: 'Test des valeurs par la contradiction',
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
      doux: `Tu es l'Architecte Logique, un guide intellectuel bienveillant spécialisé dans l'analyse de la structure argumentative. Ton rôle est d'aider l'utilisateur à solidifier sa pensée par des questions précises et constructives — tu ne juges pas, tu construis. Révèle les présupposés implicites : "Comment définis-tu exactement ce terme ?", "Quelle est la prémisse centrale ?", "As-tu envisagé cette perspective alternative ?". Ton ton est celui d'un professeur passionné et encourageant. Réponds en français, concis (3-4 phrases max). Pose toujours une question en retour.`,
      moyen: `Tu es l'Architecte Logique. Tu analyses rigoureusement la structure argumentative et exiges la précision intellectuelle. Identifie les syllogismes défaillants, généralisations abusives, non-sequitur. Pour chaque faille, propose une reformulation plus solide. Tu es intransigeant sur la rigueur logique, jamais hostile. Réponds en français, directement et de façon concise. Pose une question de fond.`,
      extreme: `Tu es l'Architecte Logique en mode expert. Tu disséques chaque argument avec précision chirurgicale : sophismes, biais cognitifs, pétitions de principe, faux dilemmes. Sois direct et sans concession sur les erreurs de raisonnement. Après chaque critique, propose une reformulation plus rigoureuse. Tu attaques les failles du raisonnement, jamais la personne. Réponds en français, dense et précis. Conclus par une question qui force à reconsidérer la prémisse.`,
    },
    factchecker: {
      doux: `Tu es le Fact-Checker accompagnateur. Tu aides l'utilisateur à solidifier ses bases factuelles de façon encourageante. Pose des questions ouvertes : "D'où provient cette information ?", "Cette étude a-t-elle été répliquée ?", "Sur quel échantillon cette statistique est-elle basée ?". Ton but est de renforcer la solidité factuelle, pas d'embarrasser. Réponds en français, concis. Pose toujours une question sur les sources.`,
      moyen: `Tu es le Fact-Checker rigoureux. Tu examines chaque affirmation : distingue faits et opinions, corrélations et causalités. Demande des sources vérifiables. Si une donnée est inexacte ou hors contexte, dis-le clairement et propose une formulation plus précise. Sois direct, jamais condescendant. Réponds en français, concis et factuel.`,
      extreme: `Tu es le Fact-Checker en mode audit complet. Chaque chiffre, chaque "selon les experts" passe à l'examen critique. Identifie les biais de confirmation, données hors contexte, fausses corrélations. Reformule chaque affirmation incorrecte avec la version factuelle exacte. Construis l'esprit scientifique de l'utilisateur. Réponds en français, dense et précis. Identifie au moins deux problèmes factuels distincts.`,
    },
    opponent: {
      doux: `Tu es l'Opposant Bienveillant. Tu explores le point de vue contraire pour enrichir la pensée, pas pour blesser. Présente l'argument adverse avec respect : "Voici comment quelqu'un qui pense différemment verrait les choses…". Ton but est d'élargir la perspective et de renforcer la thèse par l'exposition à la meilleure objection possible. Réponds en français, concis et constructif. Conclus par une question.`,
      moyen: `Tu es l'Opposant Idéologique. Tu défends systématiquement la position contraire avec des arguments solides. Ce n'est pas une attaque personnelle — c'est un entraînement intellectuel. Présente la version la plus cohérente et documentée de la thèse opposée. Rends la pensée de l'utilisateur plus robuste par le frottement des idées. Réponds en français, directement et concisément.`,
      extreme: `Tu es l'Avocat du Diable. Tu adoptes la position diamétralement opposée avec une argumentation serrée et des exemples concrets. Expose les angles morts, les contradictions internes, les implications non dites. Tu combats les idées, jamais la personne — avec la rigueur d'un débatteur professionnel. Sois incisif sans être blessant. Réponds en français, dense et précis. Développe au moins deux arguments adverses distincts.`,
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

// ─── Firestore helpers ────────────────────────────────────────────────────────

function serializeConv(conv: Conversation) {
  return {
    id: conv.id,
    title: conv.title,
    persona: conv.persona,
    level: conv.level,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    messages: conv.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
    })),
  };
}

function deserializeConv(data: Record<string, unknown>): Conversation {
  const msgs = (data.messages as Record<string, unknown>[]) ?? [];
  return {
    id: data.id as string,
    title: data.title as string,
    persona: data.persona as Persona,
    level: data.level as FrictionLevel,
    createdAt: new Date(data.createdAt as string),
    updatedAt: new Date(data.updatedAt as string),
    messages: msgs.map((m) => ({
      id: m.id as string,
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
      timestamp: new Date(m.timestamp as string),
    })),
  };
}

async function fsLoadConversations(userId: string): Promise<Conversation[]> {
  if (!db) return [];
  try {
    const q = query(
      collection(db, 'users', userId, 'conversations'),
      orderBy('updatedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => deserializeConv(d.data() as Record<string, unknown>));
  } catch {
    return [];
  }
}

async function fsSaveConversation(userId: string, conv: Conversation): Promise<void> {
  if (!db) return;
  try {
    const ref = doc(db, 'users', userId, 'conversations', conv.id);
    await setDoc(ref, serializeConv(conv));
  } catch {
    // Silent fail — local state is source of truth
  }
}

async function fsDeleteConversation(userId: string, convId: string): Promise<void> {
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'users', userId, 'conversations', convId));
  } catch {
    // Silent fail
  }
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

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
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-white">{children}</li>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono text-xs bg-white/15 px-1 rounded text-white">{children}</code>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-white/40 pl-3 italic text-white/80 mb-2">
      {children}
    </blockquote>
  ),
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Chat state
  const [persona, setPersona] = useState<Persona>('architect');
  const [level, setLevel] = useState<FrictionLevel>('moyen');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Auth state
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(FIREBASE_ENABLED);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  // ── Firebase Auth listener
  useEffect(() => {
    if (!auth || !FIREBASE_ENABLED) return;
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        setSyncing(true);
        const remote = await fsLoadConversations(firebaseUser.uid);
        setConversations(remote);
        setSyncing(false);
      } else {
        setConversations([]);
        setActiveId(null);
      }
    });
    return () => unsub();
  }, []);

  // ── Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages.length]);

  // ── Auto-resize textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // ── Auth actions
  const handleSignIn = async () => {
    if (!auth) return;
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Erreur de connexion');
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    await fbSignOut(auth);
    setConversations([]);
    setActiveId(null);
  };

  // ── New conversation
  const startNewConv = useCallback(() => {
    const id = uid();
    const now = new Date();
    const conv: Conversation = {
      id,
      title: 'Nouvelle session',
      messages: [],
      persona,
      level,
      createdAt: now,
      updatedAt: now,
    };
    setConversations((p) => [conv, ...p]);
    setActiveId(id);
    setChatError(null);
    setInput('');
  }, [persona, level]);

  // ── Delete conversation
  const deleteConv = useCallback(
    async (convId: string) => {
      setConversations((p) => p.filter((c) => c.id !== convId));
      if (activeId === convId) setActiveId(null);
      if (user) await fsDeleteConversation(user.uid, convId);
    },
    [activeId, user]
  );

  // ── Send message
  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;

      const userMsg: Message = {
        id: uid(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      let convId = activeId;
      let prevMessages: Message[] = [];

      if (!convId) {
        const newId = uid();
        const now = new Date();
        const title = text.length > 48 ? text.slice(0, 48) + '…' : text;
        const conv: Conversation = {
          id: newId,
          title,
          messages: [userMsg],
          persona,
          level,
          createdAt: now,
          updatedAt: now,
        };
        setConversations((p) => [conv, ...p]);
        setActiveId(newId);
        convId = newId;
        if (user) fsSaveConversation(user.uid, conv);
      } else {
        const existing = conversations.find((c) => c.id === convId);
        prevMessages = existing?.messages ?? [];
        setConversations((p) =>
          p.map((c) => {
            if (c.id !== convId) return c;
            const now = new Date();
            const title =
              c.messages.length === 0
                ? text.length > 48
                  ? text.slice(0, 48) + '…'
                  : text
                : c.title;
            const updated = { ...c, title, messages: [...c.messages, userMsg], updatedAt: now };
            if (user) fsSaveConversation(user.uid, updated);
            return updated;
          })
        );
      }

      const allMessages = [...prevMessages, userMsg];
      setSending(true);
      setChatError(null);
      setInput('');

      try {
        const apiKey = import.meta.env.VITE_MISTRAL_API_KEY;
        if (!apiKey)
          throw new Error(
            'Clé API manquante. Renommez la variable en VITE_MISTRAL_API_KEY dans Vercel (avec le préfixe VITE_) puis redéployez.'
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
        const asstMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: reply,
          timestamp: new Date(),
        };

        setConversations((p) =>
          p.map((c) => {
            if (c.id !== convId) return c;
            const now = new Date();
            const updated = { ...c, messages: [...c.messages, asstMsg], updatedAt: now };
            if (user) fsSaveConversation(user.uid, updated);
            return updated;
          })
        );
      } catch (e) {
        setChatError(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        setSending(false);
      }
    },
    [activeId, conversations, sending, persona, level, user]
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
                  {(Object.values(PERSONAS) as (typeof PERSONAS[keyof typeof PERSONAS])[]).map(
                    (p) => {
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
                            active ? { boxShadow: '4px 4px 0px 0px rgba(93,123,255,0.2)' } : {}
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
                    }
                  )}
                </div>
              </div>

              {/* Friction level */}
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-3">
                  Niveau de Friction
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    Object.entries(FRICTION) as [FrictionLevel, (typeof FRICTION)[FrictionLevel]][]
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
                <p className="mt-2 text-center text-[8px] text-white/20">{FRICTION[level].hint}</p>
              </div>

              {/* Sessions history */}
              {conversations.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/25">
                      Sessions
                    </p>
                    {syncing && (
                      <div className="flex items-center gap-1 text-white/20">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span className="text-[7px] uppercase tracking-widest">Sync…</span>
                      </div>
                    )}
                    {user && !syncing && (
                      <div className="flex items-center gap-1 text-white/20">
                        <Cloud className="w-2.5 h-2.5" />
                        <span className="text-[7px] uppercase tracking-widest">Sauvegardé</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={cx(
                          'flex items-center gap-1 group border-l-2 transition-all',
                          conv.id === activeId
                            ? 'border-[#5D7BFF]'
                            : 'border-transparent hover:border-white/15'
                        )}
                      >
                        <button
                          onClick={() => {
                            setActiveId(conv.id);
                            setPersona(conv.persona);
                            setLevel(conv.level);
                          }}
                          className={cx(
                            'flex-1 flex items-center gap-2 px-3 py-2 text-left transition-all min-w-0',
                            conv.id === activeId
                              ? 'bg-[#5D7BFF]/15 text-white'
                              : 'text-white/35 hover:text-white/60 hover:bg-white/5'
                          )}
                        >
                          <MessageSquare className="w-3 h-3 flex-shrink-0" />
                          <span className="text-[9px] font-medium truncate">{conv.title}</span>
                        </button>
                        <button
                          onClick={() => deleteConv(conv.id)}
                          className="flex-shrink-0 mr-1 text-white/0 group-hover:text-white/25 hover:!text-red-400 transition-colors p-1"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Firebase info */}
              {!FIREBASE_ENABLED && (
                <div className="px-3 py-3 border border-white/10 bg-white/5">
                  <div className="flex items-start gap-2">
                    <CloudOff className="w-3 h-3 text-white/20 flex-shrink-0 mt-0.5" />
                    <p className="text-[8px] text-white/20 leading-relaxed">
                      Configurez Firebase pour activer la sauvegarde des sessions.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Auth footer */}
            <div className="px-5 py-4 border-t-2 border-white/10">
              {!FIREBASE_ENABLED ? (
                <p className="text-center text-[7px] font-black uppercase tracking-widest text-white/15">
                  Stariax Group © 2026
                </p>
              ) : authLoading ? (
                <div className="flex items-center justify-center gap-2 text-white/25">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[8px] uppercase tracking-widest">Connexion…</span>
                </div>
              ) : user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt=""
                        className="w-7 h-7 rounded-full border-2 border-[#5D7BFF]/40 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 bg-[#5D7BFF]/30 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-3 h-3 text-[#5D7BFF]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[9px] font-black text-white/70 truncate">
                        {user.displayName ?? user.email}
                      </p>
                      <p className="text-[7px] text-white/25 uppercase tracking-widest">
                        Sessions synchronisées
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-white/10 hover:border-white/25 transition-colors text-white/30 hover:text-white/60"
                  >
                    <LogOut className="w-3 h-3" />
                    <span className="text-[8px] font-black uppercase tracking-widest">
                      Déconnexion
                    </span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={handleSignIn}
                    className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-white/5 border border-white/15 hover:border-[#5D7BFF] hover:bg-[#5D7BFF]/10 transition-all text-white/50 hover:text-white"
                    style={{ boxShadow: 'none' }}
                  >
                    <LogIn className="w-4 h-4" />
                    <span className="text-[9px] font-black uppercase tracking-widest">
                      Se connecter
                    </span>
                  </button>
                  {authError && (
                    <p className="text-[7px] text-red-400 text-center">{authError}</p>
                  )}
                  <p className="text-center text-[7px] text-white/15 uppercase tracking-widest">
                    Sauvegarde des sessions
                  </p>
                </div>
              )}
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
                <h1 className="text-3xl font-black uppercase tracking-tighter text-[#141414] mb-3">
                  {PERSONAS[persona].name}
                </h1>
                <p className="text-sm font-medium text-[#141414]/50 max-w-sm mx-auto leading-relaxed">
                  Soumettez une thèse ou une conviction.{' '}
                  <span className="font-bold text-[#5D7BFF]">{PERSONAS[persona].shortName}</span>{' '}
                  l'analysera en mode{' '}
                  <span className="font-bold">{FRICTION[level].label.toLowerCase()}</span>.
                </p>
                {!user && FIREBASE_ENABLED && (
                  <p className="mt-3 text-[8px] uppercase tracking-widest text-[#141414]/25 flex items-center justify-center gap-1">
                    <CloudOff className="w-3 h-3" />
                    Connectez-vous pour sauvegarder vos sessions
                  </p>
                )}
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
              {chatError && (
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
                      <p className="text-xs text-red-600">{chatError}</p>
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
