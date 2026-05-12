import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { createArenaPost, getArenaUser } from './arenaFirestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { SerifTitle, MetaLabel, Dot, SERIF, cx } from './_editorial';

interface PropulseModalProps {
  user: FirebaseUser;
  question: string;
  aiResponse: string;
  personaName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PropulseModal({
  user, question, aiResponse, personaName, onClose, onSuccess,
}: PropulseModalProps) {
  const [title, setTitle] = useState('');
  const [preamble, setPreamble] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const [hasPoll, setHasPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollDurationH, setPollDurationH] = useState(24);

  const addTag = () => {
    const t = tagInput.replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '_');
    if (t && !tags.includes(t) && tags.length < 8) {
      setTags(prev => [...prev, t]);
    }
    setTagInput('');
  };

  const handleTagKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addTag(); }
  };

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const arenaUser = await getArenaUser(user.uid);
      if (!arenaUser) {
        setError("Vous devez d'abord créer un pseudonyme dans l'Arène.");
        setSubmitting(false);
        return;
      }

      const validOptions = pollOptions.map(o => o.trim()).filter(Boolean);
      const pollPayload = hasPoll && validOptions.length >= 2
        ? validOptions.map((text, i) => ({ id: `opt_${i}`, text, voteCount: 0, voterIds: [] }))
        : undefined;

      const pollEndsAt = hasPoll && validOptions.length >= 2
        ? new Date(Date.now() + pollDurationH * 3_600_000).toISOString()
        : undefined;

      await createArenaPost({
        authorId: isAnonymous ? null : user.uid,
        authorArenaName: isAnonymous ? 'Anonyme' : arenaUser.arenaName,
        isAnonymous,
        title: title.trim(),
        preamble: preamble.trim(),
        question,
        aiResponse,
        personaName,
        createdAt: new Date().toISOString(),
        featuredDate: null,
        tags: tags.length > 0 ? tags : undefined,
        pollOptions: pollPayload,
        pollEndsAt,
      });
      onSuccess();
    } catch {
      setError('Une erreur est survenue. Réessayez.');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-app)]/85 backdrop-blur-md px-0 sm:px-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full sm:max-w-xl bg-[var(--bg-chat)] border-t border-[var(--border)] sm:border overflow-y-auto"
        style={{ maxHeight: '92vh' }}
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
      >
        <div className="px-8 pt-10 pb-8">
          {/* En-tête éditorial */}
          <div className="flex items-baseline justify-between mb-2">
            <MetaLabel>Propulser dans l'Arène</MetaLabel>
            <button
              onClick={onClose}
              className="text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] transition-colors leading-none"
            >
              <X size={15} />
            </button>
          </div>
          <SerifTitle size="md" className="mb-3">
            Donner à ce débat une seconde vie
          </SerifTitle>
          <p
            className="text-[14px] text-[var(--text-primary)]/65 italic leading-relaxed mb-8"
            style={{ fontFamily: SERIF }}
          >
            Vous transformez cet échange privé en une thèse soumise au regard public. Choisissez le titre avec soin — c'est ce que liront les autres.
          </p>

          {/* Extrait à publier */}
          <div className="py-5 border-y border-[var(--border)] mb-8">
            <MetaLabel className="block mb-3">L'échange à publier</MetaLabel>
            <blockquote
              className="text-[15px] text-[var(--text-primary)]/80 italic leading-[1.6] pl-4 border-l border-[var(--text-primary)]/30"
              style={{ fontFamily: SERIF }}
            >
              {question.slice(0, 200)}{question.length > 200 ? '…' : ''}
            </blockquote>
            <p
              className="text-[12px] text-[var(--text-primary)]/55 italic mt-3"
              style={{ fontFamily: SERIF }}
            >
              Réponse de <span className="text-[var(--text-primary)]/75">{personaName}</span> · {aiResponse.length} caractères
            </p>
          </div>

          {/* Titre */}
          <div className="mb-8">
            <div className="flex items-baseline justify-between mb-2">
              <MetaLabel>Titre du débat</MetaLabel>
              <span
                className="text-[11px] italic text-[var(--text-primary)]/45 tabular-nums"
                style={{ fontFamily: SERIF }}
              >
                {title.length} / 120
              </span>
            </div>
            <input
              autoFocus
              value={title}
              onChange={e => {
                if (e.target.value.length <= 120) setTitle(e.target.value);
              }}
              placeholder="Ex : La démocratie directe est-elle réaliste ?"
              className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[18px] py-2 outline-none transition-colors placeholder:text-[var(--text-primary)]/35"
              style={{ fontFamily: SERIF, fontWeight: 500 }}
            />
          </div>

          {/* Préambule */}
          <div className="mb-8">
            <div className="flex items-baseline justify-between mb-2">
              <MetaLabel>Préambule (facultatif)</MetaLabel>
              <span
                className="text-[11px] italic text-[var(--text-primary)]/45 tabular-nums"
                style={{ fontFamily: SERIF }}
              >
                {preamble.length} / 300
              </span>
            </div>
            <textarea
              value={preamble}
              onChange={e => {
                if (e.target.value.length <= 300) setPreamble(e.target.value);
              }}
              rows={3}
              placeholder="Pourquoi cet échange mérite-t-il un débat public ?"
              className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[15px] py-2 outline-none resize-none transition-colors placeholder:text-[var(--text-primary)]/35 leading-[1.6]"
              style={{ fontFamily: SERIF, fontStyle: 'italic' }}
            />
          </div>

          {/* Hashtags */}
          <div className="mb-8">
            <MetaLabel className="block mb-2">Étiquettes</MetaLabel>
            {tags.length > 0 && (
              <p
                className="text-[15px] text-[var(--text-primary)]/80 italic leading-[1.7] mb-3"
                style={{ fontFamily: SERIF }}
              >
                {tags.map((t, i) => (
                  <span key={t}>
                    <button
                      onClick={() => setTags(prev => prev.filter(x => x !== t))}
                      className="hover:text-[var(--text-primary)]/40 transition-colors"
                      title="Retirer"
                    >
                      #{t}
                    </button>
                    {i < tags.length - 1 && <span className="text-[var(--text-primary)]/30"> · </span>}
                  </span>
                ))}
              </p>
            )}
            {tags.length < 8 && (
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
                onBlur={addTag}
                placeholder="philosophie, démocratie, ia…"
                className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[15px] py-2 outline-none transition-colors placeholder:text-[var(--text-primary)]/35"
                style={{ fontFamily: SERIF, fontStyle: 'italic' }}
              />
            )}
            <p
              className="text-[11px] text-[var(--text-primary)]/45 italic mt-2"
              style={{ fontFamily: SERIF }}
            >
              Pressez Entrée ou Espace pour valider une étiquette.
            </p>
          </div>

          {/* Sondage */}
          <div className="mb-8">
            <button
              onClick={() => setHasPoll(v => !v)}
              className="flex items-baseline gap-3 mb-3"
            >
              <span
                className={cx(
                  'text-[11px] uppercase pb-1 border-b transition-colors',
                  hasPoll
                    ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                    : 'text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] border-transparent',
                )}
                style={{ letterSpacing: '0.22em' }}
              >
                {hasPoll ? 'Sondage activé' : 'Joindre un sondage'}
              </span>
            </button>

            {hasPoll && (
              <div className="pl-4 border-l border-[var(--border)] space-y-3 mt-4">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex items-baseline gap-3">
                    <span
                      className="text-[11px] text-[var(--text-primary)]/45 italic"
                      style={{ fontFamily: SERIF }}
                    >
                      {i + 1}.
                    </span>
                    <input
                      value={opt}
                      onChange={e => setPollOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                      placeholder={`Option ${i + 1}`}
                      maxLength={80}
                      className="flex-1 bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[15px] py-1.5 outline-none transition-colors placeholder:text-[var(--text-primary)]/35"
                      style={{ fontFamily: SERIF, fontStyle: 'italic' }}
                    />
                    {pollOptions.length > 2 && (
                      <button
                        onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
                        className="text-[var(--text-primary)]/45 hover:text-[var(--text-primary)] transition-colors leading-none"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 5 && (
                  <button
                    onClick={() => setPollOptions(prev => [...prev, ''])}
                    className="inline-flex items-center gap-1.5 text-[12px] italic text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] transition-colors"
                    style={{ fontFamily: SERIF }}
                  >
                    <Plus size={11} /> Ajouter une option
                  </button>
                )}
                <div className="flex items-baseline gap-4 pt-2 text-[11px] uppercase" style={{ letterSpacing: '0.22em' }}>
                  <span className="text-[var(--text-primary)]/40">Durée</span>
                  {[24, 48, 72].map(h => (
                    <button
                      key={h}
                      onClick={() => setPollDurationH(h)}
                      className={cx(
                        'transition-colors pb-1 border-b',
                        pollDurationH === h
                          ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                          : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 border-transparent',
                      )}
                    >
                      {h} h
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Anonymat */}
          <div className="mb-10 flex items-baseline gap-5 text-[11px] uppercase" style={{ letterSpacing: '0.22em' }}>
            <span className="text-[var(--text-primary)]/40">Signature</span>
            <button
              onClick={() => setIsAnonymous(false)}
              className={cx(
                'transition-colors pb-1 border-b',
                !isAnonymous
                  ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                  : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 border-transparent',
              )}
            >
              Mon nom de plume
            </button>
            <Dot />
            <button
              onClick={() => setIsAnonymous(true)}
              className={cx(
                'transition-colors pb-1 border-b',
                isAnonymous
                  ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                  : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 border-transparent',
              )}
            >
              Anonyme
            </button>
          </div>

          {/* Erreur */}
          {error && (
            <p
              className="text-[14px] text-[var(--text-primary)] italic py-3 border-y border-[var(--text-primary)]/30 mb-6"
              style={{ fontFamily: SERIF }}
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            className="w-full text-[12px] uppercase text-[var(--text-primary)] py-3 border-y border-[var(--border)] hover:bg-[var(--text-primary)]/[0.04] disabled:opacity-30 disabled:cursor-default transition-all flex items-center justify-center gap-3"
            style={{ letterSpacing: '0.24em' }}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
            {submitting ? 'Propulsion…' : 'Propulser dans l\'Arène'}
            <span className="text-[var(--text-primary)]/40">→</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
