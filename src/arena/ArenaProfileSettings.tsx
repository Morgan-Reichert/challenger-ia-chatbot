import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Camera, Check, Loader2, X,
  Globe, Linkedin, Twitter, Instagram, Eye, EyeOff,
  Briefcase, Heart, Link,
} from 'lucide-react';
import type { ArenaUser, Visibility } from './arenaTypes';
import { updateArenaUserProfile } from './arenaFirestore';
import { uploadProfilePhoto } from './arenaStorage';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  arenaUser: ArenaUser;
  onBack: () => void;
  onSaved: (updated: ArenaUser) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PALETTE = ['#5D7BFF','#34D399','#F87171','#FBBF24','#A78BFA','#F97316','#38BDF8','#FB7185'];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(name: string) { return name.slice(0, 2).toUpperCase(); }

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.4)',
  marginBottom: 8,
  display: 'block',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1.5px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  color: '#fff',
  fontSize: 14,
  padding: '13px 16px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const SECTION_STYLE: React.CSSProperties = {
  background: '#13161E',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 20,
  padding: '22px 20px',
  marginBottom: 16,
};

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: React.ReactNode }[] = [
  { value: 'public',  label: 'Public',          icon: <Eye    size={14} /> },
  { value: 'friends', label: 'Amis uniquement',  icon: <EyeOff size={14} /> },
  { value: 'private', label: 'Privé',            icon: <EyeOff size={14} /> },
];

// ─── Visibility Pills ─────────────────────────────────────────────────────────

