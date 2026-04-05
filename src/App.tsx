import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Scale, Search, Swords, Plus, Send, Loader2, AlertCircle,
  RotateCcw, Zap, Menu, X, ChevronRight, MessageSquare,
  BookOpen, Target, TrendingUp, Brain, LogIn, LogOut, User,
  Cloud, CloudOff, Trash2, FolderPlus, Folder, FolderOpen,
  GripVertical, Check, Pencil, ChevronDown,
  Paperclip, FileText, ImageIcon, FileCode, File,
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

interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'text' | 'code';
  mimeType: string;
  content: string; // base64 data URI pour images, texte brut pour les autres
  size: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  persona: Persona;
  level: FrictionLevel;
  attachments?: Attachment[];
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  persona: Persona;
  level: FrictionLevel;
  createdAt: Date;
  updatedAt: Date;
  projectId?: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  createdAt: Date;
}

const PROJECT_COLORS = ['#5D7BFF', '#818CF8', '#34D399', '#F472B6', '#FB923C'];
const getNextColor = (existing: Project[]) =>
  PROJECT_COLORS[existing.length % PROJECT_COLORS.length];

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

  const FORMAT = `
## Règles de formatage (OBLIGATOIRES)
Structure toujours ta réponse en Markdown avec ces conventions :
- **## Titre** pour chaque section principale (ex: ## Faille identifiée, ## Exemple, ## Question)
- **Gras** pour les concepts-clés et termes importants
- Listes à puces \`-\` pour les points multiples
- \`> \` blockquote pour les sources, citations ou références (toujours précéder d'une ligne \`> **Source :**\` ou \`> **Référence :**\`)
- \`> \` blockquote avec \`> **Exemple :**\` pour illustrer par un cas concret
- Texte normal pour l'analyse principale
- Sépare les sections avec une ligne vide
- Termine TOUJOURS par une section \`## Question\` avec une seule question incisive`;

  const map: Record<Persona, Record<FrictionLevel, string>> = {
    architect: {
      doux: `Tu es l'Architecte Logique, un guide intellectuel bienveillant spécialisé dans l'analyse de la structure argumentative. Tu ne juges pas — tu construis. Révèle les présupposés implicites, identifie les termes mal définis, questionne la prémisse centrale. Ton ton est celui d'un professeur passionné et encourageant. Réponds en français.${FORMAT}`,

      moyen: `Tu es l'Architecte Logique. Tu analyses rigoureusement la structure argumentative : syllogismes défaillants, généralisations abusives, non-sequitur, ambiguïtés. Pour chaque faille, propose une reformulation plus solide. Tu es intransigeant sur la rigueur logique, jamais hostile. Réponds en français.${FORMAT}`,

      extreme: `Tu es l'Architecte Logique en mode expert. Dissèque l'argument avec précision chirurgicale : sophismes, biais cognitifs, pétitions de principe, faux dilemmes — identifie tout. Sois direct et sans concession. Après chaque critique, propose une reformulation plus rigoureuse. Tu attaques les failles du raisonnement, jamais la personne. Réponds en français.${FORMAT}`,
    },
    factchecker: {
      doux: `Tu es le Fact-Checker accompagnateur. Tu aides l'utilisateur à solidifier ses bases factuelles de façon encourageante et curieuse. Questionne les sources, les échantillons, la réplicabilité. Ton but est de renforcer la solidité factuelle, pas d'embarrasser. Réponds en français.${FORMAT}`,

      moyen: `Tu es le Fact-Checker rigoureux. Tu examines chaque affirmation : distingue faits et opinions, corrélations et causalités. Signale les données inexactes ou hors contexte et propose une formulation plus précise. Cite des sources alternatives quand c'est pertinent. Réponds en français.${FORMAT}`,

      extreme: `Tu es le Fact-Checker en mode audit complet. Chaque chiffre, chaque "selon les experts" passe à l'examen critique. Identifie biais de confirmation, données hors contexte, fausses corrélations. Reformule chaque affirmation incorrecte avec la version factuelle exacte. Cite des sources réelles. Réponds en français.${FORMAT}`,
    },
    opponent: {
      doux: `Tu es l'Opposant Bienveillant. Tu explores le point de vue contraire pour enrichir la pensée, pas pour blesser. Présente l'argument adverse honnêtement et avec respect. Donne un exemple concret de la thèse opposée. Réponds en français.${FORMAT}`,

      moyen: `Tu es l'Opposant Idéologique. Tu défends systématiquement la position contraire avec des arguments solides et documentés. Ce n'est pas une attaque — c'est un entraînement intellectuel. Appuie chaque argument sur des exemples ou références réels. Réponds en français.${FORMAT}`,

      extreme: `Tu es l'Avocat du Diable. Adopte la position diamétralement opposée avec une argumentation serrée : exemples concrets, données réelles, penseurs qui défendent cette thèse. Expose les angles morts et contradictions internes. Tu combats les idées, jamais la personne. Réponds en français.${FORMAT}`,
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

// ─── File helpers ─────────────────────────────────────────────────────────────

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const CODE_EXTS = /\.(js|ts|tsx|jsx|py|java|c|cpp|cs|go|rs|rb|php|html|css|json|xml|yaml|yml|sh|sql|md)$/i;
const MAX_SIZE_MB = 10;

function fmtBytes(b: number) {
  return b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;
}

function fileIcon(att: Attachment) {
  if (att.type === 'image') return ImageIcon;
  if (att.type === 'code') return FileCode;
  return FileText;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
}

function readAsText(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsText(file); });
}

