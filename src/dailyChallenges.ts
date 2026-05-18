/**
 * dailyChallenges.ts — Défis quotidiens Challenger IA
 * Nouveau défi chaque jour, récompense +1 crédit après 3 messages.
 *
 * Source : `daily_challenges/{YYYY-MM-DD}` dans Firestore (généré chaque
 * semaine par api/generate-challenges.js). Fallback : la liste statique
 * ci-dessous (utilisée hors-ligne ou si le cron n'a pas tourné).
 */

import { db, FIREBASE_ENABLED, doc, getDoc } from './firebase';

export interface DailyChallenge {
  id: number;
  theme: string;
  title: string;
  prompt: string;
  difficulty: 'facile' | 'moyen' | 'difficile';
  persona: 'architect' | 'factchecker' | 'opponent';
}

export const DAILY_CHALLENGES: DailyChallenge[] = [
  { id: 1,  theme: '🧠 Philosophie', title: 'Le libre arbitre existe-t-il vraiment ?', prompt: "Le libre arbitre existe-t-il vraiment ou sommes-nous déterminés par nos gènes et notre environnement ?", difficulty: 'moyen', persona: 'architect' },
  { id: 2,  theme: '💡 Technologie', title: "L'IA remplacera-t-elle les médecins ?", prompt: "L'intelligence artificielle va remplacer les médecins d'ici 2040.", difficulty: 'difficile', persona: 'factchecker' },
  { id: 3,  theme: '🏛️ Politique', title: 'La démocratie directe est-elle viable ?', prompt: "La démocratie directe est supérieure à la démocratie représentative dans le monde moderne.", difficulty: 'moyen', persona: 'opponent' },
  { id: 4,  theme: '🌱 Écologie', title: 'Le véganisme est-il la solution ?', prompt: "Adopter le véganisme à l'échelle mondiale est la solution principale à la crise climatique.", difficulty: 'facile', persona: 'factchecker' },
  { id: 5,  theme: '💰 Économie', title: 'Le revenu universel est-il viable ?', prompt: "Le revenu universel de base est économiquement viable et socialement nécessaire.", difficulty: 'difficile', persona: 'architect' },
  { id: 6,  theme: '🎓 Éducation', title: "L'université est-elle encore nécessaire ?", prompt: "L'université traditionnelle sera rendue obsolète par les formations en ligne d'ici 2035.", difficulty: 'moyen', persona: 'opponent' },
  { id: 7,  theme: '🔬 Science', title: "La science peut-elle tout expliquer ?", prompt: "La méthode scientifique est le seul outil valide pour comprendre la réalité.", difficulty: 'difficile', persona: 'architect' },
  { id: 8,  theme: '🤝 Société', title: "Les réseaux sociaux détruisent-ils le débat ?", prompt: "Les réseaux sociaux appauvrissent le débat public et menacent la démocratie.", difficulty: 'facile', persona: 'factchecker' },
  { id: 9,  theme: '⚖️ Justice', title: "La prison est-elle efficace ?", prompt: "Le système carcéral actuel est un échec : il crée plus de criminalité qu'il n'en résout.", difficulty: 'moyen', persona: 'architect' },
  { id: 10, theme: '🚀 Futur', title: "L'humanité doit-elle coloniser Mars ?", prompt: "Coloniser Mars est une priorité pour la survie de l'humanité.", difficulty: 'facile', persona: 'opponent' },
  { id: 11, theme: '🎨 Culture', title: "L'art généré par IA est-il de l'art ?", prompt: "Les œuvres générées par intelligence artificielle ne peuvent pas être considérées comme de l'art véritable.", difficulty: 'moyen', persona: 'architect' },
  { id: 12, theme: '🧬 Bioéthique', title: "Doit-on éditer le génome humain ?", prompt: "L'édition génétique des embryons humains devrait être autorisée pour éliminer les maladies héréditaires.", difficulty: 'difficile', persona: 'factchecker' },
  { id: 13, theme: '💼 Travail', title: "La semaine de 4 jours est-elle l'avenir ?", prompt: "La semaine de travail de 4 jours devrait devenir la norme mondiale.", difficulty: 'facile', persona: 'opponent' },
  { id: 14, theme: '🌍 Mondialisation', title: "La mondialisation profite-t-elle à tous ?", prompt: "La mondialisation a globalement amélioré la condition humaine.", difficulty: 'moyen', persona: 'factchecker' },
  { id: 15, theme: '🔐 Vie privée', title: "La surveillance de masse est-elle justifiée ?", prompt: "La surveillance de masse est justifiée pour garantir la sécurité nationale.", difficulty: 'difficile', persona: 'architect' },
  { id: 16, theme: '🏥 Santé', title: "Faut-il rendre les vaccins obligatoires ?", prompt: "La vaccination obligatoire est une atteinte aux libertés individuelles.", difficulty: 'moyen', persona: 'opponent' },
  { id: 17, theme: '🧩 Cognition', title: "Nos biais cognitifs peuvent-ils être éliminés ?", prompt: "L'éducation peut éliminer les biais cognitifs et rendre la pensée vraiment rationnelle.", difficulty: 'difficile', persona: 'architect' },
  { id: 18, theme: '🚗 Mobilité', title: "La voiture individuelle doit-elle disparaître ?", prompt: "La voiture individuelle doit être bannie des villes d'ici 2030.", difficulty: 'facile', persona: 'factchecker' },
  { id: 19, theme: '🎮 Numérique', title: "Les jeux vidéo sont-ils violents ?", prompt: "Les jeux vidéo violents augmentent l'agressivité et la violence dans la société.", difficulty: 'facile', persona: 'factchecker' },
  { id: 20, theme: '📰 Médias', title: "Les fake news peuvent-elles être éliminées ?", prompt: "La régulation des plateformes numériques est le seul moyen de lutter efficacement contre les fake news.", difficulty: 'moyen', persona: 'architect' },
  { id: 21, theme: '🏦 Finance', title: "Les cryptomonnaies remplaceront-elles les banques ?", prompt: "Les cryptomonnaies vont rendre le système bancaire traditionnel obsolète.", difficulty: 'moyen', persona: 'opponent' },
  { id: 22, theme: '⚡ Énergie', title: "Le nucléaire est-il indispensable ?", prompt: "L'énergie nucléaire est indispensable à la transition écologique.", difficulty: 'difficile', persona: 'factchecker' },
  { id: 23, theme: '🌐 Internet', title: "Faut-il réguler internet ?", prompt: "Internet doit être gouverné par un organisme international pour prévenir les abus.", difficulty: 'moyen', persona: 'architect' },
  { id: 24, theme: '🤖 Robotique', title: "Les robots vont-ils créer du chômage ?", prompt: "L'automatisation et la robotique vont créer plus d'emplois qu'elles n'en détruiront.", difficulty: 'moyen', persona: 'opponent' },
  { id: 25, theme: '🧘 Bien-être', title: "Le bonheur peut-il s'apprendre ?", prompt: "Le bonheur est une compétence qui peut être développée par l'entraînement mental.", difficulty: 'facile', persona: 'architect' },
  { id: 26, theme: '🗣️ Langage', title: "Le langage détermine-t-il la pensée ?", prompt: "La langue que nous parlons détermine fondamentalement notre façon de penser.", difficulty: 'difficile', persona: 'architect' },
  { id: 27, theme: '🌿 Nature', title: "La nature a-t-elle des droits ?", prompt: "La nature devrait avoir des droits juridiques reconnus, au même titre que les personnes morales.", difficulty: 'moyen', persona: 'opponent' },
  { id: 28, theme: '🎯 Mérite', title: "La méritocratie est-elle un mythe ?", prompt: "La méritocratie est un mythe qui sert à légitimer les inégalités sociales.", difficulty: 'difficile', persona: 'factchecker' },
  { id: 29, theme: '🔭 Cosmos', title: "Sommes-nous seuls dans l'univers ?", prompt: "La probabilité qu'il existe une vie intelligente extraterrestre est proche de la certitude.", difficulty: 'facile', persona: 'architect' },
  { id: 30, theme: '⏳ Histoire', title: "L'Histoire se répète-t-elle ?", prompt: "L'histoire se répète parce que la nature humaine est fondamentalement immuable.", difficulty: 'moyen', persona: 'opponent' },
];

