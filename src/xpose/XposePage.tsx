import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Zap, MessageSquare, Share2, ArrowLeft, Plus, Send, X,
  Loader2, Flame, ChevronDown, ChevronUp, Swords, Users,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ArenaUser } from '../arena/arenaTypes';
import type { XposePost, XposeComment, XposeCommentType, XposeVisibility } from './xposeTypes';
import {
  getPublicFeed, getCompanionsFeed, createXposePost,
  resonatePost, amplifyPost, addXposeComment, getXposeComments,
  upvoteXposeComment, updateStreak, scorePost,
} from './xposeFirestore';
import { getMyConnections, getArenaUser } from '../arena/arenaFirestore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  user: User;
  arenaUser: ArenaUser | null;
  onBack: () => void;
  onGoToArena: (postId?: string) => void;
}

type Tab = 'pour_vous' | 'compagnons' | 'decouvrir';

// ─── Constants ────────────────────────────────────────────────────────────────

const BG = '#0D0E14';
const CARD_BG = '#13161E';
const CARD_BORDER = '1px solid rgba(255,255,255,0.07)';
const ACCENT = 'linear-gradient(135deg, #7C3AED, #5D7BFF)';
const TEXT_PRIMARY = '#fff';
const TEXT_SECONDARY = 'rgba(255,255,255,0.5)';
const BORDER_RADIUS = 20;

const PALETTE = ['#5D7BFF', '#34D399', '#F87171', '#FBBF24', '#A78BFA', '#F97316', '#38BDF8', '#FB7185'];

function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'maintenant';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, photoURL, size = 38 }: { name: string; photoURL?: string; size?: number }) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0,
        }}
      />
    );
  }
  const color = avatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
      fontSize: size * 0.38, fontWeight: 700, color: '#fff',
      letterSpacing: '0.5px',
    }}>
      {initials(name)}
    </div>
  );
}

// ─── Comment Item ─────────────────────────────────────────────────────────────

function CommentItem({
  comment,
  postId,
  userId,
  onUpvote,
}: {
  comment: XposeComment;
  postId: string;
  userId: string;
  onUpvote: (commentId: string, isUp: boolean) => void;
}) {
  const isUpvoted = comment.upvotedBy.includes(userId);

  const typeColors: Record<XposeCommentType, string> = {
    argument: '#5D7BFF',
    question: '#FBBF24',
    intuition: '#A78BFA',
  };
  const typeLabels: Record<XposeCommentType, string> = {
    argument: 'Argument',
    question: 'Question',
    intuition: 'Intuition',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', gap: 10, padding: '10px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <Avatar name={comment.authorArenaName} photoURL={comment.authorPhotoURL} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
            {comment.authorArenaName}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
            background: typeColors[comment.type] + '22',
            color: typeColors[comment.type], border: `1px solid ${typeColors[comment.type]}44`,
          }}>
            {typeLabels[comment.type]}
          </span>
          <span style={{ fontSize: 11, color: TEXT_SECONDARY }}>{timeAgo(comment.createdAt)}</span>
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, margin: 0 }}>
          {comment.content}
        </p>
        <button
          onClick={() => onUpvote(comment.id, isUpvoted)}
          style={{
            marginTop: 6, background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            color: isUpvoted ? '#FBBF24' : TEXT_SECONDARY, fontSize: 12, padding: 0,
          }}
        >
          <Zap size={12} fill={isUpvoted ? '#FBBF24' : 'none'} />
          {comment.upvotes > 0 && <span>{comment.upvotes}</span>}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Comments Section ─────────────────────────────────────────────────────────

