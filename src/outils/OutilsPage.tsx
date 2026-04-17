import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Wrench, ChevronRight, Lock, Sparkles } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { OUTILS_LIST, type OutilConfig } from './outilsTypes';
import JournalismeApp from './JournalismeApp';

function cx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

type Props = {
  onBack: () => void;
  user: FirebaseUser | null;
};

export default function OutilsPage({ onBack, user }: Props) {
  const [activeOutil, setActiveOutil] = useState<OutilConfig | null>(null);

  // ── If a tool is open, render it full-screen ─────────────────────────────
  if (activeOutil?.id === 'journalisme') {
    return <JournalismeApp onBack={() => setActiveOutil(null)} user={user} />;
  }

  // ── Portal view ──────────────────────────────────────────────────────────
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
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#5D7BFF] flex items-center justify-center flex-shrink-0">
            <Wrench className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-[13px] font-black uppercase tracking-widest text-[var(--text-primary)]">Nos Outils Partenaires</p>
            <p className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-primary)]/35">
              Moteur Challenger IA · Spécialisations sectorielles
            </p>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-8">

        {/* Hero description */}
        <div className="max-w-2xl mb-10">
          <p className="text-[13px] text-[var(--text-primary)]/55 leading-relaxed">
            Des applications spécialisées construites sur le moteur Challenger IA. Chaque outil est conçu pour un secteur précis — avec ses propres modes, fonctionnalités et niveaux de friction adaptés aux professionnels.
          </p>
        </div>

        {/* Tools grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-6xl">
          {OUTILS_LIST.map((outil, i) => {
            const isAvailable = outil.status === 'available';
            return (
              <motion.div
                key={outil.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <button
                  onClick={() => isAvailable && setActiveOutil(outil)}
                  disabled={!isAvailable}
                  className={cx(
                    'w-full text-left bg-[var(--bg-chat)] border-2 overflow-hidden transition-all group',
                    isAvailable
                      ? 'hover:border-transparent cursor-pointer'
                      : 'opacity-60 cursor-default border-[var(--text-primary)]/8'
                  )}
                  style={{
                    borderColor: isAvailable ? `${outil.accentColor}30` : undefined,
                    boxShadow: isAvailable ? `4px 4px 0px 0px ${outil.accentColor}20` : '4px 4px 0px 0px rgba(20,20,20,0.04)',
                  }}
                >
                  {/* Top band */}
                  <div className="h-1.5 w-full" style={{ backgroundColor: outil.accentColor }} />

                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div
                        className="w-12 h-12 flex items-center justify-center text-2xl flex-shrink-0"
                        style={{ background: outil.bgColor, border: `1.5px solid ${outil.accentColor}25` }}
                      >
                        {outil.icon}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className="text-[7px] font-black uppercase tracking-widest px-2 py-1"
                          style={{ background: `${outil.accentColor}14`, color: outil.accentColor }}
                        >
                          {outil.category}
                        </span>
                        {!isAvailable && (
                          <span className="flex items-center gap-1 text-[7px] font-black uppercase tracking-widest text-[var(--text-primary)]/30">
                            <Lock className="w-2.5 h-2.5" />
                            Bientôt
                          </span>
                        )}
                        {isAvailable && (
                          <span className="flex items-center gap-1 text-[7px] font-black uppercase tracking-widest" style={{ color: outil.accentColor }}>
                            <Sparkles className="w-2.5 h-2.5" />
                            Disponible
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="text-[15px] font-black text-[var(--text-primary)] leading-tight mb-1">
                      {outil.name}
                    </h3>
                    <p className="text-[10px] font-bold mb-3" style={{ color: outil.accentColor }}>
                      {outil.tagline}
                    </p>
                    <p className="text-[11px] text-[var(--text-primary)]/50 leading-relaxed mb-5">
                      {outil.description}
                    </p>

                    {/* Features list */}
                    <div className="space-y-1.5 mb-5">
                      {outil.features.slice(0, 4).map(f => (
                        <div key={f} className="flex items-center gap-2">
                          <div className="w-1 h-1 flex-shrink-0 rounded-full" style={{ backgroundColor: outil.accentColor }} />
                          <p className="text-[10px] text-[var(--text-primary)]/40 font-medium">{f}</p>
                        </div>
                      ))}
                      {outil.features.length > 4 && (
                        <p className="text-[9px] text-[var(--text-primary)]/25 pl-3">+{outil.features.length - 4} autres fonctionnalités…</p>
                      )}
                    </div>

                    {/* CTA */}
                    <div
                      className="flex items-center justify-between border-t pt-4"
                      style={{ borderColor: `${outil.accentColor}15` }}
                    >
                      <span
                        className={cx(
                          'text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all',
                          isAvailable && 'group-hover:gap-2.5'
                        )}
                        style={{ color: isAvailable ? outil.accentColor : 'var(--text-primary)/30' }}
                      >
                        {isAvailable ? 'Ouvrir l\'outil' : 'Bientôt disponible'}
                        {isAvailable && <ChevronRight className="w-3 h-3" />}
                      </span>
                      {isAvailable && (
                        <div
                          className="w-2 h-2 rounded-full animate-pulse"
                          style={{ backgroundColor: outil.accentColor }}
                        />
                      )}
                    </div>
                  </div>
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="mt-12 max-w-xl">
          <div
            className="flex items-start gap-3 px-4 py-3 border"
            style={{ background: 'rgba(93,123,255,0.04)', borderColor: 'rgba(93,123,255,0.12)' }}
          >
            <Wrench className="w-3.5 h-3.5 text-[#5D7BFF]/50 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-[var(--text-primary)]/40 leading-relaxed font-medium">
              Chaque outil partage le moteur Challenger IA — friction, personas et niveaux adaptés à chaque secteur. Abonnement par outil, accès depuis ce portail ou épinglé dans votre interface principale.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
