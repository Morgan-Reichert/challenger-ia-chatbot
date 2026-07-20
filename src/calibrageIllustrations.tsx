/**
 * Illustrations du calibrage — SVG intégré, aucune ressource externe.
 *
 * Le vocabulaire est celui du reste de l'application : traits de 2 px, angles
 * vifs, aucun arrondi, un seul accent coloré. Chaque figure est abstraite et
 * géométrique plutôt que figurative : un pictogramme littéral (une horloge,
 * un cerveau) daterait vite et tirerait l'écran vers l'illustration de stock.
 *
 * Les figures s'animent au montage par `stroke-dashoffset` — le tracé se
 * dessine. L'effet est décoratif : `aria-hidden` les retire des lecteurs
 * d'écran, dont l'utilisateur n'a que faire ici.
 */

const ACCENT = '#5D7BFF';
const ENCRE = '#141414';

type Props = { className?: string };

const base = {
  viewBox: '0 0 120 120',
  fill: 'none',
  strokeWidth: 2,
  strokeLinecap: 'square' as const,
  'aria-hidden': true,
};

/** Enveloppe commune : cadre décalé, signature visuelle de l'application. */
function Cadre({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg {...base} className={className ?? 'w-full h-full'}>
      <rect x="4" y="4" width="104" height="104" stroke={ENCRE} strokeOpacity="0.12" />
      <rect x="12" y="12" width="104" height="104" stroke={ENCRE} strokeOpacity="0.06" />
      {children}
    </svg>
  );
}

/** Identité — une marque unique parmi des répétitions. */
export function IllusIdentite({ className }: Props) {
  return (
    <Cadre className={className}>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={34 + i * 26} cy="60" r="11" stroke={ENCRE} strokeOpacity="0.18" />
      ))}
      <circle cx="60" cy="60" r="11" fill={ACCENT} />
      <line x1="60" y1="26" x2="60" y2="38" stroke={ACCENT} />
    </Cadre>
  );
}

/** Contexte d'usage — deux territoires séparés par une frontière nette. */
export function IllusContexte({ className }: Props) {
  return (
    <Cadre className={className}>
      <rect x="22" y="34" width="34" height="52" stroke={ENCRE} strokeOpacity="0.25" />
      <rect x="64" y="34" width="34" height="52" stroke={ACCENT} />
      <line x1="60" y1="24" x2="60" y2="96" stroke={ENCRE} strokeOpacity="0.15" strokeDasharray="3 5" />
      <line x1="70" y1="50" x2="92" y2="50" stroke={ACCENT} />
      <line x1="70" y1="60" x2="86" y2="60" stroke={ACCENT} strokeOpacity="0.6" />
      <line x1="70" y1="70" x2="90" y2="70" stroke={ACCENT} strokeOpacity="0.35" />
    </Cadre>
  );
}

/** Contradiction — une trajectoire déviée par un obstacle. */
export function IllusContradiction({ className }: Props) {
  return (
    <Cadre className={className}>
      <line x1="20" y1="60" x2="54" y2="60" stroke={ENCRE} strokeOpacity="0.3" />
      <line x1="60" y1="30" x2="60" y2="90" stroke={ACCENT} />
      <polyline points="66,60 82,42 100,42" stroke={ACCENT} />
      <polyline points="94,36 100,42 94,48" stroke={ACCENT} />
      <polyline points="66,60 82,78 100,78" stroke={ENCRE} strokeOpacity="0.18" strokeDasharray="3 4" />
    </Cadre>
  );
}

/** Décision — trois appuis inégaux sous un même plateau. */
export function IllusDecision({ className }: Props) {
  return (
    <Cadre className={className}>
      <line x1="24" y1="44" x2="96" y2="44" stroke={ENCRE} />
      <rect x="34" y="52" width="14" height="34" stroke={ENCRE} strokeOpacity="0.22" />
      <rect x="53" y="52" width="14" height="46" fill={ACCENT} />
      <rect x="72" y="52" width="14" height="26" stroke={ENCRE} strokeOpacity="0.22" />
      <line x1="60" y1="24" x2="60" y2="44" stroke={ACCENT} />
    </Cadre>
  );
}

/** Temps disponible — trois amplitudes, une seule retenue. */
export function IllusTemps({ className }: Props) {
  return (
    <Cadre className={className}>
      {[
        { y: 42, x1: 40, x2: 80, o: 0.2 },
        { y: 60, x1: 26, x2: 94, o: 1 },
        { y: 78, x1: 52, x2: 68, o: 0.2 },
      ].map((l) => (
        <g key={l.y}>
          <line x1={l.x1} y1={l.y} x2={l.x2} y2={l.y}
                stroke={l.o === 1 ? ACCENT : ENCRE} strokeOpacity={l.o} />
          <line x1={l.x1} y1={l.y - 6} x2={l.x1} y2={l.y + 6}
                stroke={l.o === 1 ? ACCENT : ENCRE} strokeOpacity={l.o} />
          <line x1={l.x2} y1={l.y - 6} x2={l.x2} y2={l.y + 6}
                stroke={l.o === 1 ? ACCENT : ENCRE} strokeOpacity={l.o} />
        </g>
      ))}
    </Cadre>
  );
}

/** Domaines — une constellation dont quelques points s'allument. */
export function IllusDomaines({ className }: Props) {
  const points = [
    [34, 38], [60, 30], [86, 44], [28, 62], [56, 58],
    [90, 68], [40, 84], [68, 86],
  ];
  const allumes = new Set([1, 4, 6]);
  return (
    <Cadre className={className}>
      <polyline points="60,30 56,58 40,84" stroke={ACCENT} strokeOpacity="0.35" />
      {points.map(([x, y], i) => (
        allumes.has(i)
          ? <rect key={i} x={x - 4} y={y - 4} width="8" height="8" fill={ACCENT} />
          : <rect key={i} x={x - 3} y={y - 3} width="6" height="6" stroke={ENCRE} strokeOpacity="0.2" />
      ))}
    </Cadre>
  );
}

/** Parcours — un chemin irrégulier jusqu'au présent. */
export function IllusParcours({ className }: Props) {
  return (
    <Cadre className={className}>
      <polyline points="24,84 42,68 54,76 72,44 88,52 96,34"
                stroke={ENCRE} strokeOpacity="0.25" />
      <circle cx="96" cy="34" r="5" fill={ACCENT} />
      <line x1="24" y1="94" x2="96" y2="94" stroke={ENCRE} strokeOpacity="0.1" />
    </Cadre>
  );
}

/** Bilan — des éléments épars qui s'alignent. */
export function IllusBilan({ className }: Props) {
  return (
    <Cadre className={className}>
      {[38, 52, 66, 80].map((y, i) => (
        <line key={y} x1={30} y1={y} x2={30 + [18, 42, 30, 54][i]} y2={y} stroke={ACCENT}
              strokeOpacity={0.3 + i * 0.22} />
      ))}
      <line x1="30" y1="28" x2="30" y2="90" stroke={ENCRE} />
      <circle cx="30" cy="60" r="4" fill={ACCENT} />
    </Cadre>
  );
}
