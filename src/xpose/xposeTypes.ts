export type XposePostType = 'pensee' | 'echange_ia' | 'arene' | 'sondage' | 'question_ouverte';
export type XposeVisibility = 'public' | 'friends';
export type XposeCommentType = 'argument' | 'question' | 'intuition' | 'reponse';
export type XposeDestination = 'xpose' | 'arene' | 'both';

// ─── Poll ─────────────────────────────────────────────────────────────────────

export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
  voterIds: string[];
}

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
  imageUrls?: string[];
  mentions?: string[];
  visibility: XposeVisibility;
  createdAt: string;

  // Destination (cross-post)
  destination?: XposeDestination;

  // Quote post
  quotedPostId?: string;
  quotedPost?: Omit<XposePost, 'quotedPost'>;

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

  // Type 'sondage'
  pollOptions?: PollOption[];
  pollEndsAt?: string;
  pollDurationHours?: number;

  // Type 'question_ouverte'
  questionText?: string;

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
