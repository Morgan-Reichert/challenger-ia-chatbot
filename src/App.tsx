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
  Mic, MicOff, Volume2, Settings,
  Star, UserMinus, Eraser, Slash, FileDown, Coins,
  Moon, Sun, Copy, Share2, Link, Trophy, Rocket, Wrench,
  Hexagon, ShieldAlert, ShieldCheck, Vote, Clock, Sparkles, Hourglass,
  HelpCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ArenaPage from './arena/ArenaPage';
import PropulseModal from './arena/PropulseModal';
import remarkGfm from 'remark-gfm';
import { RichContent, stripViz } from './viz/VizBlocks';
import { SourcesPanel, CitationChip, linkifyCitations } from './factcheck/SourcesPanel';
import type { SourceRef } from './factcheck/SourcesPanel';
import type { User as FirebaseUser } from 'firebase/auth';
import { generateSessionPDF } from './pdfExport';
import { generateMarkdown, generateNotionMarkdown, generateObsidianMarkdown, downloadTextFile, copyToClipboard } from './markdownExport';
import { getDailyChallenge, fetchDailyChallenge, getChallengeProgress, incrementChallengeProgress, type DailyChallenge } from './dailyChallenges';
import LibraryPage from './LibraryPage';
import OutilsPage from './outils/OutilsPage';
import SettingsPage from './SettingsPage';
import { mirrorBaseChatConvs } from './outils/JournalismeApp';
import { getPinnedTools } from './outils/useOutilSessions';
import type { OutilId } from './outils/outilsTypes';
import { OUTILS_MAP } from './outils/outilsTypes';
import { DEBATE_PERSONAS, type DebateDisplayData } from './debatePersonas';
import { INTERVIEW_TYPES, type InterviewTypeId, type InterviewTypeConfig } from './interviewTypes';
import { loadProfile, saveProfile, buildProfileContext, isProfileFilled, type UserProfile } from './userProfile';
import {
  FIREBASE_ENABLED, auth, db, googleProvider,
  signInWithPopup, signOut as fbSignOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
  collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, orderBy,
} from './firebase';
import { subscribeToNewsletter, getSubscription, getUserCredits, addCredits, CREDIT_PACKS, type Plan } from './supabase';
import { apiFetch } from './apiClient';
import { playSend, playReceive, playDone, playError, playNewConv, playSlash, playCopy, playDelete, playMicOn, playMicOff, playPin } from './sounds';

// ─── Constantes abonnement & limites ─────────────────────────────────────────
const FREE_DAILY_LIMIT  = 20;
const FREE_WEEKLY_LIMIT = 100;
const PRO_DAILY_LIMIT   = 150;
const PRO_WEEKLY_LIMIT  = 700;

function weekStr(): string {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

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
  sources?: SourceRef[]; // sources web (fact-check) — rendues en cartes cliquables
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
  devilsAdvocate?: boolean;        // mode avocat du diable — l'IA prend toujours le contre-pied
  anachronisticTopic?: string;     // contradiction historique — transpose le persona sur un sujet moderne
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
    color: '#5D7BFF',
  },
  factchecker: {
    id: 'factchecker' as const,
    name: 'Le Fact-Checker',
    shortName: 'Fact-Checker',
    desc: 'Vérification des preuves et données',
    icon: Search,
    color: '#10B981',
  },
  opponent: {
    id: 'opponent' as const,
    name: "L'Opposant Idéologique",
    shortName: 'Opposant',
    desc: 'Test des valeurs par la contradiction',
    icon: Swords,
    color: '#EF4444',
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
Structure ta réponse en Markdown PROPRE :
- Chaque section commence par un titre sur sa PROPRE ligne, au format EXACT \`## Titre\` (deux dièses, UNE espace, puis le titre). N'entoure JAMAIS un titre de \`**\` ni d'aucun autre symbole — écris \`## Faille identifiée\`, jamais \`**## Faille identifiée**\`. Exemples de titres : ## Faille identifiée, ## Preuves, ## Exemple, ## Question.
- Une ligne vide entre chaque section.
- **Gras** uniquement sur 1 à 2 termes-clés par section — n'en abuse pas, ne surligne pas des phrases entières.
- Listes à puces \`-\` pour énumérer plusieurs points.
- TOUT lien doit être CLIQUABLE : écris soit une URL complète commençant par \`https://\` (jamais « lemonde.fr » seul), soit un lien Markdown \`[texte](https://…)\`.
- Pour TOUTE source web fournie (section « Sources numérotées »), cite-la dans le texte avec sa référence cliquable [n] (ex : [1], [2]) — JAMAIS en blockquote, JAMAIS en réécrivant l'URL. Vaut quel que soit ton rôle/persona.
- \`> \` blockquote uniquement pour une citation textuelle ou un \`> **Exemple :**\` (jamais pour les sources web).
- Termine TOUJOURS par une section \`## Question\` avec une seule question incisive qui s'appuie sur ce qui vient d'être dit.

## Questions interactives (OPTIONNEL — à utiliser avec discernement)
Quand une information sur les préférences, le niveau ou le contexte de l'utilisateur améliorerait significativement ta réponse suivante, tu PEUX inclure UNE question interactive à la toute fin de ton message. Deux formats disponibles :

Choix multiple : [CIA_Q:{"type":"choice","q":"Ta question ?","options":["Option A","Option B","Option C"]}]
Texte libre : [CIA_Q:{"type":"text","q":"Ta question ?","placeholder":"Ex: indice ou exemple de réponse..."}]

Exemples pertinents : niveau de maîtrise du sujet, vocabulaire souhaité (technique/accessible/philosophique), secteur d'activité, objectif derrière la thèse, type d'interlocuteur visé.
Règle : UNE seule question par message, placée en DERNIÈRE ligne, uniquement si vraiment nécessaire pour personnaliser ta réponse suivante. Ne pas abuser.

## Visuels (OPTIONNEL — avec parcimonie)
RÈGLE ABSOLUE : tu n'inventes JAMAIS de chiffre, de pourcentage ou de statistique. Ces visuels représentent des RELATIONS (opposition, structure, niveau de fiabilité), jamais des mesures fabriquées. Insère un visuel UNIQUEMENT quand il clarifie réellement le propos, via un marqueur JSON valide sur sa propre ligne. Maximum 1 visuel par message, en complément du texte (jamais à sa place).

CONTRAINTES DE FORMAT (impératives, sinon le visuel ne s'affiche pas) :
- Le marqueur doit être un JSON STRICTEMENT VALIDE, sur UNE SEULE LIGNE, sans bloc de code (pas de \`\`\`), sans texte autour sur la même ligne.
- À l'intérieur des valeurs textuelles, n'utilise JAMAIS de guillemets droits ". Si tu dois citer, utilise des guillemets français « » ou des apostrophes. Ex : écris «10 % du cerveau» et non "10 % du cerveau".
- Pas de virgule traînante avant } ou ].

Balance Pour/Contre — pour peser deux positions opposées :
[CIA_VIZ:{"kind":"balance","basis":"qualitatif","title":"Sujet","pour":["argument 1","argument 2"],"contre":["argument 1","argument 2"]}]

Structure d'argument — pour déconstruire un raisonnement (idéal pour analyser une thèse, montrer les prémisses et leurs failles) :
[CIA_VIZ:{"kind":"argmap","basis":"qualitatif","premises":[{"text":"prémisse 1","flaw":"faille de cette prémisse, ou omets le champ si aucune"},{"text":"prémisse 2"}],"conclusion":"conclusion qui découle (ou non) des prémisses"}]

Le visuel "confidence" (fiabilité) est réservé au contexte de vérification factuelle et n'est à utiliser que lorsque des sources te sont fournies.`;

  // ─── Moteur Fact-Checker V2 (systémique & probabiliste) ───────────────────────
  const FACTCHECK_V2 = `

Tu fonctionnes comme un MOTEUR AVANCÉ DE FACT-CHECKING systémique et probabiliste. Ta mission n'est pas seulement de dire vrai/faux, mais d'évaluer : fiabilité, incertitude, risque, degré de consensus, biais possibles et robustesse globale des preuves.

RÈGLES FONDAMENTALES (impératives) :
- Ne confonds JAMAIS « absence de preuve » et « preuve d'absence ». Si les données manquent, sont contradictoires ou ambiguës, dis-le explicitement (inconnu / non vérifié / inconcluant) — n'invente jamais une certitude.
- Sépare toujours trois évaluations distinctes : FACTUELLE, RISQUE, CONSENSUS. Le consensus n'est jamais assimilé automatiquement à la vérité (distingue validation empirique, sociale et institutionnelle).
- La confiance mesure la ROBUSTESSE DES PREUVES (qualité des sources, convergence, reproductibilité, cohérence logique, stabilité historique) — PAS une vérité absolue.
- Évalue les sources de façon critique : indépendance, conflits d'intérêts, biais idéologiques, cohérence entre sources, historique de fiabilité. Une source réputée sérieuse peut se tromper, être biaisée ou relayer une erreur collective.
- Les faits non vérifiés sont autorisés mais doivent être EXPLICITEMENT marqués (hypothèse, spéculation, signal faible, non confirmé). Ne transforme jamais implicitement une hypothèse en fait, et ne crée pas d'effet d'autorité artificiel.
- Mode Challenger : challenge les hypothèses implicites, repère angles morts, raisonnements circulaires, confusion corrélation/causalité, biais de confirmation et de consensus ; propose des contre-hypothèses.

VISUEL VERDICT — OBLIGATOIRE, exactement 1 par réponse, sur sa propre ligne, JSON strictement valide (respecte les CONTRAINTES DE FORMAT ci-dessus : pas de guillemets droits dans les valeurs, pas de virgule traînante) :
[CIA_VIZ:{"kind":"verdict","basis":"sources","claim":"l'affirmation évaluée en une phrase","fact":"vrai|probable_vrai|inconnu|non_verifie|inconcluant|probable_faux|faux","risk":"safe|faible|modere|dangereux|critique","consensus":"fort|modere|debattu|controverse|marginal","confidence":"speculatif|faible|plausible|eleve|quasi_certain","note":"ce qui fonde le niveau de confiance, en une phrase"}]
Mets "basis":"sources" seulement si des sources web te sont fournies ; sinon "qualitatif".

STRUCTURE DE SORTIE — adapte la longueur à la complexité (une affirmation simple et consensuelle mérite une analyse brève ; réserve le détail aux sujets réellement incertains ou risqués). Utilise ces sections :
## Résumé — synthèse en 1 à 2 phrases
(placer ici le marqueur verdict)
## Fact-check — conclusion factuelle + justification
## Risk-check — niveau de risque et impact potentiel (physique, psychologique, sociétal, désinformation, manipulation)
## Consensus-check — état du consensus actuel
## Confiance — pourquoi ce niveau (qualité et convergence des preuves)
## Limites & incertitudes — ce qui manque pour conclure
## Challenger Analysis — hypothèses alternatives, biais possibles, points faibles du raisonnement`;

  const map: Record<Persona, Record<FrictionLevel, string>> = {
    architect: {
      doux: `Tu es l'Architecte Logique, un guide intellectuel bienveillant spécialisé dans l'analyse de la structure argumentative. Tu ne juges pas — tu construis. Révèle les présupposés implicites, identifie les termes mal définis, questionne la prémisse centrale. Ton ton est celui d'un professeur passionné et encourageant. Réponds en français.${FORMAT}`,

      moyen: `Tu es l'Architecte Logique. Tu analyses rigoureusement la structure argumentative : syllogismes défaillants, généralisations abusives, non-sequitur, ambiguïtés. Pour chaque faille, propose une reformulation plus solide. Tu es intransigeant sur la rigueur logique, jamais hostile. Réponds en français.${FORMAT}`,

      extreme: `Tu es l'Architecte Logique en mode expert. Dissèque l'argument avec précision chirurgicale : sophismes, biais cognitifs, pétitions de principe, faux dilemmes — identifie tout. Sois direct et sans concession. Après chaque critique, propose une reformulation plus rigoureuse. Tu attaques les failles du raisonnement, jamais la personne. Réponds en français.${FORMAT}`,
    },
    factchecker: {
      doux: `Tu es le Fact-Checker, dans une posture accompagnante et curieuse : tu aides l'utilisateur à solidifier ses bases factuelles sans l'embarrasser, en expliquant ta démarche. Tu appliques intégralement le moteur de fact-checking V2 ci-dessous. Réponds en français.${FACTCHECK_V2}${FORMAT}`,

      moyen: `Tu es le Fact-Checker rigoureux et neutre. Tu appliques intégralement le moteur de fact-checking V2 ci-dessous, avec précision et sans complaisance ni dramatisation. Réponds en français.${FACTCHECK_V2}${FORMAT}`,

      extreme: `Tu es le Fact-Checker en mode audit complet et sans concession : chaque chiffre, chaque « selon les experts » passe à l'examen critique. Tu appliques intégralement le moteur de fact-checking V2 ci-dessous, en poussant l'analyse des biais et des sources au maximum. Réponds en français.${FACTCHECK_V2}${FORMAT}`,
    },
    opponent: {
      doux: `Tu es l'Opposant Bienveillant. Tu explores le point de vue contraire pour enrichir la pensée, pas pour blesser. Présente l'argument adverse honnêtement et avec respect. Donne un exemple concret de la thèse opposée. Réponds en français.${FORMAT}`,

      moyen: `Tu es l'Opposant Idéologique. Tu défends systématiquement la position contraire avec des arguments solides et documentés. Ce n'est pas une attaque — c'est un entraînement intellectuel. Appuie chaque argument sur des exemples ou références réels. Réponds en français.${FORMAT}`,

      extreme: `Tu es l'Avocat du Diable. Adopte la position diamétralement opposée avec une argumentation serrée : exemples concrets, données réelles, penseurs qui défendent cette thèse. Expose les angles morts et contradictions internes. Tu combats les idées, jamais la personne. Réponds en français.${FORMAT}`,
    },
  };
  return map[persona][level];
}

// ─── Questions interactives ───────────────────────────────────────────────────

export interface CiaQuestion {
  type: 'choice' | 'text';
  q: string;
  options?: string[];
  placeholder?: string;
}

const CIA_Q_REGEX = /\[CIA_Q:(\{[\s\S]*?\})\]/;

