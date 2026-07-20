/**
 * Banc d'essai du vérificateur de faits.
 *
 *   node evals/executerFactcheck.mjs [nbRepetitions]
 *
 * Contrairement au banc de contradiction, celui-ci mesure une EXACTITUDE : le
 * verdict rendu est comparé à une vérité établie indépendamment du produit.
 *
 * Chaque affirmation est soumise plusieurs fois. La campagne précédente a
 * montré qu'une exécution unique ne permet pas de distinguer un effet d'une
 * fluctuation ; la répétition est ici intégrée au protocole plutôt que
 * découverte après coup.
 */
import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { traiterFactcheck } from '../api/_lib/op-factcheck.js';
import { adaptateurMistral } from './adaptateurs.mjs';
import { AFFIRMATIONS, FAMILLE, CONFIANCE_RANG } from './corpusFactcheck.mjs';

const REPETITIONS = Number(process.argv[2] ?? 3);
const CONCURRENCE = 2;   // mistral-large plafonne bien plus bas que small

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

/* ─── Évaluation d'un verdict ─────────────────────────────────────────────── */

function evaluer(attendu, corps) {
  const v = corps.verdict ?? {};
  const famille = FAMILLE[v.fact] ?? 'ouvert';
  const conf = CONFIANCE_RANG[v.confidence] ?? 0;

  // Exactitude directionnelle. Pour une question ouverte, la bonne réponse est
  // de NE PAS trancher : « ouvert » est attendu, et un verdict tranché — même
  // dans le sens que l'on croit juste — constitue l'erreur.
  const exact = attendu === 'debattu' ? famille === 'ouvert' : famille === attendu;

  // Erreur grave : trancher à l'inverse de la vérité établie.
  const inversion = (attendu === 'vrai' && famille === 'faux')
                 || (attendu === 'faux' && famille === 'vrai');

  // Sur-assurance : forte confiance affichée sur une question ouverte.
  const surAssurance = attendu === 'debattu' && famille !== 'ouvert' && conf >= 4;

  // Prudence excessive : ne pas trancher un fait établi.
  const excesPrudence = attendu !== 'debattu' && famille === 'ouvert';

  return {
    famille, exact, inversion, surAssurance, excesPrudence,
    fact: v.fact, risk: v.risk, consensus: v.consensus, confidence: v.confidence,
    rangConfiance: conf,
    nbSources: (corps.sources ?? []).length,
    base: corps.base,
    rechercheIndisponible: corps.recherche_indisponible ?? null,
  };
}

/* ─── Point d'entrée ──────────────────────────────────────────────────────── */

async function principal() {
  const e = env();
  if (!e.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY absente');
  // Le code de production lit process.env : sans cette recopie, le banc
  // emprunterait un chemin différent de celui exécuté en ligne.
  for (const [k, v] of Object.entries(e)) if (!process.env[k]) process.env[k] = v;

  // op-factcheck impose lui-même « mistral-large-latest » à l'appel ; le modèle
  // passé à l'adaptateur ne sert que de valeur de repli.
  const appelerModele = adaptateurMistral(e.MISTRAL_API_KEY, 'mistral-large-latest');

  const dossier = new URL('./resultats/', import.meta.url);
  mkdirSync(dossier, { recursive: true });
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const journal = new URL(`./factcheck_${horodatage}.jsonl`, dossier);
  const meta = new URL(`./factcheck_${horodatage}.meta.json`, dossier);

  const taches = [];
  for (let rep = 1; rep <= REPETITIONS; rep++) {
    for (const a of AFFIRMATIONS) {
      taches.push(async () => {
        const debut = new Date().toISOString();
        const t0 = Date.now();
        const v = traiterFactcheck.valider({ affirmation: a.affirmation, recherche_web: true });
        if (!v.ok) {
          appendFileSync(journal, JSON.stringify({ ...a, repetition: rep, ok: false,
            erreur: 'validation', message: v.message, debut }) + '\n');
          return;
        }
        const r = await traiterFactcheck.executer(v.valeurs, { appelerModele });
        const msTotal = Date.now() - t0;
        const base = { ...a, repetition: rep, debut, fin: new Date().toISOString(), msTotal };
        if (!r.ok) {
          appendFileSync(journal, JSON.stringify({ ...base, ok: false,
            erreur: r.erreur, message: r.message }) + '\n');
          return;
        }
        appendFileSync(journal, JSON.stringify({
          ...base, ok: true,
          corps: r.corps,
          evaluation: evaluer(a.attendu, r.corps),
        }) + '\n');
      });
    }
  }

  const debutSerie = new Date().toISOString();
  console.log(`Vérificateur de faits — ${AFFIRMATIONS.length} affirmations x ${REPETITIONS} répétitions`);
  console.log(`Appels planifiés : ${taches.length}`);
  console.log(`Début : ${debutSerie}`);

  let faits = 0;
  const t0 = Date.now();
  await enParallele(taches.map((t) => async () => {
    await t();
    if (++faits % 10 === 0) process.stdout.write(`  ${faits}/${taches.length}\n`);
  }), CONCURRENCE);
  const dureeMs = Date.now() - t0;

  writeFileSync(meta, JSON.stringify({
    banc: 'factcheck', modele: 'mistral-large-latest', temperature: 0.3,
    repetitions: REPETITIONS, affirmations: AFFIRMATIONS.length,
    debutSerie, finSerie: new Date().toISOString(), dureeMs,
    appels: taches.length, concurrence: CONCURRENCE,
    codeExerce: 'api/_lib/op-factcheck.js (traiterFactcheck)',
    versionNode: process.version,
  }, null, 2));

  console.log(`Terminé : ${faits} appels, ${Math.round(dureeMs / 1000)} s`);
  console.log(`Journal : ${journal.pathname}`);
}

principal().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
