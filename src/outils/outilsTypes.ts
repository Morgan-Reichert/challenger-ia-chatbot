// ─── Types for "Nos Outils Partenaires" portal ──────────────────────────────

export type OutilId = 'journalisme' | 'education' | 'sante' | 'politique' | 'entreprise' | 'contenu';

export type OutilStatus = 'available' | 'coming_soon';

export interface OutilConfig {
  id: OutilId;
  name: string;
  tagline: string;
  description: string;
  accentColor: string;
  bgColor: string;
  logoSrc: string; // path to PNG logo in /public/logos/
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
    logoSrc: '/logos/reporter.png',
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
    accentColor: '#0AADBB',
    bgColor: 'rgba(10,173,187,0.06)',
    logoSrc: '/logos/education.png',
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
    id: 'politique',
    name: 'Challenger Politique',
    tagline: 'L\'IA qui décrypte le pouvoir sans filtre',
    description: 'Pour les citoyens éclairés, militants et analystes politiques. Décryptage des discours, détection des contradictions, analyse des programmes, veille électorale et fact-checking politique.',
    accentColor: '#8FB339',
    bgColor: 'rgba(143,179,57,0.06)',
    logoSrc: '/logos/politique.png',
    status: 'coming_soon',
    category: 'Politique & Société',
    price: '9€/mois',
    features: [
      'Analyse de discours politiques',
      'Détection des contradictions & revirements',
      'Fact-checking des programmes',
      'Comparateur de positions partisanes',
      'Veille électorale & sondages',
    ],
  },
  {
    id: 'sante',
    name: 'Challenger Santé',
    tagline: 'L\'IA qui démêle le vrai du faux médical',
    description: 'Pour les professionnels de santé et patients informés. Analyse critique des études, détection des fake news médicales, aide à la décision basée sur les preuves.',
    accentColor: '#E53E3E',
    bgColor: 'rgba(229,62,62,0.06)',
    logoSrc: '/logos/sante.png',
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
  {
    id: 'entreprise',
    name: 'Challenger Entreprise',
    tagline: 'L\'IA qui challenge vos décisions business',
    description: 'Pour les entrepreneurs, managers et investisseurs exigeants. Analyse de business plans, audit stratégique, détection des angles morts, préparation aux objections et aide à la décision.',
    accentColor: '#6B7FD4',
    bgColor: 'rgba(107,127,212,0.06)',
    logoSrc: '/logos/entreprise.png',
    status: 'coming_soon',
    category: 'Entreprise & Gestion',
    price: '12€/mois',
    features: [
      'Audit de business plan & stratégie',
      'Détection des angles morts décisionnels',
      'Préparation aux objections investisseurs',
      'Analyse concurrentielle critique',
      'Aide à la décision financière',
    ],
  },
  {
    id: 'contenu',
    name: 'Challenger Contenu',
    tagline: 'L\'IA qui rend votre contenu inarrêtable',
    description: 'Pour les créateurs de contenu, community managers et marketeurs. Optimisation éditoriale, analyse d\'engagement, détection des tendances et critique de stratégie de contenu.',
    accentColor: '#7C3AED',
    bgColor: 'rgba(124,58,237,0.06)',
    logoSrc: '/logos/contenu.png',
    status: 'coming_soon',
    category: 'Création de Contenu',
    price: '9€/mois',
    features: [
      'Optimisation éditoriale & SEO critique',
      'Analyse d\'engagement & performance',
      'Détection des tendances virales',
      'Critique de stratégie de contenu',
      'Générateur d\'hooks et d\'angles',
    ],
  },
];

export const OUTILS_MAP = Object.fromEntries(
  OUTILS_LIST.map(o => [o.id, o])
) as Record<OutilId, OutilConfig>;
