import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Settings, Star, MessageSquare, Users, Briefcase, Heart,
  Globe, Twitter, Instagram, Edit3, Plus, Send, Loader2, X,
  ThumbsUp, Zap, ChevronDown, ChevronUp, Lock, Eye, EyeOff,
  UserPlus, UserCheck, UserMinus, Rss, Bookmark,
} from 'lucide-react';
import type {
  ArenaUser, PersonalPost, PersonalComment, PersonalCommentType,
  Visibility, ConnectionType,
} from './arenaTypes';
import {
  getArenaUser, getPersonalPosts, getPersonalComments, addPersonalComment,
  createPersonalPost, likePersonalPost, upvotePersonalComment,
  getConnectionStatus, sendConnection, acceptConnection, removeConnection,
} from './arenaFirestore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  targetUserId: string;
  myUserId: string;
  myArenaUser: ArenaUser | null;
  onBack: () => void;
  onOpenSettings: () => void;
  onViewProfile: (userId: string) => void;
}

type Tab = 'posts' | 'about' | 'badges';
type PostMode = 'ia' | 'text';

// ─── Constants ────────────────────────────────────────────────────────────────

const PALETTE = ['#5D7BFF','#34D399','#F87171','#FBBF24','#A78BFA','#F97316','#38BDF8','#FB7185'];

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

const COMMENT_TYPES: Record<PersonalCommentType, { label: string; emoji: string; color: string; desc: string }> = {
  argument:  { label: 'Argument',  emoji: '⚡', color: '#5D7BFF', desc: 'Raisonnement structuré' },
  question:  { label: 'Question',  emoji: '?',  color: '#FBBF24', desc: 'Questionne le post' },
  intuition: { label: 'Intuition', emoji: '→',  color: '#A78BFA', desc: 'Réaction immédiate' },
};

const VISIBILITY_CONFIG: Record<Visibility, { label: string; icon: React.ReactNode }> = {
  public:  { label: 'Public',  icon: <Eye size={12} /> },
  friends: { label: 'Amis',   icon: <Users size={12} /> },
  private: { label: 'Privé',  icon: <Lock size={12} /> },
};

