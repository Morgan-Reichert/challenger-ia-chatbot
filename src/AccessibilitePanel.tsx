/**
 * Réglages d'accessibilité — taille du texte, contraste, mouvement.
 *
 * Les préférences sont appliquées immédiatement à chaque changement : un
 * réglage d'accessibilité qu'il faut valider avant d'en voir l'effet oblige à
 * naviguer à l'aveugle, ce qui est précisément ce qu'on cherche à éviter.
 */
import { useCallback, useEffect, useState } from 'react';
import { Accessibility, Type, Contrast, Zap } from 'lucide-react';
import {
  type PreferencesA11y, type TailleTexte, type Mouvement,
  chargerA11y, enregistrerA11y, appliquerA11y,
} from './accessibilite';

const TAILLES: { valeur: TailleTexte; label: string }[] = [
  { valeur: 'normal',     label: 'Normale' },
  { valeur: 'grand',      label: 'Grande' },
  { valeur: 'tres-grand', label: 'Très grande' },
];

const MOUVEMENTS: { valeur: Mouvement; label: string; hint: string }[] = [
  { valeur: 'systeme', label: 'Suivre le système', hint: 'Reprend le réglage de votre appareil' },
  { valeur: 'reduit',  label: 'Réduire',           hint: 'Supprime animations et défilements animés' },
  { valeur: 'complet', label: 'Conserver',         hint: 'Animations complètes, même si le système les réduit' },
];

export default function AccessibilitePanel() {
  const [prefs, setPrefs] = useState<PreferencesA11y>(chargerA11y);

  // Le réglage « suivre le système » doit rester vivant : si l'utilisateur
  // active la réduction de mouvement dans son OS pendant la session, l'app
  // doit s'aligner sans rechargement.
  useEffect(() => {
    if (prefs.mouvement !== 'systeme' || typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const suivre = () => appliquerA11y(prefs);
    mq.addEventListener('change', suivre);
    return () => mq.removeEventListener('change', suivre);
  }, [prefs]);

  const modifier = useCallback((patch: Partial<PreferencesA11y>) => {
    setPrefs((actuelles) => {
      const suivantes = { ...actuelles, ...patch };
      enregistrerA11y(suivantes);
      appliquerA11y(suivantes);
      return suivantes;
    });
  }, []);

  return (
    <div className="border-2 border-[#141414]/10 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
        <div className="w-8 h-8 flex items-center justify-center"
             style={{ background: '#0EA5E912', border: '1.5px solid #0EA5E930' }}>
          <Accessibility className="w-4 h-4 text-[#0EA5E9]" />
        </div>
        <h2 className="text-[11px] font-black uppercase tracking-widest text-[#0EA5E9]">Accessibilité</h2>
      </div>

      <div className="px-5 py-4 space-y-5">

        {/* ── Taille du texte ── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Type className="w-3.5 h-3.5 text-[#141414]/40" />
            <p className="text-[11px] font-black text-[#141414]">Taille du texte</p>
          </div>
          <p className="text-[10px] text-[#141414]/45 mb-2.5">
            S&apos;applique à toute l&apos;interface, y compris les réponses de l&apos;IA.
          </p>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Taille du texte">
            {TAILLES.map((t) => (
              <button
                key={t.valeur}
                role="radio"
                aria-checked={prefs.tailleTexte === t.valeur}
                onClick={() => modifier({ tailleTexte: t.valeur })}
                className={
                  'flex-1 px-3 py-2 border-2 text-[10px] font-black uppercase tracking-widest transition-colors '
                  + (prefs.tailleTexte === t.valeur
                    ? 'border-[#0EA5E9] text-[#0EA5E9] bg-[#0EA5E9]/[0.06]'
                    : 'border-[#141414]/10 text-[#141414]/40 hover:border-[#141414]/25')
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Contraste ── */}
        <div className="border-t border-[#141414]/8 pt-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Contrast className="w-3.5 h-3.5 text-[#141414]/40" />
              <p className="text-[11px] font-black text-[#141414]">Contraste renforcé</p>
            </div>
            <p className="text-[10px] text-[#141414]/45 mt-1 leading-relaxed">
              Assombrit les textes secondaires et densifie les bordures. Les teintes
              sourdes de l&apos;interface passent sous le seuil de lisibilité recommandé.
            </p>
          </div>
          <button
            onClick={() => modifier({ contrasteRenforce: !prefs.contrasteRenforce })}
            role="switch"
            aria-checked={prefs.contrasteRenforce}
            aria-label="Contraste renforcé"
            className="flex-shrink-0 mt-0.5 relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none"
            style={{ backgroundColor: prefs.contrasteRenforce ? '#0EA5E9' : '#D1D5DB' }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
              style={{ transform: prefs.contrasteRenforce ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </button>
        </div>

        {/* ── Mouvement ── */}
        <div className="border-t border-[#141414]/8 pt-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Zap className="w-3.5 h-3.5 text-[#141414]/40" />
            <p className="text-[11px] font-black text-[#141414]">Animations</p>
          </div>
          <div className="space-y-1.5" role="radiogroup" aria-label="Animations">
            {MOUVEMENTS.map((m) => (
              <button
                key={m.valeur}
                role="radio"
                aria-checked={prefs.mouvement === m.valeur}
                onClick={() => modifier({ mouvement: m.valeur })}
                className={
                  'w-full flex items-center gap-3 px-3 py-2.5 border-2 text-left transition-colors '
                  + (prefs.mouvement === m.valeur
                    ? 'border-[#0EA5E9] bg-[#0EA5E9]/[0.06]'
                    : 'border-[#141414]/10 hover:border-[#141414]/25')
                }
              >
                <span
                  className="w-3 h-3 rounded-full border-2 flex-shrink-0"
                  style={{
                    borderColor: prefs.mouvement === m.valeur ? '#0EA5E9' : 'rgba(20,20,20,0.2)',
                    background: prefs.mouvement === m.valeur ? '#0EA5E9' : 'transparent',
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-[11px] font-black text-[#141414]">{m.label}</span>
                  <span className="block text-[10px] text-[#141414]/45">{m.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
