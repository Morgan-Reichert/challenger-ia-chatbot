import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Swords, Globe, Calendar, Loader2, ChevronRight, X } from 'lucide-react';
import { DEBATE_PERSONAS_LIST, type DebatePersona } from './debatePersonas';

// ─── cx helper ──────────────────────────────────────────────────────────────
function cx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Props ──────────────────────────────────────────────────────────────────
type Props = {
  onBack: () => void;
  onStartDebate: (persona: DebatePersona) => Promise<void>;
};

// ─── Category tab ───────────────────────────────────────────────────────────
const CATEGORIES = [{ id: 'debat', label: 'Débat', icon: Swords }] as const;

// ─── Component ──────────────────────────────────────────────────────────────
export default function LibraryPage({ onBack, onStartDebate }: Props) {
  const [activeCategory] = useState<'debat'>('debat');
  const [selectedPersona, setSelectedPersona] = useState<DebatePersona | null>(null);
  const [starting, setStarting] = useState(false);

  const handleStart = async (persona: DebatePersona) => {
    setStarting(true);
    await onStartDebate(persona);
    setStarting(false);
    setSelectedPersona(null);
  };

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
          <p className="text-[13px] font-black uppercase tracking-widest text-[#141414]">
            Bibliothèque
          </p>
          <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/35">
            Entraînements & Scénarios
          </p>
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div className="flex-shrink-0 bg-white border-b-2 border-[#5D7BFF]/10 px-6">
        <div className="flex gap-0">
          {CATEGORIES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={cx(
                'flex items-center gap-2 px-5 py-3.5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all',
                activeCategory === id
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

        {/* Section header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-7 h-7 bg-[#5D7BFF] flex items-center justify-center">
              <Swords className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-[15px] font-black uppercase tracking-widest text-[#141414]">
              Débat
            </h2>
          </div>
          <p className="text-[11px] text-[#141414]/40 font-medium ml-10">
            Affronte des personnages publics ou historiques. L'IA incarne leur pensée, leur style, leurs positions réelles — enrichies par des données web en temps réel.
          </p>
        </div>

        {/* Persona cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          {DEBATE_PERSONAS_LIST.map((persona, i) => (
            <motion.button
              key={persona.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              onClick={() => setSelectedPersona(persona)}
              className="text-left bg-white border-2 border-[#141414]/8 hover:border-[#5D7BFF]/40 transition-all group overflow-hidden"
              style={{ boxShadow: '4px 4px 0px 0px rgba(20,20,20,0.06)' }}
            >
              {/* Color band */}
              <div
                className="h-2 w-full"
                style={{ backgroundColor: persona.color }}
              />

              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-[#5D7BFF] mb-1">
                      {persona.category}
                    </p>
                    <h3 className="text-[14px] font-black text-[#141414] leading-tight">
                      {persona.name}
                    </h3>
                    <p className="text-[10px] text-[#141414]/40 font-medium mt-0.5">
                      {persona.title}
                    </p>
                  </div>
                  <span className="text-2xl flex-shrink-0 mt-0.5">{persona.flag}</span>
                </div>

                {/* Description */}
                <p className="text-[11px] text-[#141414]/55 leading-relaxed mb-4 line-clamp-3">
                  {persona.description}
                </p>

                {/* Key facts */}
                <div className="space-y-1 mb-4">
                  {persona.keyFacts.slice(0, 3).map((fact) => (
                    <div key={fact} className="flex items-start gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-[#5D7BFF]/50 mt-1.5 flex-shrink-0" />
                      <p className="text-[10px] text-[#141414]/45">{fact}</p>
                    </div>
                  ))}
                </div>

                {/* Meta */}
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

                {/* CTA */}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#5D7BFF] group-hover:gap-2 flex items-center gap-1.5 transition-all">
                    Voir le profil
                    <ChevronRight className="w-3 h-3" />
                  </span>
                  <div
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ backgroundColor: persona.color }}
                    title="Contexte web actif"
                  />
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* ── Persona detail modal ── */}
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
              {/* Color top bar */}
              <div className="h-3 w-full" style={{ backgroundColor: selectedPersona.color }} />

              {/* Header */}
              <div className="px-7 py-6 border-b-2 border-[#141414]/6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#5D7BFF] mb-1">
                    {selectedPersona.category} · {selectedPersona.country} {selectedPersona.flag}
                  </p>
                  <h2 className="text-[22px] font-black text-[#141414] leading-tight">
                    {selectedPersona.name}
                  </h2>
                  <p className="text-[11px] text-[#141414]/40 font-medium mt-1">
                    {selectedPersona.title}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPersona(null)}
                  className="text-[#141414]/20 hover:text-[#141414]/60 transition-colors flex-shrink-0 mt-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-7 py-5 space-y-5">
                {/* Description */}
                <p className="text-[12px] text-[#141414]/60 leading-relaxed">
                  {selectedPersona.description}
                </p>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Né(e)', value: selectedPersona.born },
                    { label: 'Langue', value: selectedPersona.language },
                    { label: 'Pays', value: selectedPersona.country },
                    { label: 'Catégorie', value: selectedPersona.category },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-[#F0F4FF] p-3">
                      <p className="text-[8px] font-black uppercase tracking-widest text-[#141414]/30 mb-0.5">
                        {label}
                      </p>
                      <p className="text-[11px] font-bold text-[#141414]/70">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Key facts */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/30 mb-3">
                    Faits marquants
                  </p>
                  <div className="space-y-2">
                    {selectedPersona.keyFacts.map((fact) => (
                      <div key={fact} className="flex items-start gap-2.5">
                        <div
                          className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                          style={{ backgroundColor: selectedPersona.color }}
                        />
                        <p className="text-[11px] text-[#141414]/60">{fact}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Web context indicator */}
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#5D7BFF]/6 border border-[#5D7BFF]/15">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#5D7BFF] animate-pulse" />
                  <p className="text-[10px] font-bold text-[#5D7BFF]/70">
                    Contexte web chargé en temps réel · Wikipedia + actualités récentes
                  </p>
                </div>
              </div>

              {/* CTA */}
              <div className="px-7 pb-7">
                <button
                  onClick={() => handleStart(selectedPersona)}
                  disabled={starting}
                  className="w-full flex items-center justify-center gap-3 py-4 text-white text-[12px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-60 transition-all"
                  style={{
                    backgroundColor: selectedPersona.color,
                    boxShadow: `4px 4px 0px 0px ${selectedPersona.color}40`,
                  }}
                >
                  {starting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Swords className="w-5 h-5" />
                  )}
                  {starting ? 'Chargement du contexte…' : `Débattre contre ${selectedPersona.shortName}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
