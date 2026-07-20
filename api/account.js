/**
 * Droits RGPD sur le compte — export global et effacement.
 *
 *  GET    /api/account  → archive JSON de toutes les données détenues (art. 15 et 20)
 *  DELETE /api/account  → effacement complet et définitif du compte (art. 17)
 *
 * L'uid provient TOUJOURS du token Firebase vérifié, jamais du corps de requête :
 * il est donc impossible d'exporter ou de supprimer le compte d'un tiers.
 *
 * L'effacement couvre les trois systèmes de persistance :
 *   Firestore  — users/{uid}/** (conversations, projets, méta) + partages publics
 *   Supabase   — crédits, abonnement, quotas, consentements, notifications
 *   Firebase   — le compte d'authentification lui-même, en dernier
 *
 * L'ordre importe : le compte d'authentification est supprimé en DERNIER, afin
 * qu'un échec intermédiaire laisse l'utilisateur en mesure de relancer
 * l'opération plutôt que de le priver d'accès à des données subsistantes.
 */
import { createClient } from '@supabase/supabase-js';
import { verifyIdToken, isAuthEnforced, getAdminFirestore, getAdminAuth } from './_lib/admin.js';
import { cors } from './_lib/cors.js';
import { genererCle } from './_lib/apikey.js';

const MAX_CLES_ACTIVES = 5;

