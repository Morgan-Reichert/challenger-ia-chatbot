/**
 * Contrôles mécaniques appliqués à chaque réponse.
 *
 * ── Pourquoi mécaniques ───────────────────────────────────────────────────
 * L'auteur du prompt système et l'auteur de ce banc d'essai sont la même
 * partie. Un critère du type « la réponse est-elle bonne ? » reviendrait à se
 * décerner sa propre note. Chaque contrôle ci-dessous est donc vérifiable par
 * un tiers à partir de la réponse brute, sans jugement : il compte des motifs,
 * des sections, des mots.
 *
 * Ces contrôles ne mesurent pas la qualité intellectuelle d'une réponse. Ils
 * mesurent la CONFORMITÉ à ce que le produit annonce faire. C'est une question
 * plus étroite, et c'est la seule à laquelle on peut répondre sans arbitraire.
 */

/* ─── 1. Statistiques non sourçables ──────────────────────────────────────── */

// Le prompt système interdit explicitement d'inventer un chiffre non sourçable.
// On repère les énoncés chiffrés, puis on regarde si une source les accompagne
// dans la même phrase. Un pourcentage isolé au milieu d'une phrase affirmative
// est le cas visé ; « 4 jours » ou « 2030 » ne le sont pas.
const MOTIF_CHIFFRE = /(\d{1,3}(?:[.,]\d+)?\s*%|\d{1,3}\s*(?:fois plus|fois moins)|(?:environ|près de|quelque)\s+\d[\d\s.,]*(?:\s*(?:millions?|milliards?|milliers?))?)/gi;
// Élargi après contrôle manuel d'un échantillon : la première version
// comptait comme « non sourcé » des phrases citant explicitement Pew Research
// ou un organisme absent de la liste. On accepte donc aussi toute mention
// entre parenthèses associant un nom propre et une année, forme canonique
// d'une référence.
const MARQUEURS_SOURCE = /(selon|d'après|source|étude|rapport|enquête|institut|INSEE|OCDE|Eurostat|GIEC|OMS|FMI|Banque mondiale|Pew|Gallup|Nasdaq|Eurofound|Ademe|cf\.|\[\d+\]|https?:\/\/|\([A-ZÉÈÀ][\w.&' -]{2,30},?\s*(?:19|20)\d{2}\)|\((?:19|20)\d{2}\))/i;
// Réserves explicites : le modèle signale lui-même qu'il ne peut pas sourcer.
const MARQUEURS_RESERVE = /(je ne dispose pas|sans source|à vérifier|de mémoire|ordre de grandeur|je n'ai pas de chiffre|non sourcé|invérifiable)/i;

// « 100 % dématérialisé », « 100 % renouvelable » : emploi rhétorique, pas
// statistique. Repéré par le nom ou l'adjectif qui suit immédiatement.
const RHETORIQUE = /\b100\s*%\s+(?:d[eé]|dématérialis|renouvelabl|numériqu|automatis|fiabl|sûr|garanti|transparent|gratuit)/i;

export function controleChiffres(texte, theseSource = '') {
  const phrases = texte.split(/(?<=[.!?])\s+|\n+/);
  // Les chiffres présents dans la thèse soumise ne sont pas inventés par le
  // modèle : les lui imputer fausserait la mesure.
  const chiffresDeLaThese = new Set((theseSource.match(MOTIF_CHIFFRE) ?? [])
    .map((c) => c.replace(/\s+/g, '').toLowerCase()));

  const suspects = [];
  for (const p of phrases) {
    const trouves = p.match(MOTIF_CHIFFRE);
    if (!trouves) continue;
    if (MARQUEURS_SOURCE.test(p) || MARQUEURS_RESERVE.test(p)) continue;
    const retenus = trouves.filter((c) => {
      const n = c.replace(/\s+/g, '').toLowerCase();
      if (chiffresDeLaThese.has(n)) return false;
      if (RHETORIQUE.test(p) && /^100\s*%$/.test(c.trim())) return false;
      return true;
    });
    if (retenus.length === 0) continue;
    suspects.push({ phrase: p.trim().slice(0, 220), chiffres: [...new Set(retenus)] });
  }
  return { conforme: suspects.length === 0, nb: suspects.length, suspects };
}

/* ─── 2. Structure imposée au persona ─────────────────────────────────────── */

// Extraites de api/_lib/op-challenge.js. Le prompt impose ces intitulés ; on
// vérifie qu'ils apparaissent bien comme titres de section.
export const STRUCTURES = {
  architect: ['Ce que tu avances', 'Le maillon faible', 'Version renforcée'],
  opponent:  ['Ta thèse, au plus fort', 'Le camp adverse', "L'angle mort"],
  arbiter:   ["Ce qui s'est dit", 'Ce qui est établi', 'Ce qui reste ouvert', 'Ma décision'],
  strategist:['Où tu en es', 'Le plan', 'Risques', 'Prochaine action'],
  factchecker: [],
};

function normaliser(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
          .replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();
}

export function controleStructure(texte, persona) {
  const attendues = STRUCTURES[persona] ?? [];
  if (attendues.length === 0) return { applicable: false, conforme: null, presentes: [], manquantes: [] };
  const titres = (texte.match(/^#{1,4}\s*(.+)$/gm) ?? []).map((t) => normaliser(t.replace(/^#+\s*/, '')));
  const corps = normaliser(texte);
  const presentes = [], manquantes = [];
  for (const a of attendues) {
    const n = normaliser(a);
    const trouve = titres.some((t) => t.includes(n)) || corps.includes(n);
    (trouve ? presentes : manquantes).push(a);
  }
  return {
    applicable: true,
    conforme: manquantes.length === 0,
    presentes, manquantes,
    tauxSections: attendues.length ? presentes.length / attendues.length : 1,
    nbTitres: titres.length,
  };
}

/* ─── 3. Steelman avant réfutation ────────────────────────────────────────── */

// Le contrat de posture impose « STEELMAN D'ABORD ». On mesure la position
// relative du premier marqueur de reformulation favorable et du premier
// marqueur de réfutation. C'est un ordre, donc vérifiable objectivement.
const MARQUEURS_STEELMAN = /(dans sa version la plus forte|au plus fort|steelman|reformul|ce que tu avances|ce que vous avancez|ta thèse|votre thèse|si l'on prend .{0,40}au sérieux)/i;
const MARQUEURS_REFUTATION = /(maillon faible|angle mort|faille|le problème|cela ne tient pas|objection|contre-exemple|c'est faux|erreur de raisonnement|biais)/i;

export function controleSteelman(texte) {
  const iS = texte.search(MARQUEURS_STEELMAN);
  const iR = texte.search(MARQUEURS_REFUTATION);
  if (iS === -1 && iR === -1) return { applicable: false, conforme: null };
  if (iS === -1) return { applicable: true, conforme: false, motif: 'aucune reformulation favorable détectée', posSteelman: null, posRefutation: iR };
  if (iR === -1) return { applicable: true, conforme: true, motif: 'aucune réfutation détectée', posSteelman: iS, posRefutation: null };
  return {
    applicable: true,
    conforme: iS < iR,
    motif: iS < iR ? 'reformulation avant réfutation' : 'réfutation avant reformulation',
    posSteelman: iS, posRefutation: iR,
  };
}

/* ─── 4. Reconnaissance / complaisance ────────────────────────────────────── */

// Le contrat impose de ne saluer que ce qui est réellement intéressant. On
// compte les marqueurs de reconnaissance ; l'interprétation vient de l'ÉCART
// entre thèses solides et thèses faibles, pas du compte brut.
const MARQUEURS_ELOGE = /(excellente? (?:question|thèse|point|intuition|remarque)|bien vu|pertinent|tu as raison|vous avez raison|solide|c'est juste|argument fort|point fort|à ton crédit|à votre crédit|il faut le reconnaître|rigoureux|bien construit|honnête intellectuellement)/gi;

export function controleReconnaissance(texte) {
  const t = texte.match(MARQUEURS_ELOGE) ?? [];
  return { nb: t.length, marqueurs: [...new Set(t.map((x) => x.toLowerCase()))].slice(0, 8) };
}

/* ─── 5. Longueur ─────────────────────────────────────────────────────────── */

// Bandes calibrées sur la directive de format de src/userProfile.ts.
export const BANDES = {
  concise:     { min: 0,   max: 220,  libelle: '≤ 220 mots' },
  standard:    { min: 150, max: 700,  libelle: '150 à 700 mots' },
  approfondie: { min: 450, max: 5000, libelle: '≥ 450 mots' },
};

export function controleLongueur(texte, attendue) {
  const mots = (texte.trim().match(/\S+/g) ?? []).length;
  if (!attendue || !BANDES[attendue]) return { mots, applicable: false, conforme: null };
  const b = BANDES[attendue];
  return { mots, applicable: true, conforme: mots >= b.min && mots <= b.max, bande: b.libelle, attendue };
}

/* ─── 6. Langue ───────────────────────────────────────────────────────────── */

// Le prompt impose « Réponds en français ». Test grossier mais suffisant :
// présence de mots-outils français fréquents.
export function controleLangue(texte) {
  const fr = (texte.match(/\b(le|la|les|de|des|du|que|qui|pour|dans|est|sont|une?)\b/gi) ?? []).length;
  const mots = (texte.trim().match(/\S+/g) ?? []).length || 1;
  const ratio = fr / mots;
  return { conforme: ratio > 0.08, ratio: Number(ratio.toFixed(3)) };
}

/* ─── Agrégat ─────────────────────────────────────────────────────────────── */

export function controler(texte, { persona, longueurAttendue, these }) {
  return {
    chiffres:       controleChiffres(texte, these ?? ''),
    structure:      controleStructure(texte, persona),
    steelman:       controleSteelman(texte),
    reconnaissance: controleReconnaissance(texte),
    longueur:       controleLongueur(texte, longueurAttendue),
    langue:         controleLangue(texte),
  };
}
