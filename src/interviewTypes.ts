// ─── Interview Types — Bibliothèque d'entraînements ──────────────────────────

import type { LucideIcon } from 'lucide-react';
import { Mic2, Briefcase, BookOpen, Monitor, TrendingUp, Sparkles } from 'lucide-react';

export type InterviewTypeId =
  | 'podcast'
  | 'job_interview'
  | 'academic_oral'
  | 'presentation'
  | 'pitch'
  | 'other';

export type InterviewField = {
  id: string;
  label: string;
  placeholder: string;
  maxLength: number;
  multiline?: boolean;
};

export type InterviewTypeConfig = {
  id: InterviewTypeId;
  label: string;
  description: string;
  icon: LucideIcon;
  interviewerRole: string;
  accentColor: string;
  bgColor: string;
  fields: InterviewField[];
  buildSystemPrompt: (context: string, currentDate: string) => string;
};

// ─── Règles communes ──────────────────────────────────────────────────────────

const INTERVIEW_RULES = `
## Règles impératives
- Tu poses UNE question à la fois. Jamais deux d'affilée.
- Tes interventions font 1 à 4 phrases maximum.
- Tu rebondis naturellement sur les réponses — tu ne lis pas un script.
- Tu peux challenger, approfondir, ou changer de sujet selon le déroulé.
- Tu restes dans ton rôle d'interlocuteur, pas celui du candidat.
- Ne révèle JAMAIS que tu es une IA. Si on te le demande, esquive en restant dans le personnage.
- Pas de markdown, pas de tirets, pas de listes structurées.
- Tu commences par te présenter très brièvement et poser ta PREMIÈRE question.`;

// ═══════════════════════════════════════════════════════════════════════════
// PODCAST & MÉDIAS
// ═══════════════════════════════════════════════════════════════════════════

const podcast: InterviewTypeConfig = {
  id: 'podcast',
  label: 'Podcast & Médias',
  description: 'Prépare-toi à une interview, un podcast, un passage radio ou TV.',
  icon: Mic2,
  interviewerRole: "L'Animateur",
  accentColor: '#F59E0B',
  bgColor: '#0D0800',
  fields: [
    {
      id: 'topic',
      label: 'Sujet du podcast / interview',
      placeholder: "Ex : mon livre, mon parcours entrepreneurial, l'IA en éducation…",
      maxLength: 200,
    },
    {
      id: 'role',
      label: 'Ton rôle',
      placeholder: 'Ex : invité expert, auteur, fondateur de startup…',
      maxLength: 100,
    },
    {
      id: 'themes',
      label: 'Thèmes à aborder',
      placeholder: "Ex : mon histoire, les défis rencontrés, mes conseils pour les débutants…",
      maxLength: 300,
      multiline: true,
    },
    {
      id: 'expertise',
      label: 'Ton expertise / background',
      placeholder: '10 ans dans la tech, ex-Google, auteur de 3 livres…',
      maxLength: 200,
    },
  ],
  buildSystemPrompt: (context, currentDate) =>
    `Tu es L'Animateur, un journaliste et animateur de podcast professionnel et curieux.
Date : ${currentDate}

Contexte de la session :
${context}

Tu interviewes un invité sur les sujets mentionnés. Ton style est chaleureux, incisif — tu sais creuser les réponses intéressantes avec de bonnes relances. Tu es à l'aise avec le silence et tu n'as pas peur d'aller en profondeur.
${INTERVIEW_RULES}`,
};

// ═══════════════════════════════════════════════════════════════════════════
// ENTRETIEN D'EMBAUCHE
// ═══════════════════════════════════════════════════════════════════════════

