import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, MessageSquare, Repeat2, Link2, Image, Hash, Swords, AtSign,
  X, Loader2, Search, Flame, ChevronDown, ChevronUp, Plus, Check,
  ArrowLeft, Star, UserPlus, Send,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ArenaUser } from '../arena/arenaTypes';
import type { XposePost, XposeComment, XposeRecommendedUser, XposeVisibility, XposeCommentType } from './xposeTypes';
import {
  getPublicFeed, getFollowingFeed, createXposePost, updateXposePostImages,
  resonatePost, amplifyPost, addXposeComment, getXposeComments,
  upvoteXposeComment, updateStreak, scorePost,
  getRecommendedUsers, getTrendingTags,
} from './xposeFirestore';
import { uploadPostImages } from './xposeStorage';
import { getMyConnections, sendConnection, getArenaPosts } from '../arena/arenaFirestore';
import type { ArenaPost } from '../arena/arenaTypes';

// ─── Palette & helpers ────────────────────────────────────────────────────────

const PALETTE = ['#5D7BFF', '#34D399', '#F87171', '#FBBF24', '#A78BFA', '#F97316', '#38BDF8', '#FB7185'];
const ACCENT = '#5D7BFF';
const RESONANCE_ACTIVE = '#F97316';
const SEPARATOR = '1px solid #2f3336';
const TEXT_PRIMARY = '#e7e9ea';
const TEXT_SECONDARY = '#71767b';

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'maintenant';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, photoURL, size = 40 }: { name: string; photoURL?: string; size?: number }) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: avatarColor(name),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: size * 0.35, fontWeight: 700, color: '#fff',
      }}
    >
      {initials(name)}
    </div>
  );
}

// ─── Comment Thread ───────────────────────────────────────────────────────────