async function processFile(file: File): Promise<Attachment | null> {
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    alert(`Fichier trop volumineux (max ${MAX_SIZE_MB}MB) : ${file.name}`);
    return null;
  }
  if (IMAGE_TYPES.includes(file.type)) {
    const content = await readAsDataURL(file);
    return { id: uid(), name: file.name, type: 'image', mimeType: file.type, content, size: file.size };
  }
  try {
    const content = await readAsText(file);
    const type = CODE_EXTS.test(file.name) ? 'code' : 'text';
    return { id: uid(), name: file.name, type, mimeType: file.type || 'text/plain', content, size: file.size };
  } catch {
    alert(`Type de fichier non supporté : ${file.name}`);
    return null;
  }
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
      persona: m.persona,
      level: m.level,
      // Images non stockées en Firestore (trop lourdes) — texte tronqué à 8KB
      attachments: (m.attachments ?? []).map((a) => ({
        id: a.id, name: a.name, type: a.type, mimeType: a.mimeType, size: a.size,
        content: a.type === 'image' ? '' : a.content.slice(0, 8000),
      })),
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
      persona: (m.persona as Persona) ?? 'architect',
      level: (m.level as FrictionLevel) ?? 'moyen',
      attachments: ((m.attachments as Attachment[]) ?? []),
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
  } catch { /* silent */ }
}

// ─── Firestore: Projects ──────────────────────────────────────────────────────

function serializeProject(p: Project) {
  return { id: p.id, name: p.name, color: p.color, collapsed: p.collapsed, createdAt: p.createdAt.toISOString() };
}

async function fsLoadProjects(userId: string): Promise<Project[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, 'users', userId, 'projects'), orderBy('createdAt', 'asc')));
    return snap.docs.map((d) => {
      const data = d.data();
      return { id: data.id, name: data.name, color: data.color ?? '#5D7BFF', collapsed: data.collapsed ?? false, createdAt: new Date(data.createdAt) };
    });
  } catch { return []; }
}

async function fsSaveProject(userId: string, project: Project): Promise<void> {
  if (!db) return;
  try { await setDoc(doc(db, 'users', userId, 'projects', project.id), serializeProject(project)); }
  catch { /* silent */ }
}

