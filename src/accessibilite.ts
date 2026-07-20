/**
 * Préférences d'accessibilité.
 *
 * Trois réglages, appliqués en posant des attributs `data-*` sur <html> : le
 * CSS s'y accroche, ce qui évite de faire transiter ces préférences par le
 * rendu React et donc de re-rendre l'arbre entier à chaque changement.
 *
 * Le mouvement réduit suit le système par défaut (`prefers-reduced-motion`)
 * mais reste surchargeable : un utilisateur peut vouloir couper les animations
 * ici sans toucher aux réglages de son OS, ou l'inverse.
 *
 * Directive (UE) 2019/882 « European Accessibility Act », applicable aux
 * services numériques grand public depuis le 28 juin 2025.
 */

export type TailleTexte = 'normal' | 'grand' | 'tres-grand';
export type Mouvement = 'systeme' | 'reduit' | 'complet';

export type PreferencesA11y = {
  tailleTexte: TailleTexte;
  contrasteRenforce: boolean;
  mouvement: Mouvement;
};

export const A11Y_DEFAUT: PreferencesA11y = {
  tailleTexte: 'normal',
  contrasteRenforce: false,
  mouvement: 'systeme',
};

const CLE = 'challenger:a11y';

/** Facteur appliqué à la taille de police racine. */
export const ECHELLES: Record<TailleTexte, number> = {
  'normal': 1,
  'grand': 1.15,
  'tres-grand': 1.3,
};

export function chargerA11y(): PreferencesA11y {
  if (typeof localStorage === 'undefined') return A11Y_DEFAUT;
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return A11Y_DEFAUT;
    // Fusion avec les valeurs par défaut : un réglage ajouté après coup ne doit
    // pas rendre illisible une préférence enregistrée par une version antérieure.
    return { ...A11Y_DEFAUT, ...(JSON.parse(brut) as Partial<PreferencesA11y>) };
  } catch {
    return A11Y_DEFAUT;
  }
}

export function enregistrerA11y(prefs: PreferencesA11y): void {
  try { localStorage.setItem(CLE, JSON.stringify(prefs)); } catch { /* stockage indisponible */ }
}

/** Pose les préférences sur <html>. Sans effet hors navigateur (rendu serveur). */
export function appliquerA11y(prefs: PreferencesA11y): void {
  if (typeof document === 'undefined') return;
  const racine = document.documentElement;

  racine.style.setProperty('--echelle-texte', String(ECHELLES[prefs.tailleTexte]));
  racine.dataset.contraste = prefs.contrasteRenforce ? 'renforce' : 'normal';

  const systemeReduit = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduit = prefs.mouvement === 'reduit'
    || (prefs.mouvement === 'systeme' && systemeReduit);
  racine.dataset.mouvement = reduit ? 'reduit' : 'complet';
}
