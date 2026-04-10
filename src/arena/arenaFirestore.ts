import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  increment,
  query,
  orderBy,
  where,
  limit,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { ArenaUser, ArenaPost, ArenaComment, Stance, SophismAlert } from './arenaTypes';

// ─── Arena Users ─────────────────────────────────────────────────────────────

export async function getArenaUser(userId: string): Promise<ArenaUser | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'arena_users', userId));
  if (!snap.exists()) return null;
  return snap.data() as ArenaUser;
}

export async function createArenaUser(userId: string, arenaName: string): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'arena_users', userId), {
    arenaName,
    credibilityScore: 0,
    totalComments: 0,
    badges: [],
    createdAt: new Date().toISOString(),
  });
}

export async function checkArenaNameAvailable(name: string): Promise<boolean> {
  if (!db) return true;
  const q = query(collection(db, 'arena_users'), where('arenaName', '==', name));
  const snap = await getDocs(q);
  return snap.empty;
}

// ─── Arena Posts ─────────────────────────────────────────────────────────────

export async function getArenaPosts(filter: 'recent' | 'trending' | 'featured'): Promise<ArenaPost[]> {
  if (!db) return [];
  let q;
  if (filter === 'featured') {
    const today = new Date().toISOString().split('T')[0];
    q = query(collection(db, 'arena_posts'), where('featuredDate', '==', today), limit(20));
  } else if (filter === 'trending') {
    q = query(collection(db, 'arena_posts'), orderBy('commentCount', 'desc'), limit(20));
  } else {
    q = query(collection(db, 'arena_posts'), orderBy('createdAt', 'desc'), limit(30));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ArenaPost));
}

export async function getArenaPost(postId: string): Promise<ArenaPost | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'arena_posts', postId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ArenaPost;
}

export async function createArenaPost(
  post: Omit<ArenaPost, 'id' | 'commentCount' | 'agreeCount' | 'disagreeCount' | 'nuanceCount'>
): Promise<string | null> {
  if (!db) return null;
  const ref = await addDoc(collection(db, 'arena_posts'), {
    ...post,
    commentCount: 0,
    agreeCount: 0,
    disagreeCount: 0,
    nuanceCount: 0,
  });
  return ref.id;
}

// ─── Arena Comments ───────────────────────────────────────────────────────────

export async function getArenaComments(postId: string): Promise<ArenaComment[]> {
  if (!db) return [];
  const q = query(
    collection(db, 'arena_posts', postId, 'comments'),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ArenaComment));
}

export async function addArenaComment(
  postId: string,
  comment: Omit<ArenaComment, 'id' | 'upvotes' | 'upvotedBy' | 'sophismAlert' | 'credibilityPoints'>
): Promise<string | null> {
  if (!db) return null;
  const ref = await addDoc(collection(db, 'arena_posts', postId, 'comments'), {
    ...comment,
    upvotes: 0,
    upvotedBy: [],
    sophismAlert: null,
    credibilityPoints: 0,
  });
  await updateDoc(doc(db, 'arena_posts', postId), {
    commentCount: increment(1),
    [`${comment.stance}Count`]: increment(1),
  });
  await updateDoc(doc(db, 'arena_users', comment.authorId), {
    totalComments: increment(1),
  });
  return ref.id;
}

export async function upvoteComment(
  postId: string,
  commentId: string,
  commentAuthorId: string,
  userId: string,
  isCurrentlyUpvoted: boolean
): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'arena_posts', postId, 'comments', commentId);
  if (isCurrentlyUpvoted) {
    await updateDoc(ref, {
      upvotes: increment(-1),
      upvotedBy: arrayRemove(userId),
    });
  } else {
    await updateDoc(ref, {
      upvotes: increment(1),
      upvotedBy: arrayUnion(userId),
    });
    // Award credibility to comment author (not self-vote)
    if (commentAuthorId !== userId) {
      await updateDoc(doc(db, 'arena_users', commentAuthorId), {
        credibilityScore: increment(1),
      });
    }
  }
}

export async function saveSophismAlert(
  postId: string,
  commentId: string,
  commentAuthorId: string,
  alert: SophismAlert
): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'arena_posts', postId, 'comments', commentId), {
    sophismAlert: alert,
  });
  if (alert.detected && alert.severity !== 'low') {
    await updateDoc(doc(db, 'arena_users', commentAuthorId), {
      credibilityScore: increment(-2),
    });
  }
}

export async function addCredibilityPoints(userId: string, points: number): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'arena_users', userId), {
    credibilityScore: increment(points),
  });
}