async function fsDeleteProject(userId: string, projectId: string): Promise<void> {
  if (!db) return;
  try { await deleteDoc(doc(db, 'users', userId, 'projects', projectId)); }
  catch { /* silent */ }
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

const mdWhite = {
  // Paragraphe normal
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-white leading-relaxed mb-3 last:mb-0">{children}</p>
  ),

  // Titres de sections — style badge brutal
  h2: ({ children }: { children?: React.ReactNode }) => (
    <div className="flex items-center gap-2 mt-4 mb-2 first:mt-0">
      <div className="h-px flex-1 bg-white/20" />
      <p className="text-[8px] font-black uppercase tracking-widest text-white/50 px-2 py-0.5 border border-white/20">
        {children}
      </p>
      <div className="h-px flex-1 bg-white/20" />
    </div>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mt-3 mb-1.5">
      {children}
    </p>
  ),

  // Gras — fond blanc léger pour ressortir
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-black text-white bg-white/15 px-1 rounded-sm">{children}</strong>
  ),

  // Italique
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-white/80">{children}</em>
  ),

  // Liste à puces — puce carrée dans le style du site
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="space-y-1.5 mb-3 mt-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="space-y-1.5 mb-3 mt-1 counter-reset-[item]">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="flex items-start gap-2.5 text-sm text-white leading-relaxed">
      <span className="w-1.5 h-1.5 bg-white/50 flex-shrink-0 mt-1.5" />
      <span>{children}</span>
    </li>
  ),

  // Blockquote — Sources / Citations / Exemples
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 border-l-2 border-white/50 bg-white/10 pl-3 pr-3 py-2.5">
      <div className="text-[7px] font-black uppercase tracking-widest text-white/40 mb-1.5 flex items-center gap-1.5">
        <span className="w-3 h-px bg-white/30" />
        Référence
      </div>
      <div className="text-xs text-white/75 italic leading-relaxed">{children}</div>
    </div>
  ),

  // Code inline
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono text-xs bg-white/20 border border-white/20 px-1.5 py-0.5 text-white rounded-sm">
      {children}
    </code>
  ),

  // Séparateur horizontal
  hr: () => <div className="border-t border-white/20 my-4" />,

  // Liens
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-white underline decoration-white/40 hover:decoration-white font-medium transition-all"
    >
      {children}
    </a>
  ),
};

// ─── App ──────────────────────────────────────────────────────────────────────

// ─── ConvItem — session draggable ────────────────────────────────────────────

