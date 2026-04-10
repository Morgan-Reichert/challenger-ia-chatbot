import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

/** Redimensionne et compresse une image côté client avant upload */
function compressImage(file: File, maxSize = 400, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('compression failed')), 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function uploadProfilePhoto(userId: string, file: File): Promise<string> {
  if (!storage) throw new Error('Firebase Storage non configuré');
  const compressed = await compressImage(file);
  const storageRef = ref(storage, `arena-profiles/${userId}/avatar.jpg`);
  const snap = await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
  return getDownloadURL(snap.ref);
}
