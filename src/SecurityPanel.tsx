/**
 * Sécurité du compte — mot de passe, vérification de l'adresse, appareils.
 *
 * Sur la double authentification : Firebase ne la propose qu'aux projets
 * migrés vers Identity Platform. Plutôt qu'un interrupteur qui échouerait à
 * l'usage, l'état réel est annoncé ici et la marche à suivre est indiquée.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, KeyRound, MailCheck, MonitorSmartphone, Loader2,
  AlertTriangle, Check, LogOut,
} from 'lucide-react';
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendEmailVerification,
  type User as FirebaseUser,
} from 'firebase/auth';
import { listerSessions, revoquerToutesLesSessions, jetonLocal, type SessionEnregistree } from './sessions';

const LONGUEUR_MINIMALE = 8;

function formaterDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SecurityPanel({ user }: { user: FirebaseUser | null }) {
  const [sessions, setSessions] = useState<SessionEnregistree[]>([]);
  const [chargement, setChargement] = useState(true);

  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const [verifEnvoyee, setVerifEnvoyee] = useState(false);
  const [revocationEnCours, setRevocationEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!user) { setChargement(false); return; }
    setSessions(await listerSessions());
    setChargement(false);
  }, [user]);

  useEffect(() => { void charger(); }, [charger]);

  if (!user || user.isAnonymous) {
    return (
      <div className="border-2 border-[#141414]/10 bg-white px-5 py-6 text-center">
        <ShieldCheck className="w-5 h-5 mx-auto text-[#141414]/20 mb-2" />
        <p className="text-[11px] font-black text-[#141414]">Compte non enregistré</p>
        <p className="text-[10px] text-[#141414]/45 mt-1 leading-relaxed">
          Les réglages de sécurité s&apos;appliquent aux comptes créés avec une adresse
          e-mail. Créez un compte pour y accéder.
        </p>
      </div>
    );
  }

  // Un compte Google n'a pas de mot de passe chez nous : proposer d'en changer
  // un renverrait une erreur incompréhensible.
  const aUnMotDePasse = user.providerData.some((p) => p.providerId === 'password');

  const changerMotDePasse = async () => {
    setMessage(null);

    if (nouveau.length < LONGUEUR_MINIMALE) {
      setMessage({ ok: false, texte: `Le nouveau mot de passe doit faire au moins ${LONGUEUR_MINIMALE} caractères.` });
      return;
    }
    if (nouveau !== confirmation) {
      setMessage({ ok: false, texte: 'Les deux saisies ne correspondent pas.' });
      return;
    }
    if (nouveau === ancien) {
      setMessage({ ok: false, texte: 'Le nouveau mot de passe est identique à l’ancien.' });
      return;
    }

    setEnCours(true);
    try {
      // Firebase exige une connexion récente pour changer un mot de passe.
      // On réauthentifie explicitement : sans cela, l'opération échouerait
      // avec « requires-recent-login » après quelques minutes de session.
      const identifiants = EmailAuthProvider.credential(user.email ?? '', ancien);
      await reauthenticateWithCredential(user, identifiants);
      await updatePassword(user, nouveau);

      setAncien(''); setNouveau(''); setConfirmation('');
      setMessage({ ok: true, texte: 'Mot de passe modifié. Les autres appareils restent connectés — utilisez la révocation ci-dessous pour les déconnecter.' });
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      setMessage({
        ok: false,
        texte:
            code === 'auth/wrong-password' || code === 'auth/invalid-credential'
              ? 'Mot de passe actuel incorrect.'
          : code === 'auth/too-many-requests'
              ? 'Trop de tentatives. Réessayez dans quelques minutes.'
          : code === 'auth/weak-password'
              ? 'Mot de passe trop faible.'
          : 'La modification a échoué. Réessayez.',
      });
    }
    setEnCours(false);
  };

  const envoyerVerification = async () => {
    try {
      await sendEmailVerification(user);
      setVerifEnvoyee(true);
    } catch {
      setMessage({ ok: false, texte: "L'envoi a échoué. Réessayez dans quelques minutes." });
    }
  };

  const revoquer = async () => {
    setRevocationEnCours(true);
    const ok = await revoquerToutesLesSessions();
    setRevocationEnCours(false);
    if (!ok) setMessage({ ok: false, texte: 'La révocation a échoué. Réessayez.' });
    // En cas de succès, Firebase invalide le jeton courant : la déconnexion
    // survient d'elle-même au prochain rafraîchissement.
  };

  const jeton = jetonLocal();

  return (
    <div className="space-y-4">

      {/* ── Adresse e-mail ─────────────────────────────────────────────────── */}
      <div className="border-2 border-[#141414]/10 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
          <div className="w-8 h-8 flex items-center justify-center"
               style={{ background: '#0EA5E912', border: '1.5px solid #0EA5E930' }}>
            <MailCheck className="w-4 h-4 text-[#0EA5E9]" />
          </div>
          <h2 className="text-[11px] font-black uppercase tracking-widest text-[#0EA5E9]">Adresse e-mail</h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-[11px] font-bold text-[#141414] break-all">{user.email}</p>
          {user.emailVerified ? (
            <p className="flex items-center gap-1.5 text-[10px] text-[#10B981] font-black uppercase tracking-widest mt-2">
              <Check className="w-3 h-3" /> Vérifiée
            </p>
          ) : (
            <div className="mt-2">
              <p className="flex items-center gap-1.5 text-[10px] text-[#F59E0B] font-black uppercase tracking-widest">
                <AlertTriangle className="w-3 h-3" /> Non vérifiée
              </p>
              <p className="text-[10px] text-[#141414]/45 mt-1.5 leading-relaxed">
                Sans adresse vérifiée, la réinitialisation du mot de passe ne peut pas
                vous être garantie.
              </p>
              <button
                onClick={envoyerVerification}
                disabled={verifEnvoyee}
                className="mt-2.5 px-4 py-2 border-2 border-[#0EA5E9]/40 text-[#0EA5E9] text-[10px] font-black uppercase tracking-widest hover:bg-[#0EA5E9]/10 transition-colors disabled:opacity-40"
              >
                {verifEnvoyee ? 'E-mail envoyé' : 'Envoyer le lien de vérification'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Mot de passe ───────────────────────────────────────────────────── */}
      {aUnMotDePasse && (
        <div className="border-2 border-[#141414]/10 bg-white">
          <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
            <div className="w-8 h-8 flex items-center justify-center"
                 style={{ background: '#5D7BFF12', border: '1.5px solid #5D7BFF30' }}>
              <KeyRound className="w-4 h-4 text-[#5D7BFF]" />
            </div>
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#5D7BFF]">Mot de passe</h2>
          </div>
          <div className="px-5 py-4 space-y-2.5">
            {([
              ['Mot de passe actuel', ancien, setAncien, 'current-password'],
              ['Nouveau mot de passe', nouveau, setNouveau, 'new-password'],
              ['Confirmer le nouveau', confirmation, setConfirmation, 'new-password'],
            ] as const).map(([libelle, valeur, definir, autocomplete]) => (
              <label key={libelle} className="block">
                <span className="block text-[9px] font-black uppercase tracking-widest text-[#141414]/40 mb-1">
                  {libelle}
                </span>
                <input
                  type="password"
                  value={valeur}
                  autoComplete={autocomplete}
                  onChange={(e) => definir(e.target.value)}
                  className="w-full px-3 py-2 text-[11px] border-2 border-[#141414]/10 focus:outline-none focus:border-[#5D7BFF]"
                />
              </label>
            ))}

            <button
              onClick={changerMotDePasse}
              disabled={enCours || !ancien || !nouveau}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#5D7BFF] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#4a68e8] transition-colors disabled:opacity-40"
            >
              {enCours && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Modifier le mot de passe
            </button>

            {message && (
              <p className={`text-[10px] font-bold leading-relaxed ${message.ok ? 'text-[#10B981]' : 'text-red-600'}`}>
                {message.texte}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Appareils connectés ────────────────────────────────────────────── */}
      <div className="border-2 border-[#141414]/10 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
          <div className="w-8 h-8 flex items-center justify-center"
               style={{ background: '#8B5CF612', border: '1.5px solid #8B5CF630' }}>
            <MonitorSmartphone className="w-4 h-4 text-[#8B5CF6]" />
          </div>
          <h2 className="text-[11px] font-black uppercase tracking-widest text-[#8B5CF6]">Appareils connectés</h2>
        </div>

        <div className="px-5 py-4 space-y-3">
          {chargement ? (
            <p className="text-[10px] text-[#141414]/40">Chargement…</p>
          ) : sessions.length === 0 ? (
            <p className="text-[10px] text-[#141414]/35 italic">Aucune session enregistrée.</p>
          ) : (
            <div className="space-y-1.5">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2 border border-[#141414]/10 bg-[#141414]/[0.02]">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-[#141414]">
                      {s.appareil ?? 'Appareil inconnu'}
                      {s.jeton === jeton && (
                        <span className="ml-2 text-[8px] font-black uppercase tracking-widest text-[#10B981]">
                          Cet appareil
                        </span>
                      )}
                    </p>
                    <p className="text-[9px] text-[#141414]/35">
                      Dernière activité le {formaterDate(s.vu_le)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-[#141414]/8 pt-3">
            <p className="text-[10px] text-[#141414]/45 leading-relaxed mb-2.5">
              La déconnexion s&apos;applique à <strong>tous les appareils, celui-ci compris</strong>.
              Notre fournisseur d&apos;authentification ne permet pas de révoquer un appareil
              isolément — mieux vaut le dire que le laisser croire.
            </p>
            <button
              onClick={revoquer}
              disabled={revocationEnCours}
              className="flex items-center gap-2 px-4 py-2 border-2 border-red-500/40 text-red-600 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              {revocationEnCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              Déconnecter tous les appareils
            </button>
          </div>
        </div>
      </div>

      {/* ── Double authentification ────────────────────────────────────────── */}
      <div className="border-2 border-[#141414]/10 bg-white px-5 py-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-[#141414]/30 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-black text-[#141414]">Double authentification</p>
            <p className="text-[10px] text-[#141414]/45 mt-1 leading-relaxed">
              Pas encore disponible. Elle suppose la migration du projet
              d&apos;authentification vers Google Identity Platform ; tant que ce n&apos;est
              pas fait, tout interrupteur affiché ici échouerait à l&apos;usage.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
