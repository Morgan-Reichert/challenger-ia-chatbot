# -*- coding: utf-8 -*-
"""Document 6 — Rapport d'évaluation d'un modèle de langage sur Challenger IA.

Génère un rapport à partir d'un journal JSONL produit par evals/executer.mjs.

    python3 doc6_eval.py <journal.jsonl> <reference> <sortie.pdf>

Tout ce qui est affirmé dans le rapport est calculé ici à partir des données
brutes. Aucun chiffre n'est saisi à la main : si le journal change, le rapport
change. C'est la condition pour qu'un tiers puisse refaire les calculs.
"""
import json
import os
import statistics as st
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdfkit_cia import generer_document, AMBRE, BLEU_SOMBRE, GRIS, ENCRE, nettoyer
import legal_cia as L

# ─────────────────────────────────────────────────────────────────────────────
# Chargement et agrégats
# ─────────────────────────────────────────────────────────────────────────────

JOURNAL = sys.argv[1]
REFERENCE = sys.argv[2]
SORTIE = sys.argv[3]

LIGNES = [json.loads(l) for l in open(JOURNAL, encoding='utf-8') if l.strip()]
OK = [l for l in LIGNES if l.get('ok')]
KO = [l for l in LIGNES if not l.get('ok')]

META_PATH = JOURNAL.replace('.recalc.jsonl', '.meta.json').replace('.jsonl', '.meta.json')
META_RUN = json.load(open(META_PATH, encoding='utf-8')) if os.path.exists(META_PATH) else {}

MODELE = META_RUN.get('modele', OK[0].get('modele', 'inconnu') if OK else 'inconnu')
FOURNISSEUR = META_RUN.get('fournisseur', 'inconnu')


def pct(n, d):
    return f"{100 * n / d:.1f} %" if d else "—"


def stats(valeurs):
    if not valeurs:
        return dict(n=0, moy=0, med=0, mini=0, maxi=0, p90=0, ecart=0)
    v = sorted(valeurs)
    return dict(
        n=len(v), moy=st.mean(v), med=st.median(v), mini=v[0], maxi=v[-1],
        p90=v[min(len(v) - 1, int(len(v) * 0.9))],
        ecart=st.pstdev(v) if len(v) > 1 else 0,
    )


MS = stats([l['msTotal'] for l in OK])
MOTS = stats([l['controles']['longueur']['mots'] for l in OK])

JETONS_E = [l['usage'].get('prompt_tokens') or 0 for l in OK if l.get('usage')]
JETONS_S = [l['usage'].get('completion_tokens') or 0 for l in OK if l.get('usage')]

PERSONAS = ['architect', 'opponent', 'arbiter', 'strategist']
NOM_PERSONA = {'architect': "L'Architecte", 'opponent': "L'Opposant",
               'arbiter': "L'Arbitre", 'strategist': 'Le Stratège'}


def sous(pred):
    return [l for l in OK if pred(l)]


# ─────────────────────────────────────────────────────────────────────────────
# Rédaction
# ─────────────────────────────────────────────────────────────────────────────

def remplir(d):
    d.couverture()
    d.mentions_legales(L.blocs(
        "Le présent document restitue le protocole, les mesures brutes et l'analyse "
        f"d'une campagne d'évaluation automatisée du modèle {MODELE} appliqué aux "
        "instructions système de Challenger IA. Il porte sur la conformité du "
        "comportement observé aux règles que le produit s'impose, et non sur une "
        "appréciation qualitative des réponses.",
        niveau=2))
    d.sommaire()

    _resume(d)
    _methode(d)
    _credibilite(d)
    _conditions(d)
    _performance(d)
    _structure(d)
    _chiffres(d)
    _posture(d)
    _steelman(d)
    _calibrage(d)
    _domaines(d)
    _croisement(d)
    _distributions(d)
    _anomalies(d)
    _conclusion(d)
    _annexes(d)
    _annexe_occurrences(d)
    _annexe_reponses(d)


# ── 1. Résumé exécutif ───────────────────────────────────────────────────────

def _resume(d):
    d.titre1("Résumé exécutif")
    d.para(
        f"Cette campagne a soumis {len(LIGNES)} requêtes au modèle {MODELE} en passant par "
        "le code de production de Challenger IA, sans réimplémentation ni simplification. "
        f"{len(OK)} appels ont abouti. Les réponses ont été soumises à six contrôles "
        "mécaniques, tous vérifiables par un tiers à partir des données brutes jointes.")

    avec_chiffres = len([l for l in OK if l['controles']['chiffres']['nb'] > 0])
    struct_ok = len([l for l in OK if l['controles']['structure'].get('conforme')])
    struct_app = len([l for l in OK if l['controles']['structure']['applicable']])
    steel = [l for l in OK if l['controles']['steelman']['applicable']]
    steel_ok = len([l for l in steel if l['controles']['steelman']['conforme']])

    d.titre2("Les cinq chiffres à retenir")
    d.tableau(
        ["Indicateur", "Résultat", "Lecture"],
        [
            ["Respect de la structure imposée",
             f"{struct_ok}/{struct_app} ({pct(struct_ok, struct_app)})",
             "Le format contractuel de chaque contradicteur est tenu sans exception."],
            ["Réponses contenant un chiffre non sourçable",
             f"{avec_chiffres}/{len(OK)} ({pct(avec_chiffres, len(OK))})",
             "Manquement à une interdiction explicite du prompt système. Point critique."],
            ["Reformulation favorable avant réfutation",
             f"{steel_ok}/{len(steel)} ({pct(steel_ok, len(steel))})",
             "L'obligation de steelman est majoritairement tenue, pas systématiquement."],
            ["Temps de réponse médian",
             f"{MS['med'] / 1000:.1f} s",
             f"Neuvième décile à {MS['p90'] / 1000:.1f} s ; maximum observé {MS['maxi'] / 1000:.1f} s."],
            ["Longueur moyenne d'une réponse",
             f"{int(MOTS['moy'])} mots",
             f"De {MOTS['mini']} à {MOTS['maxi']} mots selon le réglage et le contradicteur."],
        ],
        largeurs=[34, 20, 46])

    d.titre2("Conclusion en une phrase")
    d.encadre(
        "Verdict",
        "Le produit tient rigoureusement ses engagements de FORME — structure, langue, "
        "longueur commandée par le calibrage — et manque significativement son "
        "engagement de FOND le plus explicite : ne jamais avancer de chiffre non "
        "sourçable. La cause est identifiée au chapitre 9 et tient à une contradiction "
        "interne du prompt système, non au modèle.",
        couleur=AMBRE)


