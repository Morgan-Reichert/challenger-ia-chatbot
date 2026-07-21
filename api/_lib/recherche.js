/**
 * Recherche documentaire vérifiée.
 *
 * ── Pourquoi ce module ────────────────────────────────────────────────────
 * Une campagne d'évaluation a établi que l'interdiction « n'invente jamais de
 * chiffre », pourtant écrite en majuscules dans le prompt système, était
 * violée par un tiers des réponses — et que trois reformulations successives
 * n'ont rien changé au-delà du bruit de mesure. La consigne n'est pas le
 * levier : un modèle sommé de citer des faits sans moyen d'en obtenir les
 * fabrique. Le levier est de lui EN DONNER, puis de vérifier ce qu'il en fait.
 *
 * ── Deux principes ────────────────────────────────────────────────────────
 * 1. Aucune source n'est proposée au modèle sans avoir été atteinte. Une URL
 *    qui renvoie une erreur, une redirection vers une page de connexion ou un
 *    mur payant est écartée AVANT d'entrer dans le contexte : le modèle ne
 *    peut pas citer ce qu'il n'a jamais reçu.
 * 2. Les fournisseurs sont interchangeables et dégradables. L'absence de clé
 *    payante ne doit pas priver le produit de toute source : l'encyclopédie
 *    publique reste interrogeable sans authentification.
 */

const DELAI_MS = 6000;
const MAX_SOURCES = 6;

/* ─── Cache mémoire (par instance chaude) ─────────────────────────────────────
 * Coupe les appels répétés (mêmes questions, rafales multi-personas) → moins de
 * coûts, moins de latence, moins de rate-limits. TTL court car l'actualité
 * bouge. Persiste tant que l'instance serverless reste chaude ; à froid, on
 * repart d'un cache vide, ce qui est sans risque. */
const CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
function cacheGet(cle) {
  const e = CACHE.get(cle);
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) { CACHE.delete(cle); return null; }
  return e.data;
}
function cacheSet(cle, data) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(cle, { at: Date.now(), data });
}

/* ─── Vérification d'atteignabilité ───────────────────────────────────────── */

// Domaines dont on sait qu'ils exigent une authentification ou un abonnement :
// leur page répond 200 mais reste illisible pour le lecteur qu'on renverra
// dessus. Citer une source que l'utilisateur ne peut pas ouvrir revient à ne
// pas citer.
const MURS_CONNUS = [
  'sciencedirect.com', 'springer.com', 'jstor.org', 'wiley.com',
  'tandfonline.com', 'nature.com/articles/nature', 'academic.oup.com',
  'lemonde.fr/archives', 'ft.com', 'wsj.com', 'economist.com',
];

const INDICES_MUR = /(paywall|subscribe to continue|abonnez-vous pour|connectez-vous pour lire|sign in to continue|article r[ée]serv[ée] aux abonn)/i;

function domaineSous(url, liste) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return liste.some((d) => h === d || h.endsWith(`.${d}`) || url.includes(d));
  } catch {
    return false;
  }
}

/**
 * Vérifie qu'une URL est publiquement consultable.
 *
 * On lit un fragment du corps plutôt que de se contenter du code HTTP : de
 * nombreux murs payants répondent 200 et n'affichent le blocage que dans la
 * page. Le corps est tronqué, la vérification n'ayant pas à télécharger
 * l'article entier.
 */
export async function verifierUrl(url) {
  if (domaineSous(url, MURS_CONNUS)) {
    return { url, atteignable: false, motif: 'mur_payant_connu' };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), DELAI_MS);
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'ChallengerIA/1.0 (verification de source)' },
    });
    clearTimeout(t);

    if (!r.ok) return { url, atteignable: false, motif: `http_${r.status}` };

    // Une redirection vers une page de connexion ou de consentement rend la
    // source inutilisable pour le lecteur, quel que soit le code renvoyé.
    const finale = r.url || url;
    if (/\/(login|signin|connexion|auth|consent|subscribe|abonnement)\b/i.test(finale)) {
      return { url, atteignable: false, motif: 'redirige_vers_authentification' };
    }

    const debut = (await r.text().catch(() => '')).slice(0, 4000);
    if (INDICES_MUR.test(debut)) {
      return { url, atteignable: false, motif: 'mur_payant_detecte' };
    }
    return { url: finale, atteignable: true, motif: null };
  } catch (e) {
    return { url, atteignable: false, motif: e?.name === 'AbortError' ? 'delai_depasse' : 'injoignable' };
  }
}

