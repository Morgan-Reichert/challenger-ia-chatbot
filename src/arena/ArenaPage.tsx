import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Trophy, Flame, Star, Clock, MessageSquare,
  ThumbsUp, AlertTriangle, Loader2, Send, Check, X, Shield,
  Search, Sparkles, FileSearch, ChevronDown, ChevronUp,
  Zap, Users, TrendingUp, Crown, BarChart3,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cx = (...cls: (string | false | null | undefined)[]) => cls.filter(Boolean).join(' ');

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = ['#5D7BFF', '#34D399', '#F87171', '#FBBF24', '#A78BFA', '#F97316', '#38BDF8'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const STANCE_CONFIG = {
  agree:    { label: 'D\'accord',    emoji: '✓', color: '#34D399', bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.4)' },
  disagree: { label: 'Pas d\'accord', emoji: '✗', color: '#F87171', bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.4)' },
  nuance:   { label: 'Nuance',       emoji: '~', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.4)' },
} as const;

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'sm' }: { name: string; size?: 'xs' | 'sm' | 'md' }) {
  const color = getAvatarColor(name);
  const sz = size === 'xs' ? 'w-5 h-5 text-[7px]' : size === 'sm' ? 'w-7 h-7 text-[9px]' : 'w-9 h-9 text-[11px]';
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-black flex-shrink-0`}
      style={{ background: `${color}30`, border: `1.5px solid ${color}60`, color }}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Pseudo Creation Modal ────────────────────────────────────────────────────

function ArenaPseudoModal({ onCreated, userId }: { onCreated: (u: ArenaUser) => void; userId: string }) {
  const [name, setName] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (v: string) => {
    setName(v); setAvailable(null);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < 3) return;
    setChecking(true);
    timer.current = setTimeout(async () => {
      setAvailable(await checkArenaNameAvailable(v.trim()));
      setChecking(false);
    }, 600);
  };

  const valid = name.length >= 3 && name.length <= 24 && /^[a-zA-Z0-9_\-\.éèêëàâùûüîï ]+$/.test(name);

  const handleSubmit = async () => {
    if (!valid || !available || submitting) return;
    setSubmitting(true);
    await createArenaUser(userId, name.trim());
    onCreated({ arenaName: name.trim(), credibilityScore: 0, totalComments: 0, badges: [], createdAt: new Date().toISOString() });
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="w-full max-w-sm bg-[#0D0F14] border border-[#5D7BFF]/30 rounded-2xl overflow-hidden"
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        {/* Header */}
        <div className="bg-gradient-to-br from-[#5D7BFF]/20 to-[#A78BFA]/10 px-6 pt-8 pb-6 text-center border-b border-white/8">
          <div className="w-14 h-14 bg-[#5D7BFF] rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-base font-black uppercase tracking-widest text-white">Rejoindre l'Arène</h2>
          <p className="text-[10px] text-white/40 mt-1">Choisissez votre identité de débatteur</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="relative">
            <input
              type="text" value={name} onChange={e => handleChange(e.target.value)}
              placeholder="Votre pseudonyme…" maxLength={24}
              className="w-full bg-white/5 border border-white/12 rounded-xl text-white text-sm px-4 py-3 pr-10 focus:outline-none focus:border-[#5D7BFF]/60 placeholder:text-white/20"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {checking && <Loader2 className="w-4 h-4 animate-spin text-white/30" />}
              {!checking && valid && available === true && <Check className="w-4 h-4 text-[#34D399]" />}
              {!checking && valid && available === false && <X className="w-4 h-4 text-[#F87171]" />}
            </div>
          </div>

          {valid && available === false && <p className="text-[10px] text-[#F87171]">Pseudonyme déjà pris.</p>}
          {name.length > 0 && !valid && <p className="text-[10px] text-white/30">3–24 caractères, lettres et chiffres.</p>}

          {valid && available === true && (
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
              <Avatar name={name} size="md" />
              <div>
                <p className="text-sm font-bold text-white">{name}</p>
                <p className="text-[9px] text-white/40">⭐ 0 pts · 0 contributions</p>
              </div>
            </div>
          )}

          <button onClick={handleSubmit} disabled={!valid || available !== true || submitting}
            className="w-full bg-[#5D7BFF] disabled:opacity-30 text-white text-[11px] font-black uppercase tracking-widest py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-[#4a69ff]">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            {submitting ? 'Création…' : 'Entrer dans l\'Arène'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Post Card (feed) ─────────────────────────────────────────────────────────

function PostCard({ post, onClick }: { post: ArenaPost; onClick: () => void }) {
  const total = post.agreeCount + post.disagreeCount + post.nuanceCount;
  const agreeW  = total > 0 ? (post.agreeCount    / total) * 100 : 0;
  const disagreeW = total > 0 ? (post.disagreeCount / total) * 100 : 0;
  const nuanceW = 100 - agreeW - disagreeW;
  const isHot = post.commentCount >= 5;
  const isFeatured = !!post.featuredDate;

  return (
    <motion.button onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }}
      className="w-full text-left bg-[#13161E] border border-white/6 rounded-2xl overflow-hidden hover:border-[#5D7BFF]/30 transition-all group">
      {/* Top accent bar */}
      <div className="h-0.5 w-full" style={{
        background: isFeatured
          ? 'linear-gradient(90deg, #A78BFA, #5D7BFF)'
          : isHot
            ? 'linear-gradient(90deg, #F97316, #FBBF24)'
            : 'linear-gradient(90deg, #5D7BFF40, transparent)',
      }} />

      <div className="p-4">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-2.5">
          {isFeatured && (
            <span className="inline-flex items-center gap-1 text-[7px] font-black uppercase tracking-widest bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/30 px-2 py-0.5 rounded-full">
              <Star className="w-2.5 h-2.5" /> Défi du jour
            </span>
          )}
          {isHot && !isFeatured && (
            <span className="inline-flex items-center gap-1 text-[7px] font-black uppercase tracking-widest bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/30 px-2 py-0.5 rounded-full">
              <Flame className="w-2.5 h-2.5" /> En feu
            </span>
          )}
          <span className="text-[8px] text-white/25 ml-auto">{timeAgo(post.createdAt)}</span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-white leading-snug mb-1.5 group-hover:text-[#5D7BFF] transition-colors">
          {post.title}
        </h3>
        {post.preamble && (
          <p className="text-[10px] text-white/40 leading-relaxed line-clamp-2 mb-3">{post.preamble}</p>
        )}

        {/* Persona tag */}
        <span className="text-[8px] font-black uppercase tracking-widest text-[#5D7BFF]/60 border border-[#5D7BFF]/15 px-2 py-0.5 rounded-full">
          {post.personaName}
        </span>

        {/* Stance bar */}
        {total > 0 && (
          <div className="mt-3 mb-2">
            <div className="flex h-1.5 overflow-hidden rounded-full gap-0.5">
              {agreeW > 0    && <div className="h-full bg-[#34D399] rounded-full transition-all" style={{ width: `${agreeW}%` }} />}
              {nuanceW > 0   && <div className="h-full bg-[#FBBF24] rounded-full transition-all" style={{ width: `${nuanceW}%` }} />}
              {disagreeW > 0 && <div className="h-full bg-[#F87171] rounded-full transition-all" style={{ width: `${disagreeW}%` }} />}
            </div>
            <div className="flex gap-3 mt-1.5">
              <span className="text-[8px] text-[#34D399]/80">✓ {post.agreeCount}</span>
              <span className="text-[8px] text-[#FBBF24]/80">~ {post.nuanceCount}</span>
              <span className="text-[8px] text-[#F87171]/80">✗ {post.disagreeCount}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
          <Avatar name={post.isAnonymous ? '??' : post.authorArenaName} size="xs" />
          <span className="text-[9px] text-white/40 flex-1 truncate">
            {post.isAnonymous ? 'Anonyme' : post.authorArenaName}
          </span>
          <div className="flex items-center gap-1 text-[9px] text-white/30">
            <Users className="w-3 h-3" />
            <span>{post.commentCount} débatteur{post.commentCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Sophism Badge ────────────────────────────────────────────────────────────

function SophismBadge({ alert }: { alert: SophismAlert }) {
  const [open, setOpen] = useState(false);
  if (!alert.detected) return null;
  const color = alert.severity === 'high' ? '#F87171' : alert.severity === 'medium' ? '#FBBF24' : '#94A3B8';
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full border transition-all"
        style={{ color, borderColor: `${color}40`, background: `${color}10` }}>
        <AlertTriangle className="w-2.5 h-2.5" />
        Sophisme détecté · {alert.type}
        {open ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
      </button>
      {open && <p className="text-[10px] text-white/50 mt-1.5 pl-3 border-l-2 border-[#FBBF24]/30 leading-relaxed">{alert.explanation}</p>}
    </div>
  );
}

// ─── Comment Item ─────────────────────────────────────────────────────────────

function CommentItem({
  comment, userId, postId, depth, onReply, onUpdated, onCheckSophism, checkingId,
}: {
  comment: ArenaComment; userId: string; postId: string; depth: number;
  onReply: (id: string, name: string) => void;
  onUpdated: (c: ArenaComment) => void;
  onCheckSophism: (c: ArenaComment) => void;
  checkingId: string | null;
}) {
  const cfg = STANCE_CONFIG[comment.stance];
  const isUpvoted = comment.upvotedBy.includes(userId);
  const isAuthor = comment.authorId === userId;
  const isChecking = checkingId === comment.id;
  const avatarColor = getAvatarColor(comment.authorArenaName);

  const handleUpvote = async () => {
    await upvoteComment(postId, comment.id, comment.authorId, userId, isUpvoted);
    onUpdated({
      ...comment,
      upvotes: comment.upvotes + (isUpvoted ? -1 : 1),
      upvotedBy: isUpvoted ? comment.upvotedBy.filter(id => id !== userId) : [...comment.upvotedBy, userId],
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={cx('flex gap-3', depth > 0 && 'ml-8 pl-3 border-l-2 border-white/5')}>
      <Avatar name={comment.authorArenaName} size="sm" />

      <div className="flex-1 min-w-0">
        {/* Card */}
        <div className="bg-[#13161E] border border-white/6 rounded-2xl rounded-tl-sm p-3.5">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-black text-white">{comment.authorArenaName}</span>
            <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
              style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
              {cfg.emoji} {cfg.label}
            </span>
            <span className="text-[8px] text-white/25 ml-auto">{timeAgo(comment.createdAt)}</span>
          </div>

          <p className="text-[12px] text-white/75 leading-relaxed">{comment.content}</p>
          {comment.sophismAlert && <SophismBadge alert={comment.sophismAlert} />}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 mt-1.5 px-1">
          <button onClick={handleUpvote}
            className={cx('flex items-center gap-1.5 text-[9px] font-bold transition-all',
              isUpvoted ? 'text-[#5D7BFF]' : 'text-white/25 hover:text-white/60')}>
            <ThumbsUp className="w-3 h-3" />
            {comment.upvotes > 0 ? comment.upvotes : 'J\'aime'}
          </button>

          {depth === 0 && (
            <button onClick={() => onReply(comment.id, comment.authorArenaName)}
              className="text-[9px] font-bold text-white/25 hover:text-[#5D7BFF] transition-colors">
              Répondre
            </button>
          )}

          {!isAuthor && !comment.sophismAlert && (
            <button onClick={() => onCheckSophism(comment)} disabled={isChecking}
              className="flex items-center gap-1 text-[9px] font-bold text-white/20 hover:text-[#FBBF24] transition-colors ml-auto disabled:opacity-40">
              {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
              Vérifier · 0.25cr
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── MD components (même style que le chatbot) ───────────────────────────────

const mdArena = {
  p: ({ children }: any) => <p className="text-sm text-white leading-relaxed mb-3 last:mb-0">{children}</p>,
  h2: ({ children }: any) => (
    <div className="flex items-center gap-2 mt-4 mb-2 first:mt-0">
      <div className="h-px flex-1 bg-white/20" />
      <p className="text-[8px] font-black uppercase tracking-widest text-white/50 px-2 py-0.5 border border-white/20">{children}</p>
      <div className="h-px flex-1 bg-white/20" />
    </div>
  ),
  h3: ({ children }: any) => <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mt-3 mb-1.5">{children}</p>,
  strong: ({ children }: any) => <strong className="font-black text-white bg-white/15 px-1 rounded-sm">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-white/80">{children}</em>,
  ul: ({ children }: any) => <ul className="space-y-1.5 mb-3 mt-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="space-y-1.5 mb-3 mt-1">{children}</ol>,
  li: ({ children }: any) => (
    <li className="flex items-start gap-2.5 text-sm text-white leading-relaxed">
      <span className="w-1.5 h-1.5 bg-white/50 flex-shrink-0 mt-1.5" />
      <span>{children}</span>
    </li>
  ),
  blockquote: ({ children }: any) => (
    <div className="my-3 border-l-2 border-white/50 bg-white/10 pl-3 pr-3 py-2.5">
      <div className="text-[7px] font-black uppercase tracking-widest text-white/40 mb-1.5">Référence</div>
      <div className="text-xs text-white/75 italic leading-relaxed">{children}</div>
    </div>
  ),
  code: ({ children }: any) => <code className="font-mono text-xs bg-white/20 border border-white/20 px-1.5 py-0.5 text-white rounded-sm">{children}</code>,
  table: ({ children }: any) => <div className="overflow-x-auto my-3"><table className="w-full text-xs border-collapse">{children}</table></div>,
  thead: ({ children }: any) => <thead className="border-b-2 border-white/30">{children}</thead>,
  tbody: ({ children }: any) => <tbody className="divide-y divide-white/10">{children}</tbody>,
  tr: ({ children }: any) => <tr className="hover:bg-white/5">{children}</tr>,
  th: ({ children }: any) => <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-white/60 whitespace-nowrap">{children}</th>,
  td: ({ children }: any) => <td className="px-3 py-2 text-[11px] text-white/80 leading-relaxed align-top">{children}</td>,
  hr: () => <div className="border-t border-white/20 my-4" />,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-white underline decoration-white/40 hover:decoration-white font-medium transition-all">{children}</a>,
};

// ─── Main Arena Page ──────────────────────────────────────────────────────────

export default function ArenaPage({
  user, supabaseUserId, onBack,
}: {
  user: FBUser | null; supabaseUserId: string | null; onBack: () => void;
}) {
  const [arenaUser, setArenaUser] = useState<ArenaUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [firestoreError, setFirestoreError] = useState(false);
  const [showPseudoModal, setShowPseudoModal] = useState(false);

  const [view, setView] = useState<'feed' | 'post'>('feed');
  const [filter, setFilter] = useState<'recent' | 'trending' | 'featured'>('recent');
  const [posts, setPosts] = useState<ArenaPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const [selectedPost, setSelectedPost] = useState<ArenaPost | null>(null);
  const [comments, setComments] = useState<ArenaComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [aiResponseExpanded, setAiResponseExpanded] = useState(false);

  const [newComment, setNewComment] = useState('');
  const [newStance, setNewStance] = useState<Stance>('agree');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);

  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [loadingSynthesis, setLoadingSynthesis] = useState(false);
  const [factCheckClaim, setFactCheckClaim] = useState('');
  const [factCheckResult, setFactCheckResult] = useState<string | null>(null);
  const [loadingFactCheck, setLoadingFactCheck] = useState(false);
  const [showFactCheckInput, setShowFactCheckInput] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const commentBoxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) { setLoadingUser(false); return; }
    getArenaUser(user.uid)
      .then(au => { setArenaUser(au); setLoadingUser(false); if (!au) setShowPseudoModal(true); })
      .catch(() => { setFirestoreError(true); setLoadingUser(false); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoadingPosts(true);
    getArenaPosts(filter).then(p => setPosts(p)).catch(() => {}).finally(() => setLoadingPosts(false));
  }, [filter, user]);

  const openPost = async (post: ArenaPost) => {
    setSelectedPost(post); setView('post');
    setSynthesis(null); setFactCheckResult(null); setShowFactCheckInput(false); setAiResponseExpanded(false);
    setLoadingComments(true);
    const c = await getArenaComments(post.id);
    setComments(c); setLoadingComments(false);
  };

  const submitComment = async () => {
    if (!newComment.trim() || !selectedPost || !user || !arenaUser || submittingComment) return;
    setSubmittingComment(true);
    await addArenaComment(selectedPost.id, {
      authorId: user.uid, authorArenaName: arenaUser.arenaName,
      stance: newStance, content: newComment.trim(),
      parentCommentId: replyTo?.id ?? null, createdAt: new Date().toISOString(),
    });
    const [newComments, refreshed] = await Promise.all([getArenaComments(selectedPost.id), getArenaPost(selectedPost.id)]);
    setComments(newComments);
    if (refreshed) setSelectedPost(refreshed);
    setNewComment(''); setReplyTo(null); setSubmittingComment(false);
    setArenaUser(a => a ? { ...a, totalComments: a.totalComments + 1 } : a);
  };

  const checkSophism = async (comment: ArenaComment) => {
    if (!selectedPost || !supabaseUserId) return;
    if (!await deductOneCredit(supabaseUserId)) { alert('Crédits insuffisants.'); return; }
    setCheckingId(comment.id);
    try {
      const res = await fetch('/api/arena', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sophism', content: comment.content, context: selectedPost.title }) });
      const data: SophismAlert = await res.json();
      await saveSophismAlert(selectedPost.id, comment.id, comment.authorId, data);
      setComments(cs => cs.map(c => c.id === comment.id ? { ...c, sophismAlert: data } : c));
    } finally { setCheckingId(null); }
  };

  const requestSynthesis = async () => {
    if (!selectedPost || !supabaseUserId || loadingSynthesis) return;
    if (!await deductOneCredit(supabaseUserId)) { alert('Crédits insuffisants.'); return; }
    setLoadingSynthesis(true);
    try {
      const res = await fetch('/api/arena', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'synthesis', title: selectedPost.title, preamble: selectedPost.preamble, comments: comments.map(c => ({ stance: c.stance, content: c.content })) }) });
      setSynthesis((await res.json()).result ?? '');
    } finally { setLoadingSynthesis(false); }
  };

  const requestFactCheck = async () => {
    if (!factCheckClaim.trim() || !selectedPost || !supabaseUserId || loadingFactCheck) return;
    if (!await deductOneCredit(supabaseUserId)) { alert('Crédits insuffisants.'); return; }
    setLoadingFactCheck(true);
    try {
      const res = await fetch('/api/arena', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'factcheck', claim: factCheckClaim, context: selectedPost.title }) });
      setFactCheckResult((await res.json()).result ?? '');
      setShowFactCheckInput(false); setFactCheckClaim('');
    } finally { setLoadingFactCheck(false); }
  };

  const rootComments = comments.filter(c => !c.parentCommentId);
  const getReplies = (id: string) => comments.filter(c => c.parentCommentId === id);
  const filteredPosts = searchQuery.trim()
    ? posts.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()) || p.preamble?.toLowerCase().includes(searchQuery.toLowerCase()))
    : posts;

  // ── Not logged in ──
  if (!user) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8 bg-[#0A0C12]">
      <Trophy className="w-10 h-10 text-[#5D7BFF]/40" />
      <p className="text-sm text-white/40 text-center">Connectez-vous pour accéder à l'Arène.</p>
      <button onClick={onBack} className="text-[10px] font-black uppercase tracking-widest text-[#5D7BFF]">← Retour</button>
    </div>
  );

  if (loadingUser) return (
    <div className="h-full flex items-center justify-center bg-[#0A0C12]">
      <Loader2 className="w-6 h-6 animate-spin text-[#5D7BFF]/40" />
    </div>
  );

  if (firestoreError) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8 bg-[#0A0C12]">
      <AlertTriangle className="w-8 h-8 text-[#FBBF24]/60" />
      <div className="text-center">
        <p className="text-sm font-bold text-white mb-1">Règles Firestore non déployées</p>
        <p className="text-[10px] text-white/40 max-w-xs leading-relaxed">
          Firebase Console → Firestore → Règles → Publier les nouvelles règles.
        </p>
      </div>
      <button onClick={onBack} className="text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors">← Retour</button>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="h-full flex flex-col bg-[#0A0C12] overflow-hidden">
      {showPseudoModal && (
        <ArenaPseudoModal userId={user.uid} onCreated={au => { setArenaUser(au); setShowPseudoModal(false); }} />
      )}

      {/* ── Hero Header ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 relative overflow-hidden bg-gradient-to-br from-[#0D0F18] via-[#111520] to-[#0A0C12] border-b border-white/5">
        {/* BG glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-20 bg-[#5D7BFF]/8 blur-3xl pointer-events-none" />

        <div className="relative px-4 pt-4 pb-3">
          {/* Top row */}
          <div className="flex items-center gap-3 mb-3">
            <button onClick={view === 'post' ? () => { setView('feed'); setSelectedPost(null); setSynthesis(null); } : onBack}
              className="text-white/30 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Trophy className="w-4 h-4 text-[#5D7BFF]" />
              <span className="text-[13px] font-black uppercase tracking-widest text-white">L'Arène</span>
              {view === 'post' && selectedPost && (
                <span className="text-[9px] text-white/30 truncate ml-1">· {selectedPost.title}</span>
              )}
            </div>

            {view === 'feed' && (
              <button onClick={() => setShowSearch(v => !v)}
                className={cx('text-white/30 hover:text-white transition-colors', showSearch && 'text-white')}>
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* User profile strip */}
          {arenaUser && view === 'feed' && (
            <div className="flex items-center gap-2.5 bg-white/4 rounded-xl px-3 py-2 border border-white/5">
              <Avatar name={arenaUser.arenaName} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white truncate">{arenaUser.arenaName}</p>
                <p className="text-[8px] text-white/30">{arenaUser.totalComments} contributions</p>
              </div>
              <div className="flex items-center gap-1 bg-[#FBBF24]/10 border border-[#FBBF24]/20 px-2 py-1 rounded-full">
                <Star className="w-3 h-3 text-[#FBBF24]" />
                <span className="text-[9px] font-black text-[#FBBF24]">{arenaUser.credibilityScore}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Feed ─────────────────────────────────────────────────────────── */}
      {view === 'feed' && (
        <div className="flex-1 overflow-y-auto">
          {/* Search */}
          <AnimatePresence>
            {showSearch && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-white/5 bg-[#0D0F18]">
                <div className="px-4 py-3 flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-white/30" />
                  <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Rechercher un débat…"
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none" />
                  {searchQuery && <button onClick={() => setSearchQuery('')}><X className="w-3.5 h-3.5 text-white/30" /></button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter tabs */}
          <div className="flex gap-2 px-4 py-3 border-b border-white/5 bg-[#0D0F18]">
            {([
              { key: 'recent',   label: 'Récents',      icon: Clock },
              { key: 'trending', label: 'Tendance',     icon: TrendingUp },
              { key: 'featured', label: 'Défi du jour', icon: Star },
            ] as { key: typeof filter; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setFilter(key)}
                className={cx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all',
                  filter === key
                    ? 'bg-[#5D7BFF] text-white'
                    : 'bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/70'
                )}>
                <Icon className="w-2.5 h-2.5" />{label}
              </button>
            ))}
          </div>

          {/* Posts */}
          <div className="p-4 space-y-3">
            {loadingPosts ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-[#5D7BFF]/40" />
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-[#5D7BFF]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-7 h-7 text-[#5D7BFF]/30" />
                </div>
                <p className="text-sm font-bold text-white/30 mb-1">
                  {filter === 'featured' ? 'Aucun défi aujourd\'hui' : 'L\'Arène est vide'}
                </p>
                <p className="text-[10px] text-white/20">
                  Propulsez un échange depuis le chat pour lancer le premier débat !
                </p>
              </div>
            ) : (
              filteredPosts.map(post => <PostCard key={post.id} post={post} onClick={() => openPost(post)} />)
            )}
          </div>
        </div>
      )}

      {/* ── Post Detail ───────────────────────────────────────────────────── */}
      {view === 'post' && selectedPost && (
        <div className="flex-1 overflow-y-auto">

          {/* Post meta */}
          <div className="px-4 pt-4 pb-3 border-b border-white/5">
            <div className="flex items-center gap-2 mb-2">
              {selectedPost.featuredDate && (
                <span className="text-[7px] font-black uppercase tracking-widest bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Star className="w-2.5 h-2.5" /> Défi du jour
                </span>
              )}
              <span className="text-[8px] font-black uppercase tracking-widest text-[#5D7BFF]/60 border border-[#5D7BFF]/15 px-2 py-0.5 rounded-full">
                {selectedPost.personaName}
              </span>
              <span className="text-[8px] text-white/25 ml-auto">{timeAgo(selectedPost.createdAt)}</span>
            </div>

            <h2 className="text-base font-bold text-white leading-snug mb-2">{selectedPost.title}</h2>
            {selectedPost.preamble && <p className="text-[11px] text-white/40 leading-relaxed mb-2">{selectedPost.preamble}</p>}

            <div className="flex items-center gap-2">
              <Avatar name={selectedPost.isAnonymous ? '??' : selectedPost.authorArenaName} size="xs" />
              <span className="text-[9px] text-white/30">{selectedPost.isAnonymous ? 'Anonyme' : selectedPost.authorArenaName}</span>
            </div>
          </div>

          {/* Q/A block */}
          <div className="p-4 space-y-2 border-b border-white/5">
            {/* Question */}
            <div className="flex gap-2.5">
              <div className="w-6 h-6 rounded-full bg-white/8 border border-white/12 flex items-center justify-center flex-shrink-0 mt-0.5 text-[8px] font-black text-white/40">Q</div>
              <div className="flex-1 bg-white/4 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-[11px] text-white/70 leading-relaxed">{selectedPost.question}</p>
              </div>
            </div>

            {/* AI Response */}
            <div className="flex gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#5D7BFF] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Zap className="w-3 h-3 text-white" />
              </div>
              <div className="flex-1 bg-gradient-to-br from-[#5D7BFF]/12 to-[#5D7BFF]/5 border border-[#5D7BFF]/20 rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-[7px] font-black uppercase tracking-widest text-[#5D7BFF]/60 mb-2">Réponse IA</p>
                {(() => {
                  const THRESHOLD = 600;
                  const isLong = selectedPost.aiResponse.length > THRESHOLD;
                  const displayed = isLong && !aiResponseExpanded ? selectedPost.aiResponse.slice(0, THRESHOLD) : selectedPost.aiResponse;
                  return (
                    <>
                      <div className={cx('relative', isLong && !aiResponseExpanded && 'overflow-hidden')}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdArena}>{displayed}</ReactMarkdown>
                        {isLong && !aiResponseExpanded && (
                          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0e1220] to-transparent" />
                        )}
                      </div>
                      {isLong && (
                        <button onClick={() => setAiResponseExpanded(v => !v)}
                          className="mt-2 text-[8px] font-black uppercase tracking-widest text-[#5D7BFF]/70 hover:text-[#5D7BFF] flex items-center gap-1 transition-colors">
                          {aiResponseExpanded ? <><ChevronUp className="w-2.5 h-2.5" /> Condenser</> : <><ChevronDown className="w-2.5 h-2.5" /> Voir tout</>}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Opinion bar */}
          {selectedPost.commentCount > 0 && (
            <div className="px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-3 h-3 text-white/30" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
                  Opinion · {selectedPost.commentCount} voix
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full gap-0.5">
                {selectedPost.agreeCount > 0 && <div className="h-full bg-[#34D399] rounded-full" style={{ width: `${(selectedPost.agreeCount / selectedPost.commentCount) * 100}%` }} />}
                {selectedPost.nuanceCount > 0 && <div className="h-full bg-[#FBBF24] rounded-full" style={{ width: `${(selectedPost.nuanceCount / selectedPost.commentCount) * 100}%` }} />}
                {selectedPost.disagreeCount > 0 && <div className="h-full bg-[#F87171] rounded-full" style={{ width: `${(selectedPost.disagreeCount / selectedPost.commentCount) * 100}%` }} />}
              </div>
              <div className="flex gap-4 mt-2">
                <span className="text-[9px] font-bold text-[#34D399]">✓ {selectedPost.agreeCount} pour</span>
                <span className="text-[9px] font-bold text-[#FBBF24]">~ {selectedPost.nuanceCount} nuances</span>
                <span className="text-[9px] font-bold text-[#F87171]">✗ {selectedPost.disagreeCount} contre</span>
              </div>
            </div>
          )}

          {/* AI Tools */}
          <div className="px-4 py-3 border-b border-white/5 flex flex-wrap gap-2">
            <button onClick={requestSynthesis} disabled={loadingSynthesis || comments.length === 0}
              className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-[#5D7BFF]/25 text-[#5D7BFF]/80 hover:bg-[#5D7BFF]/10 disabled:opacity-30 transition-all">
              {loadingSynthesis ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Synthèse · 0.25cr
            </button>
            <button onClick={() => { setShowFactCheckInput(v => !v); setFactCheckResult(null); }}
              className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-[#FBBF24]/25 text-[#FBBF24]/80 hover:bg-[#FBBF24]/10 transition-all">
              <FileSearch className="w-3 h-3" />
              Fact-check · 0.25cr
            </button>
          </div>

          <AnimatePresence>
            {showFactCheckInput && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-white/5 px-4 py-3">
                <div className="flex gap-2">
                  <input autoFocus value={factCheckClaim} onChange={e => setFactCheckClaim(e.target.value)}
                    placeholder="Entrez l'affirmation à vérifier…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl text-[11px] text-white px-3 py-2 focus:outline-none focus:border-[#FBBF24]/40 placeholder:text-white/20" />
                  <button onClick={requestFactCheck} disabled={!factCheckClaim.trim() || loadingFactCheck}
                    className="bg-[#FBBF24] text-[#141414] px-3 rounded-xl disabled:opacity-40">
                    {loadingFactCheck ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Synthesis result */}
          <AnimatePresence>
            {synthesis && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="mx-4 my-3 bg-[#5D7BFF]/8 border border-[#5D7BFF]/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-[#5D7BFF]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#5D7BFF]">Synthèse de l'Arène</span>
                  <button onClick={() => setSynthesis(null)} className="ml-auto text-white/30 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                </div>
                <div className="text-[11px] text-white/80 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{synthesis}</ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {factCheckResult && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="mx-4 my-3 bg-[#FBBF24]/8 border border-[#FBBF24]/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileSearch className="w-3.5 h-3.5 text-[#FBBF24]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#FBBF24]">Fact-check</span>
                  <button onClick={() => setFactCheckResult(null)} className="ml-auto text-white/30 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                </div>
                <div className="text-[11px] text-white/80 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{factCheckResult}</ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Comments list */}
          <div className="px-4 pt-3 pb-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-4">
              {selectedPost.commentCount} contribution{selectedPost.commentCount !== 1 ? 's' : ''}
            </p>

            {loadingComments ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#5D7BFF]/40" /></div>
            ) : (
              <div className="space-y-4">
                {rootComments.map(c => (
                  <div key={c.id} className="space-y-3">
                    <CommentItem comment={c} userId={user.uid} postId={selectedPost.id} depth={0}
                      onReply={(id, name) => { setReplyTo({ id, name }); commentBoxRef.current?.focus(); }}
                      onUpdated={u => setComments(cs => cs.map(x => x.id === u.id ? u : x))}
                      onCheckSophism={checkSophism} checkingId={checkingId} />
                    {getReplies(c.id).map(reply => (
                      <CommentItem key={reply.id} comment={reply} userId={user.uid} postId={selectedPost.id} depth={1}
                        onReply={() => {}}
                        onUpdated={u => setComments(cs => cs.map(x => x.id === u.id ? u : x))}
                        onCheckSophism={checkSophism} checkingId={checkingId} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comment form */}
          <div className="sticky bottom-0 bg-[#0A0C12] border-t border-white/5 p-4">
            {replyTo && (
              <div className="flex items-center gap-2 mb-2 text-[9px] text-white/30">
                <span>↩ Réponse à <strong className="text-white/50">{replyTo.name}</strong></span>
                <button onClick={() => setReplyTo(null)} className="ml-auto hover:text-white"><X className="w-3 h-3" /></button>
              </div>
            )}

            {/* Stance selector */}
            <div className="flex gap-1.5 mb-3">
              {(['agree', 'disagree', 'nuance'] as Stance[]).map(s => {
                const cfg = STANCE_CONFIG[s];
                const active = newStance === s;
                return (
                  <button key={s} onClick={() => setNewStance(s)}
                    className="flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded-xl border-2 transition-all"
                    style={active
                      ? { background: cfg.bg, borderColor: cfg.color, color: cfg.color }
                      : { borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.25)' }}>
                    {cfg.emoji} {cfg.label}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 items-end">
              {arenaUser && <Avatar name={arenaUser.arenaName} size="sm" />}
              <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm overflow-hidden focus-within:border-[#5D7BFF]/40 transition-all">
                <textarea ref={commentBoxRef} value={newComment} onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(); }}
                  placeholder="Votre argument… (Ctrl+↵)"
                  rows={2}
                  className="w-full bg-transparent text-[11px] text-white placeholder:text-white/20 px-4 py-3 resize-none focus:outline-none" />
                <div className="flex items-center justify-end px-3 pb-2">
                  <button onClick={submitComment} disabled={!newComment.trim() || submittingComment}
                    className="bg-[#5D7BFF] disabled:opacity-30 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all hover:bg-[#4a69ff]">
                    {submittingComment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
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