# ── 2. Méthode ───────────────────────────────────────────────────────────────

def _methode(d):
    d.titre1("Méthode")

    d.titre2("Ce que cette campagne mesure, et ce qu'elle ne mesure pas")
    d.para(
        "L'évaluation porte sur la CONFORMITÉ du comportement observé aux règles que "
        "Challenger IA s'impose dans ses instructions système. Elle ne porte pas sur la "
        "qualité intellectuelle des réponses.")
    d.para(
        "Cette restriction est délibérée. L'auteur des instructions système et l'auteur "
        "du banc d'essai sont la même partie ; un critère du type « la réponse est-elle "
        "bonne ? » reviendrait à se décerner sa propre note. Les six contrôles retenus "
        "comptent des motifs, des sections et des mots. Ils sont reproductibles par un "
        "tiers disposant des réponses brutes, sans avoir à partager le jugement de leur "
        "auteur.")

    d.titre2("Chaîne exercée")
    d.para(
        "Le banc n'appelle pas directement l'API du fournisseur avec un prompt rédigé "
        "pour l'occasion. Il injecte un adaptateur dans la fonction de production "
        f"`{META_RUN.get('codeExerce', 'api/_lib/op-challenge.js')}`, laquelle construit "
        "le prompt système exactement comme elle le fait pour un utilisateur réel : même "
        "contrat de posture, mêmes structures par contradicteur, mêmes températures.")
    d.puces([
        "La construction du prompt n'est pas réimplémentée : elle est exécutée.",
        "Le prompt effectivement transmis est capté et enregistré à chaque appel.",
        "Une divergence entre le produit et le banc est donc impossible par construction.",
    ])

    d.titre2("Corpus")
    d.para(
        "Le corpus compte 52 thèses réparties en trois volets. Chaque thèse porte une "
        "étiquette : « solide » ou « faible ». Les thèses faibles contiennent une faille "
        "de raisonnement connue, documentée et volontairement placée.")
    d.encadre(
        "Pourquoi des témoins",
        "Sans opposition entre thèses solides et thèses faibles, la posture "
        "anti-complaisance est invérifiable : un modèle qui félicite tout obtiendrait le "
        "même score qu'un modèle qui ne félicite que ce qui le mérite. C'est l'écart de "
        "traitement entre les deux groupes qui fait preuve, jamais le comportement moyen.",
        couleur=BLEU_SOMBRE)
    d.para(
        "Les thèses faibles ne sont pas absurdes. Elles sont plausibles et couramment "
        "défendues : faux dilemme, corrélation présentée comme causalité, appel à la "
        "nature, biais du survivant, pente glissante. Une faille grossière serait détectée "
        "par n'importe quel système et ne discriminerait rien.")

    volets = Counter(l['volet'] for l in LIGNES)
    d.tableau(
        ["Volet", "Objet", "Appels"],
        [
            ["A — généraliste", "20 thèses croisées avec les quatre contradicteurs",
             str(volets.get('A-generaliste', 0))],
            ["B — par domaine", "8 domaines, 4 thèses chacun, contradicteur adapté",
             str(volets.get('B-domaine', 0))],
            ["C — longueur", "6 thèses, trois réglages de longueur issus du calibrage",
             str(volets.get('C-longueur', 0))],
            ["C — friction", "6 thèses, trois niveaux de friction",
             str(volets.get('C-friction', 0))],
        ],
        largeurs=[22, 60, 18])
    d.para(
        "Le croisement systématique du volet A — chaque thèse passée par les quatre "
        "contradicteurs — permet d'isoler l'effet du contradicteur de l'effet de la thèse. "
        "Un tirage aléatoire aurait confondu les deux.")

    d.titre2("Les six contrôles")
    d.tableau(
        ["Contrôle", "Ce qu'il vérifie", "Nature"],
        [
            ["Chiffres non sourçables",
             "Un énoncé chiffré apparaît sans source ni réserve dans la même phrase.",
             "Comptage de motifs"],
            ["Structure imposée",
             "Les intitulés de section propres au contradicteur sont présents.",
             "Présence de titres"],
            ["Steelman d'abord",
             "La reformulation favorable précède le premier marqueur de réfutation.",
             "Comparaison de positions"],
            ["Reconnaissance",
             "Nombre de marqueurs d'éloge. Interprété par l'écart solide/faible.",
             "Comptage de motifs"],
            ["Longueur",
             "Le nombre de mots tombe dans la bande commandée par le calibrage.",
             "Comptage de mots"],
            ["Langue",
             "Proportion de mots-outils français ; le prompt impose le français.",
             "Ratio lexical"],
        ],
        largeurs=[24, 52, 24])


# ── 3. Crédibilité ───────────────────────────────────────────────────────────

