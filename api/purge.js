/**
 * Purge des données dont la durée de conservation est échue (RGPD art. 5.1.e).
 *
 * Déclenchée par une tâche planifiée hebdomadaire. Deux volets :
 *   Supabase  — via la procédure purge_donnees_expirees (voir supabase/rgpd.sql)
 *   Firestore — comptes anonymes inactifs depuis plus de six mois
 *
 * Les comptes anonymes sont traités ici parce qu'ils n'ont aucun moyen d'être
 * récupérés par leur titulaire : sans adresse électronique, un compte anonyme
 * abandonné ne peut ni être retrouvé ni faire l'objet d'une demande
 * d'effacement. Les conserver indéfiniment n'aurait donc aucune finalité.
 */
import { createClient } from '@supabase/supabase-js';
import { getAdminFirestore, getAdminAuth } from './_lib/admin.js';

const JOURS_INACTIVITE_ANONYME = 180;
const MAX_COMPTES_PAR_PASSAGE = 200; // borne le temps d'exécution de la fonction

export default async function handler(req, res) {
  const attendu = process.env.CRON_SECRET;
  const recu = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!attendu || recu !== attendu) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const bilan = { supabase: null, comptesAnonymesSupprimes: 0, erreurs: [] };

  // ── Volet Supabase ────────────────────────────────────────────────────────
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    try {
      const supa = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await supa.rpc('purge_donnees_expirees');
      if (error) bilan.erreurs.push(`supabase: ${error.message}`);
      else bilan.supabase = data;
    } catch (e) {
      bilan.erreurs.push(`supabase: ${e?.message ?? e}`);
    }
  }

  // ── Volet comptes anonymes inactifs ───────────────────────────────────────
  const auth = getAdminAuth();
  const dbAdmin = getAdminFirestore();
  if (auth && dbAdmin) {
    try {
      const limite = Date.now() - JOURS_INACTIVITE_ANONYME * 86400000;
      let pageToken;
      let traites = 0;

      do {
        const page = await auth.listUsers(1000, pageToken);
        pageToken = page.pageToken;

        for (const u of page.users) {
          if (traites >= MAX_COMPTES_PAR_PASSAGE) break;
          // Un compte anonyme n'a ni fournisseur d'identité ni adresse.
          const estAnonyme = !u.email && (u.providerData?.length ?? 0) === 0;
          if (!estAnonyme) continue;

          const derniere = Date.parse(u.metadata?.lastSignInTime || u.metadata?.creationTime || '');
          if (!derniere || derniere > limite) continue;

          const base = dbAdmin.collection('users').doc(u.uid);
          for (const sous of ['conversations', 'projects', 'meta']) {
            const snap = await base.collection(sous).limit(300).get();
            if (!snap.empty) {
              const lot = dbAdmin.batch();
              snap.docs.forEach((dd) => lot.delete(dd.ref));
              await lot.commit();
            }
          }
          await base.delete().catch(() => {});

          const partages = await dbAdmin.collection('shared').where('ownerId', '==', u.uid).get();
          if (!partages.empty) {
            const lot = dbAdmin.batch();
            partages.docs.forEach((dd) => lot.delete(dd.ref));
            await lot.commit();
          }

          await auth.deleteUser(u.uid);
          bilan.comptesAnonymesSupprimes++;
          traites++;
        }
        if (traites >= MAX_COMPTES_PAR_PASSAGE) break;
      } while (pageToken);
    } catch (e) {
      bilan.erreurs.push(`comptes anonymes: ${e?.message ?? e}`);
    }
  }

  return res.status(bilan.erreurs.length ? 207 : 200).json(bilan);
}
