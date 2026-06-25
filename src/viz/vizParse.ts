/**
 * vizParse — extraction des marqueurs [CIA_VIZ:{...}] (logique pure, sans React).
 *
 * Tolérant par conception : un marqueur invalide, mal formé ou incomplet
 * (cas du streaming en cours) est ignoré sans casser le rendu du texte.
 */

export type VizBasis = 'qualitatif' | 'donnees_utilisateur' | 'sources';

export type BalanceSpec = {
  kind: 'balance';
  basis?: VizBasis;
  title?: string;
  pour: string[];
  contre: string[];
};

export type ArgMapSpec = {
  kind: 'argmap';
  basis?: VizBasis;
  title?: string;
  premises: { text: string; flaw?: string | null }[];
  conclusion: string;
};

export type ConfidenceLevel = 'non_verifie' | 'a_confirmer' | 'etaye' | 'solide';
export type ConfidenceSpec = {
  kind: 'confidence';
  level: ConfidenceLevel;
  claim?: string;
  note?: string;
};

export type VizSpec = BalanceSpec | ArgMapSpec | ConfidenceSpec;

export type Segment =
  | { type: 'text'; value: string }
  | { type: 'viz'; value: VizSpec }
  | { type: 'vizfail' }; // marqueur détecté mais JSON invalide → fallback visible

const TAG = '[CIA_VIZ:';

/** Parse JSON en réparant les petites fautes fréquentes des LLM (virgules
 *  traînantes, fences ```json, guillemets « » utilisés comme délimiteurs). */
function tolerantParse(raw: string): VizSpec | null {
  const attempts = [
    raw,
    raw.replace(/,\s*([}\]])/g, '$1'), // virgules traînantes
    raw.replace(/,\s*([}\]])/g, '$1').replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'"),
  ];
  for (const a of attempts) {
    try {
      const parsed = JSON.parse(a) as VizSpec;
      if (parsed && (parsed as VizSpec).kind) return parsed;
    } catch { /* tentative suivante */ }
  }
  return null;
}

export function splitViz(text: string, opts: { streaming?: boolean } = {}): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  let textStart = 0;

  while (i < text.length) {
    const idx = text.indexOf(TAG, i);
    if (idx === -1) break;

    // Début de l'objet JSON
    let j = idx + TAG.length;
    while (j < text.length && text[j] !== '{') j++;
    if (text[j] !== '{') {
      if (idx > textStart) out.push({ type: 'text', value: text.slice(textStart, idx) });
      i = idx + TAG.length;
      textStart = i;
      continue;
    }

    // Comptage d'accolades en ignorant les chaînes
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let k = j; k < text.length; k++) {
      const ch = text[k];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = k; break; } }
    }

    // Objet non terminé
    if (end === -1) {
      if (idx > textStart) out.push({ type: 'text', value: text.slice(textStart, idx) });
      // En streaming → fragment partiel attendu : on masque et on s'arrête.
      // En final → marqueur cassé : on signale au lieu de disparaître.
      if (!opts.streaming) out.push({ type: 'vizfail' });
      return out;
    }

    // Crochet fermant attendu
    let close = end + 1;
    while (close < text.length && /\s/.test(text[close])) close++;
    if (text[close] !== ']') {
      if (idx > textStart) out.push({ type: 'text', value: text.slice(textStart, idx) });
      if (!opts.streaming) out.push({ type: 'vizfail' });
      i = end + 1;
      textStart = i;
      continue;
    }

    const spec = tolerantParse(text.slice(j, end + 1));

    if (idx > textStart) out.push({ type: 'text', value: text.slice(textStart, idx) });
    if (spec) out.push({ type: 'viz', value: spec });
    else if (!opts.streaming) out.push({ type: 'vizfail' });
    i = close + 1;
    textStart = i;
  }

  if (textStart < text.length) out.push({ type: 'text', value: text.slice(textStart) });
  return out;
}

/**
 * Répare les titres Markdown mal formés par le LLM pour qu'ils s'affichent
 * toujours comme de vrais titres (et jamais en "## …" littéral) :
 *  - **## Titre**  → ## Titre   (titre encadré de gras)
 *  - ##Titre       → ## Titre   (espace manquante après les dièses)
 */
export function normalizeMd(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      // Titre entouré de ** ** → on retire le gras
      let l = line.replace(/^(\s*)\*\*\s*(#{1,6})\s*(.+?)\s*\*\*\s*$/, '$1$2 $3');
      // Dièses collés au titre → on insère l'espace
      l = l.replace(/^(\s*)(#{1,6})([^#\s])/, '$1$2 $3');
      return l;
    })
    .join('\n');
}

/** Retire tous les marqueurs visuels — pour la copie et les exports texte. */
export function stripViz(text: string): string {
  return splitViz(text)
    .map((s) => (s.type === 'text' ? s.value : ''))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
