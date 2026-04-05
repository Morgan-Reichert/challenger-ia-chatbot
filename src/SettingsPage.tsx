import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, User, Briefcase, Brain, Heart, Download, Upload,
  Trash2, Check, X, Sparkles, FileText, Zap,
} from 'lucide-react';
import {
  type UserProfile, type NeuroTag, type BigFiveResult,
  NEURO_TAGS, MBTI_TYPES, saveProfile, exportProfile, importProfileFromJson, EMPTY_PROFILE,
} from './userProfile';

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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5">
        <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/50">{label}</p>
        {hint && <p className="text-[10px] text-[#141414]/30 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const INPUT_BASE = 'w-full px-4 py-3 border-2 border-[#141414]/10 focus:outline-none text-sm font-medium bg-white transition-colors';
const TEXTAREA_BASE = INPUT_BASE + ' resize-none leading-relaxed';

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  onBack: () => void;
  profile: UserProfile;
  onSave: (p: UserProfile) => void;
};

export default function SettingsPage({ onBack, profile: initialProfile, onSave }: Props) {
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [saved, setSaved] = useState(false);

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
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

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
      <div className="flex-shrink-0 bg-white border-b-4 border-[#5D7BFF] px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-[#5D7BFF] hover:opacity-70 transition-opacity flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[13px] font-black uppercase tracking-widest text-[#141414]">Profil IA</h1>
          <p className="text-[9px] font-medium text-[#141414]/40 uppercase tracking-widest mt-0.5">
            Personnalisation de vos sessions
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

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-[#F8F9FF]">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

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
                  {profile.cvFileName ? `📄 ${profile.cvFileName}` : 'Déposer un .txt ou .md — ou cliquer'}
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

          {/* ── PERSONNALITÉ */}
          <Section icon={Brain} title="Personnalité" accent="#8B5CF6">
            <Field label="Type MBTI" hint="Sélectionnez votre type si vous le connaissez. Cliquez à nouveau pour désélectionner.">
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

          {/* ── NEURO */}
          <Section icon={Zap} title="Profil neuro" accent="#10B981">
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
    </div>
  );
}
