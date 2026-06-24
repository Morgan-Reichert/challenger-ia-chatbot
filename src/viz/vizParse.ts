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

export type Segment = { type: 'text'; value: string } | { type: 'viz'; value: VizSpec };

const TAG = '[CIA_VIZ:';

export function splitViz(text: string): Segment[] {
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

    // JSON incomplet (streaming) → on masque le fragment et on s'arrête
    if (end === -1) {
      if (idx > textStart) out.push({ type: 'text', value: text.slice(textStart, idx) });
      return out;
    }

    // Crochet fermant attendu
    let close = end + 1;
    while (close < text.length && /\s/.test(text[close])) close++;
    if (text[close] !== ']') {
      if (idx > textStart) out.push({ type: 'text', value: text.slice(textStart, idx) });
      i = end + 1;
      textStart = i;
      continue;
    }

    let spec: VizSpec | null = null;
    try { spec = JSON.parse(text.slice(j, end + 1)) as VizSpec; } catch { spec = null; }

    if (idx > textStart) out.push({ type: 'text', value: text.slice(textStart, idx) });
    if (spec && (spec as VizSpec).kind) out.push({ type: 'viz', value: spec });
    i = close + 1;
    textStart = i;
  }

  if (textStart < text.length) out.push({ type: 'text', value: text.slice(textStart) });
  return out;
}

/** Retire tous les marqueurs visuels — pour la copie et les exports texte. */
export function stripViz(text: string): string {
  return splitViz(text)
    .map((s) => (s.type === 'text' ? s.value : ''))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