const job_interview: InterviewTypeConfig = {
  id: 'job_interview',
  label: "Entretien d'embauche",
  description: 'Entraîne-toi à un entretien RH, technique ou managérial.',
  icon: Briefcase,
  interviewerRole: 'Le Recruteur',
  accentColor: '#3B82F6',
  bgColor: '#020C18',
  fields: [
    {
      id: 'position',
      label: 'Poste visé',
      placeholder: 'Ex : Développeur Full-Stack Senior, Chef de Projet Marketing…',
      maxLength: 150,
    },
    {
      id: 'company',
      label: 'Entreprise / Secteur',
      placeholder: 'Ex : Google, une startup fintech, le secteur hospitalier…',
      maxLength: 150,
    },
    {
      id: 'background',
      label: 'Ton parcours (en résumé)',
      placeholder: "Ex : 5 ans en développement React, ancien responsable d'équipe chez X…",
      maxLength: 300,
      multiline: true,
    },
    {
      id: 'strengths',
      label: 'Points forts à valoriser',
      placeholder: 'Ex : leadership, gestion de crise, compétences techniques en Python…',
      maxLength: 200,
    },
  ],
  buildSystemPrompt: (context, currentDate) =>
    `Tu es Le Recruteur, un DRH ou responsable recrutement expérimenté.
Date : ${currentDate}

Contexte de l'entretien :
${context}

Tu conduis un entretien d'embauche. Tu évalues les compétences techniques ET comportementales. Tu utilises les questions STAR (Situation, Tâche, Action, Résultat) quand pertinent. Tu es professionnel mais pas froid — tu cherches à connaître la personne. Tu relances sur les réponses vagues.
${INTERVIEW_RULES}`,
};

// ═══════════════════════════════════════════════════════════════════════════
// EXAMEN ORAL
// ═══════════════════════════════════════════════════════════════════════════

const academic_oral: InterviewTypeConfig = {
  id: 'academic_oral',
  label: 'Examen oral',
  description: "Prépare-toi à un oral académique — partiel, soutenance, concours.",
  icon: BookOpen,
  interviewerRole: 'Le Jury',
  accentColor: '#10B981',
  bgColor: '#011208',
  fields: [
    {
      id: 'subject',
      label: 'Matière / Discipline',
      placeholder: 'Ex : Droit constitutionnel, Économétrie, Histoire médiévale…',
      maxLength: 150,
    },
    {
      id: 'level',
      label: "Niveau et type d'examen",
      placeholder: "Ex : Master 2 — Soutenance de mémoire, Concours Magistrature, Agrégation…",
      maxLength: 150,
    },
    {
      id: 'topic',
      label: 'Sujet / Thème central',
      placeholder: "Ex : La responsabilité de l'État en droit administratif français…",
      maxLength: 300,
      multiline: true,
    },
    {
      id: 'arguments',
      label: 'Tes arguments / thèses clés',
      placeholder: 'Ex : Je défends que X parce que Y, mon plan en 3 parties…',
      maxLength: 300,
      multiline: true,
    },
  ],
  buildSystemPrompt: (context, currentDate) =>
    `Tu es Le Jury, un membre du jury académique rigoureux et exigeant.
Date : ${currentDate}

Contexte de l'examen :
${context}

Tu conduis un oral académique. Tu évalues la maîtrise du sujet, la rigueur argumentative et la clarté d'expression. Tu poses des questions précises sur les fondements, les exceptions, les limites. Tu peux challenger les positions du candidat avec des contre-arguments. Tu couvres différents angles du sujet et tu n'hésites pas à déstabiliser.
${INTERVIEW_RULES}`,
};

// ═══════════════════════════════════════════════════════════════════════════
// PRÉSENTATION
// ═══════════════════════════════════════════════════════════════════════════

const presentation: InterviewTypeConfig = {
  id: 'presentation',
  label: 'Présentation',
  description: "Entraîne-toi face à un public ou un comité d'évaluation.",
  icon: Monitor,
  interviewerRole: "L'Évaluateur",
  accentColor: '#EAB308',
  bgColor: '#0A0900',
  fields: [
    {
      id: 'topic',
      label: 'Sujet de la présentation',
      placeholder: 'Ex : Stratégie digitale 2025, Résultats Q3, Projet d\'innovation…',
      maxLength: 200,
    },
    {
      id: 'audience',
      label: 'Public cible',
      placeholder: 'Ex : Direction générale, investisseurs, jury d\'école, clients…',
      maxLength: 150,
    },
    {
      id: 'objective',
      label: 'Objectif de la présentation',
      placeholder: "Ex : Convaincre d'adopter une nouvelle stratégie, présenter des résultats…",
      maxLength: 200,
    },
    {
      id: 'duration',
      label: 'Durée prévue',
      placeholder: 'Ex : 15 minutes + 5 min de questions',
      maxLength: 80,
    },
  ],
  buildSystemPrompt: (context, currentDate) =>
    `Tu es L'Évaluateur, un membre du comité ou du public qui écoute et évalue une présentation.
Date : ${currentDate}

Contexte de la présentation :
${context}

Tu représentes le public — curieux, parfois sceptique, parfois expert sur certains points. Tu poses des questions pertinentes et difficiles après avoir écouté. Tu peux jouer différents profils : le décideur qui veut des chiffres, le sceptique qui doute, le curieux qui veut comprendre. Tu vas au fond des choses.
${INTERVIEW_RULES}`,
};

