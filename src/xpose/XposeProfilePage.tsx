import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Camera, Edit3, UserPlus, UserCheck, Star, MessageSquare,
  Zap, Trash2, Image, Loader2, X, Check, Globe, Twitter, Instagram,
  Briefcase, Heart, Plus,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ArenaUser } from '../arena/arenaTypes';
import type { XposePost } from './xposeTypes';
import {
  getArenaUser, updateArenaUserProfile, getMyConnections,
  sendConnection, removeConnection,
} from '../arena/arenaFirestore';
import { getUserXposePosts, deleteXposePost, resonatePost } from './xposeFirestore';
import { uploadProfilePhoto } from '../arena/arenaStorage';
import type { ArenaConnection } from '../arena/arenaTypes';

// ─── Constants ────────────────────────────────────────────────────────────────

const PALETTE = ['#5D7BFF', '#34D399', '#F87171', '#FBBF24', '#A78BFA', '#F97316', '#38BDF8', '#FB7185'];
const BG = '#000';
const SEPARATOR = '1px solid #2f3336';
const TEXT_PRIMARY = '#e7e9ea';
const TEXT_SECONDARY = '#71767b';
const ACCENT = '#5D7BFF';
const GOLD = '#FBBF24';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
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

const POST_TYPE_LABELS: Record<string, string> = {
  pensee: 'Pensée',
  echange_ia: 'Échange IA',
  arene: 'Arène',
  sondage: 'Sondage',
  question_ouverte: 'Question',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  user: User;
  targetUserId: string;
  myArenaUser: ArenaUser | null;
  onBack: () => void;
  onViewProfile: (userId: string) => void;
}

// ─── Avatar component ─────────────────────────────────────────────────────────

function Avatar({ name, photoURL, size = 40 }: { name: string; photoURL?: string; size?: number }) {
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
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: avatarColor(name),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: size * 0.36, fontWeight: 700, color: '#fff',
      }}
    >
      {initials(name)}
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  arenaUser: ArenaUser;
  userId: string;
  onClose: () => void;
  onSaved: (updated: ArenaUser) => void;
}

