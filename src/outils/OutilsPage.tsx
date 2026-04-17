import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Wrench, ChevronRight, Lock, Sparkles, Clock, Pin, PinOff,
  CheckCircle, AlertCircle,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { OUTILS_LIST, type OutilConfig, type OutilId } from './outilsTypes';
import { useOutilSessions, TRIAL_DURATION_MS } from './useOutilSessions';
import JournalismeApp from './JournalismeApp';

function cx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

type Props = {
  onBack: () => void;
  user: FirebaseUser | null;
  openToolId?: OutilId; // auto-open a specific tool
};

// ─── Paywall gate per tool ────────────────────────────────────────────────────

function OutilCard({
  outil,
  onOpen,
}: {
  outil: OutilConfig;
  onOpen: (id: OutilId) => void;
}) {
  const { trialStatus, startTrial, isPinned, togglePin } = useOutilSessions(outil.id);
  const [timeLeft, setTimeLeft] = useState(trialStatus.msRemaining);

  // Countdown timer
  useEffect(() => {
    if (!trialStatus.started || trialStatus.expired) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        const next = Math.max(0, prev - 1000);
        if (next === 0) clearInterval(interval);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [trialStatus.started, trialStatus.expired]);

  const isAvailable = outil.status === 'available';
  const canAccess = isAvailable && (trialStatus.started && !trialStatus.expired);
  const trialExpired = isAvailable && trialStatus.started && trialStatus.expired;
  const notStarted = isAvailable && !trialStatus.started;

  function formatTimeLeft(ms: number) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return `${h}h ${m}m restantes`;
    if (m > 0) return `${m}m ${s}s restantes`;
    return `${s}s restantes`;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cx('relative overflow-hidden border-2', !isAvailable && 'opacity-55')}
      style={{
        borderColor: isAvailable ? `${outil.accentColor}30` : 'rgba(255,255,255,0.06)',
        background: 'var(--bg-chat)',
        boxShadow: isAvailable ? `4px 4px 0px 0px ${outil.accentColor}18` : '4px 4px 0px 0px rgba(20,20,20,0.04)',
      }}
    >
      {/* Top accent band */}
      <div className="h-1.5 w-full" style={{ backgroundColor: outil.accentColor }} />

      {/* Trial ribbon */}
      {canAccess && (
        <div
          className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 text-[7px] font-black uppercase tracking-widest"
          style={{ background: `${outil.accentColor}20`, color: outil.accentColor, border: `1px solid ${outil.accentColor}30` }}
        >
          <Clock className="w-2.5 h-2.5" />
          {formatTimeLeft(timeLeft)}
        </div>
      )}

      {/* Pin button (top right when no trial counter) */}
      {isAvailable && !canAccess && (
        <button
          onClick={e => { e.stopPropagation(); togglePin(); }}
          className="absolute top-4 right-4 p-1.5 transition-colors"
          style={{ color: isPinned ? outil.accentColor : 'rgba(255,255,255,0.2)' }}
          title={isPinned ? 'Désépingler de la sidebar' : 'Épingler à la sidebar'}
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
      )}

      <div className="p-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div
            className="w-12 h-12 flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: outil.bgColor, border: `1.5px solid ${outil.accentColor}25` }}
          >
            {outil.icon}
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <div
              className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 inline-block mb-1"
              style={{ background: `${outil.accentColor}14`, color: outil.accentColor }}
            >
              {outil.category}
            </div>
            <h3 className="text-[15px] font-black text-[var(--text-primary)] leading-tight">{outil.name}</h3>
            <p className="text-[10px] font-bold mt-0.5" style={{ color: outil.accentColor }}>{outil.tagline}</p>
          </div>
        </div>

        <p className="text-[11px] text-[var(--text-primary)]/50 leading-relaxed mb-4">{outil.description}</p>

        {/* Features */}
        <div className="space-y-1.5 mb-5">
          {outil.features.slice(0, 4).map(f => (
            <div key={f} className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: outil.accentColor }} />
              <p className="text-[10px] text-[var(--text-primary)]/40 font-medium">{f}</p>
            </div>
          ))}
          {outil.features.length > 4 && (
            <p className="text-[9px] text-[var(--text-primary)]/25 pl-3">+{outil.features.length - 4} fonctionnalités…</p>
          )}
        </div>

        {/* CTA zone */}
        <div className="border-t pt-4" style={{ borderColor: `${outil.accentColor}15` }}>
          {!isAvailable ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-primary)]/30 font-bold">
                <Lock className="w-3 h-3" />
                Bientôt disponible
              </div>
              <span className="text-[9px] text-[var(--text-primary)]/20 font-bold">{outil.price}</span>
            </div>
          ) : canAccess ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onOpen(outil.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-white text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-90"
                style={{ background: outil.accentColor, boxShadow: `3px 3px 0px 0px ${outil.accentColor}35` }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Ouvrir l'outil
              </button>
              <button
                onClick={() => togglePin()}
                className="w-10 h-10 flex items-center justify-center border transition-all"
                style={{
                  borderColor: isPinned ? `${outil.accentColor}50` : 'rgba(255,255,255,0.1)',
                  background: isPinned ? `${outil.accentColor}10` : 'transparent',
                  color: isPinned ? outil.accentColor : 'rgba(255,255,255,0.25)',
                }}
                title={isPinned ? 'Désépingler' : 'Épingler à la sidebar'}
              >
                {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
            </div>
          ) : trialExpired ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[9px] text-red-400/70 font-bold">
                <AlertCircle className="w-3 h-3" />
                Essai expiré — {outil.price} pour continuer
              </div>
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 py-2.5 text-[10px] font-black uppercase tracking-widest opacity-40 cursor-not-allowed"
                style={{ background: outil.accentColor, color: 'white' }}
              >
                S'abonner (bientôt)
              </button>
            </div>
          ) : (
            /* Not started — offer trial */
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 mb-0.5">
                  1 jour d'essai gratuit
                </p>
                <p className="text-[9px] text-[var(--text-primary)]/25">Puis {outil.price}</p>
              </div>
              <button
                onClick={() => { startTrial(); onOpen(outil.id); }}
                className="flex items-center gap-2 px-4 py-2.5 text-white text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-90 flex-shrink-0"
                style={{ background: outil.accentColor, boxShadow: `3px 3px 0px 0px ${outil.accentColor}35` }}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Essai gratuit
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main portal ──────────────────────────────────────────────────────────────

export default function OutilsPage({ onBack, user, openToolId }: Props) {
  const [activeOutil, setActiveOutil] = useState<OutilConfig | null>(() =>
    openToolId ? (OUTILS_LIST.find(o => o.id === openToolId) ?? null) : null
  );

  // Update if prop changes
  useEffect(() => {
    if (openToolId) {
      setActiveOutil(OUTILS_LIST.find(o => o.id === openToolId) ?? null);
    }
  }, [openToolId]);

  // Render active tool
  if (activeOutil?.id === 'journalisme') {
    return <JournalismeApp onBack={() => setActiveOutil(null)} user={user} />;
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[var(--bg-app)] overflow-hidden">

      {/* Top bar */}
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
              Moteur Challenger IA · 1 jour d'essai gratuit par outil
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-2xl mb-8">
          <p className="text-[12px] text-[var(--text-primary)]/50 leading-relaxed">
            Des applications spécialisées propulsées par le moteur Challenger IA. Chaque outil dispose d'un <strong className="text-[var(--text-primary)]/70">essai gratuit de 24h</strong>. Épinglez vos outils favoris directement dans la sidebar principale.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-6xl">
          {OUTILS_LIST.map((outil, i) => (
            <motion.div key={outil.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <OutilCard outil={outil} onOpen={(id) => setActiveOutil(OUTILS_LIST.find(o => o.id === id) ?? null)} />
            </motion.div>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-10 max-w-xl">
          <div className="flex items-start gap-3 px-4 py-3 border" style={{ background: 'rgba(93,123,255,0.04)', borderColor: 'rgba(93,123,255,0.12)' }}>
            <ChevronRight className="w-3.5 h-3.5 text-[#5D7BFF]/50 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-[var(--text-primary)]/40 leading-relaxed font-medium">
              Vos sessions sont sauvegardées séparément par outil. Vous pouvez créer des projets dans chaque outil pour organiser vos analyses, et importer des conversations Challenger IA dans un outil spécialisé.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
