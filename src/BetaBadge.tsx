/**
 * Badge « beta » discret : signale à l'utilisateur qu'il est sur une version
 * d'essai, avec sa version et son identifiant technique.
 *
 * Discret par conception — il doit informer sans jamais gêner la lecture :
 * petit, monochrome, semi-transparent, et il s'efface au survol.
 * N'affiche rien si l'utilisateur n'est inscrit à aucune beta.
 */
import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useBeta } from './beta';

export default function BetaBadge({ enabled = true }: { enabled?: boolean }) {
  const beta = useBeta(enabled);
  const [open, setOpen] = useState(false);

  if (!beta?.enrolled || !beta.version) return null;
  const { id, version, label } = beta.version;

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      title={`Version beta ${version}${label ? ` — ${label}` : ''}\nID : ${id}`}
      aria-label={`Version beta ${version}`}
      // Mobile : en haut à droite — le bas de l'écran est déjà pris par le
      // composer ET la barre de navigation, que le badge masquerait.
      // Desktop : coin bas droit, où rien n'est cliquable.
      className="fixed right-2 z-40 flex items-center gap-1.5 rounded-full
                 top-[calc(3.5rem+env(safe-area-inset-top))]
                 md:top-auto md:bottom-[calc(0.5rem+env(safe-area-inset-bottom))]
                 border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.04]
                 px-2 py-1 backdrop-blur-sm transition-opacity
                 opacity-40 hover:opacity-100 focus:opacity-100"
    >
      <FlaskConical className="w-3 h-3 text-[var(--text-primary)]/60" />
      <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-primary)]/60">
        Beta {version}
      </span>
      {open && (
        <span className="text-[9px] font-mono text-[var(--text-primary)]/40 border-l border-[var(--text-primary)]/10 pl-1.5">
          {id}
        </span>
      )}
    </button>
  );
}