function CommentsSection({
  postId,
  userId,
  authorArenaName,
}: {
  postId: string;
  userId: string;
  authorArenaName: string;
}) {
  const [comments, setComments] = useState<XposeComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<XposeCommentType>('argument');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    getXposeComments(postId).then(c => { setComments(c); setLoading(false); });
  }, [postId]);

  const handleUpvote = async (commentId: string, isUp: boolean) => {
    await upvoteXposeComment(postId, commentId, userId, isUp);
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? {
            ...c,
            upvotes: isUp ? c.upvotes - 1 : c.upvotes + 1,
            upvotedBy: isUp ? c.upvotedBy.filter(id => id !== userId) : [...c.upvotedBy, userId],
          }
        : c
    ));
  };

  const handleSubmit = async () => {
    if (!newContent.trim()) return;
    setSubmitting(true);
    const id = await addXposeComment(postId, {
      authorId: userId,
      authorArenaName,
      type: newType,
      content: newContent.trim(),
      parentCommentId: null,
      createdAt: new Date().toISOString(),
    });
    if (id) {
      const newComment: XposeComment = {
        id,
        authorId: userId,
        authorArenaName,
        type: newType,
        content: newContent.trim(),
        parentCommentId: null,
        createdAt: new Date().toISOString(),
        upvotes: 0,
        upvotedBy: [],
      };
      setComments(prev => [...prev, newComment]);
      setNewContent('');
    }
    setSubmitting(false);
  };

  const typeOptions: { type: XposeCommentType; label: string; color: string }[] = [
    { type: 'argument', label: 'Argument', color: '#5D7BFF' },
    { type: 'question', label: 'Question', color: '#FBBF24' },
    { type: 'intuition', label: 'Intuition', color: '#A78BFA' },
  ];

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
          <Loader2 size={18} color={TEXT_SECONDARY} className="animate-spin" />
        </div>
      ) : (
        <>
          {comments.map(c => (
            <CommentItem key={c.id} comment={c} postId={postId} userId={userId} onUpvote={handleUpvote} />
          ))}
          {comments.length === 0 && (
            <p style={{ fontSize: 13, color: TEXT_SECONDARY, textAlign: 'center', padding: '8px 0' }}>
              Aucun commentaire · Soyez le premier
            </p>
          )}
        </>
      )}

      {/* Add comment */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {typeOptions.map(opt => (
            <button
              key={opt.type}
              onClick={() => setNewType(opt.type)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                border: `1px solid ${newType === opt.type ? opt.color : 'rgba(255,255,255,0.12)'}`,
                background: newType === opt.type ? opt.color + '22' : 'transparent',
                color: newType === opt.type ? opt.color : TEXT_SECONDARY,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Votre réaction..."
            rows={2}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, padding: '8px 12px', color: TEXT_PRIMARY,
              fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !newContent.trim()}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none',
              background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: submitting || !newContent.trim() ? 'not-allowed' : 'pointer',
              opacity: submitting || !newContent.trim() ? 0.5 : 1, flexShrink: 0,
            }}
          >
            {submitting
              ? <Loader2 size={16} color="#fff" className="animate-spin" />
              : <Send size={15} color="#fff" />
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Post Footer ──────────────────────────────────────────────────────────────

function PostFooter({
  post,
  userId,
  onResonate,
  onAmplify,
  onToggleComments,
  showComments,
}: {
  post: XposePost;
  userId: string;
  onResonate: () => void;
  onAmplify: () => void;
  onToggleComments: () => void;
  showComments: boolean;
}) {
  const isResonated = post.resonatedBy.includes(userId);
  const isAmplified = post.amplifiedBy.includes(userId);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Resonate */}
      <motion.button
        whileTap={{ scale: 1.3 }}
        onClick={onResonate}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: isResonated ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${isResonated ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 20, padding: '5px 12px', cursor: 'pointer',
          color: isResonated ? '#FBBF24' : TEXT_SECONDARY, fontSize: 13, fontWeight: 500,
          transition: 'all 0.2s',
        }}
      >
        <Zap size={14} fill={isResonated ? '#FBBF24' : 'none'} color={isResonated ? '#FBBF24' : TEXT_SECONDARY} />
        <span>{post.resonanceCount}</span>
      </motion.button>

      {/* Comments */}
      <button
        onClick={onToggleComments}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: showComments ? 'rgba(93,123,255,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${showComments ? 'rgba(93,123,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 20, padding: '5px 12px', cursor: 'pointer',
          color: showComments ? '#5D7BFF' : TEXT_SECONDARY, fontSize: 13, fontWeight: 500,
          transition: 'all 0.2s',
        }}
      >
        <MessageSquare size={14} />
        <span>{post.commentCount}</span>
      </button>

      {/* Amplify */}
      <button
        onClick={onAmplify}
        disabled={isAmplified}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: isAmplified ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${isAmplified ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 20, padding: '5px 12px', cursor: isAmplified ? 'default' : 'pointer',
          color: isAmplified ? '#34D399' : TEXT_SECONDARY, fontSize: 13, fontWeight: 500,
          opacity: isAmplified ? 0.7 : 1, transition: 'all 0.2s',
        }}
      >
        <Share2 size={14} />
        <span>{post.amplifyCount}</span>
      </button>
    </div>
  );
}

