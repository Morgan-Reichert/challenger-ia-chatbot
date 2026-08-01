import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import PushToggle from './PushToggle';
import CognitiveCard from './CognitiveCard';
import PrivacyPanel from './PrivacyPanel';
import ApiKeysPanel from './ApiKeysPanel';
import AccessibilitePanel from './AccessibilitePanel';
import DossierTravailPanel from './DossierTravailPanel';
import SecurityPanel from './SecurityPanel';
import FacturationPanel from './FacturationPanel';
import ReutilisationPanel from './ReutilisationPanel';
import SupportPanel from './SupportPanel';
import {
  ArrowLeft, User, Briefcase, Brain, Heart, Download, Upload,
  Trash2, Check, X, Sparkles, FileText, Zap, HelpCircle,
  CreditCard, BarChart2, Crown, Coins, TrendingUp, ShieldCheck, Zap as ZapIcon, MessageSquare,
  SlidersHorizontal, Info, Bell, KeyRound, ChevronRight,
  Leaf, Car, Mail, Smartphone, PenLine, Image as ImageIcon, Package, Moon, RotateCcw,
  BookLock, FolderOpen,
  Accessibility, LifeBuoy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  type UserProfile, type NeuroTag, type BigFiveResult,
  NEURO_TAGS, MBTI_TYPES, saveProfile, exportProfile, importProfileFromJson, EMPTY_PROFILE,
} from './userProfile';
import { SECTEURS } from './comportement';
import { CREDIT_PACKS, type Plan } from './supabase';
import {
  CUSTOM_PERSONA_MAX_NAME, CUSTOM_PERSONA_MAX_DESC,
  validateCustomPrompt, exportCustomPersonaToJson, parseCustomPersonaJson,
} from './debatePersonas';

function cx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Big Five quiz data ───────────────────────────────────────────────────────

const QUIZ_QUESTIONS = [
  { dim: 'O' as const, text: "J'aime explorer de nouvelles idées, même hors de mon domaine." },
  { dim: 'O' as const, text: "La curiosité intellectuelle me caractérise profondément." },
  { dim: 'C' as const, text: "Je planifie mes actions et je tiens mes engagements." },
  { dim: 'C' as const, text: "Je suis rigoureux(se) et méthodique dans mon travail." },
  { dim: 'E' as const, text: "Je me sens rechargé(e) après avoir passé du temps avec les autres." },
  { dim: 'E' as const, text: "Je m'exprime facilement et spontanément en groupe." },
  { dim: 'A' as const, text: "J'écoute vraiment avant de formuler ma réponse." },
  { dim: 'A' as const, text: "Je cherche l'harmonie et j'évite les conflits inutiles." },
  { dim: 'N' as const, text: "Le stress et l'anxiété influencent souvent mes choix." },
  { dim: 'N' as const, text: "Je ressens mes émotions très intensément." },
];

const QUIZ_DIM: Record<string, { label: string; color: string; key: keyof BigFiveResult; desc: string }> = {
  O: { label: 'Ouverture',      color: '#8B5CF6', key: 'openness',          desc: 'Curiosité, créativité, ouverture aux expériences' },
  C: { label: 'Conscience',     color: '#3B82F6', key: 'conscientiousness', desc: 'Organisation, rigueur, fiabilité' },
  E: { label: 'Extraversion',   color: '#10B981', key: 'extraversion',      desc: 'Sociabilité, énergie, assertivité' },
  A: { label: 'Agréabilité',    color: '#F59E0B', key: 'agreeableness',     desc: 'Coopération, empathie, harmonie' },
  N: { label: 'Neuroticisme',   color: '#EF4444', key: 'neuroticism',       desc: 'Sensibilité émotionnelle, réactivité au stress' },
};

const DIM_ORDER = ['O', 'C', 'E', 'A', 'N'] as const;

const ANSWER_LABELS = ['Pas du tout', 'Plutôt non', 'Neutre', 'Plutôt oui', 'Tout à fait'];