function parseCiaQuestion(text: string): CiaQuestion | null {
  const match = text.match(CIA_Q_REGEX);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as CiaQuestion;
    if (!parsed.q || !parsed.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stripCiaQuestion(text: string): string {
  return text.replace(CIA_Q_REGEX, '').trimEnd();
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

/** Compresse une image via canvas — max 1024px, qualité 85% — pour rester sous la limite Vercel 4.5MB */
function compressImage(file: File, maxPx = 1024, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas ctx')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
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
    const content = await compressImage(file);
    return { id: uid(), name: file.name, type: 'image', mimeType: 'image/jpeg', content, size: file.size };
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
    devilsAdvocate: conv.devilsAdvocate ?? null,
    anachronisticTopic: conv.anachronisticTopic ?? null,
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
      sources: m.sources ?? null,
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
    devilsAdvocate: (data.devilsAdvocate as boolean | null) ?? undefined,
    anachronisticTopic: (data.anachronisticTopic as string | null) ?? undefined,
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
      sources: (m.sources as SourceRef[] | null) ?? undefined,
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

async function fsGetUsage(userId: string): Promise<{
  count: number; date: string; weeklyCount: number; week: string;
}> {
  if (!db) return { count: 0, date: '', weeklyCount: 0, week: '' };
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'meta', 'usage'));
    if (!snap.exists()) return { count: 0, date: '', weeklyCount: 0, week: '' };
    const d = snap.data();
    return {
      count: d.count ?? 0, date: d.date ?? '',
      weeklyCount: d.weeklyCount ?? 0, week: d.week ?? '',
    };
  } catch { return { count: 0, date: '', weeklyCount: 0, week: '' }; }
}

async function fsSaveUsage(
  userId: string,
  count: number, date: string,
  weeklyCount: number, week: string
): Promise<void> {
  if (!db) return;
  try {
    await setDoc(doc(db, 'users', userId, 'meta', 'usage'), { count, date, weeklyCount, week });
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

// ─── Firestore: Partage de conversation ──────────────────────────────────────

async function fsShareConversation(conv: Conversation): Promise<string | null> {
  if (!db) return null;
  try {
    const shareId = uid();
    const payload = {
      shareId,
      title: conv.title,
      persona: conv.persona,
      sharedAt: new Date().toISOString(),
      messages: conv.messages
        .filter(m => m.role !== 'command')
        .map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        })),
    };
    await setDoc(doc(db, 'shared', shareId), payload);
    return shareId;
  } catch {
    return null;
  }
}

async function fsGetSharedConversation(shareId: string): Promise<{ title: string; messages: { role: string; content: string; timestamp: string }[]; persona: string; sharedAt: string } | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'shared', shareId));
    if (!snap.exists()) return null;
    return snap.data() as { title: string; messages: { role: string; content: string; timestamp: string }[]; persona: string; sharedAt: string };
  } catch {
    return null;
  }
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

