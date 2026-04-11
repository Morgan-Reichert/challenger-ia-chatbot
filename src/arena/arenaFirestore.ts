import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, increment, query, orderBy, where, limit,
  arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  ArenaUser, ArenaPost, ArenaComment, Stance, SophismAlert,
  ArenaConnection, ConnectionType, ConnectionStatus,
  PersonalPost, PersonalComment, Visibility, ArenaPollOption,
} from './arenaTypes';

// ─── Arena Users ──────────────────────────────────────────────────────────────

export async function getArenaUser(userId: string): Promise<ArenaUser | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'arena_users', userId));
  if (!snap.exists()) return null;
  return snap.data() as ArenaUser;
}

export async function createArenaUser(userId: string, arenaName: string): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'arena_users', userId), {
    arenaName, credibilityScore: 0, totalComments: 0, badges: [],
    createdAt: new Date().toISOString(),
    profileVisibility: 'public', postDefaultVisibility: 'public',
    connectionsCount: 0, followersCount: 0, followingCount: 0, personalPostsCount: 0,
  });
}

export async function updateArenaUserProfile(userId: string, data: Partial<ArenaUser>): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'arena_users', userId), data as Record<string, unknown>);
}

export async function checkArenaNameAvailable(name: string): Promise<boolean> {
  if (!db) return true;
  const snap = await getDocs(query(collection(db, 'arena_users'), where('arenaName', '==', name)));
  return snap.empty;
}

// ─── Arena Posts (débats publics) ─────────────────────────────────────────────

export async function getArenaPosts(filter: 'recent' | 'trending' | 'featured'): Promise<ArenaPost[]> {
  if (!db) return [];
  let q;
  const today = new Date().toISOString().split('T')[0];
  if (filter === 'featured') q = query(collection(db, 'arena_posts'), where('featuredDate', '==', today), limit(20));
  else if (filter === 'trending') q = query(collection(db, 'arena_posts'), orderBy('commentCount', 'desc'), limit(20));
  else q = query(collection(db, 'arena_posts'), orderBy('createdAt', 'desc'), limit(30));
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
  const clean = Object.fromEntries(
    Object.entries({ ...post, commentCount: 0, agreeCount: 0, disagreeCount: 0, nuanceCount: 0 })
      .filter(([, v]) => v !== undefined)
  );
  const ref = await addDoc(collection(db, 'arena_posts'), clean);
  return ref.id;
}

export async function voteArenaPoll(postId: string, optionId: string, userId: string): Promise<void> {
  if (!db) return;
  const postRef = doc(db, 'arena_posts', postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) return;
  const options: ArenaPollOption[] = snap.data().pollOptions ?? [];
  const updated = options.map((opt) => {
    const voters: string[] = opt.voterIds ?? [];
    if (opt.id === optionId) {
      if (voters.includes(userId)) return opt;
      return { ...opt, voteCount: (opt.voteCount ?? 0) + 1, voterIds: [...voters, userId] };
    }
    if (voters.includes(userId)) {
      return { ...opt, voteCount: Math.max(0, (opt.voteCount ?? 0) - 1), voterIds: voters.filter(id => id !== userId) };
    }
    return opt;
  });
  await updateDoc(postRef, { pollOptions: updated });
}

// ─── Arena Comments (débats) ──────────────────────────────────────────────────

export async function getArenaComments(postId: string): Promise<ArenaComment[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, 'arena_posts', postId, 'comments'), orderBy('createdAt', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ArenaComment));
}

export async function addArenaComment(
  postId: string,
  comment: Omit<ArenaComment, 'id' | 'upvotes' | 'upvotedBy' | 'sophismAlert' | 'credibilityPoints'>
): Promise<string | null> {
  if (!db) return null;
  const ref = await addDoc(collection(db, 'arena_posts', postId, 'comments'), {
    ...comment, upvotes: 0, upvotedBy: [], sophismAlert: null, credibilityPoints: 0,
  });
  await updateDoc(doc(db, 'arena_posts', postId), { commentCount: increment(1), [`${comment.stance}Count`]: increment(1) });
  await updateDoc(doc(db, 'arena_users', comment.authorId), { totalComments: increment(1) });
  return ref.id;
}

