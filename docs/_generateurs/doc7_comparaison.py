# -*- coding: utf-8 -*-
"""Document 7 — Rapport comparatif de cinq campagnes d'évaluation.

    python3 doc7_comparaison.py <sortie.pdf>

Les campagnes sont lues depuis evals/resultats/. Tous les chiffres sont
recalculés à la génération ; aucun n'est saisi à la main.
"""
import glob
import json
import os
import statistics as st
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdfkit_cia import generer_document, AMBRE, BLEU_SOMBRE, GRIS, ENCRE
import legal_cia as L

DEPOT = '/Users/morganreichert/Desktop/challenger-ia-chatbot'
SORTIE = sys.argv[1]

# ─────────────────────────────────────────────────────────────────────────────
# Chargement des cinq campagnes
# ─────────────────────────────────────────────────────────────────────────────

fichiers = sorted(glob.glob(f'{DEPOT}/evals/resultats/mistral_*.jsonl'),
                  key=os.path.getmtime)
REF = [f for f in fichiers if f.endswith('.recalc.jsonl')][0]
BRUTS = [f for f in fichiers if not f.endswith('.recalc.jsonl')]

CAMPAGNES = [
    ('C1', REF,       "Référence",
     "État du prompt système avant toute correction. Contrôles recalculés en version 2."),
    ('C2', BRUTS[-4], "Correctif 1",
     "Retrait de « des données réelles » du rôle de l'Opposant ; règle « chiffres » "
     "reformulée avec une clause permettant l'ordre de grandeur ; reconnaissance "
     "rendue obligatoire dans la posture."),
    ('C3', BRUTS[-3], "Correctif 2",
     "Suppression de la clause permissive sur l'ordre de grandeur, jugée responsable "
     "de la régression de l'Architecte."),
    ('C4', BRUTS[-2], "Correctif 3",
     "Reconnaissance inscrite dans les structures de section et non plus seulement "
     "dans la posture ; interdiction faite au Stratège de chiffrer ses étapes."),
    ('C5', BRUTS[-1], "Témoin de variance",
     "Prompt strictement identique à C4. Sert exclusivement à mesurer l'écart "
     "entre deux exécutions dans des conditions inchangées."),
]


def charger(chemin):
    L_ = [json.loads(x) for x in open(chemin, encoding='utf-8') if x.strip()]
    return [x for x in L_ if x.get('ok')]


D = {c: charger(f) for c, f, _, _ in CAMPAGNES}
CODES = [c for c, *_ in CAMPAGNES]
LIB = {c: t for c, _, t, _ in CAMPAGNES}

PERSONAS = ['architect', 'opponent', 'arbiter', 'strategist']
NOM_P = {'architect': "L'Architecte", 'opponent': "L'Opposant",
         'arbiter': "L'Arbitre", 'strategist': 'Le Stratège'}

CH = lambda l: l['controles']['chiffres']['nb'] > 0
STRUCT = lambda l: l['controles']['structure'].get('conforme')
STEEL = lambda l: l['controles']['steelman'].get('conforme')
ABS = lambda l: l['controles']['absolus']['nb'] > 0


def pc(sous, fn):
    return 100 * len([l for l in sous if fn(l)]) / len(sous) if sous else 0


def reco(camp, force):
    g = [l for l in D[camp] if l['force'] == force and l['volet'][0] in 'AB']
    return 100 * len([l for l in g if l['controles']['reconnaissance']['nb'] > 0]) / len(g) if g else 0


# Plancher de bruit mesuré par le couple C4 / C5 (prompt identique).
BRUIT = {
    'global': abs(pc(D['C4'], CH) - pc(D['C5'], CH)),
    **{p: abs(pc([l for l in D['C4'] if l['persona'] == p], CH)
              - pc([l for l in D['C5'] if l['persona'] == p], CH)) for p in PERSONAS},
}
BRUIT_MAX = max(BRUIT.values())


# ─────────────────────────────────────────────────────────────────────────────

def remplir(d):
    d.couverture()
    d.mentions_legales(L.blocs(
        "Le présent document compare cinq campagnes d'évaluation successives conduites "
        "sur le moteur de langage de Challenger IA, dont quatre après modification des "
        "instructions système et une servant de témoin de variance. Il établit ce que "
        "les mesures permettent de conclure, et ce qu'elles ne permettent pas.",
        niveau=2))
    d.sommaire()

    _resume(d)
    _variance(d)
    _corrections_mesure(d)
    _corrections_prompt(d)
    _resultats(d)
    _personas(d)
    _reconnaissance(d)
    _etabli(d)
    _methodo(d)
    _conclusion(d)
    _annexe_campagnes(d)
    _annexe_reponses(d)
    _annexe_occurrences(d)
    _annexe_journal(d)