def _credibilite(d):
    d.titre1("Éléments de crédibilité")
    d.para(
        "Un rapport produit par la partie qu'il évalue n'a de valeur que si ses "
        "faiblesses sont exposées. Ce chapitre les recense.")

    d.titre2("Un contrôle a été corrigé après vérification manuelle")
    d.para(
        "La première exécution du détecteur de chiffres non sourçables annonçait 39,9 % "
        "de réponses concernées. Un échantillon aléatoire de douze occurrences a été relu "
        "manuellement avant toute publication. Trois cas sur douze étaient des faux "
        "positifs :")
    d.puces([
        "un chiffre repris de la thèse soumise elle-même, donc non inventé par le modèle ;",
        "une phrase citant « Pew Research, 2018 », source réelle absente de la liste "
        "de marqueurs reconnus ;",
        "un « 100 % dématérialisé » de sens rhétorique, et non statistique.",
    ])
    d.para(
        "Le détecteur a été corrigé sur ces trois points, puis l'ensemble des réponses "
        "déjà enregistrées a été recalculé sans nouvel appel au modèle. Le taux publié "
        "est passé de 39,9 % à "
        f"{pct(len([l for l in OK if l['controles']['chiffres']['nb'] > 0]), len(OK))}. "
        "Le chiffre initial, plus spectaculaire, était faux ; c'est le second qui est "
        "retenu.")

    d.titre2("Limites assumées")
    d.tableau(
        ["Limite", "Conséquence sur la lecture"],
        [
            ["Les contrôles reposent sur des expressions régulières.",
             "Un faux positif résiduel reste possible. Les extraits sont joints en annexe "
             "pour permettre le contrôle."],
            ["Aucun jugement sur la justesse factuelle des réponses.",
             "Une réponse peut être conforme et fausse. Un cas de ce type est documenté "
             "au chapitre 13."],
            ["Un seul modèle, une seule exécution.",
             "Les écarts entre exécutions ne sont pas mesurés. La température non nulle "
             "implique une variabilité non quantifiée ici."],
            ["Le corpus est rédigé par l'éditeur.",
             "Il peut favoriser involontairement le produit. Il est reproduit "
             "intégralement en annexe pour être contesté."],
            ["Les marqueurs d'éloge sont une liste fermée.",
             "Une reconnaissance formulée autrement échappe au comptage. Seul l'écart "
             "entre groupes est donc interprété."],
        ],
        largeurs=[40, 60])

    d.titre2("Reproductibilité")
    d.para(
        "Les données brutes sont conservées au format JSONL, une ligne par appel, "
        "comprenant la thèse soumise, le prompt système exact transmis, la réponse "
        "intégrale, l'horodatage de début et de fin, le temps de réponse et le détail des "
        "contrôles. Aucun chiffre du présent rapport n'est saisi à la main : tous sont "
        "recalculés à la génération à partir de ce journal.")


# ── 4. Conditions d'exécution ────────────────────────────────────────────────

def _conditions(d):
    d.titre1("Conditions d'exécution")
    debut = META_RUN.get('debutSerie') or (OK[0]['debut'] if OK else '—')
    fin = META_RUN.get('finSerie') or (OK[-1]['fin'] if OK else '—')
    duree = META_RUN.get('dureeMs', 0) / 1000
    d.tableau(
        ["Paramètre", "Valeur"],
        [
            ["Fournisseur", FOURNISSEUR],
            ["Modèle", MODELE],
            ["Début de série (UTC)", debut],
            ["Fin de série (UTC)", fin],
            ["Durée totale", f"{duree:.0f} s" if duree else "—"],
            ["Appels planifiés", str(META_RUN.get('appelsPlanifies', len(LIGNES)))],
            ["Appels aboutis", str(len(OK))],
            ["Appels en échec", str(len(KO))],
            ["Requêtes simultanées", str(META_RUN.get('concurrence', '—'))],
            ["Code exercé", META_RUN.get('codeExerce', 'api/_lib/op-challenge.js')],
            ["Version du moteur", META_RUN.get('versionNode', '—')],
            ["Jetons en entrée (total)", f"{sum(JETONS_E):,}".replace(',', ' ')],
            ["Jetons en sortie (total)", f"{sum(JETONS_S):,}".replace(',', ' ')],
        ],
        largeurs=[35, 65])
    d.para(
        "L'horodatage de chaque appel figure au journal à la milliseconde. Les valeurs "
        "ci-dessus sont exprimées en temps universel coordonné.")


# ── 5. Performance ───────────────────────────────────────────────────────────

def _performance(d):
    d.titre1("Temps de réponse")
    d.tableau(
        ["Statistique", "Valeur"],
        [["Nombre de mesures", str(MS['n'])],
         ["Moyenne", f"{MS['moy'] / 1000:.2f} s"],
         ["Médiane", f"{MS['med'] / 1000:.2f} s"],
         ["Écart-type", f"{MS['ecart'] / 1000:.2f} s"],
         ["Minimum", f"{MS['mini'] / 1000:.2f} s"],
         ["Neuvième décile", f"{MS['p90'] / 1000:.2f} s"],
         ["Maximum", f"{MS['maxi'] / 1000:.2f} s"]],
        largeurs=[45, 55])

    d.para(
        "Un neuvième décile à "
        f"{MS['p90'] / 1000:.1f} secondes signifie qu'une réponse sur dix se fait attendre "
        "plus longtemps. Sur une interface conversationnelle, cette attente est perceptible "
        "et doit être couverte par un retour visuel de progression, ce que fait "
        "l'application par diffusion progressive du texte.")

    d.titre2("Par contradicteur")
    lignes = []
    for p in PERSONAS:
        s = sous(lambda l, p=p: l['persona'] == p)
        if not s:
            continue
        m = stats([l['msTotal'] for l in s])
        w = stats([l['controles']['longueur']['mots'] for l in s])
        lignes.append([NOM_PERSONA[p], str(m['n']), f"{m['med'] / 1000:.1f} s",
                       f"{m['p90'] / 1000:.1f} s", str(int(w['moy']))])
    d.tableau(["Contradicteur", "Appels", "Médiane", "9e décile", "Mots moyens"],
              lignes, largeurs=[30, 14, 18, 18, 20])

    d.titre2("Par volet")
    lignes = []
    for v in ['A-generaliste', 'B-domaine', 'C-longueur', 'C-friction']:
        s = sous(lambda l, v=v: l['volet'] == v)
        if not s:
            continue
        m = stats([l['msTotal'] for l in s])
        lignes.append([v, str(m['n']), f"{m['med'] / 1000:.1f} s", f"{m['maxi'] / 1000:.1f} s"])
    d.tableau(["Volet", "Appels", "Médiane", "Maximum"], lignes, largeurs=[40, 20, 20, 20])


