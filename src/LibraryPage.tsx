import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Loader2, X, Mic2, Sparkles,
} from 'lucide-react';
import { INTERVIEW_TYPES_LIST, type InterviewTypeConfig } from './interviewTypes';
import { buildProfileContext, isProfileFilled, type UserProfile } from './userProfile';
import { apiFetch } from './apiClient';

// ─── cx helper ──────────────────────────────────────────────────────────────
function cx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Props ──────────────────────────────────────────────────────────────────
type Props = {
  onBack: () => void;
  onStartInterview: (config: InterviewTypeConfig, systemPrompt: string, title: string) => Promise<void>;
  userProfile?: UserProfile;
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function LibraryPage({ onBack, onStartInterview, userProfile }: Props) {
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
      const res = await apiFetch('/api/chat', {
        method: 'POST',
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

      const res = await apiFetch('/api/chat', {
        method: 'POST',
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
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[var(--bg-app)] overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 bg-[var(--bg-chat)] border-b-4 border-[#5D7BFF] px-6 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#5D7BFF] hover:opacity-70 transition-opacity flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-[13px] font-black uppercase tracking-widest text-[var(--text-primary)]">Bibliothèque</p>
          <p className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-primary)]/35">
            Entraînements & Scénarios
          </p>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-8">

        {/* ══════════ INTERVIEW ══════════ */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-7 h-7 flex items-center justify-center" style={{ background: '#F59E0B' }}>
              <Mic2 className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-[15px] font-black uppercase tracking-widest text-[var(--text-primary)]">Interview</h2>
          </div>
          <p className="text-[11px] text-[var(--text-primary)]/40 font-medium ml-10">
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
                className="text-left group overflow-hidden border-2 border-[var(--text-primary)]/8 hover:border-transparent transition-all bg-[var(--bg-chat)]"
                style={{
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

                  <h3 className="text-[15px] font-black text-[var(--text-primary)] leading-tight mb-2">
                    {config.label}
                  </h3>
                  <p className="text-[11px] text-[var(--text-primary)]/50 leading-relaxed mb-5">
                    {config.description}
                  </p>

                  {/* Fields preview */}
                  <div className="space-y-1 mb-5">
                    {config.fields.slice(0, 3).map(f => (
                      <div key={f.id} className="flex items-center gap-1.5">
                        <div className="w-1 h-1 flex-shrink-0 rounded-full" style={{ backgroundColor: config.accentColor }} />
                        <p className="text-[9px] text-[var(--text-primary)]/35 font-medium">{f.label}</p>
                      </div>
                    ))}
                    {config.fields.length > 3 && (
                      <p className="text-[9px] text-[var(--text-primary)]/25 pl-2.5">+{config.fields.length - 3} autres…</p>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="flex items-center justify-between border-t border-[var(--text-primary)]/6 pt-4">
                    <span
                      className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all group-hover:gap-2.5"
                      style={{ color: config.accentColor }}
                    >
                      Configurer
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </span>
                    <Sparkles className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: config.accentColor }} />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          MODALS
      ───────────────────────────────────────────────────────────────────── */}

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
              className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[var(--bg-chat)]"
              style={{
                boxShadow: `8px 8px 0px 0px ${interviewModalType.accentColor}35`,
              }}
            >
              {/* Top accent band */}
              <div className="h-3 w-full" style={{ backgroundColor: interviewModalType.accentColor }} />

              {/* Header */}
              <div className="px-7 py-6 border-b-2 border-[var(--text-primary)]/6 flex items-start justify-between gap-4">
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
                    <h2 className="text-[20px] font-black text-[var(--text-primary)] leading-tight">{interviewModalType.label}</h2>
                    <p className="text-[11px] text-[var(--text-primary)]/40 font-medium mt-0.5">{interviewModalType.description}</p>
                  </div>
                </div>
                <button onClick={closeInterviewModal} className="text-[var(--text-primary)]/20 hover:text-[var(--text-primary)]/60 transition-colors flex-shrink-0 mt-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-7 py-6 space-y-5">

                {/* Title field */}
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/35 mb-2">
                    Titre de la session
                  </label>
                  <input
                    type="text"
                    value={interviewTitle}
                    onChange={(e) => setInterviewTitle(e.target.value)}
                    placeholder={`Ex : ${interviewModalType.label} — Google`}
                    className="w-full border-2 border-[var(--text-primary)]/10 px-4 py-2.5 text-[13px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/25 focus:outline-none transition-colors"
                    style={{}}
                    onFocus={e => (e.currentTarget.style.borderColor = interviewModalType.accentColor)}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(20,20,20,0.1)')}
                  />
                </div>

                {/* Separator */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[#141414]/8" />
                  <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-primary)]/25">Contexte</p>
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
                    <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 mb-2">
                      {field.label}
                    </label>
                    {field.multiline ? (
                      <textarea
                        value={interviewFieldValues[field.id] ?? ''}
                        onChange={(e) => setField(field.id, e.target.value.slice(0, field.maxLength))}
                        placeholder={field.placeholder}
                        rows={3}
                        className="w-full border-2 border-[var(--text-primary)]/10 px-4 py-3 text-[12px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/20 focus:outline-none transition-colors resize-none leading-relaxed"
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
                        className="w-full border-2 border-[var(--text-primary)]/10 px-4 py-2.5 text-[12px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/20 focus:outline-none transition-colors"
                        onFocus={e => (e.currentTarget.style.borderColor = interviewModalType.accentColor)}
                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(20,20,20,0.1)')}
                        maxLength={field.maxLength}
                      />
                    )}
                  </div>
                ))}

                {/* Raw notes */}
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/35 mb-2">
                    Infos complémentaires <span className="normal-case font-normal text-[var(--text-primary)]/20">(optionnel — en vrac)</span>
                  </label>
                  <textarea
                    value={interviewRawNotes}
                    onChange={(e) => setInterviewRawNotes(e.target.value)}
                    placeholder="Tout ce qui pourrait être utile à l'IA pour être plus précis et pertinent dans ses questions…"
                    rows={3}
                    className="w-full border-2 border-dashed border-[var(--text-primary)]/15 px-4 py-3 text-[12px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/20 focus:outline-none transition-colors resize-none leading-relaxed bg-[var(--text-primary)]/[0.015]"
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
                        className="w-full border-2 px-4 py-3 text-[12px] font-medium text-[var(--text-primary)] focus:outline-none transition-colors resize-none leading-relaxed"
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
                <p className="text-[9px] text-[var(--text-primary)]/25 text-center mt-3 font-medium">
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
