/**
 * Banc d'essai du chemin APPLICATION.
 *
 *   node evals/executerApp.mjs [repetitions]
 *
 * Les campagnes précédentes ont toutes exercé `api/_lib/op-challenge.js`, qui
 * sert l'API publique. Le prompt que rencontrent les utilisateurs est celui de
 * `src/systemPrompt.js` — sensiblement différent : sept fois plus long, avec
 * une mémoire conversationnelle, un contexte cognitif et des consignes de
 * visualisation. Il n'avait jamais été mesuré.
 *
 * Le banc reproduit ici l'assemblage effectué par api/chat.js : prompt système
 * de l'application, puis recherche vérifiée, puis vérification déterministe de
 * la réponse. Il exerce donc la même chaîne, sans passer par le réseau ni par
 * la diffusion progressive, qui n'ont pas d'incidence sur le contenu produit.
 */
import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { buildSystemPrompt } from '../src/systemPrompt.js';
import { rechercher } from '../api/_lib/recherche.js';
import { verifierReponse } from '../api/_lib/verifier.js';
import { adaptateurMistral } from './adaptateurs.mjs';
import { GENERALISTE } from './corpus.mjs';
import { controler } from './controles.mjs';

const REPETITIONS = Number(process.argv[2] ?? 1);
const CONCURRENCE = 3;
const PERSONAS = ['architect', 'opponent', 'arbiter', 'strategist'];

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

/**
 * Blocs de sources ajoutés par api/chat.js. Reproduits à l'identique : une
 * reformulation ferait mesurer autre chose que ce qui tourne en production.
 */
function blocSources(sources, contexte) {
  if (sources.length === 0) {
    return `\n\n## Sources — AUCUNE
Aucune source n'a pu être obtenue. En conséquence :
- Tu n'avances AUCUN chiffre, pourcentage ni statistique.
- Tu n'emploies AUCUN renvoi de la forme [1] : il n'existe rien vers quoi renvoyer, et un renvoi sans source est un mensonge de forme.
- Tu ne cites aucune étude, aucun auteur, aucune institution par son nom.
- Tu raisonnes sur la STRUCTURE de l'argument, ce qui suffit à repérer un faux dilemme, une généralisation abusive ou une confusion entre corrélation et causalité.
- Tu signales cette limite en une phrase, sans t'en excuser.`;
  }
  return `\n\n## Sources vérifiées\nChacune a été atteinte et vérifiée publiquement consultable.\n\n${contexte}

## Citation des sources (OBLIGATOIRE)
Chaque affirmation factuelle tirée des sources ci-dessus DOIT porter sa référence entre crochets — [n] — dans la MÊME phrase. Plusieurs numéros peuvent se cumuler : [1][3].
Tu ne renvoies JAMAIS à un numéro absent de la liste : un renvoi inventé imite la rigueur pour mieux tromper, et c'est la faute la plus grave possible ici.
Tout chiffre, pourcentage ou statistique doit porter un renvoi. Si aucune source ne l'établit, tu ne l'écris pas.
Ta réponse est vérifiée automatiquement sur ces points.`;
}

const TEMPERATURE = { doux: 0.5, moyen: 0.7, extreme: 0.9 };

async function unAppel({ appelerModele, entree, persona, friction, avecRecherche }) {
  const debut = new Date().toISOString();
  const t0 = Date.now();

  let sources = [], contexte = '', panne = 'desactivee';
  if (avecRecherche) {
    const r = await rechercher(entree.these).catch(() => null);
    if (r) ({ sources, contexte, panne } = r);
    else panne = 'echec';
  }

  const systeme = buildSystemPrompt(persona, friction) + blocSources(sources, contexte);
  const utilisateur = entree.these;

  const r = await appelerModele({ systeme, utilisateur, temperature: TEMPERATURE[friction] });
  const msTotal = Date.now() - t0;

  const base = {
    volet: avecRecherche ? 'APP-avec-sources' : 'APP-sans-sources',
    id: entree.id, force: entree.force, faille: entree.faille ?? null,
    these: entree.these, persona, friction, longueurAttendue: null,
    debut, fin: new Date().toISOString(), msTotal,
    promptSysteme: systeme, promptUtilisateur: utilisateur,
    nbSources: sources.length, rechercheIndisponible: panne,
  };

  if (!r.ok) return { ...base, ok: false, erreur: 'modele_indisponible', message: r.message };

  return {
    ...base, ok: true, reponse: r.texte, usage: r.usage,
    verification: verifierReponse(r.texte, { sources }),
    controles: controler(r.texte, { persona, these: entree.these }),
  };
}

async function principal() {
  const e = env();
  for (const [k, v] of Object.entries(e)) if (!process.env[k]) process.env[k] = v;
  if (!e.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY absente');
  const appelerModele = adaptateurMistral(e.MISTRAL_API_KEY, 'mistral-small-latest');

  const dossier = new URL('./resultats/', import.meta.url);
  mkdirSync(dossier, { recursive: true });
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const journal = new URL(`./app_${horodatage}.jsonl`, dossier);
  const meta = new URL(`./app_${horodatage}.meta.json`, dossier);

  const taches = [];
  for (let rep = 0; rep < REPETITIONS; rep++) {
    // Avec recherche : le comportement réellement livré depuis le branchement.
    for (const t of GENERALISTE) {
      for (const persona of PERSONAS) {
        taches.push(() => unAppel({ appelerModele, entree: t, persona, friction: 'moyen', avecRecherche: true }));
      }
    }
    // Sans recherche : mesure le comportement lorsque la recherche échoue,
    // cas qui restera fréquent tant qu'aucune clé documentaire n'est valide.
    for (const t of GENERALISTE.slice(0, 8)) {
      taches.push(() => unAppel({ appelerModele, entree: t, persona: 'opponent', friction: 'moyen', avecRecherche: false }));
    }
  }

  console.log(`Chemin APPLICATION — ${taches.length} appels, concurrence ${CONCURRENCE}`);
  const debutSerie = new Date().toISOString();
  console.log(`Début : ${debutSerie}`);

  let faits = 0, echecs = 0;
  const t0 = Date.now();
  await enParallele(taches.map((t) => async () => {
    const r = await t();
    faits++; if (!r.ok) echecs++;
    appendFileSync(journal, JSON.stringify(r) + '\n');
    if (faits % 10 === 0) process.stdout.write(`  ${faits}/${taches.length} (${echecs} échec${echecs > 1 ? 's' : ''})\n`);
  }), CONCURRENCE);
  const dureeMs = Date.now() - t0;

  writeFileSync(meta, JSON.stringify({
    banc: 'application', modele: 'mistral-small-latest',
    debutSerie, finSerie: new Date().toISOString(), dureeMs,
    appels: taches.length, echecs, concurrence: CONCURRENCE, repetitions: REPETITIONS,
    codeExerce: 'src/systemPrompt.js + api/_lib/recherche.js + api/_lib/verifier.js',
    versionNode: process.version,
  }, null, 2));

  console.log(`Terminé : ${faits} appels, ${echecs} échec(s), ${Math.round(dureeMs / 1000)} s`);
  console.log(`Journal : ${journal.pathname}`);
}

principal().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