export async function upvoteComment(
  postId: string, commentId: string, commentAuthorId: string, userId: string, isUpvoted: boolean
): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'arena_posts', postId, 'comments', commentId);
  if (isUpvoted) {
    await updateDoc(ref, { upvotes: increment(-1), upvotedBy: arrayRemove(userId) });
  } else {
    await updateDoc(ref, { upvotes: increment(1), upvotedBy: arrayUnion(userId) });
    if (commentAuthorId !== userId) await updateDoc(doc(db, 'arena_users', commentAuthorId), { credibilityScore: increment(1) });
  }
}

export async function saveSophismAlert(
  postId: string, commentId: string, commentAuthorId: string, alert: SophismAlert
): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'arena_posts', postId, 'comments', commentId), { sophismAlert: alert });
  if (alert.detected && alert.severity !== 'low') {
    await updateDoc(doc(db, 'arena_users', commentAuthorId), { credibilityScore: increment(-2) });
  }
}

// ─── Connexions / Compagnons ──────────────────────────────────────────────────

function connId(fromId: string, toId: string, type: ConnectionType) {
  return `${fromId}_${toId}_${type}`;
}

export async function sendConnection(
  fromUserId: string, fromArenaName: string, fromPhotoURL: string | undefined,
  toUserId: string, toArenaName: string, toPhotoURL: string | undefined,
  type: ConnectionType
): Promise<void> {
  if (!db) return;
  const id = connId(fromUserId, toUserId, type);
  await setDoc(doc(db, 'arena_connections', id), {
    id, fromUserId, fromArenaName, fromPhotoURL: fromPhotoURL ?? null,
    toUserId, toArenaName, toPhotoURL: toPhotoURL ?? null,
    type, status: type === 'follow' ? 'accepted' : 'pending',
    createdAt: new Date().toISOString(),
  });
  if (type === 'follow') {
    await updateDoc(doc(db, 'arena_users', fromUserId), { followingCount: increment(1) });
    await updateDoc(doc(db, 'arena_users', toUserId), { followersCount: increment(1) });
  }
}

export async function acceptConnection(fromUserId: string, toUserId: string): Promise<void> {
  if (!db) return;
  const id = connId(fromUserId, toUserId, 'connect');
  await updateDoc(doc(db, 'arena_connections', id), { status: 'accepted' });
  await updateDoc(doc(db, 'arena_users', fromUserId), { connectionsCount: increment(1) });
  await updateDoc(doc(db, 'arena_users', toUserId), { connectionsCount: increment(1) });
}

