/**
 * STARIAX — centre de contrôle produit (maintenance, logo, offres, report d'erreurs).
 *
 * Principes de conception :
 *  - FAIL-OPEN : toute erreur réseau ou HTTP laisse l'application fonctionner
 *    normalement. STARIAX ne doit JAMAIS pouvoir casser Challenger IA.
 *  - Cache 30 s par scope, pour ne pas marteler l'API à chaque rendu.
 *  - Intégration inactive tant que VITE_STARIAX_PRODUCT_ID n'est pas renseigné.
 *  - Rien de secret côté client : seuls l'ID produit, la base et le token
 *    d'ingest (public par design) transitent ici.
 */

const BASE = ((import.meta.env.VITE_STARIAX_BASE as string | undefined) ?? '').replace(/\/+$/, '');
const PRODUCT_ID = (import.meta.env.VITE_STARIAX_PRODUCT_ID as string | undefined) ?? '';
const INGEST_TOKEN = (import.meta.env.VITE_STARIAX_INGEST_TOKEN as string | undefined) ?? '';

/** L'intégration ne s'active que si la base ET l'ID produit sont configurés. */
export const stariaxEnabled = Boolean(BASE && PRODUCT_ID);

export type MaintenanceScope = 'site' | 'abonnements' | 'connexion';

export type Maintenance = {
  scope: string;
  active: boolean;
  mode: string;
  title: string;
  message: string;
  logoUrl: string;
  paths: string[];
  startsAt: string | null;
  endsAt: string | null;
  bypass: boolean;
  siteActive: boolean;
};

export type StariaxPlan = {
  id?: string;
  name?: string;
  price?: number | string;
  currency?: string;
  period?: string;
  features?: string[];
  url?: string;
  highlighted?: boolean;
};

export type StariaxProduct = {
  name: string | null;
  logoUrl: string | null;
  url: string | null;
  loginMethods: string[];
  plans: StariaxPlan[];
};

/** État neutre renvoyé dès que STARIAX est indisponible ou non configuré. */
const INACTIVE: Maintenance = {
  scope: '', active: false, mode: 'full', title: '', message: '',
  logoUrl: '', paths: [], startsAt: null, endsAt: null, bypass: false, siteActive: false,
};

const TTL = 30_000;
const cache = new Map<string, { at: number; data: unknown }>();

async function getJson<T>(url: string, key: string, ttl = TTL): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    // Sur HTTP non-OK on conserve la dernière valeur connue plutôt que de couper.
    if (!res.ok) return (hit?.data as T) ?? null;
    const data = (await res.json()) as T;
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return (hit?.data as T) ?? null;
  }
}

/** État de maintenance d'un scope. Renvoie toujours « inactif » si indisponible. */
export async function getMaintenance(scope: MaintenanceScope): Promise<Maintenance> {
  if (!stariaxEnabled) return INACTIVE;
  const data = await getJson<Maintenance>(
    `${BASE}/api/maintenance/${PRODUCT_ID}?scope=${encodeURIComponent(scope)}`,
    `maintenance:${scope}`,
  );
  return data ?? INACTIVE;
}

/** Fiche produit : logo (saisonnier), offres, méthodes de connexion. */
export async function getProduct(): Promise<StariaxProduct | null> {
  if (!stariaxEnabled) return null;
  return getJson<StariaxProduct>(`${BASE}/api/product/${PRODUCT_ID}`, 'product', 5 * 60_000);
}

// ─── Report d'erreurs ────────────────────────────────────────────────────────

let sentCount = 0;
const alreadySent = new Set<string>();
const MAX_PER_SESSION = 20;

/**
 * Remonte une erreur runtime à STARIAX.
 * Ne throw jamais, déduplique, et se plafonne pour éviter toute boucle
 * (une erreur dans le reporter ne doit pas déclencher un nouveau report).
 */
export function reportError(e: {
  message: string;
  stack?: string;
  url?: string;
  level?: 'error' | 'warn' | 'info';
}): void {
  if (!BASE || !INGEST_TOKEN) return;
  if (sentCount >= MAX_PER_SESSION) return;

  const level = e.level ?? 'error';
  const key = `${level}:${e.message}`;
  if (alreadySent.has(key)) return;
  alreadySent.add(key);
  sentCount++;

  try {
    void fetch(`${BASE}/api/ingest/${INGEST_TOKEN}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: e.message,
        stack: e.stack ?? '',
        url: e.url ?? (typeof location !== 'undefined' ? location.href : ''),
        level,
      }),
      keepalive: true,
    }).catch(() => { /* silencieux par conception */ });
  } catch {
    /* le reporter ne doit jamais propager d'erreur */
  }
}
