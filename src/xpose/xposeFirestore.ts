import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  increment, query, orderBy, where, limit, arrayUnion, arrayRemove, setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { XposePost, XposeComment, XposeStreak, XposeRecommendedUser } from './xposeTypes';

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function createXposePost(
  post: Omit<XposePost, 'id' | 'resonanceCount' | 'commentCount' | 'amplifyCount' | 'resonatedBy' | 'amplifiedBy' | 'interestScore'>
): Promise<string | null> {
  if (!db) return null;
  const ref = await addDoc(collection(db, 'xpose_posts'), {
    ...post,
    resonanceCount: 0, commentCount: 0, amplifyCount: 0,
    resonatedBy: [], amplifiedBy: [],
  });
  return ref.id;
}

export async function updateXposePostImages(postId: string, imageUrls: string[]): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'xpose_posts', postId), { imageUrls });
}

/** Feed public trié par date — filtre public côté client pour éviter l'index composite */
export async function getPublicFeed(n = 50): Promise<XposePost[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'xpose_posts'),
      orderBy('createdAt', 'desc'),
      limit(n),
    ));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as XposePost))
      .filter(p => p.visibility === 'public');
  } catch {
    return [];
  }
}

/** Feed des abonnements (authorId in [...]) */
export async function getFollowingFeed(followingIds: string[]): Promise<XposePost[]> {
  if (!db || !followingIds.length) return [];
  try {
    const ids = followingIds.slice(0, 10);
    const snap = await getDocs(query(
      collection(db, 'xpose_posts'),
      where('authorId', 'in', ids),
      orderBy('createdAt', 'desc'),
      limit(50),
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as XposePost));
  } catch {
    // Fallback sans orderBy si pas d'index
    try {
      const ids = followingIds.slice(0, 10);
      const snap = await getDocs(query(
        collection(db, 'xpose_posts'),
        where('authorId', 'in', ids),
        limit(50),
      ));
      const posts = snap.docs.map(d => ({ id: d.id, ...d.data() } as XposePost));
      return posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }
}

/** Alias gardé pour compatibilité */
export const getCompanionsFeed = getFollowingFeed;

export async function getXposePost(postId: string): Promise<XposePost | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'xpose_posts', postId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as XposePost;
  } catch {
    return null;
  }
}

export async function resonatePost(postId: string, userId: string, isResonated: boolean): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'xpose_posts', postId);
  if (isResonated) {
    await updateDoc(ref, { resonanceCount: increment(-1), resonatedBy: arrayRemove(userId) });
  } else {
    await updateDoc(ref, { resonanceCount: increment(1), resonatedBy: arrayUnion(userId) });
  }
}

export async function amplifyPost(postId: string, userId: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'xpose_posts', postId), {
    amplifyCount: increment(1), amplifiedBy: arrayUnion(userId),
  });
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function addXposeComment(
  postId: string,
  comment: Omit<XposeComment, 'id' | 'upvotes' | 'upvotedBy'>
): Promise<string | null> {
  if (!db) return null;
  const ref = await addDoc(collection(db, 'xpose_posts', postId, 'comments'), {
    ...comment, upvotes: 0, upvotedBy: [],
  });
  await updateDoc(doc(db, 'xpose_posts', postId), { commentCount: increment(1) });
  return ref.id;
}

export async function getXposeComments(postId: string): Promise<XposeComment[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'xpose_posts', postId, 'comments'),
      orderBy('createdAt', 'asc'),
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as XposeComment));
  } catch {
    return [];
  }
}

export async function upvoteXposeComment(postId: string, commentId: string, userId: string, isUp: boolean): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'xpose_posts', postId, 'comments', commentId);
  if (isUp) await updateDoc(ref, { upvotes: increment(-1), upvotedBy: arrayRemove(userId) });
  else await updateDoc(ref, { upvotes: increment(1), upvotedBy: arrayUnion(userId) });
}

// ─── Streak ───────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0];

export async function updateStreak(userId: string): Promise<XposeStreak> {
  if (!db) return { currentStreak: 0, longestStreak: 0, lastActiveDate: todayStr() };
  try {
    const ref = doc(db, 'xpose_streaks', userId);
    const snap = await getDoc(ref);
    const today = todayStr();
    if (!snap.exists()) {
      const streak: XposeStreak = { currentStreak: 1, longestStreak: 1, lastActiveDate: today };
      await setDoc(ref, streak);
      return streak;
    }
    const data = snap.data() as XposeStreak;
    if (data.lastActiveDate === today) return data;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isConsecutive = data.lastActiveDate === yesterday.toISOString().split('T')[0];
    const newStreak = isConsecutive ? data.currentStreak + 1 : 1;
    const updated: XposeStreak = {
      currentStreak: newStreak,
      longestStreak: Math.max(data.longestStreak, newStreak),
      lastActiveDate: today,
    };
    await setDoc(ref, updated);
    return updated;
  } catch {
    return { currentStreak: 0, longestStreak: 0, lastActiveDate: todayStr() };
  }
}