function CommentThread({ postId, userId, arenaName, photoURL }: {
  postId: string; userId: string; arenaName: string; photoURL?: string;
}) {
  const [comments, setComments] = useState<XposeComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [replyType, setReplyType] = useState<XposeCommentType>('argument');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getXposeComments(postId).then(c => { setComments(c); setLoadingComments(false); });
  }, [postId]);

  const handleSubmitReply = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    const id = await addXposeComment(postId, {
      authorId: userId, authorArenaName: arenaName, authorPhotoURL: photoURL,
      type: replyType, content: replyText.trim(),
      parentCommentId: null, createdAt: new Date().toISOString(),
    });
    if (id) {
      const newComment: XposeComment = {
        id, authorId: userId, authorArenaName: arenaName, authorPhotoURL: photoURL,
        type: replyType, content: replyText.trim(), parentCommentId: null,
        createdAt: new Date().toISOString(), upvotes: 0, upvotedBy: [],
      };
      setComments(prev => [...prev, newComment]);
      setReplyText('');
    }
    setSubmitting(false);
  };

  const handleUpvote = async (comment: XposeComment) => {
    const isUp = comment.upvotedBy.includes(userId);
    await upvoteXposeComment(postId, comment.id, userId, isUp);
    setComments(prev => prev.map(c =>
      c.id === comment.id
        ? {
          ...c,
          upvotes: isUp ? c.upvotes - 1 : c.upvotes + 1,
          upvotedBy: isUp ? c.upvotedBy.filter(id => id !== userId) : [...c.upvotedBy, userId],
        }
        : c
    ));
  };

  const typeLabel: Record<XposeCommentType, string> = { argument: 'Argument', question: 'Question', intuition: 'Intuition' };
  const typeColor: Record<XposeCommentType, string> = { argument: '#5D7BFF', question: '#34D399', intuition: '#A78BFA' };

  return (
    <div style={{ borderTop: SEPARATOR, background: 'rgba(255,255,255,0.01)' }}>
      {/* Reply composer */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: SEPARATOR }}>
        <Avatar name={arenaName} photoURL={photoURL} size={32} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {(['argument', 'question', 'intuition'] as XposeCommentType[]).map(t => (
              <button
                key={t}
                onClick={() => setReplyType(t)}
                style={{
                  padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${replyType === t ? typeColor[t] : '#2f3336'}`,
                  background: replyType === t ? `${typeColor[t]}22` : 'transparent',
                  color: replyType === t ? typeColor[t] : TEXT_SECONDARY,
                  cursor: 'pointer', transition: 'all 0.15s',
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
                flex: 1, background: '#111', border: SEPARATOR, borderRadius: 8,
                color: TEXT_PRIMARY, padding: '8px 10px', fontSize: 14, resize: 'none',
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              onClick={handleSubmitReply}
              disabled={!replyText.trim() || submitting}
              style={{
                background: replyText.trim() ? ACCENT : '#2f3336',
                border: 'none', borderRadius: '50%', width: 34, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: replyText.trim() ? 'pointer' : 'not-allowed', flexShrink: 0,
                transition: 'background 0.15s',
              }}
            >
              {submitting
                ? <Loader2 size={15} color="#fff" className="animate-spin" />
                : <Send size={15} color="#fff" />}
            </button>
          </div>
        </div>
      </div>

      {/* Comments list */}
      {loadingComments ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
          <Loader2 size={18} color={TEXT_SECONDARY} className="animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <div style={{ color: TEXT_SECONDARY, textAlign: 'center', padding: '12px 16px', fontSize: 14 }}>
          Soyez le premier à répondre.
        </div>
      ) : (
        comments.map(c => {
          const isUp = c.upvotedBy.includes(userId);
          return (
            <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: SEPARATOR }}>
              <Avatar name={c.authorArenaName} photoURL={c.authorPhotoURL} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>{c.authorArenaName}</span>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 12,
                      background: `${typeColor[c.type]}22`, color: typeColor[c.type],
                    }}
                  >
                    {typeLabel[c.type]}
                  </span>
                  <span style={{ color: TEXT_SECONDARY, fontSize: 12, marginLeft: 'auto' }}>{timeAgo(c.createdAt)}</span>
                </div>
                <p style={{ color: TEXT_PRIMARY, fontSize: 14, margin: 0, lineHeight: 1.5 }}>{c.content}</p>
                <button
                  onClick={() => handleUpvote(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, marginTop: 6,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: isUp ? RESONANCE_ACTIVE : TEXT_SECONDARY, fontSize: 13, padding: 0,
                  }}
                >
                  <Zap size={14} fill={isUp ? RESONANCE_ACTIVE : 'none'} />
                  <span>{c.upvotes}</span>
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── QuoteCard ────────────────────────────────────────────────────────────────

function QuoteCard({ post }: { post: Omit<XposePost, 'quotedPost'> }) {
  return (
    <div style={{ border: SEPARATOR, borderRadius: 12, padding: 12, marginTop: 8, background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Avatar name={post.authorArenaName} photoURL={post.authorPhotoURL} size={20} />
        <span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 13 }}>{post.authorArenaName}</span>
        <span style={{ color: TEXT_SECONDARY, fontSize: 12 }}>· {timeAgo(post.createdAt)}</span>
      </div>
      {post.caption && (
        <p style={{ color: TEXT_PRIMARY, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          {post.caption.length > 100 ? post.caption.slice(0, 100) + '…' : post.caption}
        </p>
      )}
    </div>
  );
}

// ─── Arena card ───────────────────────────────────────────────────────────────

function ArenaCard({ post, onGoToArena }: { post: XposePost; onGoToArena: (id?: string) => void }) {
  const total = (post.arenaAgree ?? 0) + (post.arenaDisagree ?? 0);
  const agreePct = total > 0 ? Math.round(((post.arenaAgree ?? 0) / total) * 100) : 50;
  return (
    <div style={{ border: '1px solid #1e2a4a', borderRadius: 12, padding: 12, marginTop: 8, background: 'rgba(93,123,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Swords size={14} color={ACCENT} />
        <span style={{ color: ACCENT, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Arène</span>
      </div>
      {post.arenaPostTitle && (
        <p style={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: 14, margin: '0 0 4px' }}>{post.arenaPostTitle}</p>
      )}
      {post.arenaPostExcerpt && (
        <p style={{ color: TEXT_SECONDARY, fontSize: 13, margin: '0 0 8px', lineHeight: 1.4 }}>
          {post.arenaPostExcerpt.length > 120 ? post.arenaPostExcerpt.slice(0, 120) + '…' : post.arenaPostExcerpt}
        </p>
      )}
      {total > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: TEXT_SECONDARY, marginBottom: 3 }}>
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
        style={{
          background: 'none', border: `1px solid ${ACCENT}`, borderRadius: 20,
          color: ACCENT, fontSize: 13, fontWeight: 600, padding: '4px 12px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <Swords size={13} />
        Rejoindre le débat →
      </button>
    </div>
  );
}

// ─── AI Exchange card ─────────────────────────────────────────────────────────

function AICard({ post }: { post: XposePost }) {
  const [expanded, setExpanded] = useState(false);
  const response = post.aiResponse ?? '';
  const truncated = response.slice(0, 180);
  const needsExpand = response.length > 180;
  return (
    <div style={{ border: '1px solid #2d1a4a', borderRadius: 12, padding: 12, marginTop: 8, background: 'rgba(167,139,250,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, color: '#fff', fontWeight: 800 }}>IA</span>
        </div>
        <span style={{ color: '#A78BFA', fontSize: 12, fontWeight: 700 }}>{post.personaName ?? 'IA'}</span>
      </div>
      {post.aiQuestion && (
        <p style={{ color: TEXT_SECONDARY, fontSize: 13, fontStyle: 'italic', margin: '0 0 6px' }}>
          « {post.aiQuestion} »
        </p>
      )}
      <p style={{ color: TEXT_PRIMARY, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
        {expanded ? response : truncated}{!expanded && needsExpand && '…'}
      </p>
      {needsExpand && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', color: '#A78BFA', cursor: 'pointer',
            fontSize: 13, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 3, marginTop: 4,
          }}
        >
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
  const gridCols: Record<number, string> = { 1: '1fr', 2: '1fr 1fr', 3: '1fr 1fr', 4: '1fr 1fr' };
  return (
    <div style={{ display: 'grid', gap: 2, borderRadius: 12, overflow: 'hidden', marginTop: 8, gridTemplateColumns: gridCols[count] }}>
      {urls.slice(0, count).map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          style={{
            width: '100%', objectFit: 'cover',
            maxHeight: count === 1 ? 300 : 160,
            gridColumn: count === 3 && i === 0 ? '1 / -1' : undefined,
          }}
        />
      ))}
    </div>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  icon, count, active, activeColor, onClick, label,
}: {
  icon: React.ReactNode; count: number; active: boolean;
  activeColor: string; onClick: () => void; label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? activeColor : TEXT_SECONDARY,
        fontSize: 14, padding: 4, borderRadius: 20,
        transition: 'color 0.15s',
      }}
    >
      {icon}
      <span style={{ minWidth: 12 }}>{count > 0 ? count : ''}</span>
    </button>
  );
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

function PostCard({
  post, userId, showComments, onToggleComments, onResonate, onAmplify, onGoToArena,
}: {
  post: XposePost; userId: string; showComments: boolean;
  onToggleComments: () => void; onResonate: () => void;
  onAmplify: () => void; onGoToArena: (id?: string) => void;
}) {
  const isResonated = post.resonatedBy.includes(userId);
  const isAmplified = post.amplifiedBy.includes(userId);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/xpose/${post.id}`).catch(() => {});
  };

  return (
    <div>
      <motion.div
        whileHover={{ background: 'rgba(255,255,255,0.03)' }}
        style={{
          display: 'flex', gap: 12, padding: '12px 16px',
          borderBottom: showComments ? undefined : SEPARATOR,
          transition: 'background 0.1s',
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <Avatar name={post.authorArenaName} photoURL={post.authorPhotoURL} size={40} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 15 }}>{post.authorArenaName}</span>
            {post.authorCredibilityScore !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#FBBF24', fontSize: 12 }}>
                <Star size={11} fill="#FBBF24" />
                {post.authorCredibilityScore}
              </span>
            )}
            <span style={{ color: TEXT_SECONDARY, fontSize: 14 }}>· {timeAgo(post.createdAt)}</span>
            {post.visibility === 'friends' && (
              <span style={{ fontSize: 11, color: TEXT_SECONDARY, background: '#2f3336', borderRadius: 10, padding: '1px 7px' }}>
                Amis
              </span>
            )}
          </div>

          {/* Caption */}
          {post.caption && (
            <p style={{ color: TEXT_PRIMARY, fontSize: 15, margin: '0 0 4px', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {post.caption}
            </p>
          )}

          {/* Images */}
          {post.imageUrls && post.imageUrls.length > 0 && <ImagesGrid urls={post.imageUrls} />}

          {/* Quoted post */}
          {post.quotedPost && <QuoteCard post={post.quotedPost} />}

          {/* Arena card */}
          {post.type === 'arene' && <ArenaCard post={post} onGoToArena={onGoToArena} />}

          {/* AI Exchange */}
          {post.type === 'echange_ia' && <AICard post={post} />}

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {post.tags.map(tag => (
                <span key={tag} style={{ color: ACCENT, fontSize: 14 }}>#{tag}</span>
              ))}
            </div>
          )}

          {/* Actions bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 12 }}>
            <ActionBtn
              icon={<MessageSquare size={17} />}
              count={post.commentCount}
              active={showComments}
              activeColor={ACCENT}
              onClick={onToggleComments}
              label="Commenter"
            />
            <ActionBtn
              icon={<Repeat2 size={17} />}
              count={post.amplifyCount}
              active={isAmplified}
              activeColor="#34D399"
              onClick={onAmplify}
              label="Amplifier"
            />
            <ActionBtn
              icon={<Zap size={17} fill={isResonated ? RESONANCE_ACTIVE : 'none'} />}
              count={post.resonanceCount}
              active={isResonated}
              activeColor={RESONANCE_ACTIVE}
              onClick={onResonate}
              label="Résonance"
            />
            <button
              onClick={handleCopyLink}
              title="Copier le lien"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: TEXT_SECONDARY, display: 'flex', alignItems: 'center',
                padding: 4, borderRadius: '50%',
              }}
            >
              <Link2 size={17} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Comments thread */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', borderBottom: SEPARATOR }}
          >
            <CommentThread
              postId={post.id}
              userId={userId}
              arenaName={post.authorArenaName}
              photoURL={post.authorPhotoURL}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function ToolbarBtn({ icon, onClick, disabled, title }: {
  icon: React.ReactNode; onClick: () => void; disabled?: boolean; title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? '#333' : ACCENT, padding: 8, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.1s',
      }}
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
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: '#000', border: SEPARATOR, borderRadius: 16,
          width: '100%', maxWidth: 520, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: SEPARATOR }}>
          <span style={{ color: TEXT_PRIMARY, fontWeight: 700, fontSize: 16 }}>Choisir un débat Arène</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_SECONDARY, display: 'flex', padding: 4, borderRadius: '50%' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Loader2 size={24} color={TEXT_SECONDARY} className="animate-spin" />
            </div>
          ) : arenaPosts.map(ap => (
            <button
              key={ap.id}
              onClick={() => onSelect(ap.id, ap.title, ap.preamble)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none',
                borderBottom: SEPARATOR, padding: '12px 16px', cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Swords size={13} color={ACCENT} />
                <span style={{ color: TEXT_SECONDARY, fontSize: 12 }}>{ap.authorArenaName} · {timeAgo(ap.createdAt)}</span>
              </div>
              <p style={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: 14, margin: '0 0 3px' }}>{ap.title}</p>
              <p style={{ color: TEXT_SECONDARY, fontSize: 13, margin: 0 }}>
                {ap.preamble.length > 100 ? ap.preamble.slice(0, 100) + '…' : ap.preamble}
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12 }}>
                <span style={{ color: '#34D399' }}>✓ {ap.agreeCount}</span>
                <span style={{ color: '#F87171' }}>✗ {ap.disagreeCount}</span>
                <span style={{ color: TEXT_SECONDARY }}>💬 {ap.commentCount}</span>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Inline Composer ──────────────────────────────────────────────────────────

function InlineComposer({ user, arenaUser, onPublished }: {
  user: User; arenaUser: ArenaUser | null; onPublished: (post: XposePost) => void;
}) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [visibility] = useState<XposeVisibility>('public');
  const [arenaPost, setArenaPost] = useState<{ id: string; title: string; excerpt: string } | null>(null);
  const [showArenaModal, setShowArenaModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const arenaName = arenaUser?.arenaName ?? user.displayName ?? 'Anonyme';
  const photoURL = arenaUser?.photoURL ?? user.photoURL ?? undefined;
  const maxLen = 500;

  const handleImages = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).slice(0, 4 - images.length);
    setImages(prev => [...prev, ...next]);
    next.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => setPreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(f);
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

  const handlePublish = async () => {
    if (!text.trim() && images.length === 0) return;
    setPublishing(true);
    try {
      const postType = arenaPost ? 'arene' : 'pensee';
      const newPost: Omit<XposePost, 'id' | 'resonanceCount' | 'commentCount' | 'amplifyCount' | 'resonatedBy' | 'amplifiedBy' | 'interestScore'> = {
        authorId: user.uid,
        authorArenaName: arenaName,
        authorPhotoURL: photoURL,
        authorCredibilityScore: arenaUser?.credibilityScore,
        type: postType,
        caption: text.trim() || undefined,
        tags,
        visibility,
        createdAt: new Date().toISOString(),
        ...(arenaPost ? {
          arenaPostId: arenaPost.id,
          arenaPostTitle: arenaPost.title,
          arenaPostExcerpt: arenaPost.excerpt,
        } : {}),
      };
      const id = await createXposePost(newPost);
      if (!id) return;

      let imageUrls: string[] = [];
      if (images.length > 0) {
        imageUrls = await uploadPostImages(id, images);
        await updateXposePostImages(id, imageUrls);
      }

      const full: XposePost = {
        ...newPost, id, imageUrls,
        resonanceCount: 0, commentCount: 0, amplifyCount: 0,
        resonatedBy: [], amplifiedBy: [],
      };
      onPublished(full);
      setText(''); setImages([]); setPreviews([]); setTags([]); setArenaPost(null);
    } finally {
      setPublishing(false);
    }
  };

  const canPublish = (text.trim().length > 0 || images.length > 0) && !publishing;

  return (
    <>
      <div style={{ borderBottom: SEPARATOR, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Avatar name={arenaName} photoURL={photoURL} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value.slice(0, maxLen))}
              placeholder="Quelle est votre pensée ?"
              rows={text.length > 80 ? 4 : 2}
              style={{
                width: '100%', background: 'transparent', border: 'none',
                color: TEXT_PRIMARY, fontSize: 18, resize: 'none',
                fontFamily: 'inherit', outline: 'none', lineHeight: 1.5,
                boxSizing: 'border-box', padding: 0,
              }}
            />

            {/* Image previews */}
            {previews.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8, borderRadius: 12, overflow: 'hidden' }}>
                {previews.map((src, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={src} alt="" style={{ width: '100%', height: 100, objectFit: 'cover' }} />
                    <button
                      onClick={() => removeImage(i)}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%',
                        width: 24, height: 24, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                      }}
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
                  <span
                    key={tag}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${ACCENT}22`, color: ACCENT, padding: '2px 8px', borderRadius: 20, fontSize: 13 }}
                  >
                    #{tag}
                    <button
                      onClick={() => setTags(prev => prev.filter(t => t !== tag))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, padding: 0, display: 'flex', alignItems: 'center' }}
                    >
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
                  style={{
                    background: '#111', border: SEPARATOR, borderRadius: 8,
                    color: TEXT_PRIMARY, padding: '6px 10px', fontSize: 14,
                    outline: 'none', fontFamily: 'inherit', flex: 1,
                  }}
                />
                <button onClick={addTag} style={{ background: ACCENT, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}>
                  OK
                </button>
              </div>
            )}

            {/* Arena post preview */}
            {arenaPost && (
              <div style={{ border: '1px solid #1e2a4a', borderRadius: 10, padding: 10, marginBottom: 8, background: 'rgba(93,123,255,0.06)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Swords size={14} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: 13, margin: '0 0 2px' }}>{arenaPost.title}</p>
                  <p style={{ color: TEXT_SECONDARY, fontSize: 12, margin: 0 }}>
                    {arenaPost.excerpt.length > 80 ? arenaPost.excerpt.slice(0, 80) + '…' : arenaPost.excerpt}
                  </p>
                </div>
                <button onClick={() => setArenaPost(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_SECONDARY, padding: 2, display: 'flex', alignItems: 'center' }}>
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 2 }}>
                <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleImages(e.target.files)} />
                <ToolbarBtn icon={<Image size={18} />} onClick={() => fileInputRef.current?.click()} disabled={images.length >= 4} title="Images" />
                <ToolbarBtn icon={<Hash size={18} />} onClick={() => setShowTagInput(v => !v)} title="Tags" />
                <ToolbarBtn icon={<Swords size={18} />} onClick={() => setShowArenaModal(true)} title="Arène" />
                <ToolbarBtn icon={<AtSign size={18} />} onClick={() => setText(t => t + '@')} title="Mention" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {text.length > 0 && (
                  <span style={{ color: text.length > maxLen - 50 ? '#F87171' : TEXT_SECONDARY, fontSize: 13 }}>
                    {maxLen - text.length}
                  </span>
                )}
                <button
                  onClick={handlePublish}
                  disabled={!canPublish}
                  style={{
                    background: canPublish ? ACCENT : '#1a2a4a',
                    border: 'none', borderRadius: 20, color: canPublish ? '#fff' : '#555',
                    fontWeight: 700, fontSize: 15, padding: '7px 18px',
                    cursor: canPublish ? 'pointer' : 'not-allowed',
                    transition: 'background 0.15s, color 0.15s',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {publishing && <Loader2 size={15} className="animate-spin" />}
                  Publier
                </button>
              </div>
            </div>
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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ recommended, trendingTags, searchQuery, onSearch, userId, myArenaName, myPhotoURL, followingIds }: {
  recommended: XposeRecommendedUser[];
  trendingTags: { tag: string; count: number }[];
  searchQuery: string;
  onSearch: (q: string) => void;
  userId: string;
  myArenaName: string;
  myPhotoURL?: string;
  followingIds: string[];
}) {
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [showAllRec, setShowAllRec] = useState(false);
  const displayedRec = showAllRec ? recommended : recommended.slice(0, 3);

  const handleFollow = async (targetUserId: string, targetName: string, targetPhotoURL?: string) => {
    setFollowedIds(prev => [...prev, targetUserId]);
    await sendConnection(userId, myArenaName, myPhotoURL, targetUserId, targetName, targetPhotoURL, 'follow');
  };

  const panelStyle: React.CSSProperties = { border: SEPARATOR, borderRadius: 16, marginBottom: 16, overflow: 'hidden' };
  const panelHeaderStyle: React.CSSProperties = { padding: '14px 16px', borderBottom: SEPARATOR, color: TEXT_PRIMARY, fontWeight: 800, fontSize: 18 };

  return (
    <div>
      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} color={TEXT_SECONDARY} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
          placeholder="Rechercher dans XPOSE"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#111', border: SEPARATOR, borderRadius: 9999,
            color: TEXT_PRIMARY, padding: '10px 16px 10px 38px', fontSize: 15,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Qui suivre */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle}>Qui suivre</div>
        {displayedRec.length === 0 ? (
          <div style={{ padding: '12px 16px', color: TEXT_SECONDARY, fontSize: 14 }}>Aucune suggestion.</div>
        ) : displayedRec.map(rec => {
          const isFollowed = followedIds.includes(rec.userId) || followingIds.includes(rec.userId);
          return (
            <div
              key={rec.userId}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: SEPARATOR, transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <Avatar name={rec.arenaName} photoURL={rec.photoURL} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>{rec.arenaName}</span>
                  <Star size={11} color="#FBBF24" fill="#FBBF24" />
                  <span style={{ fontSize: 12, color: '#FBBF24' }}>{rec.credibilityScore}</span>
                </div>
                {rec.commonTags.length > 0 && (
                  <span style={{ color: TEXT_SECONDARY, fontSize: 12 }}>#{rec.commonTags.slice(0, 2).join(' #')}</span>
                )}
              </div>
              <button
                onClick={() => !isFollowed && handleFollow(rec.userId, rec.arenaName, rec.photoURL)}
                style={{
                  background: isFollowed ? 'transparent' : '#fff',
                  border: isFollowed ? `1px solid ${TEXT_SECONDARY}` : 'none',
                  borderRadius: 20, color: isFollowed ? TEXT_SECONDARY : '#000',
                  fontWeight: 700, fontSize: 13, padding: '5px 14px',
                  cursor: isFollowed ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s', flexShrink: 0,
                }}
              >
                {isFollowed ? <><Check size={13} /> Suivi</> : <><UserPlus size={13} /> Suivre</>}
              </button>
            </div>
          );
        })}
        {recommended.length > 3 && (
          <button
            onClick={() => setShowAllRec(v => !v)}
            style={{ width: '100%', background: 'none', border: 'none', color: ACCENT, fontSize: 14, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}
          >
            {showAllRec ? 'Voir moins' : 'Voir plus'}
          </button>
        )}
      </div>

      {/* Tendances */}
      {trendingTags.length > 0 && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>Tendances</div>
          {trendingTags.map(({ tag, count }) => (
            <div
              key={tag}
              style={{ padding: '10px 16px', borderBottom: SEPARATOR, transition: 'background 0.1s', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ color: TEXT_SECONDARY, fontSize: 12 }}>Tendance</div>
              <div style={{ color: TEXT_PRIMARY, fontWeight: 700, fontSize: 15 }}>#{tag}</div>
              <div style={{ color: TEXT_SECONDARY, fontSize: 12 }}>{count} posts</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mobile Composer Modal ────────────────────────────────────────────────────

function MobileComposerModal({ user, arenaUser, onPublished, onClose }: {
  user: User; arenaUser: ArenaUser | null; onPublished: (post: XposePost) => void; onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 300, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: SEPARATOR }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_PRIMARY, display: 'flex', alignItems: 'center', marginRight: 16, padding: 4 }}
        >
          <X size={22} />
        </button>
        <span style={{ color: TEXT_PRIMARY, fontWeight: 700, fontSize: 17 }}>Nouveau post</span>
      </div>
      <InlineComposer
        user={user}
        arenaUser={arenaUser}
        onPublished={post => { onPublished(post); onClose(); }}
      />
    </motion.div>
  );
}

// ─── Main XposePage ───────────────────────────────────────────────────────────

interface Props {
  user: import('firebase/auth').User;
  arenaUser: import('../arena/arenaTypes').ArenaUser | null;
  onBack: () => void;
  onGoToArena: (postId?: string) => void;
}

export default function XposePage({ user, arenaUser, onBack, onGoToArena }: Props) {
  const [activeTab, setActiveTab] = useState<'pour_vous' | 'abonnements'>('pour_vous');
  const [posts, setPosts] = useState<XposePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [recommended, setRecommended] = useState<XposeRecommendedUser[]>([]);
  const [trendingTags, setTrendingTags] = useState<{ tag: string; count: number }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
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
        .map(c => c.fromUserId === user.uid ? c.toUserId : c.fromUserId);
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
      if (activeTab === 'pour_vous') {
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
  }, [activeTab, myInterests, followingIds]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  const handlePostPublished = (post: XposePost) => {
    setPosts(prev => [post, ...prev]);
  };

  const handleResonate = async (post: XposePost) => {
    const isResonated = post.resonatedBy.includes(user.uid);
    await resonatePost(post.id, user.uid, isResonated);
    setPosts(prev => prev.map(p =>
      p.id === post.id
        ? {
          ...p,
          resonanceCount: isResonated ? p.resonanceCount - 1 : p.resonanceCount + 1,
          resonatedBy: isResonated ? p.resonatedBy.filter(id => id !== user.uid) : [...p.resonatedBy, user.uid],
        }
        : p
    ));
  };

  const handleAmplify = async (post: XposePost) => {
    if (post.amplifiedBy.includes(user.uid)) return;
    await amplifyPost(post.id, user.uid);
    setPosts(prev => prev.map(p =>
      p.id === post.id
        ? { ...p, amplifyCount: p.amplifyCount + 1, amplifiedBy: [...p.amplifiedBy, user.uid] }
        : p
    ));
  };

  const displayedPosts = searchQuery.trim()
    ? posts.filter(p => {
      const q = searchQuery.toLowerCase();
      return (
        p.caption?.toLowerCase().includes(q) ||
        p.tags?.some(t => t.toLowerCase().includes(q)) ||
        p.authorArenaName.toLowerCase().includes(q)
      );
    })
    : posts;

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: TEXT_PRIMARY, fontFamily: 'inherit' }}>
      <div style={{ maxWidth: 1060, margin: '0 auto', display: 'flex', alignItems: 'flex-start' }}>

        {/* ── Feed column ── */}
        <div style={{ flex: 1, minWidth: 0, maxWidth: 600, borderRight: isMobile ? 'none' : SEPARATOR }}>

          {/* Sticky header */}
          <div
            style={{
              position: 'sticky', top: 0, zIndex: 50,
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(12px)',
              borderBottom: SEPARATOR,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={onBack}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: TEXT_PRIMARY, display: 'flex', alignItems: 'center',
                    padding: 6, borderRadius: '50%', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <ArrowLeft size={20} />
                </button>
                <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.3px' }}>XPOSE</span>
              </div>
              {streak > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: RESONANCE_ACTIVE, fontWeight: 700, fontSize: 15 }}>
                  <Flame size={18} fill={RESONANCE_ACTIVE} />
                  {streak} jour{streak > 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '4px 0 0' }}>
              {([['pour_vous', 'Pour vous'], ['abonnements', 'Abonnements']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                    color: activeTab === key ? TEXT_PRIMARY : TEXT_SECONDARY,
                    fontWeight: activeTab === key ? 700 : 400,
                    fontSize: 15, padding: '12px 0', position: 'relative',
                    transition: 'color 0.15s',
                  }}
                >
                  {label}
                  {activeTab === key && (
                    <motion.div
                      layoutId="tab-indicator"
                      style={{
                        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                        width: 56, height: 3, borderRadius: 2, background: ACCENT,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Inline composer — desktop only */}
          {!isMobile && (
            <InlineComposer user={user} arenaUser={arenaUser} onPublished={handlePostPublished} />
          )}

          {/* Feed */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 48 }}>
              <Loader2 size={28} color={TEXT_SECONDARY} className="animate-spin" />
            </div>
          ) : displayedPosts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: TEXT_SECONDARY }}>
              {searchQuery
                ? <>Aucun résultat pour « {searchQuery} ».</>
                : activeTab === 'abonnements'
                  ? <>Suivez des personnes pour voir leurs posts ici.</>
                  : <>Aucun post pour l'instant. Soyez le premier à publier !</>}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {displayedPosts.map(post => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <PostCard
                    post={post}
                    userId={user.uid}
                    showComments={openCommentPostId === post.id}
                    onToggleComments={() => setOpenCommentPostId(prev => prev === post.id ? null : post.id)}
                    onResonate={() => handleResonate(post)}
                    onAmplify={() => handleAmplify(post)}
                    onGoToArena={onGoToArena}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* ── Sidebar — desktop only ── */}
        {!isMobile && (
          <div
            style={{
              width: 320, flexShrink: 0, position: 'sticky', top: 0,
              height: '100vh', overflowY: 'auto', padding: '16px 0 16px 16px',
              scrollbarWidth: 'none',
            }}
          >
            <Sidebar
              recommended={recommended}
              trendingTags={trendingTags}
              searchQuery={searchQuery}
              onSearch={setSearchQuery}
              userId={user.uid}
              myArenaName={arenaUser?.arenaName ?? user.displayName ?? 'Anonyme'}
              myPhotoURL={arenaUser?.photoURL ?? user.photoURL ?? undefined}
              followingIds={followingIds}
            />
          </div>
        )}
      </div>

      {/* ── Mobile FAB ── */}
      {isMobile && (
        <button
          onClick={() => setShowMobileComposer(true)}
          style={{
            position: 'fixed', bottom: 24, right: 20,
            width: 56, height: 56, borderRadius: '50%',
            background: ACCENT, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(93,123,255,0.5)', zIndex: 100,
          }}
        >
          <Plus size={26} color="#fff" />
        </button>
      )}

      {/* ── Mobile Composer Modal ── */}
      <AnimatePresence>
        {showMobileComposer && (
          <MobileComposerModal
            user={user}
            arenaUser={arenaUser}
            onPublished={handlePostPublished}
            onClose={() => setShowMobileComposer(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
