import {
  useState, useRef, useCallback, useEffect, KeyboardEvent,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Send, Loader2, X, Sparkles, Paperclip, Mic, MicOff,
  Search, AlertTriangle, FileText, Scale, Eye, Zap, Target, RotateCcw,
  Star, Eraser, UserMinus, FileDown, Copy, Slash, ChevronDown,
  ImageIcon, FileCode, File, FileSpreadsheet, Plus, ChevronRight,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function cx(...c: (string | boolean | undefined | null)[]) { return c.filter(Boolean).join(' '); }
function uid() { return Math.random().toString(36).slice(2, 11); }

// ─── Inline CR logo (SVG) ──────────────────────────────────────────────────
function CRLogo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Orange background */}
      <rect width="100" height="100" fill="#E85D04" />
      {/* Arch (white negative space) */}
      <path d="M18 100 L18 52 Q18 14 50 14 Q82 14 82 52 L82 100" fill="white" />
      {/* Mic body */}
      <ellipse cx="50" cy="38" rx="11" ry="15" fill="#E85D04" />
      {/* Mic grille lines */}
      <line x1="40" y1="33" x2="60" y2="33" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="39" y1="38" x2="61" y2="38" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="40" y1="43" x2="60" y2="43" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      {/* Mic stand arc */}
      <path d="M35 50 Q35 62 50 62 Q65 62 65 50" stroke="#E85D04" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* Mic pole */}
      <line x1="50" y1="62" x2="50" y2="70" stroke="#E85D04" strokeWidth="3.5" strokeLinecap="round" />
      {/* Mic base */}
      <rect x="43" y="70" width="14" height="5" rx="2" fill="#E85D04" />
      {/* CR text */}
      <text x="50" y="94" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="16" fill="#E85D04">CR</text>
    </svg>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────
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

interface Msg {
  id: string;
  role: 'user' | 'assistant' | 'command';
  content: string;
  modeId: ModeId;
  attachments?: Attachment[];
  ts: Date;
}

interface Session {
  id: string;
  title: string;
  modeId: ModeId;
  msgs: Msg[];
  createdAt: Date;
}

// ─── Slash commands ────────────────────────────────────────────────────────
const SLASH = [
  { id: 'note', label: 'Recevoir une note', desc: 'L\'IA évalue et donne des conseils', icon: Star, shortcut: '/note' },
  { id: 'clear', label: 'Effacer la session', desc: 'Supprimer tous les messages', icon: Eraser, shortcut: '/clear' },
  { id: 'oublier', label: 'Oublier le contexte', desc: 'L\'IA repart de zéro', icon: RotateCcw, shortcut: '/oublier' },
  { id: 'resumepdf', label: 'Résumé PDF', desc: 'Génère un résumé structuré', icon: FileDown, shortcut: '/resumepdf' },
  { id: 'exportmd', label: 'Exporter Markdown', desc: 'Télécharge en Markdown', icon: FileDown, shortcut: '/exportmd' },
  { id: 'copiernotion', label: 'Copier pour Notion', desc: 'Format Notion presse-papier', icon: Copy, shortcut: '/copiernotion' },
  { id: 'noprofil', label: 'Ignorer le profil', desc: 'Désactiver l\'injection profil', icon: UserMinus, shortcut: '/noprofil' },
] as const;

type SlashId = (typeof SLASH)[number]['id'];