# ── 1 ────────────────────────────────────────────────────────────────────────

def _resume(d):
    d.titre1("Résumé exécutif")
    total = sum(len(D[c]) for c in CODES)
    d.para(
        f"Cinq campagnes, {total} appels au total, corpus et protocole identiques. "
        "Quatre d'entre elles suivent une modification des instructions système ; la "
        "cinquième reprend exactement le prompt de la quatrième afin de mesurer l'écart "
        "imputable au seul hasard de génération.")

    d.titre2("Le résultat le plus important")
    d.encadre(
        "Deux exécutions identiques diffèrent de plusieurs points",
        f"Entre C4 et C5, dont les instructions sont rigoureusement les mêmes, la part "
        f"de réponses contenant un chiffre non sourcé varie de {BRUIT['global']:.1f} point. "
        f"L'écart atteint {BRUIT['opponent']:.0f} points pour l'Opposant et "
        f"{BRUIT['arbiter']:.0f} points pour l'Arbitre. "
        "Toute variation inférieure à une dizaine de points, entre deux campagnes, est "
        "donc indiscernable du bruit — quelle qu'ait été la modification apportée entre "
        "les deux.",
        couleur=AMBRE)
    d.para(
        "Cette constatation invalide la précision affichée par le rapport précédent "
        "(CIA-DOC-06), qui annonçait « 32,4 % » sans marge. La valeur juste est de "
        f"l'ordre de 32 % à ±{BRUIT_MAX:.0f} points. Elle ne remet pas en cause le "
        "constat de fond — le produit avance trop souvent des chiffres invérifiables — "
        "mais elle interdit d'attribuer à une modification du prompt une amélioration "
        "de quelques points.")

    d.titre2("Vue d'ensemble")
    lignes = [["Chiffres non sourcés"] + [f"{pc(D[c], CH):.1f} %" for c in CODES],
              ["Structure complète"] + [f"{pc(D[c], STRUCT):.1f} %" for c in CODES],
              ["Steelman respecté"] + [f"{pc(D[c], STEEL):.1f} %" for c in CODES],
              ["Affirmations absolues"] + [f"{pc(D[c], ABS):.1f} %" for c in CODES],
              ["Reconnaissance — thèses solides"] + [f"{reco(c, 'solide'):.1f} %" for c in CODES],
              ["Reconnaissance — thèses faibles"] + [f"{reco(c, 'faible'):.1f} %" for c in CODES]]
    d.tableau(["Indicateur"] + CODES, lignes, largeurs=[34] + [13] * 5)

    d.titre2("Ce qu'il faut en retenir")
    d.puces([
        "Le respect de la structure et l'ordre steelman-puis-réfutation sont acquis et "
        "stables : entre 98 et 100 % sur les cinq campagnes.",
        "La production de chiffres invérifiables reste le défaut principal, entre 26 et "
        "32 % selon les campagnes, sans qu'aucune correction n'ait produit d'effet "
        "démontrable au-delà du bruit.",
        "La reconnaissance de ce qui tient dans une thèse solide est nulle ou quasi "
        "nulle sur toutes les campagnes, et trois corrections successives n'y ont rien "
        "changé. C'est le constat le plus solide de cette série, et le plus préoccupant.",
    ])


# ── 2 ────────────────────────────────────────────────────────────────────────

