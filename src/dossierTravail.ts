/**
 * Dossier de travail — accès à un dossier local choisi par l'utilisateur.
 *
 * ── Périmètre technique, sans ambiguïté ───────────────────────────────────
 * Créer, modifier et supprimer des fichiers dans un dossier choisi n'est
 * possible qu'avec la File System Access API, disponible UNIQUEMENT sur les
 * navigateurs Chromium de bureau (Chrome, Edge, Opera). Ni Safari, ni Firefox,
 * ni les navigateurs mobiles ne l'exposent. Partout ailleurs, `capacite()`
 * renvoie faux et l'application retombe sur un téléchargement classique.
 *
 * ── Sécurité — une règle stricte ──────────────────────────────────────────
 * L'IA génère le CONTENU d'un document. Elle ne décide JAMAIS d'écrire ou de
 * supprimer un fichier : toute opération sur le disque est déclenchée par un
 * geste explicite de l'utilisateur dans l'interface, et la suppression demande
 * une confirmation. Le contenu d'une conversation pouvant, en théorie, être
 * détourné, on ne lui laisse aucun pouvoir sur le système de fichiers.
 *
 * L'autorisation elle-même reste sous le contrôle de l'utilisateur : le
 * navigateur affiche un sélecteur natif, l'accès se limite au dossier désigné,
 * et il est révocable à tout moment depuis le navigateur.
 */

const BASE_IDB = 'challenger-fs';
const CLE_HANDLE = 'dossier-travail';

/** Vrai si le navigateur expose la File System Access API en écriture. */
export function capacite(): boolean {
  return typeof window !== 'undefined'
    && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

/* ─── Persistance du handle (IndexedDB) ───────────────────────────────────── */
// Le handle de dossier survit à la session s'il est stocké dans IndexedDB.
// localStorage ne le permet pas : il ne conserve que des chaînes.

function ouvrirIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE_IDB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function lireHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await ouvrirIdb();
    return await new Promise((resolve) => {
      const tx = db.transaction('handles', 'readonly').objectStore('handles').get(CLE_HANDLE);
      tx.onsuccess = () => resolve((tx.result as FileSystemDirectoryHandle) ?? null);
      tx.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function ecrireHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  try {
    const db = await ouvrirIdb();
    const store = db.transaction('handles', 'readwrite').objectStore('handles');
    if (handle) store.put(handle, CLE_HANDLE);
    else store.delete(CLE_HANDLE);
  } catch { /* stockage indisponible : le dossier ne survivra pas à la session */ }
}

/* ─── Permission ──────────────────────────────────────────────────────────── */

type AvecPermission = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};

async function garantirPermission(handle: FileSystemDirectoryHandle, redemander: boolean): Promise<boolean> {
  const h = handle as AvecPermission;
  if (!h.queryPermission) return true; // navigateur sans gestion fine : l'accès vaut permission
  const etat = await h.queryPermission({ mode: 'readwrite' });
  if (etat === 'granted') return true;
  if (etat === 'denied' || !redemander || !h.requestPermission) return false;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/* ─── API publique ────────────────────────────────────────────────────────── */

export type InfoFichier = { nom: string; taille: number; modifieLe: number };

/**
 * Ouvre le sélecteur natif et retient le dossier choisi.
 * Renvoie le nom du dossier, ou null si l'utilisateur annule.
 */
export async function choisirDossier(): Promise<string | null> {
  if (!capacite()) return null;
  try {
    const handle = await (window as unknown as {
      showDirectoryPicker: (o?: { mode?: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker({ mode: 'readwrite' });
    await ecrireHandle(handle);
    return handle.name;
  } catch {
    // Annulation par l'utilisateur, ou refus : ni erreur ni dossier.
    return null;
  }
}

/** Vrai si un dossier a déjà été choisi et mémorisé, quelle que soit la permission. */
export async function dossierMemorise(): Promise<boolean> {
  return (await lireHandle()) !== null;
}

/** Nom du dossier actuellement autorisé, ou null si aucun / permission perdue. */
export async function dossierActuel(): Promise<string | null> {
  const handle = await lireHandle();
  if (!handle) return null;
  const ok = await garantirPermission(handle, false);
  return ok ? handle.name : null;
}

/** Redemande la permission (nécessaire après un rechargement de page). */
export async function reactiverDossier(): Promise<string | null> {
  const handle = await lireHandle();
  if (!handle) return null;
  const ok = await garantirPermission(handle, true);
  return ok ? handle.name : null;
}

/** Oublie le dossier. N'efface aucun fichier. */
export async function oublierDossier(): Promise<void> {
  await ecrireHandle(null);
}

/** Liste les PDF présents dans le dossier de travail. */
export async function listerFichiers(): Promise<InfoFichier[]> {
  const handle = await lireHandle();
  if (!handle || !(await garantirPermission(handle, false))) return [];
  const fichiers: InfoFichier[] = [];
  // @ts-expect-error — l'itérateur asynchrone `values()` n'est pas encore typé partout.
  for await (const entree of handle.values()) {
    if (entree.kind === 'file' && entree.name.toLowerCase().endsWith('.pdf')) {
      try {
        const f = await entree.getFile();
        fichiers.push({ nom: entree.name, taille: f.size, modifieLe: f.lastModified });
      } catch { /* fichier illisible : ignoré */ }
    }
  }
  return fichiers.sort((a, b) => b.modifieLe - a.modifieLe);
}

/**
 * Écrit (ou remplace) un fichier dans le dossier de travail.
 * Déclenché UNIQUEMENT par un geste utilisateur — jamais par le modèle.
 */
export async function ecrireFichier(nom: string, blob: Blob): Promise<boolean> {
  const handle = await lireHandle();
  if (!handle || !(await garantirPermission(handle, true))) return false;
  try {
    const fichier = await handle.getFileHandle(sanitiser(nom), { create: true });
    const flux = await fichier.createWritable();
    await flux.write(blob);
    await flux.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Supprime un fichier du dossier de travail.
 * L'appelant DOIT avoir obtenu une confirmation explicite de l'utilisateur.
 */
export async function supprimerFichier(nom: string): Promise<boolean> {
  const handle = await lireHandle();
  if (!handle || !(await garantirPermission(handle, true))) return false;
  try {
    await handle.removeEntry(sanitiser(nom));
    return true;
  } catch {
    return false;
  }
}

/** Empêche la traversée de chemin : on ne touche qu'au dossier autorisé. */
function sanitiser(nom: string): string {
  return nom.replace(/[/\\]/g, '_').replace(/\.\.+/g, '_').slice(0, 120);
}
