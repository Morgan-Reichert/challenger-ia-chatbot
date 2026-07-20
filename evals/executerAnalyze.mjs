/**
 * Banc d'essai de l'analyse de raisonnement.
 *
 *   node evals/executerAnalyze.mjs [repetitions]
 *
 * Troisième point d'entrée de l'API publique, facturé aux développeurs, et
 * jamais éprouvé jusqu'ici.
 *
 * Comme pour la vérification factuelle, la mesure porte sur une EXACTITUDE et
 * non sur une simple conformité : le corpus documente la faille délibérément
 * placée dans chaque thèse faible, et l'on vérifie que l'analyse la retrouve.
 *
 * Trois mesures distinctes :
 *   1. Rappel — la faille connue est-elle détectée, sous le bon code ?
 *   2. Faux positifs — des biais sont-ils rapportés sur des thèses solides ?
 *   3. Couverture de la taxonomie — combien de failles réelles n'ont
 *      simplement aucun code disponible ?
 */
import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { traiterAnalyze } from '../api/_lib/op-analyze.js';
import { adaptateurMistral } from './adaptateurs.mjs';
import { GENERALISTE, DOMAINES } from './corpus.mjs';

const REPETITIONS = Number(process.argv[2] ?? 2);
const CONCURRENCE = 1;   // mistral-large plafonne tres bas : 32 refus sur 62 a 2

/**
 * Correspondance entre les failles du corpus et la taxonomie du produit.
 *
 * `null` signale une faille RÉELLE que la taxonomie ne sait pas nommer : ce
 * n'est pas un défaut du modèle mais une lacune du référentiel, et il faut la
 * compter séparément sous peine d'imputer à l'analyse un échec qui ne lui
 * appartient pas.
 */
const CORRESPONDANCE = {
  'généralisation abusive à partir d’un cas unique': 'generalisation_abusive',
  'généralisation abusive': 'generalisation_abusive',
  'corrélation présentée comme causalité': 'correlation_causalite',
  'causalité inversée': 'correlation_causalite',
  'faux dilemme': 'faux_dilemme',
  'pente glissante': 'pente_glissante',
  'argument d’autorité': 'appel_autorite',
  'homme de paille': 'homme_de_paille',
  'anecdote érigée en preuve': 'anecdote',
  'pétition de principe': 'petition_principe',
  'recette universelle': 'generalisation_abusive',
  'biais du survivant': 'biais_survivant',
  'appel à la nature': 'appel_nature',
  'affirmation non falsifiable': 'non_falsifiable',
  'chiffre non sourçable': 'chiffre_non_source',
  'analogie trompeuse ménage/État': 'analogie_trompeuse',
  'confusion consensus/unanimité': 'consensus_unanimite',
  'appel à l’ignorance': 'appel_ignorance',
  'prédiction sans mécanisme': 'prediction_sans_mecanisme',
  'déterminisme technologique': 'determinisme',
  'théorie invalidée présentée comme acquise': 'theorie_invalidee',
  'nostalgie érigée en argument': null,
  'métrique confondue avec l’objectif': 'metrique_objectif',
  'confusion légalité/légitimité': 'legalite_legitimite',
  'appel à la tradition': 'appel_tradition',
  'passage indu de l’être au devoir-être': 'etre_devoir_etre',
};

function env() {
  const e = {};
  for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    if (!l.includes('=') || l.trim().startsWith('#')) continue;
    const [k, ...r] = l.split('=');
    e[k.trim()] = r.join('=').trim().replace(/^["']|["']$/g, '');
  }
  return e;
}

async function enParallele(taches, largeur) {
  let curseur = 0;
  await Promise.all(Array.from({ length: Math.min(largeur, taches.length) }, async () => {
    for (;;) {
      const i = curseur++;
      if (i >= taches.length) return;
      await taches[i]();
    }
  }));
}

async function principal() {
  const e = env();
  for (const [k, v] of Object.entries(e)) if (!process.env[k]) process.env[k] = v;
  if (!e.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY absente');
  const appelerModele = adaptateurMistral(e.MISTRAL_API_KEY, 'mistral-large-latest');

  const corpus = [
    ...GENERALISTE,
    ...DOMAINES.flatMap((d) => d.theses.map((t) => ({ ...t, domaine: d.domaine }))),
  ];

  const dossier = new URL('./resultats/', import.meta.url);
  mkdirSync(dossier, { recursive: true });
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const journal = new URL(`./analyze_${horodatage}.jsonl`, dossier);
  const meta = new URL(`./analyze_${horodatage}.meta.json`, dossier);

  const taches = [];
  for (let rep = 1; rep <= REPETITIONS; rep++) {
    for (const t of corpus) {
      taches.push(async () => {
        const debut = new Date().toISOString();
        const t0 = Date.now();
        const v = traiterAnalyze.valider({ texte: t.these });
        if (!v.ok) {
          appendFileSync(journal, JSON.stringify({ ...t, repetition: rep, ok: false, erreur: 'validation', message: v.message }) + '\n');
          return;
        }
        const r = await traiterAnalyze.executer(v.valeurs, { appelerModele });
        const msTotal = Date.now() - t0;
        const base = { id: t.id, force: t.force, faille: t.faille ?? null, domaine: t.domaine ?? null,
                       these: t.these, repetition: rep, debut, fin: new Date().toISOString(), msTotal };
        if (!r.ok) {
          appendFileSync(journal, JSON.stringify({ ...base, ok: false, erreur: r.erreur, message: r.message }) + '\n');
          return;
        }

        const attendu = t.faille ? CORRESPONDANCE[t.faille] : undefined;
        const codesDetectes = r.corps.biais.map((b) => b.code);

        appendFileSync(journal, JSON.stringify({
          ...base, ok: true,
          biais: r.corps.biais, forces: r.corps.forces, synthese: r.corps.synthese,
          usage: r.corps.usage,
          evaluation: {
            // `attendu === undefined` : thèse solide, aucun biais n'est attendu.
            // `attendu === null`      : faille réelle hors taxonomie, non imputable.
            codeAttendu: attendu ?? null,
            horsTaxonomie: t.faille != null && attendu === null,
            codesDetectes,
            nbBiais: codesDetectes.length,
            nbForces: r.corps.forces.length,
            detectionExacte: attendu ? codesDetectes.includes(attendu) : null,
            fauxPositif: t.force === 'solide' && codesDetectes.length > 0,
          },
        }) + '\n');
      });
    }
  }

  console.log(`Analyse de raisonnement — ${corpus.length} textes x ${REPETITIONS} répétitions`);
  console.log(`Appels planifiés : ${taches.length}`);
  const debutSerie = new Date().toISOString();

  let faits = 0;
  const t0 = Date.now();
  await enParallele(taches.map((t) => async () => {
    await t();
    if (++faits % 10 === 0) process.stdout.write(`  ${faits}/${taches.length}\n`);
  }), CONCURRENCE);
  const dureeMs = Date.now() - t0;

  writeFileSync(meta, JSON.stringify({
    banc: 'analyze', modele: 'mistral-large-latest', temperature: 0.3,
    repetitions: REPETITIONS, textes: corpus.length,
    debutSerie, finSerie: new Date().toISOString(), dureeMs,
    appels: taches.length, concurrence: CONCURRENCE,
    codeExerce: 'api/_lib/op-analyze.js (traiterAnalyze)',
    versionNode: process.version,
  }, null, 2));

  console.log(`Terminé : ${faits} appels, ${Math.round(dureeMs / 1000)} s`);
  console.log(`Journal : ${journal.pathname}`);
}

principal().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
