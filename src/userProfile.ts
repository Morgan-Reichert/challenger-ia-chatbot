// ─── User Profile — Local Storage ─────────────────────────────────────────────

export type NeuroTag =
  | 'TDAH'
  | 'HPI'
  | 'Autisme TSA'
  | 'Dyslexie'
  | 'Dyscalculie'
  | 'Dyspraxie'
  | 'Hypersensibilité'
  | 'Zèbre'
  | 'Autre';

export const NEURO_TAGS: NeuroTag[] = [
  'TDAH', 'HPI', 'Autisme TSA', 'Dyslexie',
  'Dyscalculie', 'Dyspraxie', 'Hypersensibilité', 'Zèbre', 'Autre',
];

export const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const;
export type MBTIType = (typeof MBTI_TYPES)[number];

export type BigFiveResult = {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
};

export type UserProfile = {
  version: 1;
  updatedAt: string;
  // Identité
  displayName: string;
  background: string;
  // Professionnel
  linkedin: string;
  cvText: string;
  cvFileName: string;
  // Personnalité
  personalityNotes: string;
  mbti: string;
  bigFive: BigFiveResult | null;
  // Neuro — DONNÉES DE SANTÉ (RGPD art. 9) : traitement interdit sauf
  // consentement explicite et spécifique (art. 9.2.a). `healthDataConsent`
  // porte ce consentement ; sans lui, ces champs ne sont JAMAIS transmis au
  // modèle de langage.
  healthDataConsent: boolean;
  healthConsentAt: string;
  neuroTags: NeuroTag[];
  neuroNotes: string;
  // Intérêts
  interests: string[];
  interestNotes: string;
};

export const EMPTY_PROFILE: UserProfile = {
  version: 1,
  updatedAt: new Date().toISOString(),
  displayName: '',
  background: '',
  linkedin: '',
  cvText: '',
  cvFileName: '',
  personalityNotes: '',
  mbti: '',
  bigFive: null,
  healthDataConsent: false,
  healthConsentAt: '',
  neuroTags: [],
  neuroNotes: '',
  interests: [],
  interestNotes: '',
};

const STORAGE_KEY = 'challenger_user_profile';

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_PROFILE, updatedAt: new Date().toISOString() };
    return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_PROFILE, updatedAt: new Date().toISOString() };
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }));
}

export function exportProfile(profile: UserProfile): void {
  const payload = JSON.stringify({ _app: 'Challenger IA', _version: 1, ...profile, updatedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `challenger-profile-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importProfileFromJson(json: string): UserProfile {
  const data = JSON.parse(json);
  if (data.version !== 1) throw new Error('Format incompatible (version incorrecte)');
  return { ...EMPTY_PROFILE, ...data, version: 1 };
}

// ─── Build profile context for AI system prompts ──────────────────────────────

export function buildProfileContext(profile: UserProfile): string {
  const lines: string[] = [];

  if (profile.displayName) lines.push(`Prénom / Nom : ${profile.displayName}`);
  if (profile.background) lines.push(`Parcours personnel et professionnel : ${profile.background}`);
  if (profile.linkedin) lines.push(`Profil LinkedIn / présence en ligne : ${profile.linkedin}`);
  if (profile.cvText) {
    const excerpt = profile.cvText.slice(0, 1200);
    lines.push(`CV (extrait) :\n${excerpt}${profile.cvText.length > 1200 ? '\n[…]' : ''}`);
  }
  if (profile.mbti) lines.push(`Type MBTI : ${profile.mbti}`);
  if (profile.bigFive) {
    const bf = profile.bigFive;
    lines.push(
      `Profil Big Five — Ouverture ${bf.openness}/10 · Conscience ${bf.conscientiousness}/10 · ` +
      `Extraversion ${bf.extraversion}/10 · Agréabilité ${bf.agreeableness}/10 · Neuroticisme ${bf.neuroticism}/10`
    );
  }
  if (profile.personalityNotes) lines.push(`Personnalité (notes libres) : ${profile.personalityNotes}`);
  // Données de santé : transmises au modèle UNIQUEMENT si l'utilisateur y a
  // consenti explicitement. Le consentement est révocable à tout moment.
  if (profile.healthDataConsent) {
    if (profile.neuroTags.length > 0) lines.push(`Profil neuro-atypique : ${profile.neuroTags.join(', ')}`);
    if (profile.neuroNotes) lines.push(`Notes neuro : ${profile.neuroNotes}`);
  }
  if (profile.interests.length > 0) lines.push(`Centres d'intérêt : ${profile.interests.join(', ')}`);
  if (profile.interestNotes) lines.push(`Détail intérêts : ${profile.interestNotes}`);

  if (lines.length === 0) return '';
  return (
    `## Profil de l'utilisateur\n` +
    `Utilise ces informations de façon subtile et bienveillante :\n` +
    `- Seulement quand c'est pertinent pour la session en cours — pas de façon systématique.\n` +
    `- Pour aider, guider et améliorer les pratiques de l'utilisateur, jamais pour le juger ou le rabaisser.\n` +
    `- Pour personnaliser tes exemples, ton niveau de langage ou tes conseils à son profil.\n` +
    `- Ne cite jamais explicitement ces données sauf si l'utilisateur t'y invite.\n` +
    lines.join('\n')
  );
}

export function isProfileFilled(profile: UserProfile): boolean {
  return !!(
    profile.displayName || profile.background || profile.linkedin ||
    profile.cvText || profile.mbti || profile.bigFive ||
    profile.personalityNotes || profile.neuroTags.length > 0 ||
    profile.interests.length > 0
  );
}
