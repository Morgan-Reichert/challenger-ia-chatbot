export type XposePostType = 'pensee' | 'echange_ia' | 'arene';
export type XposeVisibility = 'public' | 'friends';
export type XposeCommentType = 'argument' | 'question' | 'intuition';

// ─── Post ─────────────────────────────────────────────────────────────────────

export interface XposePost {
  id: string;
  authorId: string;
  authorArenaName: string;
  authorPhotoURL?: string;
  type: XposePostType;

  // Commun à tous
  caption?: string;           // texte libre / accroche
  tags?: string[];            // #sujets pour l'algo
  visibility: XposeVisibility;
  createdAt: string;

  // Type 'echange_ia' — conversation IA
  aiQuestion?: string;
  aiResponse?: string;
  personaName?: string;

  // Type 'arene' — extrait de débat
  arenaPostId?: string;
  arenaPostTitle?: string;
  arenaPostExcerpt?: string;  // extrait de la réponse IA
  arenaAgree?: number;
  arenaDisagree?: number;
  arenaTotal?: number;

  // Stats
  resonanceCount: number;
  commentCount: number;
  amplifyCount: number;
  resonatedBy: string[];      // userIds
  amplifiedBy: string[];

  // Algo
  interestScore?: number;     // calculé côté client
}

// ─── Comment ──────────────────────────────────────────────────────────────────

export interface XposeComment {
  id: string;
  authorId: string;
  authorArenaName: string;
  authorPhotoURL?: string;
  type: XposeCommentType;
  content: string;
  parentCommentId?: string | null;
  createdAt: string;
  upvotes: number;
  upvotedBy: string[];
}

// ─── User streak ──────────────────────────────────────────────────────────────

export interface XposeStreak {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD
}
