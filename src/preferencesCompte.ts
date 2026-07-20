/**
 * Préférences de compte partagées entre l'appareil et le serveur.
 *
 * Elles sont conservées côté serveur, et non en stockage local : les
 * notifications sont émises par une tâche planifiée qui n'a aucun accès au
 * navigateur, et un refus qui ne vaudrait que sur un appareil ne serait pas
 * un refus.
 */
import { apiFetch } from './apiClient';

export type CategoriesNotification = {
  defi_du_jour: boolean;
  relances: boolean;
  nouveautes: boolean;
};

export type PreferencesCompte = {
  notifications: CategoriesNotification;
  reutilisation_conversations: boolean;
};

export const PREFERENCES_DEFAUT: PreferencesCompte = {
  notifications: { defi_du_jour: true, relances: true, nouveautes: true },
  // Faux par défaut : réutiliser des conversations suppose un accord, et
  // l'absence de réponse ne vaut pas accord.
  reutilisation_conversations: false,
};

export const LIBELLES_NOTIFICATION: {
  cle: keyof CategoriesNotification;
  titre: string;
  desc: string;
}[] = [
  { cle: 'defi_du_jour', titre: 'Défi du jour',
    desc: 'Un rappel quotidien du défi et de son crédit offert.' },
  { cle: 'relances',     titre: 'Relances',
    desc: "Un rappel après plusieurs jours sans session." },
  { cle: 'nouveautes',   titre: 'Nouveautés',
    desc: 'Les évolutions importantes du produit. Rare.' },
];

export async function chargerPreferences(): Promise<PreferencesCompte> {
  try {
    const res = await apiFetch('/api/account?resource=preferences', { cache: 'no-store' });
    if (!res.ok) return PREFERENCES_DEFAUT;
    const d = await res.json();
    return {
      notifications: { ...PREFERENCES_DEFAUT.notifications, ...(d.notifications ?? {}) },
      reutilisation_conversations: d.reutilisation_conversations === true,
    };
  } catch {
    return PREFERENCES_DEFAUT;
  }
}

export async function enregistrerPreferences(patch: Partial<PreferencesCompte>): Promise<boolean> {
  try {
    const res = await apiFetch('/api/account?resource=preferences', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}
