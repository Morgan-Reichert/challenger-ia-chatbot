import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, UserPlus, UserCheck, Users, Star, MessageSquare,
  Briefcase, Globe, Twitter, Instagram, ExternalLink,
  Loader2, UserMinus, Rss,
} from 'lucide-react';
import type { ArenaUser, ArenaConnection } from './arenaTypes';
import {
  getArenaUser, getConnectionStatus, sendConnection,
  acceptConnection, removeConnection,
} from './arenaFirestore';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  targetUserId: string;
  myUserId: string;
  myArenaUser: ArenaUser;
  onClose: () => void;
  onViewFullProfile: (userId: string) => void;
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const PALETTE = ['#5D7BFF', '#34D399', '#F87171', '#FBBF24', '#A78BFA', '#F97316', '#38BDF8', '#FB7185'];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

// ─── Connection/Follow state types ───────────────────────────────────────────

type ConnectState = 'none' | 'pending_sent' | 'pending_received' | 'accepted';
type FollowState = 'none' | 'following';

// ─── Component ────────────────────────────────────────────────────────────────

export default function ArenaUserModal({ targetUserId, myUserId, myArenaUser, onClose, onViewFullProfile }: Props) {
  const isSelf = targetUserId === myUserId;

  const [targetUser, setTargetUser] = useState<ArenaUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [connectState, setConnectState] = useState<ConnectState>('none');
  const [followState, setFollowState] = useState<FollowState>('none');
  const [actionBusy, setActionBusy] = useState<'connect' | 'follow' | null>(null);

  // Load profile + connection status on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [user, status] = await Promise.all([
        getArenaUser(targetUserId),
        isSelf ? Promise.resolve(null) : getConnectionStatus(myUserId, targetUserId),
      ]);
      if (cancelled) return;
      setTargetUser(user);

      if (status) {
        // Connection state
        if (status.connect === 'accepted') {
          setConnectState('accepted');
        } else if (status.connect === 'pending') {
          // We need to know if WE sent it or THEY sent it.
          // getConnectionStatus checks both directions; it returns the doc it finds.
          // We re-derive: if cSent exists → we sent it; else cReceived exists → they sent it.
          // Since getConnectionStatus already merges, we can't tell direction here.
          // We mark as pending_sent (safe fallback — UI shows "En attente").
          setConnectState('pending_sent');
        } else {
          setConnectState('none');
        }

        // Follow state
        if (status.iFollowThem) {
          setFollowState('following');
        } else {
          setFollowState('none');
        }
      }

      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [targetUserId, myUserId, isSelf]);

  // ── Connect action ──────────────────────────────────────────────────────────

  async function handleConnect() {
    if (!targetUser || actionBusy) return;
    setActionBusy('connect');
    try {
      if (connectState === 'none') {
        await sendConnection(
          myUserId, myArenaUser.arenaName, myArenaUser.photoURL,
          targetUserId, targetUser.arenaName, targetUser.photoURL,
          'connect',
        );
        setConnectState('pending_sent');
      } else if (connectState === 'pending_received') {
        await acceptConnection(targetUserId, myUserId);
        setConnectState('accepted');
      } else if (connectState === 'accepted') {
        // Disconnect — try both directions
        await removeConnection(myUserId, targetUserId, 'connect').catch(() =>
          removeConnection(targetUserId, myUserId, 'connect'),
        );
        setConnectState('none');
      }
    } finally {
      setActionBusy(null);
    }
  }

  // ── Follow action ───────────────────────────────────────────────────────────

  async function handleFollow() {
    if (!targetUser || actionBusy) return;
    setActionBusy('follow');
    try {
      if (followState === 'none') {
        await sendConnection(
          myUserId, myArenaUser.arenaName, myArenaUser.photoURL,
          targetUserId, targetUser.arenaName, targetUser.photoURL,
          'follow',
        );
        setFollowState('following');
      } else {
        await removeConnection(myUserId, targetUserId, 'follow');
        setFollowState('none');
      }
    } finally {
      setActionBusy(null);
    }
  }

  // ── View full profile ───────────────────────────────────────────────────────

  function handleViewFullProfile() {
    onViewFullProfile(targetUserId);
    onClose();
  }

  // ── Connect button label/style ──────────────────────────────────────────────

  function connectLabel() {
    if (actionBusy === 'connect') return <Loader2 size={14} className="animate-spin" />;
    if (connectState === 'accepted') return <><UserCheck size={14} />Connecté</>;
    if (connectState === 'pending_sent' || connectState === 'pending_received') return 'En attente';
    return <><UserPlus size={14} />Se connecter</>;
  }

  function connectStyle(): React.CSSProperties {
    const base: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 18px', borderRadius: 12, fontWeight: 700,
      fontSize: 13, cursor: actionBusy ? 'not-allowed' : 'pointer',
      border: 'none', transition: 'opacity 0.15s',
      opacity: actionBusy ? 0.6 : 1,
    };
    if (connectState === 'accepted') {
      return { ...base, background: 'rgba(52,211,153,0.15)', color: '#34D399', border: '1px solid rgba(52,211,153,0.3)' };
    }
    if (connectState === 'pending_sent' || connectState === 'pending_received') {
      return { ...base, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', cursor: 'default' };
    }
    return { ...base, background: 'linear-gradient(135deg, #5D7BFF, #A78BFA)', color: '#fff' };
  }

  // ── Follow button label/style ───────────────────────────────────────────────

  function followLabel() {
    if (actionBusy === 'follow') return <Loader2 size={14} className="animate-spin" />;
    if (followState === 'following') return <><Rss size={14} />Abonné ✓</>;
    return <><Rss size={14} />Suivre</>;
  }

  function followStyle(): React.CSSProperties {
    const base: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 18px', borderRadius: 12, fontWeight: 700,
      fontSize: 13, cursor: actionBusy ? 'not-allowed' : 'pointer',
      border: 'none', transition: 'opacity 0.15s',
      opacity: actionBusy ? 0.6 : 1,
    };
    if (followState === 'following') {
      return { ...base, background: 'rgba(93,123,255,0.15)', color: '#5D7BFF', border: '1px solid rgba(93,123,255,0.3)' };
    }
    return { ...base, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' };
  }

  // ── Avatar ──────────────────────────────────────────────────────────────────

  function Avatar({ user, size = 72 }: { user: ArenaUser; size?: number }) {
    const color = avatarColor(user.arenaName);
    if (user.photoURL) {
      return (
        <img
          src={user.photoURL}
          alt={user.arenaName}
          style={{
            width: size, height: size, borderRadius: '50%',
            objectFit: 'cover', border: `2.5px solid ${color}55`,
            flexShrink: 0,
          }}
        />
      );
    }
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: `${color}22`, border: `2.5px solid ${color}55`,
        color, fontSize: size * 0.3, fontWeight: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        letterSpacing: 1,
      }}>
        {initials(user.arenaName)}
      </div>
    );
  }

  // ── Stat pill ───────────────────────────────────────────────────────────────

  function StatPill({ icon, value, label }: { icon: React.ReactNode; value: number | undefined; label: string }) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '10px 12px', borderRadius: 14,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        flex: 1, minWidth: 0,
      }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}>{icon}</div>
        <span style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>{value ?? 0}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
      </div>
    );
  }

  // ── Social link ─────────────────────────────────────────────────────────────

  function SocialLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
      <a
        href={href.startsWith('http') ? href : `https://${href}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 10,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: 600,
          textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden',
          textOverflow: 'ellipsis', maxWidth: 140,
        }}
      >
        {icon}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
      </a>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
        }}
      />

      {/* Sheet / Modal */}
      <motion.div
        key="sheet"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        style={{
          position: 'fixed', zIndex: 61,
          bottom: 0, left: 0, right: 0,
          margin: '0 auto',
          maxWidth: 480,
          background: '#13161E',
          borderRadius: '28px 28px 0 0',
          border: '1px solid rgba(255,255,255,0.08)',
          borderBottom: 'none',
          overflow: 'hidden',
          // On desktop, float it centered as a modal
          ...(window.innerWidth >= 640 ? {
            bottom: 'auto',
            top: '50%',
            transform: 'translateY(-50%)',
            borderRadius: 28,
            border: '1px solid rgba(255,255,255,0.08)',
            maxHeight: '90vh',
            overflowY: 'auto',
          } : {}),
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.07)', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'rgba(255,255,255,0.5)',
            zIndex: 10,
          }}
        >
          <X size={16} />
        </button>

        {/* Loading state */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 24px' }}>
            <Loader2 size={28} color="#5D7BFF" className="animate-spin" />
          </div>
        )}

        {/* Error / not found */}
        {!loading && !targetUser && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            Profil introuvable.
          </div>
        )}

        {/* Content */}
        {!loading && targetUser && (
          <>
            {/* Header gradient band */}
            <div style={{
              background: `linear-gradient(135deg, ${avatarColor(targetUser.arenaName)}18, rgba(167,139,250,0.10))`,
              padding: '32px 24px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Avatar user={targetUser} size={72} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 900, fontSize: 17, color: '#fff', margin: 0, letterSpacing: 0.3 }}>
                    {targetUser.arenaName}
                  </p>
                  {targetUser.job && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      <Briefcase size={12} color="rgba(255,255,255,0.4)" />
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {targetUser.job}
                      </span>
                    </div>
                  )}
                  {/* Credibility badge */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    marginTop: 6, padding: '3px 8px', borderRadius: 8,
                    background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)',
                  }}>
                    <Star size={11} color="#FBBF24" fill="#FBBF24" />
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#FBBF24' }}>
                      {targetUser.credibilityScore} pts
                    </span>
                  </div>
                </div>
              </div>

              {/* Bio */}
              {targetUser.bio && (
                <p style={{
                  marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.6)',
                  lineHeight: 1.55, overflow: 'hidden',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {targetUser.bio}
                </p>
              )}
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 8, padding: '16px 20px 0' }}>
              <StatPill icon={<Users size={14} />} value={targetUser.connectionsCount} label="Connexions" />
              <StatPill icon={<Rss size={14} />} value={targetUser.followersCount} label="Abonnés" />
              <StatPill icon={<MessageSquare size={14} />} value={targetUser.totalComments} label="Posts" />
            </div>

            {/* Social links */}
            {targetUser.socials && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 20px 0' }}>
                {targetUser.socials.twitter && (
                  <SocialLink
                    href={`https://twitter.com/${targetUser.socials.twitter.replace('@', '')}`}
                    icon={<Twitter size={12} />}
                    label={targetUser.socials.twitter}
                  />
                )}
                {targetUser.socials.instagram && (
                  <SocialLink
                    href={`https://instagram.com/${targetUser.socials.instagram.replace('@', '')}`}
                    icon={<Instagram size={12} />}
                    label={targetUser.socials.instagram}
                  />
                )}
                {targetUser.socials.website && (
                  <SocialLink
                    href={targetUser.socials.website}
                    icon={<Globe size={12} />}
                    label={targetUser.socials.website.replace(/^https?:\/\//, '')}
                  />
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ padding: '16px 20px 24px' }}>
              {isSelf ? (
                /* Self — only show "Voir mon profil" */
                <button
                  onClick={handleViewFullProfile}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 16, border: 'none',
                    background: 'linear-gradient(135deg, #5D7BFF, #A78BFA)',
                    color: '#fff', fontWeight: 800, fontSize: 14,
                    cursor: 'pointer', letterSpacing: 0.3,
                  }}
                >
                  Voir mon profil
                </button>
              ) : (
                <>
                  {/* Connect + Follow row */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    <button onClick={handleConnect} style={connectStyle()} disabled={!!actionBusy || connectState === 'pending_sent'}>
                      {connectLabel()}
                    </button>
                    <button onClick={handleFollow} style={followStyle()} disabled={!!actionBusy}>
                      {followLabel()}
                    </button>
                  </div>

                  {/* Full profile CTA */}
                  <button
                    onClick={handleViewFullProfile}
                    style={{
                      width: '100%', padding: '14px', borderRadius: 16, border: 'none',
                      background: 'linear-gradient(135deg, #5D7BFF, #A78BFA)',
                      color: '#fff', fontWeight: 800, fontSize: 14,
                      cursor: 'pointer', letterSpacing: 0.3,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <ExternalLink size={15} />
                    Voir le profil complet
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
