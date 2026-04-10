export type Stance = 'agree' | 'disagree' | 'nuance';

export interface ArenaUser {
  arenaName: string;
  credibilityScore: number;
  totalComments: number;
  badges: string[];
  createdAt: string;
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
  featuredDate: string | null; // YYYY-MM-DD
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