// Tables Supabase indexées sur l'utilisateur, à purger intégralement.
const TABLES_UTILISATEUR = [
  'user_credits',
  'subscriptions',
  'chat_usage',
  'daily_rewards',
  'user_contacts',
  'push_subscriptions',
  'user_sessions',
  'user_preferences',
];

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Supprime récursivement une collection, par lots (limite Firestore : 500). */
async function supprimerCollection(dbAdmin, ref, taille = 300) {
  let total = 0;
  for (;;) {
    const snap = await ref.limit(taille).get();
    if (snap.empty) return total;
    const lot = dbAdmin.batch();
    snap.docs.forEach((d) => lot.delete(d.ref));
    await lot.commit();
    total += snap.size;
    if (snap.size < taille) return total;
  }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const { uid } = await verifyIdToken(req);
  if (!isAuthEnforced()) {
    return res.status(503).json({ error: 'Service indisponible : authentification serveur non configurée.' });
  }
  if (!uid) return res.status(401).json({ error: 'Authentification requise' });

  const dbAdmin = getAdminFirestore();
  const supa = getSupabase();

  // ── Clés d'API (?resource=keys) ───────────────────────────────────────────
  // Regroupées ici plutôt que dans une fonction dédiée : Vercel plafonne le
  // nombre de fonctions par déploiement, et ces opérations partagent déjà
  // l'authentification et le client de base de données.
  if (req.query?.resource === 'keys') {
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

  // ── Sessions / appareils connectés (?resource=sessions) ───────────────────
  //
  // Firebase n'expose aucune liste de sessions : ce registre est tenu par
  // l'application, alimenté à chaque connexion et rafraîchi à l'ouverture.
  // La révocation passe en revanche par l'API Admin, seule capable
  // d'invalider les jetons déjà émis.
  if (req.query?.resource === 'sessions') {
    if (!supa) return res.status(503).json({ erreur: 'service_indisponible' });

    if (req.method === 'GET') {
      const { data, error } = await supa
        .from('user_sessions')
        .select('id, jeton, appareil, cree_le, vu_le')
        .eq('user_id', uid)
        .order('vu_le', { ascending: false });
      if (error) return res.status(500).json({ erreur: 'erreur_interne' });
      return res.status(200).json({ sessions: data ?? [] });
    }

    // Enregistrement / rafraîchissement de la session courante.
    if (req.method === 'POST') {
      const jeton = String(req.body?.jeton ?? '').slice(0, 64);
      if (!jeton) return res.status(400).json({ erreur: 'parametre_invalide', message: 'Jeton requis.' });
      const appareil = String(req.body?.appareil ?? 'Appareil inconnu').slice(0, 80);

      const { error } = await supa
        .from('user_sessions')
        .upsert({ user_id: uid, jeton, appareil, vu_le: new Date().toISOString() },
                { onConflict: 'user_id,jeton' });
      if (error) return res.status(500).json({ erreur: 'erreur_interne' });
      return res.status(200).json({ ok: true });
    }

    // Révocation globale. Firebase ne sait pas révoquer un appareil en
    // particulier : `revokeRefreshTokens` invalide tous les jetons du compte,
    // y compris celui de l'appareil courant. L'interface le dit explicitement.
    if (req.method === 'DELETE') {
      try {
        await getAdminAuth().revokeRefreshTokens(uid);
      } catch (e) {
        return res.status(500).json({ erreur: 'revocation_impossible', message: String(e?.message ?? e) });
      }
      await supa.from('user_sessions').delete().eq('user_id', uid);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erreur: 'methode_non_autorisee' });
  }

  // ── Préférences de compte (?resource=preferences) ─────────────────────────
  if (req.query?.resource === 'preferences') {
    if (!supa) return res.status(503).json({ erreur: 'service_indisponible' });

    if (req.method === 'GET') {
      const { data, error } = await supa
        .from('user_preferences')
        .select('notifications, reutilisation_conversations')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) return res.status(500).json({ erreur: 'erreur_interne' });
      // Absence de ligne = préférences par défaut, pas une erreur : la ligne
      // n'est créée qu'au premier réglage modifié.
      return res.status(200).json(data ?? {
        notifications: { defi_du_jour: true, relances: true, nouveautes: true },
        reutilisation_conversations: false,
      });
    }

    if (req.method === 'PUT') {
      const patch = { user_id: uid, maj_le: new Date().toISOString() };
      if (req.body?.notifications && typeof req.body.notifications === 'object') {
        // Liste blanche : un client modifié ne doit pas pouvoir écrire de
        // clés arbitraires dans la colonne jsonb.
        const n = req.body.notifications;
        patch.notifications = {
          defi_du_jour: n.defi_du_jour !== false,
          relances:     n.relances     !== false,
          nouveautes:   n.nouveautes   !== false,
        };
      }
      if (typeof req.body?.reutilisation_conversations === 'boolean') {
        patch.reutilisation_conversations = req.body.reutilisation_conversations;
      }

      const { error } = await supa.from('user_preferences').upsert(patch, { onConflict: 'user_id' });
      if (error) return res.status(500).json({ erreur: 'erreur_interne' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erreur: 'methode_non_autorisee' });
  }

  // ── Facturation (?resource=billing) ───────────────────────────────────────
  //
  // Renvoie une URL vers le portail client Stripe : factures téléchargeables,
  // moyen de paiement et résiliation immédiate. On ne réimplémente rien de
  // tout cela — un portail maison serait moins fiable sur les factures, qui
  // sont des pièces comptables.
  //
  // L'article L215-1-1 du code de la consommation impose depuis le 1er juin
  // 2023 que résilier un contrat souscrit en ligne soit possible en ligne,
  // par un moyen aussi simple que la souscription. Un lien direct depuis les
  // réglages satisfait cette exigence ; un formulaire de contact, non.
  if (req.query?.resource === 'billing') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'methode_non_autorisee' });
    if (!supa) return res.status(503).json({ erreur: 'service_indisponible' });

    const cle = process.env.STRIPE_SECRET_KEY;
    if (!cle) return res.status(503).json({ erreur: 'service_indisponible', message: 'Facturation non configurée.' });

    const { data: abo } = await supa
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', uid)
      .maybeSingle();

    if (!abo?.stripe_customer_id) {
      return res.status(404).json({
        erreur: 'aucun_client',
        message: "Aucun paiement n'est encore rattaché à ce compte.",
      });
    }

    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(cle);
      const retour = req.headers.origin
        ?? process.env.VITE_APP_URL
        ?? 'https://challenger-ia-chatbot.vercel.app';

      const portail = await stripe.billingPortal.sessions.create({
        customer: abo.stripe_customer_id,
        return_url: retour,
      });
      return res.status(200).json({ url: portail.url });
    } catch (e) {
      console.error('[account/billing]', e?.message ?? e);
      return res.status(502).json({
        erreur: 'portail_indisponible',
        message: "Le portail de facturation n'a pas pu être ouvert. Réessayez dans un instant.",
      });
    }
  }

  // ── Export (art. 15 et 20) ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const donnees = { exporteLe: new Date().toISOString(), identifiant: uid };
    try {
      if (dbAdmin) {
        const base = dbAdmin.collection('users').doc(uid);
        for (const sous of ['conversations', 'projects', 'meta']) {
          const snap = await base.collection(sous).get();
          donnees[sous] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        const partages = await dbAdmin.collection('shared').where('ownerId', '==', uid).get();
        donnees.partagesPublics = partages.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      if (supa) {
        donnees.donneesTransactionnelles = {};
        for (const table of TABLES_UTILISATEUR) {
          const { data } = await supa.from(table).select('*').eq('user_id', uid);
          donnees.donneesTransactionnelles[table] = data ?? [];
        }
      }
      res.setHeader('Content-Disposition',
        `attachment; filename="challenger-ia-donnees-${uid.slice(0, 8)}.json"`);
      return res.status(200).json(donnees);
    } catch (e) {
      return res.status(500).json({ error: "L'export a échoué", detail: String(e?.message ?? e) });
    }
  }

  // ── Effacement (art. 17) ──────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const bilan = { firestore: 0, partages: 0, tables: {}, compte: false };
    const erreurs = [];

    if (dbAdmin) {
      try {
        const base = dbAdmin.collection('users').doc(uid);
        for (const sous of ['conversations', 'projects', 'meta']) {
          bilan.firestore += await supprimerCollection(dbAdmin, base.collection(sous));
        }
        await base.delete().catch(() => {});

        // Les partages publics doivent disparaître avec le compte : ils sont
        // lisibles par quiconque détient le lien.
        const partages = await dbAdmin.collection('shared').where('ownerId', '==', uid).get();
        const lot = dbAdmin.batch();
        partages.docs.forEach((d) => lot.delete(d.ref));
        if (!partages.empty) await lot.commit();
        bilan.partages = partages.size;
      } catch (e) {
        erreurs.push(`firestore: ${e?.message ?? e}`);
      }
    }

    if (supa) {
      for (const table of TABLES_UTILISATEUR) {
        try {
          const { error } = await supa.from(table).delete().eq('user_id', uid);
          bilan.tables[table] = error ? `erreur: ${error.message}` : 'supprimé';
          if (error) erreurs.push(`${table}: ${error.message}`);
        } catch (e) {
          erreurs.push(`${table}: ${e?.message ?? e}`);
        }
      }
    }

    // En dernier : sans le compte, l'utilisateur ne pourrait plus relancer
    // l'opération si une étape précédente avait échoué.
    if (erreurs.length === 0) {
      try {
        await getAdminAuth().deleteUser(uid);
        bilan.compte = true;
      } catch (e) {
        erreurs.push(`auth: ${e?.message ?? e}`);
      }
    }

    if (erreurs.length) {
      return res.status(500).json({
        error: "L'effacement est incomplet. Le compte n'a pas été supprimé : "
             + 'vous pouvez relancer l\'opération ou contacter le support.',
        bilan, erreurs,
      });
    }
    return res.status(200).json({ ok: true, bilan });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
