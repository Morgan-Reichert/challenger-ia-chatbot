/**
 * Contexte de partage — pont entre le composant Verdict (enfoui dans le rendu
 * des messages) et l'état de l'app (conversation courante, pseudo).
 *
 * Le bouton « Partager » d'un verdict peut soit partager le verdict seul (QR
 * vers le site vitrine), soit partager la conversation complète (QR vers le lien
 * de consultation + appel à l'action personnalisé). Ces deux options ont besoin
 * d'infos que VizBlocks n'a pas ; plutôt qu'un prop-drilling à travers tout le
 * rendu markdown, App enregistre ici de quoi les fournir à la demande.
 */

export type ShareContext = {
  /** Pseudo de l'utilisateur (userProfile.displayName), pour l'appel à l'action. */
  pseudo: string;
  /** Vrai si une conversation partageable est active (connecté + messages). */
  peutPartagerConversation: boolean;
  /** Crée (ou récupère) le lien public de consultation de la conversation courante. */
  creerLienConversation: () => Promise<string | null>;
};

// URL du site vitrine Challenger IA (QR par défaut sur la carte Verdict).
// ⚠️ À ajuster ici si le domaine change.
export const VITRINE_URL = 'https://challengeria.fr';

let _ctx: ShareContext | null = null;

export function setShareContext(c: ShareContext | null): void {
  _ctx = c;
}

export function getShareContext(): ShareContext | null {
  return _ctx;
}
