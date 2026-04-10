import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home, Swords, User, Zap, MessageSquare, Repeat2, Link2,
  Image, Hash, AtSign, X, Send, Loader2, Search, Flame,
  ChevronDown, ChevronUp, Plus, Check, BarChart3, HelpCircle,
  ArrowLeft, Star, UserPlus, Trash2, Globe,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { ArenaUser } from '../arena/arenaTypes';
import type {
  XposePost, XposeComment, XposeRecommendedUser,
  XposeVisibility, XposeCommentType, XposePostType, XposeDestination, PollOption,
} from './xposeTypes';
import {
  getPublicFeed, getFollowingFeed, createXposePost, updateXposePostImages,
  resonatePost, amplifyPost, addXposeComment, getXposeComments,
  upvoteXposeComment, updateStreak, scorePost,
  getRecommendedUsers, getTrendingTags, votePoll, deleteXposePost,
} from './xposeFirestore';
import { uploadPostImages } from './xposeStorage';
import { getMyConnections, sendConnection, getArenaPosts } from '../arena/arenaFirestore';
import type { ArenaPost } from '../arena/arenaTypes';
import ArenaPage from '../arena/ArenaPage';

// ─── XposeProfilePage stub (import dynamique selon existence) ──────────────────
let XposeProfilePage: React.ComponentType<{
  user: FirebaseUser;
  targetUserId: string;
  myArenaUser: ArenaUser | null;
  onBack: () => void;
  onViewProfile: (uid: string) => void;
}> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  XposeProfilePage = require('./XposeProfilePage').default;
} catch {
  XposeProfilePage = null;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG = '#000';
const BORDER = '#2f3336';
const TEXT = '#e7e9ea';
const TEXT2 = '#71767b';
const ACCENT = '#5D7BFF';
const RESONANCE_ACTIVE = '#F97316';
const HOVER = 'rgba(255,255,255,0.03)';
const SEP = `1px solid ${BORDER}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PALETTE = ['#5D7BFF', '#34D399', '#F87171', '#FBBF24', '#A78BFA', '#F97316', '#38BDF8', '#FB7185'];

function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'maintenant';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}j`;
}

function pollTimeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'Terminé';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}j restant${d > 1 ? 's' : ''}`;
  return `${h}h restantes`;
}

// ─── Section type ─────────────────────────────────────────────────────────────

type Section = 'feed' | 'arene' | 'profile' | 'profile_other';

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name, photoURL, size = 40, onClick,
}: {
  name: string; photoURL?: string; size?: number; onClick?: () => void;
}) {
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%',
    flexShrink: 0, cursor: onClick ? 'pointer' : 'default',
    objectFit: 'cover' as const,
  };
  if (photoURL) {
    return <img src={photoURL} alt={name} style={base} onClick={onClick} />;
  }
  return (
    <div
      onClick={onClick}
      style={{
        ...base, background: avatarColor(name),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.35, fontWeight: 700, color: '#fff',
      }}
    >
      {initials(name)}
    </div>
  );
}

// ─── Comment Thread ───────────────────────────────────────────────────────────

function CommentThread({
  postId, userId, arenaName, photoURL,
}: {
  postId: string; userId: string; arenaName: string; photoURL?: string;
}) {
  const [comments, setComments] = useState<XposeComment[]>([]);
  const [loadingC, setLoadingC] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [replyType, setReplyType] = useState<XposeCommentType>('argument');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getXposeComments(postId).then(c => { setComments(c); setLoadingC(false); });
  }, [postId]);

  const handleSubmit = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    const id = await addXposeComment(postId, {
      authorId: userId, authorArenaName: arenaName, authorPhotoURL: photoURL,
      type: replyType, content: replyText.trim(),
      parentCommentId: null, createdAt: new Date().toISOString(),
    });
    if (id) {
      setComments(prev => [...prev, {
        id, authorId: userId, authorArenaName: arenaName, authorPhotoURL: photoURL,
        type: replyType, content: replyText.trim(), parentCommentId: null,
        createdAt: new Date().toISOString(), upvotes: 0, upvotedBy: [],
      }]);
      setReplyText('');
    }
    setSubmitting(false);
  };

  const handleUpvote = async (c: XposeComment) => {
    const isUp = c.upvotedBy.includes(userId);
    await upvoteXposeComment(postId, c.id, userId, isUp);
    setComments(prev => prev.map(x =>
      x.id === c.id
        ? { ...x, upvotes: isUp ? x.upvotes - 1 : x.upvotes + 1, upvotedBy: isUp ? x.upvotedBy.filter(i => i !== userId) : [...x.upvotedBy, userId] }
        : x
    ));
  };

  const typeLabel: Record<XposeCommentType, string> = { argument: 'Argument', question: 'Question', intuition: 'Intuition', reponse: 'Réponse' };
  const typeColor: Record<XposeCommentType, string> = { argument: ACCENT, question: '#34D399', intuition: '#A78BFA', reponse: '#FBBF24' };

  return (
    <div style={{ borderTop: SEP, background: 'rgba(255,255,255,0.01)' }}>
      {/* Composer réponse */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: SEP }}>
        <Avatar name={arenaName} photoURL={photoURL} size={32} />
        <div style={{ flex: 1 }}>
          {/* Type pills */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            {(['argument', 'question', 'intuition', 'reponse'] as XposeCommentType[]).map(t => (
              <button
                key={t}
                onClick={() => setReplyType(t)}
                style={{
                  padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${replyType === t ? typeColor[t] : BORDER}`,
                  background: replyType === t ? `${typeColor[t]}22` : 'transparent',
                  color: replyType === t ? typeColor[t] : TEXT2, cursor: 'pointer',
                }}
              >
                {typeLabel[t]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Votre réponse..."
              rows={2}
              style={{
                flex: 1, background: '#111', border: SEP, borderRadius: 8,
                color: TEXT, padding: '8px 10px', fontSize: 14, resize: 'none',
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={!replyText.trim() || submitting}
              style={{
                background: replyText.trim() ? ACCENT : BORDER,
                border: 'none', borderRadius: '50%', width: 34, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: replyText.trim() ? 'pointer' : 'not-allowed', flexShrink: 0,
              }}
            >
              {submitting ? <Loader2 size={15} color="#fff" className="animate-spin" /> : <Send size={15} color="#fff" />}
            </button>
          </div>
        </div>
      </div>

      {/* Liste */}
      {loadingC ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
          <Loader2 size={18} color={TEXT2} className="animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <div style={{ color: TEXT2, textAlign: 'center', padding: '12px 16px', fontSize: 14 }}>
          Soyez le premier à répondre.
        </div>
      ) : comments.map(c => {
        const isUp = c.upvotedBy.includes(userId);
        return (
          <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: SEP }}>
            <Avatar name={c.authorArenaName} photoURL={c.authorPhotoURL} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>{c.authorArenaName}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 12, background: `${typeColor[c.type]}22`, color: typeColor[c.type] }}>
                  {typeLabel[c.type]}
                </span>
                <span style={{ color: TEXT2, fontSize: 12, marginLeft: 'auto' }}>{timeAgo(c.createdAt)}</span>
              </div>
              <p style={{ color: TEXT, fontSize: 14, margin: 0, lineHeight: 1.5 }}>{c.content}</p>
              <button
                onClick={() => handleUpvote(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', color: isUp ? RESONANCE_ACTIVE : TEXT2, fontSize: 13, padding: 0 }}
              >
                <Zap size={14} fill={isUp ? RESONANCE_ACTIVE : 'none'} />
                <span>{c.upvotes}</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Poll Card ────────────────────────────────────────────────────────────────

function PollCard({ post, userId, onVoted }: { post: XposePost; userId: string; onVoted: (updated: XposePost) => void }) {
  const options = post.pollOptions ?? [];
  const total = options.reduce((acc, o) => acc + o.voteCount, 0);
  const hasVoted = options.some(o => o.voterIds.includes(userId));
  const myVote = options.find(o => o.voterIds.includes(userId));
  const ended = post.pollEndsAt ? new Date(post.pollEndsAt).getTime() < Date.now() : false;

  const handleVote = async (optionId: string) => {
    if (hasVoted || ended) return;
    await votePoll(post.id, optionId, userId);
    const updatedOptions = options.map(o =>
      o.id === optionId
        ? { ...o, voteCount: o.voteCount + 1, voterIds: [...o.voterIds, userId] }
        : o
    );
    onVoted({ ...post, pollOptions: updatedOptions });
  };

  return (
    <div style={{ marginTop: 8 }}>
      {options.map(opt => {
        const pct = total > 0 ? Math.round((opt.voteCount / total) * 100) : 0;
        const isSelected = myVote?.id === opt.id;
        const showBar = hasVoted || ended;
        return (
          <button
            key={opt.id}
            onClick={() => handleVote(opt.id)}
            disabled={hasVoted || ended}
            style={{
              width: '100%', marginBottom: 8, padding: '10px 14px',
              border: `1px solid ${isSelected ? ACCENT : BORDER}`,
              borderRadius: 8, background: 'transparent', cursor: (hasVoted || ended) ? 'default' : 'pointer',
              position: 'relative', overflow: 'hidden', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            {showBar && (
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: isSelected ? `${ACCENT}22` : `${BORDER}44`, transition: 'width 0.4s', borderRadius: 8 }} />
            )}
            <span style={{ position: 'relative', color: TEXT, fontSize: 15, fontWeight: isSelected ? 700 : 400 }}>{opt.text}</span>
            {showBar && (
              <span style={{ position: 'relative', color: isSelected ? ACCENT : TEXT2, fontSize: 13, fontWeight: 600 }}>{pct}%</span>
            )}
          </button>
        );
      })}
      <div style={{ display: 'flex', gap: 12, color: TEXT2, fontSize: 13, marginTop: 4 }}>
        <span>{total} vote{total !== 1 ? 's' : ''}</span>
        {post.pollEndsAt && <span>{pollTimeLeft(post.pollEndsAt)}</span>}
      </div>
    </div>
  );
}

// ─── Arena Card (embed) ───────────────────────────────────────────────────────

function ArenaCardEmbed({ post, onGoToArena }: { post: XposePost; onGoToArena: (id?: string) => void }) {
  const total = (post.arenaAgree ?? 0) + (post.arenaDisagree ?? 0);
  const agreePct = total > 0 ? Math.round(((post.arenaAgree ?? 0) / total) * 100) : 50;
  return (
    <div style={{ border: '1px solid #1e2a4a', borderRadius: 12, padding: 12, marginTop: 8, background: 'rgba(93,123,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Swords size={14} color={ACCENT} />
        <span style={{ color: ACCENT, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Arène</span>
      </div>
      {post.arenaPostTitle && <p style={{ color: TEXT, fontWeight: 600, fontSize: 14, margin: '0 0 4px' }}>{post.arenaPostTitle}</p>}
      {post.arenaPostExcerpt && (
        <p style={{ color: TEXT2, fontSize: 13, margin: '0 0 8px', lineHeight: 1.4 }}>
          {post.arenaPostExcerpt.length > 120 ? post.arenaPostExcerpt.slice(0, 120) + '…' : post.arenaPostExcerpt}
        </p>
      )}
      {total > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: TEXT2, marginBottom: 3 }}>
            <span style={{ color: '#34D399' }}>Pour {agreePct}%</span>
            <span style={{ color: '#F87171' }}>Contre {100 - agreePct}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: '#F87171', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${agreePct}%`, background: '#34D399', borderRadius: 2 }} />
          </div>
        </div>
      )}
      <button
        onClick={() => onGoToArena(post.arenaPostId)}
        style={{ background: 'none', border: `1px solid ${ACCENT}`, borderRadius: 20, color: ACCENT, fontSize: 13, fontWeight: 600, padding: '4px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <Swords size={13} /> Rejoindre le débat →
      </button>
    </div>
  );
}

// ─── AI Card ──────────────────────────────────────────────────────────────────

function AICard({ post }: { post: XposePost }) {
  const [expanded, setExpanded] = useState(false);
  const resp = post.aiResponse ?? '';
  const trunc = resp.slice(0, 180);
  const needsExpand = resp.length > 180;
  return (
    <div style={{ border: '1px solid #2d1a4a', borderRadius: 12, padding: 12, marginTop: 8, background: 'rgba(167,139,250,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, color: '#fff', fontWeight: 800 }}>IA</span>
        </div>
        <span style={{ color: '#A78BFA', fontSize: 12, fontWeight: 700 }}>{post.personaName ?? 'IA'}</span>
      </div>
      {post.aiQuestion && <p style={{ color: TEXT2, fontSize: 13, fontStyle: 'italic', margin: '0 0 6px' }}>« {post.aiQuestion} »</p>}
      <p style={{ color: TEXT, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
        {expanded ? resp : trunc}{!expanded && needsExpand && '…'}
      </p>
      {needsExpand && (
        <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', color: '#A78BFA', cursor: 'pointer', fontSize: 13, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
          {expanded ? <><ChevronUp size={14} /> Réduire</> : <><ChevronDown size={14} /> Voir plus</>}
        </button>
      )}
    </div>
  );
}

// ─── Images Grid ──────────────────────────────────────────────────────────────

function ImagesGrid({ urls }: { urls: string[] }) {
  const count = Math.min(urls.length, 4);
  if (count === 0) return null;
  if (count === 1) {
    return <img src={urls[0]} alt="" style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 12, marginTop: 8 }} />;
  }
  return (
    <div style={{ display: 'grid', gap: 2, borderRadius: 12, overflow: 'hidden', marginTop: 8, gridTemplateColumns: count === 2 ? '1fr 1fr' : '1fr 1fr' }}>
      {urls.slice(0, count).map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          style={{ width: '100%', objectFit: 'cover', height: count === 2 ? 200 : 150, gridColumn: count === 3 && i === 0 ? '1 / -1' : undefined }}
        />
      ))}
    </div>
  );
}

// ─── Quote Card ───────────────────────────────────────────────────────────────

function QuoteCard({ post }: { post: Omit<XposePost, 'quotedPost'> }) {
  return (
    <div style={{ border: SEP, borderRadius: 12, padding: 12, marginTop: 8, background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Avatar name={post.authorArenaName} photoURL={post.authorPhotoURL} size={20} />
        <span style={{ fontWeight: 700, color: TEXT, fontSize: 13 }}>{post.authorArenaName}</span>
        <span style={{ color: TEXT2, fontSize: 12 }}>· {timeAgo(post.createdAt)}</span>
      </div>
      {post.caption && (
        <p style={{ color: TEXT, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          {post.caption.length > 100 ? post.caption.slice(0, 100) + '…' : post.caption}
        </p>
      )}
    </div>
  );
}

// ─── Action Button ────────────────────────────────────────────────────────────

function ActionBtn({ icon, count, active, activeColor, onClick, label }: {
  icon: React.ReactNode; count: number; active: boolean;
  activeColor: string; onClick: () => void; label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: active ? activeColor : TEXT2, fontSize: 14, padding: 4, borderRadius: 20 }}
    >
      {icon}
      <span style={{ minWidth: 12 }}>{count > 0 ? count : ''}</span>
    </button>
  );
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

function PostCard({
  post, userId, showComments, onToggleComments, onResonate, onAmplify,
  onGoToArena, onViewProfile, onDelete, onVoted,
}: {
  post: XposePost; userId: string; showComments: boolean;
  onToggleComments: () => void; onResonate: () => void; onAmplify: () => void;
  onGoToArena: (id?: string) => void;
  onViewProfile: (uid: string) => void;
  onDelete: (id: string) => void;
  onVoted: (updated: XposePost) => void;
}) {
  const isResonated = post.resonatedBy.includes(userId);
  const isAmplified = post.amplifiedBy.includes(userId);
  const isOwn = post.authorId === userId;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/xpose/${post.id}`).catch(() => {});
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await deleteXposePost(post.id);
    onDelete(post.id);
  };

  const typeBadge: Partial<Record<XposePostType, { label: string; color: string; icon: React.ReactNode }>> = {
    sondage: { label: 'Sondage', color: '#FBBF24', icon: <BarChart3 size={12} /> },
    question_ouverte: { label: 'Question', color: '#34D399', icon: <HelpCircle size={12} /> },
    arene: { label: 'Arène', color: ACCENT, icon: <Swords size={12} /> },
    echange_ia: { label: 'IA', color: '#A78BFA', icon: <span style={{ fontSize: 9, fontWeight: 800 }}>IA</span> },
  };
  const badge = typeBadge[post.type];

  return (
    <div>
      <motion.div
        whileHover={{ background: HOVER }}
        style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: showComments ? undefined : SEP, cursor: 'default' }}
      >
        {/* Avatar */}
        <div style={{ flexShrink: 0 }}>
          <Avatar
            name={post.authorArenaName} photoURL={post.authorPhotoURL} size={40}
            onClick={() => post.authorId === userId ? onViewProfile(userId) : onViewProfile(post.authorId)}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
            <span
              style={{ fontWeight: 700, color: TEXT, fontSize: 15, cursor: 'pointer' }}
              onClick={() => onViewProfile(post.authorId)}
            >
              {post.authorArenaName}
            </span>
            {post.authorCredibilityScore !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#FBBF24', fontSize: 12 }}>
                <Star size={11} fill="#FBBF24" />{post.authorCredibilityScore}
              </span>
            )}
            <span style={{ color: TEXT2, fontSize: 14 }}>· {timeAgo(post.createdAt)}</span>
            {post.visibility === 'friends' && (
              <span style={{ fontSize: 11, color: TEXT2, background: BORDER, borderRadius: 10, padding: '1px 7px', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Globe size={10} /> Amis
              </span>
            )}
            {badge && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: badge.color, background: `${badge.color}22`, padding: '1px 8px', borderRadius: 12 }}>
                {badge.icon} {badge.label}
              </span>
            )}
            {isOwn && (
              <button
                onClick={handleDelete}
                title={confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: confirmDelete ? '#F87171' : TEXT2, display: 'flex', alignItems: 'center', padding: 2, borderRadius: 4 }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* Caption */}
          {post.caption && (
            <p style={{ color: TEXT, fontSize: 15, margin: '0 0 4px', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {post.caption}
            </p>
          )}

          {/* Question ouverte */}
          {post.type === 'question_ouverte' && post.questionText && (
            <p style={{ color: TEXT, fontSize: 15, fontStyle: 'italic', fontWeight: 700, margin: '4px 0', lineHeight: 1.5 }}>
              {post.questionText}
            </p>
          )}

          {/* Poll */}
          {post.type === 'sondage' && post.pollOptions && (
            <PollCard post={post} userId={userId} onVoted={onVoted} />
          )}

          {/* Images */}
          {post.imageUrls && post.imageUrls.length > 0 && <ImagesGrid urls={post.imageUrls} />}

          {/* Quoted post */}
          {post.quotedPost && <QuoteCard post={post.quotedPost} />}

          {/* Arena card */}
          {post.type === 'arene' && <ArenaCardEmbed post={post} onGoToArena={onGoToArena} />}

          {/* AI card */}
          {post.type === 'echange_ia' && <AICard post={post} />}

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {post.tags.map(tag => (
                <span key={tag} style={{ color: ACCENT, fontSize: 14 }}>#{tag}</span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 12 }}>
            <ActionBtn
              icon={<MessageSquare size={17} />}
              count={post.commentCount} active={showComments} activeColor={ACCENT}
              onClick={onToggleComments} label="Commenter"
            />
            <ActionBtn
              icon={<Repeat2 size={17} />}
              count={post.amplifyCount} active={isAmplified} activeColor="#34D399"
              onClick={onAmplify} label="Amplifier"
            />
            <ActionBtn
              icon={<Zap size={17} fill={isResonated ? RESONANCE_ACTIVE : 'none'} />}
              count={post.resonanceCount} active={isResonated} activeColor={RESONANCE_ACTIVE}
              onClick={onResonate} label="Résonance"
            />
            <button
              onClick={handleCopy}
              title="Copier le lien"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, display: 'flex', alignItems: 'center', padding: 4, borderRadius: '50%' }}
            >
              <Link2 size={17} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Comments inline */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', borderBottom: SEP }}
          >
            <CommentThread postId={post.id} userId={userId} arenaName={post.authorArenaName} photoURL={post.authorPhotoURL} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarBtn({ icon, onClick, disabled, title }: { icon: React.ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      style={{ background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? '#333' : ACCENT, padding: 8, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = `${ACCENT}18`)}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {icon}
    </button>
  );
}

// ─── Arena Picker Modal ───────────────────────────────────────────────────────

function ArenaPickerModal({ onClose, onSelect }: {
  onClose: () => void;
  onSelect: (id: string, title: string, excerpt: string) => void;
}) {
  const [arenaPosts, setArenaPosts] = useState<ArenaPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getArenaPosts('recent').then(p => { setArenaPosts(p); setLoading(false); });
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 16 }} onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        style={{ background: BG, border: SEP, borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: SEP }}>
          <span style={{ color: TEXT, fontWeight: 700, fontSize: 16 }}>Choisir un débat Arène</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, display: 'flex', padding: 4, borderRadius: '50%' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Loader2 size={24} color={TEXT2} className="animate-spin" />
            </div>
          ) : arenaPosts.map(ap => (
            <button
              key={ap.id}
              onClick={() => onSelect(ap.id, ap.title, ap.preamble)}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: SEP, padding: '12px 16px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Swords size={13} color={ACCENT} />
                <span style={{ color: TEXT2, fontSize: 12 }}>{ap.authorArenaName} · {timeAgo(ap.createdAt)}</span>
              </div>
              <p style={{ color: TEXT, fontWeight: 600, fontSize: 14, margin: '0 0 3px' }}>{ap.title}</p>
              <p style={{ color: TEXT2, fontSize: 13, margin: 0 }}>{ap.preamble.length > 100 ? ap.preamble.slice(0, 100) + '…' : ap.preamble}</p>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12 }}>
                <span style={{ color: '#34D399' }}>✓ {ap.agreeCount}</span>
                <span style={{ color: '#F87171' }}>✗ {ap.disagreeCount}</span>
                <span style={{ color: TEXT2 }}>💬 {ap.commentCount}</span>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Full Composer (desktop inline + mobile modal) ────────────────────────────

interface ComposerProps {
  user: FirebaseUser;
  arenaUser: ArenaUser | null;
  onPublished: (post: XposePost) => void;
  onClose?: () => void; // pour la modale mobile
}

function Composer({ user, arenaUser, onPublished, onClose }: ComposerProps) {
  const [composerType, setComposerType] = useState<XposePostType>('pensee');
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [visibility, setVisibility] = useState<XposeVisibility>('public');
  const [destination, setDestination] = useState<XposeDestination>('xpose');
  const [arenaPost, setArenaPost] = useState<{ id: string; title: string; excerpt: string } | null>(null);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollDuration, setPollDuration] = useState<24 | 48 | 168>(24);
  const [publishing, setPublishing] = useState(false);
  const [showArenaModal, setShowArenaModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const arenaName = arenaUser?.arenaName ?? user.displayName ?? 'Anonyme';
  const photoURL = arenaUser?.photoURL ?? user.photoURL ?? undefined;

  const maxLen = composerType === 'sondage' || composerType === 'question_ouverte' ? 280 : 500;

  const handleImages = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).slice(0, 4 - images.length);
    setImages(prev => [...prev, ...next]);
    next.forEach(f => {
      const r = new FileReader();
      r.onload = e => setPreviews(prev => [...prev, e.target?.result as string]);
      r.readAsDataURL(f);
    });
  };

  const removeImage = (i: number) => {
    setImages(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
    setShowTagInput(false);
  };

  const addPollOption = () => {
    if (pollOptions.length < 4) setPollOptions(prev => [...prev, '']);
  };

  const removePollOption = (i: number) => {
    if (pollOptions.length > 2) setPollOptions(prev => prev.filter((_, idx) => idx !== i));
  };

  const canPublish = (() => {
    if (publishing) return false;
    if (composerType === 'pensee') return text.trim().length > 0 || images.length > 0;
    if (composerType === 'sondage') return text.trim().length > 0 && pollOptions.filter(o => o.trim()).length >= 2;
    if (composerType === 'question_ouverte') return text.trim().length > 0;
    if (composerType === 'arene') return arenaPost !== null;
    return text.trim().length > 0;
  })();

  const handlePublish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    try {
      const base = {
        authorId: user.uid, authorArenaName: arenaName,
        authorPhotoURL: photoURL, authorCredibilityScore: arenaUser?.credibilityScore,
        visibility, createdAt: new Date().toISOString(), tags, destination,
      };

      let partial: Omit<XposePost, 'id' | 'resonanceCount' | 'commentCount' | 'amplifyCount' | 'resonatedBy' | 'amplifiedBy' | 'interestScore'>;

      if (composerType === 'pensee') {
        partial = { ...base, type: 'pensee', caption: text.trim() || undefined };
      } else if (composerType === 'sondage') {
        const opts: PollOption[] = pollOptions
          .filter(o => o.trim())
          .map((o, i) => ({ id: `opt_${i}_${Date.now()}`, text: o.trim(), voteCount: 0, voterIds: [] }));
        const endsAt = new Date(Date.now() + pollDuration * 3600000).toISOString();
        partial = { ...base, type: 'sondage', caption: text.trim() || undefined, pollOptions: opts, pollEndsAt: endsAt, pollDurationHours: pollDuration, destination: 'xpose' };
      } else if (composerType === 'question_ouverte') {
        partial = { ...base, type: 'question_ouverte', questionText: text.trim(), caption: text.trim() };
      } else if (composerType === 'arene') {
        partial = {
          ...base, type: 'arene',
          caption: text.trim() || undefined,
          arenaPostId: arenaPost!.id,
          arenaPostTitle: arenaPost!.title,
          arenaPostExcerpt: arenaPost!.excerpt,
        };
      } else {
        partial = { ...base, type: composerType, caption: text.trim() || undefined };
      }

      const id = await createXposePost(partial);
      if (!id) {
        alert('Erreur : impossible de publier. Vérifiez les règles Firestore (xpose_posts) dans la Firebase Console.');
        return;
      }

      let imageUrls: string[] = [];
      if (images.length > 0) {
        try {
          imageUrls = await uploadPostImages(id, images);
          await updateXposePostImages(id, imageUrls);
        } catch (e) {
          console.warn('Image upload failed:', e);
        }
      }

      const full: XposePost = {
        ...partial, id, imageUrls,
        resonanceCount: 0, commentCount: 0, amplifyCount: 0,
        resonatedBy: [], amplifiedBy: [],
      };
      onPublished(full);

      // reset
      setText(''); setImages([]); setPreviews([]); setTags([]);
      setArenaPost(null); setPollOptions(['', '']);
      setComposerType('pensee');
      onClose?.();
    } catch (err) {
      console.error('Publish error:', err);
      alert(`Erreur lors de la publication : ${err instanceof Error ? err.message : 'inconnue'}. Vérifiez que les règles Firestore xpose_posts sont publiées dans la Firebase Console.`);
    } finally {
      setPublishing(false);
    }
  };

  const postTypes: { key: XposePostType; label: string; icon: string }[] = [
    { key: 'pensee', label: 'Pensée', icon: '✍️' },
    { key: 'sondage', label: 'Sondage', icon: '📊' },
    { key: 'question_ouverte', label: 'Question', icon: '❓' },
    { key: 'arene', label: 'Arène', icon: '🏛️' },
  ];

  const destinations: { key: XposeDestination; label: string }[] = [
    { key: 'xpose', label: 'XPOSE' },
    { key: 'arene', label: 'Arène' },
    { key: 'both', label: 'Les deux' },
  ];

  return (
    <>
      <div style={{ borderBottom: SEP, padding: '12px 16px' }}>
        {/* Post type selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {postTypes.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setComposerType(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                border: `1px solid ${composerType === key ? ACCENT : BORDER}`,
                background: composerType === key ? `${ACCENT}22` : 'transparent',
                color: composerType === key ? ACCENT : TEXT2, cursor: 'pointer',
              }}
            >
              <span>{icon}</span> {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <Avatar name={arenaName} photoURL={photoURL} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Textarea principale */}
            {composerType !== 'arene' && (
              <>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value.slice(0, maxLen))}
                  placeholder={
                    composerType === 'sondage' ? 'Posez votre question… (max 280)' :
                    composerType === 'question_ouverte' ? 'Votre question… (max 280)' :
                    'Quelle est votre pensée ? (max 500)'
                  }
                  rows={text.length > 80 || composerType === 'question_ouverte' ? 4 : 2}
                  style={{ width: '100%', background: 'transparent', border: 'none', color: TEXT, fontSize: 18, resize: 'none', fontFamily: 'inherit', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box', padding: 0 }}
                />
                {text.length > 0 && (
                  <div style={{ textAlign: 'right', fontSize: 12, color: text.length > maxLen - 30 ? '#F87171' : TEXT2, marginBottom: 4 }}>
                    {maxLen - text.length}
                  </div>
                )}
              </>
            )}

            {/* Sondage — options */}
            {composerType === 'sondage' && (
              <div style={{ marginTop: 8 }}>
                {pollOptions.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <input
                      value={opt}
                      onChange={e => setPollOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))}
                      placeholder={`Option ${i + 1}`}
                      style={{ flex: 1, background: '#111', border: SEP, borderRadius: 8, color: TEXT, padding: '8px 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                    />
                    {pollOptions.length > 2 && (
                      <button onClick={() => removePollOption(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, display: 'flex', alignItems: 'center' }}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 4 && (
                  <button
                    onClick={addPollOption}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: `1px dashed ${BORDER}`, borderRadius: 8, color: TEXT2, padding: '7px 12px', fontSize: 14, cursor: 'pointer', width: '100%', marginBottom: 8 }}
                  >
                    <Plus size={15} /> Ajouter une option
                  </button>
                )}
                {/* Durée */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 8 }}>
                  <span style={{ color: TEXT2, fontSize: 13 }}>Durée :</span>
                  {([24, 48, 168] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => setPollDuration(d)}
                      style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${pollDuration === d ? ACCENT : BORDER}`, background: pollDuration === d ? `${ACCENT}22` : 'transparent', color: pollDuration === d ? ACCENT : TEXT2, cursor: 'pointer' }}
                    >
                      {d === 24 ? '1j' : d === 48 ? '2j' : '7j'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Arène — picker */}
            {composerType === 'arene' && (
              <div style={{ marginBottom: 8 }}>
                {arenaPost ? (
                  <div style={{ border: '1px solid #1e2a4a', borderRadius: 10, padding: 10, background: 'rgba(93,123,255,0.06)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Swords size={14} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: TEXT, fontWeight: 600, fontSize: 13, margin: '0 0 2px' }}>{arenaPost.title}</p>
                      <p style={{ color: TEXT2, fontSize: 12, margin: 0 }}>{arenaPost.excerpt.length > 80 ? arenaPost.excerpt.slice(0, 80) + '…' : arenaPost.excerpt}</p>
                    </div>
                    <button onClick={() => setArenaPost(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, padding: 2, display: 'flex', alignItems: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowArenaModal(true)}
                    style={{ width: '100%', background: 'none', border: `1px dashed ${ACCENT}`, borderRadius: 10, color: ACCENT, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <Swords size={16} /> Choisir un débat Arène
                  </button>
                )}
                {arenaPost && (
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value.slice(0, 280))}
                    placeholder="Commentaire optionnel…"
                    rows={2}
                    style={{ width: '100%', marginTop: 8, background: 'transparent', border: 'none', color: TEXT, fontSize: 16, resize: 'none', fontFamily: 'inherit', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box', padding: 0 }}
                  />
                )}
              </div>
            )}

            {/* Image previews */}
            {previews.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8, borderRadius: 12, overflow: 'hidden' }}>
                {previews.map((src, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={src} alt="" style={{ width: '100%', height: 100, objectFit: 'cover' }} />
                    <button
                      onClick={() => removeImage(i)}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Tags display */}
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {tags.map(tag => (
                  <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${ACCENT}22`, color: ACCENT, padding: '2px 8px', borderRadius: 20, fontSize: 13 }}>
                    #{tag}
                    <button onClick={() => setTags(prev => prev.filter(t => t !== tag))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, padding: 0, display: 'flex', alignItems: 'center' }}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Tag input */}
            {showTagInput && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setShowTagInput(false); }}
                  placeholder="Ajouter un tag..."
                  autoFocus
                  style={{ background: '#111', border: SEP, borderRadius: 8, color: TEXT, padding: '6px 10px', fontSize: 14, outline: 'none', fontFamily: 'inherit', flex: 1 }}
                />
                <button onClick={addTag} style={{ background: ACCENT, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}>OK</button>
              </div>
            )}

            {/* Toolbar */}
            <div style={{ marginTop: 4, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
              {/* Ligne 1 : icônes + Publier */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                {composerType === 'pensee' && (
                  <>
                    <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleImages(e.target.files)} />
                    <ToolbarBtn icon={<Image size={18} />} onClick={() => fileRef.current?.click()} disabled={images.length >= 4} title="Images" />
                    <ToolbarBtn icon={<Hash size={18} />} onClick={() => setShowTagInput(v => !v)} title="Tags" />
                    <ToolbarBtn icon={<AtSign size={18} />} onClick={() => setText(t => t + '@')} title="Mention" />
                  </>
                )}
                {/* Visibilité */}
                <button
                  onClick={() => setVisibility(v => v === 'public' ? 'friends' : 'public')}
                  title={visibility === 'public' ? 'Public' : 'Amis seulement'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, padding: '4px 8px' }}
                >
                  <Globe size={14} />
                  <span>{visibility === 'public' ? 'Public' : 'Amis'}</span>
                </button>
              </div>

              <button
                onClick={handlePublish}
                disabled={!canPublish}
                style={{ background: canPublish ? ACCENT : '#1a2a4a', border: 'none', borderRadius: 20, color: canPublish ? '#fff' : '#555', fontWeight: 700, fontSize: 15, padding: '7px 18px', cursor: canPublish ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
              >
                {publishing && <Loader2 size={15} className="animate-spin" />}
                Publier
              </button>
              </div>{/* fin ligne 1 */}

              {/* Ligne 2 : destination pills (sous les icônes) */}
              {composerType !== 'sondage' && composerType !== 'arene' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {destinations.map(d => (
                    <button
                      key={d.key}
                      onClick={() => setDestination(d.key)}
                      style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1px solid ${destination === d.key ? ACCENT : BORDER}`, background: destination === d.key ? `${ACCENT}22` : 'transparent', color: destination === d.key ? ACCENT : TEXT2, cursor: 'pointer' }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>{/* fin toolbar */}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showArenaModal && (
          <ArenaPickerModal
            onClose={() => setShowArenaModal(false)}
            onSelect={(id, title, excerpt) => { setArenaPost({ id, title, excerpt }); setShowArenaModal(false); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Mobile Composer Modal ────────────────────────────────────────────────────

function MobileComposerModal({ user, arenaUser, onPublished, onClose }: {
  user: FirebaseUser; arenaUser: ArenaUser | null;
  onPublished: (post: XposePost) => void; onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      style={{ position: 'fixed', inset: 0, background: BG, zIndex: 300, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: SEP }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT, display: 'flex', alignItems: 'center', marginRight: 16, padding: 4 }}>
          <X size={22} />
        </button>
        <span style={{ color: TEXT, fontWeight: 700, fontSize: 17 }}>Nouveau post</span>
      </div>
      <Composer user={user} arenaUser={arenaUser} onPublished={onPublished} onClose={onClose} />
    </motion.div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  recommended, trendingTags, searchQuery, onSearch, onTagFilter,
  userId, myArenaName, myPhotoURL, followingIds, tagFilter,
}: {
  recommended: XposeRecommendedUser[];
  trendingTags: { tag: string; count: number }[];
  searchQuery: string;
  onSearch: (q: string) => void;
  onTagFilter: (tag: string | null) => void;
  userId: string;
  myArenaName: string;
  myPhotoURL?: string;
  followingIds: string[];
  tagFilter: string | null;
}) {
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? recommended : recommended.slice(0, 3);

  const handleFollow = async (targetUserId: string, targetName: string, targetPhotoURL?: string) => {
    setFollowedIds(prev => [...prev, targetUserId]);
    await sendConnection(userId, myArenaName, myPhotoURL, targetUserId, targetName, targetPhotoURL, 'follow');
  };

  const panelStyle: React.CSSProperties = { border: SEP, borderRadius: 16, marginBottom: 16, overflow: 'hidden' };
  const panelHead: React.CSSProperties = { padding: '14px 16px', borderBottom: SEP, color: TEXT, fontWeight: 800, fontSize: 18 };

  return (
    <div>
      {/* Recherche */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} color={TEXT2} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
          placeholder="Rechercher dans XPOSE"
          style={{ width: '100%', boxSizing: 'border-box', background: '#111', border: SEP, borderRadius: 9999, color: TEXT, padding: '10px 16px 10px 38px', fontSize: 15, outline: 'none', fontFamily: 'inherit' }}
        />
      </div>

      {/* Qui suivre */}
      <div style={panelStyle}>
        <div style={panelHead}>Qui suivre</div>
        {displayed.length === 0 ? (
          <div style={{ padding: '12px 16px', color: TEXT2, fontSize: 14 }}>Aucune suggestion.</div>
        ) : displayed.map(rec => {
          const isFollowed = followedIds.includes(rec.userId) || followingIds.includes(rec.userId);
          return (
            <div
              key={rec.userId}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: SEP }}
              onMouseEnter={e => (e.currentTarget.style.background = HOVER)}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <Avatar name={rec.arenaName} photoURL={rec.photoURL} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>{rec.arenaName}</span>
                  <Star size={11} color="#FBBF24" fill="#FBBF24" />
                  <span style={{ fontSize: 12, color: '#FBBF24' }}>{rec.credibilityScore}</span>
                </div>
                {rec.commonTags.length > 0 && (
                  <span style={{ color: TEXT2, fontSize: 12 }}>#{rec.commonTags.slice(0, 2).join(' #')}</span>
                )}
              </div>
              <button
                onClick={() => !isFollowed && handleFollow(rec.userId, rec.arenaName, rec.photoURL)}
                style={{ background: isFollowed ? 'transparent' : '#fff', border: isFollowed ? `1px solid ${TEXT2}` : 'none', borderRadius: 20, color: isFollowed ? TEXT2 : '#000', fontWeight: 700, fontSize: 13, padding: '5px 14px', cursor: isFollowed ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
              >
                {isFollowed ? <><Check size={13} /> Suivi</> : <><UserPlus size={13} /> Suivre</>}
              </button>
            </div>
          );
        })}
        {recommended.length > 3 && (
          <button
            onClick={() => setShowAll(v => !v)}
            style={{ width: '100%', background: 'none', border: 'none', color: ACCENT, fontSize: 14, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}
          >
            {showAll ? 'Voir moins' : 'Voir plus'}
          </button>
        )}
      </div>

      {/* Tendances */}
      {trendingTags.length > 0 && (
        <div style={panelStyle}>
          <div style={panelHead}>Tendances</div>
          {trendingTags.map(({ tag, count }) => (
            <div
              key={tag}
              onClick={() => onTagFilter(tagFilter === tag ? null : tag)}
              style={{ padding: '10px 16px', borderBottom: SEP, cursor: 'pointer', background: tagFilter === tag ? `${ACCENT}11` : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = tagFilter === tag ? `${ACCENT}22` : HOVER)}
              onMouseLeave={e => (e.currentTarget.style.background = tagFilter === tag ? `${ACCENT}11` : 'none')}
            >
              <div style={{ color: TEXT2, fontSize: 12 }}>Tendance</div>
              <div style={{ color: tagFilter === tag ? ACCENT : TEXT, fontWeight: 700, fontSize: 15 }}>#{tag}</div>
              <div style={{ color: TEXT2, fontSize: 12 }}>{count} posts</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Feed Section ─────────────────────────────────────────────────────────────

function FeedSection({
  user, arenaUser, posts, loading, feedTab, setFeedTab, streak,
  openCommentPostId, setOpenCommentPostId,
  onResonate, onAmplify, onDelete, onVoted,
  onGoToArena, onViewProfile, onPublished, onBack,
  isMobile, onOpenComposer,
  recommended, trendingTags, searchQuery, setSearchQuery,
  tagFilter, setTagFilter, followingIds,
}: {
  user: FirebaseUser; arenaUser: ArenaUser | null;
  posts: XposePost[]; loading: boolean;
  feedTab: 'pour_vous' | 'abonnements';
  setFeedTab: (t: 'pour_vous' | 'abonnements') => void;
  streak: number;
  openCommentPostId: string | null;
  setOpenCommentPostId: (id: string | null) => void;
  onResonate: (post: XposePost) => void;
  onAmplify: (post: XposePost) => void;
  onDelete: (id: string) => void;
  onVoted: (updated: XposePost) => void;
  onGoToArena: (id?: string) => void;
  onViewProfile: (uid: string) => void;
  onPublished: (post: XposePost) => void;
  onBack: () => void;
  isMobile: boolean;
  onOpenComposer: () => void;
  recommended: XposeRecommendedUser[];
  trendingTags: { tag: string; count: number }[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  tagFilter: string | null;
  setTagFilter: (t: string | null) => void;
  followingIds: string[];
}) {
  const arenaName = arenaUser?.arenaName ?? user.displayName ?? 'Anonyme';
  const photoURL = arenaUser?.photoURL ?? user.photoURL ?? undefined;

  const displayed = posts.filter(p => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!(p.caption?.toLowerCase().includes(q) || p.tags?.some(t => t.toLowerCase().includes(q)) || p.authorArenaName.toLowerCase().includes(q))) return false;
    }
    if (tagFilter) {
      if (!p.tags?.includes(tagFilter)) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', maxWidth: 980, margin: '0 auto', alignItems: 'flex-start' }}>
      {/* Feed col */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: 600, borderRight: isMobile ? 'none' : SEP }}>
        {/* Sticky header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', borderBottom: SEP }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={onBack}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT, display: 'flex', alignItems: 'center', padding: 6, borderRadius: '50%' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <ArrowLeft size={20} />
              </button>
              <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.3px', color: TEXT }}>XPOSE</span>
            </div>
            {streak > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: RESONANCE_ACTIVE, fontWeight: 700, fontSize: 15 }}>
                <Flame size={18} fill={RESONANCE_ACTIVE} />{streak} jour{streak > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Feed tabs */}
          <div style={{ display: 'flex', padding: '4px 0 0' }}>
            {([['pour_vous', 'Pour vous'], ['abonnements', 'Abonnements']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFeedTab(key)}
                style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', color: feedTab === key ? TEXT : TEXT2, fontWeight: feedTab === key ? 700 : 400, fontSize: 15, padding: '12px 0', position: 'relative' }}
              >
                {label}
                {feedTab === key && (
                  <motion.div layoutId="feed-tab-bar" style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 56, height: 3, borderRadius: 2, background: ACCENT }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop composer */}
        {!isMobile && (
          <Composer user={user} arenaUser={arenaUser} onPublished={onPublished} />
        )}

        {/* Mobile tap-to-compose */}
        {isMobile && (
          <div
            onClick={onOpenComposer}
            style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: SEP, cursor: 'pointer' }}
          >
            <Avatar name={arenaName} photoURL={photoURL} size={40} />
            <div style={{ flex: 1, background: 'transparent', border: 'none', color: TEXT2, fontSize: 18, display: 'flex', alignItems: 'center' }}>
              Quelle est votre pensée ?
            </div>
          </div>
        )}

        {/* Posts */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 48 }}>
            <Loader2 size={28} color={ACCENT} className="animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: TEXT2 }}>
            {tagFilter
              ? `Aucun post avec #${tagFilter}.`
              : searchQuery
              ? `Aucun résultat pour « ${searchQuery} ».`
              : feedTab === 'abonnements'
              ? 'Suivez des personnes pour voir leurs posts ici.'
              : 'Aucun post pour l\'instant. Soyez le premier à publier !'}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {displayed.map(post => (
              <motion.div key={post.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                <PostCard
                  post={post}
                  userId={user.uid}
                  showComments={openCommentPostId === post.id}
                  onToggleComments={() => setOpenCommentPostId(openCommentPostId === post.id ? null : post.id)}
                  onResonate={() => onResonate(post)}
                  onAmplify={() => onAmplify(post)}
                  onGoToArena={onGoToArena}
                  onViewProfile={onViewProfile}
                  onDelete={onDelete}
                  onVoted={onVoted}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Sidebar desktop */}
      {!isMobile && (
        <div style={{ width: 320, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', padding: '16px 0 16px 16px', scrollbarWidth: 'none' }}>
          <Sidebar
            recommended={recommended}
            trendingTags={trendingTags}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onTagFilter={setTagFilter}
            userId={user.uid}
            myArenaName={arenaName}
            myPhotoURL={photoURL}
            followingIds={followingIds}
            tagFilter={tagFilter}
          />
        </div>
      )}
    </div>
  );
}

// ─── Profile Fallback ─────────────────────────────────────────────────────────

function ProfileFallback({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: TEXT2 }}>
      <User size={48} color={TEXT2} style={{ marginBottom: 16 }} />
      <p style={{ fontSize: 16, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Page profil non disponible</p>
      <p style={{ fontSize: 14, marginBottom: 24 }}>Le composant XposeProfilePage n'est pas encore créé.</p>
      <button onClick={onBack} style={{ background: ACCENT, border: 'none', borderRadius: 20, color: '#fff', fontWeight: 700, fontSize: 15, padding: '8px 20px', cursor: 'pointer' }}>
        Retour au feed
      </button>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  user: FirebaseUser;
  arenaUser: ArenaUser | null;
  onBack: () => void;
  onGoToArena: (postId?: string) => void;
}

// ─── XposePage ────────────────────────────────────────────────────────────────

export default function XposePage({ user, arenaUser, onBack, onGoToArena }: Props) {
  const [section, setSection] = useState<Section>('feed');
  const [feedTab, setFeedTab] = useState<'pour_vous' | 'abonnements'>('pour_vous');
  const [profileTargetId, setProfileTargetId] = useState<string | null>(null);
  const [posts, setPosts] = useState<XposePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [recommended, setRecommended] = useState<XposeRecommendedUser[]>([]);
  const [trendingTags, setTrendingTags] = useState<{ tag: string; count: number }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [openCommentPostId, setOpenCommentPostId] = useState<string | null>(null);
  const [showMobileComposer, setShowMobileComposer] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Init
  useEffect(() => {
    const init = async () => {
      const [streakData, connections] = await Promise.all([
        updateStreak(user.uid),
        getMyConnections(user.uid),
      ]);
      setStreak(streakData.currentStreak);

      const ids = connections
        .filter(c => c.status === 'accepted')
        .map(c => (c.fromUserId === user.uid ? c.toUserId : c.fromUserId));
      setFollowingIds(ids);

      const interests = arenaUser?.passions ?? [];
      setMyInterests(interests);

      const [rec, trends] = await Promise.all([
        getRecommendedUsers(user.uid, interests, ids, 6),
        getTrendingTags(8),
      ]);
      setRecommended(rec);
      setTrendingTags(trends);
    };
    init();
  }, [user.uid, arenaUser]);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      if (feedTab === 'pour_vous') {
        const raw = await getPublicFeed(60);
        const scored = raw.map(p => ({ ...p, interestScore: scorePost(p, myInterests, followingIds) }));
        scored.sort((a, b) => (b.interestScore ?? 0) - (a.interestScore ?? 0));
        setPosts(scored);
      } else {
        const feed = await getFollowingFeed(followingIds);
        setPosts(feed);
      }
    } finally {
      setLoading(false);
    }
  }, [feedTab, myInterests, followingIds]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  const handlePublished = (post: XposePost) => setPosts(prev => [post, ...prev]);

  const handleResonate = async (post: XposePost) => {
    const isResonated = post.resonatedBy.includes(user.uid);
    await resonatePost(post.id, user.uid, isResonated);
    setPosts(prev => prev.map(p =>
      p.id === post.id
        ? { ...p, resonanceCount: isResonated ? p.resonanceCount - 1 : p.resonanceCount + 1, resonatedBy: isResonated ? p.resonatedBy.filter(id => id !== user.uid) : [...p.resonatedBy, user.uid] }
        : p
    ));
  };

  const handleAmplify = async (post: XposePost) => {
    if (post.amplifiedBy.includes(user.uid)) return;
    await amplifyPost(post.id, user.uid);
    setPosts(prev => prev.map(p =>
      p.id === post.id ? { ...p, amplifyCount: p.amplifyCount + 1, amplifiedBy: [...p.amplifiedBy, user.uid] } : p
    ));
  };

  const handleDelete = (id: string) => setPosts(prev => prev.filter(p => p.id !== id));

  const handleVoted = (updated: XposePost) => setPosts(prev => prev.map(p => p.id === updated.id ? updated : p));

  const handleViewProfile = (uid: string) => {
    if (uid === user.uid) {
      setSection('profile');
    } else {
      setProfileTargetId(uid);
      setSection('profile_other');
    }
  };

  const handleGoToArena = (postId?: string) => {
    setSection('arene');
    if (postId) onGoToArena(postId);
  };

  // ── Nav items ──────────────────────────────────────────────────────────────

  const navItems: { key: Section; icon: React.ReactNode; label: string }[] = [
    { key: 'feed', icon: <Home size={22} />, label: 'Feed' },
    { key: 'arene', icon: <Swords size={22} />, label: 'Arène' },
    { key: 'profile', icon: <User size={22} />, label: 'Profil' },
  ];

  // ── Render section ─────────────────────────────────────────────────────────

  const renderSection = () => {
    if (section === 'arene') {
      return (
        <ArenaPage
          user={user}
          supabaseUserId={user.uid}
          onBack={() => setSection('feed')}
          onGoToXpose={() => setSection('feed')}
        />
      );
    }

    if (section === 'profile') {
      if (!XposeProfilePage) return <ProfileFallback onBack={() => setSection('feed')} />;
      return (
        <XposeProfilePage
          user={user}
          targetUserId={user.uid}
          myArenaUser={arenaUser}
          onBack={() => setSection('feed')}
          onViewProfile={(uid) => { setProfileTargetId(uid); setSection('profile_other'); }}
        />
      );
    }

    if (section === 'profile_other' && profileTargetId) {
      if (!XposeProfilePage) return <ProfileFallback onBack={() => setSection('feed')} />;
      return (
        <XposeProfilePage
          user={user}
          targetUserId={profileTargetId}
          myArenaUser={arenaUser}
          onBack={() => setSection('feed')}
          onViewProfile={(uid) => setProfileTargetId(uid)}
        />
      );
    }

    return (
      <FeedSection
        user={user}
        arenaUser={arenaUser}
        posts={posts}
        loading={loading}
        feedTab={feedTab}
        setFeedTab={(t) => { setFeedTab(t); }}
        streak={streak}
        openCommentPostId={openCommentPostId}
        setOpenCommentPostId={setOpenCommentPostId}
        onResonate={handleResonate}
        onAmplify={handleAmplify}
        onDelete={handleDelete}
        onVoted={handleVoted}
        onGoToArena={handleGoToArena}
        onViewProfile={handleViewProfile}
        onPublished={handlePublished}
        onBack={onBack}
        isMobile={isMobile}
        onOpenComposer={() => setShowMobileComposer(true)}
        recommended={recommended}
        trendingTags={trendingTags}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        followingIds={followingIds}
      />
    );
  };

  const isFullPage = section === 'arene' || section === 'profile' || section === 'profile_other';

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'inherit', display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>

      {/* ── Desktop left rail ──────────────────────────────────────────────────── */}
      {!isMobile && (
        <nav style={{ width: 60, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, borderRight: SEP, gap: 4 }}>
          {navItems.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              title={label}
              style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: (section === key || (section === 'profile_other' && key === 'profile')) ? `${ACCENT}22` : 'none',
                color: (section === key || (section === 'profile_other' && key === 'profile')) ? ACCENT : TEXT2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (section !== key) e.currentTarget.style.background = HOVER; }}
              onMouseLeave={e => { if (section !== key && !(section === 'profile_other' && key === 'profile')) e.currentTarget.style.background = 'none'; }}
            >
              {icon}
            </button>
          ))}
        </nav>
      )}

      {/* ── Main content ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: isMobile ? 70 : 0 }}>
        {renderSection()}
      </div>

      {/* ── Mobile bottom tab bar ──────────────────────────────────────────────── */}
      {isMobile && (
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 60, background: 'rgba(0,0,0,0.95)', borderTop: SEP, display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 100, backdropFilter: 'blur(12px)' }}>
          {navItems.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              title={label}
              style={{
                flex: 1, height: '100%', background: 'none', border: 'none', cursor: 'pointer',
                color: (section === key || (section === 'profile_other' && key === 'profile')) ? ACCENT : TEXT2,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                fontSize: 10, fontWeight: 600,
              }}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* ── Mobile FAB ─────────────────────────────────────────────────────────── */}
      {isMobile && !isFullPage && section === 'feed' && (
        <button
          onClick={() => setShowMobileComposer(true)}
          style={{ position: 'fixed', bottom: 76, right: 20, width: 56, height: 56, borderRadius: '50%', background: ACCENT, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(93,123,255,0.5)', zIndex: 99 }}
        >
          <Plus size={26} color="#fff" />
        </button>
      )}

      {/* ── Mobile composer modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showMobileComposer && (
          <MobileComposerModal
            user={user}
            arenaUser={arenaUser}
            onPublished={handlePublished}
            onClose={() => setShowMobileComposer(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
