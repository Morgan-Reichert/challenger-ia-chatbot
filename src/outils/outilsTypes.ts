// ─── Types for "Nos Outils Partenaires" portal ──────────────────────────────

export type OutilId = 'journalisme' | 'education' | 'sante';

export type OutilStatus = 'available' | 'coming_soon';

export interface OutilConfig {
  id: OutilId;
  name: string;
  tagline: string;
  description: string;
  accentColor: string;
  bgColor: string;
  icon: string;
  status: OutilStatus;
  features: string[];
  category: string;
  price: string; // display price
}

export const OUTILS_LIST: OutilConfig[] = [
  {
    id: 'journalisme',
    name: 'Challenger Reporter',
    tagline: 'L\'IA qui traque les biais et vérifie les faits',
    description: 'Suite complète pour les journalistes et communicants : vérification des faits, détection de biais, analyse de sources, préparation d\'interviews, décryptage de communiqués de presse, détecteur de spin et critique de rédaction.',
    accentColor: '#E85D04',
    bgColor: 'rgba(232,93,4,0.06)',
    icon: '📰',
    status: 'available',
    category: 'Médias & Communication',
    price: '9€/mois',
    features: [
      'Fact-checking en temps réel',
      'Détection de biais médiatiques',
      'Analyse de sources & fiabilité',
      'Préparation d\'interviews journalistiques',
      'Décryptage de communiqués de presse',
      'Détecteur de spin & propagande',
      'Critique de rédaction & style',
      'Angle story finder',
    ],
  },
  {
    id: 'education',
    name: 'Challenger Éducation',
    tagline: 'L\'IA pédagogue qui ne mâche pas ses mots',
    description: 'Conçu pour les enseignants, formateurs et apprenants exigeants. Détecte les lacunes, challenge les raisonnements, adapte le niveau et forge une pensée critique durable.',
    accentColor: '#7C3AED',
    bgColor: 'rgba(124,58,237,0.06)',
    icon: '🎓',
    status: 'coming_soon',
    category: 'Éducation & Formation',
    price: '7€/mois',
    features: [
      'Détection des lacunes de raisonnement',
      'Exercices Socratiques adaptatifs',
      'Évaluation critique de dissertations',
      'Explications multi-niveaux',
      'Générateur de cas pratiques',
    ],
  },
  {
    id: 'sante',
    name: 'Challenger Santé',
    tagline: 'L\'IA qui démêle le vrai du faux médical',
    description: 'Pour les professionnels de santé et patients informés. Analyse critique des études, détection des fake news médicales, aide à la décision basée sur les preuves.',
    accentColor: '#059669',
    bgColor: 'rgba(5,150,105,0.06)',
    icon: '⚕️',
    status: 'coming_soon',
    category: 'Santé & Sciences',
    price: '9€/mois',
    features: [
      'Analyse critique d\'études médicales',
      'Détection de désinformation santé',
      'Aide à la décision EBM',
      'Vulgarisation scientifique rigoureuse',
    ],
  },
];

export const OUTILS_MAP = Object.fromEntries(
  OUTILS_LIST.map(o => [o.id, o])
) as Record<OutilId, OutilConfig>;
