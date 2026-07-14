import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Loader2, Send, Check, X,
  ChevronDown, ChevronUp, Search,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { User as FBUser } from 'firebase/auth';
import {
  getArenaUser, createArenaUser, checkArenaNameAvailable,
  getArenaPosts, getArenaPost, getArenaComments,
  addArenaComment, upvoteComment, saveSophismAlert, voteArenaPoll,
} from './arenaFirestore';
import type { ArenaUser, ArenaPost, ArenaComment, Stance, SophismAlert, ArenaPollOption } from './arenaTypes';
import { deductOneCredit } from '../supabase';
import { apiFetch } from '../apiClient';
import ArenaProfilePage from './ArenaProfilePage';
import ArenaProfileSettings from './ArenaProfileSettings';
import ArenaUserModal from './ArenaUserModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// Style éditorial : on utilise les serifs (Cormorant Garamond) pour les titres
// et les sans (Inter) pour le reste. Le serif est déjà chargé via index.css
// dans la variable --font-serif.
const SERIF = '"Cormorant Garamond", "Cormorant", Georgia, serif';
const INK = 'var(--text-primary)';
const ACCENT = '#5D7BFF';

function timeAgoLong(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return `il y a ${m} minute${m > 1 ? 's' : ''}`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    return `il y a ${h} heure${h > 1 ? 's' : ''}`;
  }
  if (s < 86400 * 7) {
    const j = Math.floor(s / 86400);
    return `il y a ${j} jour${j > 1 ? 's' : ''}`;
  }
  const d = new Date(iso);
  const months = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function initials(name: string) { return name.slice(0, 2).toUpperCase(); }

// Stance : pas de couleurs chromatiques. Distinction par typographie et un signe.
const STANCE = {
  agree:    { label: "D'accord",     short: '+' },
  disagree: { label: 'Pas d\'accord', short: '−' },
  nuance:   { label: 'Nuance',        short: '~' },
} as const;

// ─── Avatar ───────────────────────────────────────────────────────────────────
// Monogramme en serif, cercle hairline, un seul ton d'encre.

function Av({ name, size = 36, prominent = false }: { name: string; size?: number; prominent?: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        border: `1px solid ${prominent ? INK : 'var(--border)'}`,
        color: INK,
        fontFamily: SERIF,
        fontSize: size * 0.42,
        fontWeight: 500,
        fontStyle: 'italic',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        letterSpacing: 0,
        background: 'transparent',
        opacity: prominent ? 1 : 0.85,
      }}
    >
      {initials(name)}
    </div>
  );
}

// ─── Petit séparateur " · " et label small-caps ────────────────────────────────

function Dot() {
  return <span className="mx-2 text-[var(--text-primary)]/30 select-none">·</span>;
}

function MetaLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx('text-[10px] uppercase text-[var(--text-primary)]/45', className)}
      style={{ letterSpacing: '0.18em', fontVariantCaps: 'all-small-caps' }}
    >
      {children}
    </span>
  );
}

function SerifTitle({ children, className = '', size = 'lg' }: { children: React.ReactNode; className?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizes = {
    sm: 'text-[20px] leading-[1.15]',
    md: 'text-[26px] leading-[1.12]',
    lg: 'text-[32px] leading-[1.1]',
    xl: 'text-[40px] leading-[1.05]',
  };
  return (
    <h2
      className={cx(sizes[size], 'text-[var(--text-primary)]', className)}
      style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.01em' }}
    >
      {children}
    </h2>
  );
}

// ─── Pseudo Modal ─────────────────────────────────────────────────────────────

function PseudoModal({ userId, onCreated }: { userId: string; onCreated: (u: ArenaUser) => void }) {
  const [name, setName] = useState('');
  const [checking, setChecking] = useState(false);
  const [avail, setAvail] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = (v: string) => {
    setName(v); setAvail(null);
    if (t.current) clearTimeout(t.current);
    if (v.length < 3) return;
    setChecking(true);
    t.current = setTimeout(async () => { setAvail(await checkArenaNameAvailable(v.trim())); setChecking(false); }, 600);
  };

  const valid = name.length >= 3 && name.length <= 24;
  const submit = async () => {
    if (!valid || !avail || busy) return;
    setBusy(true);
    await createArenaUser(userId, name.trim());
    onCreated({ arenaName: name.trim(), credibilityScore: 0, totalComments: 0, badges: [], createdAt: new Date().toISOString() });
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-app)]/95 backdrop-blur-md px-4 pb-6 sm:pb-0"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <motion.div
        className="w-full max-w-md bg-[var(--bg-chat)] border border-[var(--border)]"
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 26, stiffness: 240 }}
      >
        <div className="px-10 pt-12 pb-8 text-center">
          <p className="text-[10px] uppercase text-[var(--text-primary)]/50 mb-5" style={{ letterSpacing: '0.32em' }}>
            L'Arène
          </p>
          <SerifTitle size="lg" className="mb-3">Choisissez votre nom de plume</SerifTitle>
          <p
            className="text-[14px] text-[var(--text-primary)]/55 italic max-w-sm mx-auto leading-relaxed"
            style={{ fontFamily: SERIF }}
          >
            Le pseudonyme sous lequel paraîtront vos arguments. Il vous suit dans tous les débats.
          </p>
        </div>

        <div className="px-10 pb-10">
          <div className="relative mb-2">
            <input
              value={name}
              onChange={e => onChange(e.target.value)}
              placeholder="Votre nom"
              maxLength={24}
              className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[20px] py-2 outline-none transition-colors placeholder:text-[var(--text-primary)]/25"
              style={{ fontFamily: SERIF, fontWeight: 500 }}
            />
            <div className="absolute right-0 bottom-3">
              {checking && <Loader2 size={14} className="animate-spin text-[var(--text-primary)]/40" />}
              {!checking && valid && avail === true  && <Check size={14} className="text-[var(--text-primary)]/70" />}
              {!checking && valid && avail === false && <X    size={14} className="text-[var(--text-primary)]/70" />}
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-primary)]/40 italic mb-8" style={{ fontFamily: SERIF }}>
            {!name && 'Trois à vingt-quatre caractères.'}
            {valid && avail === false && 'Ce nom est déjà pris — essayez-en un autre.'}
            {valid && avail === true && 'Disponible.'}
            {name.length > 0 && name.length < 3 && 'Encore quelques caractères…'}
          </p>

          <button
            onClick={submit}
            disabled={!valid || avail !== true || busy}
            className="w-full text-[12px] uppercase text-[var(--text-primary)] py-3 border-t border-[var(--border)] disabled:opacity-30 transition-all hover:bg-[var(--text-primary)]/[0.04] flex items-center justify-center gap-3"
            style={{ letterSpacing: '0.24em' }}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            <span>{busy ? 'Création…' : 'Entrer dans l\'arène'}</span>
            <span className="text-[var(--text-primary)]/40">→</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Poll Block ───────────────────────────────────────────────────────────────

