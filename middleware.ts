/**
 * Vercel Edge Middleware — coupure du site pilotée à distance depuis STARIAX.
 *
 * IMPORTANT : ne couvre QUE le web. L'app native (Capacitor) charge ses assets
 * depuis capacitor://localhost et ne traverse jamais l'edge Vercel — c'est le
 * gating côté client (src/StariaxGate.tsx) qui la protège.
 *
 * FAIL-OPEN : toute erreur réseau, HTTP ou de parsing laisse passer la requête.
 */

const BASE = (process.env.STARIAX_BASE ?? '').replace(/\/+$/, '');
const PRODUCT_ID = process.env.STARIAX_PRODUCT_ID ?? '';
const TTL = 30_000;

type Maintenance = {
  scope?: string;
  active?: boolean;
  message?: string;
  bypass?: boolean;
};

// Cache par isolate edge — suffisant pour absorber les rafales de requêtes.
let cache: { at: number; data: Maintenance } | null = null;

// On ignore les assets, les fonctions API et les fichiers avec extension.
export const config = {
  matcher: ['/((?!api/|assets/|_vercel|.*\\.[\\w]+$).*)'],
};

export default async function middleware(request: Request): Promise<Response | undefined> {
  if (!BASE || !PRODUCT_ID) return; // intégration non configurée → on laisse passer

  try {
    const { pathname } = new URL(request.url);

    let data = cache && Date.now() - cache.at < TTL ? cache.data : null;
    if (!data) {
      const res = await fetch(
        `${BASE}/api/maintenance/${PRODUCT_ID}?path=${encodeURIComponent(pathname)}`,
        { headers: { accept: 'application/json' } },
      );
      if (!res.ok) return;
      data = (await res.json()) as Maintenance;
      cache = { at: Date.now(), data };
    }

    if (!data.active || data.bypass) return;

    // Coupure globale → page de maintenance hébergée par STARIAX.
    if (data.scope === 'site') {
      return Response.redirect(`${BASE}/maintenance/${PRODUCT_ID}`, 307);
    }

    // Coupure partielle → 503 explicite.
    return new Response(data.message || 'Service temporairement indisponible.', {
      status: 503,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'retry-after': '120',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return; // fail-open : STARIAX ne doit jamais pouvoir casser le site
  }
}