export async function removeConnection(
  fromUserId: string, toUserId: string, type: ConnectionType
): Promise<void> {
  if (!db) return;
  const id = connId(fromUserId, toUserId, type);
  const ref = doc(db, 'arena_connections', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as ArenaConnection;
  // Soft delete via status = rejected
  await updateDoc(ref, { status: 'rejected' });
  if (type === 'follow' && data.status === 'accepted') {
    await updateDoc(doc(db, 'arena_users', fromUserId), { followingCount: increment(-1) });
    await updateDoc(doc(db, 'arena_users', toUserId), { followersCount: increment(-1) });
  } else if (type === 'connect' && data.status === 'accepted') {
    await updateDoc(doc(db, 'arena_users', fromUserId), { connectionsCount: increment(-1) });
    await updateDoc(doc(db, 'arena_users', toUserId), { connectionsCount: increment(-1) });
  }
}

export async function getConnectionStatus(
  myId: string, otherId: string
): Promise<{ connect: ConnectionStatus | null; follow: ConnectionStatus | null; iFollowThem: boolean }> {
  if (!db) return { connect: null, follow: null, iFollowThem: false };
  const [cSent, cReceived, fSent] = await Promise.all([
    getDoc(doc(db, 'arena_connections', connId(myId, otherId, 'connect'))),
    getDoc(doc(db, 'arena_connections', connId(otherId, myId, 'connect'))),
    getDoc(doc(db, 'arena_connections', connId(myId, otherId, 'follow'))),
  ]);
  const connectDoc = cSent.exists() ? cSent : cReceived.exists() ? cReceived : null;
  const connectStatus = connectDoc ? (connectDoc.data() as ArenaConnection).status : null;
  const followStatus = fSent.exists() ? (fSent.data() as ArenaConnection).status : null;
  return { connect: connectStatus, follow: followStatus, iFollowThem: followStatus === 'accepted' };
}

export async function getPendingConnectionRequests(userId: string): Promise<ArenaConnection[]> {
  if (!db) return [];
  const snap = await getDocs(query(
    collection(db, 'arena_connections'),
    where('toUserId', '==', userId),
    where('type', '==', 'connect'),
    where('status', '==', 'pending'),
  ));
  return snap.docs.map(d => d.data() as ArenaConnection);
}

export async function getMyConnections(userId: string): Promise<ArenaConnection[]> {
  if (!db) return [];
  const [sent, received] = await Promise.all([
    getDocs(query(collection(db, 'arena_connections'), where('fromUserId', '==', userId), where('status', '==', 'accepted'))),
    getDocs(query(collection(db, 'arena_connections'), where('toUserId', '==', userId), where('status', '==', 'accepted'))),
  ]);
  return [...sent.docs, ...received.docs].map(d => d.data() as ArenaConnection);
}

// ─── Posts personnels ─────────────────────────────────────────────────────────

export async function createPersonalPost(
  post: Omit<PersonalPost, 'id' | 'likeCount' | 'commentCount' | 'likedBy'>
): Promise<string | null> {
  if (!db) return null;
  const ref = await addDoc(collection(db, 'arena_personal_posts'), {
    ...post, likeCount: 0, commentCount: 0, likedBy: [],
  });
  await updateDoc(doc(db, 'arena_users', post.authorId), { personalPostsCount: increment(1) });
  return ref.id;
}

export async function getPersonalPosts(userId: string, viewerRelation: 'self' | 'friend' | 'public'): Promise<PersonalPost[]> {
  if (!db) return [];
  let q;
  if (viewerRelation === 'self') {
    q = query(collection(db, 'arena_personal_posts'), where('authorId', '==', userId), orderBy('createdAt', 'desc'), limit(30));
  } else if (viewerRelation === 'friend') {
    q = query(collection(db, 'arena_personal_posts'), where('authorId', '==', userId), where('visibility', 'in', ['public', 'friends']), orderBy('createdAt', 'desc'), limit(30));
  } else {
    q = query(collection(db, 'arena_personal_posts'), where('authorId', '==', userId), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(30));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PersonalPost));
}

export async function getCompanionsFeed(myId: string): Promise<PersonalPost[]> {
  if (!db) return [];
  const connections = await getMyConnections(myId);
  const friendIds = connections.map(c => c.fromUserId === myId ? c.toUserId : c.fromUserId);
  if (friendIds.length === 0) return [];
  // Firestore 'in' supports max 30 values
  const ids = friendIds.slice(0, 30);
  const snap = await getDocs(query(
    collection(db, 'arena_personal_posts'),
    where('authorId', 'in', ids),
    where('visibility', 'in', ['public', 'friends']),
    orderBy('createdAt', 'desc'),
    limit(30),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PersonalPost));
}

export async function likePersonalPost(postId: string, authorId: string, userId: string, isLiked: boolean): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'arena_personal_posts', postId);
  if (isLiked) {
    await updateDoc(ref, { likeCount: increment(-1), likedBy: arrayRemove(userId) });
  } else {
    await updateDoc(ref, { likeCount: increment(1), likedBy: arrayUnion(userId) });
  }
}

export async function addPersonalComment(
  postId: string,
  comment: Omit<PersonalComment, 'id' | 'upvotes' | 'upvotedBy'>
): Promise<string | null> {
  if (!db) return null;
  const ref = await addDoc(collection(db, 'arena_personal_posts', postId, 'comments'), {
    ...comment, upvotes: 0, upvotedBy: [],
  });
  await updateDoc(doc(db, 'arena_personal_posts', postId), { commentCount: increment(1) });
  return ref.id;
}

export async function getPersonalComments(postId: string): Promise<PersonalComment[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, 'arena_personal_posts', postId, 'comments'), orderBy('createdAt', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PersonalComment));
}

export async function upvotePersonalComment(postId: string, commentId: string, userId: string, isUpvoted: boolean): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'arena_personal_posts', postId, 'comments', commentId);
  if (isUpvoted) await updateDoc(ref, { upvotes: increment(-1), upvotedBy: arrayRemove(userId) });
  else await updateDoc(ref, { upvotes: increment(1), upvotedBy: arrayUnion(userId) });
}
