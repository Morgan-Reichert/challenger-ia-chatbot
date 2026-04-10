import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  increment, query, orderBy, where, limit, arrayUnion, arrayRemove, setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { XposePost, XposeComment, XposeStreak } from './xposeTypes';

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function createXposePost(
  post: Omit<XposePost, 'id' | 'resonanceCount' | 'commentCount' | 'amplifyCount' | 'resonatedBy' | 'amplifiedBy'>
): Promise<string | null> {
  if (!db) return null;
  const ref = await addDoc(collection(db, 'xpose_posts'), {
    ...post,
    resonanceCount: 0, commentCount: 0, amplifyCount: 0,
    resonatedBy: [], amplifiedBy: [],
  });
  return ref.id;
}

export async function getPublicFeed(n = 40): Promise<XposePost[]> {
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

export async function getCompanionsFeed(friendIds: string[]): Promise<XposePost[]> {
  if (!db || !friendIds.length) return [];
  try {
    const ids = friendIds.slice(0, 10); // Firestore `in` max 10
    const snap = await getDocs(query(
      collection(db, 'xpose_posts'),
      where('authorId', 'in', ids),
      orderBy('createdAt', 'desc'),
      limit(40),
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as XposePost));
  } catch {
    return [];
  }
}

export async function getUserXposePosts(userId: string, isOwner: boolean): Promise<XposePost[]> {
  if (!db) return [];
  const q = isOwner
    ? query(collection(db, 'xpose_posts'), where('authorId', '==', userId), orderBy('createdAt', 'desc'), limit(30))
    : query(collection(db, 'xpose_posts'), where('authorId', '==', userId), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(30));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as XposePost));
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
  const snap = await getDocs(query(
    collection(db, 'xpose_posts', postId, 'comments'),
    orderBy('createdAt', 'asc'),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as XposeComment));
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
  const ref = doc(db, 'xpose_streaks', userId);
  const snap = await getDoc(ref);
  const today = todayStr();

  if (!snap.exists()) {
    const streak: XposeStreak = { currentStreak: 1, longestStreak: 1, lastActiveDate: today };
    await setDoc(ref, streak);
    return streak;
  }

  const data = snap.data() as XposeStreak;
  if (data.lastActiveDate === today) return data; // Déjà mis à jour aujourd'hui

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const isConsecutive = data.lastActiveDate === yesterdayStr;

  const newStreak = isConsecutive ? data.currentStreak + 1 : 1;
  const updated: XposeStreak = {
    currentStreak: newStreak,
    longestStreak: Math.max(data.longestStreak, newStreak),
    lastActiveDate: today,
  };
  await setDoc(ref, updated);
  return updated;
}

export async function getStreak(userId: string): Promise<XposeStreak | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'xpose_streaks', userId));
  if (!snap.exists()) return null;
  return snap.data() as XposeStreak;
}

// ─── Algo "Pour Vous" ─────────────────────────────────────────────────────────

export function scorePost(
  post: XposePost,
  myInterests: string[],
  myFollowingIds: string[]
): number {
  const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / 3_600_000;
  const ageFactor = Math.max(0.05, 1 - ageHours / 72); // décroît sur 72h

  let score = (post.resonanceCount * 3 + post.commentCount * 2.5 + post.amplifyCount * 2) * ageFactor;

  // Boost si je suis l'auteur
  if (myFollowingIds.includes(post.authorId)) score *= 1.6;

  // Boost par intérêts communs (tags)
  const matchingTags = (post.tags ?? []).filter(t => myInterests.includes(t)).length;
  score *= 1 + matchingTags * 0.4;

  // Boost type "échange IA" (cœur du projet)
  if (post.type === 'echange_ia') score *= 1.2;

  return score;
}