/**
 * Retourne le défi du jour basé sur le jour de l'année (fallback statique).
 */
export function getDailyChallenge(): DailyChallenge {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  return DAILY_CHALLENGES[dayOfYear % DAILY_CHALLENGES.length];
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Cache mémoire — évite de relire Firestore à chaque rendu.
let _cachedDay: string | null = null;
let _cachedChallenge: DailyChallenge | null = null;

/**
 * Lit le défi du jour depuis Firestore (généré par cron). Si indisponible
 * (cron pas encore exécuté, Firebase off, hors-ligne…), fallback statique.
 */
export async function fetchDailyChallenge(): Promise<DailyChallenge> {
  const day = todayISO();
  if (_cachedDay === day && _cachedChallenge) return _cachedChallenge;

  if (FIREBASE_ENABLED && db) {
    try {
      const snap = await getDoc(doc(db, 'daily_challenges', day));
      if (snap.exists()) {
        const data = snap.data() as Partial<DailyChallenge>;
        const challenge: DailyChallenge = {
          id: 0,
          theme: data.theme ?? '🧠 Défi',
          title: data.title ?? 'Défi du jour',
          prompt: data.prompt ?? '',
          difficulty: (['facile', 'moyen', 'difficile'] as const).includes(data.difficulty as 'facile')
            ? (data.difficulty as DailyChallenge['difficulty'])
            : 'moyen',
          persona: (['architect', 'factchecker', 'opponent'] as const).includes(data.persona as 'architect')
            ? (data.persona as DailyChallenge['persona'])
            : 'architect',
        };
        _cachedDay = day;
        _cachedChallenge = challenge;
        return challenge;
      }
    } catch {
      // ignore — fallback statique
    }
  }

  const fallback = getDailyChallenge();
  _cachedDay = day;
  _cachedChallenge = fallback;
  return fallback;
}

/**
 * Retourne la clé localStorage pour suivre la progression du défi quotidien
 */
export function getChallengeKey(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `cia_challenge_${today}`;
}

/**
 * Lit le nombre de messages envoyés dans le défi du jour
 */
export function getChallengeProgress(): number {
  try {
    return parseInt(localStorage.getItem(getChallengeKey()) ?? '0', 10);
  } catch {
    return 0;
  }
}

/**
 * Incrémente la progression du défi
 */
export function incrementChallengeProgress(): number {
  try {
    const key = getChallengeKey();
    const current = parseInt(localStorage.getItem(key) ?? '0', 10);
    const next = current + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return 0;
  }
}
