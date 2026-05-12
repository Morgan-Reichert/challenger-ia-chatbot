// Helpers et primitives partagés pour le style éditorial de l'Arène.
// Utilisés par ArenaPage, ArenaUserModal, ArenaProfilePage, ArenaProfileSettings.
import React from 'react';

export const SERIF = '"Cormorant Garamond", "Cormorant", Georgia, serif';
export const INK = 'var(--text-primary)';
export const ACCENT = '#5D7BFF';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// Format de date à la française, plein texte.
export function timeAgoLong(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return `il y a ${m} minute${m > 1 ? 's' : ''}`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    return `il y a ${h} heure${h > 1 ? 's' : ''}`;
  }
  if (s < 86400 * 7) {
    const j = Math.floor(s / 86400);
    return `il y a ${j} jour${j > 1 ? 's' : ''}`;
  }
  const d = new Date(iso);
  const months = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

// Avatar : monogramme en italique serif dans cercle hairline.
export function Av({ name, size = 36, prominent = false, photoURL }: {
  name: string;
  size?: number;
  prominent?: boolean;
  photoURL?: string | null;
}) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: `1px solid ${prominent ? INK : 'var(--border)'}`,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        border: `1px solid ${prominent ? INK : 'var(--border)'}`,
        color: INK,
        fontFamily: SERIF,
        fontSize: size * 0.42,
        fontWeight: 500,
        fontStyle: 'italic',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        letterSpacing: 0,
        background: 'transparent',
        opacity: prominent ? 1 : 0.85,
      }}
    >
      {initials(name)}
    </div>
  );
}

// Séparateur " · " typographique.
export function Dot() {
  return <span className="mx-2 text-[var(--text-primary)]/30 select-none">·</span>;
}

// Label small-caps tracé, pour les métadonnées.
export function MetaLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx('text-[10px] uppercase text-[var(--text-primary)]/45', className)}
      style={{ letterSpacing: '0.18em', fontVariantCaps: 'all-small-caps' }}
    >
      {children}
    </span>
  );
}

// Titre serif éditorial — 4 tailles.
export function SerifTitle({ children, className = '', size = 'lg' }: {
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizes = {
    sm: 'text-[20px] leading-[1.15]',
    md: 'text-[26px] leading-[1.12]',
    lg: 'text-[32px] leading-[1.1]',
    xl: 'text-[40px] leading-[1.05]',
  };
  return (
    <h2
      className={cx(sizes[size], 'text-[var(--text-primary)]', className)}
      style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.01em' }}
    >
      {children}
    </h2>
  );
}

// Bouton texte éditorial — sobre, optionnellement avec underline d'état.
export function TextButton({
  children, onClick, disabled, active, className = '', size = 'md',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const fontSize = size === 'sm' ? 'text-[11px]' : 'text-[12px]';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        fontSize,
        'uppercase transition-colors pb-1 border-b disabled:opacity-30',
        active
          ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
          : 'text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] border-transparent',
        className,
      )}
      style={{ letterSpacing: '0.22em' }}
    >
      {children}
    </button>
  );
}

// Lien italique discret.
export function ItalicLink({
  children, onClick, href, className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const cls = cx('italic text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] transition-colors', className);
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={{ fontFamily: SERIF }}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={cls} style={{ fontFamily: SERIF }}>
      {children}
    </button>
  );
}