function computeBigFive(answers: Record<number, number>): BigFiveResult {
  const score = (i1: number, i2: number): number => {
    const avg = (answers[i1] + answers[i2]) / 2; // 1–5
    return Math.round(((avg - 1) / 4) * 9) + 1;  // 1–10
  };
  return {
    openness:          score(0, 1),
    conscientiousness: score(2, 3),
    extraversion:      score(4, 5),
    agreeableness:     score(6, 7),
    neuroticism:       score(8, 9),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  icon: Icon, title, accent, children,
}: {
  icon: React.ElementType;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-2 border-[#141414]/10 bg-white" style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.06)' }}>
      <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: `2px solid ${accent}20` }}>
        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ background: `${accent}12`, border: `1.5px solid ${accent}30` }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <h2 className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</h2>
      </div>
      <div className="px-5 py-5 space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, action, children }: { label: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/50">{label}</p>
          {action}
        </div>
        {hint && <p className="text-[10px] text-[#141414]/30 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const INPUT_BASE = 'w-full px-4 py-3 border-2 border-[#141414]/10 focus:outline-none text-sm font-medium bg-white transition-colors';
const TEXTAREA_BASE = INPUT_BASE + ' resize-none leading-relaxed';

// ─── Persona Studio — création, export et import de personas custom ───────

const CUSTOM_PERSONA_LS_KEY = 'challenger:imported_custom_persona';

function PersonaStudioSection() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Hydrate depuis localStorage au montage
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_PERSONA_LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj.name === 'string') setName(obj.name);
      if (obj && typeof obj.description === 'string') setDescription(obj.description);
    } catch { /* noop */ }
  }, []);

  const persist = (n: string, d: string) => {
    try {
      localStorage.setItem(CUSTOM_PERSONA_LS_KEY, JSON.stringify({
        name: n.slice(0, CUSTOM_PERSONA_MAX_NAME),
        description: d.slice(0, CUSTOM_PERSONA_MAX_DESC),
        updatedAt: new Date().toISOString(),
      }));
    } catch { /* quota — ignore */ }
  };

  const handleSave = () => {
    setError(null); setStatus(null);
    const v = validateCustomPrompt(name, description);
    if (!v.ok) { setError(v.error ?? 'Contenu non autorisé.'); return; }
    persist(name, description);
    setStatus('Persona enregistré localement.');
    setTimeout(() => setStatus(null), 2400);
  };

  const handleExport = () => {
    setError(null); setStatus(null);
    const v = validateCustomPrompt(name, description);
    if (!v.ok) { setError(v.error ?? 'Renseigne d\'abord un persona valide avant d\'exporter.'); return; }
    const json = exportCustomPersonaToJson(name, description, 'challengeria.com');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `challenger-persona-${name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40) || 'custom'}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    persist(name, description);
    setStatus('Fichier .json téléchargé.');
    setTimeout(() => setStatus(null), 2400);
  };

  const handleImportFile = async (file: File) => {
    setError(null); setStatus(null);
    try {
      const txt = await file.text();
      const result = parseCustomPersonaJson(txt);
      if (!result.ok) { setError(result.error); return; }
      setName(result.persona.name);
      setDescription(result.persona.description);
      persist(result.persona.name, result.persona.description);
      setStatus(`Persona « ${result.persona.name} » importé.`);
      setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      console.error('persona import error:', e);
      setError('Impossible de lire le fichier.');
    }
  };

  const handleCopyJson = async () => {
    setError(null); setStatus(null);
    const v = validateCustomPrompt(name, description);
    if (!v.ok) { setError(v.error ?? 'Renseigne d\'abord un persona valide.'); return; }
    try {
      await navigator.clipboard.writeText(exportCustomPersonaToJson(name, description, 'challengeria.com'));
      persist(name, description);
      setStatus('JSON copié dans le presse-papier.');
      setTimeout(() => setStatus(null), 2400);
    } catch {
      setError('Impossible de copier — autorise le presse-papier dans le navigateur.');
    }
  };

  return (
    <Section icon={Sparkles} title="Persona Studio (custom)" accent="#7C3AED">
      <p className="text-[11px] text-[#141414]/55 leading-relaxed">
        Crée ton propre interlocuteur (prof exigeant, investisseur agressif, client difficile, jury fictif…).
        Le persona est stocké <strong>localement sur cet appareil</strong>. Tu peux aussi <strong>exporter</strong> un fichier .json
        pour le partager — ou <strong>importer</strong> celui de quelqu'un d'autre.
      </p>

      <Field label={`Nom du persona (max ${CUSTOM_PERSONA_MAX_NAME})`}>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value.slice(0, CUSTOM_PERSONA_MAX_NAME))}
          placeholder="Ex : Prof de droit exigeant, Client difficile, Investisseur agressif…"
          maxLength={CUSTOM_PERSONA_MAX_NAME}
          className={cx(INPUT_BASE, 'focus:border-[#7C3AED]')}
        />
      </Field>

      <Field
        label={`Description du persona (max ${CUSTOM_PERSONA_MAX_DESC})`}
        hint="Décris son style, ses obsessions, ses positions, ses formules typiques. C'est ça qui rendra le persona crédible."
      >
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value.slice(0, CUSTOM_PERSONA_MAX_DESC))}
          placeholder="Ex : Prof de droit constitutionnel à la retraite, formé à Sciences Po dans les années 70. Très exigeant sur la rigueur juridique, déteste les approximations. Parle en citant des arrêts du Conseil constitutionnel. Patient mais sec — pose des contre-exemples à chaque hypothèse de l'étudiant."
          rows={5}
          maxLength={CUSTOM_PERSONA_MAX_DESC}
          className={cx(TEXTAREA_BASE, 'focus:border-[#7C3AED]')}
        />
        <p className="text-[9px] text-[#141414]/30 mt-1 text-right">{description.length}/{CUSTOM_PERSONA_MAX_DESC}</p>
      </Field>

      {error && (
        <div className="px-3 py-2 bg-red-50 border-2 border-red-300 text-red-700 text-[11px]">{error}</div>
      )}
      {status && (
        <div className="px-3 py-2 bg-green-50 border-2 border-green-300 text-green-700 text-[11px]">{status}</div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="flex items-center gap-2 px-3 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:bg-[#141414]/10 disabled:text-[#141414]/30 text-white text-[10px] font-black uppercase tracking-widest transition-all"
        >
          <Check className="w-3 h-3" /> Enregistrer
        </button>
        <button
          onClick={handleExport}
          disabled={!name.trim()}
          className="flex items-center gap-2 px-3 py-2 border-2 border-[#7C3AED] text-[#7C3AED] hover:bg-[#7C3AED]/10 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-widest transition-all"
        >
          <Download className="w-3 h-3" /> Exporter .json
        </button>
        <button
          onClick={handleCopyJson}
          disabled={!name.trim()}
          className="flex items-center gap-2 px-3 py-2 border-2 border-[#141414]/15 text-[#141414]/60 hover:border-[#141414]/30 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-widest transition-all"
        >
          <FileText className="w-3 h-3" /> Copier JSON
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 border-2 border-[#141414]/15 text-[#141414]/60 hover:border-[#141414]/30 text-[10px] font-black uppercase tracking-widest transition-all"
        >
          <Upload className="w-3 h-3" /> Importer .json
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
            try { (e.target as HTMLInputElement).value = ''; } catch { /* noop */ }
          }}
        />
      </div>
    </Section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  onBack: () => void;
  profile: UserProfile;
  onSave: (p: UserProfile) => void;
  subscription: Plan;
  dailyUsage: { count: number; date: string };
  weeklyUsage: { count: number; week: string };
  userCredits: number;
  totalCredits: number;
  illimite?: boolean;
  user: FirebaseUser | null;
  autoUseCredits: boolean;
  onAutoUseCreditsChange: (v: boolean) => void;
  showSuggestions: boolean;
  onShowSuggestionsChange: (v: boolean) => void;
  showDailyChallenge: boolean;
  onShowDailyChallengeChange: (v: boolean) => void;
  shares: { shareId: string; title: string; sharedAt: string }[];
  onRevokeShare: (shareId: string) => Promise<boolean>;
  onRefreshShares: () => void;
  onAccountDeleted: () => void;
};

/* ═══════════════════════════════════════════════════════════════════════════
   Arborescence des réglages

   Un menu de sections, chacune ouvrant soit une liste de sous-sections, soit
   directement son contenu. Les sections à contenu unique n'ont pas de niveau
   intermédiaire : imposer un clic sur une liste d'un seul élément allongerait
   le chemin sans rien clarifier.
   ═════════════════════════════════════════════════════════════════════════ */
type SousSection = { id: string; label: string; icon: LucideIcon; hint: string };
type SectionReglages = {
  id: string;
  label: string;
  icon: LucideIcon;
  accent: string;
  desc: string;
  sous?: SousSection[];
};

const ARBORESCENCE: SectionReglages[] = [
  {
    id: 'profil', label: 'Profil IA', icon: User, accent: '#5D7BFF',
    desc: "Ce que l'IA sait de vous et mobilise dans vos échanges.",
    sous: [
      { id: 'identite',  label: 'Identité',               icon: User,      hint: 'Nom affiché, parcours de vie' },
      { id: 'parcours',  label: 'Parcours professionnel', icon: Briefcase, hint: 'Métier, secteur, expertise' },
      { id: 'caractere', label: 'Personnalité',           icon: Brain,     hint: 'Type MBTI et traits Big Five' },
      { id: 'neuro',     label: 'Profil neuro',           icon: Zap,       hint: 'Fonctionnement cognitif — données sensibles' },
      { id: 'interets',  label: "Centres d'intérêt",      icon: Heart,     hint: 'Sujets qui vous mobilisent' },
      { id: 'fichier',   label: 'Données du profil',      icon: Download,  hint: 'Importer, exporter, effacer le profil' },
    ],
  },
  {
    id: 'securite', label: 'Sécurité du compte', icon: ShieldCheck, accent: '#EF4444',
    desc: 'Mot de passe, adresse vérifiée et appareils connectés.',
  },
  {
    id: 'progression', label: 'Progression', icon: TrendingUp, accent: '#10B981',
    desc: 'Votre rang, vos forces repérées et ce qui reste à travailler.',
  },
  {
    id: 'personnalisation', label: 'Personnalisation', icon: SlidersHorizontal, accent: '#8B5CF6',
    desc: 'Affichage du chat, notifications, personas et accessibilité.',
    sous: [
      { id: 'comportement',  label: 'Comportement de l’IA', icon: Sparkles,    hint: 'Steelman, sophismes, humilité, secteurs' },
      { id: 'ecran',         label: 'Écran de chat',      icon: MessageSquare, hint: 'Suggestions et défi du jour' },
      { id: 'notifications', label: 'Notifications',      icon: Bell,          hint: 'Alertes push sur cet appareil' },
      { id: 'personas',      label: 'Studio de personas', icon: Sparkles,      hint: 'Créer un persona sur mesure' },
      { id: 'a11y',          label: 'Accessibilité',      icon: Accessibility, hint: 'Taille du texte, contraste, animations' },
      { id: 'dossier',       label: 'Dossier de travail', icon: FolderOpen,    hint: 'Où enregistrer les PDF générés' },
    ],
  },
  {
    id: 'abonnement', label: 'Abonnement & crédits', icon: CreditCard, accent: '#F59E0B',
    desc: 'Votre plan, vos crédits et votre consommation.',
    sous: [
      { id: 'plan',         label: 'Mon plan',     icon: Crown,     hint: 'Formule en cours et recharges' },
      { id: 'consommation', label: 'Consommation', icon: BarChart2, hint: 'Quotas, historique, empreinte' },
      { id: 'facturation',  label: 'Facturation',  icon: FileText,  hint: 'Factures, moyen de paiement, résiliation' },
    ],
  },
  {
    id: 'confidentialite', label: 'Données & confidentialité', icon: ShieldCheck, accent: '#0EA5E9',
    desc: 'Export, effacement, partages publics et usage de vos échanges.',
    sous: [
      { id: 'mes-donnees',   label: 'Mes données',    icon: Download, hint: 'Export, effacement, partages publics' },
      { id: 'reutilisation', label: 'Réutilisation',  icon: BookLock, hint: 'Analyse de vos conversations' },
    ],
  },
  {
    id: 'developpeurs', label: 'Développeurs', icon: KeyRound, accent: '#7C3AED',
    desc: "Clés d'API pour appeler Challenger depuis vos applications.",
  },
  {
    id: 'aide', label: 'Aide & nouveautés', icon: LifeBuoy, accent: '#EF4444',
    desc: 'Signaler un problème et consulter le journal des versions.',
  },
  {
    id: 'apropos', label: 'À propos', icon: Info, accent: '#94A3B8',
    desc: 'Éditeur, version installée et textes contractuels.',
  },
];

const FREE_DAILY   = 20;
const FREE_WEEKLY  = 100;
const PRO_DAILY    = 150;
const PRO_WEEKLY   = 700;

export default function SettingsPage({
  onBack, profile: initialProfile, onSave,
  subscription, dailyUsage, weeklyUsage, userCredits, totalCredits, illimite = false, user,
  autoUseCredits, onAutoUseCreditsChange,
  showSuggestions, onShowSuggestionsChange,
  showDailyChallenge, onShowDailyChallengeChange,
  shares, onRevokeShare, onRefreshShares, onAccountDeleted,
}: Props) {
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [saved, setSaved] = useState(false);
  // Chemin courant : [] = menu racine, [section] = liste des sous-sections,
  // [section, sousSection] = contenu.
  const [chemin, setChemin] = useState<string[]>([]);
  const sectionCourante = ARBORESCENCE.find((s) => s.id === chemin[0]);

  /** Vrai lorsque le contenu désigné doit être affiché. */
  const ouvert = (section: string, sous?: string) =>
    chemin[0] === section && (sous === undefined ? !sectionCourante?.sous : chemin[1] === sous);

  const remonter = () => (chemin.length === 0 ? onBack() : setChemin(chemin.slice(0, -1)));

  // Un compte invité porte un identifiant éphémère : des préférences liées au
  // compte y seraient perdues dès la déconnexion. On le considère donc absent
  // pour tout ce qui se conserve côté serveur.
  const idCompteDurable = user && !user.isAnonymous ? user.uid : null;

  const [showEco, setShowEco] = useState(false);

  // MBTI info modal
  const [mbtiInfoOpen, setMbtiInfoOpen] = useState(false);

  // Quiz state
  const [quizOpen, setQuizOpen]     = useState(false);
  const [quizStep, setQuizStep]     = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizDone, setQuizDone]     = useState(false);

  // Interests tag input
  const [newInterest, setNewInterest] = useState('');

  // Import
  const [importError, setImportError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const cvRef     = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Auto-save with debounce
  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...patch };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveProfile(next);
        onSave(next);
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }, 700);
      return next;
    });
  }, [onSave]);

  // ── CV file upload
  const handleCvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      updateProfile({ cvText: e.target?.result as string, cvFileName: file.name });
    };
    if (file.name.endsWith('.pdf')) {
      // Can't parse PDF in settings page without heavy deps — prompt user to paste
      updateProfile({ cvFileName: file.name });
      return;
    }
    reader.readAsText(file);
  };

  // ── Interests
  const addInterest = (tag: string) => {
    const t = tag.trim();
    if (!t || profile.interests.includes(t)) return;
    updateProfile({ interests: [...profile.interests, t] });
  };

  // ── Quiz helpers
  const openQuiz = () => {
    setQuizStep(0);
    setQuizAnswers({});
    setQuizDone(false);
    setQuizOpen(true);
  };

  const answerQuestion = (step: number, val: number, currentAnswers: Record<number, number>) => {
    const newAnswers = { ...currentAnswers, [step]: val };
    setQuizAnswers(newAnswers);
    setTimeout(() => {
      if (step < QUIZ_QUESTIONS.length - 1) {
        setQuizStep(step + 1);
      } else {
        const result = computeBigFive(newAnswers);
        updateProfile({ bigFive: result });
        setQuizDone(true);
      }
    }, 180);
  };

  // ── Import
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = importProfileFromJson(ev.target?.result as string);
        setProfile(imported);
        saveProfile(imported);
        onSave(imported);
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
        setImportError('');
      } catch {
        setImportError('Fichier invalide ou format incompatible.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

      {/* Header */}
      <div
        className="flex-shrink-0 bg-[var(--bg-chat)] border-b border-[var(--border)] px-6 py-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
      >
        <div className="flex items-center gap-4 mb-4">
          {/* Remonte d'un niveau, et quitte les réglages depuis la racine. */}
          <button
            onClick={remonter}
            aria-label={chemin.length === 0 ? 'Fermer les paramètres' : 'Revenir au niveau précédent'}
            className="text-[#5D7BFF] hover:opacity-70 transition-opacity flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[13px] font-black uppercase tracking-widest text-[#141414] truncate">
              {chemin.length === 0
                ? 'Paramètres'
                : sectionCourante?.sous?.find((s) => s.id === chemin[1])?.label ?? sectionCourante?.label}
            </h1>
            <p className="text-[9px] font-medium text-[#141414]/40 uppercase tracking-widest mt-0.5">
              {illimite ? '✦ Crédits illimités'
                : subscription === 'pro' ? `✦ Plan Pro · ${userCredits} crédit${userCredits !== 1 ? 's' : ''} supp.`
                : `${userCredits} crédit${userCredits !== 1 ? 's' : ''} disponible${userCredits !== 1 ? 's' : ''}`}
            </p>
          </div>
          <AnimatePresence>
          {saved && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border-2 border-green-400 flex-shrink-0"
            >
              <Check className="w-3 h-3 text-green-600" />
              <span className="text-[9px] font-black uppercase tracking-widest text-green-600">Sauvegardé</span>
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* Fil d'Ariane — chaque segment est cliquable et ramène à son niveau,
            de sorte qu'on sache toujours où l'on se trouve et comment remonter
            sans passer par la racine. Masqué à la racine, où il n'apprendrait
            rien que le titre ne dise déjà. */}
        {chemin.length > 0 && (
          <div className="flex items-center gap-1.5 border-t border-[#141414]/8 pt-2.5 overflow-x-auto"
               style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setChemin([])}
              className="text-[9px] font-black uppercase tracking-widest text-[#141414]/35 hover:text-[#5D7BFF] transition-colors whitespace-nowrap"
            >
              Paramètres
            </button>
            {chemin.map((segment, i) => {
              const dernier = i === chemin.length - 1;
              const libelle = i === 0
                ? sectionCourante?.label
                : sectionCourante?.sous?.find((s) => s.id === segment)?.label;
              return (
                <React.Fragment key={segment}>
                  <ChevronRight className="w-3 h-3 text-[#141414]/20 flex-shrink-0" />
                  <button
                    onClick={() => setChemin(chemin.slice(0, i + 1))}
                    disabled={dernier}
                    className={cx(
                      'text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-colors',
                      dernier ? 'text-[#5D7BFF]' : 'text-[#141414]/35 hover:text-[#5D7BFF]',
                    )}
                  >
                    {libelle}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-[var(--bg-app)]">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* ═══════════════ NIVEAU 0 — MENU DES SECTIONS ═══════════════ */}
        {chemin.length === 0 && (
          <div className="space-y-2">
            {ARBORESCENCE.map((s) => (
              <button
                key={s.id}
                onClick={() => setChemin([s.id])}
                className="w-full flex items-center gap-4 px-5 py-4 bg-white border-2 border-[#141414]/10 hover:border-[#141414]/25 transition-colors text-left group"
              >
                <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center"
                     style={{ background: `${s.accent}12`, border: `1.5px solid ${s.accent}30` }}>
                  <s.icon className="w-4 h-4" style={{ color: s.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#141414]">{s.label}</p>
                  <p className="text-[10px] text-[#141414]/45 mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 flex-shrink-0 text-[#141414]/20 group-hover:text-[#141414]/50 transition-colors" />
              </button>
            ))}
          </div>
        )}

        {/* ═══════════════ NIVEAU 1 — MENU DES SOUS-SECTIONS ═══════════════ */}
        {chemin.length === 1 && sectionCourante?.sous && (
          <div className="space-y-2">
            <p className="text-[10px] text-[#141414]/45 leading-relaxed px-1 pb-1">{sectionCourante.desc}</p>
            {sectionCourante.sous.map((ss) => (
              <button
                key={ss.id}
                onClick={() => setChemin([sectionCourante.id, ss.id])}
                className="w-full flex items-center gap-4 px-5 py-3.5 bg-white border-2 border-[#141414]/10 hover:border-[#141414]/25 transition-colors text-left group"
              >
                <ss.icon className="w-4 h-4 flex-shrink-0" style={{ color: sectionCourante.accent }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-[#141414]">{ss.label}</p>
                  <p className="text-[10px] text-[#141414]/45 mt-0.5">{ss.hint}</p>
                </div>
                <ChevronRight className="w-4 h-4 flex-shrink-0 text-[#141414]/20 group-hover:text-[#141414]/50 transition-colors" />
              </button>
            ))}
          </div>
        )}

        {/* ═══════════════ ABONNEMENT › MON PLAN ═══════════════ */}
        {ouvert('abonnement', 'plan') && (<>

          {/* Plan actuel */}
          <div className="border-2 border-[#141414]/10 bg-white" style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.06)' }}>
            <div className="px-5 py-3 border-b border-[#141414]/8 flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center" style={{ background: '#5D7BFF12', border: '1.5px solid #5D7BFF30' }}>
                <Crown className="w-4 h-4 text-[#5D7BFF]" />
              </div>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[#5D7BFF]">Plan actuel</h2>
            </div>
            <div className="px-5 py-5">
              {subscription === 'pro' ? (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-[#5D7BFF] text-white">PRO</span>
                      <span className="text-sm font-bold text-[#141414]">Plan Pro actif</span>
                    </div>
                    <p className="text-[11px] text-[#141414]/50">{PRO_DAILY} msg/jour · {PRO_WEEKLY} msg/semaine · Toutes les fonctionnalités</p>
                  </div>
                  <button
                    onClick={() => { const l = import.meta.env.VITE_STRIPE_PORTAL_LINK; if (l) window.open(l, '_blank'); }}
                    className="text-[9px] font-black uppercase tracking-widest px-3 py-2 border-2 border-[#141414]/15 text-[#141414]/50 hover:border-[#141414]/30 transition-all"
                  >
                    Gérer →
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border-2 border-[#141414]/20 text-[#141414]/50">FREE</span>
                    <span className="text-sm font-bold text-[#141414]">Plan gratuit</span>
                  </div>
                  <p className="text-[11px] text-[#141414]/50 mb-4">20 messages/jour · 100 messages/semaine · Crédits supplémentaires disponibles</p>
                  <button
                    onClick={() => { const l = import.meta.env.VITE_STRIPE_PAYMENT_LINK; if (l) window.open(`${l}?client_reference_id=${user?.uid ?? ''}`, '_blank'); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#5D7BFF] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#4a68e8] transition-all"
                    style={{ boxShadow: '4px 4px 0px 0px rgba(93,123,255,0.25)' }}
                  >
                    <ZapIcon className="w-3.5 h-3.5" />
                    Passer au Pro — Illimité
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Solde crédits */}
          <div className="border-2 border-[#141414]/10 bg-white" style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.06)' }}>
            <div className="px-5 py-3 border-b border-[#141414]/8 flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center" style={{ background: '#F59E0B12', border: '1.5px solid #F59E0B30' }}>
                <Coins className="w-4 h-4 text-[#F59E0B]" />
              </div>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[#F59E0B]">Crédits</h2>
              <span className="ml-auto text-2xl font-black text-[#141414]">{illimite ? '∞' : userCredits}</span>
            </div>
            <div className="px-5 py-4">
              {illimite && (
                <div className="mb-4 px-4 py-3 border-2 border-[#10B981]/30 bg-[#10B981]/[0.05]">
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#10B981]">Crédits illimités</p>
                  <p className="text-[11px] text-[#141414]/55 mt-1">Ce compte n'est pas décompté : envoyez autant de messages et d'analyses multi-personas que vous voulez.</p>
                </div>
              )}
              <p className="text-[11px] text-[#141414]/50 mb-4">
                1 crédit = 1 message. S'activent automatiquement quand votre quota quotidien est épuisé. <strong>N'expirent jamais.</strong>
              </p>
              <div className="grid grid-cols-3 gap-3">
                {CREDIT_PACKS.map(pack => (
                  <button
                    key={pack.id}
                    onClick={() => {
                      const link = import.meta.env[pack.envKey];
                      if (link) {
                        const successUrl = encodeURIComponent(`${window.location.origin}/?payment=credits`);
                        window.open(`${link}?client_reference_id=${user?.uid ?? ''}&success_url=${successUrl}`, '_blank');
                      }
                    }}
                    className="flex flex-col items-center gap-1.5 px-3 py-4 border-2 border-[#F59E0B]/20 hover:border-[#F59E0B] hover:bg-[#F59E0B]/4 transition-all group"
                  >
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#F59E0B]/60 group-hover:text-[#F59E0B]">{pack.label}</span>
                    <span className="text-xl font-black text-[#141414]">{pack.credits}</span>
                    <span className="text-[8px] text-[#141414]/40">crédits</span>
                    <span className="text-[11px] font-black text-[#141414] mt-1">{pack.price}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Préférence utilisation automatique des crédits */}
          <div className="border-2 border-[#141414]/10 bg-white" style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.06)' }}>
            <div className="px-5 py-3 border-b border-[#141414]/8 flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center" style={{ background: '#F59E0B12', border: '1.5px solid #F59E0B30' }}>
                <Coins className="w-4 h-4 text-[#F59E0B]" />
              </div>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[#F59E0B]">Préférences crédits</h2>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[11px] font-black text-[#141414]">Utilisation automatique des crédits</p>
                  <p className="text-[10px] text-[#141414]/50 mt-1 leading-relaxed">
                    Quand activé, vos crédits supplémentaires sont utilisés automatiquement une fois le quota gratuit épuisé.<br />
                    Quand désactivé, une confirmation vous est demandée dans le chat.
                  </p>
                </div>
                {/* Toggle */}
                <button
                  onClick={() => onAutoUseCreditsChange(!autoUseCredits)}
                  className="flex-shrink-0 mt-0.5 relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none"
                  style={{ background: autoUseCredits ? '#F59E0B' : '#141414/15', backgroundColor: autoUseCredits ? '#F59E0B' : '#D1D5DB' }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                    style={{ transform: autoUseCredits ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
              <p className="text-[9px] mt-3 font-black uppercase tracking-widest" style={{ color: autoUseCredits ? '#F59E0B' : '#141414' }}>
                {autoUseCredits ? '✓ Activation automatique — vos crédits sont utilisés sans confirmation' : '✗ Manuel — une confirmation vous sera demandée dans le chat'}
              </p>
            </div>
          </div>

          {/* Info sécurité */}
          <div className="flex gap-3 px-4 py-3 bg-green-50 border-2 border-green-200">
            <ShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-green-700 leading-relaxed">
              Paiements sécurisés par <strong>Stripe</strong>. Aucune carte stockée sur nos serveurs. Crédits crédités instantanément après paiement.
            </p>
          </div>
        </>)}

        {/* ═══════════════ ABONNEMENT › CONSOMMATION ═══════════════ */}
        {ouvert('abonnement', 'consommation') && (<>

          {/* ── 3 indicateurs visuels ── */}
          <div className="border-2 border-[#141414]/10 bg-white" style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.06)' }}>
            <div className="px-5 py-3 border-b border-[#141414]/8 flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center" style={{ background: '#5D7BFF12', border: '1.5px solid #5D7BFF30' }}>
                <TrendingUp className="w-4 h-4 text-[#5D7BFF]" />
              </div>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[#5D7BFF]">Quota & Limites</h2>
              <span className="ml-auto text-[9px] font-black uppercase tracking-widest px-2 py-0.5"
                style={{ color: subscription === 'pro' ? '#5D7BFF' : '#141414', background: subscription === 'pro' ? '#5D7BFF14' : '#14141408' }}>
                {subscription === 'pro' ? '✦ Pro' : 'Free'}
              </span>
            </div>
            <div className="px-5 py-5 space-y-6">

              {/* ── 1. Aujourd'hui ── */}
              {(() => {
                const today = new Date().toISOString().split('T')[0];
                const used  = dailyUsage.date === today ? dailyUsage.count : 0;
                const limit = subscription === 'pro' ? PRO_DAILY : FREE_DAILY;
                const pct   = Math.min(100, (used / limit) * 100);
                const color = pct >= 90 ? '#EF4444' : pct >= 60 ? '#F59E0B' : '#5D7BFF';
                return (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#141414]/50">Crédits aujourd'hui</span>
                      <span className="text-[11px] font-black tabular-nums" style={{ color }}>{used} / {limit}</span>
                    </div>
                    <div className="h-2.5 bg-[#141414]/8 w-full rounded-sm overflow-hidden">
                      <div className="h-2.5 rounded-sm transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    {used >= limit && userCredits > 0 && (
                      <p className="text-[9px] text-[#F59E0B] mt-1.5 font-medium">Quota atteint — vos crédits supplémentaires prennent le relais</p>
                    )}
                    {used >= limit && userCredits === 0 && (
                      <p className="text-[9px] text-[#EF4444] mt-1.5 font-medium">Quota atteint — achetez des crédits pour continuer</p>
                    )}
                  </div>
                );
              })()}

              {/* ── 2. Cette semaine ── */}
              {(() => {
                const used  = weeklyUsage.count;
                const limit = subscription === 'pro' ? PRO_WEEKLY : FREE_WEEKLY;
                const pct   = Math.min(100, (used / limit) * 100);
                const color = pct >= 90 ? '#EF4444' : pct >= 60 ? '#F59E0B' : '#10B981';
                return (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#141414]/50">Crédits cette semaine</span>
                      <span className="text-[11px] font-black tabular-nums" style={{ color }}>{used} / {limit}</span>
                    </div>
                    <div className="h-2.5 bg-[#141414]/8 w-full rounded-sm overflow-hidden">
                      <div className="h-2.5 rounded-sm transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })()}

              {/* ── 3. Crédits supplémentaires ── */}
              {(() => {
                const used  = Math.max(0, totalCredits - userCredits);
                const total = totalCredits;
                const pct   = total > 0 ? Math.min(100, (used / total) * 100) : 0;
                const color = '#F59E0B';
                return (
                  <div className="pt-2 border-t border-[#141414]/8">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#141414]/50">Crédits supplémentaires</span>
                      <span className="text-[11px] font-black tabular-nums" style={{ color: userCredits > 0 ? color : '#141414' }}>
                        {userCredits} restants{total > 0 ? ` / ${total} achetés` : ''}
                      </span>
                    </div>
                    {total > 0 ? (
                      <div className="h-2.5 bg-[#141414]/8 w-full rounded-sm overflow-hidden">
                        <div className="h-2.5 rounded-sm transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    ) : (
                      <p className="text-[9px] text-[#141414]/35 mt-1">Aucun crédit acheté — disponibles dans l'onglet Abonnement</p>
                    )}
                  </div>
                );
              })()}

            </div>
          </div>

          {/* Modèle de tarification */}
          <div className="border-2 border-[#141414]/10 bg-white px-5 py-4" style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.06)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/30 mb-3">Comment ça marche</p>
            <div className="space-y-2.5">
              {[
                { couleur: '#10B981', label: 'Plan Free',  desc: `${FREE_DAILY} msg/jour · ${FREE_WEEKLY} msg/semaine inclus` },
                { couleur: '#5D7BFF', label: 'Plan Pro',   desc: `${PRO_DAILY} msg/jour · ${PRO_WEEKLY} msg/semaine · toutes les features` },
                { couleur: '#F59E0B', label: 'Crédits +',  desc: 'S\'activent automatiquement quand le quota est épuisé · 1 crédit = 1 msg · n\'expirent jamais' },
              ].map(r => (
                <div key={r.label} className="flex items-start gap-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.couleur }} />
                  <div>
                    <p className="text-[10px] font-black text-[#141414]">{r.label}</p>
                    <p className="text-[10px] text-[#141414]/45">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Empreinte environnementale (déroulante) ── */}
          {(() => {
            // Estimations basées sur la littérature publique (Mistral small ~0.002 kWh/msg)
            const totalMsgs  = (dailyUsage.count ?? 0) + weeklyUsage.count;
            const weekMsgs   = weeklyUsage.count;
            const KWH_PER_MSG  = 0.002;   // kWh par message (Mistral small, efficace)
            const CO2_PER_KWH  = 0.233;   // kg CO2/kWh (mix UE moyen)
            const WATER_PER_KWH = 0.5;    // L eau/kWh (refroidissement datacenter)

            const weekKwh   = weekMsgs  * KWH_PER_MSG;
            const weekCo2g  = weekKwh   * CO2_PER_KWH * 1000; // en grammes
            const weekWaterL = weekKwh  * WATER_PER_KWH;

            // Equivalences ludiques
            const kmVoiture = (weekCo2g / 1000) / 0.21; // 210g CO2/km voiture essence
            const emails    = Math.round(weekCo2g / 4);  // ~4g CO2 par email
            const chargePhone = Math.round(weekKwh / 0.012); // ~12 Wh pour charger un smartphone

            const ecoScore = weekMsgs === 0 ? 100 : Math.max(0, 100 - Math.floor(weekMsgs / 2));
            const scoreColor = ecoScore >= 80 ? '#10B981' : ecoScore >= 50 ? '#F59E0B' : '#EF4444';
            const scoreLabel = ecoScore >= 80 ? 'Excellent' : ecoScore >= 50 ? 'Modéré' : 'Élevé';

            return (
              <div className="border-2 border-[#141414]/10 bg-white overflow-hidden" style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.06)' }}>
                {/* En-tête cliquable */}
                <button
                  onClick={() => setShowEco(v => !v)}
                  className="w-full px-5 py-3 flex items-center gap-3 hover:bg-[#141414]/2 transition-colors text-left"
                >
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ background: '#10B98112', border: '1.5px solid #10B98130' }}>
                    <Leaf className="w-4 h-4 text-[#10B981]" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-[#10B981]">Empreinte environnementale</h2>
                    <p className="text-[9px] text-[#141414]/40 mt-0.5">Voir mon impact · {weekMsgs} msg cette semaine</p>
                  </div>
                  <span className="text-[#141414]/30 text-xs flex-shrink-0">{showEco ? '▲' : '▼'}</span>
                </button>

                {showEco && (
                  <div className="px-5 pb-5 space-y-5 border-t border-[#141414]/8">

                    {/* Score global */}
                    <div className="pt-4 flex items-center gap-4">
                      <div className="flex-shrink-0 w-16 h-16 flex flex-col items-center justify-center border-2" style={{ borderColor: `${scoreColor}40`, background: `${scoreColor}08` }}>
                        <span className="text-xl font-black" style={{ color: scoreColor }}>{ecoScore}</span>
                        <span className="text-[7px] font-black uppercase tracking-widest" style={{ color: scoreColor }}>/ 100</span>
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-[#141414]">Impact {scoreLabel}</p>
                        <p className="text-[9px] text-[#141414]/45 leading-relaxed mt-0.5">
                          Basé sur {weekMsgs} messages cette semaine.<br />
                          Estimation : ~{weekCo2g.toFixed(1)}g CO₂ · {weekKwh.toFixed(3)} kWh · {weekWaterL.toFixed(2)} L d'eau
                        </p>
                      </div>
                    </div>

                    {/* Barres d'impact */}
                    <div className="space-y-3">
                      {[
                        { label: 'CO₂ émis (g)', value: weekCo2g, max: 50,  color: '#EF4444', unit: 'g', fmt: (v: number) => v.toFixed(1) },
                        { label: 'Énergie (Wh)',  value: weekKwh * 1000, max: 100, color: '#F59E0B', unit: 'Wh', fmt: (v: number) => v.toFixed(0) },
                        { label: 'Eau (mL)',       value: weekWaterL * 1000, max: 500, color: '#3B82F6', unit: 'mL', fmt: (v: number) => v.toFixed(0) },
                      ].map(bar => (
                        <div key={bar.label}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#141414]/50">{bar.label}</span>
                            <span className="text-[9px] font-black tabular-nums" style={{ color: bar.color }}>{bar.fmt(bar.value)} {bar.unit}</span>
                          </div>
                          <div className="h-1.5 bg-[#141414]/8 w-full rounded-sm overflow-hidden">
                            <div className="h-1.5 rounded-sm transition-all duration-700"
                              style={{ width: `${Math.min(100, (bar.value / bar.max) * 100)}%`, backgroundColor: bar.color }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Équivalences */}
                    <div className="bg-[#141414]/3 px-4 py-3 space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/30 mb-2">Équivalences cette semaine</p>
                      {[
                        { icone: Car, text: `${kmVoiture.toFixed(2)} km en voiture essence` },
                        { icone: Mail, text: `${emails} emails envoyés` },
                        { icone: Smartphone, text: `${chargePhone} charges de smartphone` },
                      ].map(eq => (
                        <div key={eq.text} className="flex items-center gap-2">
                          <eq.icone className="w-3.5 h-3.5 flex-shrink-0 text-[#10B981]" />
                          <span className="text-[9px] text-[#141414]/55">{eq.text}</span>
                        </div>
                      ))}
                    </div>

                    {/* Tips eco */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#10B981]/70 mb-2.5">Utiliser Challenger de façon + responsable</p>
                      <div className="space-y-2">
                        {[
                          { icone: PenLine, tip: 'Posez des questions précises — moins d\'allers-retours = moins de CO₂' },
                          { icone: ImageIcon, tip: 'Évitez les images inutiles — elles consomment 3× plus d\'énergie' },
                          { icone: Package, tip: 'Groupez vos questions en un seul message quand c\'est possible' },
                          { icone: Moon, tip: 'Utilisez l\'app aux heures creuses — le réseau électrique est plus vert la nuit' },
                          { icone: RotateCcw, tip: 'Relisez les réponses avant de redemander — évitez les doublons' },
                        ].map(t => (
                          <div key={t.tip} className="flex items-start gap-2.5">
                            <t.icone className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#10B981]" />
                            <p className="text-[9px] text-[#141414]/50 leading-relaxed">{t.tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="text-[7px] text-[#141414]/20 leading-relaxed">
                      * Estimations basées sur les données publiques de consommation des LLMs (Mistral AI, ~0.002 kWh/requête) et le mix électrique européen moyen (0.233 kg CO₂/kWh). Ces chiffres sont indicatifs.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

        </>)}

        {/* ═══════════════ ONGLET COMPTE ═══════════════ */}
        {ouvert('confidentialite', 'mes-donnees') && (<>

          {/* Droits RGPD : partages publics, export, effacement */}
          <PrivacyPanel
            userId={user?.uid ?? null}
            shares={shares}
            onRevokeShare={onRevokeShare}
            onRefreshShares={onRefreshShares}
            onDeleted={onAccountDeleted}
          />

        </>)}

        {/* ═══════════════ DONNÉES › RÉUTILISATION ═══════════════ */}
        {ouvert('confidentialite', 'reutilisation') && (
          <ReutilisationPanel userId={idCompteDurable} />
        )}

        {/* ═══════════════ SÉCURITÉ DU COMPTE ═══════════════ */}
        {ouvert('securite') && <SecurityPanel user={user ?? null} />}

        {/* ═══════════════ ABONNEMENT › FACTURATION ═══════════════ */}
        {ouvert('abonnement', 'facturation') && (
          <FacturationPanel userId={idCompteDurable} subscription={subscription} />
        )}

        {/* ═══════════════ AIDE & NOUVEAUTÉS ═══════════════ */}
        {ouvert('aide') && <SupportPanel />}

        {/* ═══════════════ DÉVELOPPEURS ═══════════════ */}
        {ouvert('developpeurs') && (
          <ApiKeysPanel userId={idCompteDurable} />
        )}

        {/* ═══════════════ À PROPOS ═══════════════ */}
        {ouvert('apropos') && (<>

          {/* ── À PROPOS ─────────────────────────────────────────────────────
              Regroupe ce qu'un utilisateur doit pouvoir retrouver seul :
              l'éditeur, la version exacte qu'il exécute, et les textes
              contractuels. Sans le numéro de build, un signalement d'anomalie
              n'est pas exploitable par le support. */}
          <div className="border-2 border-[#141414]/10 bg-white">
            <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
              <div className="w-8 h-8 flex items-center justify-center"
                   style={{ background: '#5D7BFF12', border: '1.5px solid #5D7BFF30' }}>
                <Info className="w-4 h-4 text-[#5D7BFF]" />
              </div>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[#5D7BFF]">À propos</h2>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Éditeur — le logotype STARIAX signe la maison d'édition ; le
                  logo Challenger reste seul à identifier le produit. */}
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/35">Édité par</p>
                  <img
                    src="/stariax-wordmark.png"
                    alt="STARIAX GROUP"
                    className="h-3 w-auto mt-1.5"
                  />
                </div>
                <p className="text-[9px] text-[#141414]/35 uppercase tracking-widest text-right flex-shrink-0">
                  European<br />Tech Group
                </p>
              </div>

              <dl className="border-t border-[#141414]/8 pt-3 space-y-1.5">
                {[
                  ['Version', __APP_VERSION__],
                  ['Build', `${__APP_BUILD__} · ${__APP_BUILD_DATE__}`],
                ].map(([cle, valeur]) => (
                  <div key={cle} className="flex items-baseline justify-between gap-4">
                    <dt className="text-[10px] text-[#141414]/45">{cle}</dt>
                    <dd className="text-[10px] font-mono text-[#141414]/70">{valeur}</dd>
                  </div>
                ))}
              </dl>

              <div className="border-t border-[#141414]/8 pt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {[
                  ['Conditions générales', 'https://challenger-ia-nine.vercel.app/cgu'],
                  ['Confidentialité',      'https://challenger-ia-nine.vercel.app/confidentialite'],
                  ['Mentions légales',     'https://challenger-ia-nine.vercel.app/mentions-legales'],
                ].map(([libelle, href]) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-[#5D7BFF] underline underline-offset-2 hover:opacity-70 transition-opacity"
                  >
                    {libelle}
                  </a>
                ))}
              </div>
            </div>
          </div>

        </>)}

        {/* ═══════════════ PERSONNALISATION › COMPORTEMENT DE L'IA ═══════════════ */}
        {ouvert('personnalisation', 'comportement') && (
          <div className="border-2 border-[#141414]/10">
            <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
              <div className="w-8 h-8 flex items-center justify-center" style={{ background: '#5D7BFF12', border: '1.5px solid #5D7BFF30' }}>
                <Sparkles className="w-4 h-4 text-[#5D7BFF]" />
              </div>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[#5D7BFF]">Comportement de l'IA</h2>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-[10px] text-[#141414]/50 leading-relaxed">
                Réglez la façon dont Challenger vous challenge. Ces options renforcent la rigueur — désactivez-les si vous préférez des réponses plus directes.
              </p>

              {([
                { cle: 'steelmanObligatoire' as const, titre: 'Steelman obligatoire', desc: 'Reformule votre idée dans sa version la plus forte (et vérifie qu\'il a bien compris) avant de la contredire.' },
                { cle: 'personaAdaptatif' as const, titre: 'S\'adapte à votre niveau', desc: 'Pédagogue sur un raisonnement hésitant, sans concession sur un raisonnement avancé.' },
                { cle: 'detectionSophismes' as const, titre: 'Détection de sophismes', desc: 'Repère et nomme les erreurs de raisonnement — dans vos messages comme dans ses propres réponses.' },
                { cle: 'humiliteEpistemique' as const, titre: 'Humilité épistémique', desc: 'Affiche son degré de certitude et vous invite à recouper quand un point est incertain.' },
                { cle: 'journalTransparence' as const, titre: 'Journal de transparence', desc: 'Explique en une phrase pourquoi il répond ainsi — pas seulement sa conclusion.' },
              ]).map((o) => {
                const val = !!profile[o.cle];
                return (
                  <div key={o.cle} className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-[11px] font-black text-[#141414]">{o.titre}</p>
                      <p className="text-[10px] text-[#141414]/50 mt-1 leading-relaxed">{o.desc}</p>
                    </div>
                    <button
                      onClick={() => updateProfile({ [o.cle]: !val } as Partial<UserProfile>)}
                      role="switch" aria-checked={val} aria-label={o.titre}
                      className="flex-shrink-0 mt-0.5 relative w-11 h-6 rounded-full transition-colors duration-200"
                      style={{ backgroundColor: val ? '#5D7BFF' : '#D1D5DB' }}
                    >
                      <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                        style={{ transform: val ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                );
              })}

              <div className="pt-1 border-t border-[#141414]/8">
                <p className="text-[11px] font-black text-[#141414] mt-3">Secteurs d'intérêt</p>
                <p className="text-[10px] text-[#141414]/50 mt-1 mb-2.5 leading-relaxed">3 à 5 domaines — ils ancrent exemples, sources et suggestions.</p>
                <div className="flex flex-wrap gap-1.5">
                  {SECTEURS.map((sct) => {
                    const actif = (profile.secteurs ?? []).includes(sct);
                    const plein = !actif && (profile.secteurs ?? []).length >= 5;
                    return (
                      <button
                        key={sct}
                        disabled={plein}
                        onClick={() => updateProfile({ secteurs: actif
                          ? (profile.secteurs ?? []).filter((x) => x !== sct)
                          : [...(profile.secteurs ?? []), sct] })}
                        className={'px-2.5 py-1 border-2 text-[10px] font-bold transition-all '
                          + (actif ? 'border-[#141414] bg-[#5D7BFF] text-white'
                            : plein ? 'border-[#141414]/10 text-[#141414]/25 cursor-not-allowed'
                            : 'border-[#141414]/15 text-[#141414]/55 hover:border-[#141414]/40')}
                      >
                        {sct}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] font-black text-[#141414]/35 mt-2">{(profile.secteurs ?? []).length}/5</p>
              </div>

              <p className="text-[9px] text-[#141414]/40 leading-relaxed pt-1 border-t border-[#141414]/8 mt-1">
                <strong>Garde-fous santé / droit / finance</strong> : toujours actifs. Challenger informe mais ne donne jamais de conseil personnalisé sur ces sujets.
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════ ONGLET PRÉFÉRENCES ═══════════════ */}
        {ouvert('personnalisation', 'ecran') && (<>

          {/* ── ÉCRAN DE CHAT — épure de l'accueil de session */}
          <div className="border-2 border-[#141414]/10">
            <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
              <div className="w-8 h-8 flex items-center justify-center" style={{ background: '#5D7BFF12', border: '1.5px solid #5D7BFF30' }}>
                <MessageSquare className="w-4 h-4 text-[#5D7BFF]" />
              </div>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[#5D7BFF]">Écran de chat</h2>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-[10px] text-[#141414]/50 leading-relaxed">
                Masquez ce dont vous n'avez pas besoin pour retrouver un écran de départ épuré.
              </p>

              {[
                {
                  titre: 'Afficher les suggestions',
                  desc: "Les thèses proposées au démarrage d'une session.",
                  valeur: showSuggestions,
                  onChange: onShowSuggestionsChange,
                },
                {
                  titre: 'Afficher le défi du jour',
                  desc: "Le défi quotidien et son crédit offert. Dans le chat, la croix au survol le replie dans la barre latérale.",
                  valeur: showDailyChallenge,
                  onChange: onShowDailyChallengeChange,
                },
              ].map((o) => (
                <div key={o.titre} className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-[11px] font-black text-[#141414]">{o.titre}</p>
                    <p className="text-[10px] text-[#141414]/50 mt-1 leading-relaxed">{o.desc}</p>
                  </div>
                  <button
                    onClick={() => o.onChange(!o.valeur)}
                    role="switch"
                    aria-checked={o.valeur}
                    aria-label={o.titre}
                    className="flex-shrink-0 mt-0.5 relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none"
                    style={{ backgroundColor: o.valeur ? '#5D7BFF' : '#D1D5DB' }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                      style={{ transform: o.valeur ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </>)}

        {/* ═══════════════ PERSONNALISATION › NOTIFICATIONS ═══════════════ */}
        {ouvert('personnalisation', 'notifications') && <PushToggle userId={idCompteDurable} />}

        {/* ═══════════════ PERSONNALISATION › STUDIO DE PERSONAS ═══════════════ */}
        {ouvert('personnalisation', 'personas') && <PersonaStudioSection />}

        {/* ═══════════════ PERSONNALISATION › ACCESSIBILITÉ ═══════════════ */}
        {ouvert('personnalisation', 'a11y') && <AccessibilitePanel />}

        {/* ═══════════════ PERSONNALISATION › DOSSIER DE TRAVAIL ═══════════════ */}
        {ouvert('personnalisation', 'dossier') && <DossierTravailPanel />}

        {/* ═══════════════ PROGRESSION ═══════════════ */}
        {ouvert('progression') && <CognitiveCard userId={user?.uid ?? null} />}

        {/* ═══════════════ PROFIL IA › IDENTITÉ ═══════════════ */}
        {ouvert('profil', 'identite') && (<>

          {/* Info banner */}
          <div className="bg-[#5D7BFF]/5 border-2 border-[#5D7BFF]/20 px-4 py-3 flex gap-3 items-start">
            <Sparkles className="w-4 h-4 text-[#5D7BFF] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] font-medium text-[#141414]/60 leading-relaxed">
              Ces informations enrichissent l'IA lors de vos <strong>débats</strong> et <strong>interviews</strong>.
              Elle les utilise de façon contextuelle — jamais de manière systématique.
              Tout reste <strong>stocké localement sur cet appareil</strong>.
            </p>
          </div>

          {/* ── IDENTITÉ */}
          <Section icon={User} title="Identité" accent="#5D7BFF">
            <Field label="Prénom / Nom affiché">
              <input
                type="text"
                value={profile.displayName}
                onChange={e => updateProfile({ displayName: e.target.value })}
                placeholder="Ex : Morgan R."
                className={cx(INPUT_BASE, 'focus:border-[#5D7BFF]')}
              />
            </Field>
            <Field
              label="Mon parcours"
              hint="Qui vous êtes, votre histoire, votre contexte de vie. L'IA s'en servira pour personnaliser ses questions et rebonds."
            >
              <textarea
                value={profile.background}
                onChange={e => updateProfile({ background: e.target.value })}
                placeholder="Ex : Entrepreneur dans la tech depuis 8 ans, passionné de philosophie et d'éducation. Ancien ingénieur, reconverti fondateur de startup. J'ai grandi à Lyon, vécu à Berlin, maintenant à Paris…"
                rows={5}
                className={cx(TEXTAREA_BASE, 'focus:border-[#5D7BFF]')}
              />
            </Field>
          </Section>

        </>)}

        {/* ═══════════════ PROFIL IA › PARCOURS PROFESSIONNEL ═══════════════ */}
        {ouvert('profil', 'parcours') && (<>

          {/* ── PROFESSIONNEL */}
          <Section icon={Briefcase} title="Parcours professionnel" accent="#3B82F6">
            <Field label="LinkedIn / URL de profil">
              <input
                type="text"
                value={profile.linkedin}
                onChange={e => updateProfile({ linkedin: e.target.value })}
                placeholder="https://linkedin.com/in/votre-profil"
                className={cx(INPUT_BASE, 'focus:border-[#3B82F6]')}
              />
            </Field>
            <Field
              label="CV"
              hint="Déposez un fichier .txt ou .md, ou copiez-collez le contenu texte de votre CV directement. Pour un PDF, copiez le texte depuis votre lecteur."
            >
              <div
                className="border-2 border-dashed border-[#141414]/15 p-4 text-center mb-2 cursor-pointer hover:border-[#3B82F6]/40 transition-colors"
                onClick={() => cvRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCvFile(f); }}
              >
                <FileText className="w-5 h-5 text-[#141414]/20 mx-auto mb-1" />
                <p className="text-[10px] font-black uppercase tracking-widest text-[#141414]/30">
                  {profile.cvFileName ? profile.cvFileName : 'Déposer un .txt ou .md — ou cliquer'}
                </p>
                <input
                  ref={cvRef}
                  type="file"
                  accept=".txt,.md"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleCvFile(f); e.target.value = ''; }}
                />
              </div>
              <textarea
                value={profile.cvText}
                onChange={e => updateProfile({ cvText: e.target.value })}
                placeholder="Ou copiez-collez votre CV ici — formations, expériences, compétences clés…"
                rows={6}
                className={cx(TEXTAREA_BASE, 'focus:border-[#3B82F6]')}
              />
            </Field>
          </Section>

        </>)}

        {/* ═══════════════ PROFIL IA › PERSONNALITÉ ═══════════════ */}
        {ouvert('profil', 'caractere') && (<>

          {/* ── PERSONNALITÉ */}
          <Section icon={Brain} title="Personnalité" accent="#8B5CF6">
            <Field
              label="Type MBTI"
              hint="Sélectionnez votre type si vous le connaissez. Cliquez à nouveau pour désélectionner."
              action={
                <button
                  onClick={() => setMbtiInfoOpen(true)}
                  className="text-[#141414]/25 hover:text-[#8B5CF6] transition-colors"
                  title="En savoir plus sur les types MBTI"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              }
            >
              <div className="grid grid-cols-4 gap-1.5">
                {MBTI_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => updateProfile({ mbti: profile.mbti === type ? '' : type })}
                    className={cx(
                      'py-2.5 text-[10px] font-black uppercase tracking-widest border-2 transition-all',
                      profile.mbti === type
                        ? 'bg-[#8B5CF6] text-white border-[#8B5CF6]'
                        : 'border-[#141414]/10 text-[#141414]/40 hover:border-[#8B5CF6]/40 hover:text-[#8B5CF6]',
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Profil Big Five">
              {profile.bigFive && (
                <div className="space-y-2.5 mb-4 p-4 bg-[#8B5CF6]/3 border border-[#8B5CF6]/15">
                  {DIM_ORDER.map(dimKey => {
                    const info = QUIZ_DIM[dimKey];
                    const score = profile.bigFive![info.key];
                    return (
                      <div key={dimKey} className="flex items-center gap-3">
                        <span
                          className="text-[9px] font-black uppercase tracking-widest flex-shrink-0"
                          style={{ color: info.color, width: '80px' }}
                        >
                          {info.label}
                        </span>
                        <div className="flex-1 h-1.5 bg-[#141414]/5 relative overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(score / 10) * 100}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className="absolute inset-y-0 left-0"
                            style={{ background: info.color }}
                          />
                        </div>
                        <span className="text-[10px] font-black text-[#141414]/35 w-8 text-right flex-shrink-0">
                          {score}/10
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {!profile.bigFive && (
                <p className="text-[11px] text-[#141414]/30 mb-3">
                  Aucun résultat — passez le quiz pour obtenir votre profil de personnalité.
                </p>
              )}
              <button
                onClick={openQuiz}
                className="flex items-center gap-2 px-4 py-2.5 border-2 border-[#8B5CF6]/30 text-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white hover:border-[#8B5CF6] transition-all text-[10px] font-black uppercase tracking-widest"
              >
                <Sparkles className="w-3 h-3" />
                {profile.bigFive ? 'Refaire le quiz' : 'Passer le quiz Big Five'}
              </button>
            </Field>

            <Field
              label="Notes personnalité"
              hint="Ajoutez ce qui vous définit : façon de penser, de communiquer, points forts/faibles…"
            >
              <textarea
                value={profile.personalityNotes}
                onChange={e => updateProfile({ personalityNotes: e.target.value })}
                placeholder="Ex : Je suis très analytique, j'ai tendance à sur-préparer. Je préfère les conversations de fond aux small talks. Je prends du temps avant de décider mais je suis ferme une fois décidé…"
                rows={4}
                className={cx(TEXTAREA_BASE, 'focus:border-[#8B5CF6]')}
              />
            </Field>
          </Section>

        </>)}

        {/* ═══════════════ PROFIL IA › PROFIL NEURO ═══════════════ */}
        {ouvert('profil', 'neuro') && (<>

          {/* ── NEURO — données de santé (RGPD art. 9) */}
          <Section icon={Zap} title="Profil neuro" accent="#10B981">

            {/* Consentement explicite et spécifique — art. 9.2.a.
                Sans lui, ces champs ne sont jamais transmis au modèle. */}
            <div className="mb-5 border-2 border-[#10B981]/30 bg-[#10B981]/[0.04] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#10B981] mb-2">
                Données de santé — consentement requis
              </p>
              <p className="text-[10px] text-[#141414]/60 leading-relaxed mb-3">
                Les profils neuro-atypiques sont des <strong>données de santé</strong>. La
                réglementation exige votre consentement explicite avant tout traitement.
                Si vous consentez, ces informations seront transmises au modèle
                d'intelligence artificielle afin d'adapter ses réponses à votre
                fonctionnement. Vous pouvez retirer ce consentement à tout moment : les
                données cesseront alors d'être transmises, et vous pouvez les effacer
                depuis la section « Vos données ».
              </p>
              <button
                onClick={() => updateProfile({
                  healthDataConsent: !profile.healthDataConsent,
                  healthConsentAt: !profile.healthDataConsent ? new Date().toISOString() : '',
                })}
                role="switch"
                aria-checked={profile.healthDataConsent}
                aria-label="Consentir au traitement des données de santé"
                className="flex items-center gap-3 group"
              >
                <span
                  className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
                  style={{ backgroundColor: profile.healthDataConsent ? '#10B981' : '#D1D5DB' }}
                >
                  <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                        style={{ transform: profile.healthDataConsent ? 'translateX(20px)' : 'translateX(0)' }} />
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-left"
                      style={{ color: profile.healthDataConsent ? '#10B981' : '#141414' }}>
                  {profile.healthDataConsent
                    ? 'Consentement donné — ces données sont utilisées'
                    : 'Consentement non donné — ces données ne sont pas utilisées'}
                </span>
              </button>
              {profile.healthDataConsent && profile.healthConsentAt && (
                <p className="text-[9px] text-[#141414]/40 mt-2">
                  Consentement enregistré le {new Date(profile.healthConsentAt).toLocaleString('fr-FR')}
                </p>
              )}
            </div>

            <Field label="Profil(s) neuro-atypique" hint="Sélectionnez ce qui vous correspond — sans jugement, sans obligation.">
              <div className="flex flex-wrap gap-2">
                {NEURO_TAGS.map(tag => {
                  const active = profile.neuroTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() =>
                        updateProfile({
                          neuroTags: active
                            ? profile.neuroTags.filter(t => t !== tag)
                            : [...profile.neuroTags, tag],
                        })
                      }
                      className={cx(
                        'px-3 py-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all',
                        active
                          ? 'bg-[#10B981] text-white border-[#10B981]'
                          : 'border-[#141414]/10 text-[#141414]/40 hover:border-[#10B981]/40 hover:text-[#10B981]',
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field
              label="Notes complémentaires"
              hint="Impacts sur votre façon de travailler, d'apprendre, de communiquer — tout ce qui aide l'IA à s'adapter."
            >
              <textarea
                value={profile.neuroNotes}
                onChange={e => updateProfile({ neuroNotes: e.target.value })}
                placeholder="Ex : Mon TDAH me rend hyper-focalisé sur les sujets qui me passionnent mais je peux me disperser sur le reste. J'ai besoin de structure externe pour les projets longs…"
                rows={4}
                className={cx(TEXTAREA_BASE, 'focus:border-[#10B981]')}
              />
            </Field>
          </Section>

        </>)}

        {/* ═══════════════ PROFIL IA › CENTRES D'INTÉRÊT ═══════════════ */}
        {ouvert('profil', 'interets') && (<>

          {/* ── INTÉRÊTS */}
          <Section icon={Heart} title="Centres d'intérêt" accent="#F59E0B">
            <Field label="Thèmes & domaines" hint="Tapez un mot-clé et appuyez sur Entrée pour l'ajouter.">
              {profile.interests.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {profile.interests.map(tag => (
                    <span
                      key={tag}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-[#F59E0B]/40 bg-[#F59E0B]/8 text-[10px] font-black uppercase tracking-widest text-[#F59E0B]"
                    >
                      {tag}
                      <button
                        onClick={() => updateProfile({ interests: profile.interests.filter(t => t !== tag) })}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={newInterest}
                onChange={e => setNewInterest(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addInterest(newInterest); setNewInterest(''); }
                }}
                placeholder="Philosophie, IA, musique, histoire, entrepreneuriat… ↵ Entrée"
                className={cx(INPUT_BASE, 'focus:border-[#F59E0B]')}
              />
            </Field>
            <Field label="Notes" hint="Précisez vos passions, vos projets, ce qui vous anime vraiment.">
              <textarea
                value={profile.interestNotes}
                onChange={e => updateProfile({ interestNotes: e.target.value })}
                placeholder="Ex : Je suis passionné par la philosophie du langage et la linguistique cognitive. Je compose de la musique électronique depuis 10 ans. Je m'intéresse à l'impact de l'IA sur l'éducation…"
                rows={3}
                className={cx(TEXTAREA_BASE, 'focus:border-[#F59E0B]')}
              />
            </Field>
          </Section>

        </>)}

        {/* ═══════════════ PROFIL IA › DONNÉES DU PROFIL ═══════════════ */}
        {ouvert('profil', 'fichier') && (<>

          {/* ── DONNÉES */}
          <Section icon={Download} title="Données du profil" accent="#94A3B8">
            <p className="text-[11px] text-[#141414]/40 leading-relaxed">
              Exportez votre profil dans un fichier <code className="bg-[#141414]/5 px-1">.json</code> pour le sauvegarder ou l'importer sur un autre appareil. L'import restaure automatiquement tous vos réglages.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <button
                onClick={() => exportProfile(profile)}
                className="flex items-center gap-2 px-4 py-3 bg-[#141414] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#333] transition-colors"
                style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.15)' }}
              >
                <Download className="w-4 h-4" />
                Exporter le profil
              </button>
              <button
                onClick={() => importRef.current?.click()}
                className="flex items-center gap-2 px-4 py-3 border-2 border-[#141414]/20 text-[#141414]/60 text-[10px] font-black uppercase tracking-widest hover:border-[#5D7BFF] hover:text-[#5D7BFF] transition-all"
              >
                <Upload className="w-4 h-4" />
                Importer un profil
              </button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            </div>
            {importError && (
              <p className="mt-2 text-[10px] font-black text-red-500 uppercase tracking-widest">{importError}</p>
            )}

            <div className="mt-6 pt-5 border-t border-[#141414]/8">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/20 mb-3">Zone dangereuse</p>
              <button
                onClick={() => {
                  if (window.confirm('Supprimer toutes vos données de profil ? Cette action est irréversible.')) {
                    const empty = { ...EMPTY_PROFILE, updatedAt: new Date().toISOString() };
                    setProfile(empty);
                    saveProfile(empty);
                    onSave(empty);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 border-2 border-red-200 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all text-[10px] font-black uppercase tracking-widest"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Réinitialiser le profil
              </button>
            </div>
          </Section>

        </>)}

        <div className="pb-8" />

        </div>
      </div>

      {/* ── Quiz Modal ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {quizOpen && (
          <motion.div
            key="quiz-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.92, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 24 }}
              className="bg-white border-4 border-[#141414] w-full max-w-lg overflow-hidden"
              style={{ boxShadow: '8px 8px 0px 0px rgba(20,20,20,1)' }}
            >
              {/* Quiz header */}
              <div className="px-6 py-4 border-b-2 border-[#141414]/8 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-[#141414]/30 mb-0.5">Personnalité</p>
                  <h2 className="text-[13px] font-black uppercase tracking-widest text-[#141414]">Quiz Big Five</h2>
                </div>
                <button onClick={() => setQuizOpen(false)} className="text-[#141414]/30 hover:text-[#141414]/70 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!quizDone ? (
                <div className="px-6 py-6">
                  {/* Progress bar */}
                  <div className="flex items-center gap-3 mb-5">
                    <div className="flex-1 h-1 bg-[#141414]/6 overflow-hidden">
                      <motion.div
                        className="h-full bg-[#8B5CF6]"
                        animate={{ width: `${((quizStep + 1) / QUIZ_QUESTIONS.length) * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <span className="text-[9px] font-black text-[#141414]/30 flex-shrink-0">
                      {quizStep + 1} / {QUIZ_QUESTIONS.length}
                    </span>
                  </div>

                  {/* Dimension label */}
                  <p
                    className="text-[9px] font-black uppercase tracking-widest mb-2"
                    style={{ color: QUIZ_DIM[QUIZ_QUESTIONS[quizStep].dim].color }}
                  >
                    {QUIZ_DIM[QUIZ_QUESTIONS[quizStep].dim].label}
                  </p>

                  {/* Question */}
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={quizStep}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      className="text-[15px] font-bold text-[#141414] mb-8 leading-snug min-h-[3rem]"
                    >
                      {QUIZ_QUESTIONS[quizStep].text}
                    </motion.p>
                  </AnimatePresence>

                  {/* Answer buttons */}
                  <div className="grid grid-cols-5 gap-1.5 mb-5">
                    {ANSWER_LABELS.map((label, i) => {
                      const val = i + 1;
                      const selected = quizAnswers[quizStep] === val;
                      return (
                        <button
                          key={i}
                          onClick={() => answerQuestion(quizStep, val, quizAnswers)}
                          className={cx(
                            'flex flex-col items-center gap-2 py-3 border-2 transition-all',
                            selected
                              ? 'bg-[#8B5CF6] border-[#8B5CF6]'
                              : 'border-[#141414]/10 hover:border-[#8B5CF6]/40 hover:bg-[#8B5CF6]/5',
                          )}
                        >
                          <span className={cx('text-sm font-black', selected ? 'text-white' : 'text-[#141414]/50')}>{val}</span>
                          <span className={cx('text-[6px] font-black uppercase tracking-widest text-center leading-tight px-0.5', selected ? 'text-white/70' : 'text-[#141414]/25')}>
                            {label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Navigation */}
                  <div className="flex justify-between items-center">
                    <button
                      onClick={() => setQuizStep(s => Math.max(0, s - 1))}
                      disabled={quizStep === 0}
                      className="text-[10px] font-black uppercase tracking-widest text-[#141414]/30 hover:text-[#141414]/60 transition-colors disabled:opacity-20"
                    >
                      ← Précédent
                    </button>
                    {quizAnswers[quizStep] !== undefined && (
                      <button
                        onClick={() => answerQuestion(quizStep, quizAnswers[quizStep], quizAnswers)}
                        className="text-[10px] font-black uppercase tracking-widest text-[#8B5CF6] hover:text-[#7c3aed] transition-colors"
                      >
                        {quizStep === QUIZ_QUESTIONS.length - 1 ? 'Voir mes résultats →' : 'Suivant →'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Results */
                <div className="px-6 py-6">
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#141414]/35 mb-5">Vos résultats Big Five</p>
                  <div className="space-y-4 mb-6">
                    {DIM_ORDER.map(dimKey => {
                      const info = QUIZ_DIM[dimKey];
                      const bf = computeBigFive(quizAnswers);
                      const score = bf[info.key];
                      return (
                        <div key={dimKey}>
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: info.color }}>
                                {info.label}
                              </span>
                              <span className="text-[9px] text-[#141414]/30 ml-2">{info.desc}</span>
                            </div>
                            <span className="text-[10px] font-black text-[#141414]/35 flex-shrink-0 ml-2">{score}/10</span>
                          </div>
                          <div className="h-2 bg-[#141414]/5 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(score / 10) * 100}%` }}
                              transition={{ duration: 0.5, delay: DIM_ORDER.indexOf(dimKey) * 0.08 }}
                              className="h-full"
                              style={{ background: info.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setQuizOpen(false)}
                    className="w-full py-3 bg-[#8B5CF6] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#7c3aed] transition-colors"
                    style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.15)' }}
                  >
                    Enregistrer et fermer
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MBTI Info Modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mbtiInfoOpen && (
          <motion.div
            key="mbti-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
            onClick={() => setMbtiInfoOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 24 }}
              onClick={e => e.stopPropagation()}
              className="bg-white border-4 border-[#141414] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
              style={{ boxShadow: '8px 8px 0px 0px rgba(20,20,20,1)' }}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b-2 border-[#141414]/8 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-[#141414]/30 mb-0.5">Personnalité</p>
                  <h2 className="text-[13px] font-black uppercase tracking-widest text-[#141414]">Guide MBTI</h2>
                </div>
                <button onClick={() => setMbtiInfoOpen(false)} className="text-[#141414]/30 hover:text-[#141414]/70 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

                {/* 4 critères */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/35 mb-3">Les 4 dimensions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { letters: 'E / I', title: 'Énergie', desc: 'Extraversion — l\'énergie vient du monde extérieur, des interactions. Introversion — l\'énergie vient du monde intérieur, de la réflexion.' },
                      { letters: 'S / N', title: 'Information', desc: 'Sensation — focus sur les faits concrets, le présent, les détails. Intuition — focus sur les patterns, le futur, les abstractions.' },
                      { letters: 'T / F', title: 'Décision', desc: 'Pensée — décisions basées sur la logique et l\'objectivité. Sentiment — décisions basées sur les valeurs et l\'harmonie.' },
                      { letters: 'J / P', title: 'Organisation', desc: 'Jugement — préfère la structure, la planification, la clôture. Perception — préfère la flexibilité, l\'adaptation, la spontanéité.' },
                    ].map(({ letters, title, desc }) => (
                      <div key={letters} className="p-3 border border-[#141414]/8 bg-[#FAFAFA]">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[11px] font-black text-[#8B5CF6]">{letters}</span>
                          <span className="text-[9px] font-black uppercase tracking-widest text-[#141414]/40">{title}</span>
                        </div>
                        <p className="text-[10px] text-[#141414]/50 leading-relaxed">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 16 types by group */}
                {[
                  {
                    group: 'Analystes', color: '#8B5CF6', bg: '#8B5CF620',
                    desc: 'Rationnels stratégiques, tournés vers les systèmes et les idées.',
                    types: [
                      { type: 'INTJ', name: 'L\'Architecte', desc: 'Stratège visionnaire, indépendant et déterminé.' },
                      { type: 'INTP', name: 'Le Penseur',    desc: 'Analyste inventif, assoiffé de logique et de connaissance.' },
                      { type: 'ENTJ', name: 'Le Commandant', desc: 'Leader né, direct, stratégique et ambitieux.' },
                      { type: 'ENTP', name: 'Le Débatteur',  desc: 'Curieux provocateur, aime challenger les idées reçues.' },
                    ],
                  },
                  {
                    group: 'Diplomates', color: '#10B981', bg: '#10B98120',
                    desc: 'Empathiques et idéalistes, centrés sur les valeurs humaines.',
                    types: [
                      { type: 'INFJ', name: 'L\'Avocat',      desc: 'Idéaliste discret, profond, animé par sa mission.' },
                      { type: 'INFP', name: 'Le Médiateur',   desc: 'Créatif et empathique, cherche authenticité et sens.' },
                      { type: 'ENFJ', name: 'Le Protagoniste',desc: 'Charismatique et inspirant, naturellement leader.' },
                      { type: 'ENFP', name: 'Le Militant',    desc: 'Enthousiaste et créatif, explore toutes les possibilités.' },
                    ],
                  },
                  {
                    group: 'Sentinelles', color: '#3B82F6', bg: '#3B82F620',
                    desc: 'Fiables et organisés, piliers de stabilité et de tradition.',
                    types: [
                      { type: 'ISTJ', name: 'L\'Inspecteur', desc: 'Méthodique et fiable, respecte les règles et engagements.' },
                      { type: 'ISFJ', name: 'Le Défenseur',  desc: 'Attentionné et dévoué, protège ceux qui lui sont chers.' },
                      { type: 'ESTJ', name: 'L\'Exécutif',   desc: 'Organisateur direct, applique les règles avec fermeté.' },
                      { type: 'ESFJ', name: 'Le Consul',     desc: 'Sociable et loyal, crée du lien et veille à l\'harmonie.' },
                    ],
                  },
                  {
                    group: 'Explorateurs', color: '#F59E0B', bg: '#F59E0B20',
                    desc: 'Pragmatiques et spontanés, maîtres de l\'action et du moment présent.',
                    types: [
                      { type: 'ISTP', name: 'Le Virtuose',    desc: 'Observateur logique, expert en résolution de problèmes.' },
                      { type: 'ISFP', name: 'L\'Aventurier',  desc: 'Artiste sensible, vit pleinement dans le présent.' },
                      { type: 'ESTP', name: 'L\'Entrepreneur',desc: 'Énergique et pragmatique, aime le risque et l\'action.' },
                      { type: 'ESFP', name: 'L\'Animateur',   desc: 'Spontané et enthousiaste, centre de l\'attention.' },
                    ],
                  },
                ].map(({ group, color, bg, desc, types }) => (
                  <div key={group}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{group}</span>
                      <span className="text-[9px] text-[#141414]/35">— {desc}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {types.map(({ type, name, desc: tdesc }) => (
                        <button
                          key={type}
                          onClick={() => { updateProfile({ mbti: profile.mbti === type ? '' : type }); setMbtiInfoOpen(false); }}
                          className={cx(
                            'flex items-start gap-2.5 p-3 border-2 text-left transition-all',
                            profile.mbti === type
                              ? 'border-2 text-white'
                              : 'border-[#141414]/8 hover:border-opacity-60',
                          )}
                          style={
                            profile.mbti === type
                              ? { background: color, borderColor: color }
                              : { background: bg, borderColor: `${color}30` }
                          }
                        >
                          <span
                            className="text-[11px] font-black flex-shrink-0 mt-px"
                            style={{ color: profile.mbti === type ? 'white' : color }}
                          >
                            {type}
                          </span>
                          <div className="min-w-0">
                            <p className={cx('text-[10px] font-black leading-tight', profile.mbti === type ? 'text-white' : 'text-[#141414]')}>
                              {name}
                            </p>
                            <p className={cx('text-[9px] leading-relaxed mt-0.5', profile.mbti === type ? 'text-white/70' : 'text-[#141414]/40')}>
                              {tdesc}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <p className="text-[9px] text-[#141414]/25 text-center pb-2">
                  Cliquez sur un type pour le sélectionner directement.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