function PollBlock({ options, postId, userId, onVoted }: {
  options: ArenaPollOption[]; postId: string; userId: string;
  onVoted: (updated: ArenaPollOption[]) => void;
}) {
  const total = options.reduce((s, o) => s + (o.voteCount ?? 0), 0);
  const myVote = options.find(o => o.voterIds?.includes(userId));

  const handleVote = async (optId: string) => {
    await voteArenaPoll(postId, optId, userId);
    const updated = options.map(o => {
      const voters = o.voterIds ?? [];
      if (o.id === optId) {
        if (voters.includes(userId)) return o;
        return { ...o, voteCount: (o.voteCount ?? 0) + 1, voterIds: [...voters, userId] };
      }
      if (voters.includes(userId)) {
        return { ...o, voteCount: Math.max(0, (o.voteCount ?? 0) - 1), voterIds: voters.filter(id => id !== userId) };
      }
      return o;
    });
    onVoted(updated);
  };

  return (
    <div className="my-5 py-4 border-y border-[var(--border)]">
      <MetaLabel className="block mb-3">Sondage</MetaLabel>
      <div className="space-y-2">
        {options.map(opt => {
          const pct = total > 0 ? Math.round(((opt.voteCount ?? 0) / total) * 100) : 0;
          const isMyVote = opt.voterIds?.includes(userId);
          return (
            <button
              key={opt.id}
              onClick={(e) => { e.stopPropagation(); handleVote(opt.id); }}
              className="relative w-full text-left overflow-hidden transition-colors group"
              style={{ padding: '8px 0' }}
            >
              {myVote && (
                <div
                  className="absolute left-0 top-0 h-full transition-all"
                  style={{ width: `${pct}%`, background: isMyVote ? 'rgba(93,123,255,0.08)' : 'var(--text-primary)/0.03', transitionDuration: '0.4s' }}
                />
              )}
              <div className="relative flex justify-between items-baseline gap-4">
                <span
                  className={cx('text-[15px] transition-colors', isMyVote ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/75 group-hover:text-[var(--text-primary)]')}
                  style={{ fontFamily: SERIF, fontWeight: isMyVote ? 600 : 400, fontStyle: 'italic' }}
                >
                  {opt.text}
                </span>
                {myVote && (
                  <span className="text-[12px] text-[var(--text-primary)]/55 tabular-nums shrink-0">
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--text-primary)]/40 italic mt-3" style={{ fontFamily: SERIF }}>
        {total} {total === 1 ? 'voix' : 'voix'}
      </p>
    </div>
  );
}

// ─── Post Card (style article éditorial) ──────────────────────────────────────

function PostCard({ post, onClick, onAvatarClick, userId, onPollVoted }: {
  post: ArenaPost; onClick: () => void; onAvatarClick?: () => void;
  userId: string; onPollVoted?: (postId: string, options: ArenaPollOption[]) => void;
}) {
  const total = post.agreeCount + post.disagreeCount + post.nuanceCount;
  const agreeP    = total > 0 ? (post.agreeCount    / total) * 100 : 0;
  const disagreeP = total > 0 ? (post.disagreeCount / total) * 100 : 0;
  const name = post.isAnonymous ? '??' : post.authorArenaName;
  const isFeatured = !!post.featuredDate;
  const isHot = post.commentCount >= 5;

  return (
    <article
      onClick={onClick}
      className="group cursor-pointer py-8 border-b border-[var(--border)] transition-colors hover:bg-[var(--text-primary)]/[0.015]"
    >
      {/* Sur-titre éditorial : "Défi du jour" / "Conversation animée" / persona */}
      <div className="flex items-baseline gap-3 mb-3">
        {isFeatured ? (
          <span
            className="text-[10px] uppercase text-[var(--text-primary)]/65"
            style={{ letterSpacing: '0.28em', fontVariantCaps: 'all-small-caps' }}
          >
            Défi du jour
          </span>
        ) : isHot ? (
          <span
            className="text-[10px] uppercase text-[var(--text-primary)]/65 italic"
            style={{ letterSpacing: '0.22em', fontFamily: SERIF }}
          >
            Conversation animée
          </span>
        ) : (
          <MetaLabel>{post.personaName}</MetaLabel>
        )}
        {(isFeatured || isHot) && (
          <>
            <Dot />
            <MetaLabel>{post.personaName}</MetaLabel>
          </>
        )}
      </div>

      {/* Titre — serif, généreux */}
      <SerifTitle size="md" className="mb-3 group-hover:text-[var(--text-primary)]">
        {post.title}
      </SerifTitle>

      {/* Lead paragraph */}
      {post.preamble && (
        <p
          className="text-[15px] text-[var(--text-primary)]/70 leading-relaxed mb-4 overflow-hidden"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontFamily: SERIF, fontWeight: 400 }}
        >
          {post.preamble}
        </p>
      )}

      {/* Sondage (optionnel) */}
      {post.pollOptions && post.pollOptions.length >= 2 && (
        <div onClick={e => e.stopPropagation()}>
          <PollBlock
            options={post.pollOptions}
            postId={post.id}
            userId={userId}
            onVoted={(updated) => onPollVoted?.(post.id, updated)}
          />
        </div>
      )}

      {/* Byline + dateline */}
      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={(e) => { e.stopPropagation(); onAvatarClick?.(); }}
          className="bg-transparent border-0 p-0 leading-none"
          style={{ cursor: onAvatarClick ? 'pointer' : 'default' }}
        >
          <Av name={name} size={28} />
        </button>
        <div className="flex items-baseline gap-2 flex-wrap text-[13px]">
          <span
            className="text-[var(--text-primary)] italic"
            style={{ fontFamily: SERIF, fontWeight: 500 }}
          >
            {post.isAnonymous ? 'Anonyme' : post.authorArenaName}
          </span>
          <span className="text-[var(--text-primary)]/35 text-[11px]" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>
            {timeAgoLong(post.createdAt)}
          </span>
        </div>
      </div>

      {/* Pied de page — meta condensée */}
      <div className="flex items-baseline gap-4 mt-4 pt-4 border-t border-[var(--border)]/60">
        <span className="text-[11px] text-[var(--text-primary)]/55 italic" style={{ fontFamily: SERIF }}>
          {post.commentCount} {post.commentCount === 1 ? 'contribution' : 'contributions'}
        </span>
        {total > 0 && (
          <>
            <Dot />
            {/* Mini barre opinion — un trait, deux tons d'encre */}
            <div className="flex items-center gap-2">
              <div className="h-px w-20 bg-[var(--text-primary)]/12 relative overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full"
                  style={{ width: `${agreeP}%`, background: 'var(--text-primary)', opacity: 0.55 }}
                />
                <div
                  className="absolute top-0 h-full"
                  style={{ left: `${agreeP}%`, width: `${disagreeP}%`, background: 'var(--text-primary)', opacity: 0.25 }}
                />
              </div>
              <span className="text-[11px] text-[var(--text-primary)]/55 italic tabular-nums" style={{ fontFamily: SERIF }}>
                {Math.round(agreeP)}% favorables
              </span>
            </div>
          </>
        )}
        {post.tags && post.tags.length > 0 && (
          <>
            <Dot />
            <span className="text-[11px] text-[var(--text-primary)]/45 italic" style={{ fontFamily: SERIF }}>
              {post.tags.slice(0, 3).map(t => `#${t}`).join(' ')}
            </span>
          </>
        )}
        <span className="ml-auto text-[11px] uppercase text-[var(--text-primary)]/50 group-hover:text-[var(--text-primary)] transition-colors" style={{ letterSpacing: '0.22em' }}>
          Lire →
        </span>
      </div>
    </article>
  );
}

// ─── Sophism Badge ────────────────────────────────────────────────────────────

function SophismBadge({ alert }: { alert: SophismAlert }) {
  const [open, setOpen] = useState(false);
  if (!alert.detected) return null;
  return (
    <div className="mt-3 pt-3 border-t border-[var(--border)]">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-2 text-[11px] text-[var(--text-primary)]/65 italic hover:text-[var(--text-primary)] transition-colors"
        style={{ fontFamily: SERIF }}
      >
        <span className="text-[var(--text-primary)]/40">⚠</span>
        Sophisme détecté — {alert.type}
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <p
          className="text-[13px] text-[var(--text-primary)]/65 mt-2 pl-3 leading-relaxed italic border-l border-[var(--text-primary)]/30"
          style={{ fontFamily: SERIF }}
        >
          {alert.explanation}
        </p>
      )}
    </div>
  );
}

// ─── Comment Item ─────────────────────────────────────────────────────────────

function CommentItem({ comment, userId, postId, depth, onReply, onUpdated, onCheck, checkingId }: {
  comment: ArenaComment; userId: string; postId: string; depth: number;
  onReply: (id: string, name: string) => void;
  onUpdated: (c: ArenaComment) => void;
  onCheck: (c: ArenaComment) => void;
  checkingId: string | null;
}) {
  const s = STANCE[comment.stance];
  const up = comment.upvotedBy.includes(userId);

  const handleUp = async () => {
    await upvoteComment(postId, comment.id, comment.authorId, userId, up);
    onUpdated({ ...comment, upvotes: comment.upvotes + (up ? -1 : 1), upvotedBy: up ? comment.upvotedBy.filter(x => x !== userId) : [...comment.upvotedBy, userId] });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-4 py-5 border-b border-[var(--border)]/60 last:border-0"
      style={{ paddingLeft: depth > 0 ? 36 : 0 }}
    >
      <Av name={comment.authorArenaName} size={32} prominent={depth === 0} />
      <div className="flex-1 min-w-0">
        {/* Byline */}
        <div className="flex items-baseline gap-2 mb-2 flex-wrap">
          <span
            className="text-[14px] text-[var(--text-primary)] italic"
            style={{ fontFamily: SERIF, fontWeight: 500 }}
          >
            {comment.authorArenaName}
          </span>
          <span className="text-[var(--text-primary)]/30 text-[11px]">·</span>
          <span
            className="text-[11px] text-[var(--text-primary)]/60 italic"
            style={{ fontFamily: SERIF }}
          >
            <span className="text-[var(--text-primary)]/40 mr-1">{s.short}</span>{s.label.toLowerCase()}
          </span>
          <span className="text-[var(--text-primary)]/30 text-[11px] ml-auto">{timeAgoLong(comment.createdAt)}</span>
        </div>

        {/* Corps du commentaire */}
        <p
          className="text-[15px] text-[var(--text-primary)]/85 leading-[1.7]"
          style={{ fontFamily: SERIF, fontWeight: 400 }}
        >
          {comment.content}
        </p>

        {comment.sophismAlert && <SophismBadge alert={comment.sophismAlert} />}

        {/* Actions — barre fine, texte uniquement */}
        <div className="flex items-center gap-5 mt-3 text-[11px]">
          <button
            onClick={handleUp}
            className="text-[var(--text-primary)]/45 hover:text-[var(--text-primary)] transition-colors italic"
            style={{ fontFamily: SERIF, color: up ? ACCENT : undefined, opacity: up ? 1 : undefined }}
          >
            {up ? '♥ ' : '♡ '}
            {comment.upvotes > 0 ? `${comment.upvotes} approbation${comment.upvotes > 1 ? 's' : ''}` : 'approuver'}
          </button>
          {depth === 0 && (
            <button
              onClick={() => onReply(comment.id, comment.authorArenaName)}
              className="text-[var(--text-primary)]/45 hover:text-[var(--text-primary)] transition-colors italic"
              style={{ fontFamily: SERIF }}
            >
              répondre
            </button>
          )}
          {comment.authorId !== userId && !comment.sophismAlert && (
            <button
              onClick={() => onCheck(comment)}
              disabled={checkingId === comment.id}
              className="text-[var(--text-primary)]/35 hover:text-[var(--text-primary)]/70 transition-colors italic ml-auto disabled:opacity-50 inline-flex items-center gap-1.5"
              style={{ fontFamily: SERIF }}
            >
              {checkingId === comment.id && <Loader2 size={10} className="animate-spin" />}
              vérifier la rhétorique · 0,25 cr.
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Markdown (adapté au thème éditorial) ─────────────────────────────────────

const mdArena: Record<string, any> = {
  p: ({ children }: any) => (
    <p
      className="text-[15px] text-[var(--text-primary)]/85 leading-[1.75] mb-3"
      style={{ fontFamily: SERIF }}
    >
      {children}
    </p>
  ),
  h2: ({ children }: any) => (
    <h3
      className="text-[20px] text-[var(--text-primary)] mt-6 mb-3"
      style={{ fontFamily: SERIF, fontWeight: 600 }}
    >
      {children}
    </h3>
  ),
  h3: ({ children }: any) => (
    <h4
      className="text-[16px] text-[var(--text-primary)] mt-5 mb-2 italic"
      style={{ fontFamily: SERIF, fontWeight: 500 }}
    >
      {children}
    </h4>
  ),
  strong: ({ children }: any) => <strong className="text-[var(--text-primary)]" style={{ fontWeight: 600 }}>{children}</strong>,
  em: ({ children }: any) => <em className="italic text-[var(--text-primary)]/75">{children}</em>,
  ul: ({ children }: any) => <ul className="my-3 pl-5 list-none space-y-2">{children}</ul>,
  li: ({ children }: any) => (
    <li
      className="text-[15px] text-[var(--text-primary)]/80 leading-relaxed relative pl-4"
      style={{ fontFamily: SERIF }}
    >
      <span className="absolute left-0 top-[0.5em] text-[var(--text-primary)]/40">—</span>
      {children}
    </li>
  ),
  blockquote: ({ children }: any) => (
    <blockquote
      className="my-4 pl-5 border-l border-[var(--text-primary)]/40 text-[15px] text-[var(--text-primary)]/75 italic leading-relaxed"
      style={{ fontFamily: SERIF }}
    >
      {children}
    </blockquote>
  ),
  code: ({ children }: any) => (
    <code className="font-mono text-[12px] text-[var(--text-primary)]/90 bg-[var(--text-primary)]/[0.06] px-1.5 py-0.5">
      {children}
    </code>
  ),
  hr: () => (
    <div className="flex items-center justify-center my-6">
      <span className="text-[var(--text-primary)]/30 text-lg" style={{ fontFamily: SERIF }}>· · ·</span>
    </div>
  ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--text-primary)] underline underline-offset-4 decoration-[var(--text-primary)]/40 hover:decoration-[var(--text-primary)] transition-all">
      {children}
    </a>
  ),
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ArenaPage({ user, supabaseUserId, onBack, onGoToXpose }: {
  user: FBUser | null; supabaseUserId: string | null; onBack: () => void; onGoToXpose?: () => void;
}) {
  const [arenaUser, setArenaUser] = useState<ArenaUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [firestoreError, setFirestoreError] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [view, setView] = useState<'feed' | 'post' | 'profile' | 'settings'>('feed');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [userModalId, setUserModalId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'recent' | 'trending' | 'featured'>('recent');
  const [posts, setPosts] = useState<ArenaPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const [selectedPost, setSelectedPost] = useState<ArenaPost | null>(null);
  const [comments, setComments] = useState<ArenaComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [text, setText] = useState('');
  const [stance, setStance] = useState<Stance>('agree');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [posting, setPosting] = useState(false);

  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [synthLoading, setSynthLoading] = useState(false);
  const [fcClaim, setFcClaim] = useState('');
  const [fcResult, setFcResult] = useState<string | null>(null);
  const [fcLoading, setFcLoading] = useState(false);
  const [showFc, setShowFc] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) { setLoadingUser(false); return; }
    getArenaUser(user.uid)
      .then(u => { setArenaUser(u); setLoadingUser(false); if (!u) setShowModal(true); })
      .catch(() => { setFirestoreError(true); setLoadingUser(false); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoadingPosts(true);
    getArenaPosts(filter).then(setPosts).catch(() => {}).finally(() => setLoadingPosts(false));
  }, [filter, user]);

  const openPost = async (p: ArenaPost) => {
    setSelectedPost(p); setView('post');
    setSynthesis(null); setFcResult(null); setShowFc(false); setExpanded(false);
    setLoadingComments(true);
    setComments(await getArenaComments(p.id));
    setLoadingComments(false);
  };

  const submitComment = async () => {
    if (!text.trim() || !selectedPost || !user || !arenaUser || posting) return;
    setPosting(true);
    await addArenaComment(selectedPost.id, { authorId: user.uid, authorArenaName: arenaUser.arenaName, stance, content: text.trim(), parentCommentId: replyTo?.id ?? null, createdAt: new Date().toISOString() });
    const [nc, np] = await Promise.all([getArenaComments(selectedPost.id), getArenaPost(selectedPost.id)]);
    setComments(nc); if (np) setSelectedPost(np);
    setText(''); setReplyTo(null); setPosting(false);
    setArenaUser(a => a ? { ...a, totalComments: a.totalComments + 1 } : a);
  };

  const checkSophism = async (c: ArenaComment) => {
    if (!selectedPost || !supabaseUserId) return;
    if (!await deductOneCredit(supabaseUserId)) { alert('Crédits insuffisants.'); return; }
    setCheckingId(c.id);
    try {
      const r = await apiFetch('/api/arena', { method: 'POST', body: JSON.stringify({ action: 'sophism', content: c.content, context: selectedPost.title }) });
      const data: SophismAlert = await r.json();
      await saveSophismAlert(selectedPost.id, c.id, c.authorId, data);
      setComments(cs => cs.map(x => x.id === c.id ? { ...x, sophismAlert: data } : x));
    } finally { setCheckingId(null); }
  };

  const doSynthesis = async () => {
    if (!selectedPost || !supabaseUserId || synthLoading) return;
    if (!await deductOneCredit(supabaseUserId)) { alert('Crédits insuffisants.'); return; }
    setSynthLoading(true);
    try {
      const r = await apiFetch('/api/arena', { method: 'POST', body: JSON.stringify({ action: 'synthesis', title: selectedPost.title, preamble: selectedPost.preamble, comments: comments.map(c => ({ stance: c.stance, content: c.content })) }) });
      setSynthesis((await r.json()).result ?? '');
    } finally { setSynthLoading(false); }
  };

  const doFactCheck = async () => {
    if (!fcClaim.trim() || !selectedPost || !supabaseUserId || fcLoading) return;
    if (!await deductOneCredit(supabaseUserId)) { alert('Crédits insuffisants.'); return; }
    setFcLoading(true);
    try {
      const r = await apiFetch('/api/arena', { method: 'POST', body: JSON.stringify({ action: 'factcheck', claim: fcClaim, context: selectedPost.title }) });
      setFcResult((await r.json()).result ?? ''); setShowFc(false); setFcClaim('');
    } finally { setFcLoading(false); }
  };

  const roots   = comments.filter(c => !c.parentCommentId);
  const replies = (id: string) => comments.filter(c => c.parentCommentId === id);
  const filtered = search.trim() ? posts.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.preamble?.toLowerCase().includes(search.toLowerCase())) : posts;

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!user) return (
    <div className="h-full flex flex-col items-center justify-center gap-5 bg-[var(--bg-app)] px-8">
      <SerifTitle size="md" className="text-center">L'Arène est réservée aux membres</SerifTitle>
      <p
        className="text-[14px] text-[var(--text-primary)]/55 italic text-center max-w-sm"
        style={{ fontFamily: SERIF }}
      >
        Connectez-vous pour rejoindre la conversation.
      </p>
      <button
        onClick={onBack}
        className="text-[11px] uppercase text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] transition-colors mt-2"
        style={{ letterSpacing: '0.24em' }}
      >
        ← Retour
      </button>
    </div>
  );

  if (loadingUser) return (
    <div className="h-full flex items-center justify-center bg-[var(--bg-app)]">
      <Loader2 size={20} className="animate-spin text-[var(--text-primary)]/40" />
    </div>
  );

  if (firestoreError) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8 bg-[var(--bg-app)]">
      <SerifTitle size="sm" className="text-center">Règles Firestore non déployées</SerifTitle>
      <p className="text-[13px] text-[var(--text-primary)]/55 italic text-center max-w-md leading-relaxed" style={{ fontFamily: SERIF }}>
        Firebase Console → Firestore → Règles → Publier les nouvelles règles arena_users, arena_posts.
      </p>
      <button
        onClick={onBack}
        className="text-[11px] uppercase text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] transition-colors mt-2"
        style={{ letterSpacing: '0.24em' }}
      >
        ← Retour
      </button>
    </div>
  );

  // ── Profile / Settings ────────────────────────────────────────────────────

  if (view === 'profile' && profileUserId && arenaUser) {
    return (
      <ArenaProfilePage
        targetUserId={profileUserId}
        myUserId={user.uid}
        myArenaUser={arenaUser}
        onBack={() => { setView('feed'); setProfileUserId(null); }}
        onOpenSettings={() => setView('settings')}
        onViewProfile={(uid) => { setProfileUserId(uid); }}
      />
    );
  }

  if (view === 'settings' && arenaUser) {
    return (
      <ArenaProfileSettings
        userId={user.uid}
        arenaUser={arenaUser}
        onBack={() => setView('feed')}
        onSaved={(updated) => { setArenaUser(updated); setView('feed'); }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-app)]">
      {showModal && <PseudoModal userId={user.uid} onCreated={u => { setArenaUser(u); setShowModal(false); }} />}

      <AnimatePresence>
        {userModalId && arenaUser && (
          <ArenaUserModal
            targetUserId={userModalId}
            myUserId={user.uid}
            myArenaUser={arenaUser}
            onClose={() => setUserModalId(null)}
            onViewFullProfile={(uid) => { setUserModalId(null); setProfileUserId(uid); setView('profile'); }}
          />
        )}
      </AnimatePresence>

      {/* ── Top bar éditoriale ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-[var(--bg-chat)] border-b border-[var(--border)]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center gap-4 px-6 py-4 max-w-3xl mx-auto w-full">
          <button
            onClick={view === 'post' ? () => { setView('feed'); setSelectedPost(null); setSynthesis(null); } : onBack}
            className="text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] transition-colors leading-none"
          >
            <ArrowLeft size={16} />
          </button>

          {view === 'feed' ? (
            <>
              <div className="flex-1 min-w-0">
                <h1
                  className="text-[22px] text-[var(--text-primary)] leading-none"
                  style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.01em' }}
                >
                  L'Arène
                </h1>
                <p
                  className="text-[11px] text-[var(--text-primary)]/45 italic mt-1"
                  style={{ fontFamily: SERIF }}
                >
                  {arenaUser ? <>Sous le nom de <span className="text-[var(--text-primary)]/75">{arenaUser.arenaName}</span></> : 'Place publique des arguments'}
                </p>
              </div>

              <button
                onClick={() => setShowSearch(v => !v)}
                className={cx('transition-colors leading-none', showSearch ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]')}
              >
                <Search size={15} />
              </button>

              {arenaUser && (
                <button
                  onClick={() => setView('settings')}
                  className="text-[11px] italic text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] transition-colors"
                  style={{ fontFamily: SERIF }}
                  title="Mon profil"
                >
                  <span className="tabular-nums">{arenaUser.credibilityScore}</span> pts
                </button>
              )}

              {onGoToXpose && (
                <button
                  onClick={onGoToXpose}
                  className="text-[11px] uppercase text-[var(--text-primary)]/75 hover:text-[var(--text-primary)] transition-colors border-l border-[var(--border)] pl-4"
                  style={{ letterSpacing: '0.24em' }}
                >
                  Xpose →
                </button>
              )}
            </>
          ) : (
            <div className="flex-1 min-w-0">
              <p
                className="text-[14px] text-[var(--text-primary)] italic truncate"
                style={{ fontFamily: SERIF, fontWeight: 500 }}
              >
                {selectedPost?.title}
              </p>
              <p
                className="text-[11px] text-[var(--text-primary)]/45 italic"
                style={{ fontFamily: SERIF }}
              >
                {selectedPost?.commentCount} {selectedPost?.commentCount === 1 ? 'contribution' : 'contributions'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── FEED ──────────────────────────────────────────────────────────── */}
      {view === 'feed' && (
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-[var(--border)] bg-[var(--bg-chat)]"
              >
                <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
                  <Search size={14} className="text-[var(--text-primary)]/40" />
                  <input
                    autoFocus
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Rechercher un débat…"
                    className="flex-1 bg-transparent border-0 text-[var(--text-primary)] text-[15px] outline-none placeholder:text-[var(--text-primary)]/35"
                    style={{ fontFamily: SERIF, fontStyle: 'italic' }}
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="max-w-3xl mx-auto px-6 pt-6 pb-32">
            {/* Onglets filtres — texte simple avec underline */}
            <nav className="flex items-baseline gap-6 mb-2 pb-4 border-b border-[var(--border)]">
              {([
                { key: 'recent',   label: 'Récents' },
                { key: 'trending', label: 'Tendance' },
                { key: 'featured', label: 'Défi du jour' },
              ] as { key: typeof filter; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={cx(
                    'text-[12px] uppercase transition-colors pb-2 -mb-px border-b',
                    filter === key
                      ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 border-transparent'
                  )}
                  style={{ letterSpacing: '0.22em' }}
                >
                  {label}
                </button>
              ))}
            </nav>

            {loadingPosts ? (
              <div className="flex justify-center py-20">
                <Loader2 size={20} className="animate-spin text-[var(--text-primary)]/40" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <SerifTitle size="md" className="mb-3">L'arène est silencieuse</SerifTitle>
                <p
                  className="text-[14px] text-[var(--text-primary)]/55 italic max-w-md mx-auto"
                  style={{ fontFamily: SERIF }}
                >
                  Aucune thèse à débattre pour le moment. Propulsez la prochaine depuis le chat.
                </p>
              </div>
            ) : (
              <div>
                {filtered.map(p => (
                  <PostCard
                    key={p.id}
                    post={p}
                    userId={user?.uid ?? ''}
                    onClick={() => openPost(p)}
                    onAvatarClick={p.authorId && !p.isAnonymous ? () => { if (arenaUser) setUserModalId(p.authorId); } : undefined}
                    onPollVoted={(postId, opts) => setPosts(prev => prev.map(x => x.id === postId ? { ...x, pollOptions: opts } : x))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── POST DETAIL ───────────────────────────────────────────────────── */}
      {view === 'post' && selectedPost && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 pt-10 pb-40">
            {/* Sur-titre */}
            <div className="flex items-baseline gap-3 mb-5">
              <MetaLabel>{selectedPost.personaName}</MetaLabel>
              <Dot />
              <span
                className="text-[12px] text-[var(--text-primary)]/55 italic"
                style={{ fontFamily: SERIF }}
              >
                {timeAgoLong(selectedPost.createdAt)}
              </span>
            </div>

            {/* Titre — généreux, centré sur la page */}
            <SerifTitle size="xl" className="mb-5">
              {selectedPost.title}
            </SerifTitle>

            {selectedPost.preamble && (
              <p
                className="text-[19px] text-[var(--text-primary)]/65 leading-[1.5] italic mb-8 font-light"
                style={{ fontFamily: SERIF }}
              >
                {selectedPost.preamble}
              </p>
            )}

            {/* Byline */}
            <div className="flex items-center gap-3 pb-8 mb-8 border-b border-[var(--border)]">
              <Av name={selectedPost.isAnonymous ? '??' : selectedPost.authorArenaName} size={34} prominent />
              <div>
                <p
                  className="text-[14px] text-[var(--text-primary)] italic leading-tight"
                  style={{ fontFamily: SERIF, fontWeight: 500 }}
                >
                  {selectedPost.isAnonymous ? 'Anonyme' : selectedPost.authorArenaName}
                </p>
                <p className="text-[11px] text-[var(--text-primary)]/45 italic mt-0.5" style={{ fontFamily: SERIF }}>
                  Propulsé depuis Challenger IA
                </p>
              </div>
            </div>

            {/* Question — bloc citation */}
            <div className="mb-6">
              <MetaLabel className="block mb-3">La question</MetaLabel>
              <blockquote
                className="text-[17px] text-[var(--text-primary)]/85 italic leading-[1.55] pl-5 border-l border-[var(--text-primary)]/30"
                style={{ fontFamily: SERIF }}
              >
                {selectedPost.question}
              </blockquote>
            </div>

            {/* Réponse de l'IA */}
            <div className="mb-10">
              <MetaLabel className="block mb-3">La réponse de l'IA</MetaLabel>
              {(() => {
                const LIMIT = 600;
                const long = selectedPost.aiResponse.length > LIMIT;
                const shown = long && !expanded ? selectedPost.aiResponse.slice(0, LIMIT) : selectedPost.aiResponse;
                return (
                  <>
                    <div className={cx('relative', long && !expanded ? 'overflow-hidden' : '')}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdArena}>{shown}</ReactMarkdown>
                      {long && !expanded && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
                          style={{ background: 'linear-gradient(to top, var(--bg-app), transparent)' }}
                        />
                      )}
                    </div>
                    {long && (
                      <button
                        onClick={() => setExpanded(v => !v)}
                        className="mt-3 text-[12px] italic text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1.5"
                        style={{ fontFamily: SERIF }}
                      >
                        {expanded ? <><ChevronUp size={12} />Replier la réponse</> : <><ChevronDown size={12} />Lire la suite</>}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Synthèse de l'opinion */}
            {selectedPost.commentCount > 0 && (
              <div className="mb-10 py-5 border-y border-[var(--border)]">
                <MetaLabel className="block mb-3">L'opinion — {selectedPost.commentCount} {selectedPost.commentCount === 1 ? 'voix' : 'voix'}</MetaLabel>
                <div className="flex h-px bg-[var(--text-primary)]/12 relative overflow-hidden mb-3">
                  {selectedPost.agreeCount > 0 && (
                    <div
                      style={{
                        width: `${(selectedPost.agreeCount / selectedPost.commentCount) * 100}%`,
                        background: 'var(--text-primary)',
                        opacity: 0.6,
                      }}
                    />
                  )}
                  {selectedPost.nuanceCount > 0 && (
                    <div
                      style={{
                        width: `${(selectedPost.nuanceCount / selectedPost.commentCount) * 100}%`,
                        background: 'var(--text-primary)',
                        opacity: 0.35,
                      }}
                    />
                  )}
                  {selectedPost.disagreeCount > 0 && (
                    <div
                      style={{
                        width: `${(selectedPost.disagreeCount / selectedPost.commentCount) * 100}%`,
                        background: 'var(--text-primary)',
                        opacity: 0.15,
                      }}
                    />
                  )}
                </div>
                <div className="flex items-baseline gap-6 text-[12px]" style={{ fontFamily: SERIF }}>
                  <span className="italic text-[var(--text-primary)]/75">
                    <span className="tabular-nums">{selectedPost.agreeCount}</span> favorables
                  </span>
                  <span className="italic text-[var(--text-primary)]/55">
                    <span className="tabular-nums">{selectedPost.nuanceCount}</span> nuancés
                  </span>
                  <span className="italic text-[var(--text-primary)]/40">
                    <span className="tabular-nums">{selectedPost.disagreeCount}</span> opposés
                  </span>
                </div>
              </div>
            )}

            {/* Outils IA — boutons texte */}
            <div className="flex items-baseline gap-6 mb-6 text-[12px]" style={{ fontFamily: SERIF }}>
              <button
                onClick={doSynthesis}
                disabled={synthLoading || comments.length === 0}
                className="italic text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors inline-flex items-center gap-1.5"
              >
                {synthLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                Demander une synthèse <span className="text-[var(--text-primary)]/35">· 0,25 cr.</span>
              </button>
              <Dot />
              <button
                onClick={() => { setShowFc(v => !v); setFcResult(null); }}
                className="italic text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] transition-colors"
              >
                Vérifier une affirmation <span className="text-[var(--text-primary)]/35">· 0,25 cr.</span>
              </button>
            </div>

            <AnimatePresence>
              {showFc && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mb-6"
                >
                  <div className="flex items-end gap-3 border-b border-[var(--text-primary)]/30 pb-2">
                    <input
                      autoFocus
                      value={fcClaim}
                      onChange={e => setFcClaim(e.target.value)}
                      placeholder="L'affirmation à vérifier…"
                      className="flex-1 bg-transparent border-0 text-[var(--text-primary)] text-[16px] outline-none placeholder:text-[var(--text-primary)]/35"
                      style={{ fontFamily: SERIF, fontStyle: 'italic' }}
                    />
                    <button
                      onClick={doFactCheck}
                      disabled={!fcClaim.trim() || fcLoading}
                      className="text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors leading-none pb-1"
                    >
                      {fcLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {synthesis && (
                <motion.aside
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="my-6 py-5 border-y border-[var(--text-primary)]/25"
                >
                  <div className="flex items-baseline justify-between mb-3">
                    <MetaLabel>Synthèse de la conversation</MetaLabel>
                    <button onClick={() => setSynthesis(null)} className="text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdArena}>{synthesis}</ReactMarkdown>
                </motion.aside>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {fcResult && (
                <motion.aside
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="my-6 py-5 border-y border-[var(--text-primary)]/25"
                >
                  <div className="flex items-baseline justify-between mb-3">
                    <MetaLabel>Vérification</MetaLabel>
                    <button onClick={() => setFcResult(null)} className="text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdArena}>{fcResult}</ReactMarkdown>
                </motion.aside>
              )}
            </AnimatePresence>

            {/* Commentaires */}
            <div className="pt-6 mt-8 border-t-2 border-[var(--text-primary)]/25">
              <SerifTitle size="sm" className="mb-1">
                Les contributions
              </SerifTitle>
              <p
                className="text-[12px] text-[var(--text-primary)]/45 italic mb-6"
                style={{ fontFamily: SERIF }}
              >
                {selectedPost.commentCount} {selectedPost.commentCount === 1 ? 'voix s\'est exprimée' : 'voix se sont exprimées'}.
              </p>

              {loadingComments ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={18} className="animate-spin text-[var(--text-primary)]/40" />
                </div>
              ) : roots.length === 0 ? (
                <p
                  className="text-[14px] text-[var(--text-primary)]/55 italic text-center py-10"
                  style={{ fontFamily: SERIF }}
                >
                  Soyez la première voix.
                </p>
              ) : (
                <div>
                  {roots.map(c => (
                    <React.Fragment key={c.id}>
                      <CommentItem
                        comment={c}
                        userId={user.uid}
                        postId={selectedPost.id}
                        depth={0}
                        onReply={(id, name) => { setReplyTo({ id, name }); boxRef.current?.focus(); }}
                        onUpdated={u => setComments(cs => cs.map(x => x.id === u.id ? u : x))}
                        onCheck={checkSophism}
                        checkingId={checkingId}
                      />
                      {replies(c.id).map(r => (
                        <CommentItem
                          key={r.id}
                          comment={r}
                          userId={user.uid}
                          postId={selectedPost.id}
                          depth={1}
                          onReply={() => {}}
                          onUpdated={u => setComments(cs => cs.map(x => x.id === u.id ? u : x))}
                          onCheck={checkSophism}
                          checkingId={checkingId}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Formulaire — sticky, style éditorial */}
          <div className="sticky bottom-0 bg-[var(--bg-chat)] border-t border-[var(--border)]">
            <div className="max-w-3xl mx-auto px-6 py-4">
              {replyTo && (
                <div
                  className="flex items-baseline gap-2 mb-3 text-[12px] italic text-[var(--text-primary)]/55"
                  style={{ fontFamily: SERIF }}
                >
                  <span>En réponse à <span className="text-[var(--text-primary)]">{replyTo.name}</span></span>
                  <button onClick={() => setReplyTo(null)} className="ml-auto text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors">
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Sélecteur de posture — texte uniquement */}
              <div className="flex items-baseline gap-5 mb-3 text-[11px] uppercase" style={{ letterSpacing: '0.22em' }}>
                <span className="text-[var(--text-primary)]/40">Votre posture</span>
                {(['agree', 'disagree', 'nuance'] as Stance[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setStance(s)}
                    className={cx(
                      'transition-colors pb-1 border-b',
                      stance === s
                        ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                        : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/65 border-transparent'
                    )}
                  >
                    {STANCE[s].label}
                  </button>
                ))}
              </div>

              {/* Champ texte */}
              <div className="flex items-end gap-3 border-b border-[var(--text-primary)]/30 pb-2">
                {arenaUser && <Av name={arenaUser.arenaName} size={28} />}
                <textarea
                  ref={boxRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(); }}
                  placeholder="Votre argument…"
                  rows={2}
                  className="flex-1 bg-transparent border-0 text-[var(--text-primary)] text-[15px] resize-none outline-none placeholder:text-[var(--text-primary)]/35 leading-relaxed"
                  style={{ fontFamily: SERIF, fontStyle: 'italic' }}
                />
                <button
                  onClick={submitComment}
                  disabled={!text.trim() || posting}
                  className="text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors leading-none pb-1 inline-flex items-center gap-2"
                  title="Publier (⌘/Ctrl + Entrée)"
                >
                  {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span className="text-[11px] uppercase" style={{ letterSpacing: '0.22em' }}>Publier</span>
                </button>
              </div>
              <p
                className="text-[10px] text-[var(--text-primary)]/35 italic mt-2"
                style={{ fontFamily: SERIF }}
              >
                Pressez ⌘/Ctrl + Entrée pour envoyer.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
