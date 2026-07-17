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

// ─── Verdict (Fact-Checker V2) — analyse multi-dimensionnelle ────────────────────
export type FactVerdict =
  | 'vrai' | 'probable_vrai' | 'inconnu' | 'non_verifie'
  | 'inconcluant' | 'probable_faux' | 'faux';
export type RiskLevel = 'safe' | 'faible' | 'modere' | 'dangereux' | 'critique';
export type ConsensusLevel = 'fort' | 'modere' | 'debattu' | 'controverse' | 'marginal';
// Bandes qualitatives (jamais un décimal fabriqué) : robustesse des preuves.
export type ConfidenceBand = 'speculatif' | 'faible' | 'plausible' | 'eleve' | 'quasi_certain';

export type VerdictSpec = {
  kind: 'verdict';
  basis?: VizBasis;
  claim?: string;
  fact: FactVerdict;
  risk: RiskLevel;
  consensus: ConsensusLevel;
  confidence: ConfidenceBand;
  note?: string;
};

export type VizSpec = BalanceSpec | ArgMapSpec | ConfidenceSpec | VerdictSpec;

export type Segment =
  | { type: 'text'; value: string }
  | { type: 'viz'; value: VizSpec }
  | { type: 'vizfail' }; // marqueur détecté mais JSON invalide → fallback visible

const TAG = '[CIA_VIZ:';

/** Dernier recours pour un verdict : extraire les champs à énumération par regex,
 *  même si le JSON est cassé (guillemets droits dans claim/note, etc.). Les
 *  champs fact/risk/consensus/confidence sont des valeurs fixes → très fiables. */
function extractVerdict(raw: string): VerdictSpec | null {
  if (!/["']?kind["']?\s*:\s*["']?verdict/.test(raw)) return null;
  const g = (k: string) => {
    const m = raw.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`));
    return m?.[1]?.trim();
  };
  const fact = g('fact'), risk = g('risk'), consensus = g('consensus'), confidence = g('confidence');
  if (!fact || !risk || !consensus || !confidence) return null;
  const basis = g('basis');
  return {
    kind: 'verdict',
    basis: (basis === 'sources' || basis === 'donnees_utilisateur' || basis === 'qualitatif') ? basis : undefined,
    claim: g('claim'),
    fact: fact as VerdictSpec['fact'],
    risk: risk as VerdictSpec['risk'],
    consensus: consensus as VerdictSpec['consensus'],
    confidence: confidence as VerdictSpec['confidence'],
    note: g('note'),
  };
}

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
  // Dernier recours ciblé pour le verdict (le plus fréquent en Fact-Check V2)
  return extractVerdict(raw);
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
  // Marqueur caché de profil cognitif : masqué à l'affichage (même partiel en streaming, il est toujours en fin)
  text = text.replace(/\[CIA_BIAS:[\s\S]*$/, '').trimEnd();
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
  text = text.replace(/\[CIA_BIAS:[\s\S]*$/, '');
  return splitViz(text)
    .map((s) => (s.type === 'text' ? s.value : ''))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