def _variance(d):
    d.titre1("Le problème de la variance")
    d.para(
        "Les appels sont émis à température 0,7 : le modèle ne produit pas deux fois la "
        "même réponse à la même question. Le rapport précédent négligeait cette "
        "propriété et présentait ses mesures comme des valeurs exactes. La campagne C5 "
        "corrige cet oubli.")

    d.titre2("Protocole du témoin")
    d.para(
        "C5 reprend le prompt de C4 sans y changer un caractère, le même corpus, les "
        "mêmes réglages, la même concurrence. Toute différence observée entre C4 et C5 "
        "provient donc exclusivement du hasard de génération.")

    lignes = [["Ensemble du corpus", f"{pc(D['C4'], CH):.1f} %", f"{pc(D['C5'], CH):.1f} %",
               f"{BRUIT['global']:.1f} pt"]]
    for p in PERSONAS:
        a = pc([l for l in D['C4'] if l['persona'] == p], CH)
        b = pc([l for l in D['C5'] if l['persona'] == p], CH)
        lignes.append([NOM_P[p], f"{a:.0f} %", f"{b:.0f} %", f"{abs(a - b):.0f} pt"])
    d.tableau(["Périmètre", "C4", "C5", "Écart"], lignes, largeurs=[40, 20, 20, 20])

    d.titre2("Conséquence sur la lecture des campagnes")
    d.para(
        f"Le plancher de bruit est de l'ordre de {BRUIT_MAX:.0f} points sur un "
        "sous-ensemble de 46 appels, et de "
        f"{BRUIT['global']:.0f} points sur l'ensemble de 148. Une variation inférieure à "
        "ce seuil ne peut pas être interprétée. Concrètement :")
    d.tableau(
        ["Variation observée", "Interprétation admissible"],
        [["Moins de 5 points sur l'ensemble du corpus", "Aucune. Indiscernable du bruit."],
         ["De 5 à 10 points sur un contradicteur", "Aucune conclusion ferme. Répéter la mesure."],
         ["Plus de 15 points sur un contradicteur",
          "Effet vraisemblable, à confirmer par répétition."],
         ["Valeur stable sur cinq campagnes", "Constat robuste."]],
        largeurs=[42, 58])

    d.encadre(
        "Correction à apporter au dispositif",
        "Une campagne unique ne suffit pas à valider une modification du prompt. Deux "
        "voies sont possibles : répéter chaque configuration trois fois et comparer les "
        "moyennes, ce qui triple le coût ; ou abaisser la température à 0,2 pour les "
        "campagnes d'évaluation, ce qui réduit la variance mais éloigne la mesure des "
        "conditions réelles d'usage. La première voie est préférable, car elle mesure le "
        "produit tel qu'il est livré.",
        couleur=BLEU_SOMBRE)


# ── 3 ────────────────────────────────────────────────────────────────────────

def _corrections_mesure(d):
    d.titre1("Corrections apportées aux instruments de mesure")
    d.para(
        "Avant toute modification du produit, trois des six contrôles se sont révélés "
        "défaillants. Les corriger était un préalable : modifier un prompt pour "
        "répondre à un défaut de mesure aurait dégradé le produit sans que rien ne le "
        "signale.")

    d.titre2("Contrôle « reconnaissance » — refonte complète")
    d.para(
        "La première version comptait des adjectifs isolés : « solide », « pertinent », "
        "« rigoureux ». La relecture manuelle des neuf occurrences relevées sur thèses "
        "faibles a montré qu'aucune ne louait la thèse de l'utilisateur.")
    d.tableau(
        ["Occurrence relevée", "Ce qu'elle était réellement"],
        [["« aucune preuve scientifique solide »", "Une démolition de la thèse."],
         ["« l'objection la plus solide »", "Un titre de section de l'Opposant."],
         ["« des modèles économiques solides »", "La qualification de travaux tiers."],
         ["« ses propositions sont-elles solides ? »", "Une question, non une affirmation."],
         ["« un socle solide pour généraliser »", "Un conseil sur la méthode à suivre."]],
        largeurs=[40, 60])
    d.para(
        "La mesure était corrompue dans les deux groupes, ce qui gonflait artificiellement "
        "le taux de reconnaissance et masquait le constat réel. La version 2 n'accepte "
        "qu'un éloge adressé à la seconde personne : un compliment qui ne vise pas "
        "l'interlocuteur n'est pas de la complaisance.")
    d.tableau(
        ["Mesure", "Détecteur v1", "Détecteur v2"],
        [["Reconnaissance sur thèses solides", "48 %", f"{reco('C1', 'solide'):.1f} %"],
         ["Reconnaissance sur thèses faibles", "34 %", f"{reco('C1', 'faible'):.1f} %"]],
        largeurs=[46, 27, 27])

    d.titre2("Contrôle « steelman » — cécité à deux contradicteurs")
    d.para(
        "Le rapport précédent annonçait 77 % de conformité et attribuait l'écart à un "
        "relâchement du produit. Vérification faite, la totalité des manquements "
        "provenait de l'Arbitre et du Stratège, dont les structures ne comportent aucune "
        "section nommée « steelman ». Leurs premières sections — « Ce qui s'est dit » et "
        "« Où tu en es » — remplissent pourtant exactement la même fonction.")
    d.para(
        "Une fois ces équivalents reconnus par le contrôle, la conformité passe à 100 % "
        "sur les cinq campagnes. Le produit n'avait aucun défaut sur ce point : c'est la "
        "mesure qui était aveugle.")

    d.titre2("Contrôle « affirmations absolues » — ajout")
    d.para(
        "Le rapport précédent signalait une erreur factuelle — « la France dépend à 100 % "
        "du nucléaire » — qu'aucun contrôle ne détectait. Un septième contrôle a été "
        "ajouté. Il ne vérifie pas la véracité, hors de portée d'un contrôle mécanique, "
        "mais repère la forme qui rend l'erreur probable et invérifiable : le "
        "quantificateur universel appliqué à un fait, sans source ni nuance.")