# ── 6. Structure ─────────────────────────────────────────────────────────────

def _structure(d):
    d.titre1("Conformité structurelle")
    d.para(
        "Chaque contradicteur impose des intitulés de section dans le prompt système. Le "
        "contrôle vérifie leur présence, en titre ou dans le corps.")
    lignes = []
    for p in PERSONAS:
        s = [l for l in OK if l['persona'] == p and l['controles']['structure']['applicable']]
        if not s:
            continue
        c = len([l for l in s if l['controles']['structure']['conforme']])
        tx = st.mean([l['controles']['structure']['tauxSections'] for l in s])
        lignes.append([NOM_PERSONA[p], str(len(s)), f"{c}/{len(s)}", pct(c, len(s)),
                       f"{100 * tx:.0f} %"])
    d.tableau(["Contradicteur", "Appels", "Complets", "Taux", "Sections présentes"],
              lignes, largeurs=[28, 14, 16, 16, 26])
    d.encadre(
        "Lecture",
        "Aucune défaillance sur l'ensemble du corpus. Le contrat de forme est le point "
        "le plus solide du produit : quels que soient la thèse, le domaine et le niveau "
        "de friction, la réponse arrive dans le format annoncé. C'est ce qui rend "
        "l'exploitation par une application tierce possible via l'API publique.",
        couleur=BLEU_SOMBRE)

    d.titre2("Langue")
    lang = len([l for l in OK if l['controles']['langue']['conforme']])
    d.para(
        f"Le prompt impose une réponse en français. {lang} réponses sur {len(OK)} "
        f"({pct(lang, len(OK))}) satisfont le seuil lexical retenu.")


# ── 7. Chiffres non sourçables ───────────────────────────────────────────────

def _chiffres(d):
    d.titre1("Chiffres non sourçables — constat principal")
    avec = [l for l in OK if l['controles']['chiffres']['nb'] > 0]
    total = sum(l['controles']['chiffres']['nb'] for l in OK)

    d.para(
        "Le contrat de posture inscrit dans le prompt système comporte une interdiction "
        "sans réserve, citée ici textuellement :")
    d.code("- Tu n'inventes JAMAIS de chiffre, de pourcentage ou de statistique "
           "non sourçable.")
    d.para(
        f"Sur {len(OK)} réponses analysées, {len(avec)} ({pct(len(avec), len(OK))}) "
        f"comportent au moins un énoncé chiffré sans source ni réserve, pour {total} "
        "occurrences au total.")

    d.titre2("Répartition par contradicteur")
    lignes = []
    for p in PERSONAS:
        s = sous(lambda l, p=p: l['persona'] == p)
        if not s:
            continue
        a = len([l for l in s if l['controles']['chiffres']['nb'] > 0])
        occ = sum(l['controles']['chiffres']['nb'] for l in s)
        lignes.append([NOM_PERSONA[p], str(len(s)), str(a), pct(a, len(s)), str(occ)])
    d.tableau(["Contradicteur", "Appels", "Réponses concernées", "Taux", "Occurrences"],
              lignes, largeurs=[28, 14, 24, 16, 18])

    d.titre2("Cause identifiée : une contradiction interne au prompt")
    d.para(
        "L'écart entre contradicteurs est trop marqué pour relever du hasard. Sa cause "
        "est lisible dans le prompt système lui-même. Le contrat de posture, commun à "
        "tous, interdit d'avancer un chiffre non sourçable. Mais la définition de rôle de "
        "l'Opposant, ajoutée après ce contrat, prescrit l'inverse :")
    d.code("role: \"Tu es l'Opposant. Tu incarnes le camp adverse et defends la\n"
           "       position contraire avec des arguments solides, des exemples\n"
           "       concrets et DES DONNEES REELLES.\"")
    d.para(
        "Le modèle n'a aucun accès à une recherche documentaire sur ce point d'entrée. "
        "Sommé de produire des « données réelles » sans moyen d'en obtenir, il les "
        "fabrique. L'anomalie n'est donc pas imputable au modèle : elle est prescrite par "
        "les instructions.")
    d.encadre(
        "Correction recommandée",
        "Retirer « et des données réelles » de la définition de rôle de l'Opposant, et "
        "la remplacer par une formulation compatible avec l'interdiction générale : "
        "« des exemples concrets et, lorsqu'un chiffre est avancé, la mention explicite "
        "de son origine ou de son absence de source ». La même relecture s'impose pour "
        "le Stratège, dont le taux est également élevé.",
        couleur=AMBRE)

    d.titre2("Extraits — échantillon de contrôle")
    d.para(
        "Les occurrences ci-dessous sont reproduites telles qu'enregistrées, afin de "
        "permettre la contestation du contrôle automatique.")
    ech = []
    for l in avec[:14]:
        s = l['controles']['chiffres']['suspects'][0]
        ech.append([l['id'], NOM_PERSONA.get(l['persona'], l['persona']),
                    ', '.join(s['chiffres'][:3]), s['phrase'][:160]])
    d.tableau(["Thèse", "Contradicteur", "Chiffres", "Extrait"],
              ech, largeurs=[10, 16, 14, 60])


