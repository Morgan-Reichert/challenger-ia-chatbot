/**
 * Bannière de consentement aux traceurs non essentiels.
 *
 * Deux exigences de la CNIL sont respectées ici :
 *  - refuser doit être aussi simple qu'accepter : les deux boutons ont le même
 *    poids visuel et demandent un seul clic ;
 *  - le refus ne doit pas être pénalisé : la bannière disparaît dans les deux
 *    cas et l'application reste pleinement fonctionnelle.
 */
import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { decisionAttendue, enregistrerConsentement, surChangementConsentement } from './consent';

export default function ConsentBanner() {
  const [visible, setVisible] = useState(decisionAttendue());

  useEffect(() => surChangementConsentement(() => setVisible(decisionAttendue())), []);

  if (!visible) return null;

  const repondre = (accepte: boolean) => {
    enregistrerConsentement(accepte);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Consentement aux traceurs"
      className="fixed inset-x-0 bottom-0 z-[90] p-3 md:p-4"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-chat)] p-4 shadow-lg"
           style={{ boxShadow: '0 8px 30px rgba(20,20,20,0.14)' }}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#5D7BFF]/10 flex items-center justify-center flex-shrink-0">
            <Cookie className="w-4 h-4 text-[#5D7BFF]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Mesure d'audience
            </p>
            <p className="text-xs text-[var(--text-primary)]/60 leading-relaxed mt-1">
              Nous souhaitons mesurer la fréquentation du site et recevoir les erreurs
              techniques, afin de corriger ce qui ne fonctionne pas. Ces outils ne sont
              pas nécessaires au service : vous pouvez refuser sans aucune conséquence.
              Votre choix est modifiable à tout moment depuis les réglages.
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => repondre(false)}
            className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]/70 hover:bg-[var(--text-primary)]/[0.04] transition-colors"
          >
            Refuser
          </button>
          <button
            onClick={() => repondre(true)}
            className="flex-1 rounded-xl bg-[#5D7BFF] px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white hover:bg-[#4a68e8] transition-colors"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