function EditModal({ arenaUser, userId, onClose, onSaved }: EditModalProps) {
  const [bio, setBio] = useState(arenaUser.bio ?? '');
  const [job, setJob] = useState(arenaUser.job ?? '');
  const [passions, setPassions] = useState<string[]>(arenaUser.passions ?? []);
  const [passionInput, setPassionInput] = useState('');
  const [socials, setSocials] = useState({
    twitter: arenaUser.socials?.twitter ?? '',
    linkedin: arenaUser.socials?.linkedin ?? '',
    instagram: arenaUser.socials?.instagram ?? '',
    tiktok: arenaUser.socials?.tiktok ?? '',
    website: arenaUser.socials?.website ?? '',
  });
  const [visibility, setVisibility] = useState<'public' | 'friends'>(
    (arenaUser.profileVisibility as 'public' | 'friends') ?? 'public'
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(arenaUser.photoURL ?? null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function addPassion() {
    const t = passionInput.trim();
    if (t && !passions.includes(t) && passions.length < 10) {
      setPassions([...passions, t]);
      setPassionInput('');
    }
  }

  function removePassion(p: string) {
    setPassions(passions.filter(x => x !== p));
  }

  async function handleSave() {
    setSaving(true);
    try {
      let photoURL = arenaUser.photoURL;
      if (photoFile) {
        photoURL = await uploadProfilePhoto(userId, photoFile);
      }
      const updated: Partial<ArenaUser> = {
        bio: bio.slice(0, 160),
        job,
        passions,
        socials,
        profileVisibility: visibility,
        ...(photoURL ? { photoURL } : {}),
      };
      await updateArenaUserProfile(userId, updated);
      onSaved({ ...arenaUser, ...updated });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: '#0d0d0d',
    border: SEPARATOR,
    borderRadius: 8,
    padding: '10px 12px',
    color: TEXT_PRIMARY,
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginBottom: 6,
    display: 'block',
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          style={{
            background: '#0a0a0a',
            borderRadius: 16,
            border: SEPARATOR,
            width: '100%',
            maxWidth: 520,
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 24,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <span style={{ fontWeight: 700, fontSize: 18, color: TEXT_PRIMARY }}>Modifier le profil</span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_SECONDARY, padding: 4 }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Photo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={arenaUser.arenaName} photoURL={photoPreview ?? undefined} size={80} />
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  position: 'absolute', bottom: 0, right: 0,
                  background: ACCENT, border: 'none', borderRadius: '50%',
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Camera size={14} color="#fff" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            </div>
            <span style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 8 }}>Changer la photo</span>
          </div>

          {/* Pseudo (read-only) */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Pseudo</label>
            <input
              value={arenaUser.arenaName}
              readOnly
              style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }}
            />
          </div>

          {/* Bio */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Bio <span style={{ color: TEXT_SECONDARY }}>{bio.length}/160</span></label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, 160))}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Parle-nous de toi..."
            />
          </div>

          {/* Emploi */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Emploi</label>
            <div style={{ position: 'relative' }}>
              <Briefcase size={15} color={TEXT_SECONDARY} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                value={job}
                onChange={e => setJob(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 36 }}
                placeholder="Ex: Développeur, Étudiant..."
              />
            </div>
          </div>

          {/* Passions */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Passions</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={passionInput}
                onChange={e => setPassionInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPassion(); } }}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Ajouter une passion..."
              />
              <button
                onClick={addPassion}
                style={{
                  background: ACCENT, border: 'none', borderRadius: 8,
                  padding: '0 14px', cursor: 'pointer', color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {passions.map(p => (
                <div
                  key={p}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: '#1a1a2e', borderRadius: 99, padding: '4px 10px',
                    border: `1px solid ${ACCENT}33`,
                  }}
                >
                  <span style={{ fontSize: 13, color: TEXT_PRIMARY }}>{p}</span>
                  <button
                    onClick={() => removePassion(p)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_SECONDARY, padding: 0, lineHeight: 1 }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Réseaux sociaux */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Réseaux sociaux</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'twitter', icon: <Twitter size={15} color="#1DA1F2" />, placeholder: 'Twitter / X' },
                { key: 'linkedin', icon: <Globe size={15} color="#0A66C2" />, placeholder: 'LinkedIn' },
                { key: 'instagram', icon: <Instagram size={15} color="#E1306C" />, placeholder: 'Instagram' },
                { key: 'tiktok', icon: <Heart size={15} color="#FE2C55" />, placeholder: 'TikTok' },
                { key: 'website', icon: <Globe size={15} color={TEXT_SECONDARY} />, placeholder: 'Site web' },
              ].map(({ key, icon, placeholder }) => (
                <div key={key} style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>{icon}</span>
                  <input
                    value={(socials as Record<string, string>)[key]}
                    onChange={e => setSocials({ ...socials, [key]: e.target.value })}
                    style={{ ...inputStyle, paddingLeft: 36 }}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Visibilité */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Visibilité du profil</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['public', 'friends'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 99, cursor: 'pointer',
                    border: visibility === v ? `1px solid ${ACCENT}` : SEPARATOR,
                    background: visibility === v ? `${ACCENT}22` : 'transparent',
                    color: visibility === v ? ACCENT : TEXT_SECONDARY,
                    fontSize: 14, fontWeight: visibility === v ? 600 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {v === 'public' ? 'Public' : 'Amis seulement'}
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 99,
              background: ACCENT, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              color: '#fff', fontWeight: 700, fontSize: 15,
              opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: XposePost;
  userId: string;
  isOwner: boolean;
  onDelete: (postId: string) => void;
  onResonate: (postId: string, isResonated: boolean) => void;
}

function PostCard({ post, userId, isOwner, onDelete, onResonate }: PostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isResonated = post.resonatedBy.includes(userId);
  const MAX = 200;
  const caption = post.caption ?? post.questionText ?? post.aiQuestion ?? '';
  const isTruncatable = caption.length > MAX;
  const displayText = isTruncatable && !expanded ? caption.slice(0, MAX) + '…' : caption;

  return (
    <div
      style={{
        padding: '16px 16px',
        borderBottom: SEPARATOR,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Type badge + time */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, borderRadius: 99,
            padding: '2px 8px',
            background: '#1a1a2e', color: ACCENT,
            border: `1px solid ${ACCENT}44`,
          }}
        >
          {POST_TYPE_LABELS[post.type] ?? post.type}
        </span>
        <span style={{ fontSize: 12, color: TEXT_SECONDARY }}>{timeAgo(post.createdAt)}</span>
      </div>

      {/* Caption */}
      {caption && (
        <div>
          <p style={{ margin: 0, fontSize: 15, color: TEXT_PRIMARY, lineHeight: 1.5 }}>
            {displayText}
          </p>
          {isTruncatable && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: ACCENT, fontSize: 14, padding: 0, marginTop: 4,
              }}
            >
              {expanded ? 'Voir moins' : 'Voir plus'}
            </button>
          )}
        </div>
      )}

      {/* Images preview */}
      {post.imageUrls && post.imageUrls.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: post.imageUrls.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: 4, borderRadius: 12, overflow: 'hidden',
          }}
        >
          {post.imageUrls.slice(0, 4).map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }}
            />
          ))}
        </div>
      )}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {post.tags.map(t => (
            <span key={t} style={{ fontSize: 13, color: ACCENT }}>#{t}</span>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <button
          onClick={() => onResonate(post.id, isResonated)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, padding: 0,
            color: isResonated ? '#F97316' : TEXT_SECONDARY,
          }}
        >
          <Zap size={16} fill={isResonated ? '#F97316' : 'none'} />
          <span style={{ fontSize: 13 }}>{post.resonanceCount}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: TEXT_SECONDARY }}>
          <MessageSquare size={16} />
          <span style={{ fontSize: 13 }}>{post.commentCount}</span>
        </div>
        {isOwner && (
          <button
            onClick={() => onDelete(post.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#F87171', padding: 0, marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Connection Row ───────────────────────────────────────────────────────────

interface ConnectionRowProps {
  conn: ArenaConnection;
  myUserId: string;
  isMyProfile: boolean;
  mode: 'followers' | 'following';
  onViewProfile: (uid: string) => void;
  onRemove: (conn: ArenaConnection) => void;
  onFollow: (conn: ArenaConnection) => void;
}

function ConnectionRow({ conn, myUserId, isMyProfile, mode, onViewProfile, onRemove, onFollow }: ConnectionRowProps) {
  // In 'followers': the person who follows targetUser is conn.fromUserId
  // In 'following': the person being followed is conn.toUserId
  const isFollowing = mode === 'followers';
  const otherUserId = isFollowing ? conn.fromUserId : conn.toUserId;
  const otherName = isFollowing ? conn.fromArenaName : conn.toArenaName;
  const otherPhoto = isFollowing ? conn.fromPhotoURL : conn.toPhotoURL;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderBottom: SEPARATOR,
      }}
    >
      <button
        onClick={() => onViewProfile(otherUserId)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <Avatar name={otherName} photoURL={otherPhoto} size={44} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          onClick={() => onViewProfile(otherUserId)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
        >
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: TEXT_PRIMARY }}>{otherName}</p>
          <p style={{ margin: 0, fontSize: 13, color: TEXT_SECONDARY }}>@{otherName.toLowerCase().replace(/\s/g, '_')}</p>
        </button>
      </div>
      {isMyProfile && (
        <button
          onClick={() => (mode === 'following' ? onRemove(conn) : onFollow(conn))}
          style={{
            border: SEPARATOR, borderRadius: 99, padding: '6px 14px',
            background: 'transparent', color: TEXT_PRIMARY, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {mode === 'following' ? (
            <><UserCheck size={14} /> Abonné</>
          ) : (
            <><UserPlus size={14} /> Suivre</>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function XposeProfilePage({ user, targetUserId, myArenaUser, onBack, onViewProfile }: Props) {
  const isMyProfile = user.uid === targetUserId;

  const [profileUser, setProfileUser] = useState<ArenaUser | null>(null);
  const [posts, setPosts] = useState<XposePost[]>([]);
  const [connections, setConnections] = useState<ArenaConnection[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'medias' | 'followers' | 'following'>('posts');
  const [showEditModal, setShowEditModal] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Load profile
  useEffect(() => {
    setLoadingProfile(true);
    getArenaUser(targetUserId).then(u => {
      setProfileUser(u);
      setLoadingProfile(false);
    });
  }, [targetUserId]);

  // Load posts
  useEffect(() => {
    setLoadingPosts(true);
    getUserXposePosts(targetUserId).then(p => {
      setPosts(p);
      setLoadingPosts(false);
    });
  }, [targetUserId]);

  // Load connections & check follow status
  useEffect(() => {
    getMyConnections(targetUserId).then(setConnections);
    if (!isMyProfile) {
      getMyConnections(user.uid).then(myConns => {
        const following = myConns.some(
          c => c.fromUserId === user.uid && c.toUserId === targetUserId && c.status === 'accepted'
        );
        setIsFollowing(following);
      });
    }
  }, [targetUserId, user.uid, isMyProfile]);

  async function handleFollow() {
    if (!myArenaUser) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await removeConnection(user.uid, targetUserId, 'follow');
        setIsFollowing(false);
      } else {
        await sendConnection(
          user.uid,
          myArenaUser.arenaName,
          myArenaUser.photoURL,
          targetUserId,
          profileUser?.arenaName ?? '',
          profileUser?.photoURL,
          'follow',
        );
        setIsFollowing(true);
      }
    } finally {
      setFollowLoading(false);
    }
  }

  async function handleDeletePost(postId: string) {
    if (!window.confirm('Supprimer ce post ?')) return;
    await deleteXposePost(postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  }

  async function handleResonate(postId: string, isResonated: boolean) {
    await resonatePost(postId, user.uid, isResonated);
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return {
        ...p,
        resonanceCount: isResonated ? p.resonanceCount - 1 : p.resonanceCount + 1,
        resonatedBy: isResonated
          ? p.resonatedBy.filter(id => id !== user.uid)
          : [...p.resonatedBy, user.uid],
      };
    }));
  }

  async function handleRemoveFollowing(conn: ArenaConnection) {
    await removeConnection(conn.fromUserId, conn.toUserId, conn.type as import('../arena/arenaTypes').ConnectionType);
    setConnections(prev => prev.filter(c => c.id !== conn.id));
  }

  async function handleFollowBack(conn: ArenaConnection) {
    if (!myArenaUser) return;
    await sendConnection(
      user.uid,
      myArenaUser.arenaName,
      myArenaUser.photoURL,
      conn.fromUserId,
      conn.fromArenaName,
      conn.fromPhotoURL,
      'follow',
    );
  }

  // Derived data
  const followers = connections.filter(c => c.toUserId === targetUserId && c.status === 'accepted');
  const following = connections.filter(c => c.fromUserId === targetUserId && c.status === 'accepted');
  const mediaUrls = posts.flatMap(p => p.imageUrls ?? []);
  const credibilityScore = profileUser?.credibilityScore ?? 0;
  const displayName = profileUser?.arenaName ?? (isMyProfile ? myArenaUser?.arenaName : '') ?? '—';

  const TABS = [
    { key: 'posts', label: `Posts` },
    { key: 'medias', label: 'Médias' },
    { key: 'followers', label: `Abonnés` },
    { key: 'following', label: `Abonnements` },
  ] as const;

  if (loadingProfile) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} color={ACCENT} className="animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT_PRIMARY, maxWidth: 640, margin: '0 auto', position: 'relative' }}>

      {/* Back button */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: SEPARATOR }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_PRIMARY, padding: 4, display: 'flex', alignItems: 'center' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: TEXT_PRIMARY }}>{displayName}</p>
          <p style={{ margin: 0, fontSize: 13, color: TEXT_SECONDARY }}>{posts.length} posts</p>
        </div>
      </div>

      {/* Cover */}
      <div style={{
        height: 120,
        background: 'linear-gradient(135deg, #0f0f23, #1a1a3e)',
        position: 'relative',
      }} />

      {/* Avatar + actions */}
      <div style={{ padding: '0 16px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -40 }}>
          <div style={{
            border: '4px solid #000',
            borderRadius: '50%',
            lineHeight: 0,
          }}>
            <Avatar name={displayName} photoURL={profileUser?.photoURL} size={80} />
          </div>
          <div style={{ paddingBottom: 8 }}>
            {isMyProfile ? (
              <button
                onClick={() => setShowEditModal(true)}
                style={{
                  border: '1px solid #536471', borderRadius: 99, padding: '6px 16px',
                  background: 'transparent', color: TEXT_PRIMARY, cursor: 'pointer',
                  fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Edit3 size={14} />
                Modifier le profil
              </button>
            ) : (
              <button
                onClick={handleFollow}
                disabled={followLoading}
                style={{
                  border: isFollowing ? '1px solid #536471' : 'none',
                  borderRadius: 99, padding: '6px 16px',
                  background: isFollowing ? 'transparent' : ACCENT,
                  color: TEXT_PRIMARY, cursor: 'pointer',
                  fontWeight: 700, fontSize: 14,
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: followLoading ? 0.6 : 1,
                }}
              >
                {followLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : isFollowing ? <><UserCheck size={14} /> Abonné</> : <><UserPlus size={14} /> Suivre</>
                }
              </button>
            )}
          </div>
        </div>

        {/* Name & handle */}
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 20, color: TEXT_PRIMARY }}>{displayName}</p>
          <p style={{ margin: '2px 0 0', fontSize: 14, color: TEXT_SECONDARY }}>@{displayName.toLowerCase().replace(/\s/g, '_')}</p>
        </div>

        {/* Bio */}
        {profileUser?.bio && (
          <p style={{ margin: '10px 0 0', fontSize: 15, color: TEXT_PRIMARY, lineHeight: 1.5 }}>{profileUser.bio}</p>
        )}

        {/* Job + Passions */}
        {(profileUser?.job || (profileUser?.passions && profileUser.passions.length > 0)) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {profileUser?.job && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: TEXT_SECONDARY, fontSize: 14 }}>
                <Briefcase size={14} />
                <span>{profileUser.job}</span>
              </div>
            )}
            {profileUser?.passions?.map(p => (
              <span
                key={p}
                style={{
                  fontSize: 12, borderRadius: 99, padding: '2px 10px',
                  background: '#1a1a2e', color: ACCENT,
                  border: `1px solid ${ACCENT}33`,
                }}
              >
                {p}
              </span>
            ))}
          </div>
        )}

        {/* Socials */}
        {profileUser?.socials && (
          <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
            {profileUser.socials.twitter && (
              <a href={profileUser.socials.twitter} target="_blank" rel="noopener noreferrer" style={{ color: '#1DA1F2', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                <Twitter size={14} />
              </a>
            )}
            {profileUser.socials.instagram && (
              <a href={profileUser.socials.instagram} target="_blank" rel="noopener noreferrer" style={{ color: '#E1306C', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                <Instagram size={14} />
              </a>
            )}
            {profileUser.socials.website && (
              <a href={profileUser.socials.website} target="_blank" rel="noopener noreferrer" style={{ color: TEXT_SECONDARY, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                <Globe size={14} />
                <span>{profileUser.socials.website.replace(/^https?:\/\//, '').split('/')[0]}</span>
              </a>
            )}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingBottom: 14, borderBottom: SEPARATOR, flexWrap: 'wrap' }}>
          {[
            { label: 'Posts', value: posts.length },
            { label: 'Abonnés', value: followers.length },
            { label: 'Abonnements', value: following.length },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: TEXT_PRIMARY }}>{value}</span>
              <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>{label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Star size={14} color={GOLD} fill={GOLD} />
            <span style={{ fontWeight: 700, fontSize: 16, color: GOLD }}>{credibilityScore}</span>
            <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>Crédibilité</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: SEPARATOR, position: 'sticky', top: 53, zIndex: 9, background: BG }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, background: 'none', border: 'none', cursor: 'pointer',
              padding: '14px 0', fontSize: 14, fontWeight: activeTab === tab.key ? 700 : 400,
              color: activeTab === tab.key ? TEXT_PRIMARY : TEXT_SECONDARY,
              borderBottom: activeTab === tab.key ? `2px solid ${ACCENT}` : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >

          {/* Posts */}
          {activeTab === 'posts' && (
            <div>
              {loadingPosts ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <Loader2 size={28} color={ACCENT} className="animate-spin" />
                </div>
              ) : posts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: TEXT_SECONDARY }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Aucun post</p>
                  <p style={{ margin: '6px 0 0', fontSize: 14 }}>
                    {isMyProfile ? 'Publie ton premier contenu dans XPOSE.' : 'Cet utilisateur n\'a pas encore posté.'}
                  </p>
                </div>
              ) : (
                posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    userId={user.uid}
                    isOwner={isMyProfile}
                    onDelete={handleDeletePost}
                    onResonate={handleResonate}
                  />
                ))
              )}
            </div>
          )}

          {/* Médias */}
          {activeTab === 'medias' && (
            <div style={{ padding: 12 }}>
              {mediaUrls.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: TEXT_SECONDARY }}>
                  <Image size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Aucun média</p>
                  <p style={{ margin: '6px 0 0', fontSize: 14 }}>Les images partagées apparaîtront ici.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                  {mediaUrls.map((url, i) => (
                    <div key={i} style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: 4 }}>
                      <img
                        src={url}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Abonnés */}
          {activeTab === 'followers' && (
            <div>
              {followers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: TEXT_SECONDARY }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Aucun abonné</p>
                  <p style={{ margin: '6px 0 0', fontSize: 14 }}>Personne ne suit encore ce compte.</p>
                </div>
              ) : (
                followers.map(conn => (
                  <ConnectionRow
                    key={conn.id}
                    conn={conn}
                    myUserId={user.uid}
                    isMyProfile={isMyProfile}
                    mode="followers"
                    onViewProfile={onViewProfile}
                    onRemove={handleRemoveFollowing}
                    onFollow={handleFollowBack}
                  />
                ))
              )}
            </div>
          )}

          {/* Abonnements */}
          {activeTab === 'following' && (
            <div>
              {following.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: TEXT_SECONDARY }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Aucun abonnement</p>
                  <p style={{ margin: '6px 0 0', fontSize: 14 }}>Ce compte ne suit personne encore.</p>
                </div>
              ) : (
                following.map(conn => (
                  <ConnectionRow
                    key={conn.id}
                    conn={conn}
                    myUserId={user.uid}
                    isMyProfile={isMyProfile}
                    mode="following"
                    onViewProfile={onViewProfile}
                    onRemove={handleRemoveFollowing}
                    onFollow={handleFollowBack}
                  />
                ))
              )}
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* Edit Modal */}
      {showEditModal && profileUser && (
        <EditModal
          arenaUser={profileUser}
          userId={user.uid}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setProfileUser(updated);
            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
}
