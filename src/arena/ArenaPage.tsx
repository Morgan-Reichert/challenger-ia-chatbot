import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Trophy, Flame, Star, Clock,
  MessageSquare, ThumbsUp, AlertTriangle, Loader2,
  Send, Check, X, Shield, Search, Sparkles,
  FileSearch, ChevronDown, ChevronUp, Zap,
  Users, TrendingUp, BarChart3, Bell, Settings,
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
import ArenaProfilePage from './ArenaProfilePage';
import ArenaProfileSettings from './ArenaProfileSettings';
import ArenaUserModal from './ArenaUserModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'maintenant';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}j`;
}

const PALETTE = ['#5D7BFF','#34D399','#F87171','#FBBF24','#A78BFA','#F97316','#38BDF8','#FB7185'];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(name: string) { return name.slice(0, 2).toUpperCase(); }

const STANCE = {
  agree:    { label: "D'accord",     short: '✓', color: '#34D399', rgb: '52,211,153' },
  disagree: { label: 'Pas d\'accord', short: '✗', color: '#F87171', rgb: '248,113,113' },
  nuance:   { label: 'Nuance',        short: '~', color: '#FBBF24', rgb: '251,191,36' },
} as const;

// ─── Avatar circle ────────────────────────────────────────────────────────────

