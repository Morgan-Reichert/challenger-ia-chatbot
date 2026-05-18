import {
  useState, useRef, useCallback, useEffect, KeyboardEvent,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Send, Loader2, X, Sparkles, Paperclip, Mic, MicOff,
  Search, AlertTriangle, FileText, Scale, Eye, Zap, Target, RotateCcw,
  Star, Eraser, UserMinus, FileDown, Copy, Slash, ChevronDown, ChevronRight,
  ImageIcon, FileCode, File, FileSpreadsheet, Plus, FolderPlus, Folder,
  FolderOpen, Pin, PinOff, MessageSquare, MoreVertical, Trash2, Edit3,
  Check, Import, Lock,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  useOutilSessions,
  type OutilSession,
  type OutilProject,
  type OutilSessionMsg,
} from './useOutilSessions';
import { apiFetch } from '../apiClient';

function cx(...c: (string | boolean | undefined | null)[]) { return c.filter(Boolean).join(' '); }
function uid() { return Math.random().toString(36).slice(2, 11); }

// ─── Inline CR logo ───────────────────────────────────────────────────────────
function CRLogo({ size = 28 }: { size?: number }) {
  return <img src="/logos/reporter.png" alt="Challenger Reporter" style={{ width: size, height: size, objectFit: 'contain' }} />;
}

// ─── Mode types ───────────────────────────────────────────────────────────────
type ModeId = 'fact_check' | 'biais' | 'sources' | 'interview_prep' | 'communique' | 'spin' | 'redaction' | 'angle';

interface ModeConfig {
  id: ModeId;
  label: string;
  short: string;
  icon: React.ElementType;
  desc: string;
  color: string;
  systemPrompt: string;
}

interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'code' | 'sheet' | 'text' | 'other';
  size: number;
  content: string;
}

// ─── Slash commands ────────────────────────────────────────────────────────────
const SLASH = [
  { id: 'note', label: 'Recevoir une note', desc: 'L\'IA évalue et conseille', icon: Star, shortcut: '/note' },
  { id: 'clear', label: 'Effacer la session', desc: 'Supprimer tous les messages', icon: Eraser, shortcut: '/clear' },
  { id: 'oublier', label: 'Oublier le contexte', desc: 'L\'IA repart de zéro', icon: RotateCcw, shortcut: '/oublier' },
  { id: 'resumepdf', label: 'Résumé PDF', desc: 'Génère un résumé structuré', icon: FileDown, shortcut: '/resumepdf' },
  { id: 'exportmd', label: 'Exporter Markdown', desc: 'Télécharge en Markdown', icon: FileDown, shortcut: '/exportmd' },
  { id: 'copiernotion', label: 'Copier pour Notion', desc: 'Format Notion presse-papier', icon: Copy, shortcut: '/copiernotion' },
  { id: 'noprofil', label: 'Ignorer le profil', desc: 'Désactiver l\'injection profil', icon: UserMinus, shortcut: '/noprofil' },
] as const;

type SlashId = (typeof SLASH)[number]['id'];

// ─── Modes ─────────────────────────────────────────────────────────────────────
const MODES: ModeConfig[] = [
  {
    id: 'fact_check', label: 'Fact-Check', short: 'Fact', icon: Search, color: '#E85D04',
    desc: 'Vérification rigoureuse d\'affirmations',
    systemPrompt: `Tu es un fact-checker professionnel senior. Analyse toute affirmation avec la rigueur d'une rédaction de vérification des faits.

Structure OBLIGATOIRE :
## Verdict
**VRAI / FAUX / TROMPEUR / NON VÉRIFIABLE / NUANCÉ** — justification immédiate.
## Analyse détaillée
Déconstruction factuelle de chaque élément.
## Sources & références
Données officielles, études, organismes de référence.
## Contexte manquant
Ce que l'affirmation omet ou déforme.
## Conclusion
Reformulation précise et honnête.`,
  },
  {
    id: 'biais', label: 'Détection de biais', short: 'Biais', icon: Scale, color: '#7C3AED',
    desc: 'Biais cognitifs, rhétoriques et idéologiques',
    systemPrompt: `Tu es un expert en analyse critique des médias et détection des biais.

## Biais détectés
Nom, définition courte, exemple précis dans le texte.
## Biais cognitifs / Biais rhétoriques / Biais idéologiques
## Techniques de manipulation
## Score de neutralité
X/10 — justification.
## Reformulation neutre`,
  },
  {
    id: 'sources', label: 'Analyse de sources', short: 'Sources', icon: Eye, color: '#0891B2',
    desc: 'Crédibilité et fiabilité des sources',
    systemPrompt: `Tu es un expert en évaluation des sources journalistiques. Pour chaque source :
- **Crédibilité** : A/B/C/D
- **Intérêts & conflits** ; **Expertise réelle** ; **Vérifiabilité**
- **Signaux d'alerte** ; **Recommandation**
**Synthèse globale** à la fin.`,
  },
  {
    id: 'interview_prep', label: 'Préparation Interview', short: 'Interview', icon: Mic, color: '#E85D04',
    desc: 'Questions incisives pour interviews journalistiques',
    systemPrompt: `Tu es un journaliste d'investigation senior spécialisé dans les interviews confrontationnelles.
## Contexte stratégique
## Questions d'ouverture (3)
## Questions de fond (6)
## Questions pièges (3)
## Relances préparées
## Documents à avoir en main`,
  },
  {
    id: 'communique', label: 'Décryptage CP', short: 'CP', icon: FileText, color: '#059669',
    desc: 'Analyse critique de communiqués de presse',
    systemPrompt: `Tu es un journaliste expert en décryptage institutionnel.
## Message voulu ; ## Ce qui est dit vs ce qui est tu ; ## Chiffres & données
## Langage codé ; ## Spin identifié ; ## 5 questions à poser ; ## Note de transparence X/10`,
  },
  {
    id: 'spin', label: 'Anti-Spin', short: 'Spin', icon: AlertTriangle, color: '#DC2626',
    desc: 'Détection de propagande et manipulation',
    systemPrompt: `Tu es un expert en techniques de propagande et spin politique.
## Techniques de spin ; ## Charged language ; ## Structures de manipulation
## Omissions stratégiques ; ## Objectif caché ; ## Version désintoxiquée
**Score de manipulation : X/10**`,
  },
  {
    id: 'redaction', label: 'Critique Rédaction', short: 'Rédac.', icon: Zap, color: '#B45309',
    desc: 'Critique professionnelle de textes journalistiques',
    systemPrompt: `Tu es un rédacteur en chef exigeant d'un grand quotidien national.
## Jugement global — Publiable / À retravailler / À refaire
## Structure ; ## Clarté & précision ; ## Équilibre & contradictoire ; ## Solidité factuelle
## 3 coupures prioritaires ; ## 3 ajouts nécessaires`,
  },
  {
    id: 'angle', label: 'Story Angle', short: 'Angle', icon: Target, color: '#0891B2',
    desc: 'Angle original et percutant pour un sujet',
    systemPrompt: `Tu es un journaliste d'investigation créatif, reconnu pour tes angles originaux.
## Angle principal recommandé (titre + justification)
## 4 angles alternatifs ; ## L'angle contre-intuitif ; ## L'angle données
## Public cible ; ## Potentiel de série ; ## À éviter`,
  },
];

