/**
 * Challenger Reporter — ARDOISE VIERGE.
 *
 * L'ancienne implémentation de la spécialisation « Reporter » a été retirée
 * volontairement : elle sera reconstruite de zéro. Ce fichier ne garde qu'un
 * écran d'attente, pour que la card de la bibliothèque continue d'ouvrir un
 * écran propre sans rien casser. Tout le nouveau Reporter se construira ici.
 */
import { ArrowLeft, Hammer } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';

type Props = {
  onBack: () => void;
  user?: FirebaseUser | null;
  paywallActive?: boolean;
  outil?: {
    name: string; accentColor: string; logoSrc: string;
    price: string; tagline: string; features: string[];
  } | null;
};

export default function JournalismeApp({ onBack, outil }: Props) {
  const accent = outil?.accentColor ?? '#E85D04';
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#14161f] px-6 text-center">
      <button
        onClick={onBack}
        className="absolute top-5 left-5 flex items-center gap-1.5 text-white/50 hover:text-white text-[11px] font-black uppercase tracking-widest transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Bibliothèque
      </button>

      {outil?.logoSrc ? (
        <img src={outil.logoSrc} alt="" className="w-16 h-16 object-contain mb-6 opacity-90" />
      ) : (
        <div className="w-16 h-16 rounded-2xl mb-6 flex items-center justify-center" style={{ background: `${accent}22` }}>
          <Hammer className="w-7 h-7" style={{ color: accent }} />
        </div>
      )}

      <h1 className="text-2xl font-black text-white mb-2">{outil?.name ?? 'Reporter'}</h1>
      <p className="text-sm text-white/50 max-w-sm leading-relaxed">
        Cette spécialisation est en cours de reconstruction. Bientôt de retour.
      </p>
    </div>
  );
}
