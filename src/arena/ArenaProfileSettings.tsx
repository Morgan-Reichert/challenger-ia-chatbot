import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Loader2, Check, X } from 'lucide-react';
import type { ArenaUser, Visibility } from './arenaTypes';
import { updateArenaUserProfile } from './arenaFirestore';
import { uploadProfilePhoto } from './arenaStorage';
import { Av, SerifTitle, MetaLabel, SERIF, cx } from './_editorial';

interface Props {
  userId: string;
  arenaUser: ArenaUser;
  onBack: () => void;
  onSaved: (updated: ArenaUser) => void;
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string; desc: string }[] = [
  { value: 'public',  label: 'Public',     desc: 'Visible de tous.' },
  { value: 'friends', label: 'Connexions', desc: 'Vos connexions uniquement.' },
  { value: 'private', label: 'Privé',      desc: 'Vous seul·e.' },
];

// ─── Bloc Visibilité (onglets texte underline) ──────────────────────────────

function VisibilityTabs({
  value, onChange,
}: { value: Visibility; onChange: (v: Visibility) => void }) {
  const active = VISIBILITY_OPTIONS.find(o => o.value === value);
  return (
    <div>
      <div className="flex items-baseline gap-5 text-[11px] uppercase mb-2" style={{ letterSpacing: '0.22em' }}>
        {VISIBILITY_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cx(
              'transition-colors pb-1 border-b',
              value === opt.value
                ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 border-transparent',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {active && (
        <p
          className="text-[12px] text-[var(--text-primary)]/55 italic"
          style={{ fontFamily: SERIF }}
        >
          {active.desc}
        </p>
      )}
    </div>
  );
}

// ─── Champ texte éditorial ────────────────────────────────────────────────────