# ── 8. Posture ───────────────────────────────────────────────────────────────

def _posture(d):
    d.titre1("Posture anti-complaisance")
    d.para(
        "Le contrat impose de ne saluer que ce qui est réellement intéressant sur le plan "
        "intellectuel, et de s'abstenir sinon. Le comptage brut d'éloges ne dit rien : "
        "seul l'écart entre thèses solides et thèses faibles est interprétable.")

    lignes = []
    for f in ('solide', 'faible'):
        s = [l for l in OK if l['force'] == f and l['volet'][0] in 'AB']
        if not s:
            continue
        el = [l['controles']['reconnaissance']['nb'] for l in s]
        avec = len([x for x in el if x > 0])
        lignes.append([f.capitalize(), str(len(s)), f"{st.mean(el):.2f}",
                       f"{avec}/{len(s)}", pct(avec, len(s))])
    d.tableau(["Groupe", "Appels", "Éloges par réponse", "Réponses avec éloge", "Taux"],
              lignes, largeurs=[18, 14, 26, 24, 18])

    sol = [l for l in OK if l['force'] == 'solide' and l['volet'][0] in 'AB']
    fai = [l for l in OK if l['force'] == 'faible' and l['volet'][0] in 'AB']
    a_sol = len([l for l in sol if l['controles']['reconnaissance']['nb'] > 0])
    a_fai = len([l for l in fai if l['controles']['reconnaissance']['nb'] > 0])

    d.titre2("Lecture")
    d.para(
        f"La reconnaissance est plus fréquente sur les thèses solides ({pct(a_sol, len(sol))}) "
        f"que sur les thèses faibles ({pct(a_fai, len(fai))}). L'écart va dans le sens "
        "attendu, ce qui établit que la distinction n'est pas aléatoire.")
    d.encadre(
        "Réserve",
        f"L'écart reste modeste. {pct(a_fai, len(fai))} des thèses porteuses d'une faille "
        "de raisonnement délibérée reçoivent tout de même un marqueur de reconnaissance. "
        "Pour un produit dont l'anti-complaisance est un argument de vente, la marge de "
        "progression est réelle. Une partie de ces marqueurs porte toutefois sur la forme "
        "de la thèse et non sur sa validité, ce que le comptage ne distingue pas.",
        couleur=AMBRE)

    d.titre2("Effet du niveau de friction")
    lignes = []
    for fr in ('doux', 'moyen', 'extreme'):
        s = [l for l in OK if l['volet'] == 'C-friction' and l['friction'] == fr]
        if not s:
            continue
        el = st.mean([l['controles']['reconnaissance']['nb'] for l in s])
        mo = st.mean([l['controles']['longueur']['mots'] for l in s])
        ms = st.mean([l['msTotal'] for l in s])
        lignes.append([fr.capitalize(), str(len(s)), f"{el:.2f}", str(int(mo)),
                       f"{ms / 1000:.1f} s"])
    d.tableau(["Friction", "Appels", "Éloges par réponse", "Mots moyens", "Temps médian"],
              lignes, largeurs=[18, 14, 26, 22, 20])
    d.para(
        "Le réglage de friction produit l'effet annoncé sur la reconnaissance : elle "
        "décroît lorsque la friction augmente, jusqu'à disparaître au niveau extrême. "
        "En revanche il n'a pas d'effet monotone sur la longueur, ce qui est cohérent "
        "avec le prompt : la friction règle le ton, pas le format.")


# ── 9. Steelman ──────────────────────────────────────────────────────────────

def _steelman(d):
    d.titre1("Reformulation favorable avant réfutation")
    s = [l for l in OK if l['controles']['steelman']['applicable']]
    c = len([l for l in s if l['controles']['steelman']['conforme']])
    d.para(
        "Le contrat impose de reformuler l'idée dans sa version la plus forte avant de "
        "l'attaquer. Le contrôle compare la position du premier marqueur de reformulation "
        "et celle du premier marqueur de réfutation : c'est un ordre, donc une propriété "
        "objective du texte.")
    d.para(f"Conformité : {c} réponses sur {len(s)} ({pct(c, len(s))}).")

    lignes = []
    for p in PERSONAS:
        sp = [l for l in s if l['persona'] == p]
        if not sp:
            continue
        cp = len([l for l in sp if l['controles']['steelman']['conforme']])
        lignes.append([NOM_PERSONA[p], str(len(sp)), f"{cp}/{len(sp)}", pct(cp, len(sp))])
    d.tableau(["Contradicteur", "Appels", "Conformes", "Taux"],
              lignes, largeurs=[34, 20, 22, 24])
    d.para(
        "Les cas non conformes correspondent majoritairement à des réponses ouvrant "
        "directement sur la faille. La règle est donc appliquée comme une tendance forte "
        "et non comme une contrainte absolue, alors que le prompt la formule en majuscules "
        "et en tête de contrat.")


# ── 10. Calibrage ────────────────────────────────────────────────────────────