// ═══════════════════════════════════════════════════════════════════════════
// PITCH
// ═══════════════════════════════════════════════════════════════════════════

const pitch: InterviewTypeConfig = {
  id: 'pitch',
  label: 'Pitch',
  description: "Prépare ton pitch face à des investisseurs ou un jury de startup.",
  icon: TrendingUp,
  interviewerRole: "L'Investisseur",
  accentColor: '#8B5CF6',
  bgColor: '#08031A',
  fields: [
    {
      id: 'project',
      label: 'Nom du projet / startup',
      placeholder: 'Ex : NovaBio — IA pour le diagnostic précoce du cancer…',
      maxLength: 150,
    },
    {
      id: 'problem',
      label: 'Problème résolu',
      placeholder: "Ex : 70% des diagnostics sont trop tardifs faute d'outils accessibles…",
      maxLength: 250,
      multiline: true,
    },
    {
      id: 'solution',
      label: 'Ta solution',
      placeholder: 'Ex : Un scanner portable connecté à une IA diagnostique disponible partout…',
      maxLength: 250,
      multiline: true,
    },
    {
      id: 'market',
      label: 'Marché & traction',
      placeholder: "Ex : Marché de 2Mds€, 3 pilotes en cours, 50k€ de pré-commandes…",
      maxLength: 200,
    },
    {
      id: 'ask',
      label: 'Financement recherché',
      placeholder: "Ex : 500k€ en seed pour embaucher et finaliser le MVP…",
      maxLength: 150,
    },
  ],
  buildSystemPrompt: (context, currentDate) =>
    `Tu es L'Investisseur, un business angel ou VC expérimenté qui écoute un pitch.
Date : ${currentDate}

Contexte du pitch :
${context}

Tu écoutes un fondateur pitcher son projet. Tu poses des questions dures mais constructives : sur le marché, la concurrence, le modèle économique, l'équipe, les risques. Tu es direct, tu vas au fond des choses. Tu ne te laisses pas convaincre par de belles paroles — tu veux des preuves, des chiffres, des faits. Tu as vu beaucoup de pitchs rater pour les mêmes raisons.
${INTERVIEW_RULES}`,
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTRE / PERSONNALISÉ
// ═══════════════════════════════════════════════════════════════════════════

const other: InterviewTypeConfig = {
  id: 'other',
  label: 'Autre / Personnalisé',
  description: "Crée ta propre simulation sur mesure — n'importe quel contexte.",
  icon: Sparkles,
  interviewerRole: "L'Interlocuteur",
  accentColor: '#94A3B8',
  bgColor: '#0A0A0A',
  fields: [
    {
      id: 'context',
      label: 'Décris la situation',
      placeholder:
        "Ex : Je dois passer un entretien de naturalisation, préparer une audition artistique, simuler une négo commerciale…",
      maxLength: 500,
      multiline: true,
    },
    {
      id: 'role',
      label: 'Rôle de ton interlocuteur',
      placeholder:
        "Ex : Un fonctionnaire de préfecture, un directeur artistique, un acheteur grande distribution…",
      maxLength: 200,
    },
  ],
  buildSystemPrompt: (context, currentDate) =>
    `Tu es L'Interlocuteur dans une simulation personnalisée.
Date : ${currentDate}

Contexte de la session :
${context}

Tu joues le rôle décrit ci-dessus avec authenticité et cohérence. Tu adaptes ton style (formel, technique, commercial, artistique…) au contexte. Tu poses des questions pertinentes pour simuler au mieux la vraie situation. Improvise de manière crédible si certains détails manquent.
${INTERVIEW_RULES}`,
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export const INTERVIEW_TYPES: Record<InterviewTypeId, InterviewTypeConfig> = {
  podcast,
  job_interview,
  academic_oral,
  presentation,
  pitch,
  other,
};

export const INTERVIEW_TYPES_LIST: InterviewTypeConfig[] = Object.values(INTERVIEW_TYPES);
