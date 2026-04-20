import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Wrench, ChevronRight, Lock, Sparkles, Clock, Pin, PinOff,
  CheckCircle, AlertCircle, Building2, Mail, Users, Shield,
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
      className={cx('relative overflow-hidden border-2 flex flex-col h-full', !isAvailable && 'opacity-55')}
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
          className="absolute top-4 right-4 p-1.5 transition-all hover:opacity-100"
          style={{ color: isPinned ? outil.accentColor : 'var(--text-primary)', opacity: isPinned ? 1 : 0.35 }}
          title={isPinned ? 'Désépingler de la sidebar' : 'Épingler à la sidebar'}
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
      )}

      <div className="p-6 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div
            className="w-12 h-12 flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: outil.bgColor, border: `1.5px solid ${outil.accentColor}25` }}
          >
            <img src={outil.logoSrc} alt={outil.name} className="w-10 h-10 object-contain" />
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
        <div className="border-t pt-4 mt-auto" style={{ borderColor: `${outil.accentColor}15` }}>
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
                  borderColor: isPinned ? `${outil.accentColor}50` : 'rgba(128,128,128,0.3)',
                  background: isPinned ? `${outil.accentColor}10` : 'transparent',
                  color: isPinned ? outil.accentColor : 'var(--text-primary)',
                  opacity: isPinned ? 1 : 0.45,
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

// ─── Enterprise contact form ─────────────────────────────────────────────────

const TOOL_OPTIONS = [
  { id: 'base', name: 'Challenger IA', sub: 'Chat de base', color: '#5D7BFF', logo: null, price: 12 },
  { id: 'journalisme', name: 'Reporter', sub: 'Fact-checking & biais', color: '#E85D04', logo: '/logos/reporter.png', price: 9 },
  { id: 'education', name: 'Éducation', sub: 'Pédagogie critique', color: '#0AADBB', logo: '/logos/education.png', price: 7 },
  { id: 'politique', name: 'Politique', sub: 'Décryptage du pouvoir', color: '#8FB339', logo: '/logos/politique.png', price: 9 },
  { id: 'sante', name: 'Santé', sub: 'Vrai/faux médical', color: '#E53E3E', logo: '/logos/sante.png', price: 9 },
  { id: 'entreprise', name: 'Entreprise', sub: 'Décisions business', color: '#6B7FD4', logo: '/logos/entreprise.png', price: 12 },
  { id: 'contenu', name: 'Contenu', sub: 'Création & stratégie', color: '#7C3AED', logo: '/logos/contenu.png', price: 9 },
];

const TEAM_SIZES = [
  { label: '1 – 5', seats: 3, disc: 0 },
  { label: '6 – 20', seats: 12, disc: 10 },
  { label: '21 – 50', seats: 35, disc: 20 },
  { label: '51 – 200', seats: 100, disc: 35 },
  { label: '200+', seats: 200, disc: 50 },
];

const SECTORS = [
  'Médias & Journalisme', 'Éducation & Formation', 'Santé & Sciences',
  'Politique & Institutions', 'Conseil & Stratégie', 'Startup & Innovation',
  'Grande entreprise', 'Agence de communication', 'ONG & Associations', 'Autre',
];

const COUNTRIES = [
  'France', 'Belgique', 'Suisse', 'Canada', 'Luxembourg', 'Monaco',
  'Maroc', 'Tunisie', 'Algérie', 'Sénégal', 'Côte d\'Ivoire', 'Cameroun',
  'Madagascar', 'Île Maurice', 'Haïti', 'Congo (RDC)', 'Gabon', 'Mali',
  'Burkina Faso', 'Rwanda', 'Guinée', 'Togo', 'Bénin',
  'États-Unis', 'Royaume-Uni', 'Allemagne', 'Espagne', 'Italie',
  'Portugal', 'Pays-Bas', 'Suède', 'Danemark', 'Australie',
  'Japon', 'Chine', 'Brésil', 'Mexique', 'Autre',
];

const ENTERPRISE_COOLDOWN_KEY = 'cr_enterprise_request_ts';
const ENTERPRISE_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48h

function getEnterpriseCooldownLeft(): number {
  const ts = localStorage.getItem(ENTERPRISE_COOLDOWN_KEY);
  if (!ts) return 0;
  const elapsed = Date.now() - parseInt(ts, 10);
  return Math.max(0, ENTERPRISE_COOLDOWN_MS - elapsed);
}

