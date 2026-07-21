/**
 * Dossier de travail — panneau de gestion.
 *
 * Permet à l'utilisateur de désigner un dossier local où l'application
 * enregistre les PDF, d'y voir les fichiers et de les supprimer. La création
 * de PDF se fait ailleurs (à la génération) ; ce panneau couvre le choix du
 * dossier, la consultation et la suppression.
 *
 * L'accès en écriture à un dossier local n'existe que sur les navigateurs
 * Chromium de bureau. Le panneau le DIT clairement plutôt que d'afficher un
 * bouton qui échouerait ailleurs, et rappelle que les suppressions sont
 * définitives et déclenchées par l'utilisateur seul.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  FolderOpen, FolderPlus, RefreshCw, Trash2, FileText, AlertTriangle, Loader2, Check,
} from 'lucide-react';
import {
  capacite, choisirDossier, dossierActuel, dossierMemorise, reactiverDossier, oublierDossier,
  listerFichiers, supprimerFichier, type InfoFichier,
} from './dossierTravail';

function tailleLisible(o: number): string {
  if (o < 1024) return `${o} o`;
  if (o < 1024 * 1024) return `${Math.round(o / 1024)} Ko`;
  return `${(o / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function DossierTravailPanel() {
  const supporte = capacite();
  const [dossier, setDossier] = useState<string | null>(null);
  const [permissionPerdue, setPermissionPerdue] = useState(false);
  const [fichiers, setFichiers] = useState<InfoFichier[]>([]);
  const [chargement, setChargement] = useState(true);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const rafraichir = useCallback(async () => {
    const nom = await dossierActuel();
    setDossier(nom);
    if (nom) {
      setPermissionPerdue(false);
      setFichiers(await listerFichiers());
    } else {
      // Distinguer « aucun dossier choisi » de « dossier choisi mais permission
      // à réaccorder » : le second seul justifie un bouton « Réautoriser ».
      setPermissionPerdue(await dossierMemorise());
      setFichiers([]);
    }
    setChargement(false);
  }, []);

  useEffect(() => { if (supporte) void rafraichir(); else setChargement(false); }, [supporte, rafraichir]);

  if (!supporte) {
    return (
      <div className="border-2 border-[#141414]/10 bg-white">
        <En_tete />
        <div className="px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#F59E0B]" />
            <p className="text-[11px] text-[#141414]/55 leading-relaxed">
              L&apos;enregistrement dans un dossier de votre ordinateur n&apos;est possible
              que sur <strong>Chrome, Edge ou Opera, en version ordinateur</strong>. Sur ce
              navigateur, les PDF sont téléchargés dans le dossier de téléchargements
              habituel — la génération fonctionne, seule cette destination change.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const choisir = async () => {
    setOccupe(true);
    const nom = await choisirDossier();
    setOccupe(false);
    if (nom) await rafraichir();
  };

  const reactiver = async () => {
    setOccupe(true);
    const nom = await reactiverDossier();
    setOccupe(false);
    if (nom) await rafraichir();
  };

  const oublier = async () => {
    await oublierDossier();
    setDossier(null);
    setFichiers([]);
    setPermissionPerdue(false);
  };

  const confirmerSuppression = async () => {
    if (!aSupprimer) return;
    setOccupe(true);
    await supprimerFichier(aSupprimer);
    setASupprimer(null);
    setOccupe(false);
    await rafraichir();
  };

  return (
    <div className="border-2 border-[#141414]/10 bg-white">
      <En_tete />
      <div className="px-5 py-4 space-y-4">
        <p className="text-[10px] text-[#141414]/45 leading-relaxed">
          Désignez un dossier de votre ordinateur : les PDF générés pourront y être
          enregistrés directement. L&apos;accès se limite à ce dossier, et reste révocable
          à tout moment depuis votre navigateur.
        </p>

        {/* État du dossier */}
        {chargement ? (
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#141414]/30">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement
          </p>
        ) : dossier ? (
          <div className="flex items-center gap-3 px-4 py-3 border-2 border-[#10B981]/30 bg-[#10B981]/[0.05]">
            <FolderOpen className="w-4 h-4 flex-shrink-0 text-[#10B981]" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black text-[#141414] truncate">{dossier}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-[#10B981]">Dossier autorisé</p>
            </div>
            <button
              onClick={oublier}
              className="flex-shrink-0 text-[9px] font-black uppercase tracking-widest text-[#141414]/40 hover:text-red-600 transition-colors"
            >
              Retirer
            </button>
          </div>
        ) : permissionPerdue ? (
          <div className="flex items-center gap-3 px-4 py-3 border-2 border-[#F59E0B]/30 bg-[#F59E0B]/[0.05]">
            <RefreshCw className="w-4 h-4 flex-shrink-0 text-[#F59E0B]" />
            <p className="flex-1 text-[10px] text-[#141414]/55 leading-relaxed">
              Un dossier a déjà été choisi. Le navigateur redemande votre accord après
              un rechargement.
            </p>
            <button
              onClick={reactiver}
              disabled={occupe}
              className="flex-shrink-0 px-3 py-2 bg-[#F59E0B] text-white text-[9px] font-black uppercase tracking-widest hover:bg-[#d98a08] transition-colors disabled:opacity-40"
            >
              Réautoriser
            </button>
          </div>
        ) : (
          <button
            onClick={choisir}
            disabled={occupe}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-[#5D7BFF]/40 text-[#5D7BFF] text-[10px] font-black uppercase tracking-widest hover:bg-[#5D7BFF]/10 transition-colors disabled:opacity-40"
          >
            {occupe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
            Choisir un dossier
          </button>
        )}

        {/* Liste des PDF */}
        {dossier && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#141414]/40">
                PDF dans ce dossier
              </p>
              <button
                onClick={() => void rafraichir()}
                aria-label="Actualiser"
                className="text-[#141414]/30 hover:text-[#5D7BFF] transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {fichiers.length === 0 ? (
              <p className="text-[10px] text-[#141414]/35 italic">Aucun PDF pour le moment.</p>
            ) : (
              <div className="space-y-1.5">
                {fichiers.map((f) => (
                  <div key={f.nom} className="flex items-center gap-3 px-3 py-2 border border-[#141414]/10 bg-[#141414]/[0.02]">
                    <FileText className="w-3.5 h-3.5 flex-shrink-0 text-[#5D7BFF]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-[#141414] truncate">{f.nom}</p>
                      <p className="text-[9px] text-[#141414]/35">
                        {tailleLisible(f.taille)} · {new Date(f.modifieLe).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    {aSupprimer === f.nom ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={confirmerSuppression}
                          disabled={occupe}
                          className="px-2 py-1 bg-red-600 text-white text-[8px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors"
                        >
                          Supprimer
                        </button>
                        <button
                          onClick={() => setASupprimer(null)}
                          className="text-[8px] font-black uppercase tracking-widest text-[#141414]/40"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setASupprimer(f.nom)}
                        aria-label={`Supprimer ${f.nom}`}
                        className="flex-shrink-0 text-[#141414]/25 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[9px] text-[#141414]/35 leading-relaxed mt-2.5 flex items-start gap-1.5">
              <Check className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
              La suppression est définitive et n&apos;est jamais décidée par l&apos;IA :
              elle générera des documents, jamais elle n&apos;effacera vos fichiers.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function En_tete() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
      <div className="w-8 h-8 flex items-center justify-center"
           style={{ background: '#5D7BFF12', border: '1.5px solid #5D7BFF30' }}>
        <FolderOpen className="w-4 h-4 text-[#5D7BFF]" />
      </div>
      <h2 className="text-[11px] font-black uppercase tracking-widest text-[#5D7BFF]">Dossier de travail</h2>
    </div>
  );
}
