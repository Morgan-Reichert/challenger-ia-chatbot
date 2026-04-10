export type XposePostType = 'pensee' | 'echange_ia' | 'arene';
export type XposeVisibility = 'public' | 'friends';
export type XposeCommentType = 'argument' | 'question' | 'intuition';

// ─── Post ─────────────────────────────────────────────────────────────────────

export interface XposePost {
  id: string;
  authorId: string;
  authorArenaName: string;
  authorPhotoURL?: string;
  authorCredibilityScore?: number;
  type: XposePostType;

  // Contenu
  caption?: string;
  tags?: string[];
  imageUrls?: string[];          // images d'illustration (max 4)
  mentions?: string[];           // arenaNames mentionnés (@)
  visibility: XposeVisibility;
  createdAt: string;

  // Quote post
  quotedPostId?: string;
  quotedPost?: Omit<XposePost, 'quotedPost'>;  // snapshot au moment du quote

  // Type 'echange_ia'
  aiQuestion?: string;
  aiResponse?: string;
  personaName?: string;

  // Type 'arene'
  arenaPostId?: string;
  arenaPostTitle?: string;
  arenaPostExcerpt?: string;
  arenaAgree?: number;
  arenaDisagree?: number;
  arenaTotal?: number;

  // Stats
  resonanceCount: number;
  commentCount: number;
  amplifyCount: number;
  resonatedBy: string[];
  amplifiedBy: string[];

  // Algo (client-side)
  interestScore?: number;
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

// ─── Streak ───────────────────────────────────────────────────────────────────

export interface XposeStreak {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
}

// ─── Recommended user ─────────────────────────────────────────────────────────

export interface XposeRecommendedUser {
  userId: string;
  arenaName: string;
  photoURL?: string;
  bio?: string;
  credibilityScore: number;
  commonTags: string[];
  followersCount: number;
}
