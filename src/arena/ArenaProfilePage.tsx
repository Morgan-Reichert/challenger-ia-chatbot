import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Send, Loader2, X, ChevronDown, ChevronUp,
  Globe, Twitter, Instagram,
} from 'lucide-react';
import type {
  ArenaUser, PersonalPost, PersonalComment, PersonalCommentType,
  Visibility,
} from './arenaTypes';
import {
  getArenaUser, getPersonalPosts, getPersonalComments, addPersonalComment,
  createPersonalPost, likePersonalPost, upvotePersonalComment,
  getConnectionStatus, sendConnection, removeConnection,
} from './arenaFirestore';
import { Av, SerifTitle, MetaLabel, Dot, SERIF, cx, timeAgoLong } from './_editorial';

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

// ─── Constantes ───────────────────────────────────────────────────────────────

const COMMENT_TYPES: Record<PersonalCommentType, { label: string; desc: string }> = {
  argument:  { label: 'Argument',  desc: 'Un raisonnement structuré.' },
  question:  { label: 'Question',  desc: 'Une interrogation directe.' },
  intuition: { label: 'Intuition', desc: 'Une réaction immédiate.' },
};

const VISIBILITY_CONFIG: Record<Visibility, { label: string; desc: string }> = {
  public:  { label: 'Public',  desc: 'Visible de tous' },
  friends: { label: 'Connexions', desc: 'Vos connexions uniquement' },
  private: { label: 'Privé',  desc: 'Vous seul·e' },
};