export async function getStreak(userId: string): Promise<XposeStreak | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'xpose_streaks', userId));
    return snap.exists() ? (snap.data() as XposeStreak) : null;
  } catch {
    return null;
  }
}

// ─── Algo "Pour Vous" ─────────────────────────────────────────────────────────

export function scorePost(
  post: XposePost,
  myInterests: string[],
  myFollowingIds: string[],
): number {
  const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / 3_600_000;
  const ageFactor = Math.max(0.05, 1 - ageHours / 72);
  let score = (post.resonanceCount * 3 + post.commentCount * 2.5 + post.amplifyCount * 2) * ageFactor;
  if (myFollowingIds.includes(post.authorId)) score *= 1.6;
  const matchingTags = (post.tags ?? []).filter(t => myInterests.includes(t)).length;
  score *= 1 + matchingTags * 0.4;
  if (post.type === 'echange_ia') score *= 1.2;
  if (post.imageUrls?.length) score *= 1.1;
  return score;
}

// ─── Recommandations de comptes ───────────────────────────────────────────────

/**
 * Retourne des utilisateurs actifs dans des thématiques similaires.
 * Stratégie : récupère les arena_users actifs, score par tags communs + crédibilité.
 */
export async function getRecommendedUsers(
  myUserId: string,
  myInterests: string[],
  alreadyFollowingIds: string[],
  n = 5,
): Promise<XposeRecommendedUser[]> {
  if (!db) return [];
  try {
    // On prend les users avec le meilleur score de crédibilité
    const snap = await getDocs(query(
      collection(db, 'arena_users'),
      orderBy('credibilityScore', 'desc'),
      limit(40),
    ));
    const candidates = snap.docs
      .map(d => ({ userId: d.id, ...d.data() } as any))
      .filter((u: any) =>
        u.userId !== myUserId &&
        !alreadyFollowingIds.includes(u.userId),
      );

    const scored = candidates.map((u: any) => {
      const userTags: string[] = u.passions ?? [];
      const common = userTags.filter(t => myInterests.includes(t));
      return {
        userId: u.userId,
        arenaName: u.arenaName,
        photoURL: u.photoURL,
        bio: u.bio,
        credibilityScore: u.credibilityScore ?? 0,
        commonTags: common,
        followersCount: u.followersCount ?? 0,
        _score: common.length * 10 + (u.credibilityScore ?? 0) * 0.1 + (u.followersCount ?? 0) * 0.05,
      };
    });

    return scored
      .sort((a, b) => b._score - a._score)
      .slice(0, n)
      .map(({ _score, ...u }) => u as XposeRecommendedUser);
  } catch {
    return [];
  }
}

// ─── Tendances (top tags) ─────────────────────────────────────────────────────

export async function getTrendingTags(n = 8): Promise<{ tag: string; count: number }[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'xpose_posts'),
      orderBy('createdAt', 'desc'),
      limit(100),
    ));
    const counts: Record<string, number> = {};
    snap.docs.forEach(d => {
      const tags: string[] = d.data().tags ?? [];
      tags.forEach(t => { counts[t] = (counts[t] ?? 0) + 1; });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([tag, count]) => ({ tag, count }));
  } catch {
    return [];
  }
}

// ─── Sondage — vote ───────────────────────────────────────────────────────────

export async function votePoll(postId: string, optionId: string, userId: string): Promise<void> {
  if (!db) return;
  const postRef = doc(db, 'xpose_posts', postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) return;
  const post = snap.data();
  const options: any[] = post.pollOptions ?? [];

  // Retire le vote existant de toutes les options, puis vote sur la cible
  const updated = options.map((opt: any) => {
    const voters: string[] = opt.voterIds ?? [];
    if (opt.id === optionId) {
      if (voters.includes(userId)) return opt; // déjà voté → rien
      return { ...opt, voteCount: (opt.voteCount ?? 0) + 1, voterIds: [...voters, userId] };
    }
    if (voters.includes(userId)) {
      return { ...opt, voteCount: Math.max(0, (opt.voteCount ?? 0) - 1), voterIds: voters.filter((id: string) => id !== userId) };
    }
    return opt;
  });
  await updateDoc(postRef, { pollOptions: updated });
}

// ─── Supprimer un post ────────────────────────────────────────────────────────

export async function deleteXposePost(postId: string): Promise<void> {
  if (!db) return;
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'xpose_posts', postId));
}

// ─── Posts d'un utilisateur ───────────────────────────────────────────────────

export async function getUserXposePosts(userId: string): Promise<import('./xposeTypes').XposePost[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'xpose_posts'),
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50),
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as import('./xposeTypes').XposePost));
  } catch {
    try {
      const snap = await getDocs(query(
        collection(db, 'xpose_posts'),
        where('authorId', '==', userId),
        limit(50),
      ));
      const posts = snap.docs.map(d => ({ id: d.id, ...d.data() } as import('./xposeTypes').XposePost));
      return posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch { return []; }
  }
}