function VisibilityPills({
  value,
  onChange,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {VISIBILITY_OPTIONS.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 30,
              border: active
                ? '1.5px solid #5D7BFF'
                : '1.5px solid rgba(255,255,255,0.1)',
              background: active
                ? 'rgba(93,123,255,0.18)'
                : 'rgba(255,255,255,0.04)',
              color: active ? '#7B9BFF' : 'rgba(255,255,255,0.5)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ArenaProfileSettings({ userId, arenaUser, onBack, onSaved }: Props) {
  // ── Photo ──────────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ── Fields ─────────────────────────────────────────────────────────────────
  const [bio, setBio] = useState(arenaUser.bio ?? '');
  const [job, setJob] = useState(arenaUser.job ?? '');
  const [passions, setPassions] = useState<string[]>(arenaUser.passions ?? []);
  const [passionInput, setPassionInput] = useState('');

  const [twitter, setTwitter]     = useState(arenaUser.socials?.twitter   ?? '');
  const [linkedin, setLinkedin]   = useState(arenaUser.socials?.linkedin  ?? '');
  const [instagram, setInstagram] = useState(arenaUser.socials?.instagram ?? '');
  const [tiktok, setTiktok]       = useState(arenaUser.socials?.tiktok    ?? '');
  const [website, setWebsite]     = useState(arenaUser.socials?.website   ?? '');

  const [profileVisibility, setProfileVisibility] = useState<Visibility>(
    arenaUser.profileVisibility ?? 'public'
  );
  const [postDefaultVisibility, setPostDefaultVisibility] = useState<Visibility>(
    arenaUser.postDefaultVisibility ?? 'public'
  );

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // ── Photo picker ───────────────────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  // ── Passions tag input ─────────────────────────────────────────────────────
  const handlePassionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = passionInput.trim();
      if (tag && passions.length < 8 && !passions.includes(tag)) {
        setPassions(prev => [...prev, tag]);
      }
      setPassionInput('');
    }
  };

  const removePassion = (tag: string) => {
    setPassions(prev => prev.filter(p => p !== tag));
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      let photoURL = arenaUser.photoURL;

      if (photoFile) {
        setUploadingPhoto(true);
        photoURL = await uploadProfilePhoto(userId, photoFile);
        setUploadingPhoto(false);
      }

      const data: Partial<ArenaUser> = {
        bio:                 bio.trim() || undefined,
        job:                 job.trim() || undefined,
        passions:            passions.length > 0 ? passions : undefined,
        socials: {
          twitter:   twitter.trim()   || undefined,
          linkedin:  linkedin.trim()  || undefined,
          instagram: instagram.trim() || undefined,
          tiktok:    tiktok.trim()    || undefined,
          website:   website.trim()   || undefined,
        },
        profileVisibility,
        postDefaultVisibility,
        ...(photoURL ? { photoURL } : {}),
      };

      await updateArenaUserProfile(userId, data);

      const updated: ArenaUser = { ...arenaUser, ...data, photoURL };
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved(updated);
    } catch (err) {
      console.error(err);
      setError('Une erreur est survenue. Réessayez.');
    } finally {
      setSaving(false);
      setUploadingPhoto(false);
    }
  };

  // ── Avatar display ─────────────────────────────────────────────────────────
  const displayPhoto = photoPreview ?? arenaUser.photoURL ?? null;
  const color = avatarColor(arenaUser.arenaName);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0C12',
      color: '#fff',
      fontFamily: 'inherit',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '18px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0A0C12',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            color: '#fff',
            width: 38,
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <p style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0.5 }}>Profil Arène</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Modifiez vos informations</p>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 120px' }}>

        {/* ── Photo de profil ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          style={SECTION_STYLE}
        >
          <span style={LABEL_STYLE}>Photo de profil</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {displayPhoto ? (
                <img
                  src={displayPhoto}
                  alt="avatar"
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `2px solid ${color}55`,
                  }}
                />
              ) : (
                <div style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: `${color}22`,
                  border: `2px solid ${color}55`,
                  color,
                  fontSize: 28,
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  letterSpacing: 1,
                }}>
                  {initials(arenaUser.arenaName)}
                </div>
              )}
              {/* Camera badge */}
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#5D7BFF,#7B9BFF)',
                  border: '2px solid #0A0C12',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Camera size={13} color="#fff" />
              </button>
            </div>

            <div>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {arenaUser.arenaName}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
                Cliquez sur l'icône pour changer la photo
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  background: 'rgba(93,123,255,0.15)',
                  border: '1px solid rgba(93,123,255,0.35)',
                  borderRadius: 10,
                  color: '#7B9BFF',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '7px 14px',
                  cursor: 'pointer',
                }}
              >
                {uploadingPhoto ? 'Téléversement…' : 'Choisir une photo'}
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
          </div>

          {/* Preview notice */}
          <AnimatePresence>
            {photoPreview && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ fontSize: 11, color: '#FBBF24', marginTop: 12 }}
              >
                Nouvelle photo sélectionnée — elle sera enregistrée lors de la sauvegarde.
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Pseudo (read-only) ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={SECTION_STYLE}
        >
          <span style={LABEL_STYLE}>Pseudo</span>
          <div style={{
            ...INPUT_STYLE,
            color: 'rgba(255,255,255,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>{arenaUser.arenaName}</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', letterSpacing: 1 }}>NON MODIFIABLE</span>
          </div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
            Le pseudo ne peut pas être changé après la création du compte.
          </p>
        </motion.div>

        {/* ── Bio ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={SECTION_STYLE}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ ...LABEL_STYLE, marginBottom: 0 }}>Bio</span>
            <span style={{ fontSize: 10, color: bio.length > 260 ? '#F87171' : 'rgba(255,255,255,0.25)' }}>
              {bio.length}/280
            </span>
          </div>
          <textarea
            value={bio}
            onChange={e => { if (e.target.value.length <= 280) setBio(e.target.value); }}
            placeholder="Décrivez-vous en quelques mots…"
            rows={4}
            style={{
              ...INPUT_STYLE,
              resize: 'vertical',
              minHeight: 90,
              lineHeight: 1.5,
            }}
          />
        </motion.div>

        {/* ── Emploi ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={SECTION_STYLE}
        >
          <span style={LABEL_STYLE}>Emploi</span>
          <div style={{ position: 'relative' }}>
            <Briefcase
              size={15}
              color="rgba(255,255,255,0.3)"
              style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
            <input
              value={job}
              onChange={e => setJob(e.target.value)}
              placeholder="Votre métier ou secteur…"
              style={{ ...INPUT_STYLE, paddingLeft: 40 }}
            />
          </div>
        </motion.div>

        {/* ── Passions ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          style={SECTION_STYLE}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ ...LABEL_STYLE, marginBottom: 0 }}>Passions</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{passions.length}/8</span>
          </div>

          {/* Tags */}
          {passions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {passions.map(tag => (
                <button
                  key={tag}
                  onClick={() => removePassion(tag)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    borderRadius: 30,
                    background: 'rgba(93,123,255,0.15)',
                    border: '1px solid rgba(93,123,255,0.3)',
                    color: '#7B9BFF',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Heart size={11} />
                  {tag}
                  <X size={11} style={{ opacity: 0.6 }} />
                </button>
              ))}
            </div>
          )}

          {passions.length < 8 && (
            <div style={{ position: 'relative' }}>
              <Heart
                size={15}
                color="rgba(255,255,255,0.3)"
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              />
              <input
                value={passionInput}
                onChange={e => setPassionInput(e.target.value)}
                onKeyDown={handlePassionKeyDown}
                placeholder="Tapez une passion et appuyez sur Entrée…"
                style={{ ...INPUT_STYLE, paddingLeft: 40 }}
              />
            </div>
          )}
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
            Cliquez sur un tag pour le supprimer.
          </p>
        </motion.div>

        {/* ── Réseaux sociaux ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={SECTION_STYLE}
        >
          <span style={LABEL_STYLE}>Réseaux sociaux</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Twitter */}
            <div>
              <span style={{ ...LABEL_STYLE, marginBottom: 6 }}>Twitter / X</span>
              <div style={{ position: 'relative' }}>
                <Twitter
                  size={15}
                  color="rgba(255,255,255,0.3)"
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                />
                <span style={{
                  position: 'absolute',
                  left: 36,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.25)',
                  fontSize: 14,
                  pointerEvents: 'none',
                }}>@</span>
                <input
                  value={twitter}
                  onChange={e => setTwitter(e.target.value.replace(/^@/, ''))}
                  placeholder="handle"
                  style={{ ...INPUT_STYLE, paddingLeft: 52 }}
                />
              </div>
            </div>

            {/* LinkedIn */}
            <div>
              <span style={{ ...LABEL_STYLE, marginBottom: 6 }}>LinkedIn</span>
              <div style={{ position: 'relative' }}>
                <Linkedin
                  size={15}
                  color="rgba(255,255,255,0.3)"
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                />
                <input
                  value={linkedin}
                  onChange={e => setLinkedin(e.target.value)}
                  placeholder="URL ou handle LinkedIn"
                  style={{ ...INPUT_STYLE, paddingLeft: 40 }}
                />
              </div>
            </div>

            {/* Instagram */}
            <div>
              <span style={{ ...LABEL_STYLE, marginBottom: 6 }}>Instagram</span>
              <div style={{ position: 'relative' }}>
                <Instagram
                  size={15}
                  color="rgba(255,255,255,0.3)"
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                />
                <span style={{
                  position: 'absolute',
                  left: 36,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.25)',
                  fontSize: 14,
                  pointerEvents: 'none',
                }}>@</span>
                <input
                  value={instagram}
                  onChange={e => setInstagram(e.target.value.replace(/^@/, ''))}
                  placeholder="handle"
                  style={{ ...INPUT_STYLE, paddingLeft: 52 }}
                />
              </div>
            </div>

            {/* TikTok */}
            <div>
              <span style={{ ...LABEL_STYLE, marginBottom: 6 }}>TikTok</span>
              <div style={{ position: 'relative' }}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="rgba(255,255,255,0.3)"
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                >
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.94a8.16 8.16 0 0 0 4.77 1.52V7.01a4.85 4.85 0 0 1-1-.32z" />
                </svg>
                <span style={{
                  position: 'absolute',
                  left: 36,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.25)',
                  fontSize: 14,
                  pointerEvents: 'none',
                }}>@</span>
                <input
                  value={tiktok}
                  onChange={e => setTiktok(e.target.value.replace(/^@/, ''))}
                  placeholder="handle"
                  style={{ ...INPUT_STYLE, paddingLeft: 52 }}
                />
              </div>
            </div>

            {/* Website */}
            <div>
              <span style={{ ...LABEL_STYLE, marginBottom: 6 }}>Site web</span>
              <div style={{ position: 'relative' }}>
                <Globe
                  size={15}
                  color="rgba(255,255,255,0.3)"
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                />
                <input
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="https://votre-site.com"
                  style={{ ...INPUT_STYLE, paddingLeft: 40 }}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Visibilité du profil ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          style={SECTION_STYLE}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Eye size={15} color="rgba(255,255,255,0.4)" />
            <span style={{ ...LABEL_STYLE, marginBottom: 0 }}>Visibilité du profil</span>
          </div>
          <VisibilityPills value={profileVisibility} onChange={setProfileVisibility} />
        </motion.div>

        {/* ── Visibilité des posts par défaut ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          style={SECTION_STYLE}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Link size={15} color="rgba(255,255,255,0.4)" />
            <span style={{ ...LABEL_STYLE, marginBottom: 0 }}>Visibilité des posts par défaut</span>
          </div>
          <VisibilityPills value={postDefaultVisibility} onChange={setPostDefaultVisibility} />
        </motion.div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              style={{
                background: 'rgba(248,113,113,0.12)',
                border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 14,
                padding: '12px 16px',
                color: '#F87171',
                fontSize: 13,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <X size={15} />
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Sticky save bar ── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '14px 16px',
        background: 'linear-gradient(to top, #0A0C12 70%, transparent)',
        zIndex: 20,
      }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 16,
            border: 'none',
            background: saved
              ? 'linear-gradient(135deg, #34D399, #10B981)'
              : 'linear-gradient(135deg, #5D7BFF, #7B9BFF)',
            color: '#fff',
            fontWeight: 900,
            fontSize: 14,
            letterSpacing: 1,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'background 0.4s',
            boxShadow: '0 4px 24px rgba(93,123,255,0.3)',
          }}
        >
          {saving ? (
            <>
              <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
              {uploadingPhoto ? 'Téléversement de la photo…' : 'Enregistrement…'}
            </>
          ) : saved ? (
            <>
              <Check size={18} />
              Profil sauvegardé !
            </>
          ) : (
            'Sauvegarder le profil'
          )}
        </button>
      </div>

      {/* Spinner keyframe (inline fallback) */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