const BADGE_LABELS: Record<string, string> = {
  'first_comment': 'Premier débat',
  'top_debater':   'Top débatteur',
  'credible':      'Crédible',
  'challenger':    'Challenger',
  'pioneer':       'Pionnier',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Av({ name, size = 36 }: { name: string; size?: number }) {
  const c = avatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${c}22`, border: `1.5px solid ${c}55`,
      color: c, fontSize: size * 0.32, fontWeight: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 1,
    }}>
      {initials(name)}
    </div>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  post, myUserId, myArenaUser, isOwn,
}: {
  post: PersonalPost;
  myUserId: string;
  myArenaUser: ArenaUser | null;
  isOwn: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [liked, setLiked] = useState(post.likedBy.includes(myUserId));
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PersonalComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentType, setCommentType] = useState<PersonalCommentType>('argument');
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLike = async () => {
    if (!myArenaUser) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => wasLiked ? c - 1 : c + 1);
    await likePersonalPost(post.id, post.authorId, myUserId, wasLiked);
  };

  const handleToggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) {
      setCommentsLoading(true);
      const loaded = await getPersonalComments(post.id);
      setComments(loaded);
      setCommentsLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !myArenaUser || submitting) return;
    setSubmitting(true);
    const newComment: Omit<PersonalComment, 'id' | 'upvotes' | 'upvotedBy'> = {
      authorId: myUserId,
      authorArenaName: myArenaUser.arenaName,
      authorPhotoURL: myArenaUser.photoURL,
      type: commentType,
      content: commentText.trim(),
      parentCommentId: null,
      createdAt: new Date().toISOString(),
    };
    const id = await addPersonalComment(post.id, newComment);
    if (id) {
      setComments(prev => [...prev, { ...newComment, id, upvotes: 0, upvotedBy: [] }]);
    }
    setCommentText('');
    setSubmitting(false);
  };

  const handleUpvoteComment = async (comment: PersonalComment) => {
    if (!myArenaUser) return;
    const isUpvoted = comment.upvotedBy.includes(myUserId);
    await upvotePersonalComment(post.id, comment.id, myUserId, isUpvoted);
    setComments(prev => prev.map(c => c.id === comment.id
      ? {
          ...c,
          upvotes: isUpvoted ? c.upvotes - 1 : c.upvotes + 1,
          upvotedBy: isUpvoted ? c.upvotedBy.filter(id => id !== myUserId) : [...c.upvotedBy, myUserId],
        }
      : c
    ));
  };

  const visConfig = VISIBILITY_CONFIG[post.visibility];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: '#13161E',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.07)',
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Av name={post.authorArenaName} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{post.authorArenaName}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {timeAgo(post.createdAt)}
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'rgba(255,255,255,0.3)' }}>
              · {visConfig.icon} {visConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px' }}>
        {post.type === 'text' ? (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: 0 }}>
            {post.content}
          </p>
        ) : (
          <div>
            {post.content && (
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, marginBottom: 10 }}>
                {post.content}
              </p>
            )}
            {/* Question bubble */}
            {post.aiQuestion && (
              <div style={{
                background: 'rgba(93,123,255,0.12)', border: '1px solid rgba(93,123,255,0.25)',
                borderRadius: 14, padding: '10px 14px', marginBottom: 8,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#5D7BFF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Question
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', margin: 0 }}>{post.aiQuestion}</p>
              </div>
            )}
            {/* AI response bubble (collapsible) */}
            {post.aiResponse && (
              <div style={{
                background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)',
                borderRadius: 14, overflow: 'hidden',
              }}>
                <button
                  onClick={() => setAiExpanded(v => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
                    color: '#A78BFA',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    <span style={{ opacity: 0.7 }}>Réponse IA</span>
                    {post.personaName && <span style={{ opacity: 0.5 }}>· {post.personaName}</span>}
                  </div>
                  {aiExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <AnimatePresence>
                  {aiExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <p style={{
                        fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.65,
                        margin: 0, padding: '0 14px 12px',
                      }}>
                        {post.aiResponse}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '8px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <button
          onClick={handleLike}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 10,
            background: liked ? 'rgba(251,113,133,0.15)' : 'rgba(255,255,255,0.04)',
            border: liked ? '1px solid rgba(251,113,133,0.3)' : '1px solid transparent',
            color: liked ? '#FB7185' : 'rgba(255,255,255,0.4)',
            cursor: myArenaUser ? 'pointer' : 'default',
            fontSize: 12, fontWeight: 600,
          }}
        >
          <Heart size={13} fill={liked ? '#FB7185' : 'none'} />
          {likeCount}
        </button>
        <button
          onClick={handleToggleComments}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 10,
            background: showComments ? 'rgba(93,123,255,0.12)' : 'rgba(255,255,255,0.04)',
            border: showComments ? '1px solid rgba(93,123,255,0.25)' : '1px solid transparent',
            color: showComments ? '#5D7BFF' : 'rgba(255,255,255,0.4)',
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          <MessageSquare size={13} />
          {post.commentCount}
        </button>
      </div>

      {/* Comments section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div style={{ padding: '12px 14px' }}>
              {commentsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                  <Loader2 size={18} color="#5D7BFF" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : (
                <>
                  {comments.map(comment => {
                    const ct = COMMENT_TYPES[comment.type];
                    const isUpvoted = comment.upvotedBy.includes(myUserId);
                    return (
                      <div
                        key={comment.id}
                        style={{
                          background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                          padding: '10px 12px', marginBottom: 8,
                          border: `1px solid ${ct.color}18`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Av name={comment.authorArenaName} size={24} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{comment.authorArenaName}</span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                              background: `${ct.color}18`, color: ct.color, display: 'flex', alignItems: 'center', gap: 3,
                            }}>
                              {ct.emoji} {ct.label}
                            </span>
                          </div>
                          <button
                            onClick={() => handleUpvoteComment(comment)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              background: 'none', border: 'none', cursor: myArenaUser ? 'pointer' : 'default',
                              color: isUpvoted ? '#5D7BFF' : 'rgba(255,255,255,0.3)',
                              fontSize: 11,
                            }}
                          >
                            <ThumbsUp size={12} fill={isUpvoted ? '#5D7BFF' : 'none'} />
                            {comment.upvotes}
                          </button>
                        </div>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.55 }}>
                          {comment.content}
                        </p>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                          {timeAgo(comment.createdAt)}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Comment input */}
              {myArenaUser && (
                <div style={{ marginTop: 8 }}>
                  {/* Type selector */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {(Object.keys(COMMENT_TYPES) as PersonalCommentType[]).map(type => {
                      const ct = COMMENT_TYPES[type];
                      const active = commentType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setCommentType(type)}
                          style={{
                            flex: 1, padding: '6px 4px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', transition: 'all 0.15s',
                            background: active ? `${ct.color}22` : 'rgba(255,255,255,0.04)',
                            border: active ? `1px solid ${ct.color}55` : '1px solid rgba(255,255,255,0.06)',
                            color: active ? ct.color : 'rgba(255,255,255,0.4)',
                          }}
                        >
                          {ct.emoji} {ct.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder={COMMENT_TYPES[commentType].desc + '…'}
                      rows={2}
                      style={{
                        flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 12, padding: '8px 12px', color: '#fff', fontSize: 13,
                        resize: 'none', outline: 'none', fontFamily: 'inherit',
                      }}
                    />
                    <button
                      onClick={handleSubmitComment}
                      disabled={!commentText.trim() || submitting}
                      style={{
                        width: 36, height: 36, borderRadius: 10, border: 'none', cursor: commentText.trim() ? 'pointer' : 'default',
                        background: commentText.trim() ? '#5D7BFF' : 'rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: commentText.trim() ? '#fff' : 'rgba(255,255,255,0.25)',
                        flexShrink: 0,
                      }}
                    >
                      {submitting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── New Post Form ────────────────────────────────────────────────────────────

function NewPostForm({
  myUserId, myArenaUser, onCreated, onClose,
}: {
  myUserId: string;
  myArenaUser: ArenaUser;
  onCreated: (post: PersonalPost) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<PostMode>('text');
  const [content, setContent] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [personaName, setPersonaName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(myArenaUser.postDefaultVisibility ?? 'public');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = mode === 'text'
    ? content.trim().length > 0 && content.length <= 500
    : aiQuestion.trim().length > 0 && aiResponse.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const base: Omit<PersonalPost, 'id' | 'likeCount' | 'commentCount' | 'likedBy'> = {
      authorId: myUserId,
      authorArenaName: myArenaUser.arenaName,
      authorPhotoURL: myArenaUser.photoURL,
      type: mode,
      content: content.trim(),
      visibility,
      createdAt: new Date().toISOString(),
    };
    if (mode === 'ia') {
      base.aiQuestion = aiQuestion.trim();
      base.aiResponse = aiResponse.trim();
      if (personaName.trim()) base.personaName = personaName.trim();
    }
    const id = await createPersonalPost(base);
    if (id) {
      onCreated({ ...base, id, likeCount: 0, commentCount: 0, likedBy: [] });
    }
    setSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      style={{
        background: '#13161E', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, padding: 18, marginBottom: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Nouveau post</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
          <X size={18} />
        </button>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['text', 'ia'] as PostMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: mode === m ? 'rgba(93,123,255,0.2)' : 'rgba(255,255,255,0.04)',
              border: mode === m ? '1px solid rgba(93,123,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
              color: mode === m ? '#5D7BFF' : 'rgba(255,255,255,0.4)',
            }}
          >
            {m === 'text' ? '✍️ Texte libre' : '🤖 Conversation IA'}
          </button>
        ))}
      </div>

      {/* Fields */}
      {mode === 'text' ? (
        <div style={{ position: 'relative' }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Partagez une pensée…"
            rows={4}
            maxLength={500}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, padding: '10px 12px', color: '#fff', fontSize: 13,
              resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'right', marginTop: 4 }}>
            {content.length}/500
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, fontWeight: 600 }}>Votre question</div>
            <textarea
              value={aiQuestion}
              onChange={e => setAiQuestion(e.target.value)}
              placeholder="Quelle question avez-vous posée à l'IA ?"
              rows={2}
              style={{
                width: '100%', background: 'rgba(93,123,255,0.08)', border: '1px solid rgba(93,123,255,0.2)',
                borderRadius: 12, padding: '9px 12px', color: '#fff', fontSize: 13,
                resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, fontWeight: 600 }}>Réponse de l'IA</div>
            <textarea
              value={aiResponse}
              onChange={e => setAiResponse(e.target.value)}
              placeholder="Collez la réponse de l'IA…"
              rows={4}
              style={{
                width: '100%', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)',
                borderRadius: 12, padding: '9px 12px', color: '#fff', fontSize: 13,
                resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, fontWeight: 600 }}>Persona (optionnel)</div>
            <input
              value={personaName}
              onChange={e => setPersonaName(e.target.value)}
              placeholder="ex. Socrate, GPT-4, Mistral…"
              style={{
                width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: '9px 12px', color: '#fff', fontSize: 13,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )}

      {/* Visibility */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6, fontWeight: 600 }}>Visibilité</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(Object.keys(VISIBILITY_CONFIG) as Visibility[]).map(v => {
            const cfg = VISIBILITY_CONFIG[v];
            const active = visibility === v;
            return (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: active ? 'rgba(93,123,255,0.18)' : 'rgba(255,255,255,0.04)',
                  border: active ? '1px solid rgba(93,123,255,0.35)' : '1px solid rgba(255,255,255,0.06)',
                  color: active ? '#5D7BFF' : 'rgba(255,255,255,0.4)',
                }}
              >
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        style={{
          width: '100%', marginTop: 16, padding: '11px 0',
          borderRadius: 14, border: 'none', cursor: canSubmit ? 'pointer' : 'default',
          background: canSubmit ? 'linear-gradient(135deg, #5D7BFF, #A78BFA)' : 'rgba(255,255,255,0.06)',
          color: canSubmit ? '#fff' : 'rgba(255,255,255,0.25)',
          fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {submitting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
        Publier
      </button>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ArenaProfilePage({
  targetUserId, myUserId, myArenaUser, onBack, onOpenSettings, onViewProfile,
}: Props) {
  const isOwn = targetUserId === myUserId;

  const [profileUser, setProfileUser] = useState<ArenaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [tab, setTab] = useState<Tab>('posts');
  const [posts, setPosts] = useState<PersonalPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  const [showNewPost, setShowNewPost] = useState(false);

  // Connection state
  const [connectStatus, setConnectStatus] = useState<string | null>(null);
  const [followStatus, setFollowStatus] = useState<string | null>(null);
  const [connBusy, setConnBusy] = useState(false);

  // ── Load profile ──────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    getArenaUser(targetUserId).then(u => {
      if (!u) { setNotFound(true); }
      else { setProfileUser(u); }
      setLoading(false);
    });
  }, [targetUserId]);

  // ── Load posts ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!profileUser || tab !== 'posts') return;
    setPostsLoading(true);
    const relation = isOwn ? 'self' : (connectStatus === 'accepted' ? 'friend' : 'public');
    getPersonalPosts(targetUserId, relation).then(p => {
      setPosts(p);
      setPostsLoading(false);
    });
  }, [profileUser, tab, isOwn, connectStatus, targetUserId]);

  // ── Load connection status ────────────────────────────────────────────────

  useEffect(() => {
    if (isOwn || !myUserId || !targetUserId) return;
    getConnectionStatus(myUserId, targetUserId).then(cs => {
      setConnectStatus(cs.connect);
      setFollowStatus(cs.iFollowThem ? 'accepted' : cs.follow);
    });
  }, [isOwn, myUserId, targetUserId]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleConnect = async () => {
    if (!myArenaUser || connBusy || !profileUser) return;
    setConnBusy(true);
    if (connectStatus === 'accepted') {
      await removeConnection(myUserId, targetUserId, 'connect');
      setConnectStatus(null);
    } else if (connectStatus === 'pending') {
      await removeConnection(myUserId, targetUserId, 'connect');
      setConnectStatus(null);
    } else {
      await sendConnection(
        myUserId, myArenaUser.arenaName, myArenaUser.photoURL,
        targetUserId, profileUser.arenaName, profileUser.photoURL,
        'connect',
      );
      setConnectStatus('pending');
    }
    setConnBusy(false);
  };

  const handleFollow = async () => {
    if (!myArenaUser || connBusy || !profileUser) return;
    setConnBusy(true);
    if (followStatus === 'accepted') {
      await removeConnection(myUserId, targetUserId, 'follow');
      setFollowStatus(null);
    } else {
      await sendConnection(
        myUserId, myArenaUser.arenaName, myArenaUser.photoURL,
        targetUserId, profileUser.arenaName, profileUser.photoURL,
        'follow',
      );
      setFollowStatus('accepted');
    }
    setConnBusy(false);
  };

  const handlePostCreated = (post: PersonalPost) => {
    setPosts(prev => [post, ...prev]);
    setShowNewPost(false);
    setProfileUser(prev => prev ? { ...prev, personalPostsCount: (prev.personalPostsCount ?? 0) + 1 } : prev);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const connectLabel = () => {
    if (connectStatus === 'accepted') return { text: 'Connecté', icon: <UserCheck size={13} /> };
    if (connectStatus === 'pending') return { text: 'En attente', icon: <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> };
    return { text: 'Se connecter', icon: <UserPlus size={13} /> };
  };

  const followLabel = () => {
    if (followStatus === 'accepted') return { text: 'Suivi', icon: <Rss size={13} /> };
    return { text: 'Suivre', icon: <Rss size={13} /> };
  };

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0C12', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <Loader2 size={28} color="#5D7BFF" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Chargement du profil…</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (notFound || !profileUser) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0C12', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 40 }}>🔍</div>
        <p style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Profil introuvable</p>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Cet utilisateur n'existe pas ou a supprimé son compte.</p>
        <button
          onClick={onBack}
          style={{
            marginTop: 8, padding: '10px 24px', borderRadius: 14,
            background: 'rgba(93,123,255,0.15)', border: '1px solid rgba(93,123,255,0.3)',
            color: '#5D7BFF', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Retour
        </button>
      </div>
    );
  }

  const color = avatarColor(profileUser.arenaName);
  const cl = connectLabel();
  const fl = followLabel();

  return (
    <div style={{ minHeight: '100vh', background: '#0A0C12', color: '#fff', fontFamily: 'inherit' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'rgba(10,12,18,0.92)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
      }}>
        <button
          onClick={onBack}
          style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
        >
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.5 }}>Profil</span>
        {isOwn ? (
          <button
            onClick={onOpenSettings}
            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)' }}
          >
            <Settings size={18} />
          </button>
        ) : (
          <div style={{ width: 36 }} />
        )}
      </div>

      {/* ── Hero section ───────────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        {/* Cover band */}
        <div style={{
          height: 120,
          background: `linear-gradient(135deg, ${color}55, ${color}22, rgba(10,12,18,0))`,
          borderBottom: `1px solid ${color}22`,
        }} />

        {/* Avatar overlapping cover */}
        <div style={{
          position: 'absolute', top: 76, left: 20,
          width: 80, height: 80, borderRadius: '50%',
          background: `${color}22`, border: `3px solid #0A0C12`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color, fontSize: 28, fontWeight: 900, letterSpacing: 1,
        }}>
          {initials(profileUser.arenaName)}
        </div>

        {/* Action button(s) top-right */}
        <div style={{ position: 'absolute', top: 130, right: 16, display: 'flex', gap: 8 }}>
          {isOwn ? (
            <button
              onClick={onOpenSettings}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 12,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Edit3 size={13} /> Modifier le profil
            </button>
          ) : (
            <>
              <button
                onClick={handleFollow}
                disabled={connBusy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: followStatus === 'accepted' ? 'rgba(93,123,255,0.18)' : 'rgba(255,255,255,0.06)',
                  border: followStatus === 'accepted' ? '1px solid rgba(93,123,255,0.35)' : '1px solid rgba(255,255,255,0.1)',
                  color: followStatus === 'accepted' ? '#5D7BFF' : 'rgba(255,255,255,0.7)',
                }}
              >
                {fl.icon} {fl.text}
              </button>
              <button
                onClick={handleConnect}
                disabled={connBusy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: connectStatus === 'accepted' ? 'rgba(52,211,153,0.15)' : 'rgba(93,123,255,0.18)',
                  border: connectStatus === 'accepted' ? '1px solid rgba(52,211,153,0.35)' : '1px solid rgba(93,123,255,0.35)',
                  color: connectStatus === 'accepted' ? '#34D399' : '#5D7BFF',
                }}
              >
                {cl.icon} {cl.text}
              </button>
            </>
          )}
        </div>

        {/* Name, job, bio */}
        <div style={{ padding: '56px 20px 20px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 2px', letterSpacing: 0.3 }}>
            {profileUser.arenaName}
          </h1>
          {profileUser.job && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Briefcase size={12} /> {profileUser.job}
            </p>
          )}
          {profileUser.bio && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55, margin: '6px 0 0', maxWidth: 380 }}>
              {profileUser.bio}
            </p>
          )}

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
            {[
              { value: profileUser.connectionsCount ?? 0, label: 'connexions' },
              { value: profileUser.followersCount ?? 0, label: 'abonnés' },
              { value: profileUser.personalPostsCount ?? 0, label: 'posts' },
            ].map(stat => (
              <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{stat.value}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>{stat.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#FBBF24', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Star size={14} fill="#FBBF24" /> {profileUser.credibilityScore}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>pts</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)',
        position: 'sticky', top: 60, zIndex: 20,
        background: 'rgba(10,12,18,0.95)', backdropFilter: 'blur(12px)',
      }}>
        {([
          { id: 'posts',  label: 'Posts' },
          { id: 'about',  label: 'À propos' },
          { id: 'badges', label: 'Badges' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '13px 0', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.id ? 800 : 500,
              color: tab === t.id ? '#5D7BFF' : 'rgba(255,255,255,0.4)',
              borderBottom: tab === t.id ? '2px solid #5D7BFF' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 16px 80px' }}>
        <AnimatePresence mode="wait">

          {/* Posts tab */}
          {tab === 'posts' && (
            <motion.div key="posts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {isOwn && (
                <div style={{ marginBottom: 14 }}>
                  <AnimatePresence>
                    {showNewPost ? (
                      <NewPostForm
                        key="form"
                        myUserId={myUserId}
                        myArenaUser={myArenaUser!}
                        onCreated={handlePostCreated}
                        onClose={() => setShowNewPost(false)}
                      />
                    ) : (
                      <motion.button
                        key="btn"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowNewPost(true)}
                        style={{
                          width: '100%', padding: '12px 0', borderRadius: 16,
                          background: 'rgba(93,123,255,0.1)', border: '1.5px dashed rgba(93,123,255,0.3)',
                          color: '#5D7BFF', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                      >
                        <Plus size={15} /> Nouveau post
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {postsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                  <Loader2 size={24} color="#5D7BFF" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : posts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
                    {isOwn ? 'Aucun post pour le moment. Partagez votre première pensée !' : 'Aucun post visible.'}
                  </p>
                </div>
              ) : (
                posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    myUserId={myUserId}
                    myArenaUser={myArenaUser}
                    isOwn={isOwn}
                  />
                ))
              )}
            </motion.div>
          )}

          {/* À propos tab */}
          {tab === 'about' && (
            <motion.div key="about" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div style={{
                background: '#13161E', borderRadius: 20,
                border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
              }}>
                {/* Job */}
                {profileUser.job && (
                  <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(93,123,255,0.12)', border: '1px solid rgba(93,123,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Briefcase size={15} color="#5D7BFF" />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Profession</div>
                      <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, marginTop: 2 }}>{profileUser.job}</div>
                    </div>
                  </div>
                )}

                {/* Passions */}
                {profileUser.passions && profileUser.passions.length > 0 && (
                  <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Heart size={11} /> Passions
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {profileUser.passions.map(p => (
                        <span key={p} style={{
                          padding: '5px 12px', borderRadius: 20,
                          background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)',
                          color: '#A78BFA', fontSize: 12, fontWeight: 600,
                        }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Socials */}
                {profileUser.socials && Object.values(profileUser.socials).some(Boolean) && (
                  <div style={{ padding: '16px 18px' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                      Réseaux sociaux
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {profileUser.socials.twitter && (
                        <a href={`https://twitter.com/${profileUser.socials.twitter}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#38BDF8', textDecoration: 'none', fontSize: 13 }}>
                          <Twitter size={16} /> @{profileUser.socials.twitter}
                        </a>
                      )}
                      {profileUser.socials.instagram && (
                        <a href={`https://instagram.com/${profileUser.socials.instagram}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#FB7185', textDecoration: 'none', fontSize: 13 }}>
                          <Instagram size={16} /> @{profileUser.socials.instagram}
                        </a>
                      )}
                      {profileUser.socials.website && (
                        <a href={profileUser.socials.website} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#34D399', textDecoration: 'none', fontSize: 13 }}>
                          <Globe size={16} /> {profileUser.socials.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                      {profileUser.socials.linkedin && (
                        <a href={`https://linkedin.com/in/${profileUser.socials.linkedin}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#5D7BFF', textDecoration: 'none', fontSize: 13 }}>
                          <Bookmark size={16} /> {profileUser.socials.linkedin}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {!profileUser.job && (!profileUser.passions || profileUser.passions.length === 0) && (!profileUser.socials || !Object.values(profileUser.socials).some(Boolean)) && (
                  <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🌐</div>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                      {isOwn ? 'Complétez votre profil dans les paramètres.' : 'Aucune information disponible.'}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Badges tab */}
          {tab === 'badges' && (
            <motion.div key="badges" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {profileUser.badges && profileUser.badges.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {profileUser.badges.map(badge => (
                    <motion.div
                      key={badge}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      style={{
                        background: '#13161E', borderRadius: 18,
                        border: '1px solid rgba(255,255,255,0.07)',
                        padding: '20px 16px', textAlign: 'center',
                      }}
                    >
                      <div style={{
                        width: 52, height: 52, borderRadius: '50%', margin: '0 auto 10px',
                        background: 'linear-gradient(135deg, #FBBF2422, #F9731622)',
                        border: '1px solid #FBBF2430',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24,
                      }}>
                        ⭐
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
                        {BADGE_LABELS[badge] ?? badge}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                        Badge mérité
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 16px' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
                    {isOwn
                      ? 'Participez aux débats pour gagner vos premiers badges !'
                      : 'Aucun badge encore.'}
                  </p>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
