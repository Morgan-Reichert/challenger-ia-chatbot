import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, X, Loader2, Eye, EyeOff } from 'lucide-react';
import { createArenaPost, getArenaUser } from './arenaFirestore';
import type { User as FirebaseUser } from 'firebase/auth';

interface PropulseModalProps {
  user: FirebaseUser;
  question: string;
  aiResponse: string;
  personaName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PropulseModal({
  user,
  question,
  aiResponse,
  personaName,
  onClose,
  onSuccess,
}: PropulseModalProps) {
  const [title, setTitle] = useState('');
  const [preamble, setPreamble] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const arenaUser = await getArenaUser(user.uid);
      if (!arenaUser) {
        setError('Vous devez d\'abord créer un pseudonyme dans l\'Arène.');
        setSubmitting(false);
        return;
      }
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
      });
      onSuccess();
    } catch {
      setError('Une erreur est survenue. Réessayez.');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full sm:max-w-lg bg-[#111318] border-t-2 sm:border-2 border-[#5D7BFF]/30 p-6"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-[#5D7BFF] flex items-center justify-center flex-shrink-0">
            <Trophy className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-white">Propulser dans l'Arène</h2>
            <p className="text-[9px] text-white/40 mt-0.5">Transformez cet échange en débat public</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview */}
        <div className="bg-white/5 border border-white/8 p-3 mb-4 rounded-sm">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5">Extrait à publier</p>
          <p className="text-[10px] text-white/60 line-clamp-2 leading-relaxed">
            Q : {question.slice(0, 120)}{question.length > 120 ? '…' : ''}
          </p>
          <p className="text-[9px] text-[#5D7BFF]/60 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-[#5D7BFF] rounded-full inline-block" />
            {personaName}
          </p>
        </div>

        {/* Title */}
        <div className="mb-3">
          <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
            Titre du débat *
          </label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Ex : La démocratie directe est-elle réaliste ?"
            className="w-full bg-white/5 border border-white/12 text-white text-[11px] px-3 py-2.5 focus:outline-none focus:border-[#5D7BFF]/50 placeholder:text-white/20"
          />
        </div>

        {/* Preamble */}
        <div className="mb-4">
          <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
            Préambule (optionnel)
          </label>
          <textarea
            value={preamble}
            onChange={e => setPreamble(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Pourquoi cet échange mérite un débat public ? Quel angle vous intéresse ?"
            className="w-full bg-white/5 border border-white/12 text-white text-[11px] px-3 py-2.5 resize-none focus:outline-none focus:border-[#5D7BFF]/50 placeholder:text-white/20"
          />
        </div>

        {/* Anonymity toggle */}
        <button
          onClick={() => setIsAnonymous(v => !v)}
          className="flex items-center gap-2.5 mb-5 w-full text-left"
        >
          <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${isAnonymous ? 'bg-[#5D7BFF]' : 'bg-white/15'}`}>
            <div className={`w-3 h-3 bg-white rounded-full transition-transform ${isAnonymous ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <div className="flex items-center gap-1.5">
            {isAnonymous ? <EyeOff className="w-3 h-3 text-white/40" /> : <Eye className="w-3 h-3 text-white/40" />}
            <span className="text-[10px] text-white/50">
              {isAnonymous ? 'Publication anonyme' : 'Publier sous mon pseudonyme Arène'}
            </span>
          </div>
        </button>

        {error && <p className="text-[10px] text-[#F87171] mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!title.trim() || submitting}
          className="w-full bg-[#5D7BFF] disabled:opacity-30 text-white text-[10px] font-black uppercase tracking-widest py-3 flex items-center justify-center gap-2 transition-all hover:bg-[#4a69ff]"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
          {submitting ? 'Propulsion…' : 'Propulser dans l\'Arène'}
        </button>
      </motion.div>
    </motion.div>
  );
}
