import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Swords, Globe, Calendar, Loader2, ChevronRight, X,
  Plus, Pen, AlertTriangle, Search, Mic2, Sparkles,
} from 'lucide-react';
import {
  DEBATE_PERSONAS_LIST,
  type DebatePersona,
  validateCustomPrompt,
  buildCustomDebatePrompt,
  CUSTOM_PERSONA_MAX_NAME,
  CUSTOM_PERSONA_MAX_DESC,
} from './debatePersonas';
import { INTERVIEW_TYPES_LIST, type InterviewTypeConfig } from './interviewTypes';
import { buildProfileContext, isProfileFilled, type UserProfile } from './userProfile';

// ─── cx helper ──────────────────────────────────────────────────────────────
function cx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Props ──────────────────────────────────────────────────────────────────
type Props = {
  onBack: () => void;
  onStartDebate: (persona: DebatePersona) => Promise<void>;
  onStartInterview: (config: InterviewTypeConfig, systemPrompt: string, title: string) => Promise<void>;
  userProfile?: UserProfile;
};

// ─── Tabs ────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'debat' as const, label: 'Débat', icon: Swords },
  { id: 'interview' as const, label: 'Interview', icon: Mic2 },
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function LibraryPage({ onBack, onStartDebate, onStartInterview, userProfile }: Props) {
  // ── Tab navigation
  const [activeTab, setActiveTab] = useState<'debat' | 'interview'>('debat');

  // ── Debate state
  const [selectedPersona, setSelectedPersona] = useState<DebatePersona | null>(null);
  const [starting, setStarting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('Tous');
  const categories = ['Tous', ...Array.from(new Set(DEBATE_PERSONAS_LIST.map(p => p.category)))];
  const visiblePersonas = DEBATE_PERSONAS_LIST.filter(p => {
    const matchesCategory = filterCategory === 'Tous' || p.category === filterCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.title.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customError, setCustomError] = useState('');
  const [customStarting, setCustomStarting] = useState(false);

  // ── Interview state
  const [interviewModalType, setInterviewModalType] = useState<InterviewTypeConfig | null>(null);
  const [interviewFieldValues, setInterviewFieldValues] = useState<Record<string, string>>({});
  const [interviewRawNotes, setInterviewRawNotes] = useState('');
  const [interviewRefinedContext, setInterviewRefinedContext] = useState('');
  const [interviewRefining, setInterviewRefining] = useState(false);
  const [interviewRefineDone, setInterviewRefineDone] = useState(false);
  const [interviewTitle, setInterviewTitle] = useState('');
  const [interviewStarting, setInterviewStarting] = useState(false);
  const [interviewAutofilling, setInterviewAutofilling] = useState(false);

  // ─── Debate handlers ─────────────────────────────────────────────────────

  const handleStart = async (persona: DebatePersona) => {
    setStarting(true);
    await onStartDebate(persona);
    setStarting(false);
    setSelectedPersona(null);
  };

  const handleCustomSubmit = async () => {
    setCustomError('');
    const validation = validateCustomPrompt(customName, customDesc);
    if (!validation.ok) { setCustomError(validation.error ?? 'Erreur de validation.'); return; }
    setCustomStarting(true);
    const currentDate = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const safeName = customName.trim();
    const customPersona: DebatePersona = {
      id: 'custom',
      name: safeName,
      shortName: safeName.split(' ')[0],
      title: 'Opposant personnalisé',
      country: 'Personnalisé',
      flag: '⚔️',
      language: 'Français',
      born: '',
      category: 'Personnalisé',
      color: '#7C3AED',
      description: customDesc.trim() || "Opposant personnalisé créé par l'utilisateur.",
      keyFacts: [],
      wikiSlug: '',
      wikiLang: 'fr',
      suggestedTopics: ['', '', ''],
      buildSystemPrompt: (_wikiContext, date) =>
        buildCustomDebatePrompt(safeName, customDesc.trim(), date || currentDate),
    };
    await onStartDebate(customPersona);
    setCustomStarting(false);
    setCustomModalOpen(false);
    setCustomName('');
    setCustomDesc('');
  };

  const handleCustomClose = () => {
    setCustomModalOpen(false);
    setCustomName('');
    setCustomDesc('');
    setCustomError('');
  };

  // ─── Interview handlers ──────────────────────────────────────────────────

  const openInterviewModal = (config: InterviewTypeConfig) => {
    setInterviewModalType(config);
    setInterviewFieldValues({});
    setInterviewRawNotes('');
    setInterviewRefinedContext('');
    setInterviewRefineDone(false);
    setInterviewTitle(
      `${config.label} — ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
    );
  };

  const closeInterviewModal = () => {
    setInterviewModalType(null);
  };

  const setField = (id: string, value: string) => {
    setInterviewFieldValues(prev => ({ ...prev, [id]: value }));
  };

  const handleRefine = async () => {
    if (!interviewModalType) return;
    const parts: string[] = [];
    interviewModalType.fields.forEach(f => {
      const val = (interviewFieldValues[f.id] ?? '').trim();
      if (val) parts.push(`${f.label}: ${val}`);
    });
    if (interviewRawNotes.trim()) parts.push(`Informations complémentaires: ${interviewRawNotes.trim()}`);
    if (!parts.length) return;

    setInterviewRefining(true);
    try {
      const apiKey = import.meta.env.VITE_MISTRAL_API_KEY;
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          temperature: 0.4,
          messages: [
            {
              role: 'system',
              content: `Tu reformules les informations brutes d'un utilisateur en un contexte structuré et précis pour préparer une session de type "${interviewModalType.label}". Sois concis (max 250 mots), structure clairement, conserve TOUS les éléments importants. Réponds directement, sans intro ni conclusion.`,
            },
            { role: 'user', content: parts.join('\n') },
          ],
        }),
      });
      const data = await res.json();
      const refined = data.choices?.[0]?.message?.content ?? parts.join('\n');
      setInterviewRefinedContext(refined);
      setInterviewRefineDone(true);
    } catch {
      setInterviewRefinedContext(parts.join('\n'));
      setInterviewRefineDone(true);
    } finally {
      setInterviewRefining(false);
    }
  };

  const handleAutofillFromProfile = async () => {
    if (!interviewModalType || !userProfile) return;
    setInterviewAutofilling(true);
    try {
      const apiKey = import.meta.env.VITE_MISTRAL_API_KEY;
      const profileLines: string[] = [];
      if (userProfile.displayName) profileLines.push(`Nom : ${userProfile.displayName}`);
      if (userProfile.background) profileLines.push(`Parcours : ${userProfile.background}`);
      if (userProfile.linkedin) profileLines.push(`LinkedIn : ${userProfile.linkedin}`);
      if (userProfile.cvText) profileLines.push(`CV :\n${userProfile.cvText.slice(0, 800)}`);
      if (userProfile.mbti) profileLines.push(`MBTI : ${userProfile.mbti}`);
      if (userProfile.personalityNotes) profileLines.push(`Personnalité : ${userProfile.personalityNotes}`);
      if (userProfile.neuroTags.length) profileLines.push(`Profil neuro : ${userProfile.neuroTags.join(', ')}`);
      if (userProfile.interests.length) profileLines.push(`Centres d'intérêt : ${userProfile.interests.join(', ')}`);
      if (userProfile.interestNotes) profileLines.push(`Détail intérêts : ${userProfile.interestNotes}`);

      const fieldsDesc = interviewModalType.fields
        .map(f => `- "${f.id}" (${f.label}) : ${f.placeholder}`)
        .join('\n');

      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content:
                `Tu préremplis un formulaire de préparation pour une session de type "${interviewModalType.label}" en te basant sur le profil d'un utilisateur.\n` +
                `Remplis uniquement les champs pour lesquels le profil contient des informations pertinentes. Laisse vide si tu ne sais pas.\n` +
                `Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explication. Format strict : {"fieldId": "valeur", ...}`,
            },
            {
              role: 'user',
              content:
                `Profil utilisateur :\n${profileLines.join('\n')}\n\n` +
                `Champs à remplir :\n${fieldsDesc}`,
            },
          ],
        }),
      });
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content ?? '{}';
      // Extract JSON (strip potential markdown code blocks)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const filled = JSON.parse(jsonMatch[0]) as Record<string, string>;
        setInterviewFieldValues(prev => {
          const next = { ...prev };
          interviewModalType.fields.forEach(f => {
            if (filled[f.id] && String(filled[f.id]).trim()) {
              next[f.id] = String(filled[f.id]).slice(0, f.maxLength);
            }
          });
          return next;
        });
      }
    } catch { /* silencieux */ }
    finally { setInterviewAutofilling(false); }
  };

  const handleStartInterview = async () => {
    if (!interviewModalType) return;
    const context = interviewRefinedContext || interviewModalType.fields
      .map(f => {
        const v = (interviewFieldValues[f.id] ?? '').trim();
        return v ? `${f.label}: ${v}` : '';
      })
      .filter(Boolean)
      .join('\n') + (interviewRawNotes.trim() ? `\n${interviewRawNotes.trim()}` : '');

    const currentDate = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    let systemPrompt = interviewModalType.buildSystemPrompt(context, currentDate);
    if (userProfile) {
      const profileCtx = buildProfileContext(userProfile);
      if (profileCtx) systemPrompt += '\n\n' + profileCtx;
    }
    const title = interviewTitle.trim() || interviewModalType.label;

    setInterviewStarting(true);
    await onStartInterview(interviewModalType, systemPrompt, title);
    setInterviewStarting(false);
    setInterviewModalType(null);
  };

  const hasAnyField = interviewModalType
    ? interviewModalType.fields.some(f => (interviewFieldValues[f.id] ?? '').trim()) || interviewRawNotes.trim()
    : false;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[#F0F4FF] overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 bg-white border-b-4 border-[#5D7BFF] px-6 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#5D7BFF] hover:opacity-70 transition-opacity flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-[13px] font-black uppercase tracking-widest text-[#141414]">Bibliothèque</p>
          <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/35">
            Entraînements & Scénarios
          </p>
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div className="flex-shrink-0 bg-white border-b-2 border-[#5D7BFF]/10 px-6">
        <div className="flex gap-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cx(
                'flex items-center gap-2 px-5 py-3.5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all',
                activeTab === id
                  ? 'border-[#5D7BFF] text-[#5D7BFF]'
                  : 'border-transparent text-[#141414]/30 hover:text-[#5D7BFF]/60'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-8">

        {/* ══════════ DÉBAT TAB ══════════ */}
        {activeTab === 'debat' && (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 bg-[#5D7BFF] flex items-center justify-center">
                  <Swords className="w-3.5 h-3.5 text-white" />
                </div>
                <h2 className="text-[15px] font-black uppercase tracking-widest text-[#141414]">Débat</h2>
              </div>
              <p className="text-[11px] text-[#141414]/40 font-medium ml-10">
                Affronte des personnages publics ou historiques. L'IA incarne leur pensée, leur style, leurs positions réelles — enrichies par des données web en temps réel.
              </p>
            </div>

            {/* Search + filter */}
            <div className="mb-6 space-y-3 max-w-5xl">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/25 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un personnage…"
                  className="w-full bg-white border-2 border-[#141414]/8 focus:border-[#5D7BFF] pl-10 pr-4 py-2.5 text-[12px] font-medium text-[#141414] placeholder:text-[#141414]/25 focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#141414]/25 hover:text-[#141414]/60 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={cx(
                      'px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border-2 transition-all',
                      filterCategory === cat
                        ? 'bg-[#5D7BFF] border-[#5D7BFF] text-white'
                        : 'bg-white border-[#141414]/10 text-[#141414]/40 hover:border-[#5D7BFF]/40 hover:text-[#5D7BFF]'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Persona cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
              {visiblePersonas.map((persona, i) => (
                <motion.button
                  key={persona.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => setSelectedPersona(persona)}
                  className="text-left bg-white border-2 border-[#141414]/8 hover:border-[#5D7BFF]/40 transition-all group overflow-hidden"
                  style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.06)' }}
                >
                  <div className="h-2 w-full" style={{ backgroundColor: persona.color }} />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-[#5D7BFF] mb-1">{persona.category}</p>
                        <h3 className="text-[14px] font-black text-[#141414] leading-tight">{persona.name}</h3>
                        <p className="text-[10px] text-[#141414]/40 font-medium mt-0.5">{persona.title}</p>
                      </div>
                      <span className="text-2xl flex-shrink-0 mt-0.5">{persona.flag}</span>
                    </div>
                    <p className="text-[11px] text-[#141414]/55 leading-relaxed mb-4 line-clamp-3">{persona.description}</p>
                    <div className="space-y-1 mb-4">
                      {persona.keyFacts.slice(0, 3).map((fact) => (
                        <div key={fact} className="flex items-start gap-1.5">
                          <div className="w-1 h-1 rounded-full bg-[#5D7BFF]/50 mt-1.5 flex-shrink-0" />
                          <p className="text-[10px] text-[#141414]/45">{fact}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-[9px] text-[#141414]/30 font-bold uppercase tracking-wider border-t border-[#141414]/6 pt-3">
                      <span className="flex items-center gap-1">
                        <Globe className="w-2.5 h-2.5" />
                        {persona.language}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {persona.born.split(',')[0]}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#5D7BFF] flex items-center gap-1.5">
                        Voir le profil
                        <ChevronRight className="w-3 h-3" />
                      </span>
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: persona.color }} />
                    </div>
                  </div>
                </motion.button>
              ))}

              {/* Custom persona card */}
              {!searchQuery && filterCategory === 'Tous' && (
                <motion.button
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: visiblePersonas.length * 0.07 }}
                  onClick={() => setCustomModalOpen(true)}
                  className="text-left bg-white border-2 border-dashed border-[#7C3AED]/30 hover:border-[#7C3AED]/70 hover:bg-[#7C3AED]/[0.02] transition-all group overflow-hidden"
                  style={{ boxShadow: '4px 4px 0px 0px rgba(124,58,237,0.08)' }}
                >
                  <div className="h-2 w-full" style={{ background: 'linear-gradient(90deg, #7C3AED, #A855F7)' }} />
                  <div className="p-5 flex flex-col h-full min-h-[260px]">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: '#7C3AED' }}>Personnalisé</p>
                        <h3 className="text-[14px] font-black text-[#141414] leading-tight">Créer un opposant</h3>
                        <p className="text-[10px] text-[#141414]/40 font-medium mt-0.5">Personnage sur mesure</p>
                      </div>
                      <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.1)', border: '1px dashed rgba(124,58,237,0.4)' }}>
                        <Plus className="w-5 h-5" style={{ color: '#7C3AED' }} />
                      </div>
                    </div>
                    <p className="text-[11px] text-[#141414]/55 leading-relaxed mb-4 flex-1">
                      Décris ton adversaire idéal — philosophe, entrepreneur, historien, personnage fictif... L'IA jouera ce rôle pendant tout le débat.
                    </p>
                    <div className="flex items-center gap-3 text-[9px] text-[#141414]/30 font-bold uppercase tracking-wider border-t border-[#141414]/6 pt-3">
                      <span className="flex items-center gap-1"><Pen className="w-2.5 h-2.5" />Prompt libre</span>
                    </div>
                    <div className="mt-4">
                      <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: '#7C3AED' }}>
                        Créer & Débattre <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </motion.button>
              )}
            </div>
          </>
        )}

        {/* ══════════ INTERVIEW TAB ══════════ */}
        {activeTab === 'interview' && (
          <>
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 flex items-center justify-center" style={{ background: '#F59E0B' }}>
                  <Mic2 className="w-3.5 h-3.5 text-white" />
                </div>
                <h2 className="text-[15px] font-black uppercase tracking-widest text-[#141414]">Interview</h2>
              </div>
              <p className="text-[11px] text-[#141414]/40 font-medium ml-10">
                Prépare-toi à n'importe quelle situation d'oral. L'IA joue le rôle de ton interlocuteur — recruteur, jury, animateur, investisseur.
              </p>
            </div>

            {/* Interview type cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl">
              {INTERVIEW_TYPES_LIST.map((config, i) => {
                const Icon = config.icon;
                return (
                  <motion.button
                    key={config.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => openInterviewModal(config)}
                    className="text-left group overflow-hidden border-2 border-[#141414]/8 hover:border-transparent transition-all"
                    style={{
                      background: '#fff',
                      boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.06)',
                    }}
                  >
                    {/* Top accent band */}
                    <div className="h-1.5 w-full" style={{ backgroundColor: config.accentColor }} />

                    <div className="p-6">
                      {/* Icon + label */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div
                          className="w-11 h-11 flex items-center justify-center flex-shrink-0"
                          style={{ background: `${config.accentColor}18`, border: `1.5px solid ${config.accentColor}35` }}
                        >
                          <Icon className="w-5 h-5" style={{ color: config.accentColor }} />
                        </div>
                        <div
                          className="text-[7px] font-black uppercase tracking-widest px-2 py-1 flex-shrink-0"
                          style={{ background: `${config.accentColor}14`, color: config.accentColor }}
                        >
                          {config.interviewerRole}
                        </div>
                      </div>

                      <h3 className="text-[15px] font-black text-[#141414] leading-tight mb-2">
                        {config.label}
                      </h3>
                      <p className="text-[11px] text-[#141414]/50 leading-relaxed mb-5">
                        {config.description}
                      </p>

                      {/* Fields preview */}
                      <div className="space-y-1 mb-5">
                        {config.fields.slice(0, 3).map(f => (
                          <div key={f.id} className="flex items-center gap-1.5">
                            <div className="w-1 h-1 flex-shrink-0 rounded-full" style={{ backgroundColor: config.accentColor }} />
                            <p className="text-[9px] text-[#141414]/35 font-medium">{f.label}</p>
                          </div>
                        ))}
                        {config.fields.length > 3 && (
                          <p className="text-[9px] text-[#141414]/25 pl-2.5">+{config.fields.length - 3} autres…</p>
                        )}
                      </div>

                      {/* CTA */}
                      <div className="flex items-center justify-between border-t border-[#141414]/6 pt-4">
                        <span
                          className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all group-hover:gap-2.5"
                          style={{ color: config.accentColor }}
                        >
                          Configurer
                          <ChevronRight className="w-3 h-3" />
                        </span>
                        <Sparkles className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: config.accentColor }} />
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          MODALS
      ───────────────────────────────────────────────────────────────────── */}

      {/* ── Persona detail modal (Débat) ── */}
      <AnimatePresence>
        {selectedPersona && (
          <motion.div
            key="persona-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(10,10,20,0.75)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedPersona(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-xl max-h-[85vh] overflow-y-auto"
              style={{ boxShadow: '8px 8px 0px 0px rgba(20,20,20,0.15)' }}
            >
              <div className="h-3 w-full" style={{ backgroundColor: selectedPersona.color }} />
              <div className="px-7 py-6 border-b-2 border-[#141414]/6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#5D7BFF] mb-1">
                    {selectedPersona.category} · {selectedPersona.country} {selectedPersona.flag}
                  </p>
                  <h2 className="text-[22px] font-black text-[#141414] leading-tight">{selectedPersona.name}</h2>
                  <p className="text-[11px] text-[#141414]/40 font-medium mt-1">{selectedPersona.title}</p>
                </div>
                <button onClick={() => setSelectedPersona(null)} className="text-[#141414]/20 hover:text-[#141414]/60 transition-colors flex-shrink-0 mt-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-7 py-5 space-y-5">
                <p className="text-[12px] text-[#141414]/60 leading-relaxed">{selectedPersona.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Né(e)', value: selectedPersona.born },
                    { label: 'Langue', value: selectedPersona.language },
                    { label: 'Pays', value: selectedPersona.country },
                    { label: 'Catégorie', value: selectedPersona.category },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-[#F0F4FF] p-3">
                      <p className="text-[8px] font-black uppercase tracking-widest text-[#141414]/30 mb-0.5">{label}</p>
                      <p className="text-[11px] font-bold text-[#141414]/70">{value}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/30 mb-3">Faits marquants</p>
                  <div className="space-y-2">
                    {selectedPersona.keyFacts.map((fact) => (
                      <div key={fact} className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: selectedPersona.color }} />
                        <p className="text-[11px] text-[#141414]/60">{fact}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#5D7BFF]/6 border border-[#5D7BFF]/15">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#5D7BFF] animate-pulse" />
                  <p className="text-[10px] font-bold text-[#5D7BFF]/70">
                    Contexte web chargé en temps réel · Wikipedia + actualités récentes
                  </p>
                </div>
              </div>
              <div className="px-7 pb-7">
                <button
                  onClick={() => handleStart(selectedPersona)}
                  disabled={starting}
                  className="w-full flex items-center justify-center gap-3 py-4 text-white text-[12px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-60 transition-all"
                  style={{ backgroundColor: selectedPersona.color, boxShadow: `4px 4px 0px 0px ${selectedPersona.color}40` }}
                >
                  {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Swords className="w-5 h-5" />}
                  {starting ? 'Chargement du contexte…' : `Débattre contre ${selectedPersona.shortName}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Custom persona modal (Débat) ── */}
      <AnimatePresence>
        {customModalOpen && (
          <motion.div
            key="custom-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(10,10,20,0.80)' }}
            onClick={(e) => { if (e.target === e.currentTarget) handleCustomClose(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg"
              style={{ boxShadow: '8px 8px 0px 0px rgba(124,58,237,0.2)' }}
            >
              <div className="h-3 w-full" style={{ background: 'linear-gradient(90deg, #7C3AED, #A855F7)' }} />
              <div className="px-7 py-6 border-b-2 border-[#141414]/6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: '#7C3AED' }}>Opposant personnalisé</p>
                  <h2 className="text-[20px] font-black text-[#141414] leading-tight">Créer un adversaire</h2>
                  <p className="text-[11px] text-[#141414]/40 font-medium mt-1">Décris le personnage que tu veux affronter</p>
                </div>
                <button onClick={handleCustomClose} className="text-[#141414]/20 hover:text-[#141414]/60 transition-colors flex-shrink-0 mt-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-7 py-5 space-y-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[#141414]/40 mb-2">Nom du personnage *</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => { setCustomName(e.target.value.slice(0, CUSTOM_PERSONA_MAX_NAME)); setCustomError(''); }}
                    placeholder="ex: Socrate, Simone de Beauvoir, un PDG de startup…"
                    className="w-full border-2 border-[#141414]/10 focus:border-[#7C3AED] bg-[#F8F7FF] px-4 py-3 text-sm font-medium text-[#141414] placeholder:text-[#141414]/25 focus:outline-none transition-colors"
                    maxLength={CUSTOM_PERSONA_MAX_NAME}
                  />
                  <p className="text-[9px] text-[#141414]/25 mt-1 text-right">{customName.length}/{CUSTOM_PERSONA_MAX_NAME}</p>
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[#141414]/40 mb-2">Description / Profil <span className="normal-case font-normal">(optionnel)</span></label>
                  <textarea
                    value={customDesc}
                    onChange={(e) => { setCustomDesc(e.target.value.slice(0, CUSTOM_PERSONA_MAX_DESC)); setCustomError(''); }}
                    placeholder="Décris sa personnalité, ses convictions, son style de débat, ses positions sur les grands sujets…"
                    rows={5}
                    className="w-full border-2 border-[#141414]/10 focus:border-[#7C3AED] bg-[#F8F7FF] px-4 py-3 text-sm font-medium text-[#141414] placeholder:text-[#141414]/25 focus:outline-none transition-colors resize-none leading-relaxed"
                    maxLength={CUSTOM_PERSONA_MAX_DESC}
                  />
                  <p className="text-[9px] text-[#141414]/25 mt-1 text-right">{customDesc.length}/{CUSTOM_PERSONA_MAX_DESC}</p>
                </div>
                <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200/60">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[9px] text-amber-700/80 leading-relaxed">
                    Décris simplement le personnage et ses positions. Les tentatives de modifier le comportement du système sont détectées et bloquées.
                  </p>
                </div>
                {customError && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <p className="text-[10px] font-bold text-red-600">{customError}</p>
                  </motion.div>
                )}
              </div>
              <div className="px-7 pb-7">
                <button
                  onClick={handleCustomSubmit}
                  disabled={customStarting || !customName.trim()}
                  className="w-full flex items-center justify-center gap-3 py-4 text-white text-[12px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all"
                  style={{ background: 'linear-gradient(90deg, #7C3AED, #A855F7)', boxShadow: '4px 4px 0px 0px rgba(124,58,237,0.3)' }}
                >
                  {customStarting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Swords className="w-5 h-5" />}
                  {customStarting ? 'Création en cours…' : 'Créer & Lancer le débat'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Interview setup modal ── */}
      <AnimatePresence>
        {interviewModalType && (
          <motion.div
            key="interview-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(8,4,20,0.85)' }}
            onClick={(e) => { if (e.target === e.currentTarget) closeInterviewModal(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-xl max-h-[90vh] overflow-y-auto"
              style={{
                background: '#fff',
                boxShadow: `8px 8px 0px 0px ${interviewModalType.accentColor}35`,
              }}
            >
              {/* Top accent band */}
              <div className="h-3 w-full" style={{ backgroundColor: interviewModalType.accentColor }} />

              {/* Header */}
              <div className="px-7 py-6 border-b-2 border-[#141414]/6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 flex items-center justify-center flex-shrink-0"
                    style={{ background: `${interviewModalType.accentColor}18`, border: `2px solid ${interviewModalType.accentColor}35` }}
                  >
                    {React.createElement(interviewModalType.icon, {
                      className: 'w-6 h-6',
                      style: { color: interviewModalType.accentColor },
                    })}
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: interviewModalType.accentColor }}>
                      {interviewModalType.interviewerRole}
                    </p>
                    <h2 className="text-[20px] font-black text-[#141414] leading-tight">{interviewModalType.label}</h2>
                    <p className="text-[11px] text-[#141414]/40 font-medium mt-0.5">{interviewModalType.description}</p>
                  </div>
                </div>
                <button onClick={closeInterviewModal} className="text-[#141414]/20 hover:text-[#141414]/60 transition-colors flex-shrink-0 mt-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-7 py-6 space-y-5">

                {/* Title field */}
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[#141414]/35 mb-2">
                    Titre de la session
                  </label>
                  <input
                    type="text"
                    value={interviewTitle}
                    onChange={(e) => setInterviewTitle(e.target.value)}
                    placeholder={`Ex : ${interviewModalType.label} — Google`}
                    className="w-full border-2 border-[#141414]/10 px-4 py-2.5 text-[13px] font-medium text-[#141414] placeholder:text-[#141414]/25 focus:outline-none transition-colors"
                    style={{ focusBorderColor: interviewModalType.accentColor }}
                    onFocus={e => (e.currentTarget.style.borderColor = interviewModalType.accentColor)}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(20,20,20,0.1)')}
                  />
                </div>

                {/* Separator */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[#141414]/8" />
                  <p className="text-[8px] font-black uppercase tracking-widest text-[#141414]/25">Contexte</p>
                  <div className="flex-1 h-px bg-[#141414]/8" />
                </div>

                {/* Autofill from profile */}
                {userProfile && isProfileFilled(userProfile) && (
                  <button
                    onClick={handleAutofillFromProfile}
                    disabled={interviewAutofilling}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                    style={{
                      borderColor: `${interviewModalType.accentColor}50`,
                      color: interviewModalType.accentColor,
                      background: `${interviewModalType.accentColor}06`,
                    }}
                  >
                    {interviewAutofilling ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span className="text-[13px] leading-none">🪄</span>
                    )}
                    {interviewAutofilling ? 'Remplissage en cours…' : 'Remplir depuis mon profil'}
                  </button>
                )}

                {/* Specific fields */}
                {interviewModalType.fields.map(field => (
                  <div key={field.id}>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-[#141414]/40 mb-2">
                      {field.label}
                    </label>
                    {field.multiline ? (
                      <textarea
                        value={interviewFieldValues[field.id] ?? ''}
                        onChange={(e) => setField(field.id, e.target.value.slice(0, field.maxLength))}
                        placeholder={field.placeholder}
                        rows={3}
                        className="w-full border-2 border-[#141414]/10 px-4 py-3 text-[12px] font-medium text-[#141414] placeholder:text-[#141414]/20 focus:outline-none transition-colors resize-none leading-relaxed"
                        onFocus={e => (e.currentTarget.style.borderColor = interviewModalType.accentColor)}
                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(20,20,20,0.1)')}
                        maxLength={field.maxLength}
                      />
                    ) : (
                      <input
                        type="text"
                        value={interviewFieldValues[field.id] ?? ''}
                        onChange={(e) => setField(field.id, e.target.value.slice(0, field.maxLength))}
                        placeholder={field.placeholder}
                        className="w-full border-2 border-[#141414]/10 px-4 py-2.5 text-[12px] font-medium text-[#141414] placeholder:text-[#141414]/20 focus:outline-none transition-colors"
                        onFocus={e => (e.currentTarget.style.borderColor = interviewModalType.accentColor)}
                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(20,20,20,0.1)')}
                        maxLength={field.maxLength}
                      />
                    )}
                  </div>
                ))}

                {/* Raw notes */}
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[#141414]/35 mb-2">
                    Infos complémentaires <span className="normal-case font-normal text-[#141414]/20">(optionnel — en vrac)</span>
                  </label>
                  <textarea
                    value={interviewRawNotes}
                    onChange={(e) => setInterviewRawNotes(e.target.value)}
                    placeholder="Tout ce qui pourrait être utile à l'IA pour être plus précis et pertinent dans ses questions…"
                    rows={3}
                    className="w-full border-2 border-dashed border-[#141414]/15 px-4 py-3 text-[12px] font-medium text-[#141414] placeholder:text-[#141414]/20 focus:outline-none transition-colors resize-none leading-relaxed bg-[#141414]/[0.015]"
                    onFocus={e => (e.currentTarget.style.borderColor = interviewModalType.accentColor)}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(20,20,20,0.15)')}
                  />
                </div>

                {/* ✨ Refine button */}
                <button
                  onClick={handleRefine}
                  disabled={interviewRefining || !hasAnyField}
                  className="w-full flex items-center justify-center gap-2.5 py-3 border-2 text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                  style={{
                    borderColor: interviewModalType.accentColor,
                    color: interviewModalType.accentColor,
                    background: `${interviewModalType.accentColor}0A`,
                  }}
                >
                  {interviewRefining ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {interviewRefining ? 'Reformulation en cours…' : interviewRefineDone ? '✓ Reformuler à nouveau' : '✨ Reformuler avec l\'IA'}
                </button>

                {/* Refined context (editable) */}
                <AnimatePresence>
                  {interviewRefineDone && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label className="block text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: interviewModalType.accentColor }}>
                        ✓ Contexte reformulé — éditable
                      </label>
                      <textarea
                        value={interviewRefinedContext}
                        onChange={(e) => setInterviewRefinedContext(e.target.value)}
                        rows={6}
                        className="w-full border-2 px-4 py-3 text-[12px] font-medium text-[#141414] focus:outline-none transition-colors resize-none leading-relaxed"
                        style={{ borderColor: `${interviewModalType.accentColor}50`, background: `${interviewModalType.accentColor}08` }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* CTA */}
              <div className="px-7 pb-7">
                <button
                  onClick={handleStartInterview}
                  disabled={interviewStarting}
                  className="w-full flex items-center justify-center gap-3 py-4 text-white text-[12px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all"
                  style={{
                    backgroundColor: interviewModalType.accentColor,
                    boxShadow: `4px 4px 0px 0px ${interviewModalType.accentColor}40`,
                  }}
                >
                  {interviewStarting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    React.createElement(interviewModalType.icon, { className: 'w-5 h-5' })
                  )}
                  {interviewStarting ? "Lancement de la session…" : `Commencer — ${interviewModalType.interviewerRole}`}
                </button>
                <p className="text-[9px] text-[#141414]/25 text-center mt-3 font-medium">
                  L'IA ouvrira la session avec sa première question
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