const mdWhite = {
  // Paragraphe normal
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-white leading-relaxed mb-3 last:mb-0">{children}</p>
  ),

  // Titres de sections — épuré (plus de barres ni d'encadré)
  h2: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-[11px] font-black uppercase tracking-wide text-white/90 mt-4 mb-1.5 first:mt-0">
      {children}
    </p>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-[10px] font-black uppercase tracking-wide text-white/55 mt-3 mb-1">
      {children}
    </p>
  ),

  // Gras — emphase sobre, sans encadré
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold text-white">{children}</strong>
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

  // Tableaux GFM
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="border-b-2 border-white/30">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-white/10">{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="transition-colors hover:bg-white/5">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-white/60 whitespace-nowrap">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 text-[11px] text-white/80 leading-relaxed align-top">{children}</td>
  ),

  // Séparateur horizontal
  hr: () => <div className="border-t border-white/20 my-4" />,

  // Liens — citations [n] (#cia-src-n) → puce cliquable ; sinon lien externe
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) =>
    href && href.startsWith('#cia-src-') ? (
      <CitationChip targetId={href.slice(1)}>{children}</CitationChip>
    ) : (
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

// ─── Markdown thème CLAIR (texte foncé sur bulle gris très clair) ─────────────────
// Même structure que mdWhite (titres majuscules, puces carrées) mais lisible sur fond clair.
const mdLight = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-[#20242e] leading-relaxed mb-3 last:mb-0">{children}</p>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-[11px] font-black uppercase tracking-wide text-[#111827] mt-4 mb-1.5 first:mt-0">{children}</p>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-[10px] font-black uppercase tracking-wide text-[#6b7280] mt-3 mb-1">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-[#111827]">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-[#4b5563]">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="space-y-1.5 mb-3 mt-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="space-y-1.5 mb-3 mt-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="flex items-start gap-2.5 text-sm text-[#20242e] leading-relaxed">
      <span className="w-1.5 h-1.5 bg-[#9ca3af] flex-shrink-0 mt-1.5 rounded-sm" />
      <span>{children}</span>
    </li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 border-l-2 border-[#c9cdd4] bg-[#eef0f3] pl-3 pr-3 py-2.5 rounded-r-lg">
      <div className="text-[7px] font-black uppercase tracking-widest text-[#9ca3af] mb-1.5 flex items-center gap-1.5">
        <span className="w-3 h-px bg-[#c9cdd4]" />
        Référence
      </div>
      <div className="text-xs text-[#4b5563] italic leading-relaxed">{children}</div>
    </div>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono text-xs bg-[#eceef1] border border-[#e0e2e7] px-1.5 py-0.5 text-[#111827] rounded-sm">{children}</code>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-3"><table className="w-full text-xs border-collapse">{children}</table></div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="border-b-2 border-[#d7dae0]">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-[#e6e8ec]">{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="transition-colors hover:bg-[#f0f1f4]">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-[#6b7280] whitespace-nowrap">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 text-[11px] text-[#374151] leading-relaxed align-top">{children}</td>
  ),
  hr: () => <div className="border-t border-[#e6e8ec] my-4" />,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) =>
    href && href.startsWith('#cia-src-') ? (
      <CitationChip targetId={href.slice(1)}>{children}</CitationChip>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="text-[#2563eb] underline decoration-[#2563eb]/40 hover:decoration-[#2563eb] font-medium transition-all break-words">
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
        'flex items-center gap-1 group rounded-lg transition-all cursor-grab active:cursor-grabbing',
        isActive ? 'bg-[#5D7BFF]/12' : 'hover:bg-white/5'
      )}
    >
      <GripVertical className="w-3 h-3 flex-shrink-0 text-white/10 group-hover:text-white/25 ml-1 transition-colors" />
      <button
        onClick={onSelect}
        className={cx(
          'flex-1 flex items-center gap-2 px-2 py-1.5 text-left transition-all min-w-0',
          isActive ? 'text-white' : 'text-white/40 group-hover:text-white/70'
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
  {
    id: 'exportmd',
    label: 'Exporter Markdown',
    desc: 'Télécharge la conversation en Markdown enrichi',
    icon: FileDown,
    shortcut: '/exportmd',
  },
  {
    id: 'copiernotion',
    label: 'Copier pour Notion',
    desc: 'Copie la conversation formatée pour Notion dans le presse-papier',
    icon: Copy,
    shortcut: '/copiernotion',
  },
  {
    id: 'exportobsidian',
    label: 'Exporter pour Obsidian',
    desc: 'Markdown avec frontmatter YAML, wikilinks et tags — prêt pour Obsidian',
    icon: Hexagon,
    shortcut: '/exportobsidian',
  },
  {
    id: 'biais',
    label: 'Détecter mes biais',
    desc: "L'IA identifie les biais cognitifs dans tes arguments avec exemples cités",
    icon: ShieldAlert,
    shortcut: '/biais',
  },
  {
    id: 'vote',
    label: 'Vote de persuasion',
    desc: "Le persona vote : convaincu, partiellement, ou pas du tout — avec justification",
    icon: Vote,
    shortcut: '/vote',
  },
  {
    id: 'avocatdiable',
    label: "Avocat du diable (toggle)",
    desc: "Active/désactive le mode contre-pied systématique pour cette session",
    icon: Swords,
    shortcut: '/avocatdiable',
  },
  {
    id: 'transposer',
    label: 'Contradiction historique (toggle)',
    desc: "Le persona transpose sa pensée sur un sujet anachronique que tu donneras",
    icon: Clock,
    shortcut: '/transposer',
  },
  {
    id: 'preparation',
    label: 'Préparation express',
    desc: "Donne un sujet — l'IA bâtit un plan de session (personas, friction, questions probables)",
    icon: Hourglass,
    shortcut: '/preparation',
  },
  {
    id: 'steelman',
    label: 'Steelman mon argument',
    desc: "L'IA reformule ton argument dans sa version la plus défendable, puis te pousse à le rendre encore plus solide",
    icon: ShieldCheck,
    shortcut: '/steelman',
  },
] as const;

type SlashCommandId = (typeof SLASH_COMMANDS)[number]['id'];

// ─── Appel API Chat avec streaming SSE ───────────────────────────────────────
async function streamChat(
  payload: { messages: object[]; model: string; temperature: number; searchQuery?: string; attachmentCount?: number },
  onChunk: (text: string) => void,
  onMeta?: (meta: { sources?: SourceRef[] }) => void
): Promise<void> {
  const res = await apiFetch('/api/chat', {
    method: 'POST',
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
        if (json.cia_meta) { onMeta?.(json.cia_meta); continue; } // sources web (fact-check)
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
  attachmentCount?: number;
}): Promise<Response> {
  return apiFetch('/api/chat', {
    method: 'POST',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-app)]/95 backdrop-blur-sm px-4"
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
            <h1 className="text-3xl font-black uppercase tracking-tighter text-[var(--text-primary)] mb-2">Challenger IA</h1>
            <p className="text-sm text-[var(--text-primary)]/50 mb-8 font-medium">Ton adversaire intellectuel. Challengé pour progresser.</p>
            <button
              onClick={() => onStepChange(1)}
              className="px-8 py-3 bg-[#5D7BFF] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#4a68e8] transition-all"
              style={{ boxShadow: '0 6px 16px rgba(93,123,255,0.3)' }}
            >
              Commencer →
            </button>
            <button onClick={onClose} className="block mx-auto mt-4 text-[9px] text-[var(--text-primary)]/25 hover:text-[var(--text-primary)]/50 font-black uppercase tracking-widest transition-colors">
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
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 text-center mb-6">Choisissez votre challenger</p>
            <div className="space-y-3">
              {ONBOARDING_PERSONAS.map(p => (
                <button
                  key={p.key}
                  onClick={() => { onPersonaChange(p.key); onStepChange(2); }}
                  className={cx(
                    'w-full text-left px-5 py-4 border-2 transition-all',
                    persona === p.key
                      ? 'border-[#5D7BFF] bg-[#5D7BFF]/5'
                      : 'border-[var(--border)] bg-[var(--bg-chat)] hover:border-[#5D7BFF]/40'
                  )}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{p.emoji}</span>
                    <div>
                      <p className="font-black text-[var(--text-primary)] text-sm uppercase tracking-wide">{p.title}</p>
                      <p className="text-[11px] text-[var(--text-primary)]/50 mt-0.5 leading-snug">{p.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/20 ml-auto flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
            <button onClick={onClose} className="block mx-auto mt-5 text-[9px] text-[var(--text-primary)]/25 hover:text-[var(--text-primary)]/50 font-black uppercase tracking-widest transition-colors">
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
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 text-center mb-2">Première thèse</p>
            <p className="text-center text-sm text-[var(--text-primary)]/50 mb-6">
              Soumets une conviction à <span className="font-black text-[#5D7BFF]">{ONBOARDING_PERSONAS.find(p => p.key === persona)?.title}</span>
            </p>
            <div className="space-y-3">
              {ONBOARDING_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { onSend(s); onClose(); }}
                  className="w-full text-left px-5 py-4 bg-[var(--bg-chat)] border-2 border-[#5D7BFF]/15 hover:border-[#5D7BFF] hover:shadow-[4px_4px_0px_0px_rgba(93,123,255,0.8)] transition-all text-sm font-medium text-[var(--text-primary)]"
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="block mx-auto mt-5 text-[9px] text-[var(--text-primary)]/40 hover:text-[#5D7BFF] font-black uppercase tracking-widest transition-colors"
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
    <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-chat)] border-b border-[var(--border)]">

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
          className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 select-none"
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
  const sendingRef = useRef(false); // guard synchrone — évite les double-envois avant re-render
  const [chatError, setChatError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
  const [sidebarExtrasOpen, setSidebarExtrasOpen] = useState(false);

  // ── Auth state
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(FIREBASE_ENABLED);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // ── Abonnement
  const [subscription, setSubscription] = useState<Plan>('free');
  const [dailyUsage, setDailyUsage] = useState<{ count: number; date: string }>({ count: 0, date: '' });
  const [weeklyUsage, setWeeklyUsage] = useState<{ count: number; week: string }>({ count: 0, week: '' });
  const [userCredits, setUserCredits] = useState<number>(0);
  const [totalCredits, setTotalCredits] = useState<number>(0); // lifetime (total acheté)
  const [upgradeModal, setUpgradeModal] = useState<'limit' | 'files' | 'projects' | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [creditsSuccess, setCreditsSuccess] = useState(false);
  // ── Mode Préparation Express
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [preparationSubject, setPreparationSubject] = useState('');
  const [preparationDuration, setPreparationDuration] = useState('');
  const [preparationLoading, setPreparationLoading] = useState(false);
  type PreparationPlan = {
    summary: string;
    personas: { name: string; rationale: string; debateId?: string }[];
    friction: 'doux' | 'moyen' | 'extreme';
    frictionRationale: string;
    likelyQuestions: string[];
    suggestedAngles: string[];
  };
  const [preparationPlan, setPreparationPlan] = useState<PreparationPlan | null>(null);
  const [preparationError, setPreparationError] = useState<string | null>(null);

  // ── Préférences crédits
  const [autoUseCredits, setAutoUseCredits] = useState<boolean>(() => {
    try { return localStorage.getItem('autoUseCredits') !== 'false'; } catch { return true; }
  });
  const creditConfirmedRef = useRef(false);
  const [pendingCreditSend, setPendingCreditSend] = useState<{ text: string; attachments: Attachment[] } | null>(null);

  // ── Notifications in-chat (quota, crédits)
  const [chatNotif, setChatNotif] = useState<{ type: 'warning' | 'info' | 'error'; msg: string; action?: { label: string; page: 'settings' } } | null>(null);

  // ── Navigation
  const [currentPage, setCurrentPage] = useState<'chat' | 'library' | 'settings' | 'arene' | 'outils'>(
    () => {
      const saved = localStorage.getItem('cia_current_page');
      return (['chat', 'library', 'settings', 'arene', 'outils'].includes(saved ?? '') ? saved : 'chat') as 'chat' | 'library' | 'settings' | 'arene' | 'outils';
    }
  );

  // Persiste la page courante
  useEffect(() => {
    localStorage.setItem('cia_current_page', currentPage);
  }, [currentPage]);

  // ── Pinned tools (outils épinglés dans la sidebar)
  const [pinnedTools, setPinnedTools] = useState<OutilId[]>(() => getPinnedTools());
  const [openToolId, setOpenToolId] = useState<OutilId | undefined>(undefined);

  useEffect(() => {
    const handler = (e: Event) => {
      setPinnedTools((e as CustomEvent<OutilId[]>).detail);
    };
    window.addEventListener('cr-pinned-changed', handler);
    return () => window.removeEventListener('cr-pinned-changed', handler);
  }, []);

  const [propulseData, setPropulseData] = useState<{ question: string; aiResponse: string; personaName: string } | null>(null);

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

  // ── Question interactive IA
  const [activeQuestion, setActiveQuestion] = useState<CiaQuestion | null>(null);
  const [questionTextInput, setQuestionTextInput] = useState('');

  // ── Partage de conversation
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [sharedConvView, setSharedConvView] = useState<{ title: string; messages: { role: string; content: string; timestamp: string }[]; persona: string; sharedAt: string } | null>(null);

  // ── Dark mode
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try { return localStorage.getItem('cia_dark') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try { localStorage.setItem('cia_dark', darkMode ? 'true' : 'false'); } catch {}
  }, [darkMode]);

  // ── Défi quotidien
  const [challengeProgress, setChallengeProgress] = useState<number>(() => getChallengeProgress());
  const [challengeRewarded, setChallengeRewarded] = useState<boolean>(() => {
    try { return getChallengeProgress() >= 3; } catch { return false; }
  });
  // Charge le défi via Firestore (généré par le cron) avec fallback statique
  // synchrone pour éviter un flash vide au premier rendu.
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge>(() => getDailyChallenge());
  useEffect(() => {
    let cancelled = false;
    fetchDailyChallenge()
      .then((c) => { if (!cancelled) setDailyChallenge(c); })
      .catch(() => {}); // fallback déjà en place
    return () => { cancelled = true; };
  }, []);

  // ── UX features
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('cia_onboarding_done'));
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingPersona, setOnboardingPersona] = useState<Persona>('architect');
  const [collapsedMsgs, setCollapsedMsgs] = useState<Set<string>>(new Set());
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0); // counter pour éviter les faux onDragLeave sur les enfants

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
  const [authFormNotice, setAuthFormNotice] = useState<string | null>(null);
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
    const [remote, remoteProjects, plan, usage, remoteProfile, credits] = await Promise.all([
      fsLoadConversations(firebaseUser.uid),
      fsLoadProjects(firebaseUser.uid),
      getSubscription(firebaseUser.uid),
      fsGetUsage(firebaseUser.uid),
      fsLoadProfile(firebaseUser.uid),
      getUserCredits(firebaseUser.uid),
    ]);
    setConversations(remote);
    setProjects(remoteProjects);
    setSubscription(plan);
    setUserCredits(credits.credits);
    setTotalCredits(credits.lifetime);
    const today = todayStr();
    const thisWeek = weekStr();
    setDailyUsage(usage.date === today ? { count: usage.count, date: today } : { count: 0, date: today });
    setWeeklyUsage(usage.week === thisWeek ? { count: usage.weeklyCount, week: thisWeek } : { count: 0, week: thisWeek });
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
    playMicOn();
    setVoiceListening(true);
  }, []);

  // Toujours à jour dans les closures TTS
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) playMicOff();
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

  // ── Retour depuis Stripe : re-vérification du plan + crédits + visibilitychange
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentParam = params.get('payment');

    if (paymentParam === 'success') {
      setPaymentSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentParam === 'credits') {
      // Rechargement du solde de crédits depuis Supabase
      if (user) {
        getUserCredits(user.uid).then(({ credits, lifetime }) => {
          setUserCredits(credits);
          setTotalCredits(lifetime);
        });
      }
      setCreditsSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
    }

    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && user) {
        const [plan, { credits, lifetime }] = await Promise.all([
          getSubscription(user.uid),
          getUserCredits(user.uid),
        ]);
        setSubscription(plan);
        setUserCredits(credits);
        setTotalCredits(lifetime);
        if (plan === 'pro') setPaymentSuccess(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user]);

  // ── Auto-masquage des notifications de paiement
  useEffect(() => {
    if (!paymentSuccess) return;
    const t = setTimeout(() => setPaymentSuccess(false), 6000);
    return () => clearTimeout(t);
  }, [paymentSuccess]);

  // ── Persistance préférence crédits auto
  useEffect(() => {
    try { localStorage.setItem('autoUseCredits', String(autoUseCredits)); } catch {}
  }, [autoUseCredits]);

  // ── Détection lien de partage ?share=ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (shareId) {
      window.history.replaceState({}, '', window.location.pathname);
      fsGetSharedConversation(shareId).then(data => {
        if (data) setSharedConvView(data);
      });
    }
  }, []);

  // ── Auto-dismiss chatNotif
  useEffect(() => {
    if (!chatNotif) return;
    const t = setTimeout(() => setChatNotif(null), 5000);
    return () => clearTimeout(t);
  }, [chatNotif]);

  useEffect(() => {
    if (!creditsSuccess) return;
    const t = setTimeout(() => setCreditsSuccess(false), 6000);
    return () => clearTimeout(t);
  }, [creditsSuccess]);

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

  const handleForgotPassword = async () => {
    if (!auth || authFormLoading) return;
    setAuthFormError(null);
    setAuthFormNotice(null);
    const email = authEmail.trim();
    if (!email) {
      setAuthFormError('Entrez d\'abord votre adresse email ci-dessus, puis cliquez à nouveau.');
      return;
    }
    setAuthFormLoading(true);
    const neutral = `Si un compte existe pour ${email}, un email de réinitialisation vient d'être envoyé. Pensez à vérifier vos spams.`;
    try {
      // 1) On tente l'email personnalisé (Resend). 2) Sinon repli Firebase.
      let sentByResend = false;
      try {
        const r = await fetch('/api/send-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.ok) sentByResend = true; // email pro envoyé (ou compte inexistant → neutre)
        }
      } catch { /* endpoint indisponible → repli Firebase ci-dessous */ }

      if (!sentByResend) {
        await sendPasswordResetEmail(auth, email);
      }
      setAuthFormNotice(neutral);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      // On ne révèle pas si l'email existe (sécurité) : message neutre sauf cas techniques
      if (code === 'auth/invalid-email') setAuthFormError('Adresse email invalide.');
      else if (code === 'auth/too-many-requests') setAuthFormError('Trop de tentatives. Réessayez dans quelques minutes.');
      else if (code === 'auth/network-request-failed') setAuthFormError('Erreur réseau. Vérifiez votre connexion.');
      else setAuthFormNotice(neutral);
    } finally {
      setAuthFormLoading(false);
    }
  };

  const switchAuthMode = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthFormError(null);
    setAuthFormNotice(null);
    setAuthPassword('');
    setAuthConfirmPassword('');
  };

  // ── New conversation
  const startNewConv = useCallback(() => {
    playNewConv();
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
      playDelete();
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
      if (sending || sendingRef.current) return;
      sendingRef.current = true;
      setActiveQuestion(null); // Effacer la question interactive en cours

      // ── Modèle Hybride : quotas pour tous les plans ──────────────────────
      if (FIREBASE_ENABLED) {
        const today = todayStr();
        const thisWeek = weekStr();
        const dailyCount = dailyUsage.date === today ? dailyUsage.count : 0;
        const wkCount = weeklyUsage.week === thisWeek ? weeklyUsage.count : 0;

        // Fichiers joints coûtent 3 crédits chacun (max 3 fichiers = 9 crédits)
        const cost = attachments.length > 0 ? attachments.length * 3 : 1;

        const dailyLimit  = subscription === 'pro' ? PRO_DAILY_LIMIT  : FREE_DAILY_LIMIT;
        const weeklyLimit = subscription === 'pro' ? PRO_WEEKLY_LIMIT : FREE_WEEKLY_LIMIT;

        const dailyOk  = dailyCount + cost <= dailyLimit;
        const weeklyOk = wkCount   + cost <= weeklyLimit;

        if (dailyOk && weeklyOk) {
          // ── Quota inclus disponible
          const newDaily  = dailyCount + cost;
          const newWeekly = wkCount + cost;
          setDailyUsage({ count: newDaily, date: today });
          setWeeklyUsage({ count: newWeekly, week: thisWeek });
          if (user) fsSaveUsage(user.uid, newDaily, today, newWeekly, thisWeek);
          // Notif 80% quota journalier
          const pct = newDaily / dailyLimit;
          const left = dailyLimit - newDaily;
          if (pct >= 0.8 && pct < 1) {
            setChatNotif({ type: 'warning', msg: `🧠 Votre élan intellectuel est impressionnant — encore ${left} échange${left > 1 ? 's' : ''} dans votre arsenal aujourd'hui` });
          } else if (newDaily >= dailyLimit) {
            if (userCredits > 0) {
              setChatNotif({ type: 'info', msg: `Votre cerveau a besoin de repos (et nos serveurs aussi) — vos crédits prennent le relais automatiquement` });
            } else {
              setChatNotif({ type: 'warning', msg: `Votre cerveau a besoin de repos (et nos serveurs aussi). Revenez demain ou procurez-vous des crédits`, action: { label: 'Recharger →', page: 'settings' } });
            }
          }
        } else if (userCredits >= cost) {
          // ── Quota épuisé → vérifier si auto ou confirmation
          if (!autoUseCredits && !creditConfirmedRef.current) {
            setPendingCreditSend({ text, attachments });
            sendingRef.current = false;
            return;
          }
          creditConfirmedRef.current = false;
          // Mise à jour UI optimiste — la déduction réelle se fait côté serveur
          // dans api/chat.js (RPC check_chat_quota). Le solde sera reconfirmé
          // par getUserCredits au prochain refresh.
          const remaining = userCredits - cost;
          setUserCredits(c => c - cost);
          const newWeekly = wkCount + cost;
          setWeeklyUsage({ count: newWeekly, week: thisWeek });
          // Notif selon crédits restants
          if (remaining === 0) {
            setChatNotif({ type: 'error', msg: `Dernier crédit consommé. La joute s'arrête ici — à moins de renflouer l'arsenal.`, action: { label: 'Recharger →', page: 'settings' } });
          } else if (remaining <= 5) {
            setChatNotif({ type: 'error', msg: `⚠️ Arsenal critique : ${remaining} crédit${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}. Ne laissez pas Challenger sans réponse.`, action: { label: 'Recharger →', page: 'settings' } });
          } else if (remaining <= 10) {
            setChatNotif({ type: 'warning', msg: `⚠️ Munitions limitées — ${remaining} crédits restants. Rechargez avant la prochaine grande thèse.`, action: { label: 'Recharger →', page: 'settings' } });
          } else {
            setChatNotif({ type: 'info', msg: `💳 ${cost} crédit${cost > 1 ? 's' : ''} consommé${cost > 1 ? 's' : ''} — ${remaining} munition${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}` });
          }
        } else {
          // ── Bloqué — plus de quota ni de crédits
          setChatNotif({ type: 'error', msg: `Munitions épuisées. Challenger attend votre retour — passez au niveau supérieur ou rechargez des crédits.`, action: { label: 'Passer Pro / Recharger →', page: 'settings' } });
          setUpgradeModal('limit');
          sendingRef.current = false;
          return;
        }
      }

      // ── Défi quotidien — progression
      if (user && !challengeRewarded) {
        const progress = incrementChallengeProgress();
        setChallengeProgress(progress);
        if (progress >= 3) {
          setChallengeRewarded(true);
          addCredits(user.uid, 1).then(ok => {
            if (ok) {
              setUserCredits(c => c + 1);
              setChatNotif({ type: 'info', msg: '🏆 Défi du jour complété ! +1 crédit offert.' });
            }
          });
        }
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
      playSend();
      setSending(true);
      sendingRef.current = true;
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
            imgs.forEach((a) => parts.push({ type: 'image_url', image_url: a.content }));
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
        // ── Overrides de session : avocat du diable, contradiction historique ──
        // Si le sujet anachronique est en attente, on capture le texte du message courant comme sujet
        let effectiveAnachronistic = activeConvNow?.anachronisticTopic;
        if (effectiveAnachronistic === '__pending__' && text.trim()) {
          effectiveAnachronistic = text.trim().slice(0, 300);
          setConversations((p) =>
            p.map((c) => (c.id !== convId ? c : { ...c, anachronisticTopic: effectiveAnachronistic, updatedAt: new Date() }))
          );
        }
        let modeOverrides = '';
        if (activeConvNow?.devilsAdvocate) {
          modeOverrides += `\n\n## MODE AVOCAT DU DIABLE (OVERRIDE)
Tu es désormais en mode "avocat du diable systématique". Peu importe ce que dit l'utilisateur — même s'il a raison, même si tu serais d'accord — tu prends TOUJOURS le contre-pied avec la meilleure défense intellectuelle possible de la position opposée.
- Si l'utilisateur défend X, attaque X et défends ¬X avec rigueur.
- Si l'utilisateur défend ¬X, attaque ¬X et défends X avec rigueur.
- Ne capitule jamais. Ne concède jamais. Réoriente.
- Tu peux le faire avec finesse : argument inattendu, exception, perspective qu'il n'a pas vue, conséquence non envisagée.
- Tu n'es PAS désagréable. Tu es exigeant. C'est un entraînement à la résilience argumentative.
- À la fin de chaque réponse, pose UNE question piège qui force l'utilisateur à défendre une nuance qu'il n'a pas anticipée.`;
        }
        if (effectiveAnachronistic && effectiveAnachronistic !== '__pending__') {
          modeOverrides += `\n\n## MODE CONTRADICTION HISTORIQUE (OVERRIDE)
Sujet anachronique : « ${effectiveAnachronistic.slice(0, 300)} »
Transpose ta pensée sur ce sujet contemporain — tout en restant fidèle à ton époque, ton style, ton lexique, tes références. Tu ne dois PAS faire semblant de connaître le contexte d'aujourd'hui : tu raisonnes à partir de tes principes, ta méthode, tes obsessions intellectuelles. Si tu n'as pas les mots (« réseaux sociaux », « algorithmes », « GAFA »…), reformule avec ton vocabulaire d'époque (« assemblée invisible », « machines à influencer », « grandes compagnies marchandes »…).
Reste profondément dans le personnage. C'est précisément le décalage temporel qui rend la conversation intéressante.`;
        }

        const enrichedSystemPrompt = systemPrompt + modeOverrides + `\n\n## Accès web et contexte temps réel (CRITIQUE)
Date actuelle : ${currentDateStr}

Tu as ACCÈS EN TEMPS RÉEL à des données web fraîches grâce à un moteur de recherche intégré. Ces données sont injectées dans ton contexte sous la section "Données web en temps réel" quand elles sont disponibles.

RÈGLES ABSOLUES :
- Ne dis JAMAIS que tu n'as pas accès à internet, que tes données s'arrêtent en 2023 ou que tu ne peux pas connaître l'actualité récente.
- Si des résultats web sont présents dans ce contexte, utilise-les comme source primaire et cite-les.
- Si aucune donnée web n'est injectée mais que la question porte sur l'actualité, indique que tu n'as pas trouvé de résultats récents pour CETTE requête spécifique — mais pas que tu manques d'accès au web en général.
- Tu es un assistant connecté et à jour. Comporte-toi comme tel.

## Rigueur chiffrée (RÈGLE ABSOLUE — NON NÉGOCIABLE)
Tu ne donnes JAMAIS un chiffre, score, pourcentage, note ou statistique présenté comme précis s'il n'est pas réellement sourçable ou vérifiable — MÊME si l'utilisateur insiste, te le réclame explicitement, te met la pression ou reformule pour l'obtenir. Inventer une fausse précision (« 73 % », « note 8/10 », « 2,4 millions ») serait une faute, car cela donne une illusion de rigueur trompeuse.

À la place, tu fais ceci :
- Exprime l'incertitude en langage probabiliste QUALITATIF et nuancé : « très probable », « probable », « plausible », « incertain », « peu probable », « très improbable » — et EXPLIQUE toujours le raisonnement et les facteurs qui penchent dans un sens ou l'autre.
- Si un ordre de grandeur ou une fourchette est réellement justifiable, présente-le explicitement comme une estimation raisonnée (« estimation grossière, à confirmer ») en exposant les hypothèses qui la sous-tendent.
- Si l'utilisateur force pour un chiffre exact que tu ne peux pas étayer, REFUSE poliment et explique en une phrase pourquoi un chiffre inventé l'induirait en erreur, puis propose immédiatement l'analyse qualitative détaillée à la place.
- Un chiffre n'est acceptable que s'il provient d'une donnée fournie par l'utilisateur ou d'une source réelle que tu peux nommer.`;

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
        playReceive();
        let accumulated = '';
        let firstChunk = true;
        await streamChat(
          {
            model: debateModel,
            temperature,
            // Pas de recherche systématique : le serveur décide via détection
            // (mots de vérification / actualité) → maîtrise des coûts Tavily.
            attachmentCount: attachments?.length ?? 0,
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
          },
          (meta) => {
            // Sources web (fact-check) reçues avant le flux → on les attache au message
            if (meta.sources?.length) {
              setConversations((p) =>
                p.map((c) =>
                  c.id !== convId ? c : {
                    ...c,
                    messages: c.messages.map((m) => (m.id === asstId ? { ...m, sources: meta.sources } : m)),
                  }
                )
              );
            }
          }
        );

        // Streaming terminé
        playDone();

        // Détecter une question interactive dans la réponse
        const question = parseCiaQuestion(accumulated);
        if (question) {
          setActiveQuestion(question);
          setQuestionTextInput('');
          // Retirer le tag CIA_Q du message affiché
          const cleaned = stripCiaQuestion(accumulated);
          setConversations((p) =>
            p.map((c) =>
              c.id !== convId ? c : {
                ...c,
                messages: c.messages.map((m) => m.id === asstId ? { ...m, content: cleaned } : m),
              }
            )
          );
        }

        // Sauvegarder l'état final dans Firestore
        setConversations((p) => {
          const conv = p.find((c) => c.id === convId);
          if (conv && user) fsSaveConversation(user.uid, conv);
          return p;
        });
      } catch (e) {
        playError();
        setChatError(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        setSending(false);
        sendingRef.current = false;
      }
    },
    [activeId, conversations, sending, persona, level, user, subscription, dailyUsage, challengeRewarded]
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

  // ── Helper : exécute une analyse "cachée" — l'instruction n'apparaît PAS
  // dans le fil de la conversation (utilisé par /biais et /vote).
  // On envoie la consigne en tant que message user à l'API uniquement,
  // mais on n'ajoute qu'un command-msg + un assistant-msg côté UI.
  const runHiddenAnalysis = useCallback(async (hiddenPrompt: string, commandLabel: string) => {
    if (!activeId) return;
    const conv = conversations.find((c) => c.id === activeId);
    if (!conv) return;

    addCommandMsg(commandLabel);

    // Construire le system prompt comme send() le fait
    const basePrompt = conv.debatePrompt ?? buildSystemPrompt(persona, level);
    const profileCtx = (!conv.debatePrompt && !conv.noProfile && !noProfileMode)
      ? buildProfileContext(userProfile)
      : '';
    const systemPrompt = profileCtx ? basePrompt + '\n\n' + profileCtx : basePrompt;

    // Historique respectant /oublier
    const memoryResetAt = conv.memoryResetAt;
    const contextMessages = memoryResetAt
      ? conv.messages.filter((m) => new Date(m.timestamp).toISOString() > memoryResetAt)
      : conv.messages;

    // Placeholder assistant message
    const asstId = uid();
    setConversations((p) =>
      p.map((c) => c.id !== activeId ? c : {
        ...c,
        messages: [...c.messages, {
          id: asstId,
          role: 'assistant' as const,
          content: '',
          timestamp: new Date(),
          persona,
          level,
        }],
        updatedAt: new Date(),
      })
    );

    setSending(true);
    sendingRef.current = true;
    playReceive();
    let accumulated = '';
    try {
      await streamChat(
        {
          model: 'mistral-large-latest',
          temperature: 0.5,
          messages: [
            { role: 'system', content: systemPrompt },
            ...contextMessages.filter((m) => m.role !== 'command').map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: hiddenPrompt },
          ],
        },
        (chunk) => {
          accumulated += chunk;
          const snap = accumulated;
          setConversations((p) =>
            p.map((c) => c.id !== activeId ? c : {
              ...c,
              messages: c.messages.map((m) => m.id === asstId ? { ...m, content: snap } : m),
            })
          );
        }
      );
      playDone();
      // Sauvegarde Firestore
      if (user) {
        setConversations((p) => {
          const updated = p.find((c) => c.id === activeId);
          if (updated) fsSaveConversation(user.uid, updated);
          return p;
        });
      }
    } catch (err) {
      console.error('runHiddenAnalysis error:', err);
      playError();
      setConversations((p) =>
        p.map((c) => c.id !== activeId ? c : {
          ...c,
          messages: c.messages.map((m) => m.id === asstId ? { ...m, content: '⚠️ Erreur lors de l\'analyse. Réessaie.' } : m),
        })
      );
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }, [activeId, conversations, addCommandMsg, persona, level, noProfileMode, userProfile, user, setConversations]);

  const handleSlashCommand = useCallback(
    async (id: SlashCommandId) => {
      playSlash();
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

      if (id === 'exportmd') {
        const conv = conversations.find((c) => c.id === activeId);
        if (conv && conv.messages.length > 0) {
          const md = generateMarkdown(conv.title, conv.messages.map(m => ({ ...m, content: stripViz(m.content) })), PERSONAS[conv.persona]?.name);
          downloadTextFile(md, `${conv.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`);
          showSlashNotif('Export Markdown téléchargé !');
          addCommandMsg('📥 Export Markdown téléchargé !');
        } else {
          showSlashNotif('Aucune conversation à exporter.', false);
        }
        return;
      }

      if (id === 'copiernotion') {
        const conv = conversations.find((c) => c.id === activeId);
        if (conv && conv.messages.length > 0) {
          const md = generateNotionMarkdown(conv.title, conv.messages.map(m => ({ ...m, content: stripViz(m.content) })), PERSONAS[conv.persona]?.name);
          copyToClipboard(md).then(success => {
            if (success) {
              showSlashNotif('Conversation copiée pour Notion !');
              addCommandMsg('📋 Conversation copiée pour Notion !');
            } else {
              showSlashNotif('Impossible de copier dans le presse-papier.', false);
            }
          });
        } else {
          showSlashNotif('Aucune conversation à exporter.', false);
        }
        return;
      }

      if (id === 'exportobsidian') {
        const conv = conversations.find((c) => c.id === activeId);
        if (!conv || conv.messages.length === 0) {
          showSlashNotif('Aucune conversation à exporter.', false);
          return;
        }
        const persona = getDP(conv)?.name
          ?? (conv.interviewType ? INTERVIEW_TYPES[conv.interviewType]?.interviewerRole : null)
          ?? PERSONAS[conv.persona]?.name;
        const md = generateObsidianMarkdown(conv.title, conv.messages.map(m => ({ ...m, content: stripViz(m.content) })), persona ?? 'Challenger IA');
        const safeName = conv.title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 60);
        downloadTextFile(md, `${safeName || 'challenger-session'}.md`);
        showSlashNotif('Note Obsidian téléchargée !');
        addCommandMsg('📥 Note Obsidian téléchargée — frontmatter YAML + wikilinks inclus.');
        return;
      }

      if (id === 'biais') {
        if (!activeId) {
          showSlashNotif('Lance d\'abord une conversation pour détecter les biais.', false);
          return;
        }
        const conv = conversations.find((c) => c.id === activeId);
        if (!conv || conv.messages.filter((m) => m.role === 'user').length === 0) {
          showSlashNotif('Aucune intervention utilisateur à analyser.', false);
          return;
        }
        const biasPrompt =
          'COMMANDE /biais — Analyse UNIQUEMENT mes interventions (utilisateur) dans cet échange et identifie les biais cognitifs et sophismes que j\'ai utilisés (homme de paille, ad hominem, faux dilemme, appel à l\'autorité, biais de confirmation, généralisation hâtive, pente glissante, raisonnement circulaire, biais d\'ancrage, effet de halo, biais de disponibilité, etc.).\n\n' +
          'Format de réponse OBLIGATOIRE :\n' +
          '## Biais détectés\n\n' +
          'Pour chaque biais identifié, structure ainsi :\n' +
          '### [Nom du biais]\n' +
          '> **Citation :** « extrait littéral de ma phrase »\n' +
          '\n' +
          '**Pourquoi c\'est un biais :** explication courte (1-2 phrases).\n' +
          '\n' +
          '**Comment le corriger :** suggestion concrète.\n\n' +
          'Si aucun biais n\'est détecté, dis-le franchement et explique pourquoi mes arguments sont rigoureux.\n' +
          'Ne flatte pas. Sois sévère mais juste.';
        showSlashNotif('Analyse des biais en cours…');
        runHiddenAnalysis(biasPrompt, '🔍 Détection de biais demandée — analyse en cours…');
        return;
      }

      if (id === 'steelman') {
        if (!activeId) {
          showSlashNotif("Lance d'abord une conversation pour activer le steelman.", false);
          return;
        }
        const conv = conversations.find((c) => c.id === activeId);
        if (!conv || conv.messages.filter((m) => m.role === 'user').length === 0) {
          showSlashNotif("Aucun argument à renforcer — exprime d'abord ta position.", false);
          return;
        }
        const steelmanPrompt =
          "COMMANDE /steelman — Tu sors un instant de ton rôle pour faire un exercice de pure rigueur intellectuelle.\n\n" +
          "Prends la position défendue par l'utilisateur dans cette conversation et reformule-la dans sa version la PLUS FORTE possible — celle qu'un défenseur d'élite et de bonne foi articulerait. Tu dois être plus convaincant que l'utilisateur lui-même.\n\n" +
          "Format de réponse OBLIGATOIRE :\n\n" +
          "## La position telle que tu l'as formulée\n" +
          "Résumé fidèle en 1-2 phrases, sans ironie.\n\n" +
          "## Steelman — version blindée\n" +
          "Reformule-la en 3 à 5 phrases en :\n" +
          "- Précisant les prémisses qui la rendent défendable\n" +
          "- Utilisant les meilleures formulations possibles (pas les plus radicales)\n" +
          "- Anticipant et désamorçant la contre-attaque évidente\n" +
          "- Citant un argument ou une autorité qui la soutiennent\n\n" +
          "## Ce qui te manque pour atteindre ce niveau\n" +
          "2 ou 3 points concrets : un argument que tu n'as pas mobilisé, une nuance que tu n'as pas posée, une donnée à aller chercher.\n\n" +
          "## Question qui te forcerait à monter d'un cran\n" +
          "UNE seule question — la plus tranchante — que tu devrais pouvoir traiter pour rendre ta position imparable.\n\n" +
          "Sois rigoureux. Ne flatte pas. L'objectif est de te faire progresser, pas de te rassurer. Tu peux ensuite reprendre ton rôle.";
        showSlashNotif('Steelman en construction…');
        runHiddenAnalysis(steelmanPrompt, '🛡️ Steelman demandé — l\'IA forge la version la plus solide…');
        return;
      }

      if (id === 'vote') {
        if (!activeId) {
          showSlashNotif('Lance d\'abord un débat pour obtenir un vote.', false);
          return;
        }
        const conv = conversations.find((c) => c.id === activeId);
        if (!conv || conv.messages.filter((m) => m.role === 'user').length === 0) {
          showSlashNotif('Aucun argument à juger pour le moment.', false);
          return;
        }
        const personaLabel = getDP(conv)?.name
          ?? (conv.interviewType ? INTERVIEW_TYPES[conv.interviewType]?.interviewerRole : null)
          ?? PERSONAS[conv.persona]?.name
          ?? 'le challenger';
        const votePrompt =
          `COMMANDE /vote — Tu sors un instant de ton rôle pour rendre un verdict honnête sur ma performance argumentative dans cet échange. Place-toi en tant que ${personaLabel}.\n\n` +
          'Réponds STRICTEMENT avec ce format Markdown :\n\n' +
          '## Verdict\n\n' +
          '**Vote :** Convaincu / Partiellement convaincu / Pas convaincu (choisis UN seul de ces trois)\n\n' +
          '**Score de persuasion :** X / 10\n\n' +
          '## Justification\n\n' +
          '2 à 4 phrases maximum. Cite un argument précis qui a fonctionné (ou pas) — entre guillemets si possible.\n\n' +
          '## Ce qu\'il aurait fallu\n\n' +
          'En une phrase, l\'argument ou la posture qui m\'aurait fait basculer (ou enfoncer le clou).\n\n' +
          'Sois honnête et sec. Ne flatte pas. Tu peux être dur si l\'échange était faible.';
        showSlashNotif('Vote en cours…');
        runHiddenAnalysis(votePrompt, `🗳️ ${personaLabel} rend son verdict — calcul en cours…`);
        return;
      }

      if (id === 'avocatdiable') {
        if (!activeId) {
          showSlashNotif('Active une conversation avant de basculer en mode avocat du diable.', false);
          return;
        }
        // Lire l'état AVANT le flip (sinon le setConversations async fausse la valeur)
        const currentConv = conversations.find((c) => c.id === activeId);
        const willActivate = !currentConv?.devilsAdvocate;
        setConversations((p) =>
          p.map((c) =>
            c.id !== activeId ? c : { ...c, devilsAdvocate: willActivate, updatedAt: new Date() }
          )
        );
        const msg = willActivate
          ? '⚔️ Mode avocat du diable ACTIVÉ — l\'IA prendra systématiquement le contre-pied.'
          : '⚔️ Mode avocat du diable DÉSACTIVÉ — retour au comportement normal.';
        showSlashNotif(msg);
        addCommandMsg(msg);
        return;
      }

      if (id === 'transposer') {
        if (!activeId) {
          showSlashNotif('Active une conversation avant d\'utiliser la contradiction historique.', false);
          return;
        }
        const currentConv = conversations.find((c) => c.id === activeId);
        const willActivate = !currentConv?.anachronisticTopic;
        setConversations((p) =>
          p.map((c) =>
            c.id !== activeId ? c : {
              ...c,
              anachronisticTopic: willActivate ? '__pending__' : undefined,
              updatedAt: new Date(),
            }
          )
        );
        if (willActivate) {
          showSlashNotif('Contradiction historique ACTIVÉE — donne le sujet anachronique dans ton prochain message.');
          addCommandMsg('🕰️ Mode contradiction historique ACTIVÉ. Écris ton sujet anachronique dans le prochain message (ex : « Rousseau face aux réseaux sociaux », « Marx face aux GAFA »). Le persona transposera sa pensée à ce contexte.');
        } else {
          showSlashNotif('Contradiction historique DÉSACTIVÉE.');
          addCommandMsg('🕰️ Mode contradiction historique DÉSACTIVÉ.');
        }
        return;
      }

      if (id === 'preparation') {
        setPreparationOpen(true);
        showSlashNotif('Mode Préparation express ouvert.');
        return;
      }
    },
    [activeId, send, showSlashNotif, addCommandMsg, setConversations, conversations, userProfile, runHiddenAnalysis]
  );

  // ── Préparation express : appelle Mistral pour bâtir un plan de session ────
  const runPreparation = useCallback(async () => {
    if (!preparationSubject.trim()) {
      setPreparationError('Décris d\'abord le sujet ou la situation.');
      return;
    }
    setPreparationLoading(true);
    setPreparationError(null);
    setPreparationPlan(null);
    try {
      const personaCatalog = Object.values(DEBATE_PERSONAS)
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => `- ${p.id} → ${p.name} (${p.category})`)
        .join('\n');

      const systemPrompt = `Tu es un coach de préparation. À partir du sujet donné par l'utilisateur, tu construis un plan de session d'entraînement pour Challenger IA — une plateforme où l'utilisateur s'entraîne contre des personas IA contradictoires.

Tu connais le catalogue de personas suivant (id → nom — catégorie) :
${personaCatalog}

Tu réponds UNIQUEMENT par un objet JSON valide, sans markdown ni texte autour, strictement conforme à ce schéma :
{
  "summary": "1-2 phrases qui résument l'enjeu de cette session.",
  "personas": [
    { "name": "Nom court de persona du catalogue OU nom inventé si rien ne convient", "rationale": "Pourquoi ce persona pour ce sujet (1 phrase).", "debateId": "id du persona dans le catalogue si applicable, sinon null" },
    { "name": "...", "rationale": "...", "debateId": "..." },
    { "name": "...", "rationale": "...", "debateId": "..." }
  ],
  "friction": "doux" | "moyen" | "extreme",
  "frictionRationale": "1 phrase pour justifier ce niveau de friction.",
  "likelyQuestions": [
    "Question piège ou difficile probable 1",
    "Question 2",
    "Question 3",
    "Question 4",
    "Question 5"
  ],
  "suggestedAngles": [
    "Angle d'attaque ou de défense à préparer 1",
    "Angle 2",
    "Angle 3"
  ]
}

Choisis les personas pertinents par rapport au sujet (ex : pour un entretien chez Google, "Partner conseil" pour le case, "DRH startup" pour le fit, "Architecte logique" pour la logique). Sois précis et utile.`;

      const userPrompt = `Sujet : ${preparationSubject.trim().slice(0, 800)}\n${preparationDuration.trim() ? `Délai : ${preparationDuration.trim().slice(0, 100)}` : ''}`;

      const res = await callChat({
        model: 'mistral-large-latest',
        temperature: 0.5,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content ?? '';
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Réponse non parsable');
      const parsed = JSON.parse(m[0]) as PreparationPlan;
      if (!parsed.summary || !Array.isArray(parsed.personas) || !Array.isArray(parsed.likelyQuestions)) {
        throw new Error('Plan incomplet');
      }
      setPreparationPlan(parsed);
    } catch (err) {
      console.error('Préparation error:', err);
      setPreparationError('Erreur — impossible de générer le plan. Réessaie.');
    } finally {
      setPreparationLoading(false);
    }
  }, [preparationSubject, preparationDuration]);

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
      className="flex h-screen overflow-hidden bg-[var(--bg-app)]"
      style={{ fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif' }}
    >

      {/* ── Conversation partagée (lecture seule) ─────────────────────────── */}
      <AnimatePresence>
        {sharedConvView && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-[#0e0e0e] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex-shrink-0 bg-[#141414] border-b-2 border-[#5D7BFF]/40 px-6 py-4 flex items-center gap-4">
              <img
                src="https://i.postimg.cc/L4WsWhk9/Design-sans-titre-(12).png"
                alt="Challenger IA"
                className="h-8 w-auto object-contain flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-white truncate">{sharedConvView.title}</p>
                <p className="text-[8px] text-white/30 uppercase tracking-widest">
                  Partagé le {new Date(sharedConvView.sharedAt).toLocaleDateString('fr-FR')} · Lecture seule
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={window.location.origin + window.location.pathname}
                  className="flex items-center gap-2 px-3 py-2 bg-[#5D7BFF] hover:bg-[#4a68e8] transition-colors text-white text-[8px] font-black uppercase tracking-widest"
                >
                  <Zap className="w-3 h-3" />
                  <span>Essayer Challenger IA</span>
                </a>
                <button
                  onClick={() => setSharedConvView(null)}
                  className="p-2 text-white/30 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-3xl mx-auto w-full">
              {sharedConvView.messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-[#5D7BFF] text-white text-sm'
                      : 'bg-[#1a1a2e] border border-[#5D7BFF]/20 text-white/80 text-sm'
                  }`}>
                    {msg.role === 'assistant' && (
                      <p className="text-[8px] font-black uppercase tracking-widest text-[#5D7BFF] mb-2">
                        {PERSONAS[sharedConvView.persona as Persona]?.shortName ?? 'Challenger'}
                      </p>
                    )}
                    <RichContent
                      text={msg.content}
                      components={{
                        p: ({ children }: { children?: React.ReactNode }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-bold">{children}</strong>,
                        h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-sm font-black uppercase tracking-wide mt-3 mb-1">{children}</h2>,
                        ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc list-inside text-sm space-y-1 mb-2">{children}</ul>,
                        li: ({ children }: { children?: React.ReactNode }) => <li className="text-sm">{children}</li>,
                        table: ({ children }: { children?: React.ReactNode }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse border border-white/20">{children}</table></div>,
                        th: ({ children }: { children?: React.ReactNode }) => <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wide bg-white/10 border border-white/20">{children}</th>,
                        td: ({ children }: { children?: React.ReactNode }) => <td className="px-3 py-2 text-[11px] border border-white/10 align-top">{children}</td>,
                        tr: ({ children }: { children?: React.ReactNode }) => <tr className="hover:bg-white/5">{children}</tr>,
                      }}
                    />
                    <p className="text-[8px] opacity-30 mt-2 text-right">
                      {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {/* CTA footer */}
            <div className="flex-shrink-0 border-t-2 border-white/5 bg-[#141414] px-6 py-4 text-center">
              <p className="text-[10px] text-white/30 mb-3">Entraîne ta pensée critique avec Challenger IA</p>
              <a
                href={window.location.origin + window.location.pathname}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#5D7BFF] hover:bg-[#4a68e8] transition-colors text-white text-[9px] font-black uppercase tracking-widest"
              >
                <Zap className="w-3.5 h-3.5" />
                Commencer gratuitement
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chargement initial Firebase ───────────────────────────────────── */}
      {FIREBASE_ENABLED && authLoading && !consentPending && (
        <div className="flex-1 bg-[#0e0e0e] flex flex-col items-center justify-center relative overflow-hidden">

          {/* ── Grille de fond ── */}
          <div className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'linear-gradient(#5D7BFF 1px, transparent 1px), linear-gradient(90deg, #5D7BFF 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          {/* ── Lignes diagonales d'accent ── */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <div key={i}
                className="absolute h-px opacity-[0.07]"
                style={{
                  background: 'linear-gradient(90deg, transparent, #5D7BFF, transparent)',
                  top: `${15 + i * 18}%`,
                  left: '-20%',
                  right: '-20%',
                  transform: `rotate(-8deg)`,
                  animation: `splash-line ${2.4 + i * 0.4}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.3}s`,
                }}
              />
            ))}
          </div>

          {/* ── Scan line animée ── */}
          <div className="absolute left-0 right-0 h-px pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #5D7BFF44 30%, #5D7BFF 50%, #5D7BFF44 70%, transparent 100%)',
              animation: 'splash-scan 3s ease-in-out infinite',
              boxShadow: '0 0 12px 2px rgba(93,123,255,0.3)',
            }}
          />

          {/* ── Coins de cadrage (brackets) ── */}
          {[
            { top: '50%', left: '50%', mt: '-90px', ml: '-90px', br: 'borderTop borderLeft' },
          ].map((_, idx) => (
            <div key={idx} className="absolute" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 180, height: 180 }}>
              {/* Coin TL */}
              <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-[#5D7BFF] opacity-50" />
              {/* Coin TR */}
              <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-[#5D7BFF] opacity-50" />
              {/* Coin BL */}
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-[#5D7BFF] opacity-50" />
              {/* Coin BR */}
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-[#5D7BFF] opacity-50" />
            </div>
          ))}

          {/* ── Halo central ── */}
          <div className="absolute rounded-full pointer-events-none"
            style={{
              width: 280, height: 280,
              background: 'radial-gradient(circle, rgba(93,123,255,0.07) 0%, transparent 70%)',
              animation: 'cr-halo 3s ease-in-out infinite',
            }}
          />

          {/* ── Contenu ── */}
          <div className="relative flex flex-col items-center gap-6 z-10">
            <img
              src="https://i.postimg.cc/L4WsWhk9/Design-sans-titre-(12).png"
              alt="Challenger IA"
              className="h-14 w-auto object-contain"
              style={{ filter: 'drop-shadow(0 0 12px rgba(93,123,255,0.4))', animation: 'cr-breathe 3s ease-in-out infinite' }}
            />

            {/* Ligne décorative sous le logo */}
            <div className="flex items-center gap-3 w-48">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#5D7BFF]/40" />
              <div className="w-1 h-1 bg-[#5D7BFF] opacity-60" style={{ transform: 'rotate(45deg)' }} />
              <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#5D7BFF]/40" />
            </div>

            <Loader2 className="w-4 h-4 animate-spin text-[#5D7BFF]" style={{ filter: 'drop-shadow(0 0 4px rgba(93,123,255,0.6))' }} />

            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/25">
              Vérification du compte…
            </p>
          </div>

        </div>
      )}

      {/* ── Écran de connexion / inscription ─────────────────────────────── */}
      {FIREBASE_ENABLED && !user && !authLoading && !consentPending && (
        <div className="flex-1 bg-[var(--bg-chat)] overflow-y-auto flex items-center justify-center p-6">
          <div className="w-full max-w-sm">

            {/* Logo */}
            <div className="text-center mb-8">
              <img
                src="https://i.postimg.cc/L4WsWhk9/Design-sans-titre-(12).png"
                alt="Challenger IA"
                className="h-14 w-auto mx-auto mb-3 object-contain"
              />
              <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-primary)]/40">
                Stariax Group — Challenger IA
              </p>
            </div>

            {/* Toggle Connexion / Créer un compte */}
            <div className="grid grid-cols-2 border-2 border-[var(--text-primary)]/15 mb-6">
              {(['login', 'signup'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => switchAuthMode(mode)}
                  className={cx(
                    'py-2.5 text-[9px] font-black uppercase tracking-widest transition-all',
                    authMode === mode
                      ? 'bg-[#5D7BFF] text-white'
                      : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/80'
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
                <label className="block text-[8px] font-black uppercase tracking-widest text-[var(--text-primary)]/50 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/40 pointer-events-none" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full bg-[var(--text-primary)]/[0.04] border-2 border-[var(--text-primary)]/15 focus:border-[#5D7BFF] rounded-xl pl-10 pr-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/35 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Mot de passe */}
              <div>
                <label className="block text-[8px] font-black uppercase tracking-widest text-[var(--text-primary)]/50 mb-1.5">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/40 pointer-events-none" />
                  <input
                    type={authShowPassword ? 'text' : 'password'}
                    required
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder={authMode === 'signup' ? '6 caractères minimum' : '••••••••'}
                    className="w-full bg-[var(--text-primary)]/[0.04] border-2 border-[var(--text-primary)]/15 focus:border-[#5D7BFF] rounded-xl pl-10 pr-10 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/35 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setAuthShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 transition-colors"
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
                    <label className="block text-[8px] font-black uppercase tracking-widest text-[var(--text-primary)]/50 mb-1.5">
                      Confirmer le mot de passe
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/40 pointer-events-none" />
                      <input
                        type={authShowPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        value={authConfirmPassword}
                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[var(--text-primary)]/[0.04] border-2 border-[var(--text-primary)]/15 focus:border-[#5D7BFF] rounded-xl pl-10 pr-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/35 focus:outline-none transition-colors"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Mot de passe oublié — connexion uniquement */}
              {authMode === 'login' && (
                <div className="flex justify-end -mt-1.5">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={authFormLoading}
                    className="text-[10px] font-bold text-[#5D7BFF] hover:text-[#4a68e8] disabled:opacity-40 transition-colors"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              )}

              {/* Confirmation (email de réinitialisation envoyé) */}
              <AnimatePresence>
                {authFormNotice && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 bg-[#5D7BFF]/10 border border-[#5D7BFF]/40 rounded-lg px-3 py-2.5"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#5D7BFF] flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-[#5D7BFF] leading-relaxed">{authFormNotice}</p>
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
                    className="flex items-start gap-2 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2.5"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-red-500 leading-relaxed">{authFormError}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bouton submit */}
              <button
                type="submit"
                disabled={authFormLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#5D7BFF] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#4a68e8] disabled:opacity-40 transition-all"
                style={{ boxShadow: '0 6px 16px rgba(93,123,255,0.18)' }}
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
              <div className="flex-1 h-px bg-[var(--text-primary)]/15" />
              <p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-primary)]/40">ou</p>
              <div className="flex-1 h-px bg-[var(--text-primary)]/15" />
            </div>

            {/* Google */}
            <button
              onClick={handleSignIn}
              disabled={authFormLoading}
              className="w-full flex items-center justify-center gap-3 py-3 bg-[var(--text-primary)]/[0.04] border-2 border-[var(--text-primary)]/15 hover:border-[var(--text-primary)]/35 hover:bg-[var(--text-primary)]/[0.08] text-[var(--text-primary)] disabled:opacity-40 transition-all"
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
              <p className="mt-3 text-center text-[8px] text-red-500">{authError}</p>
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
              'flex flex-col bg-[#141414] text-white border-r border-white/10',
              isMobile
                ? 'fixed inset-y-0 left-0 z-50 w-[280px] h-full overflow-y-auto'
                : 'flex-shrink-0 h-full overflow-hidden'
            )}
            style={isMobile ? undefined : { minWidth: 0 }}
          >
            {/* Logo */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
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
            <div className="px-5 py-4 border-b border-white/10 space-y-3">
              <button
                onClick={() => { startNewConv(); setSidebarOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#5D7BFF] text-white text-xs font-black uppercase tracking-widest hover:bg-[#4a68e8] transition-all active:scale-[0.98]"
                style={{ boxShadow: '0 4px 14px rgba(93,123,255,0.3)' }}
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
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-[11px] text-white/60 placeholder-white/20 focus:outline-none focus:border-[#5D7BFF]/50 focus:text-white/80 transition-colors"
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

              {/* ── Menu dépliable ── */}
              <div className="border-2 border-white/10 overflow-hidden">
                <button
                  onClick={() => setSidebarExtrasOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
                >
                  <span className="text-[11px] font-black uppercase tracking-widest">Navigation</span>
                  <motion.div animate={{ rotate: sidebarExtrasOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
                    <Plus className="w-4 h-4" />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {sidebarExtrasOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="border-t border-white/10 divide-y divide-white/5">
                        {/* Arène */}
                        <button
                          onClick={() => { setCurrentPage('arene'); setSidebarOpen(false); setSidebarExtrasOpen(false); }}
                          className="w-full flex items-center justify-between px-4 py-3 text-white/50 hover:text-white/80 hover:bg-[#5D7BFF]/5 transition-all"
                        >
                          <div className="flex items-center gap-2.5">
                            <Swords className="w-4 h-4" />
                            <span className="text-[11px] font-black uppercase tracking-widest">Arène</span>
                          </div>
                          <ChevronRight className="w-3 h-3 opacity-50" />
                        </button>

                        {/* Bibliothèque */}
                        <button
                          onClick={() => { setCurrentPage('outils'); setSidebarOpen(false); setSidebarExtrasOpen(false); }}
                          className="w-full flex items-center justify-between px-4 py-3 text-white/50 hover:text-white/80 hover:bg-[#5D7BFF]/5 transition-all"
                        >
                          <div className="flex items-center gap-2.5">
                            <BookOpen className="w-4 h-4" />
                            <span className="text-[11px] font-black uppercase tracking-widest">Bibliothèque</span>
                          </div>
                          <ChevronRight className="w-3 h-3 opacity-50" />
                        </button>

                        {/* Dark mode */}
                        <button
                          onClick={() => setDarkMode(d => !d)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
                        >
                          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                          <span className="text-[11px] font-medium">{darkMode ? 'Mode clair' : 'Mode sombre'}</span>
                        </button>

                        {/* Profil IA */}
                        <button
                          onClick={() => { setCurrentPage('settings'); setSidebarOpen(false); setSidebarExtrasOpen(false); }}
                          className="w-full flex items-center justify-between px-4 py-3 text-white/50 hover:text-white/80 hover:bg-[#5D7BFF]/5 transition-all"
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
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Outils épinglés ─────────────────────────────────────── */}
              {pinnedTools.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/25 px-1 mb-2">Outils épinglés</p>
                  {pinnedTools.map(toolId => {
                    const outil = OUTILS_MAP[toolId];
                    if (!outil) return null;
                    return (
                      <button
                        key={toolId}
                        onClick={() => { setOpenToolId(toolId); setCurrentPage('outils'); setSidebarOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 transition-all hover:bg-white/5"
                        style={{ borderLeft: `2px solid ${outil.accentColor}` }}
                      >
                        <img src={outil.logoSrc} alt={outil.name} className="w-6 h-6 object-contain flex-shrink-0" />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-[10px] font-black uppercase tracking-wide text-white/70 truncate">{outil.name}</p>
                          <p className="text-[8px] text-white/30 truncate">{outil.tagline}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

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
                            'w-full flex items-center gap-3 px-4 py-3 text-left rounded-xl border transition-all',
                            active
                              ? 'bg-[#5D7BFF] border-[#5D7BFF] text-white'
                              : 'bg-transparent border-white/10 text-white/50 hover:border-white/25 hover:text-white/80'
                          )}
                          style={
                            active ? { boxShadow: '0 6px 16px rgba(93,123,255,0.2)' } : {}
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
                        'py-2 px-1 text-center rounded-lg border transition-all',
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
                  style={{ boxShadow: '0 6px 16px rgba(93,123,255,0.1)' }}
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

      {/* ── Arène ─────────────────────────────────────────────────────────── */}
      {currentPage === 'arene' && (
        <div className="flex-1 min-w-0 h-full max-md:pb-16">
          <ArenaPage
            user={user}
            supabaseUserId={null}
            onBack={() => setCurrentPage('chat')}
          />
        </div>
      )}

      {/* ── Nos Outils Partenaires ──────────────────────────────────────────── */}
      {currentPage === 'outils' && (() => {
        // Mirror conversations so JournalismeApp can import them
        mirrorBaseChatConvs(conversations.map(c => ({
          id: c.id,
          title: c.title,
          messages: c.messages.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp.toISOString() })),
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })));
        return (
          <div className="flex-1 min-w-0 h-full max-md:pb-16">
            <OutilsPage
              onBack={() => { setCurrentPage('chat'); setOpenToolId(undefined); }}
              user={user}
              openToolId={openToolId}
            />
          </div>
        );
      })()}

      {/* ── Bibliothèque ────────────────────────────────────────────────────── */}
      {currentPage === 'library' && (
        <div className={cx('flex-1 min-w-0 h-full max-md:pb-16', currentPage !== 'library' && 'hidden')}>
          <LibraryPage
            onBack={() => setCurrentPage('chat')}
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
            subscription={subscription}
            dailyUsage={dailyUsage}
            weeklyUsage={weeklyUsage}
            userCredits={userCredits}
            totalCredits={totalCredits}
            user={user}
            autoUseCredits={autoUseCredits}
            onAutoUseCreditsChange={setAutoUseCredits}
          />
        </div>
      )}

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div
        className={cx('flex-1 flex flex-col min-w-0 h-full relative', currentPage !== 'chat' && 'hidden', 'max-md:pb-16')}
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          dragCounterRef.current += 1;
          setIsDragOver(true);
        }}
        onDragLeave={() => {
          dragCounterRef.current -= 1;
          if (dragCounterRef.current === 0) setIsDragOver(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dragCounterRef.current = 0;
          setIsDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {/* ── Overlay drag & drop ── */}
        <AnimatePresence>
          {isDragOver && (
            <motion.div
              key="drag-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-40 pointer-events-none flex flex-col items-center justify-center"
              style={{ background: 'rgba(93,123,255,0.08)', backdropFilter: 'blur(2px)' }}
            >
              {/* Bordure animée */}
              <div
                className="absolute inset-3"
                style={{
                  border: '2.5px dashed #5D7BFF',
                  opacity: 0.6,
                  animation: 'dash-border 0.5s linear infinite',
                }}
              />
              {/* Icône + texte */}
              <div className="flex flex-col items-center gap-4 z-10">
                <div
                  className="w-20 h-20 flex items-center justify-center"
                  style={{ background: 'rgba(93,123,255,0.12)', border: '2px solid rgba(93,123,255,0.4)' }}
                >
                  <Paperclip className="w-9 h-9 text-[#5D7BFF]" style={{ filter: 'drop-shadow(0 0 8px rgba(93,123,255,0.5))' }} />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-black uppercase tracking-widest text-[#5D7BFF]">Dépose tes fichiers ici</p>
                  <p className="text-[10px] text-[#5D7BFF]/60 mt-1 font-medium">Images · PDF · Word · Excel · Code · Texte</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {['image', 'pdf', 'doc', 'xlsx', 'code'].map((t) => (
                    <span key={t} className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 text-[#5D7BFF] border border-[#5D7BFF]/30 bg-[#5D7BFF]/5">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Top bar */}
        <div className="flex-shrink-0 bg-[var(--bg-chat)] border-b border-[var(--border)] px-6 py-4 flex items-center gap-4">
          {(!sidebarOpen || isMobile) && (
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="text-[#5D7BFF] hover:opacity-70 transition-opacity flex-shrink-0"
            >
              {sidebarOpen && isMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
          <div
            className="w-8 h-8 rounded-xl bg-[#5D7BFF] flex items-center justify-center flex-shrink-0"
            style={{ boxShadow: '0 4px 12px rgba(93,123,255,0.3)' }}
          >
            <CurrentIcon className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            {activeConv?.interviewType ? (() => {
              const ic = INTERVIEW_TYPES[activeConv.interviewType!];
              return (
                <>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] truncate">
                      {activeConv.interviewTitle ?? ic?.label}
                    </p>
                    <span className="flex-shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 text-white" style={{ backgroundColor: ic?.accentColor ?? '#94A3B8' }}>
                      INTERVIEW
                    </span>
                  </div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-primary)]/35">
                    {ic?.interviewerRole}
                  </p>
                </>
              );
            })() : activeConv?.debatePersonaId ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] truncate">
                    Débat — {getDP(activeConv)?.name}
                  </p>
                  <span className="flex-shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-[#5D7BFF] text-white">
                    DÉBAT
                  </span>
                </div>
                <p className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-primary)]/35">
                  {getDP(activeConv)?.title}
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] truncate">
                  {PERSONAS[persona].name}
                </p>
                <p className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-primary)]/35">
                  Mode {FRICTION[level].label} — {FRICTION[level].hint}
                </p>
              </>
            )}
          </div>
          {activeConv && activeConv.messages.length > 0 && (
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              {/* Bouton partager la conversation */}
              {FIREBASE_ENABLED && (
                <button
                  onClick={async () => {
                    if (!activeConv) return;
                    setShareLoading(true);
                    const shareId = await fsShareConversation(activeConv);
                    setShareLoading(false);
                    if (shareId) {
                      const url = `${window.location.origin}${window.location.pathname}?share=${shareId}`;
                      setShareLink(url);
                    }
                  }}
                  disabled={shareLoading}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#5D7BFF]/20 hover:border-[#5D7BFF]/60 hover:bg-[#5D7BFF]/5 transition-all text-[var(--text-primary)]/40 hover:text-[#5D7BFF] disabled:opacity-40"
                  title="Partager cette conversation"
                >
                  {shareLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                  <span className="text-[8px] font-black uppercase tracking-widest hidden sm:inline">Partager</span>
                </button>
              )}
              <button
                onClick={startNewConv}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#5D7BFF]/20 hover:border-[#5D7BFF] hover:bg-[#5D7BFF]/5 transition-all text-[var(--text-primary)]/40 hover:text-[#5D7BFF]"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="text-[8px] font-black uppercase tracking-widest">Nouvelle</span>
              </button>
            </div>
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
                <div className="pointer-events-auto w-full max-w-xs bg-[#141414] border border-[#5D7BFF]/25 rounded-2xl p-6 flex flex-col items-center gap-5" style={{ boxShadow: '0 12px 32px rgba(93,123,255,0.25)' }}>
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

        {/* ── Modal lien de partage ───────────────────────────────────────── */}
        <AnimatePresence>
          {shareLink && (
            <>
              <motion.div
                key="sharelink-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                onClick={() => { setShareLink(null); setShareLinkCopied(false); }}
              />
              <motion.div
                key="sharelink-modal"
                initial={{ opacity: 0, scale: 0.92, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 16 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
              >
                <div className="pointer-events-auto w-full max-w-sm bg-[#141414] border border-[#5D7BFF]/25 rounded-2xl p-6 space-y-5"
                  style={{ boxShadow: '0 12px 32px rgba(93,123,255,0.2)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-[#5D7BFF]" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/60">Conversation partagée</p>
                    </div>
                    <button onClick={() => { setShareLink(null); setShareLinkCopied(false); }} className="text-white/30 hover:text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 mb-2">Lien de partage (lecture seule) :</p>
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2">
                      <Link className="w-3 h-3 text-[#5D7BFF]/60 flex-shrink-0" />
                      <span className="text-[9px] text-white/50 truncate flex-1">{shareLink}</span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const ok = await copyToClipboard(shareLink);
                      if (ok) setShareLinkCopied(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[#5D7BFF] hover:bg-[#4a68e8] transition-colors text-white text-[9px] font-black uppercase tracking-widest active:scale-95"
                  >
                    {shareLinkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {shareLinkCopied ? 'Lien copié !' : 'Copier le lien'}
                  </button>
                  <p className="text-[8px] text-white/20 text-center">Accessible à toute personne ayant le lien · Pas d'inscription requise</p>
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
          {creditsSuccess && (
            <motion.div
              key="credits-success"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-3 border-b-2"
              style={{ background: '#F59E0B', borderColor: '#d97706' }}
            >
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-white flex-shrink-0" />
                <p className="text-[11px] font-black uppercase tracking-widest text-white">
                  Crédits ajoutés ! Solde mis à jour — {userCredits} crédit{userCredits !== 1 ? 's' : ''} disponible{userCredits !== 1 ? 's' : ''}.
                </p>
              </div>
              <button onClick={() => setCreditsSuccess(false)} className="text-white/50 hover:text-white transition-colors flex-shrink-0">
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
            ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-2xl mx-auto flex flex-col px-4 py-4 md:px-10 md:py-12 overflow-y-auto"
            >
              {/* ── En-tête ── */}
              <div className="flex items-center gap-3 md:gap-5 mb-4 md:mb-8">
                <div
                  className="flex-shrink-0 w-9 h-9 md:w-14 md:h-14 rounded-2xl bg-[#5D7BFF] flex items-center justify-center"
                  style={{ boxShadow: '0 6px 18px rgba(93,123,255,0.35)' }}
                >
                  <CurrentIcon className="w-4 h-4 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base md:text-2xl font-black uppercase tracking-tight text-[var(--text-primary)] leading-none">
                    {PERSONAS[persona].name}
                  </h1>
                  <p className="text-[10px] md:text-[12px] text-[var(--text-primary)]/45 mt-0.5 md:mt-1.5">
                    <span className="font-bold text-[#5D7BFF]">{PERSONAS[persona].shortName}</span>
                    {' '}· Mode <span className="font-bold">{FRICTION[level].label.toLowerCase()}</span>
                    {' '}— {FRICTION[level].hint}
                  </p>
                </div>
                {!user && FIREBASE_ENABLED && (
                  <div className="ml-auto flex-shrink-0 flex items-center gap-1 text-[var(--text-primary)]/20">
                    <CloudOff className="w-3 h-3" />
                  </div>
                )}
              </div>

              {/* ── Défi quotidien ── */}
              {!challengeRewarded ? (
                <button
                  onClick={() => {
                    setInput(dailyChallenge.prompt);
                    taRef.current?.focus();
                  }}
                  className="w-full text-left p-3 md:p-5 mb-3 md:mb-6 rounded-2xl border border-[#5D7BFF]/20 bg-[#5D7BFF]/5 hover:bg-[#5D7BFF]/10 transition-all group"
                >
                  <div className="flex items-center gap-2.5 md:gap-4">
                    <span className="text-base md:text-2xl flex-shrink-0">🎯</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 md:mb-1">
                        <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[#5D7BFF]">Défi du jour</span>
                        <span className="text-[8px] md:text-[9px] px-1 py-px bg-[#5D7BFF]/10 text-[#5D7BFF] font-bold">+1 crédit</span>
                        <span className="text-[8px] text-[var(--text-primary)]/30 ml-auto">{challengeProgress}/3</span>
                      </div>
                      <p className="text-[11px] md:text-[14px] font-bold text-[var(--text-primary)] leading-snug truncate">{dailyChallenge.title}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 md:w-5 md:h-5 text-[#5D7BFF]/40 group-hover:text-[#5D7BFF] transition-colors flex-shrink-0" />
                  </div>
                  <div className="mt-2 md:mt-3 h-px bg-[#5D7BFF]/10 overflow-hidden">
                    <div className="h-full bg-[#5D7BFF] transition-all duration-500"
                      style={{ width: `${Math.min(100, (challengeProgress / 3) * 100)}%` }} />
                  </div>
                </button>
              ) : (
                <div className="mb-3 md:mb-6 p-2.5 md:p-4 border border-[#10B981]/20 bg-[#10B981]/5 flex items-center gap-2.5">
                  <span className="text-sm md:text-xl">🏆</span>
                  <div>
                    <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[#10B981]">Défi complété !</p>
                    <p className="text-[9px] md:text-[10px] text-[var(--text-primary)]/40">Revenez demain pour un nouveau défi.</p>
                  </div>
                </div>
              )}

              {/* ── Suggestions ── */}
              <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/25 text-center mb-2 md:mb-4">
                Suggestions
              </p>
              <div className="space-y-2 md:space-y-3">
                {SUGGESTIONS[persona].map((s, i) => {
                  const SIcon = s.icon;
                  return (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      onClick={() => send(s.text)}
                      disabled={sending}
                      className="w-full text-left px-4 py-3 md:px-6 md:py-4 bg-[var(--bg-chat)] border-2 border-[#5D7BFF]/15 hover:border-[#5D7BFF] hover:shadow-[3px_3px_0px_0px_rgba(93,123,255,1)] transition-all group disabled:opacity-40"
                    >
                      <div className="flex items-start gap-3 md:gap-4">
                        <SIcon className="w-4 h-4 md:w-5 md:h-5 text-[#5D7BFF] opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                        <p className="text-sm md:text-[15px] font-medium text-[var(--text-primary)] group-hover:text-[#5D7BFF] transition-colors leading-snug">
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

                // Couleur du persona (chat normal) — accent visuel par message
                const pColor = PERSONAS[msg.persona ?? persona].color;

                // ── Styles selon mode
                const bubbleBg = (isInterview || isDebate) ? 'border-2'
                  : isUser
                    ? 'bg-[var(--bg-chat)] border-2 border-[#5D7BFF]/25 rounded-2xl'
                    : 'border rounded-2xl';

                const bubbleStyle = isInterview
                  ? isUser
                    ? { background: `${ic!.accentColor}12`, borderColor: `${ic!.accentColor}35`, boxShadow: `0 0 20px ${ic!.accentColor}08` }
                    : { background: 'rgba(255,255,255,0.04)', borderColor: `${ic!.accentColor}25`, borderLeftWidth: '3px', borderLeftColor: ic!.accentColor, boxShadow: `0 0 20px ${ic!.accentColor}10` }
                  : isDebate
                    ? isUser
                      ? { background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(74,222,128,0.25)', boxShadow: '0 0 20px rgba(34,197,94,0.08)' }
                      : { background: 'rgba(20,12,12,0.8)', borderColor: `${dp?.color ?? '#EF4444'}40`, borderLeftWidth: '3px', borderLeftColor: dp?.color ?? '#EF4444', boxShadow: `0 0 20px ${dp?.color ?? '#EF4444'}15` }
                    : isUser
                      ? { boxShadow: '0 6px 16px rgba(93,123,255,0.15)' }
                      // Réponse IA : carte gris très clair, bordure teintée persona, ombre douce
                      : { background: '#f5f6f8', borderColor: `${pColor}30`, boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 24px rgba(16,24,40,0.06)' };

                return (
                <React.Fragment key={msg.id}>
                  {showMemoryDivider && (
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex-1 border-t border-dashed border-current opacity-20" />
                      <p className={cx(
                        'text-[8px] font-black uppercase tracking-widest flex items-center gap-1',
                        (isInterview || isDebate) ? 'text-white/30' : 'text-[var(--text-primary)]/30'
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
                    className={cx('max-w-[78%]', bubbleBg)}
                    style={bubbleStyle}
                  >
                    <div
                      className={cx(
                        'px-3 py-1 border-b flex items-center justify-between gap-4',
                        (isInterview || isDebate) ? 'border-white/5'
                          : isUser ? 'border-[#5D7BFF]/10' : 'border-[#e6e8ec]'
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {!isUser && isInterview && ic && (() => {
                          const IIcon = ic.icon;
                          return <IIcon className="w-2.5 h-2.5" style={{ color: `${ic.accentColor}90` }} />;
                        })()}
                        {!isUser && !isInterview && !isDebate && (() => {
                          const MsgIcon = PERSONAS[msg.persona ?? persona].icon;
                          return <MsgIcon className="w-2.5 h-2.5" style={{ color: pColor }} />;
                        })()}
                        {!isUser && !isInterview && isDebate && dp && (
                          <span className="text-[10px]">{dp.flag}</span>
                        )}
                        <p
                          className={cx(
                            'text-[8px] font-black uppercase tracking-widest',
                            (isInterview || isDebate)
                              ? isUser ? 'text-white/30' : 'text-white/50'
                              : isUser ? 'text-[var(--text-primary)]/30' : ''
                          )}
                          style={!isUser && !isInterview && !isDebate ? { color: pColor } : undefined}
                        >
                          {isUser ? 'Vous'
                            : isInterview && ic ? ic.interviewerRole
                            : isDebate && dp ? dp.shortName
                            : PERSONAS[msg.persona ?? persona].shortName}
                        </p>
                        {!isUser && !isInterview && !isDebate && msg.level && (
                          <span className="text-[6px] font-black uppercase tracking-widest text-[#6b7280] border border-[#dcdfe4] px-1 py-px rounded-sm">
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
                        (isInterview || isDebate) ? 'text-white/20' : isUser ? 'text-[var(--text-primary)]/25' : 'text-[#9aa0ac]'
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
                                  ? 'bg-[var(--bg-chat)] border-[#5D7BFF]/20 text-[var(--text-primary)]'
                                  : 'bg-white/10 border-white/20 text-white'
                              )}
                            >
                              <AttIcon className={cx('w-3.5 h-3.5 flex-shrink-0', msg.role === 'user' ? 'text-[#5D7BFF]' : 'text-white/70')} />
                              <div className="min-w-0">
                                <p className="text-[9px] font-black truncate max-w-[120px]">{att.name}</p>
                                <p className={cx('text-[7px]', msg.role === 'user' ? 'text-[var(--text-primary)]/40' : 'text-white/40')}>{fmtBytes(att.size)}</p>
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
                          const raw = isLong && isCollapsed ? msg.content.slice(0, 300) + '…' : msg.content;
                          // Citations [n] cliquables uniquement si des sources sont présentes
                          const displayed = msg.sources?.length ? linkifyCitations(raw, msg.sources.length) : raw;
                          const isCopied = copiedMsgId === msg.id;
                          return (
                            <>
                              <RichContent text={displayed} components={(isInterview || isDebate) ? mdWhite : mdLight} streaming={sending && msgIdx === activeConv.messages.length - 1} />
                              {msg.sources?.length ? <SourcesPanel sources={msg.sources} /> : null}
                              <div className="flex items-center gap-2 mt-2">
                                {isLong && (
                                  <button
                                    onClick={() => setCollapsedMsgs(s => {
                                      const n = new Set(s);
                                      isCollapsed ? n.delete(msg.id) : n.add(msg.id);
                                      return n;
                                    })}
                                    className={cx('text-[8px] font-black uppercase tracking-widest border px-2 py-0.5 transition-all rounded-sm',
                                      (isInterview || isDebate)
                                        ? 'text-white/35 hover:text-white/70 border-white/15 hover:border-white/35'
                                        : 'text-[#9aa0ac] hover:text-[#374151] border-[#dcdfe4] hover:border-[#9ca3af]')}
                                  >
                                    {isCollapsed ? '▼ Voir tout' : '▲ Condenser'}
                                  </button>
                                )}
                                <button
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(stripViz(msg.content));
                                    playCopy();
                                    setCopiedMsgId(msg.id);
                                    setTimeout(() => setCopiedMsgId(null), 2000);
                                  }}
                                  className={cx('flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest border px-2 py-0.5 transition-all rounded-sm',
                                    (isInterview || isDebate)
                                      ? 'text-white/25 hover:text-white/60 border-white/10 hover:border-white/30'
                                      : 'text-[#9aa0ac] hover:text-[#374151] border-[#e0e2e7] hover:border-[#9ca3af]')}
                                  title="Copier la réponse"
                                >
                                  {isCopied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                                  {isCopied ? 'Copié !' : 'Copier'}
                                </button>
                                {FIREBASE_ENABLED && user && (() => {
                                  const prevUserMsg = activeConv.messages.slice(0, msgIdx).reverse().find(m => m.role === 'user');
                                  if (!prevUserMsg) return null;
                                  const pName = activeConv.debatePersonaId
                                    ? (getDP(activeConv)?.shortName ?? PERSONAS[msg.persona ?? persona].shortName)
                                    : PERSONAS[msg.persona ?? persona].shortName;
                                  return (
                                    <button
                                      onClick={() => setPropulseData({ question: prevUserMsg.content, aiResponse: msg.content, personaName: pName })}
                                      className={cx('flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest border px-2 py-0.5 transition-all ml-auto rounded-sm',
                                        (isInterview || isDebate)
                                          ? 'text-white/20 hover:text-[#FBBF24]/80 border-white/8 hover:border-[#FBBF24]/30'
                                          : 'text-[#9aa0ac] hover:text-[#b8860b] border-[#e6e8ec] hover:border-[#FBBF24]/50')}
                                      title="Propulser dans l'Arène"
                                    >
                                      <Rocket className="w-2.5 h-2.5" />
                                      Arène
                                    </button>
                                  );
                                })()}
                              </div>
                            </>
                          );
                        })() : (
                          <p className={cx(
                            'text-sm leading-relaxed whitespace-pre-wrap',
                            (isInterview || isDebate) ? 'text-white/80' : 'text-[var(--text-primary)]'
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
                          : { boxShadow: '0 6px 16px rgba(20,20,20,0.12)' }}
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
                    style={{ boxShadow: '0 6px 16px rgba(239,68,68,0.2)' }}
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

        {/* ── Notification in-chat (quota / crédits) ── */}
        <AnimatePresence>
          {chatNotif && (
            <motion.div
              key="chat-notif"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-2.5 border-t"
              style={{
                background: chatNotif.type === 'error' ? '#FEF2F2' : chatNotif.type === 'warning' ? '#FFFBEB' : '#EFF6FF',
                borderColor: chatNotif.type === 'error' ? '#FCA5A5' : chatNotif.type === 'warning' ? '#FCD34D' : '#BFDBFE',
              }}
            >
              <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-[10px] font-bold leading-relaxed"
                  style={{ color: chatNotif.type === 'error' ? '#DC2626' : chatNotif.type === 'warning' ? '#D97706' : '#2563EB' }}>
                  {chatNotif.msg}
                </p>
                {chatNotif.action && (
                  <button
                    onClick={() => { setCurrentPage('settings'); setChatNotif(null); }}
                    className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border flex-shrink-0 hover:opacity-80 transition-opacity"
                    style={{
                      color: chatNotif.type === 'error' ? '#DC2626' : '#D97706',
                      borderColor: chatNotif.type === 'error' ? '#DC262640' : '#D9770640',
                      background: chatNotif.type === 'error' ? '#FEF2F2' : '#FFFBEB',
                    }}
                  >
                    {chatNotif.action.label}
                  </button>
                )}
              </div>
              <button onClick={() => setChatNotif(null)} className="flex-shrink-0 opacity-40 hover:opacity-70 transition-opacity">
                <X className="w-3 h-3" style={{ color: chatNotif.type === 'error' ? '#DC2626' : chatNotif.type === 'warning' ? '#D97706' : '#2563EB' }} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Question interactive IA ────────────────────────────────────── */}
        <AnimatePresence>
          {activeQuestion && (
            <motion.div
              key="cia-question"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="flex-shrink-0 px-6 py-4 border-t-2 border-[#5D7BFF]/25 bg-[#5D7BFF]/8"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 bg-[#5D7BFF] flex items-center justify-center mt-0.5">
                  <Zap className="w-3 h-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#5D7BFF] mb-1">Challenger demande</p>
                  <p className="text-[12px] font-semibold text-[var(--text-primary)] mb-3 leading-snug">{activeQuestion.q}</p>

                  {activeQuestion.type === 'choice' && activeQuestion.options && (
                    <div className="flex flex-wrap gap-2">
                      {activeQuestion.options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            setActiveQuestion(null);
                            send(opt);
                          }}
                          className="px-3 py-1.5 border-2 border-[#5D7BFF]/30 bg-[var(--bg-chat)] hover:bg-[#5D7BFF] hover:text-white hover:border-[#5D7BFF] transition-all text-[11px] font-bold text-[var(--text-primary)] active:scale-95"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {activeQuestion.type === 'text' && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={questionTextInput}
                        onChange={(e) => setQuestionTextInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && questionTextInput.trim()) {
                            setActiveQuestion(null);
                            send(questionTextInput.trim());
                            setQuestionTextInput('');
                          }
                        }}
                        placeholder={activeQuestion.placeholder ?? 'Votre réponse…'}
                        className="flex-1 border-2 border-[#5D7BFF]/30 bg-[var(--bg-chat)] px-3 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/30 focus:outline-none focus:border-[#5D7BFF]"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (!questionTextInput.trim()) return;
                          setActiveQuestion(null);
                          send(questionTextInput.trim());
                          setQuestionTextInput('');
                        }}
                        disabled={!questionTextInput.trim()}
                        className="px-4 py-2 bg-[#5D7BFF] hover:bg-[#4a68e8] disabled:opacity-40 transition-colors text-white"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setActiveQuestion(null)}
                  className="flex-shrink-0 text-[var(--text-primary)]/25 hover:text-[var(--text-primary)]/60 transition-colors mt-0.5"
                  title="Ignorer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Confirmation utiliser crédits ── */}
        <AnimatePresence>
          {pendingCreditSend && (
            <motion.div
              key="credit-confirm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex-shrink-0 px-6 py-4 border-t-2 border-[#F59E0B]/30 bg-[#FFFBEB]"
            >
              <div className="flex items-start gap-3">
                <Coins className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[11px] font-black text-[var(--text-primary)]">Votre cerveau a besoin de repos — pas votre ambition.</p>
                  <p className="text-[10px] text-[var(--text-primary)]/60 mt-0.5 leading-relaxed">
                    Quota gratuit épuisé. La joute intellectuelle peut continuer sur vos crédits.&nbsp;
                    <span className="font-bold text-[#F59E0B]">{userCredits} crédit{userCredits !== 1 ? 's' : ''} disponible{userCredits !== 1 ? 's' : ''}</span> — confirmez-vous ?
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        const { text: t, attachments: a } = pendingCreditSend;
                        setPendingCreditSend(null);
                        creditConfirmedRef.current = true;
                        send(t, a);
                      }}
                      className="px-4 py-1.5 bg-[#F59E0B] text-white text-[9px] font-black uppercase tracking-widest hover:bg-[#D97706] transition-colors"
                      style={{ boxShadow: '0 6px 16px rgba(217,119,6,0.3)' }}
                    >
                      Oui, utiliser mes crédits
                    </button>
                    <button
                      onClick={() => setPendingCreditSend(null)}
                      className="px-4 py-1.5 border-2 border-[var(--border)] text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/50 hover:border-[#5D7BFF]/30 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div
          className={cx(
            'flex-shrink-0 border-t px-6 py-4 transition-colors',
            (activeConv?.interviewType || activeConv?.debatePersonaId)
              ? 'bg-[#0d0f1a] border-t-2 border-t-0'
              : 'bg-[var(--bg-chat)] border-[var(--border)]'
          )}
          style={activeConv?.interviewType
            ? { borderTop: `2px solid ${INTERVIEW_TYPES[activeConv.interviewType]?.accentColor ?? '#5D7BFF'}40` }
            : activeConv?.debatePersonaId
              ? { borderTop: `2px solid ${getDP(activeConv)?.color ?? '#5D7BFF'}` }
              : undefined}
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
                      className="flex items-center gap-2 bg-[var(--bg-chat)] border-2 border-[#5D7BFF]/20 px-2 py-1.5 group"
                    >
                      {att.type === 'image' ? (
                        <img src={att.content} alt={att.name} className="h-8 w-8 object-cover border border-[#5D7BFF]/20" />
                      ) : (
                        <Icon className="w-4 h-4 text-[#5D7BFF] flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-[var(--text-primary)] truncate max-w-[120px]">{att.name}</p>
                        <p className="text-[7px] text-[var(--text-primary)]/40">{fmtBytes(att.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingAttachments((p) => p.filter((a) => a.id !== att.id))}
                        className="text-[var(--text-primary)]/25 hover:text-red-500 transition-colors ml-1"
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
                      : 'bg-[var(--bg-chat)] border-[#5D7BFF]/25'
                  )}
                  style={{ boxShadow: '0 6px 16px rgba(20,20,20,0.12)' }}
                >
                  <p className={cx(
                    'text-[8px] font-black uppercase tracking-widest px-3 pt-2.5 pb-1',
                    (activeConv?.interviewType || activeConv?.debatePersonaId) ? 'text-white/25' : 'text-[var(--text-primary)]/25'
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
                              : 'bg-transparent border-[var(--border)] hover:bg-[var(--bg-chat)]'
                        )}
                      >
                        <CmdIcon className={cx(
                          'w-4 h-4 flex-shrink-0',
                          isDark ? (isSelected ? 'text-white/80' : 'text-white/30') : (isSelected ? 'text-[#5D7BFF]' : 'text-[var(--text-primary)]/30')
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className={cx(
                            'text-xs font-bold',
                            isDark ? (isSelected ? 'text-white' : 'text-white/60') : (isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70')
                          )}>
                            {cmd.label}
                            {cmd.id === 'noprofil' && (activeConv?.noProfile || noProfileMode) && (
                              <span className="ml-2 text-[8px] font-black text-amber-500">ACTIF</span>
                            )}
                            {cmd.id === 'resumepdf' && resumeGenerating && (
                              <span className="ml-2 text-[8px] font-black text-[#5D7BFF]">EN COURS…</span>
                            )}
                          </p>
                          <p className={cx('text-[10px]', isDark ? 'text-white/25' : 'text-[var(--text-primary)]/40')}>
                            {cmd.id === 'resumepdf' && resumeGenerating ? 'Génération en cours, patiente…' : cmd.desc}
                          </p>
                        </div>
                        {cmd.id === 'resumepdf' && resumeGenerating ? (
                          <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin text-[#5D7BFF]" />
                        ) : (
                        <span className={cx(
                          'flex-shrink-0 text-[9px] font-mono px-1.5 py-0.5 border',
                          isDark ? 'text-white/20 border-white/10' : 'text-[var(--text-primary)]/25 border-[var(--border)]'
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
                    ? 'border-[#5D7BFF]/20 text-[var(--text-primary)]/40 hover:border-[#5D7BFF] hover:text-[#5D7BFF]'
                    : 'border-[var(--border)] text-[var(--text-primary)]/25 hover:border-[#5D7BFF]/40 hover:text-[#5D7BFF]/60'
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
                    'flex-shrink-0 p-3 border-2 rounded-xl disabled:opacity-40 transition-all font-black text-sm flex',
                    slashOpen
                      ? 'border-[#5D7BFF] text-[#5D7BFF] bg-[#5D7BFF]/8'
                      : (activeConv?.interviewType || activeConv?.debatePersonaId)
                        ? 'border-white/10 text-white/30 hover:border-white/30 hover:text-white/60'
                        : 'border-[#5D7BFF]/20 text-[var(--text-primary)]/30 hover:border-[#5D7BFF] hover:text-[#5D7BFF]'
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
                    'w-full border-2 rounded-xl px-4 text-[16px] md:text-sm font-medium focus:outline-none resize-none transition-all leading-normal',
                    isMobile && !inputFocused ? 'py-2.5' : 'py-3',
                    (activeConv?.interviewType || activeConv?.debatePersonaId)
                      ? 'bg-[#1a1d2e] border-white/10 focus:border-white/25 text-white placeholder:text-white/25'
                      : 'bg-[var(--bg-chat)] border-[#5D7BFF]/20 focus:border-[#5D7BFF] text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/30'
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
                  <p className="absolute bottom-2 right-3 text-[7px] font-mono text-[var(--text-primary)]/15 pointer-events-none select-none hidden sm:block">
                    ↵ envoyer &middot; Shift+↵ saut
                  </p>
                )}
              </div>

              {/* Envoyer */}
              <button
                type="submit"
                disabled={sending || (!input.trim() && pendingAttachments.length === 0)}
                className="flex-shrink-0 bg-[#5D7BFF] text-white px-5 py-3 rounded-xl hover:bg-[#4a68e8] disabled:opacity-40 transition-all active:scale-95"
                style={{ boxShadow: '0 4px 14px rgba(93,123,255,0.35)' }}
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </form>

            {/* Disclaimer IA */}
            <p className="text-center text-[8px] text-[var(--text-primary)]/20 pointer-events-none select-none tracking-wide mt-2 hidden sm:block">
              Challenger IA peut se tromper — vérifiez les informations importantes
            </p>

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
          { icon: Swords, label: 'Arène', action: () => { setCurrentPage('arene'); setSidebarOpen(false); }, active: currentPage === 'arene' },
          { icon: BookOpen, label: 'Bibliothèque', action: () => { setCurrentPage('outils'); setSidebarOpen(false); }, active: currentPage === 'outils' },
          { icon: Settings, label: 'Profil', action: () => { setCurrentPage('settings'); setSidebarOpen(false); }, active: currentPage === 'settings' },
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

      {/* ── Propulsion modale ────────────────────────────────────────────── */}
      <AnimatePresence>
        {propulseData && user && (
          <PropulseModal
            user={user}
            question={propulseData.question}
            aiResponse={propulseData.aiResponse}
            personaName={propulseData.personaName}
            onClose={() => setPropulseData(null)}
            onSuccess={() => { setPropulseData(null); setCurrentPage('arene'); }}
          />
        )}
      </AnimatePresence>

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
                    style={{ boxShadow: '0 6px 16px rgba(93,123,255,0.25)' }}
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
              className="bg-[#141414] border border-[#5D7BFF]/25 rounded-2xl w-full max-w-md overflow-hidden"
              style={{ boxShadow: '0 6px 16px rgba(93,123,255,0.3)' }}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b-2 border-white/10">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-9 h-9 bg-[#5D7BFF] flex items-center justify-center flex-shrink-0"
                    style={{ boxShadow: '0 6px 16px rgba(255,255,255,0.08)' }}
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
                  style={{ boxShadow: consentCgu ? '0 6px 16px rgba(255,255,255,0.08)' : 'none' }}
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
              className="bg-[#141414] border border-[#5D7BFF]/25 rounded-2xl w-full max-w-sm overflow-hidden"
              style={{ boxShadow: '0 6px 16px rgba(93,123,255,0.25)' }}
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
                        {upgradeModal === 'limit' && (subscription === 'pro' ? `Limite Pro de ${PRO_DAILY_LIMIT} msg/jour atteinte — achetez des crédits` : `Limite de ${FREE_DAILY_LIMIT} msg/jour atteinte`)}
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
                  style={{ boxShadow: '0 6px 16px rgba(255,255,255,0.08)' }}
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

      {/* ── Modal Préparation Express ────────────────────────────────────── */}
      <AnimatePresence>
        {preparationOpen && (
          <motion.div
            key="prep-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(10,10,10,0.82)' }}
            onClick={() => { if (!preparationLoading) { setPreparationOpen(false); setPreparationPlan(null); setPreparationError(null); } }}
          >
            <motion.div
              key="prep-card"
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="bg-[#0e1018] border border-[#5D7BFF]/25 rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto"
              style={{ boxShadow: '0 6px 16px rgba(93,123,255,0.25)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b-2 border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Hourglass size={20} className="text-[#5D7BFF]" />
                  <div>
                    <h2 className="text-[14px] font-black uppercase tracking-widest text-white">Préparation express</h2>
                    <p className="text-[10px] text-white/40 mt-0.5">Décris une situation — l'IA construit ton plan d'entraînement.</p>
                  </div>
                </div>
                <button
                  onClick={() => { if (!preparationLoading) { setPreparationOpen(false); setPreparationPlan(null); setPreparationError(null); } }}
                  className="text-white/30 hover:text-white/60 transition-colors"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {!preparationPlan && (
                  <>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-2">Sujet ou situation</label>
                      <textarea
                        value={preparationSubject}
                        onChange={(e) => setPreparationSubject(e.target.value)}
                        placeholder="Ex : Entretien Product Manager chez Google dans 2h — focus sur les case studies et le leadership."
                        rows={3}
                        maxLength={800}
                        disabled={preparationLoading}
                        className="w-full px-3 py-2 bg-black/40 border-2 border-white/10 focus:border-[#5D7BFF] outline-none text-white text-[13px] resize-none"
                      />
                      <p className="text-[9px] text-white/30 mt-1 text-right">{preparationSubject.length}/800</p>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-2">Délai (optionnel)</label>
                      <input
                        value={preparationDuration}
                        onChange={(e) => setPreparationDuration(e.target.value)}
                        placeholder="Ex : 2h, demain matin, vendredi prochain…"
                        maxLength={100}
                        disabled={preparationLoading}
                        className="w-full px-3 py-2 bg-black/40 border-2 border-white/10 focus:border-[#5D7BFF] outline-none text-white text-[13px]"
                      />
                    </div>

                    {preparationError && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border-2 border-red-500/40 text-red-300 text-[11px]">
                        <AlertCircle size={14} />
                        <span>{preparationError}</span>
                      </div>
                    )}

                    <button
                      onClick={runPreparation}
                      disabled={preparationLoading || !preparationSubject.trim()}
                      className="w-full py-3 bg-[#5D7BFF] hover:bg-[#7290FF] disabled:bg-white/10 disabled:text-white/30 text-white text-[11px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                    >
                      {preparationLoading ? (
                        <><Loader2 size={14} className="animate-spin" /> Construction du plan…</>
                      ) : (
                        <><Sparkles size={14} /> Générer mon plan</>
                      )}
                    </button>
                  </>
                )}

                {preparationPlan && (
                  <>
                    <div className="px-3 py-2 bg-[#5D7BFF]/10 border-l-4 border-[#5D7BFF]">
                      <p className="text-[10px] uppercase tracking-widest text-[#5D7BFF] mb-1">Enjeu</p>
                      <p className="text-[12px] text-white/85 leading-snug">{preparationPlan.summary}</p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">3 personas recommandés</p>
                      <div className="space-y-2">
                        {preparationPlan.personas.slice(0, 3).map((p, idx) => (
                          <div key={idx} className="px-3 py-2 bg-white/5 border-l-4 border-white/30">
                            <p className="text-[12px] text-white font-bold">{p.name}{p.debateId ? <span className="text-white/40 font-normal"> · {p.debateId}</span> : null}</p>
                            <p className="text-[11px] text-white/60 mt-0.5 leading-snug">{p.rationale}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Niveau de friction suggéré</p>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-[#5D7BFF] text-white text-[11px] font-black uppercase tracking-widest">
                          {preparationPlan.friction}
                        </span>
                        <span className="text-[11px] text-white/60">{preparationPlan.frictionRationale}</span>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">5 questions probables</p>
                      <ul className="space-y-1.5">
                        {preparationPlan.likelyQuestions.slice(0, 5).map((q, idx) => (
                          <li key={idx} className="flex gap-2 text-[12px] text-white/80">
                            <span className="text-[#5D7BFF] font-bold">{idx + 1}.</span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {preparationPlan.suggestedAngles?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Angles à préparer</p>
                        <ul className="space-y-1.5">
                          {preparationPlan.suggestedAngles.map((a, idx) => (
                            <li key={idx} className="text-[11px] text-white/70">→ {a}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={() => {
                          setPreparationPlan(null);
                          setPreparationSubject('');
                          setPreparationDuration('');
                        }}
                        className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest transition-colors"
                      >
                        Nouveau plan
                      </button>
                      <button
                        onClick={() => {
                          setPreparationOpen(false);
                          setPreparationPlan(null);
                          setPreparationSubject('');
                          setPreparationDuration('');
                        }}
                        className="flex-1 py-2 bg-[#5D7BFF] hover:bg-[#7290FF] text-white text-[10px] font-black uppercase tracking-widest transition-colors"
                      >
                        Fermer
                      </button>
                    </div>
                  </>
                )}
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
              className="bg-[#141414] border border-red-500/40 rounded-2xl w-full max-w-md overflow-hidden"
              style={{ boxShadow: '0 6px 16px rgba(239,68,68,0.35)' }}
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
