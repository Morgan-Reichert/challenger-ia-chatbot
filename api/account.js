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

// Tables Supabase indexées sur l'utilisateur, à purger intégralement.
const TABLES_UTILISATEUR = [
  'user_credits',
  'subscriptions',
  'chat_usage',
  'daily_rewards',
  'user_contacts',
  'push_subscriptions',
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