function formatCooldown(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function EnterpriseContactForm() {
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [teamSize, setTeamSize] = useState('');
  const [sector, setSector] = useState('');
  const [country, setCountry] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState<number>(() => getEnterpriseCooldownLeft());

  // Décrémenter le cooldown chaque minute
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = setInterval(() => {
      const left = getEnterpriseCooldownLeft();
      setCooldownLeft(left);
      if (left <= 0) clearInterval(id);
    }, 60_000);
    return () => clearInterval(id);
  }, [cooldownLeft > 0]);

  const toggleTool = (id: string) =>
    setSelectedTools(p => p.includes(id) ? p.filter(t => t !== id) : [...p, id]);

  const sizeInfo = TEAM_SIZES.find(s => s.label === teamSize);
  const baseMonthly = selectedTools.reduce((sum, id) => {
    const t = TOOL_OPTIONS.find(o => o.id === id);
    return sum + (t?.price ?? 0);
  }, 0);
  const discount = sizeInfo?.disc ?? 0;
  const seats = sizeInfo?.seats ?? 1;
  const pricePerSeat = Math.round(baseMonthly * (1 - discount / 100) * 100) / 100;
  const totalMonthly = Math.round(pricePerSeat * seats);

  const filteredCountries = COUNTRIES.filter(c =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );
  const canSubmit = selectedTools.length > 0 && teamSize && name && email;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setTimeout(() => {
      localStorage.setItem(ENTERPRISE_COOLDOWN_KEY, Date.now().toString());
      setSending(false);
      setSent(true);
      setCooldownLeft(ENTERPRISE_COOLDOWN_MS);
    }, 1200);
  }

  const inputCls = "w-full px-3 py-2.5 text-[11px] bg-[var(--bg-chat)] border text-[var(--text-primary)] placeholder-[var(--text-primary)]/25 outline-none focus:border-[#5D7BFF]/60 transition-colors";
  const bordStyle = { borderColor: 'rgba(93,123,255,0.2)' };

  // Cooldown actif (avant ou après envoi affiché)
  if (cooldownLeft > 0 && !sent) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="w-14 h-14 flex items-center justify-center" style={{ background: 'rgba(93,123,255,0.08)', border: '2px solid rgba(93,123,255,0.2)' }}>
          <Clock className="w-7 h-7 text-[#5D7BFF]/50" />
        </div>
        <div>
          <p className="text-[13px] font-black text-[var(--text-primary)]/70">Demande déjà envoyée</p>
          <p className="text-[10px] text-[var(--text-primary)]/35 mt-1 max-w-xs mx-auto">
            Notre équipe traite votre demande. Vous pourrez en soumettre une nouvelle dans
          </p>
          <p className="text-[18px] font-black text-[#5D7BFF] mt-2">{formatCooldown(cooldownLeft)}</p>
        </div>
        <p className="text-[9px] text-[var(--text-primary)]/20">Si vous n'avez pas reçu de réponse, contactez-nous directement.</p>
      </div>
    );
  }

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="border-2 p-12 flex flex-col items-center justify-center gap-5 text-center"
        style={{ borderColor: 'rgba(93,123,255,0.25)', background: 'rgba(93,123,255,0.03)' }}
      >
        <div className="w-16 h-16 flex items-center justify-center" style={{ background: 'rgba(93,123,255,0.12)' }}>
          <CheckCircle className="w-8 h-8 text-[#5D7BFF]" />
        </div>
        <div>
          <p className="text-[15px] font-black text-[var(--text-primary)]">Demande envoyée !</p>
          <p className="text-[11px] text-[var(--text-primary)]/40 mt-1 max-w-xs">
            Notre équipe commerciale vous contacte sous 24h pour finaliser votre abonnement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          {selectedTools.map(id => {
            const t = TOOL_OPTIONS.find(o => o.id === id);
            if (!t) return null;
            return (
              <span key={id} className="px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white" style={{ background: t.color }}>
                {t.name}
              </span>
            );
          })}
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ① Sélection des outils */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/50 mb-3">
          ① Composez votre abonnement
          {selectedTools.length > 0 && <span className="ml-2 text-[#5D7BFF]">{selectedTools.length} outil{selectedTools.length > 1 ? 's' : ''} sélectionné{selectedTools.length > 1 ? 's' : ''}</span>}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
          {TOOL_OPTIONS.map(t => {
            const active = selectedTools.includes(t.id);
            return (
              <button
                key={t.id} type="button"
                onClick={() => toggleTool(t.id)}
                className="relative flex items-center gap-2.5 px-3 py-2.5 border-2 text-left transition-all"
                style={{
                  borderColor: active ? t.color : 'rgba(93,123,255,0.12)',
                  background: active ? `${t.color}12` : 'var(--bg-chat)',
                }}
              >
                {t.logo
                  ? <img src={t.logo} alt={t.name} className="w-6 h-6 object-contain flex-shrink-0" />
                  : <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 text-white text-[8px] font-black" style={{ background: t.color }}>IA</div>
                }
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-[var(--text-primary)] truncate">{t.name}</p>
                  <p className="text-[8px] text-[var(--text-primary)]/35 truncate">{t.price}€/siège</p>
                </div>
                {active && (
                  <div className="absolute top-1 right-1 w-3.5 h-3.5 flex items-center justify-center" style={{ background: t.color }}>
                    <CheckCircle className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ② Taille d'équipe */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/50 mb-3">② Taille de l'équipe</p>
        <div className="flex flex-wrap gap-2">
          {TEAM_SIZES.map(s => (
            <button
              key={s.label} type="button"
              onClick={() => setTeamSize(s.label)}
              className="px-4 py-2 border-2 text-[10px] font-black uppercase tracking-wide transition-all"
              style={{
                borderColor: teamSize === s.label ? '#5D7BFF' : 'rgba(93,123,255,0.15)',
                background: teamSize === s.label ? 'rgba(93,123,255,0.1)' : 'var(--bg-chat)',
                color: teamSize === s.label ? '#5D7BFF' : 'var(--text-primary)',
              }}
            >
              {s.label}
              {s.disc > 0 && <span className="ml-1.5 text-[7px] opacity-60">-{s.disc}%</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Estimation tarifaire live */}
      <AnimatePresence>
        {selectedTools.length > 0 && teamSize && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="border-2 px-5 py-4 flex items-center justify-between gap-4"
            style={{ borderColor: 'rgba(93,123,255,0.25)', background: 'rgba(93,123,255,0.06)' }}
          >
            <div>
              <p className="text-[9px] uppercase tracking-widest text-[#5D7BFF]/70 font-black">Estimation tarifaire</p>
              <p className="text-[10px] text-[var(--text-primary)]/50 mt-0.5">
                {selectedTools.length} outil{selectedTools.length > 1 ? 's' : ''} · {seats} utilisateurs
                {discount > 0 && <span className="text-green-500 ml-1.5 font-bold">-{discount}% remise équipe</span>}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[20px] font-black text-[#5D7BFF]">~{totalMonthly}€</p>
              <p className="text-[8px] text-[var(--text-primary)]/30">/mois · devis personnalisé</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ③ Secteur */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/50 mb-3">③ Secteur d'activité</p>
        <div className="flex flex-wrap gap-2">
          {SECTORS.map(s => (
            <button
              key={s} type="button"
              onClick={() => setSector(s)}
              className="px-3 py-1.5 border text-[9px] font-bold uppercase tracking-wide transition-all"
              style={{
                borderColor: sector === s ? '#5D7BFF' : 'rgba(93,123,255,0.15)',
                background: sector === s ? 'rgba(93,123,255,0.1)' : 'transparent',
                color: sector === s ? '#5D7BFF' : 'var(--text-primary)',
                opacity: sector === s ? 1 : 0.5,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ④ Pays */}
      <div className="relative">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/50 mb-3">④ Pays</p>
        <button
          type="button"
          onClick={() => setCountryOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 border-2 text-[11px] text-left transition-colors"
          style={{
            borderColor: countryOpen ? '#5D7BFF' : 'rgba(93,123,255,0.2)',
            background: 'var(--bg-chat)',
            color: country ? 'var(--text-primary)' : 'rgba(128,128,128,0.5)',
          }}
        >
          <span>{country || 'Sélectionnez votre pays…'}</span>
          <ChevronRight className={cx('w-3.5 h-3.5 transition-transform', countryOpen && 'rotate-90')} style={{ color: '#5D7BFF' }} />
        </button>
        <AnimatePresence>
          {countryOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="absolute z-20 left-0 right-0 border-2 shadow-xl"
              style={{ borderColor: 'rgba(93,123,255,0.25)', background: 'var(--bg-chat)', top: '100%' }}
            >
              <div className="p-2 border-b" style={{ borderColor: 'rgba(93,123,255,0.1)' }}>
                <input
                  className="w-full px-2 py-1.5 text-[11px] bg-transparent outline-none text-[var(--text-primary)] placeholder-[var(--text-primary)]/30"
                  placeholder="Rechercher…"
                  value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="max-h-44 overflow-y-auto">
                {filteredCountries.map(c => (
                  <button
                    key={c} type="button"
                    onClick={() => { setCountry(c); setCountryOpen(false); setCountrySearch(''); }}
                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#5D7BFF]/10 transition-colors"
                    style={{ color: c === country ? '#5D7BFF' : 'var(--text-primary)', fontWeight: c === country ? 700 : 400 }}
                  >
                    {c}
                  </button>
                ))}
                {filteredCountries.length === 0 && (
                  <p className="px-3 py-3 text-[10px] text-[var(--text-primary)]/30 text-center">Aucun résultat</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ⑤ Coordonnées */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/50 mb-3">⑤ Vos coordonnées</p>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} style={bordStyle} placeholder="Nom complet *" value={name} onChange={e => setName(e.target.value)} required />
            <input className={inputCls} style={bordStyle} placeholder="Email professionnel *" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <input className={inputCls} style={bordStyle} placeholder="Organisation / Entreprise" value={org} onChange={e => setOrg(e.target.value)} />
          <textarea
            className={`${inputCls} resize-none`} style={bordStyle}
            placeholder="Précisez votre besoin, contexte d'usage, contraintes… (optionnel)"
            rows={3} value={message} onChange={e => setMessage(e.target.value)}
          />
        </div>
      </div>

      {/* Submit */}
      <div className="space-y-2">
        <button
          type="submit"
          disabled={!canSubmit || sending}
          className="w-full flex items-center justify-center gap-2 py-3.5 text-white text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: '#5D7BFF', boxShadow: canSubmit ? '4px 4px 0px 0px rgba(93,123,255,0.3)' : 'none' }}
        >
          <Mail className="w-3.5 h-3.5" />
          {sending ? 'Envoi en cours…' : 'Envoyer la demande'}
        </button>
        {!canSubmit && (
          <p className="text-[9px] text-[var(--text-primary)]/25 text-center">
            Sélectionnez au moins un outil, une taille d'équipe et renseignez vos coordonnées
          </p>
        )}
        <p className="text-[8px] text-[var(--text-primary)]/20 text-center">Réponse garantie sous 24h · Aucun engagement · Devis personnalisé gratuit</p>
      </div>
    </form>
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
        <div className="max-w-2xl mx-auto mb-8">
          <p className="text-[12px] text-[var(--text-primary)]/50 leading-relaxed">
            Des applications spécialisées propulsées par le moteur Challenger IA. Chaque outil dispose d'un <strong className="text-[var(--text-primary)]/70">essai gratuit de 24h</strong>. Épinglez vos outils favoris directement dans la sidebar principale.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {OUTILS_LIST.map((outil, i) => (
            <motion.div key={outil.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="h-full">
              <OutilCard outil={outil} onOpen={(id) => setActiveOutil(OUTILS_LIST.find(o => o.id === id) ?? null)} />
            </motion.div>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-10 max-w-6xl mx-auto">
          <div className="flex items-start gap-3 px-4 py-3 border" style={{ background: 'rgba(93,123,255,0.04)', borderColor: 'rgba(93,123,255,0.12)' }}>
            <ChevronRight className="w-3.5 h-3.5 text-[#5D7BFF]/50 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-[var(--text-primary)]/40 leading-relaxed font-medium">
              Vos sessions sont sauvegardées séparément par outil. Vous pouvez créer des projets dans chaque outil pour organiser vos analyses, et importer des conversations Challenger IA dans un outil spécialisé.
            </p>
          </div>
        </div>

        {/* ── Section Entreprise ─────────────────────────────────────────────── */}
        <div className="mt-20 max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-5 h-5 text-[#5D7BFF]" />
            <h2 className="text-[13px] font-black uppercase tracking-widest text-[var(--text-primary)]">Licences Entreprise</h2>
          </div>
          <p className="text-[11px] text-[var(--text-primary)]/40 mb-6 max-w-xl">
            Composez votre suite sur-mesure et obtenez un devis personnalisé. Tarifs dégressifs selon la taille de votre équipe.
          </p>

          {/* Benefits strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[
              { icon: Users, label: 'Multi-utilisateurs', sub: 'Gestion centralisée' },
              { icon: Shield, label: 'Support prioritaire', sub: 'Réponse < 24h' },
              { icon: Sparkles, label: "Outils à la carte", sub: 'Payez ce que vous utilisez' },
              { icon: Building2, label: "Jusqu'à -50%", sub: 'Remise volume équipe' },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-2.5 px-3 py-2.5 border" style={{ borderColor: 'rgba(93,123,255,0.15)', background: 'rgba(93,123,255,0.03)' }}>
                <div className="w-6 h-6 flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(93,123,255,0.12)' }}>
                  <Icon className="w-3 h-3 text-[#5D7BFF]" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-[var(--text-primary)]/70">{label}</p>
                  <p className="text-[8px] text-[var(--text-primary)]/30">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Form — full width */}
          <div className="border-2 p-8" style={{ borderColor: 'rgba(93,123,255,0.2)', background: 'rgba(93,123,255,0.02)' }}>
            <EnterpriseContactForm />
          </div>
        </div>
      </div>
    </div>
  );
}