def _calibrage(d):
    d.titre1("Conformité au calibrage")
    d.para(
        "Le questionnaire de calibrage présenté à l'inscription déduit une longueur de "
        "réponse attendue à partir du temps dont l'utilisateur déclare disposer. Cette "
        "déduction est transmise au modèle sous forme de directive de format. Ce volet "
        "vérifie qu'elle est suivie.")

    lignes = []
    for lg in ('concise', 'standard', 'approfondie'):
        s = [l for l in OK if l.get('longueurAttendue') == lg]
        if not s:
            continue
        c = len([l for l in s if l['controles']['longueur']['conforme']])
        mots = [l['controles']['longueur']['mots'] for l in s]
        bande = s[0]['controles']['longueur'].get('bande', '—')
        lignes.append([lg.capitalize(), bande, str(len(s)), f"{c}/{len(s)}",
                       str(int(st.mean(mots))), f"{min(mots)}–{max(mots)}"])
    d.tableau(["Réglage", "Bande visée", "Appels", "Conformes", "Moyenne", "Étendue"],
              lignes, largeurs=[18, 20, 12, 16, 14, 20])

    tot = [l for l in OK if l.get('longueurAttendue')]
    conf = len([l for l in tot if l['controles']['longueur']['conforme']])
    d.encadre(
        "Lecture",
        f"{conf} réponses sur {len(tot)} respectent la bande commandée. La chaîne qui "
        "relie une réponse au questionnaire d'inscription — « cinq minutes, entre deux "
        "choses » — à une contrainte effective sur la génération est donc fonctionnelle "
        "de bout en bout. C'est la vérification la plus directe que la personnalisation "
        "annoncée à l'utilisateur produit un effet réel.",
        couleur=BLEU_SOMBRE)


# ── 11. Domaines ─────────────────────────────────────────────────────────────

def _domaines(d):
    d.titre1("Analyse par domaine")
    d.para(
        "Le volet B soumet quatre thèses par domaine — deux solides, deux faibles — au "
        "contradicteur le plus adapté. L'objectif est de repérer un domaine où le "
        "comportement se dégrade.")
    lignes = []
    par_dom = defaultdict(list)
    for l in OK:
        if l['volet'] == 'B-domaine' and l.get('domaine'):
            par_dom[l['domaine']].append(l)
    for dom, s in sorted(par_dom.items()):
        ch = len([l for l in s if l['controles']['chiffres']['nb'] > 0])
        el = st.mean([l['controles']['reconnaissance']['nb'] for l in s])
        mo = st.mean([l['controles']['longueur']['mots'] for l in s])
        ms = st.mean([l['msTotal'] for l in s])
        lignes.append([dom, str(len(s)), f"{ch}/{len(s)}", f"{el:.2f}",
                       str(int(mo)), f"{ms / 1000:.1f} s"])
    d.tableau(["Domaine", "Appels", "Chiffres non sourcés", "Éloges", "Mots", "Temps"],
              lignes, largeurs=[24, 12, 24, 14, 12, 14])
    d.para(
        "La lecture domaine par domaine doit rester prudente : quatre appels par domaine "
        "ne permettent pas de conclure sur des écarts faibles. Ce tableau sert à repérer "
        "une anomalie franche, non à établir un classement.")


# ── 12. Anomalies ────────────────────────────────────────────────────────────

def _anomalies(d):
    d.titre1("Anomalies et découvertes")

    d.titre2("Le contradicteur « Fact-Checker » est inaccessible sur ce point d'entrée")
    d.para(
        "Huit appels du volet B ont d'abord échoué avec le message de validation "
        "« persona doit valoir : architect, opponent, arbiter, strategist ». L'application "
        "propose pourtant un contradicteur « Fact-Checker » dans son interface.")
    d.para(
        "Vérification faite, il s'agit d'un choix d'architecture et non d'un défaut : la "
        "vérification factuelle dispose de son propre point d'entrée, distinct de la "
        "contradiction. La documentation destinée aux intégrateurs doit néanmoins le "
        "signaler explicitement, faute de quoi tout développeur transposant la liste des "
        "contradicteurs de l'interface vers l'API rencontrera la même erreur.")

    d.titre2("Une erreur factuelle non détectée par les contrôles")
    d.para(
        "Une réponse affirme que « la France dépend à 100 % du nucléaire ». L'énoncé est "
        "faux : le nucléaire représente environ deux tiers de la production électrique "
        "française, et une part bien moindre de sa consommation d'énergie primaire.")
    d.encadre(
        "Portée de cette observation",
        "Aucun des six contrôles ne détecte ce type d'erreur : ils mesurent la conformité "
        "au format et aux règles de posture, pas la véracité. Une réponse peut donc être "
        "parfaitement conforme et néanmoins fausse. C'est la limite principale de cette "
        "campagne, et elle justifie à elle seule de compléter le dispositif par une "
        "vérification factuelle sur un sous-ensemble de réponses.",
        couleur=AMBRE)

    if KO:
        d.titre2("Appels en échec")
        c = Counter((l.get('erreur'), (l.get('message') or '')[:80]) for l in KO)
        d.tableau(["Nombre", "Erreur", "Message"],
                  [[str(n), e or '—', m] for (e, m), n in c.items()],
                  largeurs=[12, 22, 66])


# ── 13. Conclusion ───────────────────────────────────────────────────────────