// ─── Modes ─────────────────────────────────────────────────────────────────
const MODES: ModeConfig[] = [
  {
    id: 'fact_check', label: 'Fact-Check', short: 'Fact', icon: Search, color: '#E85D04',
    desc: 'Vérification rigoureuse d\'affirmations',
    systemPrompt: `Tu es un fact-checker professionnel senior, méthodique et impartial. Tu analyses les affirmations soumises avec la rigueur d'une rédaction de vérification des faits.

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
Reformulation précise et honnête.

Sois direct, sans concession. Continue la conversation sur ce mode si des questions de suivi sont posées.`,
  },
  {
    id: 'biais', label: 'Détection de biais', short: 'Biais', icon: Scale, color: '#7C3AED',
    desc: 'Biais cognitifs, rhétoriques et idéologiques',
    systemPrompt: `Tu es un expert en analyse critique des médias et détection des biais. Tu identifies et décortiques les biais dans les textes soumis.

Structure OBLIGATOIRE pour la première analyse :
## Biais détectés
Liste exhaustive : nom, définition courte, exemple précis dans le texte.
## Biais cognitifs / Biais rhétoriques / Biais idéologiques
Catégories détaillées.
## Techniques de manipulation
Loaded language, whataboutism, fausse équivalence.
## Score de neutralité
X/10 — justification.
## Reformulation neutre
Comment réécrire l'argument clé de façon impartiale.

Pour les questions de suivi, adapte ta réponse au fil de la conversation.`,
  },
  {
    id: 'sources', label: 'Analyse de sources', short: 'Sources', icon: Eye, color: '#0891B2',
    desc: 'Crédibilité et fiabilité des sources',
    systemPrompt: `Tu es un expert en évaluation des sources journalistiques et scientifiques. Tu analyses chaque source avec rigueur.

Pour chaque source identifiée :
- **Crédibilité** : A/B/C/D avec justification
- **Intérêts & conflits** : financement, affiliations
- **Expertise réelle** : est-ce vraiment un expert du sujet ?
- **Vérifiabilité** : primaire / secondaire / anonyme
- **Signaux d'alerte** : antécédents, biais connus
- **Recommandation** : utiliser / précaution / éviter

**Synthèse globale** à la fin. Continue la conversation si l'utilisateur pose des questions.`,
  },
  {
    id: 'interview_prep', label: 'Préparation Interview', short: 'Interview', icon: FileText, color: '#E85D04',
    desc: 'Questions incisives pour interviews',
    systemPrompt: `Tu es un journaliste d'investigation senior spécialisé dans les interviews confrontationnelles. Tu prépares des dossiers d'interview complets.

Structure pour la première demande :
## Contexte stratégique
Ce que l'interviewé veut éviter, ses angles morts, ses contradictions connues.
## Questions d'ouverture (3)
Directes, non-complaisantes.
## Questions de fond (6)
Pour creuser les contradictions et positions fragiles.
## Questions pièges (3)
En apparence anodines mais révélatrices.
## Relances préparées
Pour les 3 réponses évasives probables.
## Documents à avoir en main
Chiffres, déclarations passées à citer.

Continue et affine selon les retours de l'utilisateur.`,
  },
  {
    id: 'communique', label: 'Décryptage CP', short: 'CP', icon: FileText, color: '#059669',
    desc: 'Analyse critique de communiqués de presse',
    systemPrompt: `Tu es un journaliste senior expert en décryptage de communication institutionnelle.

## Message voulu
Ce que l'émetteur veut que vous reteniez.
## Ce qui est dit vs ce qui est tu
Informations absentes, contexte omis délibérément.
## Chiffres & données
Cherry-picking, ordres de grandeur, comparaisons manquantes.
## Langage codé
Traduction en langage direct de chaque formulation édulcorée.
## Spin identifié
Techniques de communication utilisées.
## 5 questions à poser à l'émetteur
## Angle journalistique indépendant
## Note de transparence
X/10 — évaluation globale.`,
  },
  {
    id: 'spin', label: 'Anti-Spin', short: 'Spin', icon: AlertTriangle, color: '#DC2626',
    desc: 'Détection de propagande et manipulation',
    systemPrompt: `Tu es un expert en techniques de propagande, spin politique et manipulation de l'opinion.

## Techniques de spin utilisées
Liste exhaustive avec exemple précis dans le texte.
## Charged language & Structures de manipulation
Fausse urgence, faux consensus, enemy framing, appels irrationnels.
## Omissions stratégiques
Ce qui est délibérément absent.
## Réalité vs message
Ce que les faits disent vs ce que le message implique.
## Objectif caché
Quel comportement ou opinion veut-on induire ?
## Version désintoxiquée
Réécriture du message clé sans manipulation.

**Score de manipulation : X/10** — verdict final.`,
  },
  {
    id: 'redaction', label: 'Critique Rédaction', short: 'Rédac.', icon: Zap, color: '#B45309',
    desc: 'Critique professionnelle de textes journalistiques',
    systemPrompt: `Tu es un rédacteur en chef exigeant d'un grand quotidien national. Tu critiques les textes soumis sans ménagement.

## Jugement global
**Publiable / À retravailler / À refaire** — justification immédiate.
## Structure
Accroche, transitions, conclusion — ce qui fonctionne et non.
## Clarté & précision / Équilibre & contradictoire / Solidité factuelle
## Style
Longueur des phrases, répétitions, ton.
## Titre & chapeau
Reflètent-ils honnêtement le contenu ?
## 3 coupures prioritaires / 3 ajouts nécessaires

Pour les questions de suivi, affine ta critique selon les retours.`,
  },
  {
    id: 'angle', label: 'Story Angle', short: 'Angle', icon: Target, color: '#0891B2',
    desc: 'Angle original et percutant pour un sujet',
    systemPrompt: `Tu es un journaliste d'investigation créatif, reconnu pour tes angles originaux.

## Angle principal recommandé
Le plus fort et original. Titre provisoire + pourquoi ça marche.
## 4 angles alternatifs
Chacun avec titre et problématique.
## L'angle contre-intuitif
Celui que personne ne prendrait mais qui révèle quelque chose de plus profond.
## L'angle données
Si des chiffres peuvent transformer ce sujet en investigation.
## Public cible & Potentiel de série
## À éviter
Les angles trop évidents ou déjà traités.`,
  },
];

