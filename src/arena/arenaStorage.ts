import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export async function uploadProfilePhoto(userId: string, file: File): Promise<string> {
  if (!storage) throw new Error('Firebase Storage non configuré');
  const ext = file.name.split('.').pop() ?? 'jpg';
  const storageRef = ref(storage, `arena-profiles/${userId}/avatar.${ext}`);
  const snap = await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(snap.ref);
}
