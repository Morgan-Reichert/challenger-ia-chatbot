// ─── Arena de base ────────────────────────────────────────────────────────────

export type Stance = 'agree' | 'disagree' | 'nuance';
export type Visibility = 'public' | 'friends' | 'private';
export type ConnectionType = 'connect' | 'follow';
export type ConnectionStatus = 'pending' | 'accepted' | 'rejected';
export type PersonalCommentType = 'argument' | 'question' | 'intuition';

export interface ArenaUser {
  arenaName: string;
  credibilityScore: number;
  totalComments: number;
  badges: string[];
  createdAt: string;
  // Profil étendu
  photoURL?: string;
  bio?: string;
  job?: string;
  passions?: string[];
  socials?: {
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    tiktok?: string;
    website?: string;
  };
  profileVisibility?: Visibility;
  postDefaultVisibility?: Visibility;
  connectionsCount?: number;
  followersCount?: number;
  followingCount?: number;
  personalPostsCount?: number;
}

export interface ArenaPost {
  id: string;
  authorId: string | null;
  authorArenaName: string;
  isAnonymous: boolean;
  title: string;
  preamble: string;
  question: string;
  aiResponse: string;
  personaName: string;
  createdAt: string;
  commentCount: number;
  agreeCount: number;
  disagreeCount: number;
  nuanceCount: number;
  featuredDate: string | null;
}

export interface SophismAlert {
  detected: boolean;
  type: string;
  explanation: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ArenaComment {
  id: string;
  authorId: string;
  authorArenaName: string;
  stance: Stance;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
  upvotes: number;
  upvotedBy: string[];
  sophismAlert: SophismAlert | null;
  credibilityPoints: number;
}

// ─── Connexions / Compagnons ──────────────────────────────────────────────────

export interface ArenaConnection {
  id: string;
  fromUserId: string;
  fromArenaName: string;
  fromPhotoURL?: string;
  toUserId: string;
  toArenaName: string;
  toPhotoURL?: string;
  type: ConnectionType;
  status: ConnectionStatus;
  createdAt: string;
}

// ─── Posts personnels ─────────────────────────────────────────────────────────

export interface PersonalPost {
  id: string;
  authorId: string;
  authorArenaName: string;
  authorPhotoURL?: string;
  type: 'ia' | 'text';
  content: string;           // texte libre ou intro du post
  aiQuestion?: string;       // si type === 'ia'
  aiResponse?: string;
  personaName?: string;
  visibility: Visibility;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedBy: string[];
}

export interface PersonalComment {
  id: string;
  authorId: string;
  authorArenaName: string;
  authorPhotoURL?: string;
  type: PersonalCommentType;
  content: string;
  parentCommentId?: string | null;
  createdAt: string;
  upvotes: number;
  upvotedBy: string[];
}
