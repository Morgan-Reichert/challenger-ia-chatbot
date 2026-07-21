/**
 * Comptes à crédits illimités — bypass de quota côté serveur.
 *
 * Certains comptes (propriétaire, comptes de démonstration) ne doivent jamais
 * être limités. Plutôt que de manipuler la base, on les liste ici : la
 * vérification a lieu AVANT `checkAndConsumeQuota`, donc aucun crédit n'est
 * décompté et l'appel est toujours autorisé.
 *
 * La liste est surchargeable via l'env `CHALLENGER_UNLIMITED_EMAILS`
 * (emails séparés par des virgules), en plus des valeurs par défaut ci-dessous.
 */

const DEFAUT = ['morgan.reichert@stariax.com'];

function liste() {
  const extra = (process.env.CHALLENGER_UNLIMITED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAUT.map((e) => e.toLowerCase()), ...extra]);
}

/** Vrai si l'email correspond à un compte à crédits illimités. */
export function estEmailIllimite(email) {
  if (!email) return false;
  return liste().has(String(email).trim().toLowerCase());
}
