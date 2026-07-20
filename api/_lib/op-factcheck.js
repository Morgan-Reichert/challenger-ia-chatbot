/**
 * Opération « factcheck » — vérification factuelle multidimensionnelle.
 * Logique pure, appelée par api/v1/[action].js.
 */
const SYSTEME = `Tu es un MOTEUR DE FACT-CHECKING systémique et probabiliste.

RÈGLES FONDAMENTALES (impératives) :
- Ne confonds JAMAIS « absence de preuve » et « preuve d'absence ». Si les données manquent, dis-le explicitement.
- Sépare trois évaluations distinctes : FACTUELLE, RISQUE, CONSENSUS. Le consensus n'est jamais assimilé à la vérité.
- La confiance mesure la ROBUSTESSE DES PREUVES, pas une vérité absolue.
- Évalue les sources de façon critique : indépendance, conflits d'intérêts, biais.
- Tu n'inventes JAMAIS de chiffre non sourçable.

Tu réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans bloc de code, à ce format EXACT :
{
  "fact": "vrai|probable_vrai|inconnu|non_verifie|inconcluant|probable_faux|faux",
  "risk": "safe|faible|modere|dangereux|critique",
  "consensus": "fort|modere|debattu|controverse|marginal",
  "confidence": "speculatif|faible|plausible|eleve|quasi_certain",
  "resume": "synthèse en une à deux phrases",
  "analyse": "justification détaillée",
  "limites": "ce qui manque pour conclure",
  "contre_hypotheses": "hypothèses alternatives et biais possibles"
}
Réponds en français.`;

const VALEURS = {
  fact: ['vrai', 'probable_vrai', 'inconnu', 'non_verifie', 'inconcluant', 'probable_faux', 'faux'],
  risk: ['safe', 'faible', 'modere', 'dangereux', 'critique'],
  consensus: ['fort', 'modere', 'debattu', 'controverse', 'marginal'],
  confidence: ['speculatif', 'faible', 'plausible', 'eleve', 'quasi_certain'],
};

/** Recherche web optionnelle. Échoue en silence : l'analyse reste possible sans. */
async function chercher(requete) {
  const cle = process.env.TAVILY_API_KEY;
  if (!cle) return { contexte: '', sources: [] };
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: cle, query: requete, search_depth: 'advanced',
        max_results: 6, include_answer: 'advanced',
      }),
    });
    if (!r.ok) return { contexte: '', sources: [] };
    const d = await r.json();
    const sources = (d.results || []).slice(0, 6).map((s, i) => ({
      n: i + 1, titre: s.title, url: s.url,
    }));
    const contexte = [
      d.answer ? `Synthèse : ${d.answer}` : '',
      ...sources.map((s, i) => `[${s.n}] ${s.titre} — ${s.url}\n${(d.results[i]?.content || '').slice(0, 500)}`),
    ].filter(Boolean).join('\n\n');
    return { contexte, sources };
  } catch {
    return { contexte: '', sources: [] };
  }
}

/** Extraction tolérante : le modèle encadre parfois son JSON de texte. */
function extraireJson(texte) {
  try { return JSON.parse(texte); } catch { /* on tente une extraction */ }
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export const traiterFactcheck = {
  valider(corps) {
    const { affirmation, recherche_web = true } = corps;
    if (typeof affirmation !== 'string' || affirmation.trim().length < 3) {
      return { ok: false, message: 'Le champ « affirmation » est requis (3 caractères minimum).' };
    }
    if (affirmation.length > 2000) {
      return { ok: false, message: '« affirmation » dépasse 2000 caractères.' };
    }
    return { ok: true, valeurs: { affirmation, recherche_web } };
  },

  async executer({ affirmation, recherche_web }, { appelerModele }) {
    const { contexte, sources } = recherche_web
      ? await chercher(affirmation)
      : { contexte: '', sources: [] };

    const utilisateur = contexte
      ? `Affirmation à vérifier : ${affirmation}\n\nSources disponibles :\n${contexte}`
      : `Affirmation à vérifier : ${affirmation}\n\n(Aucune source web fournie : fonde ton évaluation sur tes connaissances et signale-le dans les limites.)`;

    const r = await appelerModele({ systeme: SYSTEME, utilisateur, modele: 'mistral-large-latest', temperature: 0.3 });
    if (!r.ok) return { ok: false, statut: r.statut, erreur: 'modele_indisponible', message: r.message };

    const brut = extraireJson(r.texte);
    if (!brut) {
      return { ok: false, statut: 502, erreur: 'reponse_illisible',
               message: "Le modèle n'a pas produit un verdict exploitable." };
    }

    // Toute valeur hors énumération est ramenée à l'état le plus prudent :
    // mieux vaut « inconnu » qu'une catégorie inventée.
    const norm = (champ, defaut) => (VALEURS[champ].includes(brut[champ]) ? brut[champ] : defaut);

    return { ok: true, corps: {
      affirmation,
      verdict: {
        fact: norm('fact', 'inconnu'),
        risk: norm('risk', 'faible'),
        consensus: norm('consensus', 'debattu'),
        confidence: norm('confidence', 'faible'),
      },
      resume: brut.resume ?? '',
      analyse: brut.analyse ?? '',
      limites: brut.limites ?? '',
      contre_hypotheses: brut.contre_hypotheses ?? '',
      base: sources.length ? 'sources' : 'qualitatif',
      sources,
      usage: r.usage,
    } };
  },
};
