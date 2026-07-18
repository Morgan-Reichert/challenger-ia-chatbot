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

let cached: BetaAssignment | null = null;
let inflight: Promise<BetaAssignment> | null = null;

export async function getBeta(): Promise<BetaAssignment> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await apiFetch('/api/beta');
      if (!res.ok) return NOT_ENROLLED;
      const d = await res.json();
      return {
        enrolled: Boolean(d?.enrolled),
        version: d?.version ?? null,
        features: Array.isArray(d?.features) ? d.features : [],
      } as BetaAssignment;
    } catch {
      return NOT_ENROLLED;
    } finally {
      inflight = null;
    }
  })();

  cached = await inflight;
  return cached;
}

/** Affectation beta de l'utilisateur courant (null tant que non résolue). */
export function useBeta(enabled = true): BetaAssignment | null {
  const [b, setB] = useState<BetaAssignment | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let on = true;
    void getBeta().then((v) => { if (on) setB(v); });
    return () => { on = false; };
  }, [enabled]);

  return b;
}

/** Un drapeau fonctionnel est-il actif pour cet utilisateur ? */
export function useBetaFeature(flag: string, enabled = true): boolean {
  const b = useBeta(enabled);
  return Boolean(b?.enrolled && b.features.includes(flag));
}