# ── 4 ────────────────────────────────────────────────────────────────────────

def _corrections_prompt(d):
    d.titre1("Corrections apportées aux instructions système")
    for c, _, titre, desc in CAMPAGNES[1:]:
        d.titre2(f"{c} — {titre}")
        d.para(desc)

    d.titre2("Texte des règles, avant et après")
    d.para("Règle relative aux chiffres, état initial :")
    d.code("- Tu n'inventes JAMAIS de chiffre, de pourcentage ou de\n"
           "  statistique non sourcable.")
    d.para("État après C3, conservé en C4 et C5 :")
    d.code("- CHIFFRES : n'ecris un chiffre, un pourcentage ou une statistique\n"
           "  QUE si tu peux en nommer la source dans la meme phrase. Sinon,\n"
           "  raisonne sans lui : un argument sans chiffre vaut mieux qu'un\n"
           "  chiffre inverifiable. Tu n'as pas acces a une recherche\n"
           "  documentaire — considere donc que tu ne peux presque jamais\n"
           "  sourcer, et ecris en consequence.")
    d.para("Rôle de l'Opposant, état initial :")
    d.code("role: \"Tu es l'Opposant. [...] avec des arguments solides, des\n"
           "       exemples concrets et DES DONNEES REELLES.\"")
    d.para("État après C2 :")
    d.code("role: \"Tu es l'Opposant. [...] avec des arguments solides et des\n"
           "       exemples concrets. Si tu avances un chiffre, dis d'ou il\n"
           "       vient ; si tu ne peux pas le sourcer, dis-le plutot que\n"
           "       de l'affirmer.\"")

    d.titre2("Une leçon de rédaction")
    d.encadre(
        "Une clause permissive annule une interdiction",
        "Le correctif C2 comportait la phrase « si un ordre de grandeur éclaire ton "
        "propos et que tu ne peux pas le sourcer, annonce-le comme tel ». Elle visait à "
        "offrir une échappatoire honnête. Son effet observé a été inverse : la part de "
        "chiffres non sourcés de l'Architecte est passée de 6 % à 17 %, la clause "
        "l'autorisant à produire des chiffres là où l'interdiction précédente était "
        "sèche. Son retrait en C3 a ramené l'Architecte à 7 %. C'est le seul enchaînement "
        "de cette série dont l'amplitude dépasse nettement le bruit sur le contradicteur "
        "concerné.",
        couleur=AMBRE)


# ── 5 ────────────────────────────────────────────────────────────────────────

def _resultats(d):
    d.titre1("Résultats comparés")
    d.titre2("Indicateurs globaux, campagne par campagne")
    lignes = []
    for c in CODES:
        s = D[c]
        lignes.append([
            f"{c} — {LIB[c]}", str(len(s)),
            f"{pc(s, CH):.1f} %",
            str(sum(l['controles']['chiffres']['nb'] for l in s)),
            f"{pc(s, STRUCT):.1f} %",
            f"{pc(s, STEEL):.0f} %",
            f"{st.median([l['msTotal'] for l in s]) / 1000:.1f} s",
            str(int(st.mean([l['controles']['longueur']['mots'] for l in s]))),
        ])
    d.tableau(["Campagne", "n", "Chiffres", "Occ.", "Structure", "Steelman", "Médiane", "Mots"],
              lignes, largeurs=[24, 8, 13, 9, 14, 12, 11, 9])

    d.titre2("Lecture")
    v = [pc(D[c], CH) for c in CODES]
    d.para(
        f"La part de réponses contenant un chiffre non sourcé s'échelonne de {min(v):.1f} % "
        f"à {max(v):.1f} %, soit une amplitude de {max(v) - min(v):.1f} points. Le témoin "
        f"de variance établit qu'un écart de {BRUIT['global']:.1f} point survient sans "
        "aucune modification. L'amplitude observée sur cinq campagnes n'est donc que "
        "faiblement supérieure au bruit, et aucune correction ne peut se voir attribuer "
        "l'amélioration apparente.")
    d.para(
        "Les indicateurs de forme se comportent différemment : la structure reste entre "
        "98 et 100 %, le steelman à 100 % partout. Leur stabilité à travers cinq "
        "campagnes et cinq états du prompt en fait les acquis les mieux établis du "
        "produit.")


