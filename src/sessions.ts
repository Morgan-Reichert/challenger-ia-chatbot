/**
 * Registre des appareils connectés.
 *
 * Firebase n'expose pas la liste des sessions d'un compte : elle est tenue
 * ici, alimentée à chaque ouverture de l'application. Le jeton local sert
 * uniquement à reconnaître « cet appareil-ci » dans la liste — il n'a aucune
 * valeur d'authentification et n'ouvre aucun accès.
 */
import { apiFetch } from './apiClient';

const CLE_JETON = 'challenger:session';

export type SessionEnregistree = {
  id: string;
  jeton: string;
  appareil: string | null;
  cree_le: string;
  vu_le: string;
};

/** Jeton local, créé au besoin et stable pour cet appareil. */
export function jetonLocal(): string {
  if (typeof localStorage === 'undefined') return 'inconnu';
  let j = localStorage.getItem(CLE_JETON);
  if (!j) {
    j = crypto.randomUUID();
    localStorage.setItem(CLE_JETON, j);
  }
  return j;
}

/**
 * Libellé lisible de l'appareil, déduit de l'User-Agent.
 *
 * Volontairement grossier : il sert à ce que l'utilisateur reconnaisse ses
 * propres sessions, pas à identifier finement une machine. Un relevé détaillé
 * constituerait une empreinte, donc une donnée personnelle de plus.
 */
export function decrireAppareil(): string {
  if (typeof navigator === 'undefined') return 'Appareil inconnu';
  const ua = navigator.userAgent;

  const navigateur =
      /Edg\//.test(ua)                        ? 'Edge'
    : /OPR\//.test(ua)                        ? 'Opera'
    : /Firefox\//.test(ua)                    ? 'Firefox'
    : /Chrome\//.test(ua)                     ? 'Chrome'
    : /Safari\//.test(ua)                     ? 'Safari'
    : 'Navigateur';

  const systeme =
      /iPhone|iPad|iPod/.test(ua)             ? 'iOS'
    : /Android/.test(ua)                      ? 'Android'
    : /Mac OS X/.test(ua)                     ? 'macOS'
    : /Windows/.test(ua)                      ? 'Windows'
    : /Linux/.test(ua)                        ? 'Linux'
    : 'système inconnu';

  return `${navigateur} sur ${systeme}`;
}

/** Signale la session courante. Silencieux en cas d'échec : rien de bloquant. */
export async function signalerSession(): Promise<void> {
  try {
    await apiFetch('/api/account?resource=sessions', {
      method: 'POST',
      body: JSON.stringify({ jeton: jetonLocal(), appareil: decrireAppareil() }),
    });
  } catch { /* le registre est un confort, pas un prérequis */ }
}

export async function listerSessions(): Promise<SessionEnregistree[]> {
  const res = await apiFetch('/api/account?resource=sessions', { cache: 'no-store' });
  if (!res.ok) return [];
  const d = await res.json();
  return d.sessions ?? [];
}

/**
 * Déconnecte tous les appareils, celui-ci compris.
 *
 * Firebase ne sait pas révoquer un appareil en particulier : `revokeRefreshTokens`
 * invalide l'ensemble des jetons du compte. C'est dit tel quel dans l'interface,
 * plutôt que de laisser croire à une révocation sélective.
 */
export async function revoquerToutesLesSessions(): Promise<boolean> {
  const res = await apiFetch('/api/account?resource=sessions', { method: 'DELETE' });
  return res.ok;
}