function EditorialField({
  label, value, onChange, placeholder, multiline, rows = 3, maxLength, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <MetaLabel>{label}</MetaLabel>
        {maxLength != null && (
          <span
            className={cx(
              'text-[11px] italic tabular-nums',
              value.length > maxLength * 0.95
                ? 'text-[var(--text-primary)]/80'
                : 'text-[var(--text-primary)]/40',
            )}
            style={{ fontFamily: SERIF }}
          >
            {value.length} / {maxLength}
          </span>
        )}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => {
            if (maxLength != null && e.target.value.length > maxLength) return;
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          rows={rows}
          className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[16px] py-2 outline-none resize-none transition-colors placeholder:text-[var(--text-primary)]/35 leading-[1.6]"
          style={{ fontFamily: SERIF, fontStyle: 'italic' }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[16px] py-2 outline-none transition-colors placeholder:text-[var(--text-primary)]/35"
          style={{ fontFamily: SERIF, fontStyle: 'italic' }}
        />
      )}
      {hint && (
        <p
          className="text-[11px] text-[var(--text-primary)]/45 italic mt-2"
          style={{ fontFamily: SERIF }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ArenaProfileSettings({ userId, arenaUser, onBack, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
    arenaUser.profileVisibility ?? 'public',
  );
  const [postDefaultVisibility, setPostDefaultVisibility] = useState<Visibility>(
    arenaUser.postDefaultVisibility ?? 'public',
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handlePassionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = passionInput.trim();
      if (tag && passions.length < 8 && !passions.includes(tag)) {
        setPassions((prev) => [...prev, tag]);
      }
      setPassionInput('');
    }
  };

  const removePassion = (tag: string) => {
    setPassions((prev) => prev.filter((p) => p !== tag));
  };

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

  const displayPhoto = photoPreview ?? arenaUser.photoURL ?? null;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-app)]">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-[var(--bg-chat)] border-b border-[var(--border)]">
        <div className="flex items-center gap-4 px-6 py-4 max-w-3xl mx-auto w-full">
          <button
            onClick={onBack}
            className="text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] transition-colors leading-none"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1">
            <h1
              className="text-[20px] text-[var(--text-primary)] leading-none"
              style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              Mon profil
            </h1>
            <p
              className="text-[11px] text-[var(--text-primary)]/45 italic mt-1"
              style={{ fontFamily: SERIF }}
            >
              Mise en forme de votre présence dans l'Arène
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 pt-12 pb-32 space-y-12">
          {/* ── Portrait ─────────────────────────────────────────────────── */}
          <section>
            <MetaLabel className="block mb-5">Portrait</MetaLabel>
            <div className="flex items-center gap-6">
              <div className="relative flex-shrink-0">
                <Av
                  name={arenaUser.arenaName}
                  size={80}
                  prominent
                  photoURL={displayPhoto}
                />
              </div>
              <div className="flex-1 min-w-0">
                <SerifTitle size="sm" className="leading-tight">
                  {arenaUser.arenaName}
                </SerifTitle>
                <p
                  className="text-[12px] text-[var(--text-primary)]/55 italic mt-1 mb-3"
                  style={{ fontFamily: SERIF }}
                >
                  {displayPhoto ? 'Vous avez une photo de profil.' : 'Pas de photo pour l\'instant.'}
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-[11px] uppercase text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] transition-colors pb-1 border-b border-[var(--text-primary)]/40 hover:border-[var(--text-primary)]"
                  style={{ letterSpacing: '0.22em' }}
                >
                  {uploadingPhoto ? 'Téléversement…' : (displayPhoto ? 'Changer la photo' : 'Téléverser une photo')}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
            </div>
            <AnimatePresence>
              {photoPreview && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-[12px] text-[var(--text-primary)]/65 italic mt-4"
                  style={{ fontFamily: SERIF }}
                >
                  Nouvelle photo prête — pensez à sauvegarder.
                </motion.p>
              )}
            </AnimatePresence>
          </section>

          {/* ── Nom de plume (read-only) ──────────────────────────────── */}
          <section>
            <MetaLabel className="block mb-3">Nom de plume</MetaLabel>
            <p
              className="text-[20px] text-[var(--text-primary)] italic"
              style={{ fontFamily: SERIF, fontWeight: 500 }}
            >
              {arenaUser.arenaName}
            </p>
            <p
              className="text-[11px] text-[var(--text-primary)]/45 italic mt-2"
              style={{ fontFamily: SERIF }}
            >
              Le nom sous lequel paraissent vos arguments. Il ne peut être modifié après création.
            </p>
          </section>

          {/* ── Bio ─────────────────────────────────────────────────────── */}
          <section>
            <EditorialField
              label="Bio"
              value={bio}
              onChange={setBio}
              placeholder="En quelques mots, qui êtes-vous ?"
              multiline
              rows={4}
              maxLength={280}
            />
          </section>

          {/* ── Profession ──────────────────────────────────────────────── */}
          <section>
            <EditorialField
              label="Profession"
              value={job}
              onChange={setJob}
              placeholder="Votre métier, votre secteur, votre profession…"
            />
          </section>

          {/* ── Centres d'intérêt ───────────────────────────────────────── */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <MetaLabel>Centres d'intérêt</MetaLabel>
              <span
                className="text-[11px] italic text-[var(--text-primary)]/45 tabular-nums"
                style={{ fontFamily: SERIF }}
              >
                {passions.length} / 8
              </span>
            </div>
            {passions.length > 0 && (
              <p
                className="text-[16px] text-[var(--text-primary)]/85 italic leading-[1.7] mb-3"
                style={{ fontFamily: SERIF }}
              >
                {passions.map((tag, i) => (
                  <span key={tag}>
                    <button
                      onClick={() => removePassion(tag)}
                      className="hover:text-[var(--text-primary)]/40 transition-colors"
                      title="Retirer"
                    >
                      {tag}
                    </button>
                    {i < passions.length - 1 && <span className="text-[var(--text-primary)]/30"> · </span>}
                  </span>
                ))}
              </p>
            )}
            {passions.length < 8 && (
              <input
                value={passionInput}
                onChange={(e) => setPassionInput(e.target.value)}
                onKeyDown={handlePassionKeyDown}
                placeholder="Ajoutez un centre d'intérêt et pressez Entrée…"
                className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[15px] py-2 outline-none transition-colors placeholder:text-[var(--text-primary)]/35"
                style={{ fontFamily: SERIF, fontStyle: 'italic' }}
              />
            )}
            <p
              className="text-[11px] text-[var(--text-primary)]/45 italic mt-2"
              style={{ fontFamily: SERIF }}
            >
              Cliquez sur un centre d'intérêt pour le retirer.
            </p>
          </section>

          {/* ── Présence ailleurs ───────────────────────────────────────── */}
          <section className="space-y-6">
            <MetaLabel className="block">Présence ailleurs</MetaLabel>

            <div>
              <p
                className="text-[11px] uppercase text-[var(--text-primary)]/45 mb-1"
                style={{ letterSpacing: '0.18em' }}
              >
                Twitter / X
              </p>
              <div className="flex items-baseline border-b border-[var(--border)] focus-within:border-[var(--text-primary)] transition-colors">
                <span className="text-[var(--text-primary)]/45 pr-1" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>@</span>
                <input
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value.replace(/^@/, ''))}
                  placeholder="votrehandle"
                  className="flex-1 bg-transparent border-0 text-[var(--text-primary)] text-[15px] py-2 outline-none placeholder:text-[var(--text-primary)]/35"
                  style={{ fontFamily: SERIF, fontStyle: 'italic' }}
                />
              </div>
            </div>

            <div>
              <p
                className="text-[11px] uppercase text-[var(--text-primary)]/45 mb-1"
                style={{ letterSpacing: '0.18em' }}
              >
                LinkedIn
              </p>
              <input
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="URL ou handle"
                className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[15px] py-2 outline-none transition-colors placeholder:text-[var(--text-primary)]/35"
                style={{ fontFamily: SERIF, fontStyle: 'italic' }}
              />
            </div>

            <div>
              <p
                className="text-[11px] uppercase text-[var(--text-primary)]/45 mb-1"
                style={{ letterSpacing: '0.18em' }}
              >
                Instagram
              </p>
              <div className="flex items-baseline border-b border-[var(--border)] focus-within:border-[var(--text-primary)] transition-colors">
                <span className="text-[var(--text-primary)]/45 pr-1" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>@</span>
                <input
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value.replace(/^@/, ''))}
                  placeholder="votrehandle"
                  className="flex-1 bg-transparent border-0 text-[var(--text-primary)] text-[15px] py-2 outline-none placeholder:text-[var(--text-primary)]/35"
                  style={{ fontFamily: SERIF, fontStyle: 'italic' }}
                />
              </div>
            </div>

            <div>
              <p
                className="text-[11px] uppercase text-[var(--text-primary)]/45 mb-1"
                style={{ letterSpacing: '0.18em' }}
              >
                TikTok
              </p>
              <div className="flex items-baseline border-b border-[var(--border)] focus-within:border-[var(--text-primary)] transition-colors">
                <span className="text-[var(--text-primary)]/45 pr-1" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>@</span>
                <input
                  value={tiktok}
                  onChange={(e) => setTiktok(e.target.value.replace(/^@/, ''))}
                  placeholder="votrehandle"
                  className="flex-1 bg-transparent border-0 text-[var(--text-primary)] text-[15px] py-2 outline-none placeholder:text-[var(--text-primary)]/35"
                  style={{ fontFamily: SERIF, fontStyle: 'italic' }}
                />
              </div>
            </div>

            <div>
              <p
                className="text-[11px] uppercase text-[var(--text-primary)]/45 mb-1"
                style={{ letterSpacing: '0.18em' }}
              >
                Site web
              </p>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://votre-site.com"
                className="w-full bg-transparent border-0 border-b border-[var(--border)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-[15px] py-2 outline-none transition-colors placeholder:text-[var(--text-primary)]/35"
                style={{ fontFamily: SERIF, fontStyle: 'italic' }}
              />
            </div>
          </section>

          {/* ── Visibilité du profil ────────────────────────────────────── */}
          <section>
            <MetaLabel className="block mb-3">Visibilité du profil</MetaLabel>
            <VisibilityTabs value={profileVisibility} onChange={setProfileVisibility} />
          </section>

          {/* ── Visibilité des posts ────────────────────────────────────── */}
          <section>
            <MetaLabel className="block mb-3">Visibilité par défaut de vos posts</MetaLabel>
            <VisibilityTabs value={postDefaultVisibility} onChange={setPostDefaultVisibility} />
          </section>

          {/* ── Erreur ──────────────────────────────────────────────────── */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-baseline gap-2 py-3 border-y border-[var(--text-primary)]/30"
              >
                <X size={13} className="text-[var(--text-primary)]/65 mt-0.5" />
                <p
                  className="text-[14px] text-[var(--text-primary)] italic"
                  style={{ fontFamily: SERIF }}
                >
                  {error}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Barre de sauvegarde collante ─────────────────────────────────── */}
      <div className="flex-shrink-0 bg-[var(--bg-chat)] border-t border-[var(--border)]">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full text-[12px] uppercase text-[var(--text-primary)] py-3 border-y border-[var(--border)] hover:bg-[var(--text-primary)]/[0.04] disabled:opacity-30 disabled:cursor-default transition-all flex items-center justify-center gap-3"
            style={{ letterSpacing: '0.24em' }}
          >
            {saving ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                {uploadingPhoto ? 'Téléversement de la photo…' : 'Enregistrement…'}
              </>
            ) : saved ? (
              <>
                <Check size={13} />
                Profil sauvegardé
              </>
            ) : (
              <>
                Sauvegarder
                <span className="text-[var(--text-primary)]/40">→</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
