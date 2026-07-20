/**
 * Journal des versions.
 *
 * Tenu à la main : une génération automatique depuis les messages de commit
 * produirait une liste exacte mais illisible, alors que ce journal s'adresse
 * aux utilisateurs, pas aux développeurs.
 */
export type EntreeVersion = {
  version: string;
  date: string;          // AAAA-MM-JJ
  titre: string;
  changements: string[];
};

export const JOURNAL: EntreeVersion[] = [
  {
    version: '1.2.0',
    date: '2026-07-20',
    titre: 'Compte, sécurité et accessibilité',
    changements: [
      'Réglages réorganisés en sections et sous-sections, avec fil d’Ariane.',
      'Sécurité du compte : changement de mot de passe, vérification de l’adresse, appareils connectés et déconnexion globale.',
      'Facturation : accès direct aux factures, au moyen de paiement et à la résiliation.',
      'Accessibilité : taille du texte, contraste renforcé, réduction des animations.',
      'Notifications réglables par catégorie plutôt qu’en tout ou rien.',
      'Choix explicite sur la réutilisation des conversations.',
      'Un message peut être écrit et mis en attente pendant que l’IA répond.',
      'Pictogrammes uniformisés : les emojis, dont le rendu variait selon l’appareil, ont été remplacés par des icônes.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-07-18',
    titre: 'Personas, mémoire cognitive et conformité',
    changements: [
      'Quatre personas nettement différenciés, dont l’Arbitre qui conclut et tranche.',
      'Posture revue : reconnaissance rare et sincère plutôt que réserve systématique.',
      'Profil cognitif évolutif : rang, forces repérées et progression.',
      'Droits RGPD dans l’application : export complet, effacement, révocation des partages.',
      'Suggestions et défi du jour masquables depuis les réglages.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-24',
    titre: 'Première version publique',
    changements: [
      'Débat contradictoire avec trois niveaux de friction.',
      'Vérification factuelle avec sources citées.',
      'Bibliothèque de sessions, export PDF et Markdown.',
    ],
  },
];