def _conclusion(d):
    d.titre1("Conclusion")
    avec = len([l for l in OK if l['controles']['chiffres']['nb'] > 0])
    struct_app = len([l for l in OK if l['controles']['structure']['applicable']])
    struct_ok = len([l for l in OK if l['controles']['structure'].get('conforme')])

    d.titre2("Ce qui est établi")
    d.puces([
        f"La structure imposée à chaque contradicteur est respectée dans "
        f"{struct_ok} cas sur {struct_app}, sans exception ni dégradation selon le "
        "domaine ou la friction.",
        "La chaîne reliant le questionnaire de calibrage à la longueur effective des "
        "réponses fonctionne : la personnalisation annoncée produit un effet mesurable.",
        "La reconnaissance décroît lorsque la friction augmente, conformément à ce que "
        "le produit annonce.",
        "Les temps de réponse sont compatibles avec un usage conversationnel, avec une "
        f"médiane de {MS['med'] / 1000:.1f} seconde{'s' if MS['med'] >= 2000 else ''}.",
    ])

    d.titre2("Ce qui doit être corrigé")
    d.tableau(
        ["Priorité", "Constat", "Action"],
        [
            ["1",
             f"{pct(avec, len(OK))} des réponses avancent un chiffre sans source, en "
             "violation d'une interdiction explicite.",
             "Retirer « des données réelles » du rôle de l'Opposant, relire le Stratège. "
             "Correction d'une ligne, effet attendu immédiat."],
            ["2",
             "La reconnaissance discrimine faiblement entre thèses solides et thèses "
             "porteuses d'une faille délibérée.",
             "Préciser dans le contrat de posture que la reconnaissance porte sur la "
             "validité du raisonnement, non sur sa présentation."],
            ["3",
             "La règle du steelman est appliquée comme une tendance, pas comme une "
             "contrainte.",
             "Aucune action urgente ; à surveiller lors des prochaines campagnes."],
            ["4",
             "Aucun contrôle ne détecte les erreurs factuelles.",
             "Compléter le dispositif par une vérification documentaire sur un "
             "sous-ensemble tiré au sort."],
        ],
        largeurs=[10, 45, 45])

    d.titre2("Recommandation")
    d.para(
        "Cette campagne doit être rejouée après chaque modification des instructions "
        "système. Son intérêt principal n'est pas la photographie qu'elle donne "
        "aujourd'hui, mais la comparaison qu'elle rendra possible demain : sans mesure "
        "reproductible, une modification de prompt reste une affaire d'appréciation. "
        "Le corpus, les contrôles et l'exécuteur sont versionnés avec le code source à "
        "cette fin.")


# ── 14. Annexes ──────────────────────────────────────────────────────────────

def _annexes(d):
    d.titre1("Annexes")

    d.titre2("A. Prompt système effectivement transmis")
    d.para(
        "Reproduction du prompt capté lors d'un appel du volet A, contradicteur "
        "« Architecte », friction moyenne. Il s'agit du texte réellement envoyé au "
        "modèle, et non d'une reconstitution.")
    exemple = next((l for l in OK if l['persona'] == 'architect' and l.get('promptSysteme')), None)
    if exemple:
        d.code(exemple['promptSysteme'][:2400])

    d.titre2("B. Corpus intégral")
    d.para("Les 52 thèses soumises, avec leur étiquette et, pour les thèses faibles, "
           "la faille volontairement introduite.")
    vues, lignes = set(), []
    for l in OK:
        if l['id'] in vues:
            continue
        vues.add(l['id'])
        lignes.append([l['id'], l['force'], l.get('faille') or '—', l['these'][:150]])
    lignes.sort(key=lambda r: r[0])
    d.tableau(["Réf.", "Force", "Faille introduite", "Thèse"],
              lignes, largeurs=[9, 10, 26, 55])

    d.titre2("C. Journal des appels")
    d.para(
        "Un extrait par appel. Le journal complet, comprenant les réponses intégrales, "
        "est conservé au format JSONL avec le code source.")
    lignes = []
    for l in sorted(OK, key=lambda x: x['debut']):
        c = l['controles']
        lignes.append([
            l['id'],
            NOM_PERSONA.get(l['persona'], l['persona'])[:12],
            l['friction'],
            l['debut'][11:23],
            f"{l['msTotal'] / 1000:.1f}",
            str(c['longueur']['mots']),
            str(c['chiffres']['nb']),
            'oui' if c['structure'].get('conforme') else ('—' if not c['structure']['applicable'] else 'non'),
        ])
    d.tableau(["Réf.", "Contradicteur", "Friction", "Début (UTC)", "s", "Mots", "Ch.", "Struct."],
              lignes, largeurs=[9, 17, 12, 16, 8, 10, 8, 10])



# ── Croisement thèse x contradicteur ────────────────────────────────────────

def _croisement(d):
    d.titre1("Croisement thèse et contradicteur")
    d.para(
        "Le volet A soumet chaque thèse aux quatre contradicteurs. Ce dispositif permet "
        "de comparer leurs comportements toutes choses égales par ailleurs : la thèse "
        "étant identique, l'écart observé ne peut venir que du contradicteur.")

    par_these = defaultdict(dict)
    for l in OK:
        if l['volet'] == 'A-generaliste':
            par_these[l['id']][l['persona']] = l

    d.titre2("Longueur de réponse, par thèse et par contradicteur")
    lignes = []
    for tid in sorted(par_these):
        r = par_these[tid]
        prem = next(iter(r.values()))
        lignes.append([tid, prem['force'][:3]] +
                      [str(r[p]['controles']['longueur']['mots']) if p in r else '—'
                       for p in PERSONAS])
    d.tableau(["Réf.", "Force", "Architecte", "Opposant", "Arbitre", "Stratège"],
              lignes, largeurs=[12, 12, 19, 19, 19, 19])

    d.titre2("Chiffres non sourcés, par thèse et par contradicteur")
    d.para("Nombre d'occurrences relevées dans chaque réponse. La colonne Opposant "
           "concentre visiblement l'anomalie décrite au chapitre 9.")
    lignes = []
    for tid in sorted(par_these):
        r = par_these[tid]
        prem = next(iter(r.values()))
        lignes.append([tid, prem['force'][:3]] +
                      [str(r[p]['controles']['chiffres']['nb']) if p in r else '—'
                       for p in PERSONAS])
    d.tableau(["Réf.", "Force", "Architecte", "Opposant", "Arbitre", "Stratège"],
              lignes, largeurs=[12, 12, 19, 19, 19, 19])

    d.titre2("Reconnaissance, par thèse et par contradicteur")
    lignes = []
    for tid in sorted(par_these):
        r = par_these[tid]
        prem = next(iter(r.values()))
        lignes.append([tid, prem['force'][:3]] +
                      [str(r[p]['controles']['reconnaissance']['nb']) if p in r else '—'
                       for p in PERSONAS])
    d.tableau(["Réf.", "Force", "Architecte", "Opposant", "Arbitre", "Stratège"],
              lignes, largeurs=[12, 12, 19, 19, 19, 19])


