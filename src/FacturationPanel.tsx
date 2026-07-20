/**
 * Facturation — factures, moyen de paiement et résiliation.
 *
 * Tout passe par le portail client de notre prestataire de paiement plutôt
 * que par une interface maison : les factures sont des pièces comptables, et
 * les régénérer nous-mêmes ferait courir un risque d'écart avec les documents
 * réellement émis.
 *
 * L'article L215-1-1 du code de la consommation impose depuis le 1er juin 2023
 * que la résiliation d'un contrat souscrit en ligne soit possible en ligne,
 * par un moyen aussi simple que la souscription — d'où un accès direct ici, et
 * non un formulaire de contact.
 */
import { useState } from 'react';
import { CreditCard, ExternalLink, Loader2, FileText, XCircle } from 'lucide-react';
import { apiFetch } from './apiClient';

export default function FacturationPanel({
  userId, subscription,
}: {
  userId: string | null;
  subscription: 'free' | 'pro';
}) {
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  const ouvrirPortail = async () => {
    setChargement(true);
    setErreur('');
    try {
      const res = await apiFetch('/api/account?resource=billing', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) {
        setErreur(d?.message ?? "Le portail n'a pas pu être ouvert.");
      } else {
        window.location.href = d.url;
        return; // pas de setChargement(false) : on quitte la page
      }
    } catch {
      setErreur('Connexion impossible. Réessayez.');
    }
    setChargement(false);
  };

  if (!userId) return null;

  return (
    <div className="border-2 border-[#141414]/10 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
        <div className="w-8 h-8 flex items-center justify-center"
             style={{ background: '#F59E0B12', border: '1.5px solid #F59E0B30' }}>
          <CreditCard className="w-4 h-4 text-[#F59E0B]" />
        </div>
        <h2 className="text-[11px] font-black uppercase tracking-widest text-[#F59E0B]">Facturation</h2>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="space-y-2">
          {[
            { icone: FileText,   texte: 'Télécharger vos factures' },
            { icone: CreditCard, texte: 'Modifier votre moyen de paiement' },
            { icone: XCircle,    texte: 'Résilier votre abonnement, sans démarche ni délai' },
          ].map(({ icone: Icone, texte }) => (
            <div key={texte} className="flex items-center gap-2.5">
              <Icone className="w-3.5 h-3.5 flex-shrink-0 text-[#141414]/30" />
              <p className="text-[10px] text-[#141414]/55">{texte}</p>
            </div>
          ))}
        </div>

        <button
          onClick={() => void ouvrirPortail()}
          disabled={chargement}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F59E0B] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#d98a08] transition-colors disabled:opacity-40"
        >
          {chargement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          Ouvrir mon espace de facturation
        </button>

        {erreur && <p className="text-[10px] font-bold text-red-600 leading-relaxed">{erreur}</p>}

        {subscription !== 'pro' && (
          <p className="text-[10px] text-[#141414]/40 leading-relaxed border-t border-[#141414]/8 pt-3">
            Votre espace de facturation n&apos;est disponible qu&apos;après un premier
            paiement. Les achats de crédits y figurent également.
          </p>
        )}
      </div>
    </div>
  );
}