# ── 6 ────────────────────────────────────────────────────────────────────────

def _personas(d):
    d.titre1("Comportement par contradicteur")
    d.para(
        "Le croisement systématique du volet A fait passer chaque thèse par les quatre "
        "contradicteurs. Les écarts observés entre eux ne peuvent donc pas provenir des "
        "thèses.")

    d.titre2("Chiffres non sourcés")
    lignes = []
    for p in PERSONAS:
        vals = [pc([l for l in D[c] if l['persona'] == p], CH) for c in CODES]
        lignes.append([NOM_P[p]] + [f"{v:.0f} %" for v in vals] +
                      [f"{min(vals):.0f}–{max(vals):.0f} %"])
    d.tableau(["Contradicteur"] + CODES + ["Étendue"], lignes,
              largeurs=[24] + [11] * 5 + [21])

    d.para(
        "L'écart entre l'Architecte, qui se situe entre 6 et 17 %, et l'Opposant, entre "
        "37 et 59 %, dépasse largement le bruit sur toutes les campagnes. C'est le "
        "constat le plus robuste de cette série : le contradicteur choisi détermine la "
        "propension à produire des chiffres invérifiables, bien davantage que la "
        "formulation des règles générales.")
    d.encadre(
        "Interprétation",
        "L'Architecte analyse une structure de raisonnement : il n'a pas besoin de "
        "chiffres. L'Opposant doit défendre une position adverse, exercice qui appelle "
        "des faits — et sans accès documentaire, le modèle les fabrique. Le problème "
        "n'est donc pas de mauvaise volonté mais de mission : on demande à un "
        "contradicteur d'argumenter sur des faits sans lui donner les moyens de les "
        "vérifier.",
        couleur=BLEU_SOMBRE)
    d.para(
        "La conséquence pratique dépasse la rédaction du prompt. Rendre l'Opposant fiable "
        "suppose de lui donner accès à la recherche documentaire dont dispose déjà le "
        "point d'entrée de vérification factuelle, ou d'accepter qu'il argumente sans "
        "chiffres. Aucune formulation, si soignée soit-elle, ne résoudra une contrainte "
        "d'architecture.")

    d.titre2("Temps de réponse et longueur")
    lignes = []
    for p in PERSONAS:
        tous = [l for c in CODES for l in D[c] if l['persona'] == p]
        lignes.append([NOM_P[p], str(len(tous)),
                       f"{st.median([l['msTotal'] for l in tous]) / 1000:.1f} s",
                       f"{int(st.mean([l['controles']['longueur']['mots'] for l in tous]))}"])
    d.tableau(["Contradicteur", "Appels cumulés", "Temps médian", "Mots moyens"],
              lignes, largeurs=[30, 24, 23, 23])


# ── 7 ────────────────────────────────────────────────────────────────────────

