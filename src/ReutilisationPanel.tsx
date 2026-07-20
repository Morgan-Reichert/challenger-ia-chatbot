/**
 * Réutilisation des conversations à des fins d'amélioration.
 *
 * Le réglage est à REFUS par défaut, et la formulation est affirmative
 * (« autoriser ») plutôt que négative (« refuser ») : un interrupteur qu'il
 * faut désactiver pour se protéger obtient un consentement par inertie, ce qui
 * n'est pas un consentement libre au sens de l'article 4.11 du RGPD.
 */
import { useCallback, useEffect, useState } from 'react';
import { BookLock, Loader2 } from 'lucide-react';
import { chargerPreferences, enregistrerPreferences } from './preferencesCompte';

export default function ReutilisationPanel({ userId }: { userId: string | null }) {
  const [autorise, setAutorise] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    let vivant = true;
    if (!userId) { setChargement(false); return; }
    void chargerPreferences().then((p) => {
      if (vivant) { setAutorise(p.reutilisation_conversations); setChargement(false); }
    });
    return () => { vivant = false; };
  }, [userId]);

  const basculer = useCallback(async () => {
    const suivant = !autorise;
    setAutorise(suivant);
    setEnregistrement(true);
    const ok = await enregistrerPreferences({ reutilisation_conversations: suivant });
    setEnregistrement(false);
    // En cas d'échec, on revient à l'état précédent : laisser l'interrupteur
    // afficher un accord qui n'a pas été enregistré serait un mensonge.
    if (!ok) setAutorise(!suivant);
  }, [autorise]);

  if (!userId) return null;

  return (
    <div className="border-2 border-[#141414]/10 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
        <div className="w-8 h-8 flex items-center justify-center"
             style={{ background: '#0EA5E912', border: '1.5px solid #0EA5E930' }}>
          <BookLock className="w-4 h-4 text-[#0EA5E9]" />
        </div>
        <h2 className="text-[11px] font-black uppercase tracking-widest text-[#0EA5E9]">
          Réutilisation de vos conversations
        </h2>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-[11px] font-black text-[#141414]">
              Autoriser l&apos;analyse de mes conversations pour améliorer le produit
            </p>
            <p className="text-[10px] text-[#141414]/45 mt-1.5 leading-relaxed">
              Par défaut, <strong>vos conversations ne sont ni lues ni analysées</strong> à
              d&apos;autres fins que vous répondre. Si vous l&apos;autorisez, des extraits
              anonymisés pourront servir à repérer les défauts de raisonnement de l&apos;IA.
              Ils ne sont jamais revendus, ni utilisés pour entraîner un modèle tiers.
              Vous pouvez revenir sur ce choix à tout moment, sans conséquence.
            </p>
          </div>
          <button
            onClick={() => void basculer()}
            role="switch"
            aria-checked={autorise}
            aria-label="Autoriser la réutilisation des conversations"
            disabled={chargement || enregistrement}
            className="flex-shrink-0 mt-0.5 relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50"
            style={{ backgroundColor: autorise ? '#0EA5E9' : '#D1D5DB' }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
              style={{ transform: autorise ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </button>
        </div>

        {(chargement || enregistrement) && (
          <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[#141414]/30 mt-2.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            {chargement ? 'Chargement' : 'Enregistrement'}
          </p>
        )}
      </div>
    </div>
  );
}
