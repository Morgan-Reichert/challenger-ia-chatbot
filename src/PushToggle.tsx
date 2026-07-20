import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Check, Loader2 } from 'lucide-react';
import { isPushSupported, enablePush, pushPermission } from './push';
import {
  type CategoriesNotification, PREFERENCES_DEFAUT, LIBELLES_NOTIFICATION,
  chargerPreferences, enregistrerPreferences,
} from './preferencesCompte';

/**
 * Notifications : autorisation du navigateur, puis choix par catégorie.
 *
 * L'interrupteur unique d'origine forçait à tout accepter ou tout refuser ;
 * un utilisateur qui ne voulait que le défi du jour coupait tout, et le canal
 * entier était perdu. Les catégories sont conservées côté serveur, car c'est
 * une tâche planifiée — sans accès au navigateur — qui émet les envois.
 */
export default function PushToggle({ userId }: { userId?: string | null }) {
  const [perm, setPerm] = useState<string>('default');
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<CategoriesNotification>(PREFERENCES_DEFAUT.notifications);
  const [chargement, setChargement] = useState(true);

  useEffect(() => { setPerm(pushPermission()); }, []);

  useEffect(() => {
    let vivant = true;
    if (!userId) { setChargement(false); return; }
    void chargerPreferences().then((p) => {
      if (vivant) { setCategories(p.notifications); setChargement(false); }
    });
    return () => { vivant = false; };
  }, [userId]);

  const basculer = useCallback((cle: keyof CategoriesNotification) => {
    setCategories((actuelles) => {
      const suivantes = { ...actuelles, [cle]: !actuelles[cle] };
      void enregistrerPreferences({ notifications: suivantes });
      return suivantes;
    });
  }, []);

  if (!isPushSupported()) return null;

  const accordee = perm === 'granted';
  const refusee = perm === 'denied';

  return (
    <div className="border-2 border-[#141414]/10 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
        <div className="w-8 h-8 flex items-center justify-center"
             style={{ background: '#5D7BFF12', border: '1.5px solid #5D7BFF30' }}>
          {accordee ? <Bell className="w-4 h-4 text-[#5D7BFF]" /> : <BellOff className="w-4 h-4 text-[#5D7BFF]" />}
        </div>
        <h2 className="text-[11px] font-black uppercase tracking-widest text-[#5D7BFF]">Notifications</h2>
      </div>

      <div className="px-5 py-4 space-y-4">

        {/* ── Autorisation du navigateur ── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-[#141414]">Autorisation de cet appareil</p>
            <p className="text-[10px] text-[#141414]/45 mt-0.5 leading-relaxed">
              {refusee
                ? 'Bloquées — à réautoriser dans les réglages du navigateur.'
                : accordee
                  ? 'Cet appareil peut recevoir des notifications.'
                  : "Aucune notification ne peut être envoyée tant que ce n'est pas autorisé."}
            </p>
          </div>
          {accordee ? (
            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#10B981] flex-shrink-0">
              <Check className="w-3.5 h-3.5" /> Autorisé
            </span>
          ) : (
            <button
              onClick={async () => {
                setBusy(true);
                await enablePush();
                setPerm(pushPermission());
                setBusy(false);
              }}
              disabled={busy || refusee}
              className="flex-shrink-0 px-4 py-2 bg-[#5D7BFF] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 transition-colors hover:bg-[#4a68e8]"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Autoriser'}
            </button>
          )}
        </div>

        {/* ── Catégories ── */}
        <div className="border-t border-[#141414]/8 pt-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40 mb-3">
            Ce que vous souhaitez recevoir
          </p>

          {!userId ? (
            <p className="text-[10px] text-[#141414]/35 italic">
              Créez un compte pour choisir vos catégories : elles sont rattachées au
              compte, pas à cet appareil.
            </p>
          ) : chargement ? (
            <p className="text-[10px] text-[#141414]/40">Chargement…</p>
          ) : (
            <div className="space-y-3">
              {LIBELLES_NOTIFICATION.map((c) => (
                <div key={c.cle} className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-[11px] font-black text-[#141414]">{c.titre}</p>
                    <p className="text-[10px] text-[#141414]/45 mt-0.5 leading-relaxed">{c.desc}</p>
                  </div>
                  <button
                    onClick={() => basculer(c.cle)}
                    role="switch"
                    aria-checked={categories[c.cle]}
                    aria-label={c.titre}
                    className="flex-shrink-0 mt-0.5 relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none"
                    style={{ backgroundColor: categories[c.cle] ? '#5D7BFF' : '#D1D5DB' }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                      style={{ transform: categories[c.cle] ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
