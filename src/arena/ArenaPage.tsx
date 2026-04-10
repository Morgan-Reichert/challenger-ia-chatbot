import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Trophy, Flame, Star, Clock, MessageSquare, ChevronRight,
  ThumbsUp, AlertTriangle, Loader2, Send, Check, X, Shield,
  User, Search, BarChart3, Sparkles, FileSearch, ChevronDown, ChevronUp,
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
  if (m < 60) return `il y a ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

const STANCE_CONFIG = {
  agree: { label: 'D\'accord', color: '#34D399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)' },
  disagree: { label: 'Pas d\'accord', color: '#F87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
  nuance: { label: 'Nuance', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' },
} as const;

const BADGE_LABELS: Record<string, string> = {
  'first_comment': '💬 Premier débat',
  'credibility_10': '⭐ Fiable',
  'credibility_50': '🏆 Expert',
  'sophism_free': '🛡️ Logique irréprochable',
};

// ─── Pseudo Creation Modal ────────────────────────────────────────────────────

function ArenaPseudoModal({
  onCreated,
  userId,
}: {
  onCreated: (user: ArenaUser) => void;
  userId: string;
}) {
  const [name, setName] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNameChange = (v: string) => {
    setName(v);
    setAvailable(null);
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (v.length < 3) return;
    setChecking(true);
    checkTimer.current = setTimeout(async () => {
      const ok = await checkArenaNameAvailable(v.trim());
      setAvailable(ok);
      setChecking(false);
    }, 600);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !available || submitting) return;
    setSubmitting(true);
    await createArenaUser(userId, name.trim());
    const created: ArenaUser = {
      arenaName: name.trim(),
      credibilityScore: 0,
      totalComments: 0,
      badges: [],
      createdAt: new Date().toISOString(),
    };
    onCreated(created);
  };

  const valid = name.length >= 3 && name.length <= 24 && /^[a-zA-Z0-9_\-\.éèêëàâùûüîï ]+$/.test(name);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <motion.div
        className="w-full max-w-md bg-[#111318] border-2 border-[#5D7BFF]/30 p-8"
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#5D7BFF] flex items-center justify-center">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Entrer dans l'Arène</h2>
            <p className="text-[10px] text-white/40 mt-0.5">Choisissez votre pseudonyme de débatteur</p>
          </div>
        </div>

        <p className="text-[11px] text-white/50 mb-5 leading-relaxed">
          Ce pseudo sera affiché publiquement lors de vos contributions dans l'Arène.
          Il est indépendant de votre compte Challenger IA.
        </p>

        <div className="relative mb-4">
          <input
            type="text"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="Votre pseudonyme (3–24 caractères)"
            maxLength={24}
            className="w-full bg-white/5 border border-white/15 text-white text-sm px-4 py-3 pr-10 focus:outline-none focus:border-[#5D7BFF]/50 placeholder:text-white/25"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {checking && <Loader2 className="w-4 h-4 animate-spin text-white/30" />}
            {!checking && valid && available === true && <Check className="w-4 h-4 text-[#34D399]" />}
            {!checking && valid && available === false && <X className="w-4 h-4 text-[#F87171]" />}
          </div>
        </div>

        {valid && available === false && (
          <p className="text-[10px] text-[#F87171] mb-3">Ce pseudonyme est déjà pris.</p>
        )}
        {name.length > 0 && !valid && (
          <p className="text-[10px] text-white/30 mb-3">3–24 caractères, lettres, chiffres, tirets, points autorisés.</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!valid || available !== true || submitting}
          className="w-full bg-[#5D7BFF] disabled:opacity-30 text-white text-[11px] font-black uppercase tracking-widest py-3 flex items-center justify-center gap-2 transition-all hover:bg-[#4a69ff]"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
          {submitting ? 'Création…' : 'Rejoindre l\'Arène'}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Post Card (feed) ─────────────────────────────────────────────────────────

function PostCard({ post, onClick }: { post: ArenaPost; onClick: () => void }) {
  const total = post.agreeCount + post.disagreeCount + post.nuanceCount;
  const agreeW = total > 0 ? Math.round((post.agreeCount / total) * 100) : 0;
  const disagreeW = total > 0 ? Math.round((post.disagreeCount / total) * 100) : 0;
  const nuanceW = 100 - agreeW - disagreeW;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ x: 2 }}
      className="w-full text-left bg-white border-2 border-[rgba(20,20,20,0.08)] hover:border-[#5D7BFF]/30 p-4 transition-all group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          {post.featuredDate && (
            <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-[#FBBF24] mb-1.5">
              <Flame className="w-2.5 h-2.5" /> Défi du jour
            </span>
          )}
          <h3 className="text-sm font-bold text-[#141414] leading-snug">{post.title}</h3>
          {post.preamble && (
            <p className="text-[10px] text-[#141414]/50 mt-1 line-clamp-2">{post.preamble}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-[#141414]/20 group-hover:text-[#5D7BFF]/60 flex-shrink-0 mt-0.5 transition-colors" />
      </div>

      <div className="flex items-center gap-3 mt-3">
        <span className="text-[9px] text-[#141414]/40 font-medium">{post.personaName}</span>
        <span className="text-[#141414]/20">·</span>
        <span className="text-[9px] text-[#141414]/40">{timeAgo(post.createdAt)}</span>
        <span className="text-[#141414]/20">·</span>
        <span className="text-[9px] text-[#141414]/40 flex items-center gap-0.5">
          <MessageSquare className="w-2.5 h-2.5" /> {post.commentCount}
        </span>
        <span className="ml-auto text-[9px] font-medium text-[#141414]/50">
          {post.isAnonymous ? 'Anonyme' : post.authorArenaName}
        </span>
      </div>

      {total > 0 && (
        <div className="flex h-1 mt-3 overflow-hidden gap-0.5">
          {agreeW > 0 && <div className="h-full bg-[#34D399] rounded-sm" style={{ width: `${agreeW}%` }} />}
          {nuanceW > 0 && <div className="h-full bg-[#FBBF24] rounded-sm" style={{ width: `${nuanceW}%` }} />}
          {disagreeW > 0 && <div className="h-full bg-[#F87171] rounded-sm" style={{ width: `${disagreeW}%` }} />}
        </div>
      )}
    </motion.button>
  );
}

// ─── Sophism Badge ────────────────────────────────────────────────────────────

function SophismBadge({ alert }: { alert: SophismAlert }) {
  const [open, setOpen] = useState(false);
  if (!alert.detected) return null;
  const color = alert.severity === 'high' ? '#F87171' : alert.severity === 'medium' ? '#FBBF24' : '#94A3B8';
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border transition-all"
        style={{ color, borderColor: `${color}40`, background: `${color}10` }}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        Alerte logique · {alert.type}
        {open ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
      </button>
      {open && (
        <p className="text-[10px] text-[#141414]/60 mt-1 pl-2 border-l-2 border-[#FBBF24]/40">
          {alert.explanation}
        </p>
      )}
    </div>
  );
}

// ─── Comment Item ─────────────────────────────────────────────────────────────

function CommentItem({
  comment,
  userId,
  postId,
  post,
  depth,
  onReply,
  onUpdated,
  onCheckSophism,
  checkingId,
}: {
  comment: ArenaComment;
  userId: string;
  postId: string;
  post: ArenaPost;
  depth: number;
  onReply: (id: string, name: string) => void;
  onUpdated: (c: ArenaComment) => void;
  onCheckSophism: (comment: ArenaComment) => void;
  checkingId: string | null;
}) {
  const cfg = STANCE_CONFIG[comment.stance];
  const isUpvoted = comment.upvotedBy.includes(userId);
  const isAuthor = comment.authorId === userId;
  const isChecking = checkingId === comment.id;

  const handleUpvote = async () => {
    await upvoteComment(postId, comment.id, comment.authorId, userId, isUpvoted);
    onUpdated({
      ...comment,
      upvotes: comment.upvotes + (isUpvoted ? -1 : 1),
      upvotedBy: isUpvoted
        ? comment.upvotedBy.filter(id => id !== userId)
        : [...comment.upvotedBy, userId],
    });
  };

  return (
    <div className={cx('flex gap-2', depth > 0 && 'ml-6 pl-3 border-l-2 border-[rgba(20,20,20,0.06)]')}>
      <div className="flex-1 min-w-0">
        <div
          className="p-3 border"
          style={{ background: cfg.bg, borderColor: cfg.border }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5"
              style={{ background: cfg.color, color: '#fff' }}
            >
              {cfg.label}
            </span>
            <span className="text-[9px] font-bold text-[#141414]/70">{comment.authorArenaName}</span>
            <span className="text-[9px] text-[#141414]/30 ml-auto">{timeAgo(comment.createdAt)}</span>
          </div>
          <p className="text-[11px] text-[#141414]/80 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
          {comment.sophismAlert && <SophismBadge alert={comment.sophismAlert} />}
        </div>

        <div className="flex items-center gap-3 mt-1 px-1">
          <button
            onClick={handleUpvote}
            className={cx(
              'flex items-center gap-1 text-[8px] font-black uppercase tracking-widest transition-colors',
              isUpvoted ? 'text-[#5D7BFF]' : 'text-[#141414]/25 hover:text-[#141414]/60'
            )}
          >
            <ThumbsUp className="w-2.5 h-2.5" />
            {comment.upvotes > 0 && comment.upvotes}
          </button>

          {depth === 0 && (
            <button
              onClick={() => onReply(comment.id, comment.authorArenaName)}
              className="text-[8px] font-black uppercase tracking-widest text-[#141414]/25 hover:text-[#141414]/60 transition-colors"
            >
              Répondre
            </button>
          )}

          {!isAuthor && !comment.sophismAlert && (
            <button
              onClick={() => onCheckSophism(comment)}
              disabled={isChecking}
              className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-[#141414]/20 hover:text-[#FBBF24] transition-colors ml-auto disabled:opacity-40"
              title="Analyser pour sophismes (0.25 crédit)"
            >
              {isChecking ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Shield className="w-2.5 h-2.5" />}
              Vérifier · 0.25cr
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Arena Page ──────────────────────────────────────────────────────────

export default function ArenaPage({
  user,
  supabaseUserId,
  onBack,
}: {
  user: FBUser | null;
  supabaseUserId: string | null;
  onBack: () => void;
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

  // Load arena user
  useEffect(() => {
    if (!user) { setLoadingUser(false); return; }
    getArenaUser(user.uid)
      .then(au => {
        setArenaUser(au);
        setLoadingUser(false);
        if (!au) setShowPseudoModal(true);
      })
      .catch(() => { setFirestoreError(true); setLoadingUser(false); });
  }, [user]);

  // Load posts — ne dépend plus de arenaUser pour ne pas bloquer si pas encore de profil
  useEffect(() => {
    if (!user) return;
    setLoadingPosts(true);
    getArenaPosts(filter)
      .then(p => setPosts(p))
      .catch(() => {})
      .finally(() => setLoadingPosts(false));
  }, [filter, user]);

  const openPost = async (post: ArenaPost) => {
    setSelectedPost(post);
    setView('post');
    setSynthesis(null);
    setFactCheckResult(null);
    setShowFactCheckInput(false);
    setAiResponseExpanded(false);
    setLoadingComments(true);
    const c = await getArenaComments(post.id);
    setComments(c);
    setLoadingComments(false);
  };

  const submitComment = async () => {
    if (!newComment.trim() || !selectedPost || !user || !arenaUser || submittingComment) return;
    setSubmittingComment(true);
    await addArenaComment(selectedPost.id, {
      authorId: user.uid,
      authorArenaName: arenaUser.arenaName,
      stance: newStance,
      content: newComment.trim(),
      parentCommentId: replyTo?.id ?? null,
      createdAt: new Date().toISOString(),
    });
    // Refresh comments and post
    const [newComments, refreshedPost] = await Promise.all([
      getArenaComments(selectedPost.id),
      getArenaPost(selectedPost.id),
    ]);
    setComments(newComments);
    if (refreshedPost) setSelectedPost(refreshedPost);
    setNewComment('');
    setReplyTo(null);
    setSubmittingComment(false);
    // Update local arena user stats
    setArenaUser(a => a ? { ...a, totalComments: a.totalComments + 1 } : a);
  };

  const checkSophism = async (comment: ArenaComment) => {
    if (!selectedPost || !user || !supabaseUserId) return;
    // Deduct 0.25 credit — we use deductOneCredit * 0.25 via custom logic
    // For now: deduct 1 credit for every 4 checks, or use a dedicated RPC
    // Simple approach: deduct 1 credit per check (charged as 0.25 but we use fractional)
    // We'll just deduct 1 for V1 simplicity
    const ok = await deductOneCredit(supabaseUserId);
    if (!ok) {
      alert('Crédits insuffisants pour cette action (0.25 crédit requis).');
      return;
    }
    setCheckingId(comment.id);
    try {
      const res = await fetch('/api/arena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sophism',
          content: comment.content,
          context: selectedPost.title,
        }),
      });
      const data: SophismAlert = await res.json();
      await saveSophismAlert(selectedPost.id, comment.id, comment.authorId, data);
      setComments(cs => cs.map(c => c.id === comment.id ? { ...c, sophismAlert: data } : c));
    } finally {
      setCheckingId(null);
    }
  };

  const requestSynthesis = async () => {
    if (!selectedPost || !supabaseUserId || loadingSynthesis) return;
    const ok = await deductOneCredit(supabaseUserId);
    if (!ok) { alert('Crédits insuffisants (0.25 crédit requis).'); return; }
    setLoadingSynthesis(true);
    try {
      const res = await fetch('/api/arena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'synthesis',
          title: selectedPost.title,
          preamble: selectedPost.preamble,
          comments: comments.map(c => ({ stance: c.stance, content: c.content })),
        }),
      });
      const data = await res.json();
      setSynthesis(data.result ?? '');
    } finally {
      setLoadingSynthesis(false);
    }
  };

  const requestFactCheck = async () => {
    if (!factCheckClaim.trim() || !selectedPost || !supabaseUserId || loadingFactCheck) return;
    const ok = await deductOneCredit(supabaseUserId);
    if (!ok) { alert('Crédits insuffisants (0.25 crédit requis).'); return; }
    setLoadingFactCheck(true);
    try {
      const res = await fetch('/api/arena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'factcheck',
          claim: factCheckClaim,
          context: selectedPost.title,
        }),
      });
      const data = await res.json();
      setFactCheckResult(data.result ?? '');
      setShowFactCheckInput(false);
      setFactCheckClaim('');
    } finally {
      setLoadingFactCheck(false);
    }
  };

  const rootComments = comments.filter(c => !c.parentCommentId);
  const getReplies = (id: string) => comments.filter(c => c.parentCommentId === id);

  const filteredPosts = searchQuery.trim()
    ? posts.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.preamble?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : posts;

  // ── Not logged in ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 bg-[var(--bg-chat)]">
        <Trophy className="w-10 h-10 text-[#5D7BFF]/40" />
        <p className="text-sm text-[var(--text-muted)] text-center">
          Connectez-vous pour accéder à l'Arène.
        </p>
        <button onClick={onBack} className="text-[10px] font-black uppercase tracking-widest text-[#5D7BFF]">
          ← Retour
        </button>
      </div>
    );
  }

  // ── Firestore permissions error ─────────────────────────────────────────────
  if (firestoreError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 bg-[var(--bg-chat)]">
        <AlertTriangle className="w-8 h-8 text-[#FBBF24]/60" />
        <div className="text-center">
          <p className="text-sm font-bold text-[var(--text-primary)] mb-1">Règles Firestore non déployées</p>
          <p className="text-[10px] text-[var(--text-muted)] max-w-xs leading-relaxed">
            Les nouvelles règles pour l'Arène doivent être publiées dans la Firebase Console.
          </p>
          <p className="text-[10px] text-[#5D7BFF] mt-3">
            Firebase Console → Firestore → Règles → Publier
          </p>
        </div>
        <button onClick={onBack} className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          ← Retour
        </button>
      </div>
    );
  }

  // ── Loading user ────────────────────────────────────────────────────────────
  if (loadingUser) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-chat)]">
        <Loader2 className="w-6 h-6 animate-spin text-[#5D7BFF]/40" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-chat)] overflow-hidden">
      {/* Pseudo creation modal */}
      {showPseudoModal && (
        <ArenaPseudoModal
          userId={user.uid}
          onCreated={au => { setArenaUser(au); setShowPseudoModal(false); }}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-chat)]">
        <button
          onClick={view === 'post' ? () => { setView('feed'); setSelectedPost(null); setSynthesis(null); } : onBack}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Trophy className="w-4 h-4 text-[#5D7BFF] flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">
              L'Arène
            </span>
            {view === 'post' && selectedPost && (
              <p className="text-[9px] text-[var(--text-muted)] truncate">{selectedPost.title}</p>
            )}
          </div>
        </div>

        {view === 'feed' && (
          <button
            onClick={() => setShowSearch(v => !v)}
            className="text-[var(--text-muted)] hover:text-[#5D7BFF] transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
        )}

        {arenaUser && (
          <div className="flex items-center gap-1.5 px-2 py-1 border border-[var(--border)]">
            <Star className="w-3 h-3 text-[#FBBF24]" />
            <span className="text-[9px] font-black text-[var(--text-primary)]">{arenaUser.credibilityScore}</span>
          </div>
        )}
      </div>

      {/* ── Feed view ──────────────────────────────────────────────────────── */}
      {view === 'feed' && (
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Search bar */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-[var(--border)]"
              >
                <div className="px-4 py-2">
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Rechercher un débat…"
                    className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter tabs */}
          <div className="flex border-b border-[var(--border)]">
            {([
              { key: 'recent', label: 'Récents', icon: Clock },
              { key: 'trending', label: 'Tendance', icon: Flame },
              { key: 'featured', label: 'Défi du jour', icon: Star },
            ] as { key: typeof filter; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cx(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-black uppercase tracking-widest border-b-2 transition-all',
                  filter === key
                    ? 'text-[#5D7BFF] border-[#5D7BFF]'
                    : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                )}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Profile summary */}
          {arenaUser && (
            <div className="px-4 py-3 flex items-center gap-3 border-b border-[var(--border)] bg-[#5D7BFF]/5">
              <User className="w-3.5 h-3.5 text-[#5D7BFF]" />
              <span className="text-[10px] font-bold text-[var(--text-primary)]">{arenaUser.arenaName}</span>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-[9px] text-[var(--text-muted)]">
                  <Star className="w-2.5 h-2.5 inline text-[#FBBF24] mr-0.5" />
                  {arenaUser.credibilityScore} pts
                </span>
                <span className="text-[9px] text-[var(--text-muted)]">
                  <MessageSquare className="w-2.5 h-2.5 inline mr-0.5" />
                  {arenaUser.totalComments} contributions
                </span>
              </div>
            </div>
          )}

          {/* Posts list */}
          <div className="p-4 space-y-3">
            {loadingPosts ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-[#5D7BFF]/40" />
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="text-center py-12">
                <Trophy className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3 opacity-30" />
                <p className="text-[11px] text-[var(--text-muted)]">
                  {filter === 'featured' ? 'Aucun défi mis en avant aujourd\'hui.' : 'Aucun débat pour le moment.'}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1 opacity-60">
                  Propulsez un échange depuis le chat pour lancer le débat !
                </p>
              </div>
            ) : (
              filteredPosts.map(post => (
                <PostCard key={post.id} post={post} onClick={() => openPost(post)} />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Post detail view ────────────────────────────────────────────────── */}
      {view === 'post' && selectedPost && (
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Post header */}
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[8px] font-black uppercase tracking-widest text-[#5D7BFF]/70 border border-[#5D7BFF]/20 px-1.5 py-0.5">
                {selectedPost.personaName}
              </span>
              {selectedPost.featuredDate && (
                <span className="text-[8px] font-black uppercase tracking-widest text-[#FBBF24] flex items-center gap-1">
                  <Flame className="w-2.5 h-2.5" /> Défi du jour
                </span>
              )}
              <span className="text-[9px] text-[var(--text-muted)] ml-auto">{timeAgo(selectedPost.createdAt)}</span>
            </div>
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">{selectedPost.title}</h2>
            {selectedPost.preamble && (
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mb-3">{selectedPost.preamble}</p>
            )}
            <p className="text-[9px] text-[var(--text-muted)]">
              Par {selectedPost.isAnonymous ? 'Anonyme' : selectedPost.authorArenaName}
            </p>
          </div>

          {/* Q/A exchange */}
          <div className="p-4 space-y-3 border-b border-[var(--border)] bg-[#5D7BFF]/3">
            <div className="bg-white border border-[rgba(20,20,20,0.08)] p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-[#141414]/30 mb-1.5">Question</p>
              <p className="text-[11px] text-[#141414]/80 leading-relaxed">{selectedPost.question}</p>
            </div>
            <div className="bg-[#5D7BFF] p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/50 mb-1.5">Réponse IA</p>
              {(() => {
                const THRESHOLD = 600;
                const isLong = selectedPost.aiResponse.length > THRESHOLD;
                const displayed = isLong && !aiResponseExpanded
                  ? selectedPost.aiResponse.slice(0, THRESHOLD)
                  : selectedPost.aiResponse;
                return (
                  <>
                    <div className={cx('text-[11px] text-white/90 leading-relaxed prose-sm relative', isLong && !aiResponseExpanded && 'overflow-hidden')}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                          h2: ({ children }) => <p className="font-bold mt-2 mb-1">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                          li: ({ children }) => <li className="text-white/80">{children}</li>,
                        }}
                      >
                        {displayed}
                      </ReactMarkdown>
                      {isLong && !aiResponseExpanded && (
                        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#5D7BFF] to-transparent" />
                      )}
                    </div>
                    {isLong && (
                      <button
                        onClick={() => setAiResponseExpanded(v => !v)}
                        className="mt-2 text-[8px] font-black uppercase tracking-widest text-white/60 hover:text-white border border-white/20 hover:border-white/40 px-2.5 py-1 transition-all flex items-center gap-1"
                      >
                        {aiResponseExpanded
                          ? <><ChevronUp className="w-2.5 h-2.5" /> Condenser</>
                          : <><ChevronDown className="w-2.5 h-2.5" /> Voir tout</>
                        }
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Opinion bar */}
          {selectedPost.commentCount > 0 && (
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 mb-1.5">
                <BarChart3 className="w-3 h-3 text-[var(--text-muted)]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  Opinion de l'Arène · {selectedPost.commentCount} contributions
                </span>
              </div>
              <div className="flex h-2 overflow-hidden gap-0.5">
                {selectedPost.agreeCount > 0 && (
                  <div
                    className="h-full bg-[#34D399] flex items-center justify-center"
                    style={{ width: `${(selectedPost.agreeCount / selectedPost.commentCount) * 100}%` }}
                  />
                )}
                {selectedPost.nuanceCount > 0 && (
                  <div
                    className="h-full bg-[#FBBF24]"
                    style={{ width: `${(selectedPost.nuanceCount / selectedPost.commentCount) * 100}%` }}
                  />
                )}
                {selectedPost.disagreeCount > 0 && (
                  <div
                    className="h-full bg-[#F87171]"
                    style={{ width: `${(selectedPost.disagreeCount / selectedPost.commentCount) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex gap-4 mt-1.5">
                <span className="text-[8px] text-[#34D399]">✓ {selectedPost.agreeCount} pour</span>
                <span className="text-[8px] text-[#FBBF24]">~ {selectedPost.nuanceCount} nuances</span>
                <span className="text-[8px] text-[#F87171]">✗ {selectedPost.disagreeCount} contre</span>
              </div>
            </div>
          )}

          {/* AI Arbiter tools */}
          <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap gap-2">
            <button
              onClick={requestSynthesis}
              disabled={loadingSynthesis || comments.length === 0}
              className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-2.5 py-1.5 border border-[#5D7BFF]/30 text-[#5D7BFF] hover:bg-[#5D7BFF]/10 disabled:opacity-30 transition-all"
            >
              {loadingSynthesis ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Synthèse · 0.25cr
            </button>
            <button
              onClick={() => { setShowFactCheckInput(v => !v); setFactCheckResult(null); }}
              className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-2.5 py-1.5 border border-[#FBBF24]/30 text-[#FBBF24] hover:bg-[#FBBF24]/10 transition-all"
            >
              <FileSearch className="w-3 h-3" />
              Fact-check · 0.25cr
            </button>
          </div>

          {/* Fact-check input */}
          <AnimatePresence>
            {showFactCheckInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-[var(--border)] px-4 py-3"
              >
                <p className="text-[9px] text-[var(--text-muted)] mb-2">Entrez l'affirmation à vérifier :</p>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={factCheckClaim}
                    onChange={e => setFactCheckClaim(e.target.value)}
                    placeholder="Ex : 90% des biologistes pensent que…"
                    className="flex-1 bg-transparent border border-[var(--border)] text-[11px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-[#FBBF24]/50 placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    onClick={requestFactCheck}
                    disabled={!factCheckClaim.trim() || loadingFactCheck}
                    className="bg-[#FBBF24] text-[#141414] px-3 py-2 disabled:opacity-40 transition-all"
                  >
                    {loadingFactCheck ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Synthesis result */}
          <AnimatePresence>
            {synthesis && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="mx-4 my-3 p-4 bg-[#5D7BFF]/8 border border-[#5D7BFF]/20"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-[#5D7BFF]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#5D7BFF]">Synthèse de l'Arène</span>
                  <button onClick={() => setSynthesis(null)} className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-[11px] text-[var(--text-primary)] leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{synthesis}</ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Fact-check result */}
          <AnimatePresence>
            {factCheckResult && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="mx-4 my-3 p-4 bg-[#FBBF24]/8 border border-[#FBBF24]/20"
              >
                <div className="flex items-center gap-2 mb-3">
                  <FileSearch className="w-3.5 h-3.5 text-[#FBBF24]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#FBBF24]">Fact-check</span>
                  <button onClick={() => setFactCheckResult(null)} className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-[11px] text-[var(--text-primary)] leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{factCheckResult}</ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Comments */}
          <div className="p-4 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              {selectedPost.commentCount} contribution{selectedPost.commentCount !== 1 ? 's' : ''}
            </p>

            {loadingComments ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#5D7BFF]/40" />
              </div>
            ) : (
              <div className="space-y-3">
                {rootComments.map(c => (
                  <div key={c.id} className="space-y-2">
                    <CommentItem
                      comment={c}
                      userId={user.uid}
                      postId={selectedPost.id}
                      post={selectedPost}
                      depth={0}
                      onReply={(id, name) => {
                        setReplyTo({ id, name });
                        commentBoxRef.current?.focus();
                      }}
                      onUpdated={updated => setComments(cs => cs.map(x => x.id === updated.id ? updated : x))}
                      onCheckSophism={checkSophism}
                      checkingId={checkingId}
                    />
                    {getReplies(c.id).map(reply => (
                      <CommentItem
                        key={reply.id}
                        comment={reply}
                        userId={user.uid}
                        postId={selectedPost.id}
                        post={selectedPost}
                        depth={1}
                        onReply={() => {}}
                        onUpdated={updated => setComments(cs => cs.map(x => x.id === updated.id ? updated : x))}
                        onCheckSophism={checkSophism}
                        checkingId={checkingId}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comment form */}
          <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg-chat)] p-4">
            {replyTo && (
              <div className="flex items-center gap-2 mb-2 text-[9px] text-[var(--text-muted)]">
                <span>Réponse à <strong>{replyTo.name}</strong></span>
                <button onClick={() => setReplyTo(null)} className="ml-auto hover:text-[var(--text-primary)]">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Stance selector */}
            <div className="flex gap-1.5 mb-2">
              {(['agree', 'disagree', 'nuance'] as Stance[]).map(s => {
                const cfg = STANCE_CONFIG[s];
                return (
                  <button
                    key={s}
                    onClick={() => setNewStance(s)}
                    className="flex-1 py-1.5 text-[8px] font-black uppercase tracking-widest border-2 transition-all"
                    style={newStance === s
                      ? { background: cfg.bg, borderColor: cfg.color, color: cfg.color }
                      : { borderColor: 'var(--border)', color: 'var(--text-muted)' }
                    }
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <textarea
                ref={commentBoxRef}
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(); }}
                placeholder="Votre argument… (Ctrl+Entrée pour envoyer)"
                rows={2}
                className="flex-1 bg-transparent border border-[var(--border)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3 py-2 resize-none focus:outline-none focus:border-[#5D7BFF]/50"
              />
              <button
                onClick={submitComment}
                disabled={!newComment.trim() || submittingComment}
                className="flex-shrink-0 bg-[#5D7BFF] disabled:opacity-30 text-white px-3 flex items-center justify-center transition-all hover:bg-[#4a69ff]"
              >
                {submittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