const MODES_MAP = Object.fromEntries(MODES.map(m => [m.id, m])) as Record<ModeId, ModeConfig>;

// ─── File helpers ──────────────────────────────────────────────────────────────
function getFileType(name: string): Attachment['type'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['js','ts','tsx','jsx','py','java','c','cpp','go','rs','rb','php','html','css','sh','sql','json','yaml','yml','xml'].includes(ext)) return 'code';
  if (['xlsx','csv','xls'].includes(ext)) return 'sheet';
  if (['txt','md','docx'].includes(ext)) return 'text';
  return 'other';
}

function FileIcon({ type }: { type: Attachment['type'] }) {
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />;
  if (type === 'pdf') return <FileText className="w-3.5 h-3.5" />;
  if (type === 'code') return <FileCode className="w-3.5 h-3.5" />;
  if (type === 'sheet') return <FileSpreadsheet className="w-3.5 h-3.5" />;
  return <File className="w-3.5 h-3.5" />;
}

function fmtSize(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1048576).toFixed(1)}MB`;
}

async function readFileAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const type = getFileType(file.name);
    reader.onload = (e) => {
      resolve({ id: uid(), name: file.name, type, size: file.size, content: e.target?.result as string ?? '' });
    };
    if (type === 'image') reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

// ─── Base chat conversation type (from localStorage) ──────────────────────────
interface BaseChatConv {
  id: string;
  title: string;
  messages: Array<{ id: string; role: string; content: string; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
}

function loadBaseChatConvs(): BaseChatConv[] {
  try {
    // Try Firestore-backed local cache key (if exists) or in-memory
    // The App stores conversations in React state, not localStorage directly
    // We store a mirror in sessionStorage when user navigates to an outil
    const raw = sessionStorage.getItem('cr_base_convs_mirror');
    if (raw) return JSON.parse(raw) as BaseChatConv[];
    return [];
  } catch { return []; }
}

// App.tsx will call this when rendering OutilsPage to mirror conversations
export function mirrorBaseChatConvs(convs: Array<{ id: string; title: string; messages: Array<{ id: string; role: string; content: string; timestamp: string | Date }>; createdAt: string | Date; updatedAt: string | Date }>) {
  try {
    const serialized = convs.map(c => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
      messages: c.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: typeof m.content === 'string' ? m.content.slice(0, 500) : '',
        timestamp: m.timestamp instanceof Date ? (m.timestamp as Date).toISOString() : String(m.timestamp),
      })),
    }));
    sessionStorage.setItem('cr_base_convs_mirror', JSON.stringify(serialized));
  } catch { /* quota */ }
}

// ─── Paywall modal ─────────────────────────────────────────────────────────────
function PaywallModal({ outil, onDismiss }: { outil: { name: string; accentColor: string; logoSrc: string; price: string; tagline: string; features: string[] }; onDismiss: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6" style={{ backdropFilter: 'blur(2px)', background: 'rgba(0,0,0,0.55)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md border-2 overflow-hidden"
        style={{ background: 'var(--bg-chat)', borderColor: `${outil.accentColor}40` }}
      >
        {/* Top accent */}
        <div className="h-1.5 w-full" style={{ background: outil.accentColor }} />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-5">
            <img src={outil.logoSrc} alt={outil.name} className="w-14 h-14 object-contain flex-shrink-0" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: outil.accentColor }}>Essai gratuit terminé</p>
              <h2 className="text-[16px] font-black text-[var(--text-primary)] leading-tight">{outil.name}</h2>
              <p className="text-[10px] mt-0.5" style={{ color: outil.accentColor }}>{outil.tagline}</p>
            </div>
          </div>

          {/* Features */}
          <div className="space-y-1.5 mb-5">
            {outil.features.slice(0, 4).map(f => (
              <div key={f} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full" style={{ background: outil.accentColor }} />
                <p className="text-[10px] text-[var(--text-primary)]/60">{f}</p>
              </div>
            ))}
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-1.5 mb-5 px-4 py-3 border" style={{ borderColor: `${outil.accentColor}20`, background: `${outil.accentColor}06` }}>
            <span className="text-[28px] font-black" style={{ color: outil.accentColor }}>{outil.price}</span>
            <div>
              <p className="text-[9px] text-[var(--text-primary)]/40 font-bold">Accès complet · Sans engagement</p>
              <p className="text-[8px] text-[var(--text-primary)]/25">Résiliable à tout moment</p>
            </div>
          </div>

          {/* CTA */}
          <div className="space-y-2">
            <div
              className="w-full flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest opacity-40 cursor-not-allowed"
              style={{ background: outil.accentColor, color: 'white' }}
            >
              <Lock className="w-3.5 h-3.5" />
              Abonnement — Bientôt disponible
            </div>
            <button
              onClick={onBack}
              className="w-full py-2 text-[9px] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 transition-colors font-medium"
            >
              ← Retourner à la bibliothèque
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
type Props = { onBack: () => void; user: FirebaseUser | null; paywallActive?: boolean; outil?: { name: string; accentColor: string; logoSrc: string; price: string; tagline: string; features: string[] } | null };

export default function JournalismeApp({ onBack, paywallActive = false, outil }: Props) {
  const {
    sessions, projects, isPinned, togglePin,
    addSession, updateSession, deleteSession, assignProject,
    createProject, renameProject, deleteProject,
    importFromChat,
  } = useOutilSessions('journalisme');

  // Paywall — permanent si actif, pas de dismiss
  const showPaywall = paywallActive;

  // Active session / mode
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeSession = sessions.find(s => s.id === activeId) ?? null;
  const [mode, setMode] = useState<ModeConfig>(MODES[0]);
  const currentMode = activeSession ? (MODES_MAP[activeSession.modeId as ModeId] ?? mode) : mode;

  // Input state
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // UI state
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Project management
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);

  // Import from chat modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [baseChatConvs, setBaseChatConvs] = useState<BaseChatConv[]>([]);
  const [importModeId, setImportModeId] = useState<ModeId>('fact_check');

  // Slash
  const slashMatches = input.startsWith('/') ? SLASH.filter(c => c.shortcut.includes(input.toLowerCase())) : [];
  const slashOpen = slashMatches.length > 0;
  const [slashIdx, setSlashIdx] = useState(0);
  const safeIdx = Math.min(slashIdx, slashMatches.length - 1);

  // Voice
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.msgs.length, sending]);

  // Auto-resize
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = 'auto';
    taRef.current.style.height = Math.min(taRef.current.scrollHeight, 140) + 'px';
  }, [input]);

  // Load base chat convs when import modal opens
  useEffect(() => {
    if (importModalOpen) setBaseChatConvs(loadBaseChatConvs());
  }, [importModalOpen]);

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 3);
    const processed = await Promise.all(arr.map(readFileAttachment));
    setAttachments(prev => [...prev, ...processed].slice(0, 3));
  }, []);

  // ── Voice ──────────────────────────────────────────────────────────────────
  const startVoice = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = true;
    rec.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('');
      setInput(transcript);
    };
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, []);

  const stopVoice = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
    setVoiceOpen(false);
  }, []);

  // ── Stream AI response ─────────────────────────────────────────────────────
  const streamResponse = useCallback(async (
    targetId: string,
    asstMsgId: string,
    modeConfig: ModeConfig,
    history: { role: string; content: string }[],
    userText: string
  ) => {
    setSending(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        signal: ctrl.signal,
        body: JSON.stringify({
          model: 'mistral-large-latest',
          temperature: 0.3,
          stream: true,
          messages: [
            { role: 'system', content: modeConfig.systemPrompt },
            ...history,
            { role: 'user', content: userText },
          ],
        }),
      });

      if (!res.ok || !res.body) throw new Error('API error');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let acc = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.replace(/^data:\s*/, '').trim();
          if (!t || t === '[DONE]') continue;
          try {
            const delta = JSON.parse(t).choices?.[0]?.delta?.content ?? '';
            if (delta) {
              acc += delta;
              updateSession(targetId, s => ({
                ...s,
                msgs: s.msgs.map(m => m.id === asstMsgId ? { ...m, content: acc } : m),
                updatedAt: new Date().toISOString(),
              }));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        updateSession(targetId, s => ({
          ...s,
          msgs: s.msgs.map(m => m.id === asstMsgId ? { ...m, content: '*Erreur de connexion. Réessayez.*' } : m),
        }));
      }
    } finally {
      setSending(false);
    }
  }, [updateSession]);

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, atts: Attachment[]) => {
    if ((!text.trim() && atts.length === 0) || sending) return;
    const modeConfig = currentMode;
    let fullText = text.trim();
    if (atts.length > 0) {
      fullText += atts.map(a => a.type === 'image' ? `\n[Image: ${a.name}]` : `\n\n--- ${a.name} ---\n${a.content.slice(0, 4000)}`).join('');
    }

    const userMsgId = uid();
    const asstMsgId = uid();
    const now = new Date().toISOString();

    const userMsg: OutilSessionMsg = {
      id: userMsgId, role: 'user', content: text.trim(), modeId: modeConfig.id,
      attachments: atts.map(a => ({ id: a.id, name: a.name, type: a.type, size: a.size })),
      ts: now,
    };
    const asstMsg: OutilSessionMsg = { id: asstMsgId, role: 'assistant', content: '', modeId: modeConfig.id, ts: now };

    let targetId = activeId;

    if (!activeId) {
      const sid = uid();
      const session: OutilSession = {
        id: sid, toolId: 'journalisme',
        title: `${modeConfig.label} — ${text.slice(0, 40)}${text.length > 40 ? '…' : ''}`,
        modeId: modeConfig.id,
        msgs: [userMsg, asstMsg],
        createdAt: now, updatedAt: now,
      };
      addSession(session);
      setActiveId(sid);
      targetId = sid;
    } else {
      updateSession(activeId, s => ({
        ...s, msgs: [...s.msgs, userMsg, asstMsg], updatedAt: now,
      }));
    }

    const history = (activeSession?.msgs ?? [])
      .filter(m => m.role !== 'command')
      .map(m => ({ role: m.role, content: m.content }));

    await streamResponse(targetId!, asstMsgId, modeConfig, history, fullText);
  }, [mode, currentMode, activeId, activeSession, sending, addSession, updateSession, streamResponse]);

  // ── Slash handler ───────────────────────────────────────────────────────────
  const handleSlash = useCallback((id: SlashId) => {
    setInput('');
    if (!activeSession || !activeId) return;
    if (id === 'clear') {
      updateSession(activeId, s => ({ ...s, msgs: [] }));
      return;
    }
    if (id === 'oublier') {
      updateSession(activeId, s => ({
        ...s,
        msgs: [...s.msgs, { id: uid(), role: 'command', content: '— Contexte effacé — L\'IA repart de zéro —', ts: new Date().toISOString() }],
      }));
      return;
    }
    if (id === 'exportmd') {
      const md = activeSession.msgs.filter(m => m.role !== 'command')
        .map(m => `**${m.role === 'user' ? 'Vous' : 'Challenger Reporter'}**\n\n${m.content}`).join('\n\n---\n\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
      a.download = `CR-${activeSession.title.slice(0, 30)}.md`;
      a.click();
      return;
    }
    if (id === 'copiernotion') {
      const md = activeSession.msgs.filter(m => m.role !== 'command')
        .map(m => `**${m.role === 'user' ? 'Vous' : 'Challenger Reporter'}**\n\n${m.content}`).join('\n\n---\n\n');
      navigator.clipboard.writeText(md).catch(() => {});
      return;
    }
    // For note, resumepdf, noprofil — send as messages
    const slashTexts: Record<string, string> = {
      note: 'Évalue notre échange et donne-moi des conseils ciblés sur ma façon de travailler le sujet.',
      resumepdf: 'Génère un résumé structuré de notre analyse en cours.',
      noprofil: '/noprofil — ignore les informations de profil pour la suite.',
    };
    if (slashTexts[id]) sendMessage(slashTexts[id], []);
  }, [activeSession, activeId, updateSession, sendMessage]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (slashOpen && slashMatches[safeIdx]) {
      handleSlash(slashMatches[safeIdx].id as SlashId);
      return;
    }
    const text = input;
    const atts = attachments;
    setInput('');
    setAttachments([]);
    await sendMessage(text, atts);
  }, [slashOpen, slashMatches, safeIdx, handleSlash, input, attachments, sendMessage]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => Math.min(i + 1, slashMatches.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); handleSlash(slashMatches[safeIdx].id as SlashId); setInput(''); return; }
      if (e.key === 'Escape') { setInput(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }, [slashOpen, slashMatches, safeIdx, handleSlash, handleSubmit]);

  // ── Session rename ───────────────────────────────────────────────────────────
  const confirmRenameSession = useCallback((id: string) => {
    if (renameValue.trim()) updateSession(id, s => ({ ...s, title: renameValue.trim() }));
    setRenameSessionId(null);
    setRenameValue('');
  }, [renameValue, updateSession]);

  // ── Import from chat ─────────────────────────────────────────────────────────
  const handleImport = useCallback((conv: BaseChatConv) => {
    const session = importFromChat(conv, importModeId);
    setActiveId(session.id);
    setImportModalOpen(false);
  }, [importFromChat, importModeId]);

  // ── Grouped sessions ─────────────────────────────────────────────────────────
  const unassignedSessions = sessions.filter(s => !s.projectId);
  const sessionsByProject = (projectId: string) => sessions.filter(s => s.projectId === projectId);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex-1 flex flex-col min-w-0 h-full overflow-hidden">

      {/* Paywall modal — par-dessus tout */}
      {showPaywall && outil && (
        <PaywallModal outil={outil} onDismiss={onBack} />
      )}

      {/* Contenu de l'outil — flouté si paywall actif */}
      <div
        className={cx('flex-1 flex flex-col min-w-0 h-full overflow-hidden', showPaywall && 'pointer-events-none select-none')}
        style={{ background: '#0d0d0d', ...(showPaywall ? { filter: 'blur(4px)' } : {}) }}
      >

      {/* ═══════════ TOP BAR ═════════════════════════════════════════════════ */}
      <div
        className="flex-shrink-0 flex items-stretch border-b z-20"
        style={{ background: '#111', borderColor: '#E85D04', borderBottomWidth: '2px', minHeight: '52px' }}
      >
        <button
          onClick={onBack}
          className="flex items-center justify-center w-12 flex-shrink-0 hover:bg-white/5 transition-colors"
          style={{ color: '#E85D04', borderRight: '1px solid rgba(232,93,4,0.15)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 px-4 flex-1 min-w-0">
          <CRLogo size={30} />
          <div className="min-w-0">
            <p className="text-[13px] font-black uppercase tracking-widest text-white leading-none truncate">Challenger Reporter</p>
            <p className="text-[8px] font-bold uppercase tracking-widest mt-0.5" style={{ color: 'rgba(232,93,4,0.55)' }}>
              Suite journalisme · Moteur Challenger IA
            </p>
          </div>
        </div>

        <div className="flex items-stretch flex-shrink-0" style={{ borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Import from chat */}
          <button
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 text-white/25 hover:text-white/60 hover:bg-white/5 transition-all text-[9px] font-black uppercase tracking-widest"
            title="Importer une discussion Challenger IA"
          >
            <Import className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Importer</span>
          </button>
          {/* New session */}
          <button
            onClick={() => { setActiveId(null); setInput(''); setAttachments([]); }}
            className="flex items-center gap-1.5 px-3 text-white/25 hover:text-white/60 hover:bg-white/5 transition-all text-[9px] font-black uppercase tracking-widest"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nouveau</span>
          </button>
          {/* Pin */}
          <button
            onClick={() => togglePin()}
            className="flex items-center justify-center w-10 transition-all hover:bg-white/5"
            title={isPinned ? 'Désépingler de la sidebar' : 'Épingler à la sidebar'}
            style={{ color: isPinned ? '#E85D04' : 'rgba(255,255,255,0.2)' }}
          >
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          {/* Mobile sidebar */}
          <button
            onClick={() => setMobileSidebarOpen(v => !v)}
            className="flex items-center justify-center w-10 text-white/30 hover:text-white/70 md:hidden"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ═══════════ BODY ════════════════════════════════════════════════════ */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">

        {/* ── Desktop Sidebar ── */}
        <div
          className="hidden md:flex flex-shrink-0 flex-col border-r overflow-y-auto w-52"
          style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.05)' }}
        >
          {/* Modes */}
          <div className="px-3 pt-4 pb-2">
            <p className="text-[7px] font-black uppercase tracking-widest text-white/20 px-1 mb-1.5">Modes d'analyse</p>
            {MODES.map(m => {
              const Icon = m.icon;
              const isActive = (activeSession?.modeId ?? mode.id) === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => { setMode(m); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-all"
                  style={{ borderLeft: `2px solid ${isActive ? m.color : 'transparent'}` }}
                >
                  <Icon className="w-3 h-3 flex-shrink-0" style={{ color: isActive ? m.color : 'rgba(255,255,255,0.25)' }} />
                  <span className="text-[9px] font-bold truncate" style={{ color: isActive ? m.color : 'rgba(255,255,255,0.35)' }}>{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Projects + sessions */}
          <div className="flex-1 px-3 pb-3 border-t mt-1" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mt-3 mb-1.5 px-1">
              <p className="text-[7px] font-black uppercase tracking-widest text-white/20">Projets</p>
              <button
                onClick={() => setCreatingProject(true)}
                className="text-white/20 hover:text-white/60 transition-colors"
                title="Nouveau projet"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* New project input */}
            {creatingProject && (
              <div className="flex items-center gap-1.5 mb-2">
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newProjectName.trim()) {
                      createProject(newProjectName);
                      setNewProjectName('');
                      setCreatingProject(false);
                    }
                    if (e.key === 'Escape') { setCreatingProject(false); setNewProjectName(''); }
                  }}
                  placeholder="Nom du projet…"
                  className="flex-1 bg-white/5 border border-white/10 px-2 py-1 text-[10px] text-white placeholder:text-white/20 focus:outline-none focus:border-[#E85D04]/40"
                />
                <button onClick={() => { if (newProjectName.trim()) { createProject(newProjectName); } setCreatingProject(false); setNewProjectName(''); }}>
                  <Check className="w-3.5 h-3.5 text-[#E85D04]" />
                </button>
              </div>
            )}

            {/* Projects */}
            {projects.map(proj => {
              const projSessions = sessionsByProject(proj.id);
              const isExpanded = expandedProjectId === proj.id;
              return (
                <div key={proj.id} className="mb-1">
                  <div className="flex items-center gap-1.5 group">
                    <button
                      onClick={() => setExpandedProjectId(isExpanded ? null : proj.id)}
                      className="flex items-center gap-1.5 flex-1 min-w-0 px-1.5 py-1 text-left hover:bg-white/4 transition-all"
                    >
                      {isExpanded ? (
                        <FolderOpen className="w-3 h-3 flex-shrink-0" style={{ color: proj.color }} />
                      ) : (
                        <Folder className="w-3 h-3 flex-shrink-0" style={{ color: proj.color }} />
                      )}
                      {renameProjectId === proj.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { renameProject(proj.id, renameValue); setRenameProjectId(null); }
                            if (e.key === 'Escape') setRenameProjectId(null);
                          }}
                          onBlur={() => { renameProject(proj.id, renameValue); setRenameProjectId(null); }}
                          className="flex-1 bg-transparent border-b border-[#E85D04]/40 text-[10px] text-white focus:outline-none"
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-[10px] font-bold text-white/45 truncate">{proj.name}</span>
                      )}
                      <span className="text-[7px] text-white/20 flex-shrink-0">{projSessions.length}</span>
                    </button>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity flex-shrink-0">
                      <button onClick={() => { setRenameProjectId(proj.id); setRenameValue(proj.name); }} className="p-0.5 text-white/20 hover:text-white/60"><Edit3 className="w-2.5 h-2.5" /></button>
                      <button onClick={() => deleteProject(proj.id)} className="p-0.5 text-white/20 hover:text-red-400"><Trash2 className="w-2.5 h-2.5" /></button>
                    </div>
                  </div>

                  {/* Project sessions */}
                  {isExpanded && projSessions.map(s => (
                    <SessionItem
                      key={s.id}
                      session={s}
                      isActive={activeId === s.id}
                      projects={projects}
                      menuOpen={sessionMenuId === s.id}
                      onSelect={() => setActiveId(s.id)}
                      onMenuToggle={() => setSessionMenuId(sessionMenuId === s.id ? null : s.id)}
                      onDelete={() => { deleteSession(s.id); if (activeId === s.id) setActiveId(null); setSessionMenuId(null); }}
                      onAssign={pid => { assignProject(s.id, pid); setSessionMenuId(null); }}
                      onRename={() => { setRenameSessionId(s.id); setRenameValue(s.title); setSessionMenuId(null); }}
                      renaming={renameSessionId === s.id}
                      renameValue={renameValue}
                      setRenameValue={setRenameValue}
                      confirmRename={() => confirmRenameSession(s.id)}
                      indent
                    />
                  ))}
                </div>
              );
            })}

            {/* Unassigned sessions */}
            {unassignedSessions.length > 0 && (
              <div className="mt-2">
                {projects.length > 0 && (
                  <p className="text-[7px] font-black uppercase tracking-widest text-white/15 px-1 mb-1">Sans projet</p>
                )}
                {unassignedSessions.map(s => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    isActive={activeId === s.id}
                    projects={projects}
                    menuOpen={sessionMenuId === s.id}
                    onSelect={() => setActiveId(s.id)}
                    onMenuToggle={() => setSessionMenuId(sessionMenuId === s.id ? null : s.id)}
                    onDelete={() => { deleteSession(s.id); if (activeId === s.id) setActiveId(null); setSessionMenuId(null); }}
                    onAssign={pid => { assignProject(s.id, pid); setSessionMenuId(null); }}
                    onRename={() => { setRenameSessionId(s.id); setRenameValue(s.title); setSessionMenuId(null); }}
                    renaming={renameSessionId === s.id}
                    renameValue={renameValue}
                    setRenameValue={setRenameValue}
                    confirmRename={() => confirmRenameSession(s.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile Sidebar Overlay ── */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="fixed inset-0 z-50 flex md:hidden"
            >
              <div className="w-72 h-full flex flex-col overflow-y-auto border-r" style={{ background: '#0d0d0d', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Modes & Sessions</p>
                  <button onClick={() => setMobileSidebarOpen(false)} className="text-white/30"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-3 space-y-0.5">
                  {MODES.map(m => {
                    const Icon = m.icon;
                    return (
                      <button key={m.id} onClick={() => { setMode(m); setMobileSidebarOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left"
                        style={{ borderLeft: `2px solid ${mode.id === m.id ? m.color : 'transparent'}` }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: mode.id === m.id ? m.color : 'rgba(255,255,255,0.3)' }} />
                        <span className="text-[11px] font-bold" style={{ color: mode.id === m.id ? m.color : 'rgba(255,255,255,0.45)' }}>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
                {sessions.length > 0 && (
                  <div className="px-3 pt-3 pb-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <p className="text-[7px] font-black uppercase tracking-widest text-white/20 mb-2">Sessions</p>
                    {sessions.map(s => (
                      <button key={s.id} onClick={() => { setActiveId(s.id); setMobileSidebarOpen(false); }}
                        className={cx('w-full text-left px-2.5 py-2 mb-0.5 transition-all', activeId === s.id ? 'bg-white/6' : 'hover:bg-white/3')}
                        style={{ borderLeft: `2px solid ${activeId === s.id ? '#E85D04' : 'transparent'}` }}
                      >
                        <p className="text-[9px] text-white/35 truncate">{s.title}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1" onClick={() => setMobileSidebarOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main Chat ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0" onClick={() => { modePickerOpen && setModePickerOpen(false); sessionMenuId && setSessionMenuId(null); }}>

          {/* Mode bar */}
          <div
            className="flex-shrink-0 flex items-center gap-3 px-5 py-2 border-b"
            style={{ background: `${currentMode.color}06`, borderColor: `${currentMode.color}15` }}
          >
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setModePickerOpen(v => !v); }}
                className="flex items-center gap-1.5 px-2.5 py-1"
                style={{ background: `${currentMode.color}18`, border: `1px solid ${currentMode.color}30` }}
              >
                {(() => { const Icon = currentMode.icon; return <Icon className="w-3 h-3" style={{ color: currentMode.color }} />; })()}
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: currentMode.color }}>{currentMode.label}</span>
                <ChevronDown className="w-2.5 h-2.5" style={{ color: currentMode.color }} />
              </button>

              <AnimatePresence>
                {modePickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    className="absolute left-0 top-full mt-1.5 z-50 border overflow-hidden"
                    style={{ background: '#161616', borderColor: 'rgba(255,255,255,0.1)', minWidth: '200px', boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {MODES.map(m => {
                      const Icon = m.icon;
                      return (
                        <button key={m.id} onClick={() => { setMode(m); setModePickerOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-white/5 last:border-0 hover:bg-white/5"
                        >
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: m.color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-white">{m.label}</p>
                            <p className="text-[9px] text-white/25 truncate">{m.desc}</p>
                          </div>
                          {mode.id === m.id && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="w-px h-3 bg-white/10" />
            <span className="text-[8px] text-white/20">{activeSession ? `${activeSession.msgs.filter(m => m.role === 'user').length} analyse(s)` : 'Nouvelle session'}</span>
            {activeSession?.importedFromChatId && (
              <>
                <div className="w-px h-3 bg-white/10" />
                <span className="flex items-center gap-1 text-[8px] text-white/25">
                  <MessageSquare className="w-2.5 h-2.5" />Importé de Challenger IA
                </span>
              </>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
            {!activeSession || activeSession.msgs.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-12"
              >
                <div className="mb-6 relative">
                  <div className="w-16 h-16 flex items-center justify-center mx-auto border-2" style={{ background: 'rgba(232,93,4,0.08)', borderColor: 'rgba(232,93,4,0.2)' }}>
                    <CRLogo size={42} />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 flex items-center justify-center" style={{ background: currentMode.color }}>
                    <Sparkles className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>
                <h2 className="text-[17px] font-black text-white uppercase tracking-tight mb-1">{currentMode.label}</h2>
                <p className="text-[11px] text-white/30 leading-relaxed mb-6">{currentMode.desc}</p>
                <div className="grid grid-cols-1 gap-2 w-full max-w-sm text-left">
                  {[
                    currentMode.id === 'fact_check' ? '"La France est le premier producteur de vin mondial"' :
                    currentMode.id === 'biais' ? 'Collez un article à analyser pour détecter ses biais…' :
                    currentMode.id === 'angle' ? 'Un maire local impliqué dans un scandale d\'urbanisme' :
                    currentMode.id === 'spin' ? 'Collez un discours ou communiqué suspect…' :
                    'Commencez votre analyse…',
                    'Ou posez une question sur la méthode journalistique…',
                  ].map((s, i) => (
                    <button key={i} onClick={() => { setInput(s); taRef.current?.focus(); }}
                      className="text-left px-3 py-2 border text-[11px] text-white/35 hover:text-white/65 transition-all"
                      style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${currentMode.color}30`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.07)'; }}
                    >{s}</button>
                  ))}
                </div>
              </motion.div>
            ) : (
              activeSession.msgs.map(msg => {
                const modeCfg = msg.modeId ? (MODES_MAP[msg.modeId as ModeId] ?? currentMode) : currentMode;

                if (msg.role === 'command') {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="text-[9px] font-bold text-white/20 border border-white/8 px-3 py-1">{msg.content}</span>
                    </div>
                  );
                }

                if (msg.role === 'user') {
                  return (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                      <div className="max-w-[75%]">
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 justify-end mb-1.5">
                            {msg.attachments.map(att => (
                              <div key={att.id} className="flex items-center gap-1.5 px-2 py-1 border text-[9px] text-white/40" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                                <FileIcon type={att.type as Attachment['type']} />
                                <span className="max-w-[100px] truncate">{att.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="px-4 py-3 border text-[12px] text-white/85 leading-relaxed" style={{ background: `${modeCfg.color}10`, borderColor: `${modeCfg.color}22` }}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-7 h-7 flex items-center justify-center" style={{ background: `${modeCfg.color}18` }}>
                        <CRLogo size={18} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: modeCfg.color }}>Challenger Reporter</span>
                        <span className="text-[7px] text-white/15">· {modeCfg.label}</span>
                      </div>
                      <div className="px-5 py-4 border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.06)' }}>
                        {msg.content ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h2: ({ children }) => <h2 className="text-[10px] font-black uppercase tracking-widest mt-5 mb-2 first:mt-0" style={{ color: modeCfg.color }}>{children}</h2>,
                              h3: ({ children }) => <h3 className="text-[10px] font-black text-white/55 uppercase tracking-wider mt-3 mb-1">{children}</h3>,
                              p: ({ children }) => <p className="text-[12px] text-white/68 mb-2.5 leading-relaxed last:mb-0">{children}</p>,
                              strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                              ul: ({ children }) => <ul className="mb-3 space-y-1.5">{children}</ul>,
                              ol: ({ children }) => <ol className="mb-3 space-y-1.5 list-decimal list-inside">{children}</ol>,
                              li: ({ children }) => (
                                <li className="flex items-start gap-2 text-[11px] text-white/60">
                                  <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: modeCfg.color }} />
                                  <span>{children}</span>
                                </li>
                              ),
                              hr: () => <div className="my-3 border-t border-white/8" />,
                              code: ({ children }) => <code className="px-1.5 py-0.5 text-[11px] font-mono" style={{ background: 'rgba(255,255,255,0.07)', color: modeCfg.color }}>{children}</code>,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          <div className="flex items-center gap-2 py-1">
                            {[0,1,2].map(i => (
                              <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: modeCfg.color, animationDelay: `${i * 150}ms` }} />
                            ))}
                            <span className="text-white/20 text-[10px] ml-1">Analyse en cours…</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ═══════════ INPUT ZONE ══════════════════════════════════════════ */}
          <div className="flex-shrink-0 border-t" style={{ background: '#0f0f0f', borderColor: 'rgba(255,255,255,0.06)' }}>
            {/* Attachments preview */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pt-3 flex flex-wrap gap-2">
                  {attachments.map(att => (
                    <div key={att.id} className="flex items-center gap-1.5 px-2.5 py-1.5 border text-[10px] text-white/50" style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${currentMode.color}25` }}>
                      <FileIcon type={att.type} />
                      <span className="max-w-[120px] truncate">{att.name}</span>
                      <span className="text-white/25">{fmtSize(att.size)}</span>
                      <button onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} className="ml-1 text-white/25 hover:text-white/70"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Slash suggestions */}
            <AnimatePresence>
              {slashOpen && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="border-t mx-4 mt-3" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#161616' }}>
                  <p className="text-[7px] font-black uppercase tracking-widest text-white/20 px-3 pt-2 pb-1">Commandes</p>
                  {slashMatches.map((cmd, i) => {
                    const CmdIcon = cmd.icon;
                    return (
                      <button key={cmd.id} onClick={() => { handleSlash(cmd.id as SlashId); setInput(''); }} onMouseEnter={() => setSlashIdx(i)}
                        className={cx('w-full flex items-center gap-3 px-3 py-2.5 text-left border-t border-white/4 transition-colors', i === safeIdx ? 'bg-white/6' : 'hover:bg-white/4')}
                      >
                        <CmdIcon className="w-3.5 h-3.5 flex-shrink-0 text-white/30" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-white/70">{cmd.label}</p>
                          <p className="text-[9px] text-white/30">{cmd.desc}</p>
                        </div>
                        <span className="text-[9px] font-mono text-white/20 border border-white/10 px-1.5 py-0.5">{cmd.shortcut}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Voice overlay */}
            <AnimatePresence>
              {voiceOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-4 py-3 flex items-center gap-4 border-t" style={{ borderColor: `${currentMode.color}20`, background: `${currentMode.color}06` }}>
                  <div className="flex items-center gap-1">
                    {[0,1,2,3,4].map(i => (
                      <motion.div key={i} animate={listening ? { scaleY: [0.3, 1, 0.3], transition: { repeat: Infinity, duration: 0.6, delay: i * 0.1 } } : { scaleY: 0.3 }} className="w-1 rounded-full origin-bottom" style={{ height: '20px', backgroundColor: currentMode.color }} />
                    ))}
                  </div>
                  <p className="text-[11px] font-bold text-white/50 flex-1">{listening ? 'En écoute…' : 'Appuyez pour parler'}</p>
                  <button onClick={listening ? stopVoice : startVoice} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white" style={{ background: listening ? '#DC2626' : currentMode.color }}>
                    {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    {listening ? 'Stop' : 'Parler'}
                  </button>
                  <button onClick={() => { stopVoice(); setVoiceOpen(false); }} className="text-white/25 hover:text-white/70"><X className="w-4 h-4" /></button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input row */}
            <div className="flex gap-2 items-end p-3">
              <input ref={fileInputRef} type="file" multiple className="hidden"
                accept="image/*,.pdf,.docx,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.go,.rs,.html,.css,.xml,.yaml,.yml,.sh,.sql"
                onChange={e => handleFiles(e.target.files)} />

              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center border transition-all disabled:opacity-30"
                style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${currentMode.color}50`; (e.currentTarget as HTMLButtonElement).style.color = currentMode.color; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)'; }}
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              <button type="button" onClick={() => setVoiceOpen(v => !v)} disabled={sending}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center border transition-all disabled:opacity-30"
                style={{ borderColor: voiceOpen ? `${currentMode.color}60` : 'rgba(255,255,255,0.08)', background: voiceOpen ? `${currentMode.color}12` : 'transparent', color: voiceOpen ? currentMode.color : 'rgba(255,255,255,0.3)' }}
              >
                <Mic className="w-3.5 h-3.5" />
              </button>

              <button type="button" onClick={() => { setInput(input === '' ? '/' : ''); taRef.current?.focus(); }} disabled={sending}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center border transition-all disabled:opacity-30"
                style={{ borderColor: slashOpen ? `${currentMode.color}60` : 'rgba(255,255,255,0.08)', background: slashOpen ? `${currentMode.color}12` : 'transparent', color: slashOpen ? currentMode.color : 'rgba(255,255,255,0.3)' }}
              >
                <Slash className="w-3.5 h-3.5" />
              </button>

              <div className="flex-1 relative">
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={e => { setInput(e.target.value); setSlashIdx(0); }}
                  onKeyDown={handleKeyDown}
                  placeholder={`${currentMode.label} — ${currentMode.desc}`}
                  rows={1}
                  className="w-full border px-4 py-2.5 text-[12px] text-white placeholder:text-white/18 focus:outline-none resize-none leading-relaxed transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', maxHeight: '140px', overflow: 'auto' }}
                  onFocus={e => (e.currentTarget.style.borderColor = `${currentMode.color}45`)}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
              </div>

              <button type="button" onClick={handleSubmit} disabled={(!input.trim() && attachments.length === 0) || sending}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center transition-all disabled:opacity-25"
                style={{ background: currentMode.color }}
              >
                {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>

            <p className="text-center text-[7px] text-white/8 pb-2 select-none">
              Challenger Reporter · Suite journalisme propulsée par Challenger IA
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════ IMPORT FROM CHAT MODAL ══════════════════════════════════ */}
      <AnimatePresence>
        {importModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={e => { if (e.target === e.currentTarget) setImportModalOpen(false); }}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} className="w-full max-w-xl border" style={{ background: '#141414', borderColor: 'rgba(232,93,4,0.3)', boxShadow: '8px 8px 0px 0px rgba(232,93,4,0.15)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              <div className="h-1 w-full" style={{ background: '#E85D04' }} />
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
                <div>
                  <h3 className="text-[14px] font-black text-white">Importer depuis Challenger IA</h3>
                  <p className="text-[10px] text-white/35 mt-0.5">Connectez une discussion existante à Challenger Reporter</p>
                </div>
                <button onClick={() => setImportModalOpen(false)} className="text-white/20 hover:text-white/60"><X className="w-5 h-5" /></button>
              </div>

              <div className="px-6 py-4 border-b border-white/8 flex-shrink-0">
                <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-2">Mode d'analyse pour l'import</label>
                <div className="flex flex-wrap gap-1.5">
                  {MODES.map(m => (
                    <button key={m.id} onClick={() => setImportModeId(m.id as ModeId)}
                      className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest border transition-all"
                      style={{
                        borderColor: importModeId === m.id ? m.color : 'rgba(255,255,255,0.1)',
                        background: importModeId === m.id ? `${m.color}18` : 'transparent',
                        color: importModeId === m.id ? m.color : 'rgba(255,255,255,0.35)',
                      }}
                    >{m.short}</button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {baseChatConvs.length === 0 ? (
                  <div className="text-center py-10">
                    <MessageSquare className="w-8 h-8 text-white/10 mx-auto mb-3" />
                    <p className="text-[11px] text-white/25 font-medium">Aucune discussion disponible</p>
                    <p className="text-[9px] text-white/15 mt-1">Les discussions Challenger IA apparaîtront ici</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {baseChatConvs.map(conv => (
                      <button key={conv.id} onClick={() => handleImport(conv)}
                        className="w-full text-left px-4 py-3 border transition-all group"
                        style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(232,93,4,0.3)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(232,93,4,0.05)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.02)'; }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquare className="w-3 h-3 text-[#5D7BFF]/50 flex-shrink-0" />
                          <p className="text-[11px] font-bold text-white/70 truncate">{conv.title}</p>
                        </div>
                        <p className="text-[9px] text-white/25 pl-5">{conv.messages.length} messages · {new Date(conv.updatedAt).toLocaleDateString('fr-FR')}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Session item sub-component ───────────────────────────────────────────────
function SessionItem({
  session, isActive, projects, menuOpen,
  onSelect, onMenuToggle, onDelete, onAssign, onRename,
  renaming, renameValue, setRenameValue, confirmRename,
  indent = false,
}: {
  session: OutilSession;
  isActive: boolean;
  projects: OutilProject[];
  menuOpen: boolean;
  onSelect: () => void;
  onMenuToggle: () => void;
  onDelete: () => void;
  onAssign: (projectId: string | undefined) => void;
  onRename: () => void;
  renaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  confirmRename: () => void;
  indent?: boolean;
}) {
  const modeCfg = MODES_MAP[session.modeId as ModeId];
  return (
    <div className={cx('relative group', indent && 'pl-3')} style={{ borderLeft: indent ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
      <div className="flex items-center gap-1">
        <button
          onClick={onSelect}
          className={cx('flex-1 min-w-0 text-left px-1.5 py-1.5 transition-all')}
          style={{ background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent', borderLeft: `2px solid ${isActive && modeCfg ? modeCfg.color : 'transparent'}` }}
        >
          {renaming ? (
            <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') confirmRename(); }}
              onBlur={confirmRename}
              className="w-full bg-transparent border-b border-[#E85D04]/40 text-[9px] text-white focus:outline-none"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <>
              {modeCfg && <p className="text-[7px] font-black uppercase tracking-widest mb-0.5" style={{ color: modeCfg.color }}>{modeCfg.short}</p>}
              <p className="text-[9px] text-white/35 truncate leading-tight">{session.title.replace(`${modeCfg?.label ?? ''} — `, '')}</p>
              {session.importedFromChatId && (
                <p className="text-[7px] text-white/15 flex items-center gap-0.5 mt-0.5">
                  <MessageSquare className="w-2 h-2" />import
                </p>
              )}
            </>
          )}
        </button>

        <button
          onClick={e => { e.stopPropagation(); onMenuToggle(); }}
          className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 text-white/20 hover:text-white/60 transition-all"
        >
          <MoreVertical className="w-3 h-3" />
        </button>
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute left-0 top-full z-50 border overflow-hidden"
            style={{ background: '#1a1a1a', borderColor: 'rgba(255,255,255,0.1)', minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={onRename} className="w-full flex items-center gap-2 px-3 py-2 text-left text-[10px] text-white/60 hover:bg-white/5 hover:text-white">
              <Edit3 className="w-3 h-3" />Renommer
            </button>
            {projects.length > 0 && (
              <>
                <div className="border-t border-white/6" />
                <p className="px-3 py-1 text-[7px] font-black uppercase tracking-widest text-white/20">Déplacer vers</p>
                {projects.map(p => (
                  <button key={p.id} onClick={() => onAssign(p.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-[10px] text-white/60 hover:bg-white/5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </button>
                ))}
                {session.projectId && (
                  <button onClick={() => onAssign(undefined)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-[10px] text-white/40 hover:bg-white/5">
                    <ChevronRight className="w-3 h-3" />Retirer du projet
                  </button>
                )}
              </>
            )}
            <div className="border-t border-white/6" />
            <button onClick={onDelete} className="w-full flex items-center gap-2 px-3 py-2 text-left text-[10px] text-red-400/70 hover:bg-red-500/5 hover:text-red-400">
              <Trash2 className="w-3 h-3" />Supprimer
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
