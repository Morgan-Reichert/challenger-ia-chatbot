import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

/** Compresse une image avant upload (max 1200px, JPEG 0.85) */
function compressImage(file: File, maxSize = 1200, quality = 0.85): Promise<Blob> {
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
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('compression failed')),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Upload jusqu'à 4 images pour un post XPOSE.
 * Retourne les download URLs dans l'ordre.
 */
export async function uploadPostImages(postId: string, files: File[]): Promise<string[]> {
  if (!storage) throw new Error('Firebase Storage non configuré');
  const limited = files.slice(0, 4);
  const urls = await Promise.all(
    limited.map(async (file, i) => {
      const blob = await compressImage(file);
      const storageRef = ref(storage!, `xpose-posts/${postId}/image-${i}.jpg`);
      const snap = await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      return getDownloadURL(snap.ref);
    }),
  );
  return urls;
}
