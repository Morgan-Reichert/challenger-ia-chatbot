/**
 * Gestion des clés d'API par l'utilisateur.
 *
 *  GET    /api/keys            → liste des clés (préfixes uniquement)
 *  POST   /api/keys {name}     → crée une clé et la renvoie EN CLAIR, une seule fois
 *  DELETE /api/keys?id=<uuid>  → révoque une clé
 *
 * Authentifié par jeton Firebase — donc réservé à l'application, jamais aux
 * clés d'API elles-mêmes : une clé compromise ne doit pas pouvoir en créer
 * d'autres ni consulter les siennes.
 *
 * L'uid provient TOUJOURS du jeton vérifié : impossible de manipuler les clés
 * d'un tiers.
 */
import { createClient } from '@supabase/supabase-js';
import { verifyIdToken, isAuthEnforced } from './_lib/admin.js';
import { cors } from './_lib/cors.js';
import { genererCle } from './_lib/apikey.js';

const MAX_CLES_ACTIVES = 5;

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const { uid } = await verifyIdToken(req);
  if (!isAuthEnforced()) {
    return res.status(503).json({ erreur: 'service_indisponible' });
  }
  if (!uid) return res.status(401).json({ erreur: 'authentification_requise' });

  const supa = getSupabase();
  if (!supa) return res.status(503).json({ erreur: 'service_indisponible' });

  // ── Liste ────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supa
      .from('api_keys')
      .select('id, name, key_prefix, created_at, last_used_at, revoked_at, total_calls')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ erreur: 'erreur_interne', message: error.message });
    return res.status(200).json({ cles: data ?? [] });
  }

  // ── Création ─────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const nom = String(req.body?.name ?? '').trim().slice(0, 60) || 'Clé sans nom';

    const { count } = await supa
      .from('api_keys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .is('revoked_at', null);

    if ((count ?? 0) >= MAX_CLES_ACTIVES) {
      return res.status(409).json({
        erreur: 'trop_de_cles',
        message: `Vous avez déjà ${MAX_CLES_ACTIVES} clés actives. Révoquez-en une pour en créer une nouvelle.`,
      });
    }

    const { cle, hash, prefixe } = genererCle();
    const { data, error } = await supa
      .from('api_keys')
      .insert({ user_id: uid, name: nom, key_hash: hash, key_prefix: prefixe })
      .select('id, name, key_prefix, created_at')
      .single();

    if (error) return res.status(500).json({ erreur: 'erreur_interne', message: error.message });

    // La clé en clair n'est renvoyée qu'ici, et n'est jamais stockée.
    return res.status(201).json({
      ...data,
      cle,
      avertissement: "Conservez cette clé : elle ne sera plus jamais affichée.",
    });
  }

  // ── Révocation ───────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ erreur: 'parametre_invalide', message: 'Paramètre « id » requis.' });

    // Le filtre sur user_id est essentiel : sans lui, un identifiant deviné
    // permettrait de révoquer la clé d'un autre utilisateur.
    const { error } = await supa
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', uid);

    if (error) return res.status(500).json({ erreur: 'erreur_interne', message: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ erreur: 'methode_non_autorisee' });
}