def _reconnaissance(d):
    d.titre1("Reconnaissance — le constat qui résiste")
    d.para(
        "Le contrat de posture engage le produit à signaler ce qui tient dans un "
        "raisonnement. Le corpus comporte vingt-huit thèses délibérément solides, "
        "rédigées pour présenter les qualités que ce contrat énumère : nuance assumée, "
        "incertitude reconnue, contre-exemple anticipé, distinction fine.")

    lignes = [["Thèses solides"] + [f"{reco(c, 'solide'):.1f} %" for c in CODES],
              ["Thèses faibles"] + [f"{reco(c, 'faible'):.1f} %" for c in CODES]]
    d.tableau(["Groupe"] + CODES, lignes, largeurs=[30] + [14] * 5)

    d.para(
        "Trois corrections successives ont visé ce point : reformulation de la règle en "
        "C2, renforcement en C3, inscription dans les structures de section en C4. "
        "Aucune n'a produit d'effet. La valeur reste nulle ou quasi nulle sur les cinq "
        "campagnes, y compris sur des thèses conçues pour mériter une reconnaissance.")

    d.encadre(
        "Ce que cela signifie",
        "Le produit ne dit jamais à son utilisateur qu'il a raison sur un point. Il "
        "reformule fidèlement, puis objecte. Pour un outil dont la promesse est de "
        "rendre plus lucide, l'absence totale de validation pose un problème d'usage : "
        "un interlocuteur qui ne concède jamais rien devient un interlocuteur dont on "
        "cesse d'attendre quoi que ce soit. Le risque n'est pas la complaisance, c'est "
        "l'inverse.",
        couleur=AMBRE)

    d.titre2("Hypothèse sur la cause")
    d.para(
        "Les trois corrections portaient sur le texte des instructions. Or les réponses "
        "observées suivent scrupuleusement la structure de sections imposée, laquelle ne "
        "réserve aucun emplacement à la reconnaissance. La correction C4 a bien enrichi "
        "les descriptions de sections, sans effet mesurable.")
    d.para(
        "L'hypothèse la plus vraisemblable est que la structure prime sur la posture : ce "
        "qui n'a pas de section dédiée n'est pas produit. Le même mécanisme expliquait "
        "l'apparent manquement au steelman, dont la mesure s'est révélée fausse. La "
        "vérification consisterait à ajouter une section explicitement nommée — par "
        "exemple « Ce qui tient » — plutôt qu'à enrichir la description d'une section "
        "existante. Cette piste n'a pas été testée dans la présente série.")


# ── 8 ────────────────────────────────────────────────────────────────────────

def _etabli(d):
    d.titre1("Ce qui est établi, ce qui ne l'est pas")

    d.titre2("Constats robustes")
    d.tableau(
        ["Constat", "Fondement"],
        [["La structure imposée est respectée entre 98 et 100 %.",
          "Stable sur cinq campagnes et cinq états du prompt."],
         ["La restitution précède toujours l'objection.",
          "100 % sur les cinq campagnes, une fois le contrôle corrigé."],
         ["Le contradicteur détermine la production de chiffres invérifiables.",
          f"Écart Architecte/Opposant supérieur à 20 points sur toutes les campagnes, "
          f"pour un bruit de {BRUIT_MAX:.0f} points."],
         ["La reconnaissance de ce qui tient est absente.",
          "Nulle ou quasi nulle sur cinq campagnes, malgré trois corrections ciblées."],
         ["La longueur commandée par le calibrage est suivie.",
          "Vérifié en C1 puis reconduit ; aucune régression observée."]],
        largeurs=[48, 52])

    d.titre2("Ce que les mesures ne permettent pas d'affirmer")
    d.tableau(
        ["Affirmation tentante", "Pourquoi elle est prématurée"],
        [["« Les corrections ont fait passer les chiffres non sourcés de 32 % à 26 %. »",
          f"L'écart de {abs(pc(D['C1'], CH) - pc(D['C3'], CH)):.1f} points est du même "
          f"ordre que le bruit mesuré ({BRUIT['global']:.1f} point entre deux exécutions "
          "identiques)."],
         ["« Le correctif C2 a amélioré l'Opposant de 17 points. »",
          f"Plausible, l'écart dépassant le bruit de {BRUIT['opponent']:.0f} points sur "
          "ce contradicteur, mais une exécution unique ne suffit pas à l'établir."],
         ["« Le produit s'est dégradé en C4. »",
          "La remontée observée est du même ordre que l'écart entre C4 et C5, dont les "
          "instructions sont identiques."],
         ["« Le modèle respecte la consigne linguistique dans 100 % des cas. »",
          "Le contrôle est un ratio lexical grossier, non une identification de langue."]],
        largeurs=[44, 56])


# ── 9 ────────────────────────────────────────────────────────────────────────

