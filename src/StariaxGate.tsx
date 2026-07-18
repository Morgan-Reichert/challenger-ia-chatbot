/**
 * Gating d'interface piloté par STARIAX.
 *
 * Côté client (et non uniquement dans le middleware) parce que :
 *  - l'app native Capacitor charge ses assets depuis capacitor://localhost et
 *    ne passe JAMAIS par l'edge Vercel — le middleware n'y existe pas ;
 *  - le SPA n'a qu'une seule URL (« / »), donc un gating par route est
 *    impossible : les sections sont des états React.
 */
import { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { getMaintenance, getProduct, stariaxEnabled, type Maintenance, type MaintenanceScope } from './stariax';

/**
 * Logo piloté depuis STARIAX (habillage saisonnier), avec repli sur l'asset local.
 *
 * À réserver aux emplacements CARRÉS : le logoUrl STARIAX est une icône, elle
 * ne peut pas remplacer le logotype large sans casser la mise en page.
 */
export function useProductLogo(fallback: string): string {
  const [url, setUrl] = useState(fallback);

  useEffect(() => {
    if (!stariaxEnabled) return;
    let on = true;
    void getProduct().then((p) => {
      if (on && p?.logoUrl) setUrl(p.logoUrl);
    });
    return () => { on = false; };
  }, []);

  return url;
}

/** Surveille un scope de maintenance (revérification toutes les 60 s). */
export function useMaintenance(scope: MaintenanceScope): Maintenance | null {
  const [m, setM] = useState<Maintenance | null>(null);

  useEffect(() => {
    if (!stariaxEnabled) return;
    let on = true;
    const tick = () => { void getMaintenance(scope).then((v) => { if (on) setM(v); }); };
    tick();
    const t = setInterval(tick, 60_000);
    return () => { on = false; clearInterval(t); };
  }, [scope]);

  return m;
}

/** Vrai uniquement si la maintenance est active ET non contournée. */
export function isBlocked(m: Maintenance | null): boolean {
  return Boolean(m?.active && !m.bypass);
}

/** Écran plein — coupure globale du produit (scope « site »). */
export function StariaxMaintenanceScreen({ m }: { m: Maintenance }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-chat)] px-6">
      <div className="max-w-md w-full text-center">
        <img
          src={m.logoUrl || '/icon-192.png'}
          alt=""
          className="w-16 h-16 mx-auto mb-6 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/icon-192.png'; }}
        />
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-3">
          {m.title || 'Maintenance en cours'}
        </h1>
        <p className="text-sm text-[var(--text-primary)]/60 leading-relaxed">
          {m.message || 'Challenger IA est momentanément indisponible. Merci de revenir dans quelques instants.'}
        </p>
      </div>
    </div>
  );
}

/**
 * Remplace une section par un avis quand son scope est en maintenance.
 * Utilisé pour « abonnements » (Pro / paiement) et « connexion ».
 */
export function StariaxSectionGate({
  scope, children, compact = false,
}: {
  scope: MaintenanceScope;
  children: React.ReactNode;
  compact?: boolean;
}) {
  const m = useMaintenance(scope);
  if (!isBlocked(m) || !m) return <>{children}</>;

  return (
    <div className={compact ? 'p-4' : 'p-6'}>
      <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-50/60 p-4">
        <Wrench className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {m.title || (scope === 'abonnements' ? 'Abonnements indisponibles' : 'Connexion indisponible')}
          </p>
          <p className="text-xs text-[var(--text-primary)]/60 mt-1 leading-relaxed">
            {m.message || 'Cette section est temporairement en maintenance. Merci de réessayer plus tard.'}
          </p>
        </div>
      </div>
    </div>
  );
}