const BADGE_LABELS: Record<string, string> = {
  'first_comment': 'Premier débat',
  'top_debater':   'Top débatteur',
  'credible':      'Crédible',
  'challenger':    'Challenger',
  'pioneer':       'Pionnier',
};

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  post, myUserId, myArenaUser,
}: {
  post: PersonalPost;
  myUserId: string;
  myArenaUser: ArenaUser | null;
  isOwn: boolean;
}) {
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
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-8 border-b border-[var(--border)]"
    >
      {/* Byline */}
      <div className="flex items-baseline gap-2 mb-3 flex-wrap">
        <Av name={post.authorArenaName} size={28} photoURL={post.authorPhotoURL} />
        <span
          className="text-[14px] text-[var(--text-primary)] italic ml-1"
          style={{ fontFamily: SERIF, fontWeight: 500 }}
        >
          {post.authorArenaName}
        </span>
        <Dot />
        <span className="text-[11px] text-[var(--text-primary)]/45 italic" style={{ fontFamily: SERIF }}>
          {timeAgoLong(post.createdAt)}
        </span>
        <Dot />
        <span className="text-[11px] text-[var(--text-primary)]/45 italic" style={{ fontFamily: SERIF }}>
          {visConfig.label.toLowerCase()}
        </span>
      </div>

      {/* Corps */}
      <div>
        {post.type === 'text' ? (
          <p
            className="text-[16px] text-[var(--text-primary)]/85 leading-[1.7]"
            style={{ fontFamily: SERIF }}
          >
            {post.content}
          </p>
        ) : (
          <div>
            {post.content && (
              <p
                className="text-[16px] text-[var(--text-primary)]/85 leading-[1.7] mb-4"
                style={{ fontFamily: SERIF }}
              >
                {post.content}
              </p>
            )}

            {post.aiQuestion && (
              <div className="my-4">
                <MetaLabel className="block mb-2">La question</MetaLabel>
                <blockquote
                  className="text-[16px] text-[var(--text-primary)]/85 italic leading-[1.55] pl-4 border-l border-[var(--text-primary)]/30"
                  style={{ fontFamily: SERIF }}
                >
                  {post.aiQuestion}
                </blockquote>
              </div>
            )}

            {post.aiResponse && (
              <div className="my-4">
                <button
                  onClick={() => setAiExpanded(v => !v)}
                  className="inline-flex items-baseline gap-2 text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] transition-colors mb-2"
                >
                  <MetaLabel>La réponse {post.personaName ? `de ${post.personaName}` : 'de l\'IA'}</MetaLabel>
                  {aiExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
                <AnimatePresence>
                  {aiExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p
                        className="text-[15px] text-[var(--text-primary)]/75 leading-[1.7] mt-2"
                        style={{ fontFamily: SERIF }}
                      >
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

      {/* Actions */}
      <div className="flex items-baseline gap-5 mt-5 text-[12px]" style={{ fontFamily: SERIF }}>
        <button
          onClick={handleLike}
          disabled={!myArenaUser}
          className={cx(
            'italic transition-colors disabled:cursor-default',
            liked
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]',
          )}
        >
          {liked ? '♥ ' : '♡ '}
          {likeCount > 0 ? `${likeCount} approbation${likeCount > 1 ? 's' : ''}` : 'approuver'}
        </button>
        <Dot />
        <button
          onClick={handleToggleComments}
          className={cx(
            'italic transition-colors',
            showComments
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]',
          )}
        >
          {post.commentCount > 0 ? `${post.commentCount} commentaire${post.commentCount > 1 ? 's' : ''}` : 'commenter'}
        </button>
      </div>

      {/* Commentaires */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-6 pl-4 border-l border-[var(--border)]">
              {commentsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={16} className="animate-spin text-[var(--text-primary)]/40" />
                </div>
              ) : comments.length === 0 ? (
                <p
                  className="text-[13px] text-[var(--text-primary)]/50 italic py-3"
                  style={{ fontFamily: SERIF }}
                >
                  Soyez la première voix sur ce post.
                </p>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => {
                    const ct = COMMENT_TYPES[comment.type];
                    const isUpvoted = comment.upvotedBy.includes(myUserId);
                    return (
                      <div key={comment.id} className="pb-4 border-b border-[var(--border)]/60 last:border-0">
                        <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                          <Av name={comment.authorArenaName} size={22} photoURL={comment.authorPhotoURL} />
                          <span
                            className="text-[13px] text-[var(--text-primary)] italic ml-1"
                            style={{ fontFamily: SERIF, fontWeight: 500 }}
                          >
                            {comment.authorArenaName}
                          </span>
                          <Dot />
                          <span
                            className="text-[11px] text-[var(--text-primary)]/55 italic"
                            style={{ fontFamily: SERIF }}
                          >
                            {ct.label.toLowerCase()}
                          </span>
                          <span className="text-[11px] text-[var(--text-primary)]/35 italic ml-auto" style={{ fontFamily: SERIF }}>
                            {timeAgoLong(comment.createdAt)}
                          </span>
                        </div>
                        <p
                          className="text-[14px] text-[var(--text-primary)]/80 leading-[1.7]"
                          style={{ fontFamily: SERIF }}
                        >
                          {comment.content}
                        </p>
                        <button
                          onClick={() => handleUpvoteComment(comment)}
                          disabled={!myArenaUser}
                          className={cx(
                            'mt-2 text-[11px] italic transition-colors disabled:cursor-default',
                            isUpvoted
                              ? 'text-[var(--text-primary)]'
                              : 'text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]',
                          )}
                          style={{ fontFamily: SERIF }}
                        >
                          {isUpvoted ? '♥ ' : '♡ '}
                          {comment.upvotes > 0 ? comment.upvotes : 'approuver'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Champ de commentaire */}
              {myArenaUser && (
                <div className="mt-5">
                  {/* Sélecteur de type */}
                  <div className="flex items-baseline gap-4 mb-3 text-[11px] uppercase" style={{ letterSpacing: '0.22em' }}>
                    <span className="text-[var(--text-primary)]/40">Type</span>
                    {(Object.keys(COMMENT_TYPES) as PersonalCommentType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => setCommentType(type)}
                        className={cx(
                          'transition-colors pb-1 border-b',
                          commentType === type
                            ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                            : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 border-transparent',
                        )}
                      >
                        {COMMENT_TYPES[type].label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-end gap-3 border-b border-[var(--text-primary)]/30 pb-2">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder={COMMENT_TYPES[commentType].desc}
                      rows={2}
                      className="flex-1 bg-transparent border-0 text-[var(--text-primary)] text-[14px] resize-none outline-none placeholder:text-[var(--text-primary)]/35 leading-relaxed"
                      style={{ fontFamily: SERIF, fontStyle: 'italic' }}
                    />
                    <button
                      onClick={handleSubmitComment}
                      disabled={!commentText.trim() || submitting}
                      className="text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors leading-none pb-1"
                    >
                      {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

// ─── Nouveau post ─────────────────────────────────────────────────────────────

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
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="py-6 mb-6 border-y border-[var(--text-primary)]/25"
    >
      <div className="flex items-baseline justify-between mb-5">
        <MetaLabel>Nouveau post</MetaLabel>
        <button onClick={onClose} className="text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors leading-none">
          <X size={14} />
        </button>
      </div>

      {/* Mode */}
      <div className="flex items-baseline gap-4 mb-5 text-[11px] uppercase" style={{ letterSpacing: '0.22em' }}>
        <span className="text-[var(--text-primary)]/40">Format</span>
        {(['text', 'ia'] as PostMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cx(
              'transition-colors pb-1 border-b',
              mode === m
                ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 border-transparent',
            )}
          >
            {m === 'text' ? 'Texte libre' : 'Conversation IA'}
          </button>
        ))}
      </div>

      {/* Champs */}
      {mode === 'text' ? (
        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Partagez une pensée…"
            rows={4}
            maxLength={500}
            className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[16px] py-2 outline-none resize-none transition-colors placeholder:text-[var(--text-primary)]/35 leading-[1.6]"
            style={{ fontFamily: SERIF, fontStyle: 'italic' }}
          />
          <p
            className="text-[11px] text-[var(--text-primary)]/40 italic mt-2 text-right tabular-nums"
            style={{ fontFamily: SERIF }}
          >
            {content.length} / 500
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <MetaLabel className="block mb-2">Votre question</MetaLabel>
            <textarea
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder="Quelle question avez-vous posée à l'IA ?"
              rows={2}
              className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[15px] py-2 outline-none resize-none transition-colors placeholder:text-[var(--text-primary)]/35 leading-[1.6]"
              style={{ fontFamily: SERIF, fontStyle: 'italic' }}
            />
          </div>
          <div>
            <MetaLabel className="block mb-2">Réponse de l'IA</MetaLabel>
            <textarea
              value={aiResponse}
              onChange={(e) => setAiResponse(e.target.value)}
              placeholder="Collez ici la réponse de l'IA…"
              rows={4}
              className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[15px] py-2 outline-none resize-none transition-colors placeholder:text-[var(--text-primary)]/35 leading-[1.6]"
              style={{ fontFamily: SERIF, fontStyle: 'italic' }}
            />
          </div>
          <div>
            <MetaLabel className="block mb-2">Persona (facultatif)</MetaLabel>
            <input
              value={personaName}
              onChange={(e) => setPersonaName(e.target.value)}
              placeholder="ex. Socrate, GPT-4, Mistral…"
              className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[15px] py-2 outline-none transition-colors placeholder:text-[var(--text-primary)]/35"
              style={{ fontFamily: SERIF, fontStyle: 'italic' }}
            />
          </div>
        </div>
      )}

      {/* Visibilité */}
      <div className="mt-6">
        <div className="flex items-baseline gap-4 text-[11px] uppercase" style={{ letterSpacing: '0.22em' }}>
          <span className="text-[var(--text-primary)]/40">Visibilité</span>
          {(Object.keys(VISIBILITY_CONFIG) as Visibility[]).map((v) => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={cx(
                'transition-colors pb-1 border-b',
                visibility === v
                  ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                  : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 border-transparent',
              )}
            >
              {VISIBILITY_CONFIG[v].label}
            </button>
          ))}
        </div>
        <p
          className="text-[11px] text-[var(--text-primary)]/45 italic mt-2"
          style={{ fontFamily: SERIF }}
        >
          {VISIBILITY_CONFIG[visibility].desc}.
        </p>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="mt-6 w-full text-[12px] uppercase text-[var(--text-primary)] py-3 border-y border-[var(--border)] hover:bg-[var(--text-primary)]/[0.04] disabled:opacity-30 disabled:cursor-default transition-all flex items-center justify-center gap-3"
        style={{ letterSpacing: '0.24em' }}
      >
        {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
        Publier
        <span className="text-[var(--text-primary)]/40">→</span>
      </button>
    </motion.div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ArenaProfilePage({
  targetUserId, myUserId, myArenaUser, onBack, onOpenSettings, onViewProfile: _onViewProfile,
}: Props) {
  void _onViewProfile;
  const isOwn = targetUserId === myUserId;

  const [profileUser, setProfileUser] = useState<ArenaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [tab, setTab] = useState<Tab>('posts');
  const [posts, setPosts] = useState<PersonalPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  const [showNewPost, setShowNewPost] = useState(false);

  const [connectStatus, setConnectStatus] = useState<string | null>(null);
  const [followStatus, setFollowStatus] = useState<string | null>(null);
  const [connBusy, setConnBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    getArenaUser(targetUserId).then(u => {
      if (!u) setNotFound(true);
      else setProfileUser(u);
      setLoading(false);
    });
  }, [targetUserId]);

  useEffect(() => {
    if (!profileUser || tab !== 'posts') return;
    setPostsLoading(true);
    const relation = isOwn ? 'self' : (connectStatus === 'accepted' ? 'friend' : 'public');
    getPersonalPosts(targetUserId, relation).then(p => {
      setPosts(p);
      setPostsLoading(false);
    });
  }, [profileUser, tab, isOwn, connectStatus, targetUserId]);

  useEffect(() => {
    if (isOwn || !myUserId || !targetUserId) return;
    getConnectionStatus(myUserId, targetUserId).then(cs => {
      setConnectStatus(cs.connect);
      setFollowStatus(cs.iFollowThem ? 'accepted' : cs.follow);
    });
  }, [isOwn, myUserId, targetUserId]);

  const handleConnect = async () => {
    if (!myArenaUser || connBusy || !profileUser) return;
    setConnBusy(true);
    if (connectStatus === 'accepted' || connectStatus === 'pending') {
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

  // ── États ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-app)]">
        <Loader2 size={20} className="animate-spin text-[var(--text-primary)]/40" />
      </div>
    );
  }

  if (notFound || !profileUser) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-[var(--bg-app)] px-8">
        <SerifTitle size="md" className="text-center">Profil introuvable</SerifTitle>
        <p
          className="text-[14px] text-[var(--text-primary)]/55 italic text-center max-w-md leading-relaxed"
          style={{ fontFamily: SERIF }}
        >
          Cet utilisateur n'existe pas ou a quitté l'Arène.
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
  }

  const connectVerb = (): string => {
    if (connectStatus === 'accepted') return 'Vous êtes connectés';
    if (connectStatus === 'pending') return 'Demande en attente';
    return 'Se connecter';
  };

  const followVerb = (): string => followStatus === 'accepted' ? 'Vous suivez' : 'Suivre';

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-app)]">
      {/* Top bar éditoriale */}
      <div className="flex-shrink-0 bg-[var(--bg-chat)] border-b border-[var(--border)]">
        <div className="flex items-center gap-4 px-6 py-4 max-w-3xl mx-auto w-full">
          <button
            onClick={onBack}
            className="text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] transition-colors leading-none"
          >
            <ArrowLeft size={16} />
          </button>
          <h1
            className="flex-1 text-[18px] text-[var(--text-primary)] leading-none"
            style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            Profil
          </h1>
          {isOwn && (
            <button
              onClick={onOpenSettings}
              className="text-[11px] uppercase text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] transition-colors"
              style={{ letterSpacing: '0.22em' }}
            >
              Modifier
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 pt-12 pb-32">
          {/* En-tête éditorial du profil */}
          <header className="pb-8 border-b border-[var(--border)]">
            <div className="flex items-start gap-6 mb-6">
              <Av name={profileUser.arenaName} size={84} prominent photoURL={profileUser.photoURL} />
              <div className="flex-1 min-w-0 pt-2">
                <SerifTitle size="xl" className="mb-2">
                  {profileUser.arenaName}
                </SerifTitle>
                {profileUser.job && (
                  <p
                    className="text-[16px] text-[var(--text-primary)]/65 italic leading-tight"
                    style={{ fontFamily: SERIF }}
                  >
                    {profileUser.job}
                  </p>
                )}
                <p
                  className="text-[12px] text-[var(--text-primary)]/55 italic mt-2"
                  style={{ fontFamily: SERIF }}
                >
                  <span className="tabular-nums">{profileUser.credibilityScore}</span> points de crédibilité
                </p>
              </div>
            </div>

            {/* Bio */}
            {profileUser.bio && (
              <p
                className="text-[17px] text-[var(--text-primary)]/80 italic leading-[1.6] mb-6 max-w-2xl"
                style={{ fontFamily: SERIF }}
              >
                « {profileUser.bio} »
              </p>
            )}

            {/* Statistiques */}
            <div className="flex items-baseline gap-10 mb-6 flex-wrap">
              {[
                { value: profileUser.connectionsCount ?? 0, label: 'Connexions' },
                { value: profileUser.followersCount ?? 0, label: 'Abonnés' },
                { value: profileUser.personalPostsCount ?? 0, label: 'Posts' },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col items-baseline gap-1">
                  <span
                    className="text-[28px] text-[var(--text-primary)] tabular-nums leading-none"
                    style={{ fontFamily: SERIF, fontWeight: 600 }}
                  >
                    {stat.value}
                  </span>
                  <MetaLabel>{stat.label}</MetaLabel>
                </div>
              ))}
            </div>

            {/* Actions */}
            {!isOwn && (
              <div className="flex items-baseline gap-5 text-[12px] uppercase flex-wrap" style={{ letterSpacing: '0.22em' }}>
                <button
                  onClick={handleConnect}
                  disabled={connBusy}
                  className={cx(
                    'transition-colors pb-1 border-b disabled:opacity-50 disabled:cursor-default',
                    connectStatus === 'accepted'
                      ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] border-transparent',
                  )}
                >
                  {connBusy ? <Loader2 size={11} className="animate-spin inline mr-1" /> : null}
                  {connectVerb()}
                </button>
                <Dot />
                <button
                  onClick={handleFollow}
                  disabled={connBusy}
                  className={cx(
                    'transition-colors pb-1 border-b disabled:opacity-50 disabled:cursor-default',
                    followStatus === 'accepted'
                      ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] border-transparent',
                  )}
                >
                  {followVerb()}
                </button>
              </div>
            )}
          </header>

          {/* Onglets */}
          <nav className="flex items-baseline gap-6 pt-6 pb-4 border-b border-[var(--border)]">
            {([
              { id: 'posts',  label: 'Posts' },
              { id: 'about',  label: 'À propos' },
              { id: 'badges', label: 'Distinctions' },
            ] as { id: Tab; label: string }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cx(
                  'text-[12px] uppercase transition-colors pb-2 -mb-px border-b',
                  tab === t.id
                    ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                    : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 border-transparent',
                )}
                style={{ letterSpacing: '0.22em' }}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* Contenu des onglets */}
          <AnimatePresence mode="wait">
            {tab === 'posts' && (
              <motion.div key="posts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {isOwn && (
                  <div>
                    <AnimatePresence mode="wait">
                      {showNewPost && myArenaUser ? (
                        <NewPostForm
                          key="form"
                          myUserId={myUserId}
                          myArenaUser={myArenaUser}
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
                          className="w-full text-[12px] uppercase text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] py-5 mt-2 mb-2 border-b border-[var(--border)] hover:bg-[var(--text-primary)]/[0.02] transition-colors flex items-center justify-center gap-3"
                          style={{ letterSpacing: '0.24em' }}
                        >
                          <span className="text-[var(--text-primary)]/40">+</span>
                          Écrire un nouveau post
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {postsLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 size={18} className="animate-spin text-[var(--text-primary)]/40" />
                  </div>
                ) : posts.length === 0 ? (
                  <div className="text-center py-16">
                    <SerifTitle size="sm" className="mb-2">
                      {isOwn ? 'Vous n\'avez encore rien publié' : 'Pas encore de posts'}
                    </SerifTitle>
                    <p
                      className="text-[14px] text-[var(--text-primary)]/55 italic max-w-md mx-auto"
                      style={{ fontFamily: SERIF }}
                    >
                      {isOwn
                        ? 'Partagez votre première pensée — un texte libre ou une conversation IA marquante.'
                        : 'Cette personne n\'a pas encore partagé de publications visibles.'}
                    </p>
                  </div>
                ) : (
                  <div>
                    {posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        myUserId={myUserId}
                        myArenaUser={myArenaUser}
                        isOwn={isOwn}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {tab === 'about' && (
              <motion.div key="about" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-8 space-y-8">
                {profileUser.job && (
                  <div>
                    <MetaLabel className="block mb-2">Profession</MetaLabel>
                    <p
                      className="text-[18px] text-[var(--text-primary)] italic"
                      style={{ fontFamily: SERIF, fontWeight: 500 }}
                    >
                      {profileUser.job}
                    </p>
                  </div>
                )}

                {profileUser.passions && profileUser.passions.length > 0 && (
                  <div>
                    <MetaLabel className="block mb-3">Centres d'intérêt</MetaLabel>
                    <p
                      className="text-[17px] text-[var(--text-primary)]/80 italic leading-[1.7]"
                      style={{ fontFamily: SERIF }}
                    >
                      {profileUser.passions.join(' · ')}
                    </p>
                  </div>
                )}

                {profileUser.socials && Object.values(profileUser.socials).some(Boolean) && (
                  <div>
                    <MetaLabel className="block mb-3">Présent ailleurs</MetaLabel>
                    <div className="space-y-2">
                      {profileUser.socials.twitter && (
                        <a
                          href={`https://twitter.com/${profileUser.socials.twitter}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-[15px] text-[var(--text-primary)]/75 hover:text-[var(--text-primary)] italic transition-colors block"
                          style={{ fontFamily: SERIF }}
                        >
                          <Twitter size={14} className="text-[var(--text-primary)]/55" />
                          @{profileUser.socials.twitter}
                        </a>
                      )}
                      {profileUser.socials.instagram && (
                        <a
                          href={`https://instagram.com/${profileUser.socials.instagram}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-[15px] text-[var(--text-primary)]/75 hover:text-[var(--text-primary)] italic transition-colors block"
                          style={{ fontFamily: SERIF }}
                        >
                          <Instagram size={14} className="text-[var(--text-primary)]/55" />
                          @{profileUser.socials.instagram}
                        </a>
                      )}
                      {profileUser.socials.website && (
                        <a
                          href={profileUser.socials.website.startsWith('http') ? profileUser.socials.website : `https://${profileUser.socials.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-[15px] text-[var(--text-primary)]/75 hover:text-[var(--text-primary)] italic transition-colors block"
                          style={{ fontFamily: SERIF }}
                        >
                          <Globe size={14} className="text-[var(--text-primary)]/55" />
                          {profileUser.socials.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                      {profileUser.socials.linkedin && (
                        <a
                          href={`https://linkedin.com/in/${profileUser.socials.linkedin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-[15px] text-[var(--text-primary)]/75 hover:text-[var(--text-primary)] italic transition-colors block"
                          style={{ fontFamily: SERIF }}
                        >
                          <span className="text-[var(--text-primary)]/55 text-[14px]">in</span>
                          {profileUser.socials.linkedin}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {!profileUser.job
                  && (!profileUser.passions || profileUser.passions.length === 0)
                  && (!profileUser.socials || !Object.values(profileUser.socials).some(Boolean)) && (
                    <p
                      className="text-[14px] text-[var(--text-primary)]/55 italic text-center py-16"
                      style={{ fontFamily: SERIF }}
                    >
                      {isOwn
                        ? 'Complétez votre profil dans les paramètres pour qu\'on apprenne à vous connaître.'
                        : 'Cette personne n\'a pas encore renseigné d\'informations.'}
                    </p>
                  )}
              </motion.div>
            )}

            {tab === 'badges' && (
              <motion.div key="badges" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-8">
                {profileUser.badges && profileUser.badges.length > 0 ? (
                  <div className="space-y-5">
                    {profileUser.badges.map((badge) => (
                      <motion.div
                        key={badge}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-baseline gap-4 pb-5 border-b border-[var(--border)] last:border-0"
                      >
                        <span
                          className="text-[var(--text-primary)]/55"
                          style={{ fontFamily: SERIF, fontSize: 24, fontStyle: 'italic' }}
                        >
                          ✦
                        </span>
                        <div className="flex-1">
                          <SerifTitle size="sm" className="leading-tight">
                            {BADGE_LABELS[badge] ?? badge}
                          </SerifTitle>
                          <p
                            className="text-[13px] text-[var(--text-primary)]/55 italic mt-1"
                            style={{ fontFamily: SERIF }}
                          >
                            Distinction obtenue
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <SerifTitle size="sm" className="mb-2">
                      Aucune distinction pour l'instant
                    </SerifTitle>
                    <p
                      className="text-[14px] text-[var(--text-primary)]/55 italic max-w-md mx-auto"
                      style={{ fontFamily: SERIF }}
                    >
                      {isOwn
                        ? 'Participez à des débats — défendez vos idées avec rigueur, et les distinctions viendront.'
                        : 'Cette personne n\'a pas encore reçu de distinction.'}
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
