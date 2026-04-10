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
  addArenaComment, upvoteComment, saveSophismAlert,
} from './arenaFirestore';
import type { ArenaUser, ArenaPost, ArenaComment, Stance, SophismAlert } from './arenaTypes';
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
      background: `${c}22`, border: `${ring ? 2.5 : 1.5}px solid ${c}55`,
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
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xl px-4 pb-6 sm:pb-0"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="w-full max-w-sm overflow-hidden"
        style={{ borderRadius: 28, background: '#13161E', border: '1px solid rgba(255,255,255,0.08)' }}
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 22 }}>

        {/* Top gradient band */}
        <div style={{ background: 'linear-gradient(135deg, #5D7BFF22, #A78BFA18)', padding: '32px 24px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg, #5D7BFF, #A78BFA)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Trophy size={26} color="#fff" />
          </div>
          <p style={{ fontWeight: 900, fontSize: 16, letterSpacing: 2, textTransform: 'uppercase', color: '#fff', marginBottom: 4 }}>L'Arène</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Choisissez votre identité de débatteur</p>
        </div>

        <div style={{ padding: 24 }}>
          {/* Input */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input value={name} onChange={e => onChange(e.target.value)} placeholder="Votre pseudonyme…" maxLength={24}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 14, color: '#fff', fontSize: 14, padding: '14px 44px 14px 16px', outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
              {checking && <Loader2 size={16} color="rgba(255,255,255,0.3)" className="animate-spin" />}
              {!checking && valid && avail === true  && <Check size={16} color="#34D399" />}
              {!checking && valid && avail === false && <X    size={16} color="#F87171" />}
            </div>
          </div>

          {valid && avail === false && <p style={{ fontSize: 11, color: '#F87171', marginBottom: 12 }}>Pseudonyme déjà pris.</p>}

          {/* Preview card */}
          {valid && avail === true && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '12px 16px', marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
              <Av name={name} size={42} ring />
              <div>
                <p style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>{name}</p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>⭐ 0 pts · Nouveau débatteur</p>
              </div>
            </motion.div>
          )}

          <button onClick={submit} disabled={!valid || avail !== true || busy}
            style={{ width: '100%', background: 'linear-gradient(135deg, #5D7BFF, #7B9BFF)', border: 'none', borderRadius: 16, color: '#fff', fontWeight: 900, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', padding: '16px', cursor: 'pointer', opacity: (!valid || avail !== true || busy) ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
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
      <div style={{ padding: 2, borderRadius: '50%', background: `linear-gradient(135deg, ${c}, ${c}88)` }}>
        <Av name={name} size={48} />
      </div>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', maxWidth: 52, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
        {post.isAnonymous ? 'Anonyme' : post.authorArenaName.split(' ')[0]}
      </span>
    </button>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post, onClick, onAvatarClick }: { post: ArenaPost; onClick: () => void; onAvatarClick?: () => void }) {
  const total = post.agreeCount + post.disagreeCount + post.nuanceCount;
  const agreeP    = total > 0 ? (post.agreeCount    / total) * 100 : 0;
  const disagreeP = total > 0 ? (post.disagreeCount / total) * 100 : 0;
  const nuanceP   = 100 - agreeP - disagreeP;
  const name = post.isAnonymous ? '??' : post.authorArenaName;
  const c = avatarColor(name);
  const isFeatured = !!post.featuredDate;
  const isHot = post.commentCount >= 5;

  return (
    <motion.button onClick={onClick} whileHover={{ y: -3 }} whileTap={{ scale: 0.985 }}
      className="w-full text-left group"
      style={{ borderRadius: 24, background: '#13161E', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', display: 'block' }}>

      {/* Colored top strip */}
      <div style={{ height: 3, background: isFeatured ? 'linear-gradient(90deg,#A78BFA,#5D7BFF)' : isHot ? 'linear-gradient(90deg,#F97316,#FBBF24)' : `linear-gradient(90deg,${c}60,transparent)` }} />

      <div style={{ padding: '16px 18px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={(e) => { e.stopPropagation(); onAvatarClick?.(); }} style={{ background: 'none', border: 'none', padding: 0, cursor: onAvatarClick ? 'pointer' : 'default', lineHeight: 0 }}>
            <Av name={name} size={36} ring />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{post.isAnonymous ? 'Anonyme' : post.authorArenaName}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{timeAgo(post.createdAt)}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {isFeatured && <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', background: 'rgba(167,139,250,0.15)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 20, padding: '3px 8px' }}>⭐ Défi</span>}
            {isHot && !isFeatured && <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', background: 'rgba(249,115,22,0.15)', color: '#F97316', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 20, padding: '3px 8px' }}>🔥 Hot</span>}
          </div>
        </div>

        {/* Title */}
        <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.4, marginBottom: 6 }}>{post.title}</p>
        {post.preamble && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', lineHeight: 1.5, marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.preamble}</p>}

        {/* Persona chip */}
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase', background: 'rgba(93,123,255,0.12)', color: 'rgba(93,123,255,0.8)', border: '1px solid rgba(93,123,255,0.2)', borderRadius: 20, padding: '3px 10px', display: 'inline-block', marginBottom: 14 }}>
          {post.personaName}
        </span>

        {/* Stance bar */}
        {total > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', gap: 2, marginBottom: 8 }}>
              {agreeP    > 0 && <div style={{ width: `${agreeP}%`,    background: '#34D399', borderRadius: 99 }} />}
              {nuanceP   > 0 && <div style={{ width: `${nuanceP}%`,   background: '#FBBF24', borderRadius: 99 }} />}
              {disagreeP > 0 && <div style={{ width: `${disagreeP}%`, background: '#F87171', borderRadius: 99 }} />}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#34D399' }}>✓ {post.agreeCount}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#FBBF24' }}>~ {post.nuanceCount}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#F87171' }}>✗ {post.disagreeCount}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
            <MessageSquare size={13} />
            <span>{post.commentCount}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
            <Users size={13} />
            <span>{post.commentCount} débatteur{post.commentCount !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ marginLeft: 'auto', background: 'rgba(93,123,255,0.12)', border: '1px solid rgba(93,123,255,0.25)', borderRadius: 20, padding: '5px 14px', color: '#5D7BFF', fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' }}>
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
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', background: `${col}18`, color: col, border: `1px solid ${col}40`, borderRadius: 20, padding: '4px 10px', cursor: 'pointer' }}>
        <AlertTriangle size={11} />
        Sophisme · {alert.type}
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {open && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8, paddingLeft: 12, borderLeft: `2px solid ${col}50`, lineHeight: 1.6 }}>{alert.explanation}</p>}
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
      style={{ display: 'flex', gap: 10, paddingLeft: depth > 0 ? 44 : 0 }}>
      <Av name={comment.authorArenaName} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Bubble */}
        <div style={{ background: '#1C2030', borderRadius: 18, borderTopLeftRadius: 4, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{comment.authorArenaName}</span>
            <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', background: `rgba(${s.rgb},0.15)`, color: s.color, border: `1px solid rgba(${s.rgb},0.35)`, borderRadius: 20, padding: '2px 8px' }}>{s.short} {s.label}</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>{timeAgo(comment.createdAt)}</span>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{comment.content}</p>
          {comment.sophismAlert && <SophismBadge alert={comment.sophismAlert} />}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '6px 4px' }}>
          <button onClick={handleUp} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: up ? '#5D7BFF' : 'rgba(255,255,255,0.3)', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
            <ThumbsUp size={13} />
            {comment.upvotes > 0 ? comment.upvotes : "J'aime"}
          </button>
          {depth === 0 && (
            <button onClick={() => onReply(comment.id, comment.authorArenaName)} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
              Répondre
            </button>
          )}
          {comment.authorId !== userId && !comment.sophismAlert && (
            <button onClick={() => onCheck(comment)} disabled={checkingId === comment.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.2)', border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginLeft: 'auto', opacity: checkingId === comment.id ? 0.4 : 1 }}>
              {checkingId === comment.id ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
              Vérifier · 0.25cr
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── mdArena (même rendu que chatbot) ────────────────────────────────────────

const mdArena: Record<string, any> = {
  p: ({ children }: any) => <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, marginBottom: 10 }}>{children}</p>,
  h2: ({ children }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px', }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.15)' }} />
      <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 8px' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.15)' }} />
    </div>
  ),
  h3: ({ children }: any) => <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: '12px 0 6px' }}>{children}</p>,
  strong: ({ children }: any) => <strong style={{ fontWeight: 900, color: '#fff', background: 'rgba(255,255,255,0.12)', padding: '1px 5px', borderRadius: 3 }}>{children}</strong>,
  em: ({ children }: any) => <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.7)' }}>{children}</em>,
  ul: ({ children }: any) => <ul style={{ margin: '6px 0 10px', paddingLeft: 0, listStyle: 'none' }}>{children}</ul>,
  li: ({ children }: any) => (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
      <span style={{ width: 5, height: 5, background: 'rgba(255,255,255,0.4)', borderRadius: 1, flexShrink: 0, marginTop: 7 }} />
      <span>{children}</span>
    </li>
  ),
  blockquote: ({ children }: any) => (
    <div style={{ borderLeft: '2px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.07)', padding: '10px 14px', margin: '10px 0' }}>
      <div style={{ fontSize: 7, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>Référence</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', lineHeight: 1.6 }}>{children}</div>
    </div>
  ),
  code: ({ children }: any) => <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: 4, color: '#fff' }}>{children}</code>,
  hr: () => <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', margin: '14px 0' }} />,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#7B9BFF', textDecoration: 'underline', textUnderlineOffset: 3 }}>{children}</a>,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ArenaPage({ user, supabaseUserId, onBack }: {
  user: FBUser | null; supabaseUserId: string | null; onBack: () => void;
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#0A0C12' }}>
      <Trophy size={36} color="rgba(93,123,255,0.4)" />
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>Connectez-vous pour accéder à l'Arène.</p>
      <button onClick={onBack} style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: '#5D7BFF', background: 'none', border: 'none', cursor: 'pointer' }}>← Retour</button>
    </div>
  );

  if (loadingUser) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0C12' }}>
      <Loader2 size={24} color="rgba(93,123,255,0.4)" className="animate-spin" />
    </div>
  );

  if (firestoreError) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#0A0C12', padding: 32 }}>
      <AlertTriangle size={32} color="rgba(251,191,36,0.6)" />
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Règles Firestore non déployées</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>Firebase Console → Firestore → Règles → Publier les nouvelles règles arena_users, arena_posts.</p>
      </div>
      <button onClick={onBack} style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>← Retour</button>
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────

  // ── Profile / Settings views ────────────────────────────────────────────────
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0A0C12', overflow: 'hidden' }}>
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

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0D1018' }}>
        <button onClick={view === 'post' ? () => { setView('feed'); setSelectedPost(null); setSynthesis(null); } : onBack}
          style={{ color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
          <ArrowLeft size={18} />
        </button>

        {view === 'feed' ? (
          <>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Trophy size={15} color="#5D7BFF" />
                <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: '#fff' }}>L'Arène</span>
              </div>
              {arenaUser && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                Bienvenue, <span style={{ color: '#5D7BFF', fontWeight: 700 }}>{arenaUser.arenaName}</span>
              </p>}
            </div>
            <button onClick={() => setShowSearch(v => !v)} style={{ color: showSearch ? '#fff' : 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0 }}>
              <Search size={18} />
            </button>
            {arenaUser && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 20, padding: '5px 10px' }}>
                <Star size={12} color="#FBBF24" />
                <span style={{ fontSize: 11, fontWeight: 900, color: '#FBBF24' }}>{arenaUser.credibilityScore}</span>
              </div>
            )}
            {arenaUser && (
              <button onClick={() => setView('settings')} style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0 }}>
                <Settings size={18} />
              </button>
            )}
          </>
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPost?.title}</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{selectedPost?.commentCount} contributions</p>
          </div>
        )}
      </div>

      {/* ── FEED ─────────────────────────────────────────────────────────── */}
      {view === 'feed' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Search bar */}
          <AnimatePresence>
            {showSearch && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0D1018' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                  <Search size={14} color="rgba(255,255,255,0.3)" />
                  <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un débat…"
                    style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: 13, outline: 'none' }} />
                  {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0, color: 'rgba(255,255,255,0.3)' }}><X size={14} /></button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 8, padding: '14px 16px 10px', overflowX: 'auto' }}>
            {([
              { key: 'recent',   label: 'Récents',      icon: Clock },
              { key: 'trending', label: 'Tendance',     icon: TrendingUp },
              { key: 'featured', label: 'Défi du jour', icon: Star },
            ] as { key: typeof filter; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0, fontWeight: 900, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
                background: filter === key ? 'linear-gradient(135deg,#5D7BFF,#7B9BFF)' : 'rgba(255,255,255,0.06)',
                color: filter === key ? '#fff' : 'rgba(255,255,255,0.4)',
              }}>
                <Icon size={11} />{label}
              </button>
            ))}
          </div>

          {/* Stories strip */}
          {filtered.length > 0 && (
            <div style={{ padding: '0 16px 16px', overflowX: 'auto' }}>
              <div style={{ display: 'flex', gap: 16, paddingBottom: 4 }}>
                {filtered.slice(0, 8).map(p => <StoryDot key={p.id} post={p} onClick={() => openPost(p)} />)}
              </div>
            </div>
          )}

          {/* Posts */}
          <div style={{ padding: '0 16px 120px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loadingPosts ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                <Loader2 size={22} color="rgba(93,123,255,0.4)" className="animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(93,123,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Trophy size={28} color="rgba(93,123,255,0.3)" />
                </div>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>L'Arène est vide</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Propulsez un échange depuis le chat !</p>
              </div>
            ) : filtered.map(p => <PostCard key={p.id} post={p} onClick={() => openPost(p)} onAvatarClick={p.authorId && !p.isAnonymous ? () => { if (arenaUser) setUserModalId(p.authorId); } : undefined} />)}
          </div>
        </div>
      )}

      {/* ── POST DETAIL ───────────────────────────────────────────────────── */}
      {view === 'post' && selectedPost && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Post meta */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <Av name={selectedPost.isAnonymous ? '??' : selectedPost.authorArenaName} size={40} ring />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{selectedPost.isAnonymous ? 'Anonyme' : selectedPost.authorArenaName}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', background: 'rgba(93,123,255,0.12)', color: 'rgba(93,123,255,0.8)', border: '1px solid rgba(93,123,255,0.2)', borderRadius: 20, padding: '2px 8px' }}>{selectedPost.personaName}</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{timeAgo(selectedPost.createdAt)}</span>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.4, marginBottom: 8 }}>{selectedPost.title}</p>
            {selectedPost.preamble && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>{selectedPost.preamble}</p>}
          </div>

          {/* Q/A exchange */}
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {/* Q bubble */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.4)' }}>Q</div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 18, borderTopLeftRadius: 4, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{selectedPost.question}</p>
              </div>
            </div>

            {/* AI bubble */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#5D7BFF,#A78BFA)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <Zap size={13} color="#fff" />
              </div>
              <div style={{ flex: 1, background: 'linear-gradient(135deg, rgba(93,123,255,0.1), rgba(167,139,250,0.06))', border: '1px solid rgba(93,123,255,0.18)', borderRadius: 18, borderTopLeftRadius: 4, padding: '14px 16px' }}>
                <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(93,123,255,0.6)', marginBottom: 10 }}>Réponse IA</p>
                {(() => {
                  const LIMIT = 600;
                  const long = selectedPost.aiResponse.length > LIMIT;
                  const shown = long && !expanded ? selectedPost.aiResponse.slice(0, LIMIT) : selectedPost.aiResponse;
                  return (
                    <>
                      <div style={{ position: 'relative', overflow: long && !expanded ? 'hidden' : 'visible' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdArena}>{shown}</ReactMarkdown>
                        {long && !expanded && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, background: 'linear-gradient(to top, #0e1422, transparent)' }} />}
                      </div>
                      {long && (
                        <button onClick={() => setExpanded(v => !v)} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(93,123,255,0.7)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <BarChart3 size={13} color="rgba(255,255,255,0.3)" />
                <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Opinion · {selectedPost.commentCount} voix</span>
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', gap: 2, marginBottom: 10 }}>
                {selectedPost.agreeCount    > 0 && <div style={{ width: `${(selectedPost.agreeCount    / selectedPost.commentCount) * 100}%`, background: '#34D399', borderRadius: 99 }} />}
                {selectedPost.nuanceCount   > 0 && <div style={{ width: `${(selectedPost.nuanceCount   / selectedPost.commentCount) * 100}%`, background: '#FBBF24', borderRadius: 99 }} />}
                {selectedPost.disagreeCount > 0 && <div style={{ width: `${(selectedPost.disagreeCount / selectedPost.commentCount) * 100}%`, background: '#F87171', borderRadius: 99 }} />}
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#34D399' }}>✓ {selectedPost.agreeCount} pour</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#FBBF24' }}>~ {selectedPost.nuanceCount} nuances</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#F87171' }}>✗ {selectedPost.disagreeCount} contre</span>
              </div>
            </div>
          )}

          {/* AI tools */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={doSynthesis} disabled={synthLoading || comments.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', background: 'rgba(93,123,255,0.1)', border: '1px solid rgba(93,123,255,0.25)', borderRadius: 99, padding: '7px 14px', color: '#7B9BFF', cursor: 'pointer', opacity: (synthLoading || comments.length === 0) ? 0.3 : 1 }}>
              {synthLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Synthèse · 0.25cr
            </button>
            <button onClick={() => { setShowFc(v => !v); setFcResult(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 99, padding: '7px 14px', color: '#FBBF24', cursor: 'pointer' }}>
              <FileSearch size={12} />
              Fact-check · 0.25cr
            </button>
          </div>

          <AnimatePresence>
            {showFc && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
                  <input autoFocus value={fcClaim} onChange={e => setFcClaim(e.target.value)} placeholder="Entrez l'affirmation à vérifier…"
                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 14, color: '#fff', fontSize: 12, padding: '10px 14px', outline: 'none' }} />
                  <button onClick={doFactCheck} disabled={!fcClaim.trim() || fcLoading}
                    style={{ background: '#FBBF24', border: 'none', borderRadius: 12, padding: '0 14px', cursor: 'pointer', opacity: (!fcClaim.trim() || fcLoading) ? 0.4 : 1, lineHeight: 0 }}>
                    {fcLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {synthesis && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                style={{ margin: '12px 16px', background: 'rgba(93,123,255,0.08)', border: '1px solid rgba(93,123,255,0.2)', borderRadius: 20, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Sparkles size={14} color="#5D7BFF" />
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: '#5D7BFF', flex: 1 }}>Synthèse de l'Arène</span>
                  <button onClick={() => setSynthesis(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', lineHeight: 0 }}><X size={14} /></button>
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdArena}>{synthesis}</ReactMarkdown>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {fcResult && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                style={{ margin: '12px 16px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 20, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <FileSearch size={14} color="#FBBF24" />
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: '#FBBF24', flex: 1 }}>Fact-check</span>
                  <button onClick={() => setFcResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', lineHeight: 0 }}><X size={14} /></button>
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdArena}>{fcResult}</ReactMarkdown>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Comments */}
          <div style={{ padding: '16px 16px 160px' }}>
            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>
              {selectedPost.commentCount} contribution{selectedPost.commentCount !== 1 ? 's' : ''}
            </p>
            {loadingComments ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                <Loader2 size={20} color="rgba(93,123,255,0.4)" className="animate-spin" />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {roots.map(c => (
                  <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
          <div style={{ position: 'sticky', bottom: 0, background: '#0D1018', borderTop: '1px solid rgba(255,255,255,0.06)', padding: 16 }}>
            {replyTo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                <span>↩ Réponse à <strong style={{ color: 'rgba(255,255,255,0.6)' }}>{replyTo.name}</strong></span>
                <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', color: 'rgba(255,255,255,0.3)', lineHeight: 0 }}><X size={12} /></button>
              </div>
            )}

            {/* Stance pills */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(['agree', 'disagree', 'nuance'] as Stance[]).map(s => {
                const cfg = STANCE[s]; const active = stance === s;
                return (
                  <button key={s} onClick={() => setStance(s)} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 12, border: `2px solid ${active ? cfg.color : 'rgba(255,255,255,0.08)'}`,
                    background: active ? `rgba(${cfg.rgb},0.15)` : 'transparent',
                    color: active ? cfg.color : 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 900, letterSpacing: 1,
                    textTransform: 'uppercase', cursor: 'pointer',
                  }}>
                    {cfg.short} {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Input + send */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              {arenaUser && <Av name={arenaUser.arenaName} size={32} />}
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                <textarea ref={boxRef} value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(); }}
                  placeholder="Votre argument… (Ctrl+↵)"
                  rows={2} style={{ width: '100%', background: 'none', border: 'none', color: '#fff', fontSize: 12, padding: '12px 14px', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 10px 8px' }}>
                  <button onClick={submitComment} disabled={!text.trim() || posting}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#5D7BFF,#7B9BFF)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', padding: '7px 14px', cursor: 'pointer', opacity: (!text.trim() || posting) ? 0.3 : 1 }}>
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