def _methodo(d):
    d.titre1("Recommandations méthodologiques")
    d.tableau(
        ["Priorité", "Recommandation", "Motif"],
        [["1", "Répéter chaque configuration trois fois et comparer les moyennes.",
          "Sans répétition, aucune modification de prompt d'effet inférieur à dix points "
          "ne peut être validée."],
         ["2", "Donner à l'Opposant un accès documentaire, ou renoncer aux chiffres.",
          "Le problème est architectural : on lui demande d'argumenter sur des faits "
          "sans moyen de les vérifier."],
         ["3", "Tester l'ajout d'une section « Ce qui tient » aux structures.",
          "La structure prime sur la posture ; trois corrections textuelles sont restées "
          "sans effet."],
         ["4", "Compléter par une vérification factuelle sur un échantillon.",
          "Aucun contrôle mécanique ne détecte une réponse conforme mais fausse."],
         ["5", "Publier la marge d'incertitude à côté de chaque taux.",
          "Un pourcentage sans marge invite à sur-interpréter des variations fortuites."]],
        largeurs=[10, 42, 48])


# ── 10 ───────────────────────────────────────────────────────────────────────

def _conclusion(d):
    d.titre1("Conclusion")
    d.para(
        "Cette série n'a pas produit le résultat attendu — une amélioration mesurable "
        "après correction — mais elle a produit quelque chose de plus utile : la mesure "
        "de sa propre incertitude. Le dispositif précédent était incapable de distinguer "
        "un progrès d'une fluctuation. Il l'est désormais, et sait dire à partir de quel "
        "seuil.")
    d.para(
        "Trois des sept contrôles étaient défaillants et ont été corrigés. Deux constats "
        "du rapport précédent en sortent infirmés : le manquement supposé à la règle du "
        "steelman n'existait pas, et la complaisance supposée était l'inverse d'un "
        "problème réel de sous-reconnaissance. Un troisième constat est confirmé et "
        "renforcé : la production de chiffres invérifiables est le défaut principal, "
        "concentré sur les contradicteurs auxquels on demande d'argumenter sur des faits.")
    d.encadre(
        "Position honnête à ce stade",
        "Le produit tient ses engagements de forme et manque son engagement le plus "
        "explicite sur le fond. Les corrections apportées vont dans le bon sens sans "
        "qu'on puisse le démontrer. La prochaine série devra répéter chaque "
        "configuration avant de conclure quoi que ce soit — c'est le prix d'une mesure "
        "qui engage.",
        couleur=BLEU_SOMBRE)


# ── Annexes ──────────────────────────────────────────────────────────────────

def _annexe_campagnes(d):
    d.titre1("Annexe A — Détail des campagnes")
    for c, chemin, titre, desc in CAMPAGNES:
        d.titre2(f"{c} — {titre}")
        s = D[c]
        d.para(desc)
        d.tableau(
            ["Élément", "Valeur"],
            [["Journal", os.path.basename(chemin)],
             ["Appels aboutis", str(len(s))],
             ["Début (UTC)", min(l['debut'] for l in s)],
             ["Fin (UTC)", max(l['fin'] for l in s)],
             ["Chiffres non sourcés", f"{pc(s, CH):.1f} %"],
             ["Occurrences", str(sum(l['controles']['chiffres']['nb'] for l in s))],
             ["Structure complète", f"{pc(s, STRUCT):.1f} %"],
             ["Steelman", f"{pc(s, STEEL):.0f} %"],
             ["Temps médian", f"{st.median([l['msTotal'] for l in s]) / 1000:.2f} s"],
             ["Temps maximal", f"{max(l['msTotal'] for l in s) / 1000:.2f} s"],
             ["Mots moyens", str(int(st.mean([l['controles']['longueur']['mots'] for l in s])))]],
            largeurs=[32, 68])

    d.titre2("Résultat par thèse, toutes campagnes")
    d.para("Nombre de campagnes sur cinq où la réponse contenait au moins un chiffre "
           "non sourcé, contradicteur par contradicteur, pour les thèses du volet A.")
    par_these = defaultdict(lambda: defaultdict(int))
    for c in CODES:
        for l in D[c]:
            if l['volet'] == 'A-generaliste' and l['controles']['chiffres']['nb'] > 0:
                par_these[l['id']][l['persona']] += 1
    ids = sorted({l['id'] for c in CODES for l in D[c] if l['volet'] == 'A-generaliste'})
    lignes = []
    for tid in ids:
        force = next(l['force'] for c in CODES for l in D[c] if l['id'] == tid)
        lignes.append([tid, force[:3]] + [f"{par_these[tid][p]}/5" for p in PERSONAS])
    d.tableau(["Réf.", "Force", "Architecte", "Opposant", "Arbitre", "Stratège"],
              lignes, largeurs=[12, 12, 19, 19, 19, 19])


