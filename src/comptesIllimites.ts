/**
 * Comptes à crédits illimités — côté client.
 *
 * Doit rester cohérent avec `api/_lib/illimite.js` (le serveur fait autorité :
 * il n'applique aucun quota et ne décompte rien pour ces comptes). Côté client,
 * on court-circuite le blocage de quota et on affiche « illimité ».
 */

const COMPTES_ILLIMITES = new Set(['morgan.reichert@stariax.com']);

export function estCompteIllimite(email: string | null | undefined): boolean {
  if (!email) return false;
  return COMPTES_ILLIMITES.has(email.trim().toLowerCase());
}