function Av({ name, size = 36, ring = false }: { name: string; size?: number; ring?: boolean }) {
  const c = avatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${c}18`, border: `${ring ? 2.5 : 1.5}px solid ${c}`,
      color: c, fontSize: size * 0.3, fontWeight: 900, display: 'flex',
      alignItems: 'center', justifyContent: 'center', letterSpacing: 1,
    }}>
      {initials(name)}
    </div>
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
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-6 sm:pb-0"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="w-full max-w-sm overflow-hidden border-2 border-white/10"
        style={{ background: '#0D1018' }}
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 22 }}>

        {/* Header band */}
        <div className="border-b-2 border-white/10 px-6 pt-8 pb-6 text-center" style={{ background: 'rgba(93,123,255,0.06)' }}>
          <div className="w-14 h-14 border-2 border-[#5D7BFF] bg-[#5D7BFF]/10 flex items-center justify-center mx-auto mb-4">
            <Trophy size={24} color="#5D7BFF" />
          </div>
          <p className="font-black text-sm uppercase tracking-widest text-white mb-1">L'Arène</p>
          <p className="text-[11px] text-white/40">Choisissez votre identité de débatteur</p>
        </div>

        <div className="p-6">
          {/* Input */}
          <div className="relative mb-3">
            <input value={name} onChange={e => onChange(e.target.value)} placeholder="Votre pseudonyme…" maxLength={24}
              className="w-full bg-white/5 border-2 border-white/10 text-white text-sm py-3.5 pl-4 pr-11 outline-none focus:border-[#5D7BFF]/60 transition-colors"
              style={{ boxSizing: 'border-box' }} />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {checking && <Loader2 size={16} color="rgba(255,255,255,0.3)" className="animate-spin" />}
              {!checking && valid && avail === true  && <Check size={16} color="#34D399" />}
              {!checking && valid && avail === false && <X    size={16} color="#F87171" />}
            </div>
          </div>

          {valid && avail === false && <p className="text-[11px] text-[#F87171] mb-3">Pseudonyme déjà pris.</p>}

          {/* Preview card */}
          {valid && avail === true && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 bg-white/4 border-2 border-white/8 p-3 mb-4">
              <Av name={name} size={42} ring />
              <div>
                <p className="font-black text-sm text-white">{name}</p>
                <p className="text-[10px] text-white/35 mt-0.5">⭐ 0 pts · Nouveau débatteur</p>
              </div>
            </motion.div>
          )}

          <button onClick={submit} disabled={!valid || avail !== true || busy}
            className="w-full bg-[#5D7BFF] border-2 border-[#5D7BFF] text-white font-black text-[11px] uppercase tracking-widest py-4 flex items-center justify-center gap-2 cursor-pointer transition-opacity"
            style={{ opacity: (!valid || avail !== true || busy) ? 0.3 : 1, boxShadow: '3px 3px 0px 0px rgba(93,123,255,0.35)' }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Trophy size={16} />}
            {busy ? 'Création…' : "Entrer dans l'Arène"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Story avatar (feed top) ─────────────────────────────────────────────────

function StoryDot({ post, onClick }: { post: ArenaPost; onClick: () => void }) {
  const name = post.isAnonymous ? 'AN' : post.authorArenaName;
  const c = avatarColor(name);
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 flex-shrink-0">
      <div style={{ padding: 2, border: `2px solid ${c}`, display: 'inline-flex' }}>
        <Av name={name} size={44} />
      </div>
      <span className="text-[9px] text-white/40 max-w-[52px] text-center overflow-hidden text-ellipsis whitespace-nowrap font-bold">
        {post.isAnonymous ? 'Anonyme' : post.authorArenaName.split(' ')[0]}
      </span>
    </button>
  );
}

// ─── Poll Card ────────────────────────────────────────────────────────────────

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
    <div className="mb-3">
      {options.map(opt => {
        const pct = total > 0 ? Math.round(((opt.voteCount ?? 0) / total) * 100) : 0;
        const isMyVote = opt.voterIds?.includes(userId);
        return (
          <button
            key={opt.id}
            onClick={(e) => { e.stopPropagation(); handleVote(opt.id); }}
            className="relative w-full mb-2 px-3 py-2 text-left cursor-pointer overflow-hidden transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: `2px solid ${isMyVote ? '#5D7BFF' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            {myVote && (
              <div className="absolute left-0 top-0 h-full transition-all" style={{ width: `${pct}%`, background: isMyVote ? 'rgba(93,123,255,0.15)' : 'rgba(255,255,255,0.05)', transitionDuration: '0.4s' }} />
            )}
            <div className="relative flex justify-between items-center">
              <span className="text-xs" style={{ color: isMyVote ? '#7B9BFF' : '#fff', fontWeight: isMyVote ? 700 : 400 }}>{opt.text}</span>
              {myVote && <span className="text-[11px] text-white/40 font-semibold">{pct}%</span>}
            </div>
          </button>
        );
      })}
      <p className="text-[10px] text-white/25 mt-1">{total} vote{total !== 1 ? 's' : ''}</p>
    </div>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post, onClick, onAvatarClick, userId, onPollVoted }: {
  post: ArenaPost; onClick: () => void; onAvatarClick?: () => void;
  userId: string; onPollVoted?: (postId: string, options: ArenaPollOption[]) => void;
}) {
  const total = post.agreeCount + post.disagreeCount + post.nuanceCount;
  const agreeP    = total > 0 ? (post.agreeCount    / total) * 100 : 0;
  const disagreeP = total > 0 ? (post.disagreeCount / total) * 100 : 0;
  const nuanceP   = 100 - agreeP - disagreeP;
  const name = post.isAnonymous ? '??' : post.authorArenaName;
  const c = avatarColor(name);
  const isFeatured = !!post.featuredDate;
  const isHot = post.commentCount >= 5;

  return (
    <motion.button onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }}
      className="w-full text-left group border-2 border-white/8 overflow-hidden block"
      style={{ background: '#13161E', boxShadow: '3px 3px 0px 0px rgba(255,255,255,0.04)' }}>

      {/* Colored top strip */}
      <div style={{ height: 3, background: isFeatured ? '#A78BFA' : isHot ? '#F97316' : c }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <button onClick={(e) => { e.stopPropagation(); onAvatarClick?.(); }}
            className="bg-transparent border-0 p-0 leading-none"
            style={{ cursor: onAvatarClick ? 'pointer' : 'default' }}>
            <Av name={name} size={36} ring />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white">{post.isAnonymous ? 'Anonyme' : post.authorArenaName}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{timeAgo(post.createdAt)}</p>
          </div>
          <div className="flex gap-1.5">
            {isFeatured && (
              <span className="text-[8px] font-black uppercase tracking-wide px-2 py-0.5 border border-[#A78BFA]/40 text-[#A78BFA]"
                style={{ background: 'rgba(167,139,250,0.1)' }}>⭐ Défi</span>
            )}
            {isHot && !isFeatured && (
              <span className="text-[8px] font-black uppercase tracking-wide px-2 py-0.5 border border-[#F97316]/40 text-[#F97316]"
                style={{ background: 'rgba(249,115,22,0.1)' }}>🔥 Hot</span>
            )}
          </div>
        </div>

        {/* Title */}
        <p className="text-[15px] font-black text-white leading-snug mb-1.5">{post.title}</p>
        {post.preamble && (
          <p className="text-[11px] text-white/38 leading-relaxed mb-3 overflow-hidden"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {post.preamble}
          </p>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {post.tags.map(t => (
              <span key={t} className="text-[10px] font-bold px-2 py-0.5 border border-[#5D7BFF]/25 text-[#5D7BFF]/80"
                style={{ background: 'rgba(93,123,255,0.08)' }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Sondage */}
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

        {/* Persona chip */}
        <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 inline-block mb-3.5 border border-[#5D7BFF]/25 text-[#5D7BFF]/80"
          style={{ background: 'rgba(93,123,255,0.08)' }}>
          {post.personaName}
        </span>

        {/* Stance bar */}
        {total > 0 && (
          <div className="mb-3.5">
            <div className="flex h-1.5 overflow-hidden gap-px mb-2">
              {agreeP    > 0 && <div style={{ width: `${agreeP}%`,    background: '#34D399' }} />}
              {nuanceP   > 0 && <div style={{ width: `${nuanceP}%`,   background: '#FBBF24' }} />}
              {disagreeP > 0 && <div style={{ width: `${disagreeP}%`, background: '#F87171' }} />}
            </div>
            <div className="flex gap-4">
              <span className="text-[10px] font-bold text-[#34D399]">✓ {post.agreeCount}</span>
              <span className="text-[10px] font-bold text-[#FBBF24]">~ {post.nuanceCount}</span>
              <span className="text-[10px] font-bold text-[#F87171]">✗ {post.disagreeCount}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-white/35 text-[11px]">
            <MessageSquare size={13} />
            <span>{post.commentCount}</span>
          </div>
          <div className="flex items-center gap-1.5 text-white/35 text-[11px]">
            <Users size={13} />
            <span>{post.commentCount} débatteur{post.commentCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="ml-auto border-2 border-[#5D7BFF]/40 px-3.5 py-1.5 text-[#5D7BFF] text-[10px] font-black uppercase tracking-widest">
            Débattre →
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Sophism badge ────────────────────────────────────────────────────────────

function SophismBadge({ alert }: { alert: SophismAlert }) {
  const [open, setOpen] = useState(false);
  if (!alert.detected) return null;
  const col = alert.severity === 'high' ? '#F87171' : alert.severity === 'medium' ? '#FBBF24' : '#94A3B8';
  return (
    <div className="mt-2.5">
      <button onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide px-2.5 py-1 cursor-pointer border"
        style={{ background: `${col}12`, color: col, borderColor: `${col}40` }}>
        <AlertTriangle size={11} />
        Sophisme · {alert.type}
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {open && (
        <p className="text-[11px] text-white/50 mt-2 pl-3 leading-relaxed"
          style={{ borderLeft: `2px solid ${col}60` }}>
          {alert.explanation}
        </p>
      )}
    </div>
  );
}

// ─── Comment ──────────────────────────────────────────────────────────────────

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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5" style={{ paddingLeft: depth > 0 ? 44 : 0 }}>
      <Av name={comment.authorArenaName} size={32} />
      <div className="flex-1 min-w-0">
        {/* Bubble */}
        <div className="border-2 border-white/8 p-3" style={{ background: '#1C2030' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-black text-white">{comment.authorArenaName}</span>
            <span className="text-[8px] font-black uppercase tracking-wide px-2 py-0.5 border"
              style={{ background: `rgba(${s.rgb},0.12)`, color: s.color, borderColor: `rgba(${s.rgb},0.35)` }}>
              {s.short} {s.label}
            </span>
            <span className="text-[9px] text-white/25 ml-auto">{timeAgo(comment.createdAt)}</span>
          </div>
          <p className="text-xs text-white/75 leading-relaxed">{comment.content}</p>
          {comment.sophismAlert && <SophismBadge alert={comment.sophismAlert} />}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-5 px-1 py-1.5">
          <button onClick={handleUp}
            className="flex items-center gap-1.5 text-[11px] font-bold border-0 bg-transparent cursor-pointer p-0"
            style={{ color: up ? '#5D7BFF' : 'rgba(255,255,255,0.3)' }}>
            <ThumbsUp size={13} />
            {comment.upvotes > 0 ? comment.upvotes : "J'aime"}
          </button>
          {depth === 0 && (
            <button onClick={() => onReply(comment.id, comment.authorArenaName)}
              className="text-[11px] font-bold text-white/30 border-0 bg-transparent cursor-pointer p-0">
              Répondre
            </button>
          )}
          {comment.authorId !== userId && !comment.sophismAlert && (
            <button onClick={() => onCheck(comment)} disabled={checkingId === comment.id}
              className="flex items-center gap-1 text-[11px] font-bold text-white/20 border-0 bg-transparent cursor-pointer p-0 ml-auto"
              style={{ opacity: checkingId === comment.id ? 0.4 : 1 }}>
              {checkingId === comment.id ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
              Vérifier · 0.25cr
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── mdArena (rendu markdown brutalist) ───────────────────────────────────────

const mdArena: Record<string, any> = {
  p: ({ children }: any) => <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, marginBottom: 10 }}>{children}</p>,
  h2: ({ children }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
      <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 8px' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
    </div>
  ),
  h3: ({ children }: any) => <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: '12px 0 6px' }}>{children}</p>,
  strong: ({ children }: any) => <strong style={{ fontWeight: 900, color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '1px 5px' }}>{children}</strong>,
  em: ({ children }: any) => <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.7)' }}>{children}</em>,
  ul: ({ children }: any) => <ul style={{ margin: '6px 0 10px', paddingLeft: 0, listStyle: 'none' }}>{children}</ul>,
  li: ({ children }: any) => (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
      <span style={{ width: 5, height: 5, background: '#5D7BFF', flexShrink: 0, marginTop: 7 }} />
      <span>{children}</span>
    </li>
  ),
  blockquote: ({ children }: any) => (
    <div style={{ borderLeft: '3px solid #5D7BFF', background: 'rgba(93,123,255,0.08)', padding: '10px 14px', margin: '10px 0' }}>
      <div style={{ fontSize: 7, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>Référence</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', lineHeight: 1.6 }}>{children}</div>
    </div>
  ),
  code: ({ children }: any) => <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', padding: '2px 6px', color: '#fff' }}>{children}</code>,
  hr: () => <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', margin: '14px 0' }} />,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#7B9BFF', textDecoration: 'underline', textUnderlineOffset: 3 }}>{children}</a>,
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
      const r = await fetch('/api/arena', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sophism', content: c.content, context: selectedPost.title }) });
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
      const r = await fetch('/api/arena', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'synthesis', title: selectedPost.title, preamble: selectedPost.preamble, comments: comments.map(c => ({ stance: c.stance, content: c.content })) }) });
      setSynthesis((await r.json()).result ?? '');
    } finally { setSynthLoading(false); }
  };

  const doFactCheck = async () => {
    if (!fcClaim.trim() || !selectedPost || !supabaseUserId || fcLoading) return;
    if (!await deductOneCredit(supabaseUserId)) { alert('Crédits insuffisants.'); return; }
    setFcLoading(true);
    try {
      const r = await fetch('/api/arena', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'factcheck', claim: fcClaim, context: selectedPost.title }) });
      setFcResult((await r.json()).result ?? ''); setShowFc(false); setFcClaim('');
    } finally { setFcLoading(false); }
  };

  const roots   = comments.filter(c => !c.parentCommentId);
  const replies = (id: string) => comments.filter(c => c.parentCommentId === id);
  const filtered = search.trim() ? posts.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.preamble?.toLowerCase().includes(search.toLowerCase())) : posts;

  // Guards
  if (!user) return (
    <div className="h-full flex flex-col items-center justify-center gap-4" style={{ background: '#0A0C12' }}>
      <div className="w-16 h-16 border-2 border-[#5D7BFF]/40 flex items-center justify-center">
        <Trophy size={28} color="rgba(93,123,255,0.5)" />
      </div>
      <p className="text-sm text-white/35 text-center">Connectez-vous pour accéder à l'Arène.</p>
      <button onClick={onBack} className="text-[10px] font-black uppercase tracking-widest text-[#5D7BFF] bg-transparent border-0 cursor-pointer">← Retour</button>
    </div>
  );

  if (loadingUser) return (
    <div className="h-full flex items-center justify-center" style={{ background: '#0A0C12' }}>
      <Loader2 size={24} color="rgba(93,123,255,0.4)" className="animate-spin" />
    </div>
  );

  if (firestoreError) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8" style={{ background: '#0A0C12' }}>
      <AlertTriangle size={32} color="rgba(251,191,36,0.6)" />
      <div className="text-center">
        <p className="text-sm font-black text-white mb-1.5">Règles Firestore non déployées</p>
        <p className="text-[10px] text-white/35 leading-relaxed">Firebase Console → Firestore → Règles → Publier les nouvelles règles arena_users, arena_posts.</p>
      </div>
      <button onClick={onBack} className="text-[10px] font-black uppercase tracking-widest text-white/30 bg-transparent border-0 cursor-pointer">← Retour</button>
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────

  // ── Profile / Settings views ──────────────────────────────────────────────
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
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#0A0C12' }}>
      {showModal && <PseudoModal userId={user.uid} onCreated={u => { setArenaUser(u); setShowModal(false); }} />}

      {/* ArenaUserModal */}
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

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3.5 border-b-2 border-white/6"
        style={{ background: '#0D1018' }}>
        <button onClick={view === 'post' ? () => { setView('feed'); setSelectedPost(null); setSynthesis(null); } : onBack}
          className="text-white/35 bg-transparent border-0 cursor-pointer p-0 leading-none">
          <ArrowLeft size={18} />
        </button>

        {view === 'feed' ? (
          <>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Trophy size={14} color="#5D7BFF" />
                <span className="text-sm font-black uppercase tracking-widest text-white">L'Arène</span>
              </div>
              {arenaUser && (
                <p className="text-[9px] text-white/30 mt-0.5">
                  Bienvenue, <span className="text-[#5D7BFF] font-bold">{arenaUser.arenaName}</span>
                </p>
              )}
            </div>
            <button onClick={() => setShowSearch(v => !v)}
              className="bg-transparent border-0 cursor-pointer leading-none"
              style={{ color: showSearch ? '#fff' : 'rgba(255,255,255,0.3)' }}>
              <Search size={18} />
            </button>
            {arenaUser && (
              <div className="flex items-center gap-1.5 border border-[#FBBF24]/30 px-2.5 py-1.5"
                style={{ background: 'rgba(251,191,36,0.08)' }}>
                <Star size={11} color="#FBBF24" />
                <span className="text-[11px] font-black text-[#FBBF24]">{arenaUser.credibilityScore}</span>
              </div>
            )}
            {onGoToXpose && (
              <button onClick={onGoToXpose}
                className="flex items-center gap-1.5 border-2 border-[#7C3AED] px-3 py-1.5 cursor-pointer text-white text-[9px] font-black uppercase tracking-widest bg-transparent">
                <Zap size={11} />
                XPOSE
              </button>
            )}
            {arenaUser && (
              <button onClick={() => setView('settings')}
                className="text-white/30 bg-transparent border-0 cursor-pointer leading-none">
                <Settings size={18} />
              </button>
            )}
          </>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white overflow-hidden text-ellipsis whitespace-nowrap">{selectedPost?.title}</p>
            <p className="text-[9px] text-white/30 mt-0.5">{selectedPost?.commentCount} contributions</p>
          </div>
        )}
      </div>

      {/* ── FEED ──────────────────────────────────────────────────────────── */}
      {view === 'feed' && (
        <div className="flex-1 overflow-y-auto">
          {/* Search bar */}
          <AnimatePresence>
            {showSearch && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b-2 border-white/6" style={{ background: '#0D1018' }}>
                <div className="flex items-center gap-2.5 px-4 py-3">
                  <Search size={14} color="rgba(255,255,255,0.3)" />
                  <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un débat…"
                    className="flex-1 bg-transparent border-0 text-white text-sm outline-none" />
                  {search && (
                    <button onClick={() => setSearch('')}
                      className="bg-transparent border-0 cursor-pointer leading-none text-white/30">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter tabs */}
          <div className="flex gap-2 px-4 py-3.5 overflow-x-auto">
            {([
              { key: 'recent',   label: 'Récents',      icon: Clock },
              { key: 'trending', label: 'Tendance',     icon: TrendingUp },
              { key: 'featured', label: 'Défi du jour', icon: Star },
            ] as { key: typeof filter; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setFilter(key)}
                className="flex items-center gap-1.5 px-4 py-2 border-2 flex-shrink-0 font-black text-[10px] uppercase tracking-wide cursor-pointer transition-colors"
                style={{
                  borderColor: filter === key ? '#5D7BFF' : 'rgba(255,255,255,0.1)',
                  background: filter === key ? 'rgba(93,123,255,0.12)' : 'transparent',
                  color: filter === key ? '#5D7BFF' : 'rgba(255,255,255,0.4)',
                  boxShadow: filter === key ? '2px 2px 0px 0px rgba(93,123,255,0.3)' : 'none',
                }}>
                <Icon size={11} />{label}
              </button>
            ))}
          </div>

          {/* Stories strip */}
          {filtered.length > 0 && (
            <div className="px-4 pb-4 overflow-x-auto">
              <div className="flex gap-4 pb-1">
                {filtered.slice(0, 8).map(p => <StoryDot key={p.id} post={p} onClick={() => openPost(p)} />)}
              </div>
            </div>
          )}

          {/* Posts */}
          <div className="px-4 pb-32 flex flex-col gap-3">
            {loadingPosts ? (
              <div className="flex justify-center py-16">
                <Loader2 size={22} color="rgba(93,123,255,0.4)" className="animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 border-2 border-[#5D7BFF]/20 flex items-center justify-center mx-auto mb-4">
                  <Trophy size={28} color="rgba(93,123,255,0.3)" />
                </div>
                <p className="text-sm font-black text-white/30 mb-1.5">L'Arène est vide</p>
                <p className="text-[11px] text-white/20">Propulsez un échange depuis le chat !</p>
              </div>
            ) : filtered.map(p => (
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
        </div>
      )}

      {/* ── POST DETAIL ───────────────────────────────────────────────────── */}
      {view === 'post' && selectedPost && (
        <div className="flex-1 overflow-y-auto">
          {/* Post meta */}
          <div className="px-4 pt-4 pb-3 border-b-2 border-white/5">
            <div className="flex gap-2.5 mb-3">
              <Av name={selectedPost.isAnonymous ? '??' : selectedPost.authorArenaName} size={40} ring />
              <div className="flex-1">
                <p className="text-sm font-black text-white">{selectedPost.isAnonymous ? 'Anonyme' : selectedPost.authorArenaName}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border border-[#5D7BFF]/25 text-[#5D7BFF]/80"
                    style={{ background: 'rgba(93,123,255,0.08)' }}>
                    {selectedPost.personaName}
                  </span>
                  <span className="text-[9px] text-white/25">{timeAgo(selectedPost.createdAt)}</span>
                </div>
              </div>
            </div>
            <p className="text-lg font-black text-white leading-snug mb-2">{selectedPost.title}</p>
            {selectedPost.preamble && <p className="text-xs text-white/40 leading-relaxed">{selectedPost.preamble}</p>}
          </div>

          {/* Q/A exchange */}
          <div className="px-4 py-4 flex flex-col gap-2.5 border-b-2 border-white/5">
            {/* Q bubble */}
            <div className="flex gap-2.5">
              <div className="w-7 h-7 border-2 border-white/12 flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-black text-white/40">Q</div>
              <div className="flex-1 border-2 border-white/7 px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <p className="text-xs text-white/65 leading-relaxed">{selectedPost.question}</p>
              </div>
            </div>

            {/* AI bubble */}
            <div className="flex gap-2.5">
              <div className="w-7 h-7 border-2 border-[#5D7BFF]/60 bg-[#5D7BFF]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Zap size={13} color="#5D7BFF" />
              </div>
              <div className="flex-1 border-2 border-[#5D7BFF]/20 px-4 py-3.5" style={{ background: 'rgba(93,123,255,0.06)' }}>
                <p className="text-[8px] font-black uppercase tracking-widest text-[#5D7BFF]/60 mb-2.5">Réponse IA</p>
                {(() => {
                  const LIMIT = 600;
                  const long = selectedPost.aiResponse.length > LIMIT;
                  const shown = long && !expanded ? selectedPost.aiResponse.slice(0, LIMIT) : selectedPost.aiResponse;
                  return (
                    <>
                      <div className={cx('relative', long && !expanded ? 'overflow-hidden' : '')}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdArena}>{shown}</ReactMarkdown>
                        {long && !expanded && (
                          <div className="absolute bottom-0 left-0 right-0 h-12"
                            style={{ background: 'linear-gradient(to top, #0e1422, transparent)' }} />
                        )}
                      </div>
                      {long && (
                        <button onClick={() => setExpanded(v => !v)}
                          className="mt-2 flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-[#5D7BFF]/70 bg-transparent border-0 cursor-pointer p-0">
                          {expanded ? <><ChevronUp size={11} />Condenser</> : <><ChevronDown size={11} />Voir tout</>}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Opinion summary */}
          {selectedPost.commentCount > 0 && (
            <div className="px-4 py-3 border-b-2 border-white/5">
              <div className="flex items-center gap-2 mb-2.5">
                <BarChart3 size={13} color="rgba(255,255,255,0.3)" />
                <span className="text-[9px] font-black uppercase tracking-wide text-white/30">Opinion · {selectedPost.commentCount} voix</span>
              </div>
              <div className="flex h-2 overflow-hidden gap-px mb-2.5">
                {selectedPost.agreeCount    > 0 && <div style={{ width: `${(selectedPost.agreeCount    / selectedPost.commentCount) * 100}%`, background: '#34D399' }} />}
                {selectedPost.nuanceCount   > 0 && <div style={{ width: `${(selectedPost.nuanceCount   / selectedPost.commentCount) * 100}%`, background: '#FBBF24' }} />}
                {selectedPost.disagreeCount > 0 && <div style={{ width: `${(selectedPost.disagreeCount / selectedPost.commentCount) * 100}%`, background: '#F87171' }} />}
              </div>
              <div className="flex gap-5">
                <span className="text-[11px] font-black text-[#34D399]">✓ {selectedPost.agreeCount} pour</span>
                <span className="text-[11px] font-black text-[#FBBF24]">~ {selectedPost.nuanceCount} nuances</span>
                <span className="text-[11px] font-black text-[#F87171]">✗ {selectedPost.disagreeCount} contre</span>
              </div>
            </div>
          )}

          {/* AI tools */}
          <div className="px-4 py-3 border-b-2 border-white/5 flex gap-2 flex-wrap">
            <button onClick={doSynthesis} disabled={synthLoading || comments.length === 0}
              className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide border-2 border-[#5D7BFF]/30 px-3.5 py-1.5 text-[#7B9BFF] cursor-pointer bg-transparent transition-opacity"
              style={{ background: 'rgba(93,123,255,0.08)', opacity: (synthLoading || comments.length === 0) ? 0.3 : 1 }}>
              {synthLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Synthèse · 0.25cr
            </button>
            <button onClick={() => { setShowFc(v => !v); setFcResult(null); }}
              className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide border-2 border-[#FBBF24]/30 px-3.5 py-1.5 text-[#FBBF24] cursor-pointer bg-transparent"
              style={{ background: 'rgba(251,191,36,0.08)' }}>
              <FileSearch size={12} />
              Fact-check · 0.25cr
            </button>
          </div>

          <AnimatePresence>
            {showFc && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b-2 border-white/5">
                <div className="flex gap-2 px-4 py-3">
                  <input autoFocus value={fcClaim} onChange={e => setFcClaim(e.target.value)} placeholder="Entrez l'affirmation à vérifier…"
                    className="flex-1 bg-white/5 border-2 border-white/10 text-white text-xs px-3.5 py-2.5 outline-none focus:border-[#FBBF24]/40" />
                  <button onClick={doFactCheck} disabled={!fcClaim.trim() || fcLoading}
                    className="bg-[#FBBF24] border-2 border-[#FBBF24] px-3.5 cursor-pointer leading-none transition-opacity"
                    style={{ opacity: (!fcClaim.trim() || fcLoading) ? 0.4 : 1 }}>
                    {fcLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {synthesis && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="mx-4 my-3 border-2 border-[#5D7BFF]/25 p-4"
                style={{ background: 'rgba(93,123,255,0.06)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={14} color="#5D7BFF" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#5D7BFF] flex-1">Synthèse de l'Arène</span>
                  <button onClick={() => setSynthesis(null)} className="bg-transparent border-0 cursor-pointer text-white/30 leading-none"><X size={14} /></button>
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdArena}>{synthesis}</ReactMarkdown>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {fcResult && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="mx-4 my-3 border-2 border-[#FBBF24]/25 p-4"
                style={{ background: 'rgba(251,191,36,0.06)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <FileSearch size={14} color="#FBBF24" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#FBBF24] flex-1">Fact-check</span>
                  <button onClick={() => setFcResult(null)} className="bg-transparent border-0 cursor-pointer text-white/30 leading-none"><X size={14} /></button>
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdArena}>{fcResult}</ReactMarkdown>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Comments */}
          <div className="px-4 pt-4 pb-40">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-4">
              {selectedPost.commentCount} contribution{selectedPost.commentCount !== 1 ? 's' : ''}
            </p>
            {loadingComments ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} color="rgba(93,123,255,0.4)" className="animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {roots.map(c => (
                  <div key={c.id} className="flex flex-col gap-3">
                    <CommentItem comment={c} userId={user.uid} postId={selectedPost.id} depth={0}
                      onReply={(id, name) => { setReplyTo({ id, name }); boxRef.current?.focus(); }}
                      onUpdated={u => setComments(cs => cs.map(x => x.id === u.id ? u : x))}
                      onCheck={checkSophism} checkingId={checkingId} />
                    {replies(c.id).map(r => (
                      <CommentItem key={r.id} comment={r} userId={user.uid} postId={selectedPost.id} depth={1}
                        onReply={() => {}}
                        onUpdated={u => setComments(cs => cs.map(x => x.id === u.id ? u : x))}
                        onCheck={checkSophism} checkingId={checkingId} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comment form — sticky */}
          <div className="sticky bottom-0 border-t-2 border-white/6 p-4" style={{ background: '#0D1018' }}>
            {replyTo && (
              <div className="flex items-center gap-2 mb-2.5 text-[10px] text-white/35">
                <span>↩ Réponse à <strong className="text-white/60">{replyTo.name}</strong></span>
                <button onClick={() => setReplyTo(null)} className="bg-transparent border-0 cursor-pointer ml-auto text-white/30 leading-none"><X size={12} /></button>
              </div>
            )}

            {/* Stance buttons */}
            <div className="flex gap-1.5 mb-3">
              {(['agree', 'disagree', 'nuance'] as Stance[]).map(s => {
                const cfg = STANCE[s]; const active = stance === s;
                return (
                  <button key={s} onClick={() => setStance(s)}
                    className="flex-1 py-2 text-[9px] font-black uppercase tracking-wide cursor-pointer transition-colors border-2"
                    style={{
                      borderColor: active ? cfg.color : 'rgba(255,255,255,0.08)',
                      background: active ? `rgba(${cfg.rgb},0.12)` : 'transparent',
                      color: active ? cfg.color : 'rgba(255,255,255,0.3)',
                    }}>
                    {cfg.short} {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Input + send */}
            <div className="flex gap-2.5 items-end">
              {arenaUser && <Av name={arenaUser.arenaName} size={32} />}
              <div className="flex-1 border-2 border-white/8 overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <textarea ref={boxRef} value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(); }}
                  placeholder="Votre argument… (Ctrl+↵)"
                  rows={2} className="w-full bg-transparent border-0 text-white text-xs px-3.5 py-3 resize-none outline-none box-border" />
                <div className="flex justify-end px-2.5 pb-2">
                  <button onClick={submitComment} disabled={!text.trim() || posting}
                    className="flex items-center gap-1.5 bg-[#5D7BFF] border-2 border-[#5D7BFF] text-white text-[10px] font-black uppercase tracking-widest px-3.5 py-1.5 cursor-pointer transition-opacity"
                    style={{ opacity: (!text.trim() || posting) ? 0.3 : 1 }}>
                    {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Publier
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