/* ─── Fournisseurs ────────────────────────────────────────────────────────── */

/** Tavily — utilisé si une clé valide est configurée. */
async function viaTavily(requete, cle) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}` },
    body: JSON.stringify({
      query: requete, search_depth: 'advanced',
      max_results: MAX_SOURCES, include_answer: false,
    }),
  });
  if (!r.ok) throw new Error(`tavily_http_${r.status}`);
  const d = await r.json();
  return (d.results ?? []).map((s) => ({
    titre: s.title, url: s.url, extrait: (s.content ?? '').slice(0, 600),
    date: s.published_date ?? null,
    fournisseur: 'tavily',
  }));
}

/** Brave Search — alternative si BRAVE_API_KEY est configurée. */
async function viaBrave(requete, cle) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(requete)}&count=${MAX_SOURCES}`;
  const r = await fetch(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': cle } });
  if (!r.ok) throw new Error(`brave_http_${r.status}`);
  const d = await r.json();
  return (d.web?.results ?? []).slice(0, MAX_SOURCES).map((s) => ({
    titre: s.title, url: s.url, extrait: (s.description ?? '').replace(/<\/?[^>]+>/g, '').slice(0, 600),
    date: s.page_age ?? s.age ?? null,
    fournisseur: 'brave',
  }));
}

/**
 * Encyclopédie publique — sans clé, toujours disponible.
 *
 * Ses URL sont stables et publiques par construction, ce qui en fait un socle
 * de repli acceptable : mieux vaut une source encyclopédique vérifiable qu'un
 * chiffre sorti de nulle part.
 */
// L'encyclopédie limite le débit des clients anonymes et répond alors 429.
// Deux reprises espacées suffisent en pratique ; sans elles, une rafale de
// requêtes prive de sources une part notable des appels.
async function avecReprise(url, essais = 3) {
  let dernier = null;
  for (let i = 0; i < essais; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    dernier = await fetch(url, {
      headers: { 'User-Agent': 'ChallengerIA/1.0 (contact: stariax.dev.a@outlook.com)' },
    });
    if (dernier.ok || dernier.status !== 429) return dernier;
  }
  return dernier;
}

