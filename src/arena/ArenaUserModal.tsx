import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Globe, Twitter, Instagram, ExternalLink, Loader2,
} from 'lucide-react';
import type { ArenaUser } from './arenaTypes';
import {
  getArenaUser, getConnectionStatus, sendConnection,
  acceptConnection, removeConnection,
} from './arenaFirestore';
import { Av, SerifTitle, MetaLabel, Dot, SERIF, cx } from './_editorial';

interface Props {
  targetUserId: string;
  myUserId: string;
  myArenaUser: ArenaUser;
  onClose: () => void;
  onViewFullProfile: (userId: string) => void;
}

type ConnectState = 'none' | 'pending_sent' | 'pending_received' | 'accepted';
type FollowState = 'none' | 'following';

export default function ArenaUserModal({ targetUserId, myUserId, myArenaUser, onClose, onViewFullProfile }: Props) {
  const isSelf = targetUserId === myUserId;

  const [targetUser, setTargetUser] = useState<ArenaUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [connectState, setConnectState] = useState<ConnectState>('none');
  const [followState, setFollowState] = useState<FollowState>('none');
  const [actionBusy, setActionBusy] = useState<'connect' | 'follow' | null>(null);

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
        if (status.connect === 'accepted') setConnectState('accepted');
        else if (status.connect === 'pending') setConnectState('pending_sent');
        else setConnectState('none');
        setFollowState(status.iFollowThem ? 'following' : 'none');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [targetUserId, myUserId, isSelf]);

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
        await removeConnection(myUserId, targetUserId, 'connect').catch(() =>
          removeConnection(targetUserId, myUserId, 'connect'),
        );
        setConnectState('none');
      }
    } finally {
      setActionBusy(null);
    }
  }

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

  function handleViewFullProfile() {
    onViewFullProfile(targetUserId);
    onClose();
  }

  function connectVerb(): string {
    if (connectState === 'accepted') return 'Vous êtes connectés';
    if (connectState === 'pending_sent' || connectState === 'pending_received') return 'Demande en attente';
    return 'Se connecter';
  }

  function followVerb(): string {
    return followState === 'following' ? 'Vous suivez' : 'Suivre';
  }

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-[var(--bg-app)]/85 backdrop-blur-md"
      />

      <motion.div
        key="sheet"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        className="fixed z-[61] inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 max-w-md w-full mx-auto bg-[var(--bg-chat)] border border-[var(--border)] overflow-y-auto max-h-[90vh]"
      >
        {/* Bouton fermer — discret, en haut à droite */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] transition-colors leading-none z-10"
        >
          <X size={16} />
        </button>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={20} className="animate-spin text-[var(--text-primary)]/40" />
          </div>
        )}

        {!loading && !targetUser && (
          <div className="px-8 py-16 text-center">
            <p
              className="text-[15px] text-[var(--text-primary)]/55 italic"
              style={{ fontFamily: SERIF }}
            >
              Profil introuvable.
            </p>
          </div>
        )}

        {!loading && targetUser && (
          <>
            {/* En-tête éditorial : monogramme + nom serif + métier en italique */}
            <div className="px-8 pt-12 pb-6 border-b border-[var(--border)]">
              <div className="flex items-start gap-5">
                <Av name={targetUser.arenaName} size={64} prominent photoURL={targetUser.photoURL} />
                <div className="flex-1 min-w-0 pt-1">
                  <SerifTitle size="md" className="mb-1">
                    {targetUser.arenaName}
                  </SerifTitle>
                  {targetUser.job && (
                    <p
                      className="text-[14px] text-[var(--text-primary)]/65 italic"
                      style={{ fontFamily: SERIF }}
                    >
                      {targetUser.job}
                    </p>
                  )}
                  <p
                    className="text-[12px] text-[var(--text-primary)]/55 italic mt-1"
                    style={{ fontFamily: SERIF }}
                  >
                    <span className="tabular-nums">{targetUser.credibilityScore}</span> points de crédibilité
                  </p>
                </div>
              </div>

              {/* Bio en italique, deux lignes max */}
              {targetUser.bio && (
                <p
                  className="text-[15px] text-[var(--text-primary)]/75 italic leading-[1.6] mt-5 overflow-hidden"
                  style={{
                    fontFamily: SERIF,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  « {targetUser.bio} »
                </p>
              )}
            </div>

            {/* Statistiques en ligne — typo */}
            <div className="px-8 py-5 border-b border-[var(--border)]">
              <div className="flex items-baseline justify-between gap-6">
                {[
                  { value: targetUser.connectionsCount ?? 0, label: 'Connexions' },
                  { value: targetUser.followersCount ?? 0, label: 'Abonnés' },
                  { value: targetUser.totalComments ?? 0, label: 'Contributions' },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col items-baseline gap-1">
                    <span
                      className="text-[24px] text-[var(--text-primary)] tabular-nums leading-none"
                      style={{ fontFamily: SERIF, fontWeight: 600 }}
                    >
                      {stat.value}
                    </span>
                    <MetaLabel>{stat.label}</MetaLabel>
                  </div>
                ))}
              </div>
            </div>

            {/* Réseaux sociaux — liens texte */}
            {targetUser.socials && (targetUser.socials.twitter || targetUser.socials.instagram || targetUser.socials.website) && (
              <div className="px-8 py-4 border-b border-[var(--border)]">
                <MetaLabel className="block mb-3">Le retrouver ailleurs</MetaLabel>
                <div className="flex flex-col gap-2">
                  {targetUser.socials.twitter && (
                    <a
                      href={`https://twitter.com/${targetUser.socials.twitter.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-[14px] text-[var(--text-primary)]/75 hover:text-[var(--text-primary)] italic transition-colors"
                      style={{ fontFamily: SERIF }}
                    >
                      <Twitter size={13} className="text-[var(--text-primary)]/55" />
                      {targetUser.socials.twitter}
                      <ExternalLink size={10} className="text-[var(--text-primary)]/40" />
                    </a>
                  )}
                  {targetUser.socials.instagram && (
                    <a
                      href={`https://instagram.com/${targetUser.socials.instagram.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-[14px] text-[var(--text-primary)]/75 hover:text-[var(--text-primary)] italic transition-colors"
                      style={{ fontFamily: SERIF }}
                    >
                      <Instagram size={13} className="text-[var(--text-primary)]/55" />
                      {targetUser.socials.instagram}
                      <ExternalLink size={10} className="text-[var(--text-primary)]/40" />
                    </a>
                  )}
                  {targetUser.socials.website && (
                    <a
                      href={targetUser.socials.website.startsWith('http') ? targetUser.socials.website : `https://${targetUser.socials.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-[14px] text-[var(--text-primary)]/75 hover:text-[var(--text-primary)] italic transition-colors"
                      style={{ fontFamily: SERIF }}
                    >
                      <Globe size={13} className="text-[var(--text-primary)]/55" />
                      {targetUser.socials.website.replace(/^https?:\/\//, '')}
                      <ExternalLink size={10} className="text-[var(--text-primary)]/40" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="px-8 py-6">
              {isSelf ? (
                <button
                  onClick={handleViewFullProfile}
                  className="w-full text-[12px] uppercase text-[var(--text-primary)] py-3 border-y border-[var(--border)] hover:bg-[var(--text-primary)]/[0.04] transition-colors flex items-center justify-center gap-3"
                  style={{ letterSpacing: '0.24em' }}
                >
                  Voir mon profil
                  <span className="text-[var(--text-primary)]/40">→</span>
                </button>
              ) : (
                <>
                  {/* Connect + Follow — texte underline */}
                  <div className="flex items-baseline gap-5 mb-5 flex-wrap text-[12px]" style={{ letterSpacing: '0.22em' }}>
                    <button
                      onClick={handleConnect}
                      disabled={!!actionBusy || connectState === 'pending_sent'}
                      className={cx(
                        'uppercase transition-colors pb-1 border-b disabled:cursor-default',
                        connectState === 'accepted'
                          ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                          : 'text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] border-transparent',
                        actionBusy === 'connect' && 'opacity-50',
                      )}
                    >
                      {actionBusy === 'connect' ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 size={11} className="animate-spin" />
                          {connectVerb()}
                        </span>
                      ) : connectVerb()}
                    </button>
                    <Dot />
                    <button
                      onClick={handleFollow}
                      disabled={!!actionBusy}
                      className={cx(
                        'uppercase transition-colors pb-1 border-b',
                        followState === 'following'
                          ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                          : 'text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] border-transparent',
                        actionBusy === 'follow' && 'opacity-50',
                      )}
                    >
                      {actionBusy === 'follow' ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 size={11} className="animate-spin" />
                          {followVerb()}
                        </span>
                      ) : followVerb()}
                    </button>
                  </div>

                  <button
                    onClick={handleViewFullProfile}
                    className="w-full text-[12px] uppercase text-[var(--text-primary)] py-3 border-t border-[var(--border)] hover:bg-[var(--text-primary)]/[0.04] transition-colors flex items-center justify-center gap-3"
                    style={{ letterSpacing: '0.24em' }}
                  >
                    Lire le profil complet
                    <span className="text-[var(--text-primary)]/40">→</span>
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
