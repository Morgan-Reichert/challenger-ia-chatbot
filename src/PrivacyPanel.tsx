/**
 * Panneau « Vos données » — exercice des droits RGPD depuis l'application.
 *
 * Couvre trois droits jusqu'ici non outillés :
 *   art. 15 et 20 — accès et portabilité, par export de l'ensemble des données
 *   art. 17       — effacement, par suppression du compte
 *   art. 17       — révocation des partages publics, jusqu'ici irrévocables
 */
import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2, Link2, ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import { apiFetch } from './apiClient';
import { mesureAutorisee, reinitialiserConsentement } from './consent';

type Partage = { shareId: string; title: string; sharedAt: string };

export default function PrivacyPanel({
  userId, shares, onRevokeShare, onRefreshShares, onDeleted,
}: {
  userId: string | null;
  shares: Partage[];
  onRevokeShare: (shareId: string) => Promise<boolean>;
  onRefreshShares: () => void;
  onDeleted: () => void;
}) {
  const [exportEnCours, setExportEnCours] = useState(false);
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [revoqueEnCours, setRevoqueEnCours] = useState<string | null>(null);

  useEffect(() => { if (userId) onRefreshShares(); }, [userId, onRefreshShares]);

  const exporter = useCallback(async () => {
    setExportEnCours(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/account', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Statut ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `challenger-ia-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'ok', texte: 'Archive téléchargée.' });
    } catch (e) {
      setMessage({ type: 'erreur', texte: `L'export a échoué : ${String(e)}` });
    } finally {
      setExportEnCours(false);
    }
  }, []);

  const supprimer = useCallback(async () => {
    setSuppressionEnCours(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/account', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Statut ${res.status}`);
      onDeleted();
    } catch (e) {
      setMessage({ type: 'erreur', texte: String(e) });
      setSuppressionEnCours(false);
    }
  }, [onDeleted]);

  if (!userId) return null;

  return (
    <div className="border-2 border-[#141414]/10">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
        <div className="w-8 h-8 flex items-center justify-center"
             style={{ background: '#10B98112', border: '1.5px solid #10B98130' }}>
          <ShieldCheck className="w-4 h-4 text-[#10B981]" />
        </div>
        <h2 className="text-[11px] font-black uppercase tracking-widest text-[#10B981]">Vos données</h2>
      </div>

      <div className="px-5 py-4 space-y-5">
        <p className="text-[10px] text-[#141414]/50 leading-relaxed">
          Vous disposez d'un droit d'accès, de portabilité et d'effacement sur vos données.
          Ces actions s'exercent directement ici, sans avoir à nous contacter.
        </p>

        {/* ── Partages publics ── */}
        <div>
          <p className="text-[11px] font-black text-[#141414] mb-1">Partages publics</p>
          <p className="text-[10px] text-[#141414]/50 mb-2 leading-relaxed">
            Les conversations partagées par lien sont lisibles par toute personne
            disposant de l'adresse. Révoquez-les pour les rendre inaccessibles.
          </p>
          {shares.length === 0 ? (
            <p className="text-[10px] text-[#141414]/35 italic">Aucun partage actif.</p>
          ) : (
            <div className="space-y-1.5">
              {shares.map((p) => (
                <div key={p.shareId}
                     className="flex items-center gap-2 px-3 py-2 border border-[#141414]/10 bg-[#141414]/[0.02]">
                  <Link2 className="w-3 h-3 text-[#141414]/30 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-[#141414] truncate">{p.title || 'Sans titre'}</p>
                    <p className="text-[9px] text-[#141414]/40">
                      Partagé le {new Date(p.sharedAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      setRevoqueEnCours(p.shareId);
                      await onRevokeShare(p.shareId);
                      setRevoqueEnCours(null);
                    }}
                    disabled={revoqueEnCours === p.shareId}
                    className="flex-shrink-0 text-[9px] font-black uppercase tracking-widest text-red-600 hover:text-red-700 disabled:opacity-40"
                  >
                    {revoqueEnCours === p.shareId ? '…' : 'Révoquer'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Export ── */}
        <div className="border-t border-[#141414]/10 pt-4">
          <p className="text-[11px] font-black text-[#141414] mb-1">Exporter mes données</p>
          <p className="text-[10px] text-[#141414]/50 mb-2 leading-relaxed">
            Archive complète au format JSON : conversations, projets, profil, profil
            cognitif, crédits, abonnement et consentements.
          </p>
          <button
            onClick={exporter}
            disabled={exportEnCours}
            className="flex items-center gap-2 px-4 py-2 border-2 border-[#5D7BFF]/40 text-[#5D7BFF] text-[10px] font-black uppercase tracking-widest hover:bg-[#5D7BFF]/10 transition-all disabled:opacity-40"
          >
            {exportEnCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Télécharger l'archive
          </button>
        </div>

        {/* ── Suppression ── */}
        <div className="border-t border-[#141414]/10 pt-4">
          <p className="text-[11px] font-black text-[#141414] mb-1">Supprimer mon compte</p>
          <p className="text-[10px] text-[#141414]/50 mb-2 leading-relaxed">
            Efface définitivement votre compte et l'ensemble de vos données :
            conversations, profil, profil cognitif, partages publics, crédits et
            abonnement. <strong>Cette action est irréversible.</strong> Pensez à
            exporter vos données au préalable.
          </p>

          {!suppressionOuverte ? (
            <button
              onClick={() => setSuppressionOuverte(true)}
              className="flex items-center gap-2 px-4 py-2 border-2 border-red-300 text-red-600 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer mon compte
            </button>
          ) : (
            <div className="border-2 border-red-300 bg-red-50/60 p-4">
              <div className="flex gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-[#141414]/70 leading-relaxed">
                  Pour confirmer, saisissez <strong>SUPPRIMER</strong> ci-dessous.
                  Vos données ne pourront pas être restaurées.
                </p>
              </div>
              <input
                type="text"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="SUPPRIMER"
                className="w-full px-3 py-2 text-[11px] border-2 border-red-200 bg-white focus:outline-none focus:border-red-400 mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={supprimer}
                  disabled={confirmation !== 'SUPPRIMER' || suppressionEnCours}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-30"
                >
                  {suppressionEnCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Confirmer la suppression
                </button>
                <button
                  onClick={() => { setSuppressionOuverte(false); setConfirmation(''); }}
                  disabled={suppressionEnCours}
                  className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#141414]/40 hover:text-[#141414]/70"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Consentement aux traceurs ── */}
        <div className="border-t border-[#141414]/10 pt-4">
          <p className="text-[11px] font-black text-[#141414] mb-1">Mesure d'audience</p>
          <p className="text-[10px] text-[#141414]/50 mb-2 leading-relaxed">
            État actuel :{' '}
            <strong>{mesureAutorisee() ? 'acceptée' : 'refusée'}</strong>.
            Le retrait de votre consentement doit être aussi simple que son
            recueil : ce bouton réaffiche le choix.
          </p>
          <button
            onClick={() => { reinitialiserConsentement(); setMessage({ type: 'ok', texte: 'Choix réinitialisé — la bannière va réapparaître.' }); }}
            className="px-4 py-2 border-2 border-[#141414]/20 text-[#141414]/70 text-[10px] font-black uppercase tracking-widest hover:bg-[#141414]/[0.04] transition-all"
          >
            Modifier mon choix
          </button>
        </div>

        {message && (
          <p className={`text-[10px] font-bold ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.texte}
          </p>
        )}
      </div>
    </div>
  );
}