async function viaEncyclopedie(requete, lang = 'fr') {
  const rechercheUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search`
    + `&srsearch=${encodeURIComponent(requete)}&srlimit=${MAX_SOURCES}&format=json&origin=*`;
  const r = await avecReprise(rechercheUrl);
  if (!r.ok) throw new Error(`wikipedia_http_${r.status}`);
  const d = await r.json();
  const titres = (d?.query?.search ?? []).map((s) => s.title);

  const pages = await Promise.all(titres.slice(0, MAX_SOURCES).map(async (titre) => {
    try {
      const s = await avecReprise(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titre)}`);
      if (!s.ok) return null;
      const p = await s.json();
      if (!p.extract) return null;
      return {
        titre: p.title,
        url: p.content_urls?.desktop?.page
          ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(titre)}`,
        extrait: p.extract.slice(0, 600),
        fournisseur: 'encyclopedie',
      };
    } catch { return null; }
  }));
  return pages.filter(Boolean);
}

/* ─── Construction de la requête ──────────────────────────────────────────── */

// Mots vides français : ils dominent une phrase et noient les termes qui
// portent le sens. Une thèse soumise telle quelle à un moteur encyclopédique
// ne remonte rien — c'est ce qui privait 86 % des appels de toute source.
const MOTS_VIDES = new Set([
  'le','la','les','un','une','des','du','de','d','et','ou','mais','donc','or',
  'ni','car','que','qui','quoi','dont','ou','a','au','aux','en','dans','sur',
  'sous','par','pour','avec','sans','vers','chez','entre','est','sont','etre',
  'ete','avoir','plus','moins','tres','tout','tous','toute','toutes','ce','cet',
  'cette','ces','son','sa','ses','leur','leurs','il','elle','ils','elles','on',
  'nous','vous','je','tu','ne','pas','se','si','comme','meme','aussi','alors',
  'quand','parce','peut','doit','faut','fait','faire','y','l','s','n','c','qu',
]);

/**
 * Extrait de la thèse les termes porteurs de sens.
 *
 * On retient les mots longs, non vides, en privilégiant les premiers — le sujet
 * d'une phrase française arrive tôt. Les noms propres passent devant : ce sont
 * les meilleurs points d'entrée d'un index documentaire.
 *
 * Peu de termes valent mieux que beaucoup : un index encyclopédique combine les
 * mots-clés de façon restrictive, si bien qu'une requête longue ne remonte rien.
 */
export function motsClefs(phrase, maximum = 4) {
  const brut = phrase.replace(/[«»""'']/g, ' ').split(/[\s,;:.!?()]+/).filter(Boolean);
  const propres = [], communs = [];
  for (const m of brut) {
    const nu = m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (nu.length < 4 || MOTS_VIDES.has(nu)) continue;
    // Majuscule hors début de phrase : nom propre probable.
    if (/^[A-ZÉÈÀÂÎÔÛ]/.test(m) && brut.indexOf(m) > 0) propres.push(m);
    else communs.push(m);
  }
  return [...new Set([...propres, ...communs])].slice(0, maximum).join(' ');
}

/* ─── Point d'entrée ──────────────────────────────────────────────────────── */

/**
 * Recherche, vérifie, et met en forme le contexte transmis au modèle.
 *
 * Renvoie toujours un objet exploitable, même en cas de panne complète : le
 * produit doit pouvoir répondre sans sources, mais il doit alors le SAVOIR et
 * le dire — d'où le champ `panne`, qui remonte jusqu'à l'appelant.
 */
export async function rechercher(requete, { lang = 'fr' } = {}) {
  const cleCache = `${lang}::${(requete ?? '').trim().toLowerCase()}`.slice(0, 300);
  const enCache = cacheGet(cleCache);
  if (enCache) return enCache;

  const cleTavily = process.env.TAVILY_API_KEY;
  const cleBrave = process.env.BRAVE_API_KEY;
  let brutes = [];
  let panne = null;

  // Chaîne de fournisseurs, du plus riche au repli public : Tavily → Brave →
  // encyclopédie. Chaque maillon ne s'active que si le précédent n'a rien donné.
  if (cleTavily) {
    try { brutes = await viaTavily(requete, cleTavily); }
    catch (e) { console.error('[recherche] tavily indisponible —', e?.message ?? e); panne = 'tavily_indisponible'; }
  }
  if (brutes.length === 0 && cleBrave) {
    try { brutes = await viaBrave(requete, cleBrave); if (panne) panne = 'repli_brave'; }
    catch (e) { console.error('[recherche] brave indisponible —', e?.message ?? e); panne = panne ?? 'brave_indisponible'; }
  }
  if (brutes.length === 0) {
    try {
      // L'index encyclopédique répond à des mots-clés, pas à une phrase.
      brutes = await viaEncyclopedie(motsClefs(requete), lang);
      if (panne) panne = 'repli_encyclopedie';
    } catch (e) {
      console.error('[recherche] encyclopedie indisponible —', e?.message ?? e);
      const vide = { sources: [], ecartees: [], contexte: '', panne: 'aucune_source' };
      cacheSet(cleCache, vide);
      return vide;
    }
  }

  // Vérification d'atteignabilité, en parallèle. Les sources écartées sont
  // conservées à part : le rapport d'évaluation doit pouvoir dire combien de
  // liens ont été rejetés, et pourquoi.
  const verifs = await Promise.all(brutes.map((s) => verifierUrl(s.url)));
  const retenues = [];
  const ecartees = [];
  brutes.forEach((s, i) => {
    const v = verifs[i];
    if (v.atteignable) retenues.push({ ...s, url: v.url, n: retenues.length + 1 });
    else ecartees.push({ ...s, motif: v.motif });
  });

  const contexte = retenues.length
    ? retenues.map((s) => `[${s.n}] ${s.titre} — ${s.url}\n${s.extrait}`).join('\n\n')
    : '';

  const resultat = {
    sources: retenues,
    ecartees,
    contexte,
    panne: retenues.length ? panne : (panne ?? 'aucune_source_atteignable'),
  };
  cacheSet(cleCache, resultat);
  return resultat;
}