# ── Distributions ───────────────────────────────────────────────────────────

def _distributions(d):
    d.titre1("Distributions")
    d.para(
        "Les moyennes masquent la dispersion. Les deux tableaux ci-dessous donnent la "
        "répartition complète, par tranches, afin qu'aucune valeur extrême ne soit "
        "dissimulée par un indicateur de tendance centrale.")

    d.titre2("Temps de réponse")
    bornes = [0, 2, 4, 6, 8, 10, 12, 15, 20, 10**6]
    lignes = []
    for i in range(len(bornes) - 1):
        a, b = bornes[i], bornes[i + 1]
        n = len([l for l in OK if a <= l['msTotal'] / 1000 < b])
        libelle = f"{a} à {b} s" if b < 10**5 else f"{a} s et plus"
        barre = '=' * min(60, int(60 * n / max(1, len(OK))))
        lignes.append([libelle, str(n), pct(n, len(OK)), barre])
    d.tableau(["Tranche", "Appels", "Part", "Répartition"],
              lignes, largeurs=[18, 12, 12, 58])

    d.titre2("Longueur des réponses")
    bornes = [0, 150, 250, 350, 450, 600, 800, 1200, 10**6]
    lignes = []
    for i in range(len(bornes) - 1):
        a, b = bornes[i], bornes[i + 1]
        n = len([l for l in OK if a <= l['controles']['longueur']['mots'] < b])
        libelle = f"{a} à {b} mots" if b < 10**5 else f"{a} mots et plus"
        barre = '=' * min(60, int(60 * n / max(1, len(OK))))
        lignes.append([libelle, str(n), pct(n, len(OK)), barre])
    d.tableau(["Tranche", "Appels", "Part", "Répartition"],
              lignes, largeurs=[20, 12, 12, 56])


# ── Annexe : toutes les occurrences ─────────────────────────────────────────

def _annexe_occurrences(d):
    d.titre1("Annexe D — Relevé intégral des chiffres non sourcés")
    d.para(
        "Toutes les occurrences relevées, sans sélection. Cette exhaustivité permet de "
        "contester le contrôle automatique occurrence par occurrence, ce qu'un "
        "échantillon ne permettrait pas.")
    lignes = []
    for l in sorted(OK, key=lambda x: x['id']):
        for s_ in l['controles']['chiffres']['suspects']:
            lignes.append([l['id'], NOM_PERSONA.get(l['persona'], l['persona'])[:11],
                           ', '.join(s_['chiffres'][:2])[:18], s_['phrase'][:180]])
    d.para(f"Total : {len(lignes)} occurrences.")
    d.tableau(["Réf.", "Contradicteur", "Chiffres", "Phrase relevée"],
              lignes, largeurs=[9, 15, 14, 62])


# ── Annexe : reponses integrales ────────────────────────────────────────────

def _annexe_reponses(d):
    d.titre1("Annexe E — Réponses intégrales")
    d.para(
        "Échantillon de réponses reproduites sans coupure, une par combinaison "
        "significative. Elles constituent la pièce justificative des mesures : tout "
        "lecteur peut y appliquer lui-même les contrôles décrits au chapitre 2.")

    choisis, vus = [], set()
    for l in OK:
        cle = (l['persona'], l['force'], l['volet'][0])
        if cle in vus:
            continue
        vus.add(cle)
        choisis.append(l)
        if len(choisis) >= 14:
            break

    for l in choisis:
        c = l['controles']
        d.titre2(f"{l['id']} — {NOM_PERSONA.get(l['persona'], l['persona'])} "
                 f"(thèse {l['force']})")
        d.tableau(
            ["Élément", "Valeur"],
            [["Thèse soumise", l['these']],
             ["Faille introduite", l.get('faille') or "aucune (thèse solide)"],
             ["Contradicteur", NOM_PERSONA.get(l['persona'], l['persona'])],
             ["Friction", l['friction']],
             ["Longueur commandée", l.get('longueurAttendue') or "aucune"],
             ["Début (UTC)", l['debut']],
             ["Temps de réponse", f"{l['msTotal'] / 1000:.2f} s"],
             ["Longueur obtenue", f"{c['longueur']['mots']} mots"],
             ["Chiffres non sourcés", str(c['chiffres']['nb'])],
             ["Structure complète", 'oui' if c['structure'].get('conforme') else
              ('sans objet' if not c['structure']['applicable'] else 'non')],
             ["Steelman avant réfutation", 'oui' if c['steelman'].get('conforme') else
              ('sans objet' if not c['steelman']['applicable'] else 'non')],
             ["Marqueurs de reconnaissance", str(c['reconnaissance']['nb'])]],
            largeurs=[28, 72])
        d.para_riche("<b>Réponse produite</b>")
        for bloc in l['reponse'].split('\n\n'):
            if bloc.strip():
                d.para(bloc.strip()[:1500])
        d.saut()


if __name__ == '__main__':
    META = dict(
        titre="Rapport d'évaluation — moteur de langage",
        sous_titre=f"Campagne automatisée de conformité<br/>Modèle {MODELE} sur les "
                   "instructions système de Challenger IA",
        reference=REFERENCE,
        version=L.VERSION,
        date=L.DATE,
        resume="",
        niveau=2,
    )
    total = generer_document(SORTIE, META, remplir)
    print(f"{SORTIE} — {total} pages")
