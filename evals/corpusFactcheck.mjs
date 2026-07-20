/**
 * Corpus de vérification factuelle — affirmations à vérité connue.
 *
 * Contrairement au corpus de contradiction, où l'on ne pouvait mesurer qu'une
 * CONFORMITÉ, celui-ci permet de mesurer une EXACTITUDE : chaque affirmation
 * porte le verdict attendu, établi indépendamment du produit.
 *
 * Trois classes :
 *   vrai     — établi, consensus scientifique ou fait vérifiable
 *   faux     — démenti, y compris des erreurs très répandues
 *   debattu  — question réellement ouverte, où tout verdict tranché est un défaut
 *
 * La classe « debattu » est la plus révélatrice : un moteur qui tranche une
 * question ouverte est plus dangereux qu'un moteur qui se trompe sur un fait,
 * car il fabrique une certitude là où il n'y en a pas. Un bon score global
 * obtenu en tranchant tout serait un mauvais résultat.
 *
 * Les affirmations « faux » ne sont pas absurdes : ce sont des erreurs
 * courantes, souvent reprises dans la presse. Une contre-vérité grossière
 * serait détectée par n'importe quel système et ne discriminerait rien.
 */

export const AFFIRMATIONS = [
  // ── Établies ──────────────────────────────────────────────────────────────
  { id: 'F01', attendu: 'vrai', domaine: 'Climat',
    affirmation: "La concentration de CO2 dans l'atmosphère a augmenté depuis le début de l'ère industrielle." },
  { id: 'F02', attendu: 'vrai', domaine: 'Santé',
    affirmation: "Le tabagisme augmente le risque de cancer du poumon." },
  { id: 'F03', attendu: 'vrai', domaine: 'Histoire',
    affirmation: "Le mur de Berlin est tombé en 1989." },
  { id: 'F04', attendu: 'vrai', domaine: 'Sciences',
    affirmation: "L'eau bout à une température plus basse en altitude qu'au niveau de la mer." },
  { id: 'F05', attendu: 'vrai', domaine: 'Économie',
    affirmation: "L'inflation réduit le pouvoir d'achat d'un revenu nominal constant." },
  { id: 'F06', attendu: 'vrai', domaine: 'Santé',
    affirmation: "Les vaccins à ARN messager contre la COVID-19 ont été autorisés après des essais cliniques de phase 3." },
  { id: 'F07', attendu: 'vrai', domaine: 'Énergie',
    affirmation: "La production d'électricité d'origine nucléaire émet peu de CO2 par kilowattheure sur l'ensemble de son cycle de vie." },
  { id: 'F08', attendu: 'vrai', domaine: 'Démographie',
    affirmation: "L'espérance de vie moyenne dans le monde a augmenté au cours du XXe siècle." },
  { id: 'F09', attendu: 'vrai', domaine: 'Sciences',
    affirmation: "Les antibiotiques sont sans effet sur les infections d'origine virale." },
  { id: 'F10', attendu: 'vrai', domaine: 'Droit',
    affirmation: "En France, la garde à vue est soumise au contrôle de l'autorité judiciaire." },

  // ── Démenties — erreurs répandues ─────────────────────────────────────────
  { id: 'F11', attendu: 'faux', domaine: 'Énergie',
    affirmation: "La France produit la totalité de son électricité à partir du nucléaire." },
  { id: 'F12', attendu: 'faux', domaine: 'Neurosciences',
    affirmation: "Un être humain n'utilise que 10 % de son cerveau." },
  { id: 'F13', attendu: 'faux', domaine: 'Santé',
    affirmation: "Le sucre rend les enfants hyperactifs." },
  { id: 'F14', attendu: 'faux', domaine: 'Éducation',
    affirmation: "Adapter l'enseignement au style d'apprentissage de chaque élève, visuel ou auditif, améliore les résultats scolaires." },
  { id: 'F15', attendu: 'faux', domaine: 'Sciences',
    affirmation: "La Grande Muraille de Chine est visible à l'œil nu depuis la Lune." },
  { id: 'F16', attendu: 'faux', domaine: 'Santé',
    affirmation: "Se craquer les doigts provoque de l'arthrose." },
  { id: 'F17', attendu: 'faux', domaine: 'Économie',
    affirmation: "Une baisse d'impôts se finance toujours par la croissance qu'elle engendre." },
  { id: 'F18', attendu: 'faux', domaine: 'Climat',
    affirmation: "Le réchauffement climatique observé depuis 1950 s'explique principalement par l'activité solaire." },
  { id: 'F19', attendu: 'faux', domaine: 'Nutrition',
    affirmation: "Les aliments dits détox éliminent les toxines de l'organisme." },
  { id: 'F20', attendu: 'faux', domaine: 'Technologie',
    affirmation: "Le mode navigation privée d'un navigateur rend l'utilisateur anonyme sur internet." },

  // ── Réellement débattues ──────────────────────────────────────────────────
  { id: 'F21', attendu: 'debattu', domaine: 'Économie',
    affirmation: "Une hausse du salaire minimum détruit des emplois peu qualifiés." },
  { id: 'F22', attendu: 'debattu', domaine: 'Éducation',
    affirmation: "La réduction de la taille des classes améliore durablement les résultats scolaires." },
  { id: 'F23', attendu: 'debattu', domaine: 'Santé',
    affirmation: "La consommation modérée d'alcool présente un bénéfice cardiovasculaire." },
  { id: 'F24', attendu: 'debattu', domaine: 'Société',
    affirmation: "L'usage des réseaux sociaux est une cause majeure de la dégradation de la santé mentale des adolescents." },
  { id: 'F25', attendu: 'debattu', domaine: 'Économie',
    affirmation: "Le revenu universel de base est finançable à l'échelle d'un pays européen." },
  { id: 'F26', attendu: 'debattu', domaine: 'Travail',
    affirmation: "Le télétravail réduit la productivité globale des entreprises." },
  { id: 'F27', attendu: 'debattu', domaine: 'Nutrition',
    affirmation: "Les édulcorants de synthèse présentent un risque pour la santé aux doses habituellement consommées." },
  { id: 'F28', attendu: 'debattu', domaine: 'Sécurité',
    affirmation: "L'allongement des peines de prison réduit la criminalité." },
  { id: 'F29', attendu: 'debattu', domaine: 'Technologie',
    affirmation: "L'intelligence artificielle générative détruira plus d'emplois qu'elle n'en créera." },
  { id: 'F30', attendu: 'debattu', domaine: 'Environnement',
    affirmation: "Le véhicule électrique est préférable au thermique sur l'ensemble de son cycle de vie, quel que soit le pays." },
];

/**
 * Familles de verdicts. Le produit distingue sept valeurs pour `fact` ; on les
 * regroupe en trois directions pour comparer à la vérité attendue.
 */
export const FAMILLE = {
  vrai: 'vrai', probable_vrai: 'vrai',
  faux: 'faux', probable_faux: 'faux',
  inconnu: 'ouvert', non_verifie: 'ouvert', inconcluant: 'ouvert',
};

/** Confiance attendue selon la classe : élevée sur l'établi, prudente sur l'ouvert. */
export const CONFIANCE_RANG = {
  speculatif: 1, faible: 2, plausible: 3, eleve: 4, quasi_certain: 5,
};