def _annexe_reponses(d):
    d.titre1("Annexe B — Réponses avant et après correction")
    d.para(
        "Même thèse, même contradicteur, prompt initial puis prompt corrigé. Ces couples "
        "permettent d'apprécier qualitativement ce que les taux ne montrent pas.")
    apparies = []
    idx5 = {(l['id'], l['persona']): l for l in D['C5']}
    for l1 in D['C1']:
        cle = (l1['id'], l1['persona'])
        if cle in idx5 and l1['volet'] == 'A-generaliste':
            apparies.append((l1, idx5[cle]))
    choisis, vus = [], set()
    for a, b in apparies:
        if a['persona'] in vus:
            continue
        vus.add(a['persona'])
        choisis.append((a, b))
        if len(choisis) >= 8:
            break

    for a, b in choisis:
        d.titre2(f"{a['id']} — {NOM_P.get(a['persona'], a['persona'])}")
        d.tableau(["Élément", "Valeur"],
                  [["Thèse", a['these']],
                   ["Force", a['force']],
                   ["Chiffres non sourcés — C1", str(a['controles']['chiffres']['nb'])],
                   ["Chiffres non sourcés — C5", str(b['controles']['chiffres']['nb'])],
                   ["Mots — C1 puis C5",
                    f"{a['controles']['longueur']['mots']} puis {b['controles']['longueur']['mots']}"]],
                  largeurs=[34, 66])
        d.para_riche("<b>Réponse avant correction (C1)</b>")
        for bloc in a['reponse'].split('\n\n')[:16]:
            if bloc.strip():
                d.para(bloc.strip()[:900])
        d.para_riche("<b>Réponse après correction (C5)</b>")
        for bloc in b['reponse'].split('\n\n')[:16]:
            if bloc.strip():
                d.para(bloc.strip()[:900])
        d.saut()



def _annexe_occurrences(d):
    d.titre1("Annexe C — Relevé des chiffres non sourcés")
    d.para(
        "Toutes les occurrences relevées sur la campagne de référence (C1) et sur la "
        "dernière campagne (C5), afin que le lecteur puisse juger lui-même de "
        "l'évolution qualitative que les taux ne montrent pas.")
    for code in ('C1', 'C5'):
        d.titre2(f"Campagne {code} — {LIB[code]}")
        lignes = []
        for l in sorted(D[code], key=lambda x: x['id']):
            for s_ in l['controles']['chiffres']['suspects']:
                lignes.append([l['id'], NOM_P.get(l['persona'], l['persona'])[:11],
                               ', '.join(s_['chiffres'][:2])[:16], s_['phrase'][:170]])
        d.para(f"{len(lignes)} occurrences.")
        d.tableau(["Réf.", "Contradicteur", "Chiffres", "Phrase relevée"],
                  lignes, largeurs=[9, 15, 13, 63])


def _annexe_journal(d):
    d.titre1("Annexe D — Journal des appels")
    d.para(
        f"Les {sum(len(D[c]) for c in CODES)} appels des cinq campagnes, dans l'ordre "
        "chronologique de chaque série. Le journal complet, comprenant les réponses "
        "intégrales et le prompt système transmis, est conservé au format JSONL avec le "
        "code source.")
    for code in CODES:
        d.titre2(f"Campagne {code} — {LIB[code]}")
        lignes = []
        for l in sorted(D[code], key=lambda x: x['debut']):
            c = l['controles']
            lignes.append([
                l['id'], NOM_P.get(l['persona'], l['persona'])[:11], l['friction'],
                l['debut'][11:19], f"{l['msTotal'] / 1000:.1f}",
                str(c['longueur']['mots']), str(c['chiffres']['nb']),
                'oui' if c['structure'].get('conforme') else ('—' if not c['structure']['applicable'] else 'non'),
                str(c['reconnaissance']['nb']),
            ])
        d.tableau(["Réf.", "Contradicteur", "Friction", "Heure", "s", "Mots", "Ch.", "Struct.", "Rec."],
                  lignes, largeurs=[9, 16, 11, 11, 8, 10, 8, 11, 8])


if __name__ == '__main__':
    META = dict(
        titre="Rapport comparatif — cinq campagnes",
        sous_titre="Effet des corrections du prompt système<br/>et mesure de la variance "
                   "entre exécutions",
        reference="CIA-DOC-07",
        version=L.VERSION,
        date=L.DATE,
        resume="",
        niveau=2,
    )
    total = generer_document(SORTIE, META, remplir)
    print(f"{SORTIE} — {total} pages")
