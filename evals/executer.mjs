/**
 * Exécuteur du banc d'essai.
 *
 *   node evals/executer.mjs mistral
 *   node evals/executer.mjs gemini
 *
 * Écrit un journal JSONL horodaté dans evals/resultats/. Chaque ligne est un
 * appel complet : thèse, réglages, prompt système exact transmis, réponse
 * intégrale, temps de réponse, jetons consommés et résultats des contrôles.
 *
 * Rien n'est agrégé ici : l'agrégation appartient au rapport, et conserver le
 * détail brut permet à un tiers de refaire les calculs.
 */
import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { traiterChallenge } from '../api/_lib/op-challenge.js';
import { adaptateurMistral, adaptateurGemini, dernierEchange } from './adaptateurs.mjs';
import { GENERALISTE, DOMAINES, CONFORMITE } from './corpus.mjs';
import { controler } from './controles.mjs';

/* ─── Configuration ───────────────────────────────────────────────────────── */

const FOURNISSEUR = (process.argv[2] ?? 'mistral').toLowerCase();
const CONCURRENCE = 4;   // au-delà, les deux fournisseurs limitent le débit
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

// Directive de format, reprise à l'identique de src/userProfile.ts. Le banc la
// préfixe au prompt système pour le volet C, exactement comme l'application le
// fait lorsqu'un calibrage a défini une longueur attendue.
const DIRECTIVES_FORMAT = {
  concise: "## Format\nRéponds court : l'essentiel en quelques phrases, sans développement superflu. L'utilisateur a peu de temps.",
  approfondie: "## Format\nDéveloppe : nuances, contre-exemples et implications sont bienvenus. L'utilisateur veut creuser.",
  standard: '',
};

/* ─── Utilitaires ─────────────────────────────────────────────────────────── */

const maintenant = () => new Date().toISOString();

async function enParallele(taches, largeur) {
  const resultats = new Array(taches.length);
  let curseur = 0;
  const ouvriers = Array.from({ length: Math.min(largeur, taches.length) }, async () => {
    for (;;) {
      const i = curseur++;
      if (i >= taches.length) return;
      resultats[i] = await taches[i]();
    }
  });
  await Promise.all(ouvriers);
  return resultats;
}

/* ─── Un appel ────────────────────────────────────────────────────────────── */

async function unAppel({ appelerModele, volet, entree, persona, friction, longueurAttendue }) {
  const debut = maintenant();
  const t0 = Date.now();

  // Directive de format : injectée en préfixe du système, via un adaptateur
  // enveloppant, pour ne pas modifier le code de production.
  const directive = DIRECTIVES_FORMAT[longueurAttendue ?? 'standard'] ?? '';
  const appelWrap = directive
    ? (args) => appelerModele({ ...args, systeme: `${directive}\n\n${args.systeme}` })
    : appelerModele;

  const validation = traiterChallenge.valider({ these: entree.these, persona, friction });
  if (!validation.ok) {
    return { volet, id: entree.id, erreur: 'validation', message: validation.message, debut };
  }

  const r = await traiterChallenge.executer(validation.valeurs, { appelerModele: appelWrap });
  const msTotal = Date.now() - t0;

  const base = {
    volet, id: entree.id, domaine: entree.domaine ?? null,
    force: entree.force, faille: entree.faille ?? null,
    these: entree.these,
    persona, friction, longueurAttendue: longueurAttendue ?? null,
    debut, fin: maintenant(), msTotal,
    promptSysteme: dernierEchange.systeme,
    promptUtilisateur: dernierEchange.utilisateur,
    temperature: dernierEchange.temperature,
  };

  if (!r.ok) {
    return { ...base, ok: false, erreur: r.erreur, message: r.message, statut: r.statut };
  }

  const texte = r.corps.reponse ?? '';
  return {
    ...base,
    ok: true,
    reponse: texte,
    usage: r.corps.usage ?? null,
    controles: controler(texte, { persona, longueurAttendue }),
  };
}

/* ─── Plan d'exécution ────────────────────────────────────────────────────── */

