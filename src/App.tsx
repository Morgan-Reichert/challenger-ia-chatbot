import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Scale, Search, Swords, Plus, Send, Loader2, AlertCircle,
  RotateCcw, Zap, Menu, X, ChevronRight, MessageSquare,
  BookOpen, Target, TrendingUp, Brain, LogIn, LogOut, User,
  Cloud, CloudOff, Trash2, FolderPlus, Folder, FolderOpen,
  GripVertical, Check, Pencil, ChevronDown, AlertTriangle,
  Paperclip, FileText, ImageIcon, FileCode, File, FileSpreadsheet,
  Mail, Lock, Eye, EyeOff, Zap as ZapIcon, Crown, Infinity as InfinityIcon,
  Mic, MicOff, Volume2, Library, Settings,
  Star, UserMinus, Eraser, Slash, FileDown,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { User as FirebaseUser } from 'firebase/auth';
import { generateSessionPDF } from './pdfExport';
import LibraryPage from './LibraryPage';
import SettingsPage from './SettingsPage';
import { DEBATE_PERSONAS, type DebatePersona, type DebateDisplayData } from './debatePersonas';
import { INTERVIEW_TYPES, type InterviewTypeId, type InterviewTypeConfig } from './interviewTypes';
import { loadProfile, saveProfile, buildProfileContext, isProfileFilled, type UserProfile } from './userProfile';
import {
  FIREBASE_ENABLED, auth, db, googleProvider,
  signInWithPopup, signOut as fbSignOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, orderBy,
} from './firebase';
import { subscribeToNewsletter, getSubscription, type Plan } from './supabase';

// ─── Constantes abonnement ────────────────────────────────────────────────────
const FREE_DAILY_LIMIT = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

type Persona = 'architect' | 'factchecker' | 'opponent';
type FrictionLevel = 'doux' | 'moyen' | 'extreme';

interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'text' | 'code' | 'spreadsheet';
  mimeType: string;
  content: string; // base64 data URI pour images, texte brut pour les autres
  size: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'command';
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
  debatePrompt?: string;          // system prompt pour débats ET interviews
  debatePersonaId?: string;       // id du personnage débat
  debatePersonaCustomData?: DebateDisplayData; // données display pour opposant custom
  interviewType?: InterviewTypeId; // type d'interview (podcast, job, etc.)
  interviewTitle?: string;         // titre de la session interview
  noProfile?: boolean;             // désactive l'injection du profil pour cette conv
  memoryResetAt?: string;          // ISO — messages avant cette date exclus du contexte API
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

// Helper: resolve debate display data for a conversation (handles custom personas)
function getDP(conv: { debatePersonaId?: string; debatePersonaCustomData?: DebateDisplayData } | null | undefined): DebateDisplayData | null {
  if (!conv?.debatePersonaId) return null;
  if (conv.debatePersonaId !== 'custom') {
    return DEBATE_PERSONAS[conv.debatePersonaId as keyof typeof DEBATE_PERSONAS] ?? null;
  }
  return conv.debatePersonaCustomData ?? null;
}

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
## Mémoire conversationnelle (OBLIGATOIRE)
Tu as accès à l'intégralité de l'historique de la conversation. Tu DOIS :
- Te souvenir et référencer explicitement ce que l'utilisateur a dit dans les messages précédents
- Construire sur les arguments, exemples et réponses déjà échangés — ne jamais recommencer à zéro
- Si l'utilisateur répond à ta question précédente, commencer par reconnaître sa réponse avant d'approfondir
- Faire évoluer le fil de la discussion de façon cohérente et progressive
- Ne jamais poser une question à laquelle l'utilisateur a déjà répondu dans la conversation

## Règles de formatage (OBLIGATOIRES)
Structure toujours ta réponse en Markdown avec ces conventions :
- **## Titre** pour chaque section principale (ex: ## Faille identifiée, ## Exemple, ## Question)
- **Gras** pour les concepts-clés et termes importants
- Listes à puces \`-\` pour les points multiples
- \`> \` blockquote pour les sources, citations ou références (toujours précéder d'une ligne \`> **Source :**\` ou \`> **Référence :**\`)
- \`> \` blockquote avec \`> **Exemple :**\` pour illustrer par un cas concret
- Texte normal pour l'analyse principale
- Sépare les sections avec une ligne vide
- Termine TOUJOURS par une section \`## Question\` avec une seule question incisive qui s'appuie sur ce qui vient d'être dit`;

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
  return crypto.randomUUID();
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
const PDF_EXT = /\.pdf$/i;
const DOCX_EXT = /\.docx$/i;
const PPTX_EXT = /\.pptx$/i;
const XLSX_EXT = /\.(xlsx|numbers)$/i;
const MAX_SIZE_MB = 25;

function fmtBytes(b: number) {
  return b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;
}

function fileIcon(att: Attachment) {
  if (att.type === 'image') return ImageIcon;
  if (att.type === 'code') return FileCode;
  if (att.type === 'spreadsheet') return FileSpreadsheet;
  return FileText;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
}

function readAsText(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsText(file); });
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.onerror = rej; r.readAsArrayBuffer(file); });
}

/** Extrait le texte d'un PDF via pdfjs-dist (max 60 pages) */
async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  // Worker en mode fake (pas de Web Worker — compatibilité maximale)
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  const buffer = await readAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buffer, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const total = Math.min(pdf.numPages, 60);
  const parts: string[] = [];
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const pageText = tc.items.map((item: Record<string, unknown>) => ('str' in item ? item.str : '')).join(' ');
    if (pageText.trim()) parts.push(`[Page ${i}]\n${pageText.trim()}`);
  }
  if (pdf.numPages > 60) parts.push(`[… ${pdf.numPages - 60} pages supplémentaires non extraites]`);
  return parts.join('\n\n');
}

/** Extrait le texte d'un fichier Office Open XML (docx/pptx/xlsx) via jszip */
async function extractOfficeText(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const buffer = await readAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buffer);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  function stripXml(xml: string): string {
    return xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x[0-9A-Fa-f]+;/g, '')
      .replace(/\s{2,}/g, ' ').trim();
  }

  if (ext === 'docx') {
    const xml = await zip.file('word/document.xml')?.async('string') ?? '';
    // Préserver les sauts de paragraphe
    const formatted = xml.replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n');
    return stripXml(formatted);
  }

  if (ext === 'pptx') {
    const slideFiles = Object.keys(zip.files)
      .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] ?? '0');
        const nb = parseInt(b.match(/\d+/)?.[0] ?? '0');
        return na - nb;
      });
    const texts = await Promise.all(slideFiles.map(async (f, i) => {
      const xml = await zip.files[f].async('string');
      return `[Diapositive ${i + 1}]\n${stripXml(xml)}`;
    }));
    return texts.join('\n\n');
  }

  if (ext === 'xlsx' || ext === 'numbers') {
    // Extraire les chaînes partagées
    const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string') ?? '';
    const strings = [...ssXml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => m[1]);
    // Extraire les feuilles
    const sheetFiles = Object.keys(zip.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
    const sheets = await Promise.all(sheetFiles.map(async (f, i) => {
      const xml = await zip.files[f].async('string');
      const cells = [...xml.matchAll(/<c[^>]*t="s"[^>]*><v>(\d+)<\/v>/g)]
        .map(m => strings[parseInt(m[1])] ?? '');
      return `[Feuille ${i + 1}]\n${cells.join(' | ')}`;
    }));
    return sheets.join('\n\n');
  }

  return '';
}

async function processFile(file: File): Promise<Attachment | null> {
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    alert(`Fichier trop volumineux (max ${MAX_SIZE_MB}MB) : ${file.name}`);
    return null;
  }

  // ── Images ──
  if (IMAGE_TYPES.includes(file.type)) {
    const content = await readAsDataURL(file);
    return { id: uid(), name: file.name, type: 'image', mimeType: file.type, content, size: file.size };
  }

  // ── PDF ──
  if (PDF_EXT.test(file.name) || file.type === 'application/pdf') {
    try {
      const content = await extractPdfText(file);
      return { id: uid(), name: file.name, type: 'text', mimeType: 'application/pdf', content, size: file.size };
    } catch (e) {
      console.error('PDF extraction error, falling back to base64:', e);
      try {
        const b64 = await readAsDataURL(file);
        const content = `[Fichier PDF joint: ${file.name}]\n[Contenu base64: ${b64}]`;
        return { id: uid(), name: file.name, type: 'text', mimeType: 'application/pdf', content, size: file.size };
      } catch (e2) {
        console.error('PDF base64 fallback error:', e2);
        alert(`Impossible de lire ce PDF : ${file.name}`);
        return null;
      }
    }
  }

  // ── Word / PowerPoint / Excel ──
  if (DOCX_EXT.test(file.name) || PPTX_EXT.test(file.name) || XLSX_EXT.test(file.name)) {
    try {
      const content = await extractOfficeText(file);
      const type = XLSX_EXT.test(file.name) ? 'spreadsheet' : 'text';
      return { id: uid(), name: file.name, type: type as Attachment['type'], mimeType: file.type || 'application/octet-stream', content, size: file.size };
    } catch (e) {
      console.error('Office extraction error:', e);
      alert(`Impossible d'extraire le texte de ce fichier : ${file.name}`);
      return null;
    }
  }

  // ── Texte / Code ──
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
    projectId: conv.projectId ?? null,
    debatePersonaId: conv.debatePersonaId ?? null,
    debatePrompt: conv.debatePrompt ?? null,
    debatePersonaCustomData: conv.debatePersonaCustomData ?? null,
    interviewType: conv.interviewType ?? null,
    interviewTitle: conv.interviewTitle ?? null,
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
    projectId: (data.projectId as string | null) ?? undefined,
    debatePersonaId: (data.debatePersonaId as string | null) ?? undefined,
    debatePrompt: (data.debatePrompt as string | null) ?? undefined,
    debatePersonaCustomData: (data.debatePersonaCustomData as DebateDisplayData | null) ?? undefined,
    interviewType: (data.interviewType as InterviewTypeId | null) ?? undefined,
    interviewTitle: (data.interviewTitle as string | null) ?? undefined,
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

// ─── Firestore: Usage quotidien ──────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function fsGetUsage(userId: string): Promise<{ count: number; date: string }> {
  if (!db) return { count: 0, date: '' };
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'meta', 'usage'));
    if (!snap.exists()) return { count: 0, date: '' };
    const d = snap.data();
    return { count: d.count ?? 0, date: d.date ?? '' };
  } catch { return { count: 0, date: '' }; }
}

async function fsSaveUsage(userId: string, count: number, date: string): Promise<void> {
  if (!db) return;
  try {
    await setDoc(doc(db, 'users', userId, 'meta', 'usage'), { count, date });
  } catch { /* silent */ }
}

// ─── Firestore: Consentement CGU ─────────────────────────────────────────────

async function fsGetConsent(userId: string): Promise<boolean> {
  if (!db) return true; // Pas de Firebase → mode local, pas de modal
  try {
    const ref = doc(db, 'users', userId, 'meta', 'consent');
    const snap = await getDoc(ref);
    return snap.exists() && snap.data()?.cguAccepted === true;
  } catch { return false; }
}

async function fsSaveConsent(userId: string): Promise<void> {
  if (!db) return;
  try {
    const ref = doc(db, 'users', userId, 'meta', 'consent');
    await setDoc(ref, { cguAccepted: true, acceptedAt: new Date().toISOString() });
  } catch { /* silent */ }
}

// ─── Firestore: Profil utilisateur ───────────────────────────────────────────

async function fsLoadProfile(userId: string): Promise<Partial<UserProfile> | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'meta', 'profile'));
    if (!snap.exists()) return null;
    return snap.data() as Partial<UserProfile>;
  } catch { return null; }
}

async function fsSaveProfileRemote(userId: string, profile: UserProfile): Promise<void> {
  if (!db) return;
  try {
    await setDoc(doc(db, 'users', userId, 'meta', 'profile'), { ...profile, updatedAt: new Date().toISOString() });
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
        <span className="text-[11px] font-medium truncate">{conv.title}</span>
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

// ─── Slash Commands ──────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  {
    id: 'note',
    label: 'Recevoir une note',
    desc: "L'IA évalue la conversation et donne des conseils ciblés",
    icon: Star,
    shortcut: '/note',
  },
  {
    id: 'oublier',
    label: 'Oublier la mémoire',
    desc: "L'IA repart de zéro — historique conservé en affichage uniquement",
    icon: RotateCcw,
    shortcut: '/oublier',
  },
  {
    id: 'clear',
    label: 'Effacer la conversation',
    desc: 'Supprimer tous les messages de cette session',
    icon: Eraser,
    shortcut: '/clear',
  },
  {
    id: 'noprofil',
    label: 'Ignorer mon profil',
    desc: "Désactiver / réactiver l'injection du profil personnel pour cette session",
    icon: UserMinus,
    shortcut: '/noprofil',
  },
  {
    id: 'resumepdf',
    label: 'Résumé PDF',
    desc: "Génère et télécharge un résumé structuré de la conversation par l'IA",
    icon: FileDown,
    shortcut: '/resumepdf',
  },
  {
    id: 'exportjson',
    label: 'Exporter JSON',
    desc: 'Télécharge la conversation courante en JSON brut',
    icon: FileText,
    shortcut: '/exportjson',
  },
] as const;

type SlashCommandId = (typeof SLASH_COMMANDS)[number]['id'];

// ─── Appel API Chat avec streaming SSE ───────────────────────────────────────
async function streamChat(
  payload: { messages: object[]; model: string; temperature: number; searchQuery?: string },
  onChunk: (text: string) => void
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, stream: true }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? e?.message ?? `Erreur ${res.status}`);
  }
  if (!res.body) throw new Error('Streaming non supporté par ce navigateur');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        if (json.error) throw new Error(typeof json.error === 'string' ? json.error : JSON.stringify(json.error));
        const content = json.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      } catch (e) {
        if (e instanceof SyntaxError) continue; // chunk JSON incomplet → ignorer
        throw e;
      }
    }
  }
}

// ─── Appel API Chat sans streaming (LibraryPage / one-shot) ──────────────────
async function callChat(payload: {
  messages: object[];
  model: string;
  temperature: number;
  searchQuery?: string;
}): Promise<Response> {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, stream: false }),
  });
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

