/**
 * Authentification par clé d'API et consommation de crédits.
 *
 * La clé transite dans l'en-tête `Authorization: Bearer cia_live_…`.
 * Seule son empreinte SHA-256 est stockée en base : une fuite de la base ne
 * permet pas de reconstituer les clés.
 *
 * La vérification, la limitation de débit et le débit du crédit se font dans
 * une seule procédure stockée, donc de manière atomique — sinon deux appels
 * simultanés pourraient consommer le même crédit.
 *
 * Pré-requis : exécuter supabase/api.sql.
 */
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const PREFIXE = 'cia_live_';

/** Coût en crédits de chaque opération. */
export const TARIFS = {
  challenge: 1,
  factcheck: 2,   // recherche web et analyse de sources : plus coûteux
  analyze: 1,
};

let _client = null;
function getSupabase() {
  if (_client) return _client;
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/** Empreinte d'une clé. Jamais l'inverse : le hachage est à sens unique. */
export function empreinte(cle) {
  return crypto.createHash('sha256').update(cle, 'utf8').digest('hex');
}

/** Génère une clé et son empreinte. La clé en clair n'est montrée qu'une fois. */
export function genererCle() {
  const secret = crypto.randomBytes(24).toString('hex');
  const cle = `${PREFIXE}${secret}`;
  return {
    cle,
    hash: empreinte(cle),
    prefixe: `${PREFIXE}${secret.slice(0, 8)}`,
  };
}

function lireCle(req) {
  const brut = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(brut);
  return m ? m[1].trim() : null;
}

/**
 * Authentifie l'appel et débite le crédit correspondant.
 *
 * Retourne `{ ok:true, userId, creditsRestants }` ou
 * `{ ok:false, statut, erreur }` prêt à être renvoyé au client.
 */
export async function autoriser(req, endpoint) {
  const cle = lireCle(req);
  if (!cle) {
    return { ok: false, statut: 401, erreur: 'api_key_manquante',
             message: "Fournissez votre clé dans l'en-tête Authorization: Bearer <clé>." };
  }
  if (!cle.startsWith(PREFIXE)) {
    return { ok: false, statut: 401, erreur: 'api_key_invalide',
             message: `Une clé Challenger IA commence par « ${PREFIXE} ».` };
  }

  const supa = getSupabase();
  if (!supa) {
    return { ok: false, statut: 503, erreur: 'service_indisponible',
             message: "Service d'authentification non configuré." };
  }

  const cout = TARIFS[endpoint] ?? 1;
  const { data, error } = await supa.rpc('consume_api_credits', {
    p_key_hash: empreinte(cle),
    p_endpoint: endpoint,
    p_cost: cout,
    p_rate_per_min: Number(process.env.API_RATE_LIMIT_PER_MIN || 60),
  });

  if (error) {
    // Le detail est journalise cote serveur mais JAMAIS renvoye au client :
    // il exposerait le schema de la base au consommateur de l'API.
    console.error('[api] consume_api_credits:', error.message);
    return {
      ok: false, statut: 503, erreur: 'service_indisponible',
      message: "Service temporairement indisponible. Reessayez dans un instant.",
    };
  }

  if (!data?.ok) {
    const correspondances = {
      invalid_key:          [401, 'api_key_invalide',       'Clé inconnue.'],
      revoked_key:          [401, 'api_key_revoquee',       'Cette clé a été révoquée.'],
      rate_limited:         [429, 'trop_de_requetes',       'Trop de requêtes. Réessayez dans une minute.'],
      insufficient_credits: [402, 'credits_insuffisants',   'Crédits épuisés. Rechargez depuis votre compte.'],
    };
    const [statut, erreur, message] = correspondances[data?.reason] ?? [400, 'requete_invalide', 'Appel refusé.'];
    return { ok: false, statut, erreur, message, credits: data?.credits };
  }

  return { ok: true, userId: data.user_id, creditsRestants: data.credits_remaining, cout };
}

/** En-têtes communs à toutes les réponses de l'API. */
export function entetesApi(res, creditsRestants) {
  res.setHeader('Cache-Control', 'no-store');
  if (typeof creditsRestants === 'number') {
    res.setHeader('X-Credits-Remaining', String(creditsRestants));
  }
}
