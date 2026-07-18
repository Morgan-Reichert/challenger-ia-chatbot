/**
 * Firebase Admin SDK — vérification des ID tokens côté serveur.
 *
 * Variables d'env attendues (sinon le module passe en mode "skipped" et
 * n'applique aucune vérif — utile en local sans config) :
 *  - FIREBASE_ADMIN_PROJECT_ID
 *  - FIREBASE_ADMIN_CLIENT_EMAIL
 *  - FIREBASE_ADMIN_PRIVATE_KEY  (les \n doivent être encodés "\\n" dans Vercel)
 */
import admin from 'firebase-admin';

let _ready = false;

function ensureInit() {
  if (_ready) return true;
  const { FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } = process.env;
  if (!FIREBASE_ADMIN_PROJECT_ID || !FIREBASE_ADMIN_CLIENT_EMAIL || !FIREBASE_ADMIN_PRIVATE_KEY) {
    return false;
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  _ready = true;
  return true;
}

/**
 * Lit l'en-tête `Authorization: Bearer <idToken>` et le vérifie.
 * Retourne `{ uid, skipped }` :
 *  - skipped:true si Admin SDK non configuré (pas de garde-fou)
 *  - uid:null + error si token manquant/invalide
 */
export async function verifyIdToken(req) {
  if (!ensureInit()) return { uid: null, skipped: true };
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return { uid: null, error: 'missing_token' };
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    // `email` est ajouté en plus de `uid` (ajout rétro-compatible) : STARIAX
    // rapproche ses bêta-testeurs sur l'UID **ou** l'email, car côté admin on
    // les inscrit naturellement par email.
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return { uid: null, error: 'invalid_token' };
  }
}

export function isAuthEnforced() {
  return ensureInit();
}

/**
 * Retourne l'instance Firestore admin (lecture/écriture bypass des rules) ou
 * null si Admin SDK non configuré.
 */
export function getAdminFirestore() {
  if (!ensureInit()) return null;
  return admin.firestore();
}

/**
 * Retourne l'instance Auth admin (génération de liens de réinitialisation, etc.)
 * ou null si Admin SDK non configuré.
 */
export function getAdminAuth() {
  if (!ensureInit()) return null;
  return admin.auth();
}