const ONBOARDING_PERSONAS: { key: Persona; emoji: string; title: string; desc: string; color: string }[] = [
  { key: 'architect',   emoji: '⚖️', title: "L'Architecte",    desc: "Déconstruit ta thèse, en teste la cohérence logique et les prémisses.",  color: '#5D7BFF' },
  { key: 'factchecker', emoji: '🔍', title: "Le Fact-Checker", desc: "Vérifie tes données, cite des contre-exemples et exige des sources.",    color: '#10B981' },
  { key: 'opponent',    emoji: '⚔️', title: "L'Opposant",      desc: "Attaque ta position frontalement et force à la défendre sous pression.",  color: '#EF4444' },
];

const ONBOARDING_SUGGESTIONS = [
  "L'intelligence artificielle va rendre le travail humain obsolète dans 20 ans.",
  "La démocratie directe est supérieure à la démocratie représentative.",
  "Les réseaux sociaux sont fondamentalement néfastes pour la société.",
];

function OnboardingOverlay({
  step, persona, onStepChange, onPersonaChange, onClose, onSend,
}: {
  step: number;
  persona: Persona;
  onStepChange: (s: number) => void;
  onPersonaChange: (p: Persona) => void;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#F0F4FF]/95 backdrop-blur-sm px-4"
    >
      <AnimatePresence mode="wait">
        {/* ── Étape 0 : Bienvenue ── */}
        {step === 0 && (
          <motion.div
            key="step0"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="text-center max-w-sm w-full"
          >
            <div className="relative inline-flex mb-6">
              <div className="absolute inset-[-10px] rounded-full bg-[#5D7BFF]/10 animate-ping" style={{ animationDuration: '2.5s' }} />
              <img src="https://i.postimg.cc/50kqszGt/Design-sans-titre.png" alt="CR" className="w-20 h-20 object-contain relative" style={{ animation: 'cr-breathe 2s ease-in-out infinite' }} />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tighter text-[#141414] mb-2">Challenger IA</h1>
            <p className="text-sm text-[#141414]/50 mb-8 font-medium">Ton adversaire intellectuel. Challengé pour progresser.</p>
            <button
              onClick={() => onStepChange(1)}
              className="px-8 py-3 bg-[#5D7BFF] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#4a68e8] transition-all"
              style={{ boxShadow: '4px 4px 0px 0px rgba(93,123,255,0.3)' }}
            >
              Commencer →
            </button>
            <button onClick={onClose} className="block mx-auto mt-4 text-[9px] text-[#141414]/25 hover:text-[#141414]/50 font-black uppercase tracking-widest transition-colors">
              Passer
            </button>
          </motion.div>
        )}

        {/* ── Étape 1 : Choix du persona ── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-lg"
          >
            <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/30 text-center mb-6">Choisissez votre challenger</p>
            <div className="space-y-3">
              {ONBOARDING_PERSONAS.map(p => (
                <button
                  key={p.key}
                  onClick={() => { onPersonaChange(p.key); onStepChange(2); }}
                  className={cx(
                    'w-full text-left px-5 py-4 border-2 transition-all',
                    persona === p.key
                      ? 'border-[#5D7BFF] bg-[#5D7BFF]/5'
                      : 'border-[#141414]/10 bg-white hover:border-[#5D7BFF]/40'
                  )}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{p.emoji}</span>
                    <div>
                      <p className="font-black text-[#141414] text-sm uppercase tracking-wide">{p.title}</p>
                      <p className="text-[11px] text-[#141414]/50 mt-0.5 leading-snug">{p.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#141414]/20 ml-auto flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
            <button onClick={onClose} className="block mx-auto mt-5 text-[9px] text-[#141414]/25 hover:text-[#141414]/50 font-black uppercase tracking-widest transition-colors">
              Passer
            </button>
          </motion.div>
        )}

        {/* ── Étape 2 : Première thèse ── */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-lg"
          >
            <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/30 text-center mb-2">Première thèse</p>
            <p className="text-center text-sm text-[#141414]/50 mb-6">
              Soumets une conviction à <span className="font-black text-[#5D7BFF]">{ONBOARDING_PERSONAS.find(p => p.key === persona)?.title}</span>
            </p>
            <div className="space-y-3">
              {ONBOARDING_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { onSend(s); onClose(); }}
                  className="w-full text-left px-5 py-4 bg-white border-2 border-[#5D7BFF]/15 hover:border-[#5D7BFF] hover:shadow-[4px_4px_0px_0px_rgba(93,123,255,0.8)] transition-all text-sm font-medium text-[#141414]"
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="block mx-auto mt-5 text-[9px] text-[#141414]/40 hover:text-[#5D7BFF] font-black uppercase tracking-widest transition-colors"
            >
              ✏️ Écrire moi-même
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Textes rotatifs pendant le streaming ────────────────────────────────────

const STREAMING_TEXTS: Record<string, string[]> = {
  architect:   ['Structuration logique…', 'Analyse des prémisses…', 'Cartographie des arguments…', 'Formalisation de la thèse…'],
  factchecker: ['Vérification des sources…', 'Recoupement factuel…', 'Analyse des données…', 'Examen des biais…'],
  opponent:    ['Identification des failles…', 'Déconstruction logique…', 'Contre-argumentation…', "Préparation de l'offensive…"],
  debate:      ['Argumentation en cours…',   'Analyse contextuelle…',    'Formulation de la réponse…', 'Recherche des arguments…'],
  interview:   ['Formulation de la question…','Analyse de vos réponses…','Évaluation des éléments…',  'Préparation du suivi…'],
};

function StreamingHeader({ persona, isDebate, isInterview }: {
  persona: Persona; isDebate: boolean; isInterview: boolean;
}) {
  const key = isInterview ? 'interview' : isDebate ? 'debate' : persona;
  const texts = STREAMING_TEXTS[key] ?? STREAMING_TEXTS.architect;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % texts.length), 2000);
    return () => clearInterval(t);
  }, [texts.length]);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-black/[0.06]">

      {/* ── Logo CR animé ───────────────────────────── */}
      <div className="relative flex-shrink-0" style={{ width: 26, height: 26 }}>

        {/* Halo pulsé derrière le logo */}
        <div
          className="absolute rounded-full bg-[#5D7BFF]"
          style={{
            inset: -6,
            animation: 'cr-halo 2s ease-in-out infinite',
          }}
        />

        {/* Logo + shimmer dans un clip */}
        <div
          className="relative overflow-hidden"
          style={{ width: 26, height: 26 }}
        >
          <img
            src="https://i.postimg.cc/50kqszGt/Design-sans-titre.png"
            alt="Challenger IA"
            style={{
              width: 26,
              height: 26,
              objectFit: 'contain',
              display: 'block',
              animation: 'cr-breathe 2s ease-in-out infinite',
            }}
          />
          {/* Balayage lumineux gauche → droite */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.85) 50%, transparent 80%)',
              animation: 'cr-shimmer 2.2s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* ── Texte rotatif ───────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.span
          key={idx}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.22 }}
          className="text-[9px] font-black uppercase tracking-widest text-[#141414]/40 select-none"
        >
          {texts[idx]}
        </motion.span>
      </AnimatePresence>
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
  const [sidebarOpen, setSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

  // ── Auth state
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(FIREBASE_ENABLED);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // ── Abonnement
  const [subscription, setSubscription] = useState<Plan>('free');
  const [dailyUsage, setDailyUsage] = useState<{ count: number; date: string }>({ count: 0, date: '' });
  const [upgradeModal, setUpgradeModal] = useState<'limit' | 'files' | 'projects' | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // ── Navigation
  const [currentPage, setCurrentPage] = useState<'chat' | 'library' | 'settings'>('chat');

  // ── User profile (local only)
  const [userProfile, setUserProfile] = useState<UserProfile>(loadProfile);

  // ── Slash commands
  const [slashIdx, setSlashIdx] = useState(0);
  const [slashNotif, setSlashNotif] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Mobile detection
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const slashNotifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  // noProfileMode : actif globalement si aucune conv active, sinon stocké sur la conv
  const [noProfileMode, setNoProfileMode] = useState(false);
  const [resumeGenerating, setResumeGenerating] = useState(false);
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');

  // ── UX features
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('cia_onboarding_done'));
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingPersona, setOnboardingPersona] = useState<Persona>('architect');
  const [collapsedMsgs, setCollapsedMsgs] = useState<Set<string>>(new Set());

  // ── Mode vocal
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceOpenRef = useRef(false);
  const lastSpokenIdRef = useRef<string | null>(null);
  const startListeningRef = useRef<() => void>(() => {});
  const sendRef = useRef<(text: string) => void>(() => {});
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // ── Consentement (affiché à la première connexion uniquement)
  const [consentPending, setConsentPending] = useState<FirebaseUser | null>(null);
  const [consentCgu, setConsentCgu] = useState(false);
  const [consentNewsletter, setConsentNewsletter] = useState(true); // pré-coché
  const [consentLoading, setConsentLoading] = useState(false);

  // ── Formulaire d'authentification email/password
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authShowPassword, setAuthShowPassword] = useState(false);
  const [authFormError, setAuthFormError] = useState<string | null>(null);
  const [authFormLoading, setAuthFormLoading] = useState(false);

  // ── Projects state
  const [projects, setProjects] = useState<Project[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [draggedConvId, setDraggedConvId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null); // project id or 'none'
  const [deleteProjectModal, setDeleteProjectModal] = useState<{ projectId: string; projectName: string; convCount: number } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  // ── Slash commands — valeurs dérivées (computed ici pour être disponibles avant les useEffect)
  const slashFilter = input.startsWith('/') && !input.includes('\n')
    ? input.slice(1).toLowerCase()
    : null;
  const slashMatches = slashFilter !== null
    ? SLASH_COMMANDS.filter(
        (c) =>
          slashFilter === '' ||
          c.id.includes(slashFilter) ||
          c.label.toLowerCase().includes(slashFilter) ||
          c.desc.toLowerCase().includes(slashFilter)
      )
    : [];
  const slashOpen = slashMatches.length > 0;
  // Clamp l'index sélectionné pour éviter les out-of-bounds
  const safeSlashIdx = Math.min(slashIdx, Math.max(0, slashMatches.length - 1));

  // ── Chargement des données après consentement confirmé
  const loadUserData = useCallback(async (firebaseUser: FirebaseUser) => {
    setUser(firebaseUser);
    setSyncing(true);
    const [remote, remoteProjects, plan, usage, remoteProfile] = await Promise.all([
      fsLoadConversations(firebaseUser.uid),
      fsLoadProjects(firebaseUser.uid),
      getSubscription(firebaseUser.uid),
      fsGetUsage(firebaseUser.uid),
      fsLoadProfile(firebaseUser.uid),
    ]);
    setConversations(remote);
    setProjects(remoteProjects);
    setSubscription(plan);
    setDailyUsage(usage.date === todayStr() ? usage : { count: 0, date: todayStr() });
    // Profil : Firestore prioritaire sur localStorage si disponible
    if (remoteProfile) {
      const merged = { ...loadProfile(), ...remoteProfile } as UserProfile;
      setUserProfile(merged);
      saveProfile(merged);
    }
    setSyncing(false);
  }, []);

  // ── Vocal : charge les voix disponibles (asynchrone dans certains navigateurs)
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  // ── Vocal : TTS avec sélection de la meilleure voix disponible
  const speakText = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`{1,3}[\s\S]*?`{1,3}/g, 'code')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[-*+]\s/gm, '')
      .replace(/^\d+\.\s/gm, '')
      .trim();

    const lang = navigator.language.startsWith('fr') ? 'fr-FR' : navigator.language;
    const langCode = lang.split('-')[0];
    const voices = voicesRef.current;

    // Priorité : voix online/neurale > voix locale > défaut système
    let bestVoice: SpeechSynthesisVoice | null = null;
    if (voices.length) {
      const langVoices = voices.filter(v => v.lang.startsWith(langCode));
      bestVoice = langVoices.find(v => !v.localService)  // neural/online
        ?? langVoices.find(v => /natural|enhanced|premium/i.test(v.name))
        ?? langVoices[0]
        ?? null;
    }

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = lang;
    utterance.rate = 0.93;   // légèrement plus lent = plus naturel
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    if (bestVoice) utterance.voice = bestVoice;

    utterance.onstart = () => setVoiceSpeaking(true);
    utterance.onend = () => {
      setVoiceSpeaking(false);
      if (voiceOpenRef.current) startListeningRef.current();
    };
    utterance.onerror = () => {
      setVoiceSpeaking(false);
      if (voiceOpenRef.current) startListeningRef.current();
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  // ── Vocal : STT
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }
    const recognition = new SR();
    recognition.lang = navigator.language.startsWith('fr') ? 'fr-FR' : navigator.language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join('');
      setVoiceTranscript(transcript);
      if (e.results[e.results.length - 1].isFinal) {
        recognitionRef.current = null;
        setVoiceListening(false);
        setVoiceTranscript('');
        if (transcript.trim()) sendRef.current(transcript.trim());
      }
    };
    recognition.onerror = () => { setVoiceListening(false); setVoiceTranscript(''); };
    recognition.onend = () => setVoiceListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setVoiceListening(true);
  }, []);

  // Toujours à jour dans les closures TTS
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceListening(false);
    setVoiceTranscript('');
  }, []);

  const openVoice = useCallback(() => {
    voiceOpenRef.current = true;
    lastSpokenIdRef.current = null;
    setVoiceOpen(true);
  }, []);

  const closeVoice = useCallback(() => {
    stopListening();
    window.speechSynthesis?.cancel();
    setVoiceSpeaking(false);
    setVoiceOpen(false);
    voiceOpenRef.current = false;
    lastSpokenIdRef.current = null;
  }, [stopListening]);

  // ── Démarrer un débat depuis la bibliothèque
  const startDebate = useCallback(async (debatePersona: DebatePersona) => {
    // 1. Fetch contexte web seulement pour les personas de bibliothèque (pas custom)
    let webContext = '';
    if (debatePersona.id !== 'custom' && debatePersona.wikiSlug) {
      try {
        const res = await fetch(
          `/api/search-context?query=${encodeURIComponent(debatePersona.wikiSlug)}&lang=${debatePersona.wikiLang}`
        );
        if (res.ok) {
          const data = await res.json();
          webContext = data.context ?? '';
        }
      } catch { /* silencieux — le débat fonctionne sans contexte web */ }
    }

    // 2. Construire le system prompt enrichi
    const currentDate = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const profileCtx = buildProfileContext(userProfile);
    const systemPrompt = debatePersona.buildSystemPrompt(webContext, currentDate) +
      (profileCtx ? '\n\n' + profileCtx : '');

    // 3. Créer une nouvelle conversation de débat
    const convId = uid();
    const now = new Date();
    const conv: Conversation = {
      id: convId,
      title: `Débat — ${debatePersona.name}`,
      messages: [],
      persona: 'opponent',
      level: 'extreme',
      createdAt: now,
      updatedAt: now,
      debatePrompt: systemPrompt,
      debatePersonaId: debatePersona.id,
      // Pour les personas custom, stocker les données d'affichage
      debatePersonaCustomData: debatePersona.id === 'custom' ? {
        name: debatePersona.name,
        shortName: debatePersona.shortName,
        title: debatePersona.title,
        color: debatePersona.color,
        flag: debatePersona.flag,
        country: debatePersona.country,
        category: debatePersona.category,
      } : undefined,
    };
    setConversations((p) => [conv, ...p]);
    setActiveId(convId);
    if (user) fsSaveConversation(user.uid, conv);
    setCurrentPage('chat');
  }, [user]);

  // ── Start Interview ───────────────────────────────────────────────────────
  const startInterview = useCallback(async (
    config: InterviewTypeConfig,
    systemPrompt: string,
    title: string
  ) => {
    const convId = uid();
    const now = new Date();
    const conv: Conversation = {
      id: convId,
      title,
      messages: [],
      persona: 'opponent',
      level: 'moyen',
      createdAt: now,
      updatedAt: now,
      debatePrompt: systemPrompt,
      interviewType: config.id,
      interviewTitle: title,
    };
    setConversations(p => [conv, ...p]);
    setActiveId(convId);
    setCurrentPage('chat');

    // L'IA ouvre la session avec sa première question
    setSending(true);
    try {
      const res = await callChat({
        model: 'mistral-large-latest',
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '[DÉBUT DE SESSION]' },
        ],
      });
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content ?? '…';
      const openingMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
        persona: 'opponent',
        level: 'moyen',
      };
      const updated: Conversation = {
        ...conv,
        messages: [openingMsg],
        updatedAt: new Date(),
      };
      setConversations(p => p.map(c => c.id === convId ? updated : c));
      if (user) fsSaveConversation(user.uid, updated);
    } catch { /* silencieux — l'utilisateur peut quand même répondre */ }
    finally { setSending(false); }
  }, [user]);

  // ── Firebase Auth listener
  useEffect(() => {
    if (!auth || !FIREBASE_ENABLED) return;
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      // Pas d'utilisateur → écran de connexion immédiat
      if (!firebaseUser) {
        setUser(null);
        setConsentPending(null);
        setConversations([]);
        setProjects([]);
        setActiveId(null);
        setAuthLoading(false);
        return;
      }

      // Utilisateur présent → garder le loading screen le temps de vérifier le consentement
      // (évite le flash de l'écran de connexion entre la création de compte et le modal CGU)
      setAuthLoading(true);
      try {
        const hasConsent = await fsGetConsent(firebaseUser.uid);
        if (hasConsent) {
          await loadUserData(firebaseUser);
        } else {
          // Première connexion → modal de consentement
          setConsentCgu(false);
          setConsentNewsletter(true);
          setConsentPending(firebaseUser);
        }
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // ── Retour depuis Stripe : re-vérification du plan + visibilitychange
  useEffect(() => {
    // Détecte ?payment=success dans l'URL au chargement
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setPaymentSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
    }

    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && user) {
        const plan = await getSubscription(user.uid);
        setSubscription(plan);
        if (plan === 'pro') setPaymentSuccess(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user]);

  // ── Auto-masquage de la notification de paiement
  useEffect(() => {
    if (!paymentSuccess) return;
    const t = setTimeout(() => setPaymentSuccess(false), 6000);
    return () => clearTimeout(t);
  }, [paymentSuccess]);

  // ── Vocal : déclenche le TTS quand l'IA répond en mode vocal
  useEffect(() => {
    if (!voiceOpen || sending) return;
    const msgs = activeConv?.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (last.id === lastSpokenIdRef.current) return;
    lastSpokenIdRef.current = last.id;
    speakText(last.content);
  }, [activeConv?.messages, sending, voiceOpen, speakText]);

  // ── Vocal : cleanup au démontage
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
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
    setUser(null);
    setConversations([]);
    setProjects([]);
    setActiveId(null);
  };

  // ── Consentement — confirmer
  const handleConsentAccept = async () => {
    if (!consentPending || !consentCgu) return;
    setConsentLoading(true);
    try {
      await fsSaveConsent(consentPending.uid);
      if (consentNewsletter && consentPending.email) {
        await subscribeToNewsletter(consentPending.email);
      }
      const u = consentPending;
      setConsentPending(null);
      await loadUserData(u);
    } catch {
      // En cas d'erreur Firestore, on laisse quand même entrer
      const u = consentPending;
      setConsentPending(null);
      await loadUserData(u);
    } finally {
      setConsentLoading(false);
    }
  };

  // ── Consentement — refuser / annuler
  const handleConsentDecline = async () => {
    if (auth) await fbSignOut(auth);
    setConsentPending(null);
    setConsentCgu(false);
    setConsentNewsletter(true);
  };

  // ── Auth email/password — traduire les codes d'erreur Firebase
  function translateAuthError(code: string): string {
    switch (code) {
      case 'auth/email-already-in-use': return 'Cet email est déjà utilisé. Essayez de vous connecter.';
      case 'auth/invalid-email': return 'Adresse email invalide.';
      case 'auth/weak-password': return 'Mot de passe trop court (6 caractères minimum).';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found': return 'Email ou mot de passe incorrect.';
      case 'auth/too-many-requests': return 'Trop de tentatives. Réessayez dans quelques minutes.';
      case 'auth/network-request-failed': return 'Erreur réseau. Vérifiez votre connexion.';
      default: return 'Une erreur est survenue. Veuillez réessayer.';
    }
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || authFormLoading) return;
    setAuthFormError(null);
    setAuthFormLoading(true);
    try {
      await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      setAuthFormError(translateAuthError(code));
    } finally {
      setAuthFormLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || authFormLoading) return;
    setAuthFormError(null);
    if (authPassword.length < 6) {
      setAuthFormError('Mot de passe trop court (6 caractères minimum).');
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setAuthFormError('Les mots de passe ne correspondent pas.');
      return;
    }
    setAuthFormLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      // onAuthStateChanged prend le relais → modal consentement
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      setAuthFormError(translateAuthError(code));
    } finally {
      setAuthFormLoading(false);
    }
  };

  const switchAuthMode = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthFormError(null);
    setAuthPassword('');
    setAuthConfirmPassword('');
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

  // ── Raccourcis clavier globaux
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+N / Cmd+N → Nouvelle conversation
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        startNewConv();
        return;
      }
      // Esc → fermer sidebar sur mobile
      if (e.key === 'Escape' && isMobile && sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [startNewConv, isMobile, sidebarOpen]);

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

  // Ouvre le modal de confirmation de suppression
  const openDeleteProjectModal = useCallback((projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    const convCount = conversations.filter((c) => c.projectId === projectId).length;
    setDeleteProjectModal({ projectId, projectName: proj.name, convCount });
  }, [projects, conversations]);

  // Supprime le projet uniquement — les sessions redeviennent libres
  const deleteProjectOnly = useCallback(async (projectId: string) => {
    setProjects((p) => p.filter((x) => x.id !== projectId));
    setConversations((p) => p.map((c) => {
      if (c.projectId !== projectId) return c;
      const updated = { ...c, projectId: undefined };
      if (user) fsSaveConversation(user.uid, updated);
      return updated;
    }));
    if (user) await fsDeleteProject(user.uid, projectId);
    setDeleteProjectModal(null);
  }, [user]);

  // Supprime le projet ET toutes ses sessions
  const deleteProjectAndContent = useCallback(async (projectId: string) => {
    const convIds = conversations.filter((c) => c.projectId === projectId).map((c) => c.id);
    setProjects((p) => p.filter((x) => x.id !== projectId));
    setConversations((p) => p.filter((c) => c.projectId !== projectId));
    if (activeId && convIds.includes(activeId)) setActiveId(null);
    if (user) {
      await fsDeleteProject(user.uid, projectId);
      await Promise.all(convIds.map((id) => fsDeleteConversation(user.uid, id)));
    }
    setDeleteProjectModal(null);
  }, [conversations, activeId, user]);

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

      // ── Vérification limite quotidienne (plan Free uniquement)
      if (subscription === 'free' && FIREBASE_ENABLED) {
        const today = todayStr();
        const currentCount = dailyUsage.date === today ? dailyUsage.count : 0;
        if (currentCount >= FREE_DAILY_LIMIT) {
          setUpgradeModal('limit');
          return;
        }
        // Incrémenter avant l'envoi
        const newCount = currentCount + 1;
        const newUsage = { count: newCount, date: today };
        setDailyUsage(newUsage);
        if (user) fsSaveUsage(user.uid, newCount, today);
      }

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
          noProfile: noProfileMode || undefined,
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
        const temperature = activeLevel === 'extreme' ? 0.9 : activeLevel === 'moyen' ? 0.7 : 0.5;
        const hasImages = attachments.some((a) => a.type === 'image');
        const model = hasImages ? 'pixtral-12b-2409' : 'mistral-small-latest';

        // Construction du contenu du dernier message utilisateur
        const buildUserContent = (msg: Message) => {
          const atts = msg.attachments ?? [];
          const imgs = atts.filter((a) => a.type === 'image');
          const texts = atts.filter((a) => a.type !== 'image');

          const fileContext = texts.length > 0
            ? texts.map((a) => `[Fichier joint : ${a.name}]\n\`\`\`\n${a.content.slice(0, 8000)}\n\`\`\``).join('\n\n') + '\n\n'
            : '';

          if (imgs.length > 0) {
            const parts: object[] = [];
            if (fileContext || msg.content) parts.push({ type: 'text', text: fileContext + msg.content });
            imgs.forEach((a) => parts.push({ type: 'image_url', image_url: { url: a.content } }));
            return parts;
          }
          return fileContext + msg.content;
        };

        const activeConvNow = conversations.find((c) => c.id === convId);
        const basePrompt = activeConvNow?.debatePrompt ?? buildSystemPrompt(activePersona, activeLevel);
        const profileCtx = (!activeConvNow?.debatePrompt && !activeConvNow?.noProfile && !noProfileMode)
          ? buildProfileContext(userProfile)
          : '';
        const systemPrompt = profileCtx ? basePrompt + '\n\n' + profileCtx : basePrompt;
        const debateModel = activeConvNow?.debatePrompt ? 'mistral-large-latest' : model;

        // Inject real-time date (côté client — non sensible)
        const currentDateStr = new Date().toLocaleDateString('fr-FR', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        const enrichedSystemPrompt = systemPrompt + `\n\n## Contexte temps réel\nDate actuelle : ${currentDateStr}`;

        const memoryResetAt = activeConvNow?.memoryResetAt;
        const contextMessages = memoryResetAt
          ? allMessages.filter((m) => new Date(m.timestamp).toISOString() > memoryResetAt)
          : allMessages;

        // Placeholder vide affiché immédiatement pendant le streaming
        const asstId = uid();
        setConversations((p) =>
          p.map((c) =>
            c.id !== convId ? c : {
              ...c,
              messages: [...c.messages, {
                id: asstId,
                role: 'assistant' as const,
                content: '',
                timestamp: new Date(),
                persona: activePersona,
                level: activeLevel,
              }],
              updatedAt: new Date(),
            }
          )
        );

        // Stream chunk par chunk
        let accumulated = '';
        await streamChat(
          {
            model: debateModel,
            temperature,
            searchQuery: text,
            messages: [
              { role: 'system', content: enrichedSystemPrompt },
              ...contextMessages.slice(0, -1).filter((m) => m.role !== 'command').map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: buildUserContent(userMsg) },
            ],
          },
          (chunk) => {
            accumulated += chunk;
            const snap = accumulated;
            setConversations((p) =>
              p.map((c) =>
                c.id !== convId ? c : {
                  ...c,
                  messages: c.messages.map((m) => (m.id === asstId ? { ...m, content: snap } : m)),
                }
              )
            );
          }
        );

        // Streaming terminé — sauvegarder l'état final dans Firestore
        setConversations((p) => {
          const conv = p.find((c) => c.id === convId);
          if (conv && user) fsSaveConversation(user.uid, conv);
          return p;
        });
      } catch (e) {
        setChatError(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        setSending(false);
      }
    },
    [activeId, conversations, sending, persona, level, user, subscription, dailyUsage]
  );

  // Garde sendRef à jour pour startListening (défini avant send dans le composant)
  useEffect(() => { sendRef.current = send; }, [send]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input, pendingAttachments);
  };

  // ── Slash commands — navigation clavier et exécution

  const showSlashNotif = useCallback((msg: string, ok = true) => {
    if (slashNotifTimer.current) clearTimeout(slashNotifTimer.current);
    setSlashNotif({ msg, ok });
    slashNotifTimer.current = setTimeout(() => setSlashNotif(null), 2800);
  }, []);

  const addCommandMsg = useCallback((content: string) => {
    if (!activeId) return;
    const msg: Message = {
      id: uid(),
      role: 'command',
      content,
      timestamp: new Date(),
      persona,
      level,
    };
    setConversations((p) =>
      p.map((c) =>
        c.id !== activeId ? c : { ...c, messages: [...c.messages, msg], updatedAt: new Date() }
      )
    );
  }, [activeId, persona, level, setConversations]);

  const handleSlashCommand = useCallback(
    async (id: SlashCommandId) => {
      setInput('');
      setSlashIdx(0);

      if (id === 'note') {
        if (!activeId) {
          showSlashNotif('Lance d\'abord une conversation pour obtenir une évaluation.', false);
          return;
        }
        const evalPrompt =
          'COMMANDE /note — Analyse notre échange et fournis : 1) une note globale sur 10 avec justification, 2) 3 points forts de mes interventions, 3) 3 axes d\'amélioration concrets. Sois direct et constructif.';
        send(evalPrompt, []);
        showSlashNotif('Évaluation en cours…');
        addCommandMsg('Évaluation demandée — réponse en cours…');
        return;
      }

      if (id === 'clear') {
        if (!activeId) {
          showSlashNotif('Aucun message à effacer dans cette session.', false);
          return;
        }
        setConversations((p) =>
          p.map((c) =>
            c.id !== activeId ? c : { ...c, messages: [], memoryResetAt: undefined, updatedAt: new Date() }
          )
        );
        showSlashNotif('Conversation effacée.');
        addCommandMsg('Conversation effacée.');
        return;
      }

      if (id === 'oublier') {
        if (!activeId) {
          showSlashNotif('Aucun historique à oublier dans cette session.', false);
          return;
        }
        const resetAt = new Date().toISOString();
        setConversations((p) =>
          p.map((c) => (c.id !== activeId ? c : { ...c, memoryResetAt: resetAt, updatedAt: new Date() }))
        );
        showSlashNotif('Mémoire effacée — l\'IA repart de zéro.');
        addCommandMsg('Mémoire effacée — l\'IA repart de zéro.');
        return;
      }

      if (id === 'noprofil') {
        if (activeId) {
          // Conv active : toggle sur la conv
          let nextVal = false;
          setConversations((p) =>
            p.map((c) => {
              if (c.id !== activeId) return c;
              nextVal = !c.noProfile;
              return { ...c, noProfile: nextVal, updatedAt: new Date() };
            })
          );
          // On lit l'état actuel depuis conversations pour le message
          const cur = conversations.find((c) => c.id === activeId);
          showSlashNotif(cur?.noProfile ? 'Profil réactivé pour cette session.' : 'Profil ignoré pour cette session.');
          addCommandMsg(cur?.noProfile ? 'Profil réactivé pour cette session.' : 'Profil ignoré pour cette session.');
        } else {
          // Pas de conv active : toggle le flag global (affectera la prochaine conv)
          setNoProfileMode((v) => {
            showSlashNotif(!v ? 'Profil ignoré — actif pour les prochaines sessions.' : 'Profil réactivé.');
            return !v;
          });
        }
        return;
      }

      if (id === 'resumepdf') {
        const conv = conversations.find((c) => c.id === activeId);
        if (!conv || conv.messages.length < 2) {
          showSlashNotif('Il faut au moins un échange pour générer un résumé.', false);
          return;
        }

        setResumeGenerating(true);
        showSlashNotif('Génération du résumé PDF en cours…');

        const transcript = conv.messages
          .map((m) => `[${m.role === 'user' ? 'Utilisateur' : 'IA'}] ${m.content}`)
          .join('\n\n');

        const systemPrompt = `Tu es un assistant expert en synthèse et analyse de conversations. Tu produis des résumés structurés, clairs et actionnables. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans balises, sans texte autour.`;

        const userPrompt = `Voici la transcription d'une session de travail avec une IA challenger :

${transcript.slice(0, 12000)}

Génère un résumé structuré en JSON avec ce schéma exact :
{
  "titre": "Titre court et précis de la session (max 60 caractères)",
  "vue_ensemble": "Résumé global de l'échange en 3-4 phrases. Contexte, enjeux, dynamique générale.",
  "points_forts": ["Point fort 1 concret", "Point fort 2", "Point fort 3", "Point fort 4"],
  "axes_amelioration": ["Axe 1 concret avec suggestion", "Axe 2", "Axe 3"],
  "conseils": ["Conseil pratique 1 actionnable", "Conseil 2", "Conseil 3", "Conseil 4"],
  "citations": ["Phrase ou argument notable de l'utilisateur 1", "Citation 2"],
  "score": 7,
  "score_justification": "Justification courte du score sur 10 (qualité des arguments, profondeur, progression)",
  "mots_cles": ["mot1", "mot2", "mot3", "mot4", "mot5"]
}

Sois précis, factuel et bienveillant. Les conseils doivent être directement actionnables.`;

        try {
          const res = await callChat({
            model: 'mistral-large-latest',
            temperature: 0.4,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const raw = data.choices[0].message.content ?? '';

          // Extract JSON robustly
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('Réponse JSON invalide');
          const summary = JSON.parse(jsonMatch[0]);

          // Validate required fields
          if (!summary.titre || !summary.vue_ensemble) throw new Error('Résumé incomplet');

          // Determine session type label
          const sessionTypeLabel = conv.interviewType
            ? `Interview — ${conv.interviewTitle ?? conv.interviewType}`
            : conv.debatePersonaId
              ? `Débat — ${conv.title}`
              : `Chat — ${PERSONAS[conv.persona]?.name ?? 'Challenger'}`;

          await generateSessionPDF(
            summary,
            sessionTypeLabel,
            new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
            userProfile.displayName || undefined
          );

          showSlashNotif('PDF téléchargé avec succès !');
          addCommandMsg('Résumé PDF généré et téléchargé.');
        } catch (err) {
          console.error('PDF error:', err);
          showSlashNotif('Erreur lors de la génération du PDF.', false);
        } finally {
          setResumeGenerating(false);
        }
        return;
      }

      if (id === 'exportjson') {
        const conv = conversations.find((c) => c.id === activeId);
        if (!conv) {
          showSlashNotif('Aucune conversation active à exporter.', false);
          return;
        }
        const payload = JSON.stringify({ _app: 'Challenger IA', _version: 1, exportedAt: new Date().toISOString(), conversation: conv }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `challenger-session-${conv.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showSlashNotif('Conversation exportée en JSON.');
        addCommandMsg('Session exportée en JSON.');
        return;
      }
    },
    [activeId, send, showSlashNotif, addCommandMsg, setConversations, conversations, userProfile]
  );

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIdx((i) => Math.min(Math.max(0, slashMatches.length - 1), i + 1));
        return;
      }
      if (e.key === 'Escape') {
        setInput('');
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && slashMatches[safeSlashIdx]) {
        e.preventDefault();
        handleSlashCommand(slashMatches[safeSlashIdx].id);
        return;
      }
    }
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

      {/* ── Chargement initial Firebase ───────────────────────────────────── */}
      {FIREBASE_ENABLED && authLoading && !consentPending && (
        <div className="flex-1 bg-[#141414] flex flex-col items-center justify-center gap-5">
          <img
            src="https://i.postimg.cc/L4WsWhk9/Design-sans-titre-(12).png"
            alt="Challenger IA"
            className="h-14 w-auto object-contain opacity-70"
          />
          <Loader2 className="w-5 h-5 animate-spin text-[#5D7BFF]" />
          <p className="text-[8px] font-black uppercase tracking-widest text-white/20">
            Vérification du compte…
          </p>
        </div>
      )}

      {/* ── Écran de connexion / inscription ─────────────────────────────── */}
      {FIREBASE_ENABLED && !user && !authLoading && !consentPending && (
        <div className="flex-1 bg-[#141414] overflow-y-auto flex items-center justify-center p-6">
          <div className="w-full max-w-sm">

            {/* Logo */}
            <div className="text-center mb-8">
              <img
                src="https://i.postimg.cc/L4WsWhk9/Design-sans-titre-(12).png"
                alt="Challenger IA"
                className="h-14 w-auto mx-auto mb-3 object-contain"
              />
              <p className="text-[8px] font-black uppercase tracking-widest text-white/20">
                Stariax Group — Challenger IA
              </p>
            </div>

            {/* Toggle Connexion / Créer un compte */}
            <div className="grid grid-cols-2 border-2 border-white/10 mb-6">
              {(['login', 'signup'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => switchAuthMode(mode)}
                  className={cx(
                    'py-2.5 text-[9px] font-black uppercase tracking-widest transition-all',
                    authMode === mode
                      ? 'bg-[#5D7BFF] text-white'
                      : 'text-white/30 hover:text-white/60'
                  )}
                >
                  {mode === 'login' ? 'Connexion' : 'Créer un compte'}
                </button>
              ))}
            </div>

            {/* Formulaire email/password */}
            <form
              onSubmit={authMode === 'login' ? handleEmailSignIn : handleEmailSignUp}
              className="space-y-4"
            >
              {/* Email */}
              <div>
                <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full bg-white/5 border-2 border-white/10 focus:border-[#5D7BFF] pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Mot de passe */}
              <div>
                <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                  <input
                    type={authShowPassword ? 'text' : 'password'}
                    required
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder={authMode === 'signup' ? '6 caractères minimum' : '••••••••'}
                    className="w-full bg-white/5 border-2 border-white/10 focus:border-[#5D7BFF] pl-10 pr-10 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setAuthShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
                  >
                    {authShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmer mot de passe (inscription uniquement) */}
              <AnimatePresence>
                {authMode === 'signup' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5">
                      Confirmer le mot de passe
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                      <input
                        type={authShowPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        value={authConfirmPassword}
                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white/5 border-2 border-white/10 focus:border-[#5D7BFF] pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none transition-colors"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Erreur formulaire */}
              <AnimatePresence>
                {authFormError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 px-3 py-2.5"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-red-400 leading-relaxed">{authFormError}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bouton submit */}
              <button
                type="submit"
                disabled={authFormLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#5D7BFF] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#4a68e8] disabled:opacity-40 transition-all"
                style={{ boxShadow: '4px 4px 0px 0px rgba(255,255,255,0.06)' }}
              >
                {authFormLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</>
                  : authMode === 'login'
                    ? <><LogIn className="w-4 h-4" /> Se connecter</>
                    : <><Check className="w-4 h-4" /> Créer mon compte</>
                }
              </button>
            </form>

            {/* Séparateur */}
            <div className="flex items-center gap-4 my-5">
              <div className="flex-1 h-px bg-white/10" />
              <p className="text-[7px] font-black uppercase tracking-widest text-white/20">ou</p>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Google */}
            <button
              onClick={handleSignIn}
              disabled={authFormLoading}
              className="w-full flex items-center justify-center gap-3 py-3 bg-white/5 border-2 border-white/10 hover:border-white/25 hover:bg-white/10 text-white disabled:opacity-40 transition-all"
            >
              {/* Google icon SVG */}
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-[9px] font-black uppercase tracking-widest">
                Continuer avec Google
              </span>
            </button>

            {/* Auth error global (Google) */}
            {authError && (
              <p className="mt-3 text-center text-[8px] text-red-400">{authError}</p>
            )}

          </div>
        </div>
      )}

      {/* ── Application (connecté ou mode local sans Firebase) ────────────── */}
      {(!FIREBASE_ENABLED || user) && !authLoading && (<>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && isMobile && (
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={isMobile ? { x: '-100%' } : { width: 0, opacity: 0 }}
            animate={isMobile ? { x: 0 } : { width: 300, opacity: 1 }}
            exit={isMobile ? { x: '-100%' } : { width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className={cx(
              'flex flex-col bg-[#141414] text-white border-r-4 border-[#5D7BFF]',
              isMobile
                ? 'fixed inset-y-0 left-0 z-50 w-[280px] h-full overflow-y-auto'
                : 'flex-shrink-0 h-full overflow-hidden'
            )}
            style={isMobile ? undefined : { minWidth: 0 }}
          >
            {/* Logo */}
            <div className="px-5 py-4 border-b-2 border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowSharePopup(true)}
                  className="focus:outline-none hover:opacity-75 transition-opacity active:scale-95"
                  title="Partager Challenger IA"
                >
                  <img
                    src="https://i.postimg.cc/L4WsWhk9/Design-sans-titre-(12).png"
                    alt="Challenger IA"
                    className="h-10 w-auto flex-shrink-0 object-contain"
                  />
                </button>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-white/30 hover:text-white/70 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* New session */}
            <div className="px-5 py-4 border-b-2 border-white/10 space-y-3">
              <button
                onClick={() => { startNewConv(); setSidebarOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#5D7BFF] text-white text-xs font-black uppercase tracking-widest hover:bg-[#4a68e8] transition-colors"
                style={{ boxShadow: '4px 4px 0px 0px rgba(255,255,255,0.06)' }}
              >
                <span>Nouvelle Session</span>
                <Plus className="w-4 h-4" />
              </button>
              {/* Recherche sidebar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25 pointer-events-none" />
                <input
                  type="text"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="Rechercher une session…"
                  className="w-full bg-white/5 border border-white/10 pl-8 pr-3 py-2 text-[11px] text-white/60 placeholder-white/20 focus:outline-none focus:border-[#5D7BFF]/50 focus:text-white/80 transition-colors"
                />
                {sidebarSearch && (
                  <button
                    onClick={() => setSidebarSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

              {/* Bibliothèque */}
              <button
                onClick={() => { setCurrentPage('library'); setSidebarOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-3 border-2 border-white/10 text-white/50 hover:border-[#5D7BFF]/50 hover:text-white/80 hover:bg-[#5D7BFF]/5 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Library className="w-4 h-4" />
                  <span className="text-[11px] font-black uppercase tracking-widest">Bibliothèque</span>
                </div>
                <ChevronRight className="w-3 h-3 opacity-50" />
              </button>

              {/* Profil IA */}
              <button
                onClick={() => { setCurrentPage('settings'); setSidebarOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-3 border-2 border-white/10 text-white/50 hover:border-[#5D7BFF]/50 hover:text-white/80 hover:bg-[#5D7BFF]/5 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Settings className="w-4 h-4" />
                  <span className="text-[11px] font-black uppercase tracking-widest">Profil IA</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isProfileFilled(userProfile) && (
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  )}
                  <ChevronRight className="w-3 h-3 opacity-50" />
                </div>
              </button>

              {/* Persona selector — masqué en mode débat / interview */}
              {activeConv?.interviewType ? (
                <div className="px-4 py-3 border-2 border-white/5 bg-white/[0.02]">
                  {(() => {
                    const ic = INTERVIEW_TYPES[activeConv.interviewType!];
                    const IIcon = ic?.icon;
                    return (
                      <>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Mode interview</p>
                        <div className="flex items-center gap-2">
                          {IIcon && <IIcon className="w-4 h-4" style={{ color: ic.accentColor }} />}
                          <div>
                            <p className="text-[11px] font-black text-white/70">{ic?.label}</p>
                            <p className="text-[9px] text-white/30">{ic?.interviewerRole}</p>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : activeConv?.debatePersonaId ? (
                <div className="px-4 py-3 border-2 border-white/5 bg-white/[0.02]">
                  {(() => {
                    const dp = getDP(activeConv);
                    return (
                      <>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Mode débat</p>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{dp?.flag}</span>
                          <div>
                            <p className="text-[11px] font-black text-white/70">{dp?.name}</p>
                            <p className="text-[9px] text-white/30">{dp?.category}</p>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-white/25 mb-3">
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
                          onClick={() => {
                            if (p.id !== persona && activeId) {
                              addCommandMsg(`— Persona changée : ${p.name} —`);
                            }
                            setPersona(p.id);
                          }}
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
                            <p className="text-[11px] font-black uppercase tracking-wider">
                              {p.shortName}
                            </p>
                            <p className="text-[10px] opacity-60 truncate">{p.desc}</p>
                          </div>
                          {active && <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0" />}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
              )} {/* fin persona selector conditionnel */}

              {/* Friction level */}
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-white/25 mb-3">
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
                      <p className="text-[11px] font-black uppercase tracking-wider leading-none">
                        {val.label}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-center text-[10px] text-white/20">{FRICTION[level].hint}</p>
              </div>

              {/* ── Upgrade CTA (free users only) ── */}
              {subscription === 'free' && (
                <button
                  onClick={() => {
                    const link = import.meta.env.VITE_STRIPE_PAYMENT_LINK;
                    if (link) window.open(`${link}?client_reference_id=${user?.uid ?? ''}`, '_blank');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#5D7BFF]/15 border-2 border-[#5D7BFF]/40 text-[#5D7BFF] text-[11px] font-black uppercase tracking-widest hover:bg-[#5D7BFF]/25 hover:border-[#5D7BFF]/70 transition-all"
                  style={{ boxShadow: '4px 4px 0px 0px rgba(93,123,255,0.1)' }}
                >
                  <Crown className="w-4 h-4" />
                  7 jours gratuits — Pro
                </button>
              )}

              {/* ── Projets + Sessions ── */}
              <div className="space-y-1">

                {/* Header sessions */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-black uppercase tracking-widest text-white/25">Sessions</p>
                  <div className="flex items-center gap-2">
                    {syncing && <Loader2 className="w-2.5 h-2.5 animate-spin text-white/20" />}
                    {user && !syncing && <Cloud className="w-2.5 h-2.5 text-white/15" />}
                    <button
                      onClick={() => subscription === 'pro'
                        ? (setCreatingProject(true), setNewProjectName(''))
                        : setUpgradeModal('projects')
                      }
                      title={subscription === 'pro' ? 'Nouveau projet' : 'Fonctionnalité Pro'}
                      className="text-white/25 hover:text-[#5D7BFF] transition-colors relative"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      {subscription === 'free' && (
                        <span className="absolute -top-1.5 -right-1.5 bg-[#5D7BFF] text-white text-[5px] font-black px-0.5">PRO</span>
                      )}
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
                      className="flex-1 bg-white/10 border border-[#5D7BFF]/40 text-white text-[11px] px-2 py-1.5 focus:outline-none focus:border-[#5D7BFF] placeholder:text-white/25"
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
                  const projectConvs = conversations.filter((c) => c.projectId === project.id && (!sidebarSearch || c.title.toLowerCase().includes(sidebarSearch.toLowerCase())));
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
                            className="flex-1 bg-transparent text-[11px] text-white font-bold focus:outline-none border-b border-white/30"
                          />
                        ) : (
                          <button
                            onClick={() => toggleProjectCollapse(project.id)}
                            className="flex-1 text-left text-[11px] font-black uppercase tracking-wider text-white/60 hover:text-white/90 transition-colors truncate"
                          >
                            {project.name}
                            {projectConvs.length > 0 && (
                              <span className="ml-1 text-[9px] text-white/25 font-bold normal-case tracking-normal">
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
                            onClick={() => openDeleteProjectModal(project.id)}
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
                            <p className="text-[9px] text-white/15 italic px-2 py-1">
                              {isOver ? 'Déposez ici…' : 'Aucune session'}
                            </p>
                          ) : (
                            projectConvs.map((conv) => (
                              <ConvItem
                                key={conv.id}
                                conv={conv}
                                isActive={conv.id === activeId}
                                onSelect={() => { setActiveId(conv.id); setPersona(conv.persona); setLevel(conv.level); setSidebarOpen(false); }}
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
                {(conversations.filter((c) => !c.projectId).length > 0 || !!draggedConvId) && (
                  <div
                    className={cx(
                      'transition-all',
                      dragOverId === 'none' && draggedConvId ? 'bg-white/5 border border-dashed border-white/20 rounded' : ''
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
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/15 px-2 py-1">
                        Sans projet
                      </p>
                    )}
                    {/* Hint visible quand on glisse et qu'il n'y a aucune session libre */}
                    {draggedConvId && conversations.filter((c) => !c.projectId).length === 0 && (
                      <p className={cx(
                        'text-[9px] italic px-2 py-2 transition-colors',
                        dragOverId === 'none' ? 'text-white/50' : 'text-white/20'
                      )}>
                        {dragOverId === 'none' ? 'Déposez pour retirer du projet…' : 'Déposer ici pour retirer du projet'}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {conversations.filter((c) => !c.projectId && (!sidebarSearch || c.title.toLowerCase().includes(sidebarSearch.toLowerCase()))).map((conv) => (
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

            {/* User footer */}
            <div className="px-5 py-4 border-t-2 border-white/10">
              {user ? (
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
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[11px] font-black text-white/70 truncate">
                          {user.displayName ?? user.email}
                        </p>
                        {subscription === 'pro' && (
                          <span className="flex-shrink-0 flex items-center gap-0.5 bg-[#5D7BFF] px-1 py-px">
                            <Crown className="w-2 h-2 text-white" />
                            <span className="text-[6px] font-black text-white">PRO</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-white/25 uppercase tracking-widest truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-white/10 hover:border-white/25 transition-colors text-white/30 hover:text-white/60"
                  >
                    <LogOut className="w-3 h-3" />
                    <span className="text-[11px] font-black uppercase tracking-widest">
                      Déconnexion
                    </span>
                  </button>
                </div>
              ) : (
                <p className="text-center text-[10px] font-black uppercase tracking-widest text-white/15">
                  Stariax Group © 2026
                </p>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Onboarding overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingOverlay
            step={onboardingStep}
            persona={onboardingPersona}
            onStepChange={setOnboardingStep}
            onPersonaChange={(p) => { setOnboardingPersona(p); setPersona(p); }}
            onClose={() => {
              localStorage.setItem('cia_onboarding_done', '1');
              setShowOnboarding(false);
            }}
            onSend={(text) => {
              localStorage.setItem('cia_onboarding_done', '1');
              setShowOnboarding(false);
              send(text);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Bibliothèque ────────────────────────────────────────────────────── */}
      {currentPage === 'library' && (
        <div className={cx('flex-1 min-w-0 h-full max-md:pb-16', currentPage !== 'library' && 'hidden')}>
          <LibraryPage
            onBack={() => setCurrentPage('chat')}
            onStartDebate={startDebate}
            onStartInterview={startInterview}
            userProfile={userProfile}
          />
        </div>
      )}

      {/* ── Réglages / Profil IA ─────────────────────────────────────────────── */}
      {currentPage === 'settings' && (
        <div className={cx('flex-1 min-w-0 h-full max-md:pb-16', currentPage !== 'settings' && 'hidden')}>
          <SettingsPage
            onBack={() => setCurrentPage('chat')}
            profile={userProfile}
            onSave={(p) => { setUserProfile(p); saveProfile(p); if (user) fsSaveProfileRemote(user.uid, p); }}
          />
        </div>
      )}

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className={cx('flex-1 flex flex-col min-w-0 h-full', currentPage !== 'chat' && 'hidden', 'max-md:pb-16')}>
        {/* Top bar */}
        <div className="flex-shrink-0 bg-white border-b-4 border-[#5D7BFF] px-6 py-4 flex items-center gap-4">
          {(!sidebarOpen || isMobile) && (
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="text-[#5D7BFF] hover:opacity-70 transition-opacity flex-shrink-0"
            >
              {sidebarOpen && isMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
          <div
            className="w-8 h-8 bg-[#5D7BFF] flex items-center justify-center flex-shrink-0"
            style={{ boxShadow: '3px 3px 0px 0px rgba(20,20,20,0.15)' }}
          >
            <CurrentIcon className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            {activeConv?.interviewType ? (() => {
              const ic = INTERVIEW_TYPES[activeConv.interviewType!];
              return (
                <>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#141414] truncate">
                      {activeConv.interviewTitle ?? ic?.label}
                    </p>
                    <span className="flex-shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 text-white" style={{ backgroundColor: ic?.accentColor ?? '#94A3B8' }}>
                      INTERVIEW
                    </span>
                  </div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/35">
                    {ic?.interviewerRole}
                  </p>
                </>
              );
            })() : activeConv?.debatePersonaId ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#141414] truncate">
                    Débat — {getDP(activeConv)?.name}
                  </p>
                  <span className="flex-shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-[#5D7BFF] text-white">
                    DÉBAT
                  </span>
                </div>
                <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/35">
                  {getDP(activeConv)?.title}
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-black uppercase tracking-widest text-[#141414] truncate">
                  {PERSONAS[persona].name}
                </p>
                <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/35">
                  Mode {FRICTION[level].label} — {FRICTION[level].hint}
                </p>
              </>
            )}
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

        {/* ── Share popup ───────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showSharePopup && (
            <>
              {/* Backdrop */}
              <motion.div
                key="share-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                onClick={() => setShowSharePopup(false)}
              />
              {/* Modal */}
              <motion.div
                key="share-modal"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
              >
                <div className="pointer-events-auto w-full max-w-xs bg-[#141414] border-2 border-[#5D7BFF]/30 p-6 flex flex-col items-center gap-5" style={{ boxShadow: '6px 6px 0px 0px rgba(93,123,255,0.25)' }}>
                  {/* Close */}
                  <div className="w-full flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Challenger IA</p>
                    <button onClick={() => setShowSharePopup(false)} className="text-white/30 hover:text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {/* QR code */}
                  <img
                    src="https://i.postimg.cc/L5trkZXw/Untitled.png"
                    alt="QR Code Challenger IA"
                    className="w-44 h-44 object-contain border border-white/10"
                  />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 text-center">
                    Scanne pour accéder à Challenger IA
                  </p>
                  {/* Share button */}
                  <button
                    onClick={() => {
                      const url = window.location.href;
                      if (navigator.share) {
                        navigator.share({ title: 'Challenger IA', text: "L'outil de pensée analytique qui questionne vos certitudes.", url });
                      } else {
                        navigator.clipboard.writeText(url);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[#5D7BFF] hover:bg-[#4a68e8] transition-colors text-white text-[9px] font-black uppercase tracking-widest active:scale-95"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    Partager l'application
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Bannière succès paiement */}
        <AnimatePresence>
          {paymentSuccess && (
            <motion.div
              key="payment-success"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-3 bg-[#5D7BFF] border-b-2 border-[#4a68e8]"
            >
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-white flex-shrink-0" />
                <p className="text-[11px] font-black uppercase tracking-widest text-white">
                  Bienvenue dans Challenger Pro ! Ton accès est maintenant actif.
                </p>
              </div>
              <button onClick={() => setPaymentSuccess(false)} className="text-white/50 hover:text-white transition-colors flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bannière session interview ── */}
        {activeConv?.interviewType && (() => {
          const ic = INTERVIEW_TYPES[activeConv.interviewType!];
          if (!ic) return null;
          const IIcon = ic.icon;
          const turns = activeConv.messages.filter(m => m.role === 'user').length;
          return (
            <div className="flex-shrink-0 border-b border-white/5" style={{ background: ic.bgColor }}>
              <div className="flex items-center px-6 py-4 gap-4" style={{ borderBottom: `1px solid ${ic.accentColor}20` }}>
                {/* Icon */}
                <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ background: `${ic.accentColor}18`, border: `1.5px solid ${ic.accentColor}30` }}>
                  <IIcon className="w-5 h-5" style={{ color: ic.accentColor }} />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: `${ic.accentColor}80` }}>
                    Session en cours
                  </p>
                  <p className="text-[13px] font-black text-white truncate">
                    {activeConv.interviewTitle ?? ic.label}
                  </p>
                </div>
                {/* Role + turns */}
                <div className="text-right flex-shrink-0">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: `${ic.accentColor}80` }}>
                    {ic.interviewerRole}
                  </p>
                  {turns > 0 && (
                    <p className="text-[9px] font-bold text-white/30 mt-0.5">
                      {turns} réponse{turns > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Bannière arène de débat ── */}
        {!activeConv?.interviewType && activeConv?.debatePersonaId && (() => {
          const dp = getDP(activeConv);
          if (!dp) return null;
          const rounds = Math.ceil(activeConv.messages.length / 2);
          return (
            <div className="flex-shrink-0 border-b border-white/5" style={{ background: 'linear-gradient(90deg, #091a10 0%, #0a0c14 35%, #0a0c14 65%, #1a0909 100%)' }}>
              <div className="flex items-stretch" style={{ minHeight: '72px' }}>
                {/* Gauche — Challenger (vert) */}
                <div className="flex-1 flex flex-col justify-center px-6 py-3" style={{ background: 'linear-gradient(90deg, rgba(34,197,94,0.18) 0%, transparent 100%)' }}>
                  <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'rgba(74,222,128,0.65)' }}>Vous</p>
                  <p className="text-[15px] font-black text-white leading-tight">Challenger</p>
                  <div className="mt-1.5 w-10 h-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.5)' }} />
                </div>

                {/* Centre — VS */}
                <div className="flex flex-col items-center justify-center px-10 relative">
                  <div className="absolute inset-y-0 left-0 w-px" style={{ background: 'linear-gradient(180deg, transparent, rgba(74,222,128,0.3), transparent)' }} />
                  <div className="absolute inset-y-0 right-0 w-px" style={{ background: 'linear-gradient(180deg, transparent, rgba(239,68,68,0.3), transparent)' }} />
                  <p className="text-[30px] font-black leading-none text-white" style={{ textShadow: '0 0 40px rgba(255,255,255,0.2)' }}>VS</p>
                  <p className="text-[8px] font-black uppercase tracking-widest mt-1" style={{ color: dp.color }}>
                    {rounds > 0 ? `Round ${rounds}` : 'Prêt'}
                  </p>
                </div>

                {/* Droite — Persona (rouge) */}
                <div className="flex-1 flex flex-col justify-center items-end px-6 py-3" style={{ background: 'linear-gradient(270deg, rgba(239,68,68,0.18) 0%, transparent 100%)' }}>
                  <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'rgba(248,113,113,0.65)' }}>{dp.country} {dp.flag}</p>
                  <p className="text-[15px] font-black text-white leading-tight">{dp.shortName}</p>
                  <div className="mt-1.5 w-10 h-0.5 rounded-full ml-auto" style={{ background: 'rgba(239,68,68,0.5)' }} />
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Barre de contexte (hors scroll) ── */}
        {activeConv && activeConv.messages.filter(m => m.role !== 'command').length > 0
          && !activeConv.interviewType && !activeConv.debatePersonaId && (() => {
          const msgCount = activeConv.messages.filter(m => m.role !== 'command').length;
          const heat = msgCount >= 10 || activeConv.level === 'extreme' ? 'hot'
            : msgCount >= 5 || activeConv.level === 'moyen' ? 'warm' : 'cool';
          const heatColor = heat === 'hot' ? '#EF4444' : heat === 'warm' ? '#F59E0B' : '#5D7BFF';
          const heatLabel = heat === 'hot' ? 'intense' : heat === 'warm' ? 'actif' : 'calme';
          const heatDots = heat === 'hot' ? 5 : heat === 'warm' ? 3 : 1;
          const PIcon = PERSONAS[activeConv.persona].icon;
          return (
            <div className="flex-shrink-0 flex items-center gap-2.5 px-6 py-1.5 bg-white border-b border-[#5D7BFF]/10">
              <PIcon className="w-3 h-3 flex-shrink-0" style={{ color: '#5D7BFF99' }} />
              <p className="text-[7px] font-black uppercase tracking-widest text-[#141414]/40">
                {PERSONAS[activeConv.persona].shortName}
              </p>
              <span className="text-[6px] font-black uppercase tracking-widest border px-1.5 py-px" style={{ color: '#5D7BFF', borderColor: '#5D7BFF40' }}>
                {FRICTION[activeConv.level].label}
              </span>
              <span className="text-[7px] text-[#141414]/20 font-mono">{msgCount} msg</span>
              <div className="flex items-center gap-1 ml-auto">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full transition-colors" style={{ backgroundColor: i < heatDots ? heatColor : '#14141415' }} />
                ))}
                <span className="text-[6px] font-black uppercase tracking-widest ml-1.5" style={{ color: heatColor + 'AA' }}>{heatLabel}</span>
              </div>
            </div>
          );
        })()}

        {/* Messages */}
        {(() => {
          const interviewCfg = activeConv?.interviewType ? INTERVIEW_TYPES[activeConv.interviewType] : null;
          return (
        <div
          className={cx('flex-1 overflow-y-auto px-6 py-8 transition-colors', (activeConv?.debatePersonaId || interviewCfg) ? '' : '')}
          style={interviewCfg ? { background: interviewCfg.bgColor } : activeConv?.debatePersonaId ? { background: '#0a0c14' } : undefined}
        >
          {!activeConv || activeConv.messages.length === 0 ? (
            activeConv?.interviewType ? (
              // Interview empty state — IA is generating first message
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="flex items-center gap-2 justify-center mb-3">
                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: INTERVIEW_TYPES[activeConv.interviewType!]?.accentColor, animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: INTERVIEW_TYPES[activeConv.interviewType!]?.accentColor, animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: INTERVIEW_TYPES[activeConv.interviewType!]?.accentColor, animationDelay: '300ms' }} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25">
                    {INTERVIEW_TYPES[activeConv.interviewType!]?.interviewerRole} prépare sa première question…
                  </p>
                </div>
              </div>
            ) : activeConv?.debatePersonaId ? (() => {
              const dp2 = getDP(activeConv);
              const SUGGESTION_ICONS = [Target, Brain, TrendingUp];
              const personaFromLib = activeConv.debatePersonaId !== 'custom'
                ? DEBATE_PERSONAS[activeConv.debatePersonaId as keyof typeof DEBATE_PERSONAS]
                : undefined;
              const rawTopics = personaFromLib?.suggestedTopics ?? [
                `La liberté d'expression doit-elle avoir des limites dans une démocratie ?`,
                `L'égalité parfaite entre les individus est-elle possible ?`,
                `La technologie nous rend-elle plus libres ou plus dépendants ?`,
              ];
              const debateSuggestions = rawTopics.map((text, i) => ({ text, icon: SUGGESTION_ICONS[i] }));
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto"
                >
                  {/* Arena header */}
                  <div className="w-full flex items-center gap-0 mb-8" style={{ maxWidth: '560px' }}>
                    <div className="flex-1 flex flex-col items-center py-5 px-4 border border-green-400/20" style={{ background: 'rgba(34,197,94,0.08)' }}>
                      <div className="w-10 h-10 flex items-center justify-center mb-2" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(74,222,128,0.3)' }}>
                        <span className="text-[18px]">🧑</span>
                      </div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-green-400/60 mb-0.5">Vous</p>
                      <p className="text-[13px] font-black text-white">Challenger</p>
                    </div>
                    <div className="flex flex-col items-center justify-center px-6 py-5 border-y border-white/5" style={{ background: 'rgba(10,12,20,0.8)' }}>
                      <p className="text-[26px] font-black text-white leading-none" style={{ textShadow: '0 0 30px rgba(255,255,255,0.15)' }}>VS</p>
                    </div>
                    <div className="flex-1 flex flex-col items-center py-5 px-4 border border-red-400/20" style={{ background: 'rgba(239,68,68,0.08)' }}>
                      <div className="w-10 h-10 flex items-center justify-center mb-2 text-[18px]" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(248,113,113,0.3)' }}>
                        {dp2?.flag ?? '🌍'}
                      </div>
                      <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'rgba(248,113,113,0.65)' }}>{dp2?.country}</p>
                      <p className="text-[13px] font-black text-white">{dp2?.shortName}</p>
                    </div>
                  </div>

                  {/* Suggestions */}
                  <div className="w-full space-y-3" style={{ maxWidth: '560px' }}>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/25 text-center mb-4">
                      Lancez le débat
                    </p>
                    {debateSuggestions.map((s, i) => {
                      const SIcon = s.icon;
                      return (
                        <motion.button
                          key={i}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.08 }}
                          onClick={() => send(s.text)}
                          disabled={sending}
                          className="w-full text-left px-5 py-4 border transition-all group disabled:opacity-40"
                          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(74,222,128,0.4)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,197,94,0.07)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; }}
                        >
                          <div className="flex items-start gap-3">
                            <SIcon className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" style={{ color: 'rgba(74,222,128,0.8)' }} />
                            <p className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">
                              {s.text}
                            </p>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })() : (
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
            )
          ) : (
            <>
            <div className="max-w-3xl mx-auto space-y-5">
              {activeConv.messages.map((msg, msgIdx) => {
                const isInterview = !!activeConv.interviewType;
                const isDebate = !isInterview && !!activeConv.debatePersonaId;

                // ── Diviseur de reset mémoire
                const showMemoryDivider = activeConv.memoryResetAt &&
                  msgIdx > 0 &&
                  msg.role !== 'command' &&
                  new Date(activeConv.messages[msgIdx - 1].timestamp).toISOString() <= activeConv.memoryResetAt &&
                  new Date(msg.timestamp).toISOString() > activeConv.memoryResetAt;
                const dp = isDebate ? getDP(activeConv) : null;
                const ic = isInterview ? INTERVIEW_TYPES[activeConv.interviewType!] : null;
                const isUser = msg.role === 'user';

                // ── Command notification pill
                if (msg.role === 'command') {
                  return (
                    <React.Fragment key={msg.id}>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex justify-center"
                      >
                        <div className={cx(
                          'flex items-center gap-2 px-3 py-1.5 border text-[9px] font-black uppercase tracking-widest',
                          (isInterview || isDebate)
                            ? 'border-white/15 text-white/40 bg-white/5'
                            : 'border-[#5D7BFF]/20 text-[#5D7BFF]/70 bg-[#5D7BFF]/5'
                        )}>
                          <Slash className="w-2.5 h-2.5" />
                          {msg.content}
                        </div>
                      </motion.div>
                    </React.Fragment>
                  );
                }

                // ── Styles selon mode
                const bubbleBg = (isInterview || isDebate) ? 'border-2'
                  : isUser
                    ? 'bg-white border-[#5D7BFF]/25'
                    : 'bg-[#5D7BFF] border-[#5D7BFF] text-white';

                const bubbleStyle = isInterview
                  ? isUser
                    ? { background: `${ic!.accentColor}12`, borderColor: `${ic!.accentColor}35`, boxShadow: `0 0 20px ${ic!.accentColor}08` }
                    : { background: 'rgba(255,255,255,0.04)', borderColor: `${ic!.accentColor}25`, borderLeftWidth: '3px', borderLeftColor: ic!.accentColor, boxShadow: `0 0 20px ${ic!.accentColor}10` }
                  : isDebate
                    ? isUser
                      ? { background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(74,222,128,0.25)', boxShadow: '0 0 20px rgba(34,197,94,0.08)' }
                      : { background: 'rgba(20,12,12,0.8)', borderColor: `${dp?.color ?? '#EF4444'}40`, borderLeftWidth: '3px', borderLeftColor: dp?.color ?? '#EF4444', boxShadow: `0 0 20px ${dp?.color ?? '#EF4444'}15` }
                    : isUser
                      ? { boxShadow: '4px 4px 0px 0px rgba(93,123,255,0.15)' }
                      : { boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.12)' };

                return (
                <React.Fragment key={msg.id}>
                  {showMemoryDivider && (
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex-1 border-t border-dashed border-current opacity-20" />
                      <p className={cx(
                        'text-[8px] font-black uppercase tracking-widest flex items-center gap-1',
                        (isInterview || isDebate) ? 'text-white/30' : 'text-[#141414]/30'
                      )}>
                        <RotateCcw className="w-2.5 h-2.5" />
                        Mémoire effacée
                      </p>
                      <div className="flex-1 border-t border-dashed border-current opacity-20" />
                    </div>
                  )}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cx('flex', isUser ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cx('max-w-[78%] border-2', bubbleBg)}
                    style={bubbleStyle}
                  >
                    <div
                      className={cx(
                        'px-3 py-1 border-b flex items-center justify-between gap-4',
                        (isInterview || isDebate) ? 'border-white/5'
                          : isUser ? 'border-[#5D7BFF]/10' : 'border-white/20'
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {!isUser && isInterview && ic && (() => {
                          const IIcon = ic.icon;
                          return <IIcon className="w-2.5 h-2.5" style={{ color: `${ic.accentColor}90` }} />;
                        })()}
                        {!isUser && !isInterview && !isDebate && (() => {
                          const MsgIcon = PERSONAS[msg.persona ?? persona].icon;
                          return <MsgIcon className="w-2.5 h-2.5 text-white/50" />;
                        })()}
                        {!isUser && !isInterview && isDebate && dp && (
                          <span className="text-[10px]">{dp.flag}</span>
                        )}
                        <p className={cx(
                          'text-[7px] font-black uppercase tracking-widest',
                          (isInterview || isDebate)
                            ? isUser ? 'text-white/30' : 'text-white/50'
                            : isUser ? 'text-[#141414]/30' : 'text-white/60'
                        )}>
                          {isUser ? 'Vous'
                            : isInterview && ic ? ic.interviewerRole
                            : isDebate && dp ? dp.shortName
                            : PERSONAS[msg.persona ?? persona].shortName}
                        </p>
                        {!isUser && !isInterview && !isDebate && msg.level && (
                          <span className="text-[6px] font-black uppercase tracking-widest text-white/25 border border-white/15 px-1 py-px">
                            {FRICTION[msg.level ?? level].label}
                          </span>
                        )}
                        {!isUser && !isInterview && isDebate && (
                          <span className="text-[6px] font-black uppercase tracking-widest border px-1 py-px"
                            style={{ color: dp?.color, borderColor: `${dp?.color}40` }}>
                            {FRICTION[msg.level ?? level].label}
                          </span>
                        )}
                      </div>
                      <p className={cx(
                        'text-[7px] font-mono',
                        (isInterview || isDebate) ? 'text-white/20' : isUser ? 'text-[#141414]/25' : 'text-white/40'
                      )}>
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

                    {/* Header streaming — fond blanc + textes rotatifs + animation */}
                    {sending && msgIdx === activeConv.messages.length - 1 && !isUser && (
                      <StreamingHeader
                        persona={msg.persona ?? persona}
                        isDebate={isDebate}
                        isInterview={isInterview}
                      />
                    )}

                    {msg.content ? (
                      <div className="px-4 py-3">
                        {msg.role === 'assistant' ? (() => {
                          const COLLAPSE_THRESHOLD = 500;
                          const isLong = msg.content.length > COLLAPSE_THRESHOLD;
                          const isCollapsed = collapsedMsgs.has(msg.id);
                          const displayed = isLong && isCollapsed ? msg.content.slice(0, 300) + '…' : msg.content;
                          return (
                            <>
                              <ReactMarkdown components={mdWhite}>{displayed}</ReactMarkdown>
                              {isLong && (
                                <button
                                  onClick={() => setCollapsedMsgs(s => {
                                    const n = new Set(s);
                                    isCollapsed ? n.delete(msg.id) : n.add(msg.id);
                                    return n;
                                  })}
                                  className="mt-2 text-[8px] font-black uppercase tracking-widest text-white/35 hover:text-white/70 border border-white/15 hover:border-white/35 px-2 py-0.5 transition-all"
                                >
                                  {isCollapsed ? '▼ Voir tout' : '▲ Condenser'}
                                </button>
                              )}
                            </>
                          );
                        })() : (
                          <p className={cx(
                            'text-sm leading-relaxed whitespace-pre-wrap',
                            (isInterview || isDebate) ? 'text-white/80' : 'text-[#141414]'
                          )}>
                            {msg.content}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
                </React.Fragment>
                );
              })}

              {/* Typing indicator — visible uniquement avant que le placeholder stream apparaisse */}
              {sending && activeConv.messages.at(-1)?.role !== 'assistant' && (() => {
                const isInterviewMode = !!activeConv?.interviewType;
                const ic2 = isInterviewMode ? INTERVIEW_TYPES[activeConv!.interviewType!] : null;
                const dp = !isInterviewMode && activeConv?.debatePersonaId ? getDP(activeConv) : null;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div
                      className={cx('border-2 px-4 py-3',
                        (ic2 || dp) ? 'border-l-4 border-t-0 border-r-0 border-b-0' : 'bg-[#5D7BFF] border-[#5D7BFF] text-white'
                      )}
                      style={ic2
                        ? { background: `${ic2.accentColor}08`, borderLeftColor: ic2.accentColor, borderTopColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'transparent' }
                        : dp
                          ? { background: '#12141f', borderLeftColor: dp.color, borderTopColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'transparent' }
                          : { boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.12)' }}
                    >
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-4 h-4 animate-spin text-white/50" />
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">
                          {ic2 ? `${ic2.interviewerRole} formule sa question…`
                            : dp ? `${dp.flag} ${dp.shortName} formule sa réponse…`
                            : `${PERSONAS[persona].shortName} analyse…`}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

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
            </>
          )}
        </div>
          );
        })()}

        {/* Input */}
        <div
          className={cx(
            'flex-shrink-0 border-t-4 px-6 py-4 transition-colors',
            (activeConv?.interviewType || activeConv?.debatePersonaId)
              ? 'bg-[#0d0f1a] border-t-2 border-t-0'
              : 'bg-white border-[#5D7BFF]'
          )}
          style={activeConv?.interviewType
            ? { borderTop: `2px solid ${INTERVIEW_TYPES[activeConv.interviewType]?.accentColor ?? '#5D7BFF'}40` }
            : activeConv?.debatePersonaId
              ? { borderTop: `2px solid ${getDP(activeConv)?.color ?? '#5D7BFF'}` }
              : undefined}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <div className="max-w-3xl mx-auto relative">

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

            {/* Toast notification slash commandes */}
            <AnimatePresence>
              {slashNotif && (
                <motion.div
                  key="slash-notif"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className={cx(
                    'mb-2 px-3 py-2 flex items-center gap-2 text-xs font-bold border-2',
                    slashNotif.ok
                      ? (activeConv?.interviewType || activeConv?.debatePersonaId)
                        ? 'bg-white/5 border-white/15 text-white/70'
                        : 'bg-[#5D7BFF]/8 border-[#5D7BFF]/25 text-[#5D7BFF]'
                      : 'bg-amber-50 border-amber-300 text-amber-700'
                  )}
                >
                  {slashNotif.ok ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                  {slashNotif.msg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Badge — profil désactivé */}
            {(activeConv?.noProfile || (!activeConv && noProfileMode)) && (
              <div className={cx(
                'flex items-center gap-1.5 mb-2 px-2 py-1 border text-[9px] font-black uppercase tracking-widest',
                (activeConv?.interviewType || activeConv?.debatePersonaId)
                  ? 'border-amber-500/30 text-amber-400/70 bg-amber-500/5'
                  : 'border-amber-400/40 text-amber-600 bg-amber-50'
              )}>
                <UserMinus className="w-3 h-3" />
                Profil personnel ignoré dans cette session
                <button
                  type="button"
                  onClick={() => handleSlashCommand('noprofil')}
                  className="ml-1 underline hover:opacity-70 transition-opacity"
                >
                  Réactiver
                </button>
              </div>
            )}

            {/* Slash command menu */}
            <AnimatePresence>
              {slashOpen && (
                <motion.div
                  key="slash-menu"
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className={cx(
                    'absolute bottom-full mb-2 left-0 right-0 border-2 overflow-hidden z-20',
                    (activeConv?.interviewType || activeConv?.debatePersonaId)
                      ? 'bg-[#0d0f1a] border-white/10'
                      : 'bg-white border-[#5D7BFF]/25'
                  )}
                  style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.12)' }}
                >
                  <p className={cx(
                    'text-[8px] font-black uppercase tracking-widest px-3 pt-2.5 pb-1',
                    (activeConv?.interviewType || activeConv?.debatePersonaId) ? 'text-white/25' : 'text-[#141414]/25'
                  )}>
                    Commandes <span className="font-mono">↑↓ naviguer · ↵ exécuter · Esc annuler</span>
                  </p>
                  {slashMatches.map((cmd, i) => {
                    const CmdIcon = cmd.icon;
                    const isDark = !!(activeConv?.interviewType || activeConv?.debatePersonaId);
                    const isSelected = i === safeSlashIdx;
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        onMouseEnter={() => setSlashIdx(i)}
                        onClick={() => handleSlashCommand(cmd.id)}
                        className={cx(
                          'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-t',
                          isDark
                            ? isSelected
                              ? 'bg-white/8 border-white/5'
                              : 'bg-transparent border-white/5 hover:bg-white/5'
                            : isSelected
                              ? 'bg-[#5D7BFF]/8 border-[#5D7BFF]/10'
                              : 'bg-transparent border-[#141414]/5 hover:bg-[#F0F4FF]'
                        )}
                      >
                        <CmdIcon className={cx(
                          'w-4 h-4 flex-shrink-0',
                          isDark ? (isSelected ? 'text-white/80' : 'text-white/30') : (isSelected ? 'text-[#5D7BFF]' : 'text-[#141414]/30')
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className={cx(
                            'text-xs font-bold',
                            isDark ? (isSelected ? 'text-white' : 'text-white/60') : (isSelected ? 'text-[#141414]' : 'text-[#141414]/70')
                          )}>
                            {cmd.label}
                            {cmd.id === 'noprofil' && (activeConv?.noProfile || noProfileMode) && (
                              <span className="ml-2 text-[8px] font-black text-amber-500">ACTIF</span>
                            )}
                            {cmd.id === 'resumepdf' && resumeGenerating && (
                              <span className="ml-2 text-[8px] font-black text-[#5D7BFF]">EN COURS…</span>
                            )}
                          </p>
                          <p className={cx('text-[10px]', isDark ? 'text-white/25' : 'text-[#141414]/40')}>
                            {cmd.id === 'resumepdf' && resumeGenerating ? 'Génération en cours, patiente…' : cmd.desc}
                          </p>
                        </div>
                        {cmd.id === 'resumepdf' && resumeGenerating ? (
                          <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin text-[#5D7BFF]" />
                        ) : (
                        <span className={cx(
                          'flex-shrink-0 text-[9px] font-mono px-1.5 py-0.5 border',
                          isDark ? 'text-white/20 border-white/10' : 'text-[#141414]/25 border-[#141414]/10'
                        )}>
                          {cmd.shortcut}
                        </span>
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className={cx('flex gap-2', isMobile && !inputFocused ? 'items-center' : 'items-end')}>
              {/* Bouton pièce jointe */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.html,.css,.xml,.yaml,.yml,.sh,.sql"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => subscription === 'pro' ? fileInputRef.current?.click() : setUpgradeModal('files')}
                disabled={sending}
                title={subscription === 'pro' ? 'Joindre un fichier' : 'Fonctionnalité Pro'}
                className={cx(
                  'flex-shrink-0 p-3 border-2 disabled:opacity-40 transition-all relative',
                  isMobile && inputFocused ? 'hidden' : 'flex',
                  isMobile ? 'rounded-xl' : '',
                  subscription === 'pro'
                    ? 'border-[#5D7BFF]/20 text-[#141414]/40 hover:border-[#5D7BFF] hover:text-[#5D7BFF]'
                    : 'border-[#141414]/10 text-[#141414]/25 hover:border-[#5D7BFF]/40 hover:text-[#5D7BFF]/60'
                )}
              >
                <Paperclip className="w-5 h-5" />
                {subscription === 'free' && (
                  <span className="absolute -top-1 -right-1 bg-[#5D7BFF] text-white text-[6px] font-black px-1 py-px">PRO</span>
                )}
              </button>

              {/* Bouton vocal */}
              <button
                type="button"
                onClick={openVoice}
                disabled={sending}
                title="Discussion orale"
                className={cx(
                  'flex-shrink-0 p-3 border-2 border-[#5D7BFF]/20 text-[#5D7BFF]/50 hover:border-[#5D7BFF] hover:text-[#5D7BFF] disabled:opacity-40 transition-all',
                  isMobile && inputFocused ? 'hidden' : 'flex',
                  isMobile ? 'rounded-xl' : ''
                )}
              >
                <Mic className="w-5 h-5" />
              </button>

              {/* Bouton slash commandes — desktop only */}
              {!isMobile && (
                <button
                  type="button"
                  onClick={() => { if (input === '') setInput('/'); else setInput(''); taRef.current?.focus(); }}
                  disabled={sending}
                  title="Commandes slash"
                  className={cx(
                    'flex-shrink-0 p-3 border-2 disabled:opacity-40 transition-all font-black text-sm flex',
                    slashOpen
                      ? 'border-[#5D7BFF] text-[#5D7BFF] bg-[#5D7BFF]/8'
                      : (activeConv?.interviewType || activeConv?.debatePersonaId)
                        ? 'border-white/10 text-white/30 hover:border-white/30 hover:text-white/60'
                        : 'border-[#5D7BFF]/20 text-[#141414]/30 hover:border-[#5D7BFF] hover:text-[#5D7BFF]'
                  )}
                >
                  <Slash className="w-5 h-5" />
                </button>
              )}

              {/* Textarea */}
              <div className="flex-1 relative">
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={(e) => {
                    let val = e.target.value;
                    // ── Raccourcis @persona
                    const pShorts: [string, Persona][] = [['@arch','architect'],['@fact','factchecker'],['@opp','opponent']];
                    for (const [cmd, p] of pShorts) {
                      if (val.includes(cmd)) {
                        setPersona(p); val = val.replace(cmd, '').trimStart();
                        showSlashNotif(`Persona → ${PERSONAS[p].shortName}`, true);
                      }
                    }
                    // ── Raccourcis !niveau
                    const fShorts: [string, FrictionLevel][] = [['!doux','doux'],['!moyen','moyen'],['!extreme','extreme']];
                    for (const [cmd, f] of fShorts) {
                      if (val.includes(cmd)) {
                        setLevel(f); val = val.replace(cmd, '').trimStart();
                        showSlashNotif(`Niveau → ${FRICTION[f].label}`, true);
                      }
                    }
                    setInput(val);
                  }}
                  onKeyDown={handleKey}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder={
                    pendingAttachments.length > 0 ? (isMobile ? 'Message…' : 'Ajoutez un message (optionnel)…')
                    : activeConv?.interviewType
                      ? 'Répondre…'
                      : activeConv?.debatePersonaId
                        ? (isMobile ? 'Répondre…' : `Défendez votre position face à ${getDP(activeConv)?.shortName ?? 'l\'adversaire'}…`)
                        : (isMobile ? 'Écrire…' : `Soumettez une thèse… (@arch @fact @opp · !doux !moyen !extreme)`)
                  }
                  rows={isMobile && inputFocused ? 4 : 1}
                  disabled={sending}
                  className={cx(
                    'w-full border-2 px-4 text-[16px] md:text-sm font-medium focus:outline-none resize-none transition-all leading-normal',
                    isMobile && !inputFocused ? 'py-2.5 rounded-xl' : 'py-3',
                    isMobile && inputFocused ? 'rounded-xl' : '',
                    (activeConv?.interviewType || activeConv?.debatePersonaId)
                      ? 'bg-[#1a1d2e] border-white/10 focus:border-white/25 text-white placeholder:text-white/25'
                      : 'bg-[#F0F4FF] border-[#5D7BFF]/20 focus:border-[#5D7BFF] text-[#141414] placeholder:text-[#141414]/30'
                  )}
                />
                {subscription === 'free' && FIREBASE_ENABLED && (() => {
                  const today = todayStr();
                  const used = dailyUsage.date === today ? dailyUsage.count : 0;
                  const remaining = FREE_DAILY_LIMIT - used;
                  if (remaining > 5) return null;
                  return (
                    <p className={cx(
                      'absolute bottom-2 right-3 text-[7px] font-black uppercase tracking-wider pointer-events-none select-none hidden sm:block',
                      remaining <= 2 ? 'text-red-400/70' : 'text-orange-400/60'
                    )}>
                      {remaining > 0 ? `${remaining} msg restant${remaining > 1 ? 's' : ''}` : 'Limite atteinte'}
                    </p>
                  );
                })()}
                {subscription === 'pro' && (
                  <p className="absolute bottom-2 right-3 text-[7px] font-mono text-[#141414]/15 pointer-events-none select-none hidden sm:block">
                    ↵ envoyer &middot; Shift+↵ saut
                  </p>
                )}
              </div>

              {/* Envoyer */}
              <button
                type="submit"
                disabled={sending || (!input.trim() && pendingAttachments.length === 0)}
                className={cx(
                  'flex-shrink-0 bg-[#5D7BFF] text-white px-5 py-3 hover:bg-[#4a68e8] disabled:opacity-40 transition-all active:translate-x-0.5 active:translate-y-0.5',
                  isMobile ? 'rounded-xl' : ''
                )}
                style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.2)' }}
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Bottom Navigation (mobile only) ─────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 md:hidden flex bg-[#141414] border-t-2 border-[#5D7BFF]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {([
          { icon: MessageSquare, label: 'Chat', action: () => { setCurrentPage('chat'); setSidebarOpen(false); }, active: currentPage === 'chat' },
          { icon: Library, label: 'Entraîner', action: () => { setCurrentPage('library'); setSidebarOpen(false); }, active: currentPage === 'library' },
          { icon: Settings, label: 'Profil', action: () => { setCurrentPage('settings'); setSidebarOpen(false); }, active: currentPage === 'settings' },
          { icon: Plus, label: 'Nouveau', action: () => { startNewConv(); setSidebarOpen(false); }, active: false },
          { icon: Menu, label: 'Sessions', action: () => setSidebarOpen((v) => !v), active: sidebarOpen },
        ] as { icon: React.ElementType; label: string; action: () => void; active: boolean }[]).map(({ icon: Icon, label, action, active }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            className={cx(
              'flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors',
              active ? 'text-[#5D7BFF]' : 'text-white/30 hover:text-white/60'
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[7px] font-black uppercase tracking-widest">{label}</span>
          </button>
        ))}
      </nav>

      </>)}
      {/* ── Interface vocale plein écran ────────────────────────────────── */}
      <AnimatePresence>
        {voiceOpen && (
          <motion.div
            key="voice-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0d0d0f] flex flex-col"
          >
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-white/5">
              <div className="flex items-center gap-3">
                {(() => { const Icon = PERSONAS[persona].icon; return <Icon className="w-4 h-4 text-[#5D7BFF]" />; })()}
                <span className="text-[11px] font-black uppercase tracking-widest text-white/40">
                  {PERSONAS[persona].shortName} · Mode vocal
                </span>
              </div>
              <button onClick={closeVoice} className="text-white/25 hover:text-white/70 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Zone centrale */}
            <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 overflow-y-auto py-8">

              {/* Cercle animé */}
              <div className="relative flex items-center justify-center w-40 h-40 flex-shrink-0">
                {voiceListening && (
                  <>
                    <motion.div
                      className="absolute w-40 h-40 rounded-full bg-[#5D7BFF]/20"
                      animate={{ scale: [1, 1.55, 1], opacity: [0.7, 0, 0.7] }}
                      transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    />
                    <motion.div
                      className="absolute w-40 h-40 rounded-full bg-[#5D7BFF]/10"
                      animate={{ scale: [1, 2.1, 1], opacity: [0.4, 0, 0.4] }}
                      transition={{ repeat: Infinity, duration: 1.8, delay: 0.35, ease: 'easeInOut' }}
                    />
                  </>
                )}
                {voiceSpeaking && (
                  <motion.div
                    className="absolute w-40 h-40 rounded-full bg-white/5"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 0.75, ease: 'easeInOut' }}
                  />
                )}
                <div className={cx(
                  'w-32 h-32 rounded-full flex items-center justify-center transition-colors duration-300',
                  voiceListening ? 'bg-[#5D7BFF]' : voiceSpeaking ? 'bg-white/10' : 'bg-white/5'
                )}>
                  {voiceSpeaking
                    ? <Volume2 className="w-12 h-12 text-white/60" />
                    : <Mic className={cx('w-12 h-12 transition-colors', voiceListening ? 'text-white' : 'text-white/25')} />
                  }
                </div>
              </div>

              {/* État */}
              <p className="text-[12px] font-black uppercase tracking-widest text-white/30">
                {voiceListening ? 'En écoute…' : voiceSpeaking ? 'En train de répondre…' : sending ? 'Traitement…' : 'Prêt'}
              </p>

              {/* Transcript live */}
              <div className="min-h-[2.5rem] text-center max-w-lg">
                <AnimatePresence mode="wait">
                  {voiceTranscript && (
                    <motion.p
                      key="transcript"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-white/80 text-base font-medium leading-relaxed"
                    >
                      {voiceTranscript}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Dernière réponse IA */}
              {(() => {
                const last = [...(activeConv?.messages ?? [])].reverse().find(m => m.role === 'assistant');
                if (!last) return null;
                return (
                  <div className="w-full max-w-lg bg-white/[0.04] border border-white/10 p-5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-3 flex items-center gap-2">
                      {(() => { const Icon = PERSONAS[persona].icon; return <Icon className="w-3 h-3 text-[#5D7BFF]" />; })()}
                      {PERSONAS[persona].shortName}
                    </p>
                    <p className="text-white/55 text-sm leading-relaxed line-clamp-6">
                      {last.content.replace(/\*\*(.*?)\*\*/g, '$1').replace(/#{1,6}\s/g, '').replace(/`{1,3}[\s\S]*?`{1,3}/g, '[code]')}
                    </p>
                  </div>
                );
              })()}

              {/* Boutons action */}
              <div className="flex items-center gap-3">
                {!voiceListening && !voiceSpeaking && !sending && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={startListening}
                    className="flex items-center gap-2 px-6 py-3.5 bg-[#5D7BFF] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#4a68e8] transition-colors"
                    style={{ boxShadow: '4px 4px 0px 0px rgba(93,123,255,0.25)' }}
                  >
                    <Mic className="w-4 h-4" />
                    Parler
                  </motion.button>
                )}
                {voiceListening && (
                  <button
                    onClick={stopListening}
                    className="flex items-center gap-2 px-5 py-3 border-2 border-white/20 text-white/50 hover:border-white/40 hover:text-white/80 text-[11px] font-black uppercase tracking-widest transition-colors"
                  >
                    <MicOff className="w-4 h-4" />
                    Arrêter
                  </button>
                )}
                {voiceSpeaking && (
                  <button
                    onClick={() => { window.speechSynthesis?.cancel(); setVoiceSpeaking(false); }}
                    className="flex items-center gap-2 px-5 py-3 border-2 border-white/20 text-white/50 hover:border-white/40 hover:text-white/80 text-[11px] font-black uppercase tracking-widest transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Couper
                  </button>
                )}
              </div>
            </div>

            {/* Controls : persona + friction */}
            <div className="flex-shrink-0 border-t border-white/5 px-6 pt-4 pb-5 space-y-3">
              {/* Persona */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Persona</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(Object.values(PERSONAS) as (typeof PERSONAS[keyof typeof PERSONAS])[]).map((p) => {
                    const Icon = p.icon;
                    const active = persona === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (p.id !== persona && activeId) addCommandMsg(`— Persona changée : ${p.name} —`);
                          setPersona(p.id);
                        }}
                        className={cx(
                          'flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-black uppercase tracking-wider transition-all',
                          active
                            ? 'bg-[#5D7BFF] border-[#5D7BFF] text-white'
                            : 'border-white/10 text-white/30 hover:border-white/30 hover:text-white/60'
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {p.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Friction */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Friction</p>
                <div className="flex gap-1.5">
                  {(Object.entries(FRICTION) as [FrictionLevel, typeof FRICTION[FrictionLevel]][]).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setLevel(key)}
                      className={cx(
                        'flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider border transition-all',
                        level === key
                          ? 'bg-[#5D7BFF] border-[#5D7BFF] text-white'
                          : 'border-white/10 text-white/30 hover:border-white/30 hover:text-white/60'
                      )}
                    >
                      {val.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[9px] text-white/10 font-black uppercase tracking-widest text-center pt-1">
                Discussion retranscrite dans le chat · Fermer pour relire
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal consentement CGU (première connexion) ──────────────────── */}
      <AnimatePresence>
        {consentPending && (
          <motion.div
            key="consent-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(10,10,10,0.82)' }}
          >
            <motion.div
              key="consent-card"
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="bg-[#141414] border-4 border-[#5D7BFF] w-full max-w-md"
              style={{ boxShadow: '8px 8px 0px 0px rgba(93,123,255,0.3)' }}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b-2 border-white/10">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-9 h-9 bg-[#5D7BFF] flex items-center justify-center flex-shrink-0"
                    style={{ boxShadow: '3px 3px 0px 0px rgba(255,255,255,0.08)' }}
                  >
                    <img
                      src="https://i.postimg.cc/L4WsWhk9/Design-sans-titre-(12).png"
                      alt="Challenger IA"
                      className="h-6 w-auto object-contain"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-white">
                      Bienvenue sur Challenger IA
                    </p>
                    <p className="text-[8px] text-white/35 uppercase tracking-widest mt-0.5">
                      Avant de continuer
                    </p>
                  </div>
                </div>

                {/* Compte Google */}
                <div className="flex items-center gap-3 px-3 py-2.5 bg-white/5 border border-white/10">
                  {consentPending.photoURL ? (
                    <img src={consentPending.photoURL} alt="" className="w-8 h-8 rounded-full border-2 border-[#5D7BFF]/40 flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 bg-[#5D7BFF]/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-[#5D7BFF]" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-white truncate">
                      {consentPending.displayName ?? consentPending.email}
                    </p>
                    <p className="text-[8px] text-white/35 truncate">{consentPending.email}</p>
                  </div>
                </div>
              </div>

              {/* Corps — cases à cocher */}
              <div className="px-6 py-5 space-y-3">

                {/* CGU — obligatoire */}
                <label className={cx(
                  'flex items-start gap-3 px-4 py-3.5 border-2 cursor-pointer transition-all group',
                  consentCgu
                    ? 'border-[#5D7BFF] bg-[#5D7BFF]/10'
                    : 'border-white/15 hover:border-white/30'
                )}>
                  {/* Checkbox custom */}
                  <div className={cx(
                    'w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all',
                    consentCgu ? 'bg-[#5D7BFF] border-[#5D7BFF]' : 'bg-transparent border-white/30'
                  )}>
                    {consentCgu && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={consentCgu}
                    onChange={(e) => setConsentCgu(e.target.checked)}
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-white leading-snug">
                      J'accepte les conditions générales d'utilisation{' '}
                      <span className="text-red-400">*</span>
                    </p>
                    <p className="text-[8px] text-white/35 mt-1 leading-relaxed">
                      En continuant, vous acceptez nos{' '}
                      <a
                        href="https://challengeria.fr/cgu"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[#5D7BFF] underline hover:text-white transition-colors"
                      >
                        conditions générales d'utilisation
                      </a>{' '}
                      et notre politique de confidentialité.
                    </p>
                  </div>
                </label>

                {/* Newsletter — optionnel, pré-coché */}
                <label className={cx(
                  'flex items-start gap-3 px-4 py-3.5 border-2 cursor-pointer transition-all group',
                  consentNewsletter
                    ? 'border-[#5D7BFF] bg-[#5D7BFF]/10'
                    : 'border-white/15 hover:border-white/30'
                )}>
                  <div className={cx(
                    'w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all',
                    consentNewsletter ? 'bg-[#5D7BFF] border-[#5D7BFF]' : 'bg-transparent border-white/30'
                  )}>
                    {consentNewsletter && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={consentNewsletter}
                    onChange={(e) => setConsentNewsletter(e.target.checked)}
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-white leading-snug">
                      Je m'inscris à la newsletter Challenger IA
                    </p>
                    <p className="text-[8px] text-white/35 mt-1 leading-relaxed">
                      Nouveautés, mises à jour et contenus exclusifs. Désinscription possible à tout moment.
                    </p>
                  </div>
                </label>

                <p className="text-[7px] text-white/20 uppercase tracking-widest text-center pt-1">
                  <span className="text-red-400">*</span> Champ obligatoire
                </p>
              </div>

              {/* Footer — actions */}
              <div className="px-6 pb-6 space-y-2">
                <button
                  onClick={handleConsentAccept}
                  disabled={!consentCgu || consentLoading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#5D7BFF] text-white text-[10px] font-black uppercase tracking-widest transition-all hover:bg-[#4a68e8] disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ boxShadow: consentCgu ? '4px 4px 0px 0px rgba(255,255,255,0.08)' : 'none' }}
                >
                  {consentLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
                    : <><Check className="w-4 h-4" /> Continuer</>
                  }
                </button>
                <button
                  onClick={handleConsentDecline}
                  disabled={consentLoading}
                  className="w-full py-2.5 text-[8px] font-black uppercase tracking-widest text-white/25 hover:text-white/50 transition-colors disabled:opacity-40"
                >
                  Annuler et se déconnecter
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal Upgrade Pro ───────────────────────────────────────────── */}
      <AnimatePresence>
        {upgradeModal && (
          <motion.div
            key="upgrade-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(10,10,10,0.78)' }}
            onClick={() => setUpgradeModal(null)}
          >
            <motion.div
              key="upgrade-card"
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="bg-[#141414] border-4 border-[#5D7BFF] w-full max-w-sm"
              style={{ boxShadow: '8px 8px 0px 0px rgba(93,123,255,0.25)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b-2 border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#5D7BFF] flex items-center justify-center">
                      <Crown className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-white">
                        Challenger Pro
                      </p>
                      <p className="text-[8px] text-white/35 mt-0.5">
                        {upgradeModal === 'limit' && `Limite de ${FREE_DAILY_LIMIT} messages/jour atteinte`}
                        {upgradeModal === 'files' && 'Les pièces jointes sont réservées au plan Pro'}
                        {upgradeModal === 'projects' && 'Les projets sont réservés au plan Pro'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setUpgradeModal(null)} className="text-white/30 hover:text-white/60 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Features */}
              <div className="px-6 py-5 space-y-2.5">
                {[
                  { icon: InfinityIcon, label: 'Messages illimités' },
                  { icon: Paperclip, label: 'Pièces jointes (PDF, images, DOCX…)' },
                  { icon: Folder, label: 'Projets & dossiers' },
                  { icon: Cloud, label: 'Conversations illimitées sauvegardées' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-[#5D7BFF]/15 border border-[#5D7BFF]/30 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-2.5 h-2.5 text-[#5D7BFF]" />
                    </div>
                    <p className="text-[10px] text-white/70">{label}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="px-6 pb-6 space-y-2">
                <button
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#5D7BFF] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#4a68e8] transition-all"
                  style={{ boxShadow: '4px 4px 0px 0px rgba(255,255,255,0.08)' }}
                  onClick={() => {
                    const link = import.meta.env.VITE_STRIPE_PAYMENT_LINK;
                    if (link) window.open(`${link}?client_reference_id=${user?.uid ?? ''}`, '_blank');
                    setUpgradeModal(null);
                  }}
                >
                  <Crown className="w-4 h-4" />
                  Essai gratuit 7 jours — 9,99€ / mois
                </button>
                <p className="text-center text-[9px] text-white/25">
                  7 jours gratuits · Aucune carte débitée avant la fin · Annulable à tout moment
                </p>
                <button
                  onClick={() => setUpgradeModal(null)}
                  className="w-full py-2 text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-white/50 transition-colors"
                >
                  Continuer en version gratuite
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal suppression projet ─────────────────────────────────────── */}
      <AnimatePresence>
        {deleteProjectModal && (
          <motion.div
            key="delete-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(10,10,10,0.75)' }}
            onClick={() => setDeleteProjectModal(null)}
          >
            <motion.div
              key="delete-modal-card"
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="bg-[#141414] border-4 border-red-500 w-full max-w-md"
              style={{ boxShadow: '8px 8px 0px 0px rgba(239,68,68,0.35)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b-2 border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-red-500 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-white">
                    Supprimer le projet
                  </p>
                </div>
                <button
                  onClick={() => setDeleteProjectModal(null)}
                  className="text-white/30 hover:text-white/70 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                {/* Nom du projet */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10">
                  <Folder className="w-3.5 h-3.5 text-[#5D7BFF] flex-shrink-0" />
                  <p className="text-sm font-black text-white truncate">
                    {deleteProjectModal.projectName}
                  </p>
                  {deleteProjectModal.convCount > 0 && (
                    <span className="ml-auto text-[8px] font-black text-white/35 uppercase tracking-wider flex-shrink-0">
                      {deleteProjectModal.convCount} session{deleteProjectModal.convCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Avertissement définitif */}
                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-red-500/10 border border-red-500/30">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] font-bold text-red-400 leading-relaxed uppercase tracking-wide">
                    Cette action est définitive et irréversible.
                  </p>
                </div>

                {/* Choix */}
                <div className="space-y-2 pt-1">
                  {/* Option 1 — projet uniquement */}
                  <button
                    onClick={() => deleteProjectOnly(deleteProjectModal.projectId)}
                    className="w-full text-left px-4 py-3.5 border-2 border-white/15 hover:border-[#5D7BFF] hover:bg-[#5D7BFF]/10 transition-all group"
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-white group-hover:text-[#5D7BFF] transition-colors">
                      Supprimer le projet uniquement
                    </p>
                    <p className="text-[8px] text-white/35 mt-1 leading-relaxed group-hover:text-white/50 transition-colors">
                      Les sessions restent accessibles — elles redeviennent libres sans projet.
                    </p>
                  </button>

                  {/* Option 2 — projet + sessions */}
                  <button
                    onClick={() => deleteProjectAndContent(deleteProjectModal.projectId)}
                    className="w-full text-left px-4 py-3.5 border-2 border-red-500/30 hover:border-red-500 hover:bg-red-500/10 transition-all group"
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-red-400 group-hover:text-red-300 transition-colors">
                      Supprimer le projet et son contenu
                    </p>
                    <p className="text-[8px] text-white/35 mt-1 leading-relaxed group-hover:text-white/50 transition-colors">
                      {deleteProjectModal.convCount > 0
                        ? `Le projet et ses ${deleteProjectModal.convCount} session${deleteProjectModal.convCount > 1 ? 's' : ''} seront supprimés définitivement.`
                        : 'Le projet sera supprimé définitivement.'}
                    </p>
                  </button>
                </div>
              </div>

              {/* Footer — annuler */}
              <div className="px-6 py-4 border-t-2 border-white/10">
                <button
                  onClick={() => setDeleteProjectModal(null)}
                  className="w-full py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 border border-white/10 hover:border-white/25 transition-all"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