function planifier(appelerModele) {
  const taches = [];

  // Volet A — généraliste : chaque thèse passée par les quatre contradicteurs.
  // Croiser thèses et personas permet d'isoler l'effet du persona de l'effet
  // de la thèse, ce qu'un tirage aléatoire ne permettrait pas.
  for (const t of GENERALISTE) {
    for (const persona of PERSONAS) {
      taches.push(() => unAppel({ appelerModele, volet: 'A-generaliste', entree: t, persona, friction: 'moyen' }));
    }
  }

  // Volet B — par domaine, avec le contradicteur le plus pertinent.
  for (const d of DOMAINES) {
    for (const t of d.theses) {
      // « factchecker » n'existe pas sur ce point d'entrée : il dispose du sien
      // (/v1/factcheck). On rabat sur l'Architecte, dont la structure logique
      // est la plus proche — comme au rejeu de la première campagne, afin que
      // les deux séries restent comparables.
      const persona = d.persona === 'factchecker' ? 'architect' : d.persona;
      taches.push(() => unAppel({
        appelerModele, volet: 'B-domaine',
        entree: { ...t, domaine: d.domaine }, persona, friction: 'moyen',
      }));
    }
  }

  // Volet C — conformité au calibrage : longueur, puis friction.
  for (const t of CONFORMITE) {
    for (const longueur of ['concise', 'standard', 'approfondie']) {
      taches.push(() => unAppel({
        appelerModele, volet: 'C-longueur', entree: t,
        persona: 'architect', friction: 'moyen', longueurAttendue: longueur,
      }));
    }
  }
  for (const t of CONFORMITE) {
    for (const friction of ['doux', 'moyen', 'extreme']) {
      taches.push(() => unAppel({
        appelerModele, volet: 'C-friction', entree: t,
        persona: 'opponent', friction,
      }));
    }
  }

  return taches;
}

/* ─── Point d'entrée ──────────────────────────────────────────────────────── */

async function principal() {
  const e = env();
  let appelerModele, modele;

  if (FOURNISSEUR === 'mistral') {
    modele = 'mistral-small-latest';
    if (!e.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY absente de .env.local');
    appelerModele = adaptateurMistral(e.MISTRAL_API_KEY, modele);
  } else if (FOURNISSEUR === 'gemini') {
    modele = 'gemini-2.0-flash';
    if (!e.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY absente de .env.local');
    appelerModele = adaptateurGemini(e.GEMINI_API_KEY, modele);
  } else {
    throw new Error(`Fournisseur inconnu : ${FOURNISSEUR}`);
  }

  const dossier = new URL('./resultats/', import.meta.url);
  mkdirSync(dossier, { recursive: true });
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const journal = new URL(`./${FOURNISSEUR}_${horodatage}.jsonl`, dossier);
  const meta = new URL(`./${FOURNISSEUR}_${horodatage}.meta.json`, dossier);

  const taches = planifier(appelerModele);
  const debutSerie = maintenant();
  console.log(`Fournisseur : ${FOURNISSEUR} (${modele})`);
  console.log(`Appels planifiés : ${taches.length}, concurrence ${CONCURRENCE}`);
  console.log(`Début : ${debutSerie}`);

  let faits = 0, echecs = 0;
  const enveloppees = taches.map((t) => async () => {
    const r = await t();
    faits++;
    if (!r.ok) echecs++;
    appendFileSync(journal, JSON.stringify(r) + '\n');
    if (faits % 10 === 0) {
      process.stdout.write(`  ${faits}/${taches.length} (${echecs} échec${echecs > 1 ? 's' : ''})\n`);
    }
    return r;
  });

  const t0 = Date.now();
  await enParallele(enveloppees, CONCURRENCE);
  const dureeMs = Date.now() - t0;

  writeFileSync(meta, JSON.stringify({
    fournisseur: FOURNISSEUR, modele,
    debutSerie, finSerie: maintenant(), dureeMs,
    appelsPlanifies: taches.length, appelsFaits: faits, echecs,
    concurrence: CONCURRENCE,
    codeExerce: 'api/_lib/op-challenge.js (traiterChallenge)',
    versionNode: process.version,
  }, null, 2));

  console.log(`Terminé : ${faits} appels, ${echecs} échec(s), ${Math.round(dureeMs / 1000)} s`);
  console.log(`Journal : ${journal.pathname}`);
}

principal().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