const MODES_MAP = Object.fromEntries(MODES.map(m => [m.id, m])) as Record<ModeId, ModeConfig>;

// ─── File helpers ───────────────────────────────────────────────────────────
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

async function readFile(file: File): Promise<Attachment> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const type = getFileType(file.name);
    reader.onload = (e) => {
      const content = e.target?.result as string ?? '';
      resolve({ id: uid(), name: file.name, type, size: file.size, content });
    };
    if (type === 'image') {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
}

// ─── Main component ────────────────────────────────────────────────────────
type Props = { onBack: () => void; user: FirebaseUser | null };

export default function JournalismeApp({ onBack }: Props) {
  // Sessions & messages
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeSession = sessions.find(s => s.id === activeId) ?? null;

  // Mode
  const [mode, setMode] = useState<ModeConfig>(MODES[0]);
  const [modePickerOpen, setModePickerOpen] = useState(false);

  // Input
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Slash commands
  const slashMatches = input.startsWith('/')
    ? SLASH.filter(c => c.shortcut.includes(input.toLowerCase()))
    : [];
  const slashOpen = slashMatches.length > 0;
  const [slashIdx, setSlashIdx] = useState(0);
  const safeIdx = Math.min(slashIdx, slashMatches.length - 1);

  // Voice
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);

  // Sidebar (mobile)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.msgs.length, sending]);

  // Auto-resize textarea
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = 'auto';
    taRef.current.style.height = Math.min(taRef.current.scrollHeight, 140) + 'px';
  }, [input]);

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 3);
    const processed = await Promise.all(arr.map(readFile));
    setAttachments(prev => [...prev, ...processed].slice(0, 3));
  }, []);

  // ── Voice ─────────────────────────────────────────────────────────────────
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

  // ── Slash command handler ─────────────────────────────────────────────────
  const handleSlash = useCallback((id: SlashId) => {
    setInput('');
    setModePickerOpen(false);
    if (!activeSession) return;

    if (id === 'clear') {
      setSessions(prev => prev.map(s => s.id === activeId ? { ...s, msgs: [] } : s));
      return;
    }
    if (id === 'oublier') {
      const cmdMsg: Msg = { id: uid(), role: 'command', content: '— Contexte effacé — L\'IA repart de zéro —', modeId: mode.id, ts: new Date() };
      setSessions(prev => prev.map(s => s.id === activeId ? { ...s, msgs: [...s.msgs, cmdMsg] } : s));
      return;
    }
    if (id === 'note') {
      sendMessage('/note — Évalue notre échange et donne-moi des conseils ciblés sur ma façon de travailler le sujet.', []);
      return;
    }
    if (id === 'resumepdf') {
      sendMessage('/resumepdf — Génère un résumé structuré de notre analyse.', []);
      return;
    }
    if (id === 'exportmd') {
      if (!activeSession.msgs.length) return;
      const md = activeSession.msgs
        .filter(m => m.role !== 'command')
        .map(m => `**${m.role === 'user' ? 'Utilisateur' : 'Challenger Reporter'}**\n\n${m.content}`)
        .join('\n\n---\n\n');
      const blob = new Blob([md], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `CR-${activeSession.title.slice(0, 30)}.md`;
      a.click();
      return;
    }
    if (id === 'copiernotion') {
      if (!activeSession.msgs.length) return;
      const md = activeSession.msgs
        .filter(m => m.role !== 'command')
        .map(m => `**${m.role === 'user' ? 'Vous' : 'Challenger Reporter'}**\n\n${m.content}`)
        .join('\n\n---\n\n');
      navigator.clipboard.writeText(md).catch(() => {});
      return;
    }
    if (id === 'noprofil') {
      const cmdMsg: Msg = { id: uid(), role: 'command', content: '— Mode sans profil activé —', modeId: mode.id, ts: new Date() };
      setSessions(prev => prev.map(s => s.id === activeId ? { ...s, msgs: [...s.msgs, cmdMsg] } : s));
      return;
    }
  }, [activeSession, activeId, mode.id]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, atts: Attachment[]) => {
    if ((!text.trim() && atts.length === 0) || sending) return;

    const currentMode = mode;

    // Build attachment content for API
    let fullText = text.trim();
    if (atts.length > 0) {
      const attParts = atts.map(a => {
        if (a.type === 'image') return `[Image: ${a.name}]`;
        return `\n\n--- Fichier: ${a.name} ---\n${a.content.slice(0, 4000)}`;
      });
      fullText += attParts.join('');
    }

    const userMsgId = uid();
    const asstMsgId = uid();
    const now = new Date();

    const userMsg: Msg = { id: userMsgId, role: 'user', content: text.trim(), modeId: currentMode.id, attachments: atts, ts: now };
    const asstMsg: Msg = { id: asstMsgId, role: 'assistant', content: '', modeId: currentMode.id, ts: now };

    let targetId = activeId;

    if (!activeId) {
      // New session
      const sid = uid();
      const session: Session = {
        id: sid,
        title: `${currentMode.label} — ${text.slice(0, 40)}${text.length > 40 ? '…' : ''}`,
        modeId: currentMode.id,
        msgs: [userMsg, asstMsg],
        createdAt: now,
      };
      setSessions(prev => [session, ...prev]);
      setActiveId(sid);
      targetId = sid;
    } else {
      setSessions(prev => prev.map(s =>
        s.id !== activeId ? s : { ...s, msgs: [...s.msgs, userMsg, asstMsg] }
      ));
    }

    setSending(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Build history from current session (excluding the new pair)
      const history = (activeSession?.msgs ?? [])
        .filter(m => m.role !== 'command')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: 'mistral-large-latest',
          temperature: 0.3,
          stream: true,
          messages: [
            { role: 'system', content: currentMode.systemPrompt },
            ...history,
            { role: 'user', content: fullText },
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
              setSessions(prev => prev.map(s =>
                s.id !== targetId ? s : {
                  ...s,
                  msgs: s.msgs.map(m => m.id === asstMsgId ? { ...m, content: acc } : m),
                }
              ));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setSessions(prev => prev.map(s =>
          s.id !== targetId ? s : {
            ...s,
            msgs: s.msgs.map(m => m.id === asstMsgId ? { ...m, content: '*Erreur de connexion. Réessayez.*' } : m),
          }
        ));
      }
    } finally {
      setSending(false);
    }
  }, [mode, activeId, activeSession, sending]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (slashOpen && slashMatches[safeIdx]) {
      handleSlash(slashMatches[safeIdx].id as SlashId);
      setInput('');
      return;
    }
    const text = input;
    setInput('');
    setAttachments([]);
    await sendMessage(text, attachments);
  }, [slashOpen, slashMatches, safeIdx, handleSlash, input, attachments, sendMessage]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => Math.min(i + 1, slashMatches.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); handleSlash(slashMatches[safeIdx].id as SlashId); setInput(''); return; }
      if (e.key === 'Escape') { setInput(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }, [slashOpen, slashMatches, safeIdx, handleSlash, handleSubmit]);

  const currentMode = activeSession ? MODES_MAP[activeSession.modeId] : mode;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden" style={{ background: '#0d0d0d' }}>

      {/* ═══════════════════════════════════════════════════════════════════
          TOP BAR
      ════════════════════════════════════════════════════════════════════ */}
      <div
        className="flex-shrink-0 flex items-stretch border-b z-20"
        style={{ background: '#111', borderColor: '#E85D04', borderBottomWidth: '2px', minHeight: '52px' }}
      >
        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center justify-center w-12 flex-shrink-0 hover:bg-white/5 transition-colors"
          style={{ color: '#E85D04', borderRight: '1px solid rgba(232,93,4,0.15)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Logo + title */}
        <div className="flex items-center gap-3 px-4 flex-1 min-w-0">
          <CRLogo size={30} />
          <div className="min-w-0">
            <p className="text-[13px] font-black uppercase tracking-widest text-white leading-none truncate">
              Challenger Reporter
            </p>
            <p className="text-[8px] font-bold uppercase tracking-widest mt-0.5 truncate" style={{ color: 'rgba(232,93,4,0.55)' }}>
              Suite journalisme · Moteur Challenger IA
            </p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-stretch flex-shrink-0" style={{ borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
          {/* New session */}
          <button
            onClick={() => { setActiveId(null); setInput(''); setAttachments([]); setSidebarOpen(false); }}
            className="flex items-center gap-1.5 px-4 text-white/25 hover:text-white/70 hover:bg-white/5 transition-all text-[9px] font-black uppercase tracking-widest"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nouveau</span>
          </button>
          {/* Mobile sessions toggle */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="flex items-center justify-center w-11 text-white/30 hover:text-white/70 hover:bg-white/5 transition-all md:hidden"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          BODY: sidebar + chat
      ════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">

        {/* ── Left sidebar ── */}
        <AnimatePresence>
          {(sidebarOpen || true) && (
            <motion.div
              initial={false}
              className={cx(
                'flex-shrink-0 flex-col border-r overflow-y-auto',
                'w-52 hidden md:flex',
              )}
              style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.05)' }}
            >
              {/* Modes */}
              <div className="px-3 pt-5 pb-2">
                <p className="text-[7px] font-black uppercase tracking-widest text-white/20 px-1 mb-2">Modes d'analyse</p>
                <div className="space-y-0.5">
                  {MODES.map((m) => {
                    const Icon = m.icon;
                    const isActive = (activeSession?.modeId ?? mode.id) === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setMode(m); if (!activeSession) return; }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-all group"
                        style={{ borderLeft: `2px solid ${isActive ? m.color : 'transparent'}` }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        <Icon className="w-3 h-3 flex-shrink-0 transition-colors" style={{ color: isActive ? m.color : 'rgba(255,255,255,0.28)' }} />
                        <span className="text-[10px] font-bold truncate transition-colors" style={{ color: isActive ? m.color : 'rgba(255,255,255,0.38)' }}>
                          {m.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sessions */}
              {sessions.length > 0 && (
                <div className="px-3 py-3 border-t mt-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <p className="text-[7px] font-black uppercase tracking-widest text-white/20 px-1 mb-2">Sessions</p>
                  <div className="space-y-0.5">
                    {sessions.map(s => {
                      const sm = MODES_MAP[s.modeId];
                      return (
                        <button
                          key={s.id}
                          onClick={() => setActiveId(s.id)}
                          className={cx('w-full text-left px-2.5 py-2 transition-all')}
                          style={{ background: activeId === s.id ? 'rgba(255,255,255,0.05)' : 'transparent', borderLeft: `2px solid ${activeId === s.id ? sm.color : 'transparent'}` }}
                        >
                          <p className="text-[7px] font-black uppercase tracking-widest mb-0.5" style={{ color: sm.color }}>{sm.short}</p>
                          <p className="text-[9px] text-white/35 leading-tight truncate">{s.title.replace(`${sm.label} — `, '')}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile sidebar overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="fixed inset-0 z-50 flex md:hidden"
            >
              <div className="w-64 h-full flex flex-col border-r overflow-y-auto" style={{ background: '#0d0d0d', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Modes</p>
                  <button onClick={() => setSidebarOpen(false)} className="text-white/30 hover:text-white/70"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-3 space-y-0.5">
                  {MODES.map(m => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setMode(m); setSidebarOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all"
                        style={{ borderLeft: `2px solid ${mode.id === m.id ? m.color : 'transparent'}` }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: mode.id === m.id ? m.color : 'rgba(255,255,255,0.3)' }} />
                        <div>
                          <p className="text-[11px] font-bold" style={{ color: mode.id === m.id ? m.color : 'rgba(255,255,255,0.5)' }}>{m.label}</p>
                          <p className="text-[9px] text-white/25">{m.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 bg-black/60" onClick={() => setSidebarOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main chat ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {/* Active mode indicator bar */}
          <div
            className="flex-shrink-0 flex items-center gap-3 px-5 py-2 border-b"
            style={{ background: `${currentMode.color}08`, borderColor: `${currentMode.color}18` }}
          >
            {/* Mode selector pill */}
            <div className="relative">
              <button
                onClick={() => setModePickerOpen(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 transition-all"
                style={{ background: `${currentMode.color}18`, border: `1px solid ${currentMode.color}30` }}
              >
                {(() => { const Icon = currentMode.icon; return <Icon className="w-3 h-3" style={{ color: currentMode.color }} />; })()}
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: currentMode.color }}>
                  {currentMode.label}
                </span>
                <ChevronDown className="w-2.5 h-2.5" style={{ color: currentMode.color }} />
              </button>

              {/* Mode picker dropdown */}
              <AnimatePresence>
                {modePickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    className="absolute left-0 top-full mt-2 z-50 border overflow-hidden"
                    style={{ background: '#161616', borderColor: 'rgba(255,255,255,0.1)', minWidth: '200px', boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}
                  >
                    {MODES.map(m => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.id}
                          onClick={() => { setMode(m); setModePickerOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-white/5 last:border-0 hover:bg-white/5"
                        >
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: m.color }} />
                          <div>
                            <p className="text-[11px] font-bold text-white">{m.label}</p>
                            <p className="text-[9px] text-white/30">{m.desc}</p>
                          </div>
                          {mode.id === m.id && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="w-px h-3 bg-white/10" />
            <span className="text-[8px] text-white/20 font-medium">{activeSession ? `${activeSession.msgs.filter(m => m.role === 'user').length} analyse(s)` : 'Nouvelle session'}</span>
            {activeSession && (
              <>
                <div className="w-px h-3 bg-white/10" />
                <button
                  onClick={() => { abortRef.current?.abort(); setSessions(prev => prev.filter(s => s.id !== activeId)); setActiveId(null); }}
                  className="text-[8px] text-white/20 hover:text-white/50 font-medium transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset</span>
                </button>
              </>
            )}
          </div>

          {/* Messages zone */}
          <div
            className="flex-1 overflow-y-auto px-5 py-6 space-y-5"
            onClick={() => modePickerOpen && setModePickerOpen(false)}
          >
            {!activeSession || activeSession.msgs.length === 0 ? (
              /* Empty state */
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-12"
              >
                <div className="mb-6 relative">
                  <div
                    className="w-16 h-16 flex items-center justify-center mx-auto border-2"
                    style={{ background: 'rgba(232,93,4,0.08)', borderColor: 'rgba(232,93,4,0.2)' }}
                  >
                    <CRLogo size={42} />
                  </div>
                  <div
                    className="absolute -bottom-1 -right-1 w-5 h-5 flex items-center justify-center"
                    style={{ background: currentMode.color }}
                  >
                    <Sparkles className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>
                <h2 className="text-[18px] font-black text-white uppercase tracking-tight mb-1">
                  {currentMode.label}
                </h2>
                <p className="text-[11px] text-white/30 leading-relaxed mb-8">{currentMode.desc}</p>

                {/* Suggestion chips */}
                <div className="grid grid-cols-1 gap-2 w-full max-w-sm text-left">
                  {[
                    mode.id === 'fact_check' ? '"La France est le premier producteur de vin mondial"' :
                    mode.id === 'biais' ? 'Collez un article de presse à analyser…' :
                    mode.id === 'angle' ? 'Un événement local devient viral sur les réseaux sociaux' :
                    mode.id === 'interview_prep' ? 'Interview d\'un PDG sur les licenciements de son groupe' :
                    'Collez votre contenu à analyser…',
                    mode.id === 'spin' ? 'Analysez un discours politique récent' :
                    mode.id === 'redaction' ? 'Critiquez votre brouillon d\'article' :
                    mode.id === 'communique' ? 'Collez un communiqué de presse officiel' :
                    'Ou posez une question sur la méthode…',
                  ].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(s); taRef.current?.focus(); }}
                      className="text-left px-3 py-2.5 border text-[11px] text-white/40 hover:text-white/70 transition-all"
                      style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${currentMode.color}30`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.07)'; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              activeSession.msgs.map((msg) => {
                const modeCfg = MODES_MAP[msg.modeId];

                if (msg.role === 'command') {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="text-[9px] font-bold text-white/20 border border-white/8 px-3 py-1">{msg.content}</span>
                    </div>
                  );
                }

                if (msg.role === 'user') {
                  return (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end gap-3">
                      <div className="max-w-[75%]">
                        {/* Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 justify-end mb-2">
                            {msg.attachments.map(att => (
                              <div key={att.id} className="flex items-center gap-1.5 px-2.5 py-1.5 border text-[10px] text-white/50" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}>
                                <FileIcon type={att.type} />
                                <span className="max-w-[120px] truncate">{att.name}</span>
                                <span className="text-white/25">{fmtSize(att.size)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div
                          className="px-4 py-3 text-[12px] text-white/85 leading-relaxed border"
                          style={{ background: `${modeCfg.color}12`, borderColor: `${modeCfg.color}25` }}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-7 h-7 flex items-center justify-center" style={{ background: `${modeCfg.color}18` }}>
                        <CRLogo size={18} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: modeCfg.color }}>Challenger Reporter</span>
                        <span className="text-[7px] text-white/15">· {modeCfg.label}</span>
                      </div>
                      <div
                        className="px-5 py-4 border text-[12px] leading-relaxed"
                        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}
                      >
                        {msg.content ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h2: ({ children }) => (
                                <h2 className="text-[10px] font-black uppercase tracking-widest mt-5 mb-2 first:mt-0" style={{ color: modeCfg.color }}>{children}</h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-[10px] font-black text-white/60 uppercase tracking-wider mt-3 mb-1">{children}</h3>
                              ),
                              p: ({ children }) => (
                                <p className="text-[12px] text-white/70 mb-2.5 leading-relaxed last:mb-0">{children}</p>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-bold text-white">{children}</strong>
                              ),
                              ul: ({ children }) => <ul className="mb-3 space-y-1.5">{children}</ul>,
                              ol: ({ children }) => <ol className="mb-3 space-y-1.5 list-decimal list-inside">{children}</ol>,
                              li: ({ children }) => (
                                <li className="flex items-start gap-2 text-[11px] text-white/60">
                                  <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: modeCfg.color }} />
                                  <span>{children}</span>
                                </li>
                              ),
                              hr: () => <div className="my-4 border-t border-white/8" />,
                              code: ({ children }) => (
                                <code className="px-1.5 py-0.5 text-[11px] font-mono" style={{ background: 'rgba(255,255,255,0.07)', color: modeCfg.color }}>{children}</code>
                              ),
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

          {/* ═══════════════════════════════════════════════════════════════
              INPUT ZONE
          ══════════════════════════════════════════════════════════════ */}
          <div
            className="flex-shrink-0 border-t"
            style={{ background: '#0f0f0f', borderColor: 'rgba(255,255,255,0.06)' }}
          >
            {/* Attachments preview */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 pt-3 flex flex-wrap gap-2"
                >
                  {attachments.map(att => (
                    <div key={att.id} className="flex items-center gap-1.5 px-2.5 py-1.5 border text-[10px] text-white/50" style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${currentMode.color}25` }}>
                      <FileIcon type={att.type} />
                      <span className="max-w-[120px] truncate">{att.name}</span>
                      <span className="text-white/25">{fmtSize(att.size)}</span>
                      <button onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} className="ml-1 text-white/25 hover:text-white/70">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Slash suggestions */}
            <AnimatePresence>
              {slashOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="border-t mx-4 mt-3"
                  style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#161616' }}
                >
                  <p className="text-[7px] font-black uppercase tracking-widest text-white/20 px-3 pt-2 pb-1">Commandes</p>
                  {slashMatches.map((cmd, i) => {
                    const CmdIcon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => { handleSlash(cmd.id as SlashId); setInput(''); }}
                        onMouseEnter={() => setSlashIdx(i)}
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
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-4 py-4 flex items-center gap-4 border-t"
                  style={{ borderColor: `${currentMode.color}20`, background: `${currentMode.color}08` }}
                >
                  <div className="flex items-center gap-2">
                    {[0,1,2,3,4].map(i => (
                      <motion.div
                        key={i}
                        animate={listening ? { scaleY: [0.3, 1, 0.3], transition: { repeat: Infinity, duration: 0.6, delay: i * 0.1 } } : { scaleY: 0.3 }}
                        className="w-1 rounded-full origin-bottom"
                        style={{ height: '24px', backgroundColor: currentMode.color }}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] font-bold text-white/60 flex-1">
                    {listening ? 'En écoute…' : 'Appuyez sur le micro pour parler'}
                  </p>
                  <button
                    onClick={listening ? stopVoice : startVoice}
                    className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors"
                    style={{ background: listening ? '#DC2626' : currentMode.color }}
                  >
                    {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    {listening ? 'Stop' : 'Parler'}
                  </button>
                  <button onClick={() => { stopVoice(); setVoiceOpen(false); }} className="text-white/25 hover:text-white/70">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input bar */}
            <div className="flex gap-2 items-end p-3">
              {/* File input hidden */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,.pdf,.docx,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.go,.rs,.html,.css,.xml,.yaml,.yml,.sh,.sql"
                onChange={e => handleFiles(e.target.files)}
              />

              {/* Paperclip */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center border transition-all disabled:opacity-30"
                style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${currentMode.color}50`; (e.currentTarget as HTMLButtonElement).style.color = currentMode.color; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)'; }}
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Mic */}
              <button
                type="button"
                onClick={() => setVoiceOpen(v => !v)}
                disabled={sending}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center border transition-all disabled:opacity-30"
                style={{
                  borderColor: voiceOpen ? `${currentMode.color}60` : 'rgba(255,255,255,0.08)',
                  background: voiceOpen ? `${currentMode.color}15` : 'transparent',
                  color: voiceOpen ? currentMode.color : 'rgba(255,255,255,0.3)',
                }}
              >
                <Mic className="w-4 h-4" />
              </button>

              {/* Slash */}
              <button
                type="button"
                onClick={() => { setInput(input === '' ? '/' : ''); taRef.current?.focus(); }}
                disabled={sending}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center border transition-all disabled:opacity-30"
                style={{
                  borderColor: slashOpen ? `${currentMode.color}60` : 'rgba(255,255,255,0.08)',
                  background: slashOpen ? `${currentMode.color}15` : 'transparent',
                  color: slashOpen ? currentMode.color : 'rgba(255,255,255,0.3)',
                }}
              >
                <Slash className="w-4 h-4" />
              </button>

              {/* Textarea */}
              <div className="flex-1 relative">
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={e => { setInput(e.target.value); setSlashIdx(0); }}
                  onKeyDown={handleKeyDown}
                  placeholder={`${currentMode.label} — ${currentMode.desc}`}
                  rows={1}
                  className="w-full border px-4 py-3 text-[12px] text-white placeholder:text-white/18 focus:outline-none resize-none leading-relaxed transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    maxHeight: '140px',
                    overflow: 'auto',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = `${currentMode.color}45`)}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
              </div>

              {/* Send */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={(!input.trim() && attachments.length === 0) || sending}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center transition-all disabled:opacity-25"
                style={{ background: currentMode.color }}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Send className="w-4 h-4 text-white" />
                )}
              </button>
            </div>

            <p className="text-center text-[7px] text-white/10 pb-2 select-none">
              Challenger Reporter peut se tromper — vérifiez les informations importantes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
