/**
 * Consentement aux traceurs non essentiels (mesure d'audience, remontée
 * d'erreurs) — article 82 de la loi Informatique et Libertés, article 6.1.a RGPD.
 *
 * Principe : rien de non essentiel ne démarre tant que l'utilisateur n'a pas
 * choisi. L'absence de réponse vaut refus — le consentement ne peut être
 * déduit du silence ni d'une case pré-cochée.
 */
const CLE = 'cia_consent_v1';

export type Consentement = {
  mesure: boolean;      // audience et remontée d'erreurs
  decideLe: string;     // horodatage de la décision, valant preuve
};

type Abonne = () => void;
const abonnes = new Set<Abonne>();

export function lireConsentement(): Consentement | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const c = JSON.parse(brut) as Consentement;
    return typeof c?.mesure === 'boolean' ? c : null;
  } catch {
    return null;
  }
}

/** Vrai uniquement si l'utilisateur a explicitement accepté. */
export function mesureAutorisee(): boolean {
  return lireConsentement()?.mesure === true;
}

/** L'utilisateur n'a pas encore répondu : la bannière doit être affichée. */
export function decisionAttendue(): boolean {
  return lireConsentement() === null;
}

export function enregistrerConsentement(mesure: boolean): void {
  const c: Consentement = { mesure, decideLe: new Date().toISOString() };
  try {
    localStorage.setItem(CLE, JSON.stringify(c));
  } catch { /* stockage indisponible : la décision vaut pour la session */ }
  abonnes.forEach((f) => f());
}

/** Permet de revenir sur son choix — le retrait doit être aussi simple que l'accord. */
export function reinitialiserConsentement(): void {
  try { localStorage.removeItem(CLE); } catch { /* ignoré */ }
  abonnes.forEach((f) => f());
}

export function surChangementConsentement(cb: Abonne): () => void {
  abonnes.add(cb);
  return () => abonnes.delete(cb);
}