// ─── Pensée Card ──────────────────────────────────────────────────────────────

function PenseeCard({
  post, userId, authorArenaName, onResonate, onAmplify,
}: {
  post: XposePost;
  userId: string;
  authorArenaName: string;
  onResonate: (postId: string, isResonated: boolean) => void;
  onAmplify: (postId: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [localPost, setLocalPost] = useState(post);

  const handleResonate = () => {
    const isResonated = localPost.resonatedBy.includes(userId);
    setLocalPost(prev => ({
      ...prev,
      resonanceCount: isResonated ? prev.resonanceCount - 1 : prev.resonanceCount + 1,
      resonatedBy: isResonated ? prev.resonatedBy.filter(id => id !== userId) : [...prev.resonatedBy, userId],
    }));
    onResonate(post.id, isResonated);
  };

  const handleAmplify = () => {
    setLocalPost(prev => ({
      ...prev,
      amplifyCount: prev.amplifyCount + 1,
      amplifiedBy: [...prev.amplifiedBy, userId],
    }));
    onAmplify(post.id);
  };

  return (
    <div style={{
      background: CARD_BG, border: CARD_BORDER, borderRadius: BORDER_RADIUS,
      padding: '18px 20px', marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Avatar name={post.authorArenaName} photoURL={post.authorPhotoURL} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: TEXT_PRIMARY }}>{post.authorArenaName}</div>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>{timeAgo(post.createdAt)}</div>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
          background: 'rgba(255,255,255,0.06)', color: TEXT_SECONDARY, letterSpacing: '0.5px',
        }}>
          PENSÉE
        </div>
      </div>

      {/* Caption */}
      {post.caption && (
        <p style={{ fontSize: 15, color: TEXT_PRIMARY, lineHeight: 1.6, margin: '0 0 12px' }}>
          {post.caption}
        </p>
      )}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {post.tags.map(tag => (
            <span key={tag} style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 20,
              background: 'rgba(93,123,255,0.12)', color: '#5D7BFF',
              border: '1px solid rgba(93,123,255,0.2)',
            }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      <PostFooter
        post={localPost}
        userId={userId}
        onResonate={handleResonate}
        onAmplify={handleAmplify}
        onToggleComments={() => setShowComments(v => !v)}
        showComments={showComments}
      />

      <AnimatePresence>
        {showComments && (
          <motion.div
            key="comments"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <CommentsSection postId={post.id} userId={userId} authorArenaName={authorArenaName} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Echange IA Card ──────────────────────────────────────────────────────────

function EchangeIACard({
  post, userId, authorArenaName, onResonate, onAmplify,
}: {
  post: XposePost;
  userId: string;
  authorArenaName: string;
  onResonate: (postId: string, isResonated: boolean) => void;
  onAmplify: (postId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [localPost, setLocalPost] = useState(post);

  const MAX_CHARS = 180;
  const responseText = post.aiResponse ?? '';
  const isTruncatable = responseText.length > MAX_CHARS;
  const displayText = expanded || !isTruncatable ? responseText : responseText.slice(0, MAX_CHARS) + '…';

  const handleResonate = () => {
    const isResonated = localPost.resonatedBy.includes(userId);
    setLocalPost(prev => ({
      ...prev,
      resonanceCount: isResonated ? prev.resonanceCount - 1 : prev.resonanceCount + 1,
      resonatedBy: isResonated ? prev.resonatedBy.filter(id => id !== userId) : [...prev.resonatedBy, userId],
    }));
    onResonate(post.id, isResonated);
  };

  const handleAmplify = () => {
    setLocalPost(prev => ({
      ...prev,
      amplifyCount: prev.amplifyCount + 1,
      amplifiedBy: [...prev.amplifiedBy, userId],
    }));
    onAmplify(post.id);
  };

  return (
    <div style={{
      background: CARD_BG, border: CARD_BORDER, borderRadius: BORDER_RADIUS,
      padding: '18px 20px', marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Avatar name={post.authorArenaName} photoURL={post.authorPhotoURL} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: TEXT_PRIMARY }}>{post.authorArenaName}</div>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>{timeAgo(post.createdAt)}</div>
        </div>
        {post.personaName && (
          <div style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
            background: 'rgba(124,58,237,0.2)', color: '#A78BFA',
            border: '1px solid rgba(124,58,237,0.3)', whiteSpace: 'nowrap',
          }}>
            IA · {post.personaName}
          </div>
        )}
      </div>

      {/* AI Question */}
      {post.aiQuestion && (
        <div style={{
          borderLeft: '3px solid #7C3AED', paddingLeft: 12, marginBottom: 12,
          fontStyle: 'italic', color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.5,
        }}>
          {post.aiQuestion}
        </div>
      )}

      {/* AI Response */}
      {responseText && (
        <div style={{ marginBottom: 12 }}>
          <p style={{
            fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.65,
            margin: '0 0 4px', background: 'rgba(93,123,255,0.06)',
            padding: '10px 14px', borderRadius: 12,
            border: '1px solid rgba(93,123,255,0.1)',
          }}>
            {displayText}
          </p>
          {isTruncatable && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#5D7BFF', fontSize: 12, fontWeight: 600, padding: '4px 0',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {expanded ? <><ChevronUp size={13} /> Réduire</> : <><ChevronDown size={13} /> Voir tout</>}
            </button>
          )}
        </div>
      )}

      {/* Caption */}
      {post.caption && (
        <p style={{ fontSize: 14, color: TEXT_SECONDARY, lineHeight: 1.5, margin: '0 0 12px' }}>
          {post.caption}
        </p>
      )}

      <PostFooter
        post={localPost}
        userId={userId}
        onResonate={handleResonate}
        onAmplify={handleAmplify}
        onToggleComments={() => setShowComments(v => !v)}
        showComments={showComments}
      />

      <AnimatePresence>
        {showComments && (
          <motion.div
            key="comments"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <CommentsSection postId={post.id} userId={userId} authorArenaName={authorArenaName} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Arene Card ───────────────────────────────────────────────────────────────

function AreneCard({
  post, userId, onResonate, onAmplify, onGoToArena,
}: {
  post: XposePost;
  userId: string;
  onResonate: (postId: string, isResonated: boolean) => void;
  onAmplify: (postId: string) => void;
  onGoToArena: (postId?: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [localPost, setLocalPost] = useState(post);

  const handleResonate = () => {
    const isResonated = localPost.resonatedBy.includes(userId);
    setLocalPost(prev => ({
      ...prev,
      resonanceCount: isResonated ? prev.resonanceCount - 1 : prev.resonanceCount + 1,
      resonatedBy: isResonated ? prev.resonatedBy.filter(id => id !== userId) : [...prev.resonatedBy, userId],
    }));
    onResonate(post.id, isResonated);
  };

  const handleAmplify = () => {
    setLocalPost(prev => ({
      ...prev,
      amplifyCount: prev.amplifyCount + 1,
      amplifiedBy: [...prev.amplifiedBy, userId],
    }));
    onAmplify(post.id);
  };

  const excerpt = post.arenaPostExcerpt ?? '';
  const displayExcerpt = excerpt.length > 200 ? excerpt.slice(0, 200) + '…' : excerpt;

  const agreeCount = post.arenaAgree ?? 0;
  const disagreeCount = post.arenaDisagree ?? 0;
  const total = post.arenaTotal ?? (agreeCount + disagreeCount);
  const hasStance = total > 0;
  const agreePct = hasStance ? Math.round((agreeCount / total) * 100) : 50;
  const disagreePct = hasStance ? 100 - agreePct : 50;

  return (
    <div style={{
      background: CARD_BG, border: CARD_BORDER, borderRadius: BORDER_RADIUS,
      padding: '18px 20px', marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Avatar name={post.authorArenaName} photoURL={post.authorPhotoURL} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: TEXT_PRIMARY }}>{post.authorArenaName}</div>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>{timeAgo(post.createdAt)}</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: 'rgba(248,113,113,0.15)', color: '#F87171',
          border: '1px solid rgba(248,113,113,0.25)',
        }}>
          <Swords size={11} />
          <span>ARÈNE</span>
        </div>
      </div>

      {/* Title */}
      {post.arenaPostTitle && (
        <h3 style={{
          fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY,
          margin: '0 0 8px', lineHeight: 1.4,
        }}>
          {post.arenaPostTitle}
        </h3>
      )}

      {/* Excerpt */}
      {displayExcerpt && (
        <p style={{
          fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6,
          margin: '0 0 14px', fontStyle: 'italic',
        }}>
          {displayExcerpt}
        </p>
      )}

      {/* Stance bar */}
      {hasStance && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#34D399', fontWeight: 600 }}>Pour {agreePct}%</span>
            <span style={{ fontSize: 12, color: '#F87171', fontWeight: 600 }}>Contre {disagreePct}%</span>
          </div>
          <div style={{
            height: 6, borderRadius: 6, overflow: 'hidden',
            background: 'rgba(248,113,113,0.3)', display: 'flex',
          }}>
            <div style={{
              width: `${agreePct}%`, background: '#34D399',
              transition: 'width 0.5s ease', borderRadius: '6px 0 0 6px',
            }} />
          </div>
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 4, textAlign: 'center' }}>
            {total} participants
          </div>
        </div>
      )}

      {/* Join button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onGoToArena(post.arenaPostId)}
        style={{
          width: '100%', padding: '12px 20px', borderRadius: 14,
          background: ACCENT, border: 'none', cursor: 'pointer',
          color: '#fff', fontWeight: 700, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 4,
        }}
      >
        <Swords size={16} />
        Rejoindre le débat →
      </motion.button>

      <PostFooter
        post={localPost}
        userId={userId}
        onResonate={handleResonate}
        onAmplify={handleAmplify}
        onToggleComments={() => setShowComments(v => !v)}
        showComments={showComments}
      />

      <AnimatePresence>
        {showComments && (
          <motion.div
            key="comments"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <CommentsSection
              postId={post.id}
              userId={userId}
              authorArenaName={post.authorArenaName}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Create Post Modal ────────────────────────────────────────────────────────

function CreatePostModal({
  user,
  arenaUser,
  onClose,
  onCreated,
}: {
  user: User;
  arenaUser: ArenaUser | null;
  onClose: () => void;
  onCreated: (post: XposePost) => void;
}) {
  const [caption, setCaption] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [visibility, setVisibility] = useState<XposeVisibility>('public');
  const [submitting, setSubmitting] = useState(false);

  const authorArenaName = arenaUser?.arenaName ?? user.displayName ?? 'Anonyme';
  const MAX_CAPTION = 280;
  const charsLeft = MAX_CAPTION - caption.length;

  const parseTags = (input: string): string[] => {
    return input
      .split(/\s+/)
      .map(t => t.replace(/^#/, '').trim())
      .filter(t => t.length > 0)
      .slice(0, 5);
  };

  const handleSubmit = async () => {
    if (!caption.trim()) return;
    setSubmitting(true);
    const tags = parseTags(tagsInput);
    const id = await createXposePost({
      authorId: user.uid,
      authorArenaName,
      authorPhotoURL: arenaUser?.photoURL ?? user.photoURL ?? undefined,
      type: 'pensee',
      caption: caption.trim(),
      tags,
      visibility,
      createdAt: new Date().toISOString(),
    });
    if (id) {
      const newPost: XposePost = {
        id,
        authorId: user.uid,
        authorArenaName,
        authorPhotoURL: arenaUser?.photoURL ?? user.photoURL ?? undefined,
        type: 'pensee',
        caption: caption.trim(),
        tags,
        visibility,
        createdAt: new Date().toISOString(),
        resonanceCount: 0,
        commentCount: 0,
        amplifyCount: 0,
        resonatedBy: [],
        amplifiedBy: [],
      };
      onCreated(newPost);
    }
    setSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640,
          background: '#17191F', borderRadius: '24px 24px 0 0',
          padding: '24px 24px 40px', border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: 'none',
        }}
      >
        {/* Handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 4,
          background: 'rgba(255,255,255,0.2)', margin: '0 auto 20px',
        }} />

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY }}>
            Nouvelle pensée
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_SECONDARY, padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Author */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Avatar name={authorArenaName} photoURL={arenaUser?.photoURL ?? user.photoURL ?? undefined} />
          <span style={{ fontWeight: 600, fontSize: 14, color: TEXT_PRIMARY }}>{authorArenaName}</span>
        </div>

        {/* Caption */}
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value.slice(0, MAX_CAPTION))}
          placeholder="Quelle pensée souhaitez-vous xposer ?"
          rows={4}
          autoFocus
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
            padding: '12px 14px', color: TEXT_PRIMARY, fontSize: 15, resize: 'none',
            outline: 'none', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box',
          }}
        />
        <div style={{ textAlign: 'right', fontSize: 12, color: charsLeft < 30 ? '#F87171' : TEXT_SECONDARY, marginBottom: 14 }}>
          {charsLeft} caractères restants
        </div>

        {/* Tags */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: TEXT_SECONDARY, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Tags (max 5, séparés par des espaces)
          </label>
          <input
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
            placeholder="#ia #débat #philosophie"
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
              padding: '10px 14px', color: TEXT_PRIMARY, fontSize: 14,
              outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          {parseTags(tagsInput).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {parseTags(tagsInput).map(tag => (
                <span key={tag} style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 20,
                  background: 'rgba(93,123,255,0.12)', color: '#5D7BFF',
                  border: '1px solid rgba(93,123,255,0.2)',
                }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Visibility */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, color: TEXT_SECONDARY, fontWeight: 600, display: 'block', marginBottom: 8 }}>
            Visibilité
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['public', 'friends'] as XposeVisibility[]).map(v => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 12,
                  border: `1px solid ${visibility === v ? '#7C3AED' : 'rgba(255,255,255,0.1)'}`,
                  background: visibility === v ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                  color: visibility === v ? '#A78BFA' : TEXT_SECONDARY,
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {v === 'public' ? <><Zap size={13} /> Public</> : <><Users size={13} /> Amis</>}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubmit}
          disabled={submitting || !caption.trim()}
          style={{
            width: '100%', padding: '14px 20px', borderRadius: 16, border: 'none',
            background: submitting || !caption.trim() ? 'rgba(255,255,255,0.08)' : ACCENT,
            color: submitting || !caption.trim() ? TEXT_SECONDARY : '#fff',
            fontWeight: 700, fontSize: 15, cursor: submitting || !caption.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s',
          }}
        >
          {submitting
            ? <><Loader2 size={18} className="animate-spin" /> Publication…</>
            : <><Zap size={18} /> Xposer</>
          }
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
      }}>
        <Zap size={32} color="#7C3AED" />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 8px' }}>
        Aucune publication
      </h3>
      <p style={{ fontSize: 14, color: TEXT_SECONDARY, margin: '0 0 24px', lineHeight: 1.6 }}>
        Soyez le premier à xposer votre pensée et lancer la discussion.
      </p>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onCreate}
        style={{
          padding: '12px 28px', borderRadius: 20, border: 'none',
          background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <Plus size={18} />
        Créer ma première pensée
      </motion.button>
    </div>
  );
}

// ─── XposePage ────────────────────────────────────────────────────────────────

export default function XposePage({ user, arenaUser, onBack, onGoToArena }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('pour_vous');
  const [posts, setPosts] = useState<XposePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [myInterests, setMyInterests] = useState<string[]>([]);

  const authorArenaName = arenaUser?.arenaName ?? user.displayName ?? 'Anonyme';

  // ── Init: streak + connections + interests ────────────────────────────────
  useEffect(() => {
    updateStreak(user.uid)
      .then(s => setStreak(s.currentStreak))
      .catch(() => {});

    getMyConnections(user.uid)
      .then(connections => {
        const ids = connections
          .filter(c => c.status === 'accepted')
          .map(c => c.fromUserId === user.uid ? c.toUserId : c.fromUserId);
        setFriendIds(ids);
      })
      .catch(() => {});

    if (arenaUser?.passions) {
      setMyInterests(arenaUser.passions);
    }
  }, [user.uid, arenaUser]);

  // ── Fetch feed ────────────────────────────────────────────────────────────
  const fetchFeed = useCallback(async (tab: Tab) => {
    setLoading(true);
    setError(null);
    try {
      let data: XposePost[] = [];

      if (tab === 'pour_vous') {
        data = await getPublicFeed(60);
        data = data
          .map(p => ({ ...p, interestScore: scorePost(p, myInterests, friendIds) }))
          .sort((a, b) => (b.interestScore ?? 0) - (a.interestScore ?? 0));
      } else if (tab === 'compagnons') {
        data = await getCompanionsFeed(friendIds);
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else {
        data = await getPublicFeed(60);
        data.sort((a, b) => b.resonanceCount - a.resonanceCount);
      }

      setPosts(data);
    } catch {
      setError('Impossible de charger le fil. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [myInterests, friendIds]);

  useEffect(() => {
    fetchFeed(activeTab);
  }, [activeTab, fetchFeed]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleResonate = async (postId: string, isResonated: boolean) => {
    await resonatePost(postId, user.uid, isResonated);
  };

  const handleAmplify = async (postId: string) => {
    await amplifyPost(postId, user.uid);
  };

  const handleCreated = (post: XposePost) => {
    setPosts(prev => [post, ...prev]);
    setShowCreateModal(false);
  };

  // ── Tabs config ───────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'pour_vous', label: 'Pour Vous', icon: <Zap size={13} /> },
    { key: 'compagnons', label: 'Compagnons', icon: <Users size={13} /> },
    { key: 'decouvrir', label: 'Découvrir', icon: <Swords size={13} /> },
  ];

  return (
    <div style={{
      minHeight: '100dvh', background: BG, color: TEXT_PRIMARY,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {/* ── Header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(13,14,20,0.85)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '14px 20px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button
            onClick={onBack}
            style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, width: 38, height: 38, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: TEXT_PRIMARY, flexShrink: 0,
            }}
          >
            <ArrowLeft size={18} />
          </button>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={16} color="#fff" fill="#fff" />
            </div>
            <span style={{
              fontSize: 22, fontWeight: 900, letterSpacing: '2px',
              background: ACCENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              XPOSE
            </span>
          </div>

          {/* Streak */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
            borderRadius: 20, padding: '5px 12px',
          }}>
            <Flame size={14} color="#FBBF24" fill="#FBBF24" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#FBBF24' }}>
              {streak} jour{streak !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, paddingBottom: 1 }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: '14px 14px 0 0',
                border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'all 0.2s',
                background: activeTab === tab.key ? 'rgba(124,58,237,0.15)' : 'transparent',
                color: activeTab === tab.key ? '#A78BFA' : TEXT_SECONDARY,
                borderBottom: activeTab === tab.key
                  ? '2px solid #7C3AED'
                  : '2px solid transparent',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feed ── */}
      <div style={{ flex: 1, padding: '16px 16px 100px', maxWidth: 680, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {loading && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '60px 0', gap: 10, color: TEXT_SECONDARY,
          }}>
            <Loader2 size={22} className="animate-spin" color="#7C3AED" />
            <span style={{ fontSize: 14 }}>Chargement du fil…</span>
          </div>
        )}

        {!loading && error && (
          <div style={{
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 16, padding: '20px 24px', textAlign: 'center', color: '#F87171',
            fontSize: 14, marginTop: 16,
          }}>
            {error}
            <button
              onClick={() => fetchFeed(activeTab)}
              style={{
                display: 'block', margin: '12px auto 0', background: 'rgba(248,113,113,0.15)',
                border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10,
                padding: '8px 16px', color: '#F87171', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
            >
              Réessayer
            </button>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <EmptyState onCreate={() => setShowCreateModal(true)} />
        )}

        {!loading && !error && posts.length > 0 && (
          <AnimatePresence initial={false}>
            {posts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.35 }}
              >
                {post.type === 'pensee' && (
                  <PenseeCard
                    post={post}
                    userId={user.uid}
                    authorArenaName={authorArenaName}
                    onResonate={handleResonate}
                    onAmplify={handleAmplify}
                  />
                )}
                {post.type === 'echange_ia' && (
                  <EchangeIACard
                    post={post}
                    userId={user.uid}
                    authorArenaName={authorArenaName}
                    onResonate={handleResonate}
                    onAmplify={handleAmplify}
                  />
                )}
                {post.type === 'arene' && (
                  <AreneCard
                    post={post}
                    userId={user.uid}
                    onResonate={handleResonate}
                    onAmplify={handleAmplify}
                    onGoToArena={onGoToArena}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ── FAB ── */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        onClick={() => setShowCreateModal(true)}
        style={{
          position: 'fixed', bottom: 28, right: 20, zIndex: 200,
          width: 58, height: 58, borderRadius: '50%',
          background: ACCENT, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 8px 32px rgba(124,58,237,0.5)',
        }}
      >
        <Plus size={26} color="#fff" strokeWidth={2.5} />
      </motion.button>

      {/* ── Create Modal ── */}
      <AnimatePresence>
        {showCreateModal && (
          <CreatePostModal
            user={user}
            arenaUser={arenaUser}
            onClose={() => setShowCreateModal(false)}
            onCreated={handleCreated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