function ConvItem({
  conv, isActive, onSelect, onDelete, onDragStart, onDragEnd,
}: {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      className={cx(
        'flex items-center gap-1 group border-l-2 transition-all cursor-grab active:cursor-grabbing',
        isActive ? 'border-[#5D7BFF]' : 'border-transparent hover:border-white/15'
      )}
    >
      <GripVertical className="w-3 h-3 flex-shrink-0 text-white/10 group-hover:text-white/25 ml-1 transition-colors" />
      <button
        onClick={onSelect}
        className={cx(
          'flex-1 flex items-center gap-2 px-2 py-1.5 text-left transition-all min-w-0',
          isActive ? 'bg-[#5D7BFF]/15 text-white' : 'text-white/35 hover:text-white/60 hover:bg-white/5'
        )}
      >
        <MessageSquare className="w-3 h-3 flex-shrink-0" />
        <span className="text-[9px] font-medium truncate">{conv.title}</span>
      </button>
      <button
        onClick={onDelete}
        className="flex-shrink-0 mr-1 text-white/0 group-hover:text-white/25 hover:!text-red-400 transition-colors p-1"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

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

  // ── Projects state
  const [projects, setProjects] = useState<Project[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [draggedConvId, setDraggedConvId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null); // project id or 'none'

  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  // ── Firebase Auth listener
  useEffect(() => {
    if (!auth || !FIREBASE_ENABLED) return;
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        setSyncing(true);
        const [remote, remoteProjects] = await Promise.all([
          fsLoadConversations(firebaseUser.uid),
          fsLoadProjects(firebaseUser.uid),
        ]);
        setConversations(remote);
        setProjects(remoteProjects);
        setSyncing(false);
      } else {
        setConversations([]);
        setProjects([]);
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

  // ── Project callbacks
  const createProject = useCallback((name: string) => {
    if (!name.trim()) return;
    const p: Project = { id: uid(), name: name.trim(), color: getNextColor(projects), collapsed: false, createdAt: new Date() };
    setProjects((prev) => [...prev, p]);
    if (user) fsSaveProject(user.uid, p);
  }, [projects, user]);

  const deleteProject = useCallback(async (projectId: string) => {
    setProjects((p) => p.filter((x) => x.id !== projectId));
    // Détacher les conversations du projet supprimé
    setConversations((p) => p.map((c) => c.projectId === projectId ? { ...c, projectId: undefined } : c));
    if (user) await fsDeleteProject(user.uid, projectId);
  }, [user]);

  const renameProject = useCallback((projectId: string, name: string) => {
    if (!name.trim()) return;
    setProjects((p) => p.map((x) => x.id === projectId ? { ...x, name: name.trim() } : x));
    if (user) {
      const proj = projects.find((x) => x.id === projectId);
      if (proj) fsSaveProject(user.uid, { ...proj, name: name.trim() });
    }
  }, [projects, user]);

  const toggleProjectCollapse = useCallback((projectId: string) => {
    setProjects((p) => p.map((x) => x.id === projectId ? { ...x, collapsed: !x.collapsed } : x));
  }, []);

  const assignToProject = useCallback((convId: string, projectId: string | null) => {
    setConversations((p) => p.map((c) => {
      if (c.id !== convId) return c;
      const updated = { ...c, projectId: projectId ?? undefined };
      if (user) fsSaveConversation(user.uid, updated);
      return updated;
    }));
  }, [user]);

  // ── Send message
  const send = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      if (!text.trim() && attachments.length === 0) return;
      if (sending) return;

      // Capture persona + level au moment de l'envoi — immuable pour ce message
      const activePersona = persona;
      const activeLevel = level;

      const userMsg: Message = {
        id: uid(),
        role: 'user',
        content: text,
        timestamp: new Date(),
        persona: activePersona,
        level: activeLevel,
        attachments,
      };
      setPendingAttachments([]);

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

        const temperature = activeLevel === 'extreme' ? 0.9 : activeLevel === 'moyen' ? 0.7 : 0.5;
        const hasImages = attachments.some((a) => a.type === 'image');
        const model = hasImages ? 'pixtral-12b-2409' : 'mistral-small-latest';

        // Construction du contenu du dernier message utilisateur
        const buildUserContent = (msg: Message) => {
          const atts = msg.attachments ?? [];
          const imgs = atts.filter((a) => a.type === 'image');
          const texts = atts.filter((a) => a.type !== 'image');

          // Contexte textuel des fichiers joints
          const fileContext = texts.length > 0
            ? texts.map((a) => `[Fichier joint : ${a.name}]\n\`\`\`\n${a.content.slice(0, 8000)}\n\`\`\``).join('\n\n') + '\n\n'
            : '';

          if (imgs.length > 0) {
            // Format multimodal pour pixtral
            const parts: object[] = [];
            if (fileContext || msg.content) parts.push({ type: 'text', text: fileContext + msg.content });
            imgs.forEach((a) => parts.push({ type: 'image_url', image_url: { url: a.content } }));
            return parts;
          }
          return fileContext + msg.content;
        };

        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature,
            messages: [
              { role: 'system', content: buildSystemPrompt(activePersona, activeLevel) },
              ...allMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: buildUserContent(userMsg) },
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
          persona: activePersona,
          level: activeLevel,
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
    send(input, pendingAttachments);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input, pendingAttachments);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const results = await Promise.all(Array.from(files).map(processFile));
    const valid = results.filter(Boolean) as Attachment[];
    setPendingAttachments((p) => [...p, ...valid]);
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
                <img
                  src="https://i.postimg.cc/L4WsWhk9/Design-sans-titre-(12).png"
                  alt="Challenger IA"
                  className="h-10 w-auto flex-shrink-0 object-contain"
                />
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

              {/* ── Projets + Sessions ── */}
              <div className="space-y-1">

                {/* Header sessions */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Sessions</p>
                  <div className="flex items-center gap-2">
                    {syncing && <Loader2 className="w-2.5 h-2.5 animate-spin text-white/20" />}
                    {user && !syncing && <Cloud className="w-2.5 h-2.5 text-white/15" />}
                    <button
                      onClick={() => { setCreatingProject(true); setNewProjectName(''); }}
                      title="Nouveau projet"
                      className="text-white/25 hover:text-[#5D7BFF] transition-colors"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Champ création projet */}
                {creatingProject && (
                  <div className="flex items-center gap-1 mb-2">
                    <input
                      autoFocus
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { createProject(newProjectName); setCreatingProject(false); }
                        if (e.key === 'Escape') setCreatingProject(false);
                      }}
                      placeholder="Nom du projet…"
                      className="flex-1 bg-white/10 border border-[#5D7BFF]/40 text-white text-[9px] px-2 py-1.5 focus:outline-none focus:border-[#5D7BFF] placeholder:text-white/25"
                    />
                    <button
                      onClick={() => { createProject(newProjectName); setCreatingProject(false); }}
                      className="p-1.5 bg-[#5D7BFF] text-white hover:bg-[#4a68e8] transition-colors"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => setCreatingProject(false)} className="p-1.5 text-white/30 hover:text-white/60">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Projets */}
                {projects.map((project) => {
                  const projectConvs = conversations.filter((c) => c.projectId === project.id);
                  const isOver = dragOverId === project.id;
                  return (
                    <div key={project.id}>
                      {/* En-tête du projet */}
                      <div
                        className={cx(
                          'flex items-center gap-1.5 px-2 py-1.5 border transition-all group/proj',
                          isOver
                            ? 'border-dashed bg-white/10'
                            : 'border-transparent hover:border-white/10'
                        )}
                        style={{ borderColor: isOver ? project.color : undefined }}
                        onDragOver={(e) => { e.preventDefault(); setDragOverId(project.id); }}
                        onDragLeave={() => setDragOverId(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedConvId) assignToProject(draggedConvId, project.id);
                          setDragOverId(null);
                          setDraggedConvId(null);
                        }}
                      >
                        <button onClick={() => toggleProjectCollapse(project.id)} className="flex-shrink-0">
                          {project.collapsed
                            ? <Folder className="w-3.5 h-3.5" style={{ color: project.color }} />
                            : <FolderOpen className="w-3.5 h-3.5" style={{ color: project.color }} />}
                        </button>

                        {/* Nom / renommage */}
                        {editingProjectId === project.id ? (
                          <input
                            autoFocus
                            value={editingProjectName}
                            onChange={(e) => setEditingProjectName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { renameProject(project.id, editingProjectName); setEditingProjectId(null); }
                              if (e.key === 'Escape') setEditingProjectId(null);
                            }}
                            onBlur={() => { renameProject(project.id, editingProjectName); setEditingProjectId(null); }}
                            className="flex-1 bg-transparent text-[9px] text-white font-bold focus:outline-none border-b border-white/30"
                          />
                        ) : (
                          <button
                            onClick={() => toggleProjectCollapse(project.id)}
                            className="flex-1 text-left text-[9px] font-black uppercase tracking-wider text-white/60 hover:text-white/90 transition-colors truncate"
                          >
                            {project.name}
                            {projectConvs.length > 0 && (
                              <span className="ml-1 text-[7px] text-white/25 font-bold normal-case tracking-normal">
                                ({projectConvs.length})
                              </span>
                            )}
                          </button>
                        )}

                        <ChevronDown
                          className={cx('w-2.5 h-2.5 text-white/20 flex-shrink-0 transition-transform', project.collapsed && '-rotate-90')}
                        />

                        {/* Actions projet */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/proj:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingProjectId(project.id); setEditingProjectName(project.name); }}
                            className="p-0.5 text-white/25 hover:text-white/60 transition-colors"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => deleteProject(project.id)}
                            className="p-0.5 text-white/25 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>

                      {/* Sessions du projet */}
                      {!project.collapsed && (
                        <div className="ml-3 border-l border-white/10 pl-2 space-y-0.5 mb-1">
                          {projectConvs.length === 0 ? (
                            <p className="text-[7px] text-white/15 italic px-2 py-1">
                              {isOver ? 'Déposez ici…' : 'Aucune session'}
                            </p>
                          ) : (
                            projectConvs.map((conv) => (
                              <ConvItem
                                key={conv.id}
                                conv={conv}
                                isActive={conv.id === activeId}
                                onSelect={() => { setActiveId(conv.id); setPersona(conv.persona); setLevel(conv.level); }}
                                onDelete={() => deleteConv(conv.id)}
                                onDragStart={() => setDraggedConvId(conv.id)}
                                onDragEnd={() => setDraggedConvId(null)}
                              />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Sessions sans projet — zone de dépôt "retirer du projet" */}
                {conversations.filter((c) => !c.projectId).length > 0 && (
                  <div
                    className={cx(
                      'rounded transition-all',
                      dragOverId === 'none' && draggedConvId ? 'bg-white/5 border border-dashed border-white/20' : ''
                    )}
                    onDragOver={(e) => { e.preventDefault(); setDragOverId('none'); }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedConvId) assignToProject(draggedConvId, null);
                      setDragOverId(null);
                      setDraggedConvId(null);
                    }}
                  >
                    {projects.length > 0 && (
                      <p className="text-[7px] font-black uppercase tracking-widest text-white/15 px-2 py-1">
                        Sans projet
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {conversations.filter((c) => !c.projectId).map((conv) => (
                        <ConvItem
                          key={conv.id}
                          conv={conv}
                          isActive={conv.id === activeId}
                          onSelect={() => { setActiveId(conv.id); setPersona(conv.persona); setLevel(conv.level); }}
                          onDelete={() => deleteConv(conv.id)}
                          onDragStart={() => setDraggedConvId(conv.id)}
                          onDragEnd={() => setDraggedConvId(null)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* No Firebase info */}
              {!FIREBASE_ENABLED && (
                <div className="px-3 py-3 border border-white/10 bg-white/5">
                  <div className="flex items-start gap-2">
                    <CloudOff className="w-3 h-3 text-white/20 flex-shrink-0 mt-0.5" />
                    <p className="text-[8px] text-white/20 leading-relaxed">
                      Configurez Firebase pour activer la sauvegarde.
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
                  className="w-14 h-14 bg-[#5D7BFF] mx-auto mb-6 flex items-center justify-center"
                  style={{ boxShadow: '8px 8px 0px 0px rgba(20,20,20,1)' }}
                >
                  <CurrentIcon className="w-7 h-7 text-white" />
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
                      <div className="flex items-center gap-1.5">
                        {msg.role === 'assistant' && (() => {
                          const MsgIcon = PERSONAS[msg.persona ?? persona].icon;
                          return <MsgIcon className="w-2.5 h-2.5 text-white/50" />;
                        })()}
                        <p
                          className={cx(
                            'text-[7px] font-black uppercase tracking-widest',
                            msg.role === 'user' ? 'text-[#141414]/30' : 'text-white/60'
                          )}
                        >
                          {msg.role === 'user'
                            ? 'Vous'
                            : PERSONAS[msg.persona ?? persona].shortName}
                        </p>
                        {msg.role === 'assistant' && msg.level && (
                          <span className="text-[6px] font-black uppercase tracking-widest text-white/25 border border-white/15 px-1 py-px">
                            {FRICTION[msg.level ?? level].label}
                          </span>
                        )}
                      </div>
                      <p
                        className={cx(
                          'text-[7px] font-mono',
                          msg.role === 'user' ? 'text-[#141414]/25' : 'text-white/40'
                        )}
                      >
                        {fmtTime(msg.timestamp)}
                      </p>
                    </div>
                    {/* Pièces jointes du message */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={cx(
                        'px-4 pt-3 pb-1 flex flex-wrap gap-2 border-b',
                        msg.role === 'user' ? 'border-[#5D7BFF]/10' : 'border-white/15'
                      )}>
                        {msg.attachments.map((att) => {
                          const AttIcon = fileIcon(att);
                          if (att.type === 'image' && att.content) {
                            return (
                              <img
                                key={att.id}
                                src={att.content}
                                alt={att.name}
                                title={att.name}
                                className="max-h-48 max-w-[220px] object-contain border-2 border-[#5D7BFF]/20"
                              />
                            );
                          }
                          return (
                            <div
                              key={att.id}
                              className={cx(
                                'flex items-center gap-2 px-2.5 py-1.5 border',
                                msg.role === 'user'
                                  ? 'bg-[#F0F4FF] border-[#5D7BFF]/20 text-[#141414]'
                                  : 'bg-white/10 border-white/20 text-white'
                              )}
                            >
                              <AttIcon className={cx('w-3.5 h-3.5 flex-shrink-0', msg.role === 'user' ? 'text-[#5D7BFF]' : 'text-white/70')} />
                              <div className="min-w-0">
                                <p className="text-[9px] font-black truncate max-w-[120px]">{att.name}</p>
                                <p className={cx('text-[7px]', msg.role === 'user' ? 'text-[#141414]/40' : 'text-white/40')}>{fmtBytes(att.size)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="px-4 py-3">
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown components={mdWhite}>{msg.content}</ReactMarkdown>
                      ) : (
                        msg.content ? (
                          <p className="text-sm text-[#141414] leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        ) : null
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
        <div
          className="flex-shrink-0 bg-white border-t-4 border-[#5D7BFF] px-6 py-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <div className="max-w-3xl mx-auto">

            {/* Pièces jointes en attente */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {pendingAttachments.map((att) => {
                  const Icon = fileIcon(att);
                  return (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 bg-[#F0F4FF] border-2 border-[#5D7BFF]/20 px-2 py-1.5 group"
                    >
                      {att.type === 'image' ? (
                        <img src={att.content} alt={att.name} className="h-8 w-8 object-cover border border-[#5D7BFF]/20" />
                      ) : (
                        <Icon className="w-4 h-4 text-[#5D7BFF] flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-[#141414] truncate max-w-[120px]">{att.name}</p>
                        <p className="text-[7px] text-[#141414]/40">{fmtBytes(att.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingAttachments((p) => p.filter((a) => a.id !== att.id))}
                        className="text-[#141414]/25 hover:text-red-500 transition-colors ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              {/* Bouton pièce jointe */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.html,.css,.xml,.yaml,.yml,.sh,.sql"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="Joindre un fichier"
                className="flex-shrink-0 p-3 border-2 border-[#5D7BFF]/20 text-[#141414]/40 hover:border-[#5D7BFF] hover:text-[#5D7BFF] disabled:opacity-40 transition-all"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Textarea */}
              <div className="flex-1 relative">
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={pendingAttachments.length > 0 ? 'Ajoutez un message (optionnel)…' : `Soumettez une thèse à ${PERSONAS[persona].shortName}…`}
                  rows={1}
                  disabled={sending}
                  className="w-full bg-[#F0F4FF] border-2 border-[#5D7BFF]/20 focus:border-[#5D7BFF] px-4 py-3 text-sm font-medium text-[#141414] placeholder:text-[#141414]/30 focus:outline-none resize-none transition-all leading-relaxed"
                />
                <p className="absolute bottom-2 right-3 text-[7px] font-mono text-[#141414]/15 pointer-events-none select-none hidden sm:block">
                  ↵ envoyer &middot; Shift+↵ saut
                </p>
              </div>

              {/* Envoyer */}
              <button
                type="submit"
                disabled={sending || (!input.trim() && pendingAttachments.length === 0)}
                className="flex-shrink-0 bg-[#5D7BFF] text-white px-5 py-3 hover:bg-[#4a68e8] disabled:opacity-40 transition-all active:translate-x-0.5 active:translate-y-0.5"
                style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.2)' }}
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
