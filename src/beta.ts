/**
 * Version beta de l'utilisateur, résolue via STARIAX.
 *
 * Passe toujours par notre proxy /api/beta (jamais STARIAX en direct) : l'uid
 * y est déduit du token Firebase vérifié, ce qui empêche d'interroger le
 * statut beta d'un autre utilisateur.
 *
 * FAIL-OPEN : toute erreur ou absence d'API → « non inscrit », sans badge et
 * sans fonctionnalité beta activée.
 */
import { useEffect, useState } from 'react';
import { apiFetch } from './apiClient';

export type BetaVersion = {
  id: string;
  version: string;
  label?: string;
};

export type BetaAssignment = {
  enrolled: boolean;
  version: BetaVersion | null;
  features: string[];
};

const NOT_ENROLLED: BetaAssignment = { enrolled: false, version: null, features: [] };

// Cache par utilisateur : un résultat obtenu pour un compte ne doit jamais
// être servi à un autre (ni survivre à une déconnexion).
const cache = new Map<string, BetaAssignment>();

/**
 * Résout l'affectation beta. Renvoie `null` en cas d'échec (réseau, 401 parce
 * que le token n'est pas encore prêt…) — et surtout NE MET PAS l'échec en
 * cache, sinon un appel trop précoce condamnerait le badge pour toute la
 * session. Seule une réponse valide du serveur est mémorisée.
 */
export async function getBeta(uid: string): Promise<BetaAssignment | null> {
  const hit = cache.get(uid);
  if (hit) return hit;

  try {
    const res = await apiFetch('/api/beta');
    if (!res.ok) return null;
    const d = await res.json();
    const value: BetaAssignment = {
      enrolled: Boolean(d?.enrolled),
      version: d?.version ?? null,
      features: Array.isArray(d?.features) ? d.features : [],
    };
    cache.set(uid, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * Affectation beta de l'utilisateur courant (null tant que non résolue).
 * Se relance quand l'utilisateur change — c'est ce qui permet au badge
 * d'apparaître après la connexion, et de disparaître à la déconnexion.
 */
export function useBeta(uid: string | null | undefined): BetaAssignment | null {
  const [b, setB] = useState<BetaAssignment | null>(null);

  useEffect(() => {
    if (!uid) { setB(null); return; }
    let on = true;
    let cancelled = false;

    // Le token Firebase peut ne pas être prêt au tout premier rendu : on
    // retente brièvement plutôt que de conclure « non inscrit » à tort.
    const attempt = async (tries: number) => {
      for (let i = 0; i < tries && !cancelled; i++) {
        const v = await getBeta(uid);
        if (!on) return;
        if (v) { setB(v); return; }
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    };
    void attempt(3);

    return () => { on = false; cancelled = true; };
  }, [uid]);

  return b;
}

/** Un drapeau fonctionnel est-il actif pour cet utilisateur ? */
export function useBetaFeature(flag: string, uid: string | null | undefined): boolean {
  const b = useBeta(uid);
  return Boolean(b?.enrolled && b.features.includes(flag));
}
