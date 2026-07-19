# -*- coding: utf-8 -*-
"""Document 2 — Propriété intellectuelle et éléments brevetables."""
import sys
sys.path.insert(0, '/private/tmp/claude-501/-Users-morganreichert-Desktop/fac985ec-9a3a-45eb-aaad-b8999a34be87/scratchpad')
from pdfkit_cia import generer_document, AMBRE, ROUGE
import legal_cia as L

SORTIE = '/Users/morganreichert/Desktop/challenger-ia-chatbot/docs/CIA-DOC-02_Propriete-intellectuelle-et-brevetabilite.pdf'

META = dict(
    titre="Propriété intellectuelle",
    sous_titre="Cartographie des actifs, analyse de brevetabilité<br/>et stratégie de protection",
    reference="CIA-DOC-02",
    version=L.VERSION,
    date=L.DATE,
    resume="",
)


def remplir(d):
    d.couverture()
    d.mentions_legales(L.blocs(
        "Le présent document recense les actifs de propriété intellectuelle attachés à "
        "Challenger IA, analyse les éléments susceptibles de protection par brevet au "
        "regard du droit européen, et propose une stratégie de protection combinant "
        "droit d'auteur, secret des affaires et droit des marques."))

    d.encadre(
        "Avertissement — portée de cette analyse",
        "Ce document est une analyse technique préparatoire, rédigée par examen du code "
        "source. Il ne constitue ni une consultation juridique, ni une recherche "
        "d'antériorité, ni un avis de brevetabilité. Seul un conseil en propriété "
        "industrielle est habilité à se prononcer sur la brevetabilité effective d'une "
        "invention et à conduire les recherches d'antériorité indispensables. Les "
        "appréciations portées ici doivent être regardées comme des hypothèses de "
        "travail à soumettre à un professionnel.", ROUGE)
    d.saut()
    d.sommaire()

    # ─── 1 ───────────────────────────────────────────────────────────────────
    d.titre1("Cadre juridique applicable")

    d.titre2("Le principe : le logiciel n'est pas brevetable en tant que tel")
    d.para("L'article 52(2)(c) de la Convention sur le brevet européen exclut de la "
           "brevetabilité les programmes d'ordinateur, ainsi que les méthodes dans "
           "l'exercice d'activités intellectuelles et les présentations d'informations. "
           "L'article 52(3) précise toutefois que cette exclusion ne vaut que pour ces "
           "éléments considérés « en tant que tels ».")
    d.para("La jurisprudence des chambres de recours de l'Office européen des brevets a "
           "dégagé de cette réserve le critère déterminant : une invention mise en œuvre "
           "par ordinateur n'est brevetable que si elle produit un <b>effet technique "
           "supplémentaire</b>, c'est-à-dire un effet dépassant les interactions "
           "physiques normales entre le programme et la machine.")

    d.titre2("Ce qui ne produit pas d'effet technique")
    d.puces([
        "Une méthode d'organisation de la pensée ou de pédagogie, quelle que soit son "
        "originalité.",
        "Un modèle économique, un système de crédits, une mécanique d'engagement.",
        "Le contenu d'un jeu d'instructions adressé à un modèle de langage : il relève "
        "de la présentation d'informations et de la méthode intellectuelle.",
        "Un choix d'ergonomie ou de mise en forme, sauf s'il résout un problème technique "
        "objectif.",
    ])

    d.titre2("Ce qui peut produire un effet technique")
    d.puces([
        "Une amélioration de la robustesse d'un traitement face à des données "
        "incomplètes ou malformées.",
        "Une réduction mesurable des ressources consommées : appels réseau, mémoire, "
        "temps de calcul.",
        "Un mécanisme de sécurité empêchant une divulgation ou une élévation de "
        "privilège.",
        "Une architecture assurant la disponibilité ou la dégradation contrôlée d'un "
        "système distribué.",
    ])

    d.encadre(
        "Conséquence pour Challenger IA",
        "L'actif le plus différenciant du produit — les jeux d'instructions système — "
        "est aussi celui qui se prête le moins au brevet : il relève de la méthode "
        "intellectuelle. Sa protection passe par le secret des affaires et le droit "
        "d'auteur, non par le dépôt. À l'inverse, plusieurs mécanismes techniques "
        "périphériques, moins visibles commercialement, présentent un effet technique "
        "argumentable. La stratégie doit donc être différenciée par actif.", AMBRE)

    # ─── 2 ───────────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Cartographie des actifs")
    d.tableau(["Actif", "Nature", "Régime de protection principal"], [
        ["Code source (16 581 + 1 372 lignes)", "Œuvre de l'esprit", "Droit d'auteur, protection automatique"],
        ["Jeux d'instructions système", "Savoir-faire, rédaction originale", "Secret des affaires, droit d'auteur sur la forme"],
        ["Architecture de composition du prompt", "Méthode", "Secret des affaires"],
        ["Protocole de marqueurs embarqués", "Mécanisme technique", "Brevet envisageable, secret"],
        ["Analyseur tolérant de flux partiel", "Mécanisme technique", "Brevet envisageable"],
        ["Taxonomies de biais et de réflexes", "Compilation", "Droit d'auteur sur la compilation"],
        ["Boucle de rétroaction cognitive", "Mécanisme technique et méthode", "Brevet à examiner, secret"],
        ["Moteur de vérification multidimensionnel", "Méthode d'évaluation", "Secret des affaires"],
        ["Notation de fiabilité des sources", "Mécanisme technique et compilation", "Brevet à examiner, droit d'auteur sur la liste"],
        ["Coupure de service à double couche", "Architecture technique", "Brevet envisageable"],
        ["Marque « Challenger IA »", "Signe distinctif", "Dépôt de marque"],
        ["Logotype", "Œuvre graphique", "Droit d'auteur, dépôt figuratif"],
        ["Nom de domaine challengeria.fr", "Signe", "Réservation"],
        ["Corpus d'usage agrégé", "Base de données", "Droit sui generis du producteur"],
    ], largeurs=[30, 24, 46])

    # ─── 3 ───────────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Éléments candidats à la brevetabilité")
    d.para("Cinq mécanismes sont examinés ci-après. Pour chacun sont indiqués le "
           "problème technique résolu, l'effet technique invocable et une appréciation "
           "de la solidité du dossier. Cette appréciation est indicative et ne préjuge "
           "pas de l'antériorité, qui n'a pas été recherchée.")

    d.titre2("Candidat 1 — Extraction structurée par marqueurs dans un flux partiel")
    d.tableau(["Aspect", "Analyse"], [
        ["Problème technique", "Extraire des données structurées d'un flux textuel diffusé progressivement, alors que le fragment reçu peut être incomplet ou malformé, sans requête supplémentaire ni interruption de l'affichage"],
        ["Solution", "Automate à comptage de délimiteurs tenant compte des chaînes échappées, assorti d'une chaîne de trois tentatives d'analyse à tolérance croissante et d'une extraction de dernier recours par champs à valeurs énumérées"],
        ["Effet technique", "Robustesse accrue du traitement face à des données malformées ; suppression d'un aller-retour réseau ; distinction entre fragment attendu et donnée corrompue, évitant l'affichage d'une erreur pendant la diffusion"],
        ["Solidité", "Bonne — l'effet porte sur le fonctionnement interne du traitement, non sur le contenu"],
        ["Réserve", "L'analyse tolérante de données malformées est un domaine ancien et densément couvert. L'inventivité résiderait dans la combinaison avec la diffusion en flux et le repli sur des champs énumérés"],
    ], largeurs=[22, 78])

    d.titre2("Candidat 2 — Coupure de service à double couche avec dégradation ouverte")
    d.tableau(["Aspect", "Analyse"], [
        ["Problème technique", "Rendre indisponible à distance une application distribuée simultanément sur le web et dans des conteneurs natifs, ces derniers ne traversant pas l'infrastructure de périphérie, sans que la panne du service de pilotage puisse elle-même provoquer l'indisponibilité"],
        ["Solution", "Double couche complémentaire — contrôle en périphérie pour le web, contrôle applicatif pour le natif — interrogeant une source d'autorité commune, avec cache par instance et politique de défaillance ouverte à chaque étage"],
        ["Effet technique", "Disponibilité maîtrisée d'un système distribué hétérogène ; garantie qu'une défaillance du plan de contrôle ne dégrade pas le plan de service"],
        ["Solidité", "Moyenne à bonne — l'effet est technique et mesurable"],
        ["Réserve", "Les indicateurs de fonctionnalité à distance et les interrupteurs de service sont largement répandus. L'inventivité devrait porter sur la complémentarité des deux couches face à l'hétérogénéité des origines"],
    ], largeurs=[22, 78])

    d.titre2("Candidat 3 — Boucle de rétroaction cognitive")
    d.tableau(["Aspect", "Analyse"], [
        ["Problème technique", "Personnaliser le comportement d'un modèle de langage sans réentraînement ni fenêtre de contexte croissante, à partir d'observations accumulées sur plusieurs sessions"],
        ["Solution", "Le modèle émet, dans sa réponse, un marqueur d'analyse à vocabulaire fermé ; ce marqueur est agrégé dans un profil persistant compact ; le profil est reconverti en fragment d'instructions injecté aux sessions suivantes, avec seuil de déclenchement et vocabulaire contraint"],
        ["Effet technique", "Réduction de la charge de contexte à comportement personnalisé équivalent : un profil compact se substitue à l'historique complet des sessions antérieures. Économie mesurable de jetons et de mémoire"],
        ["Solidité", "Incertaine — c'est le candidat le plus exposé à une objection au titre de la méthode intellectuelle"],
        ["Réserve", "L'examinateur pourrait considérer que la finalité — analyser le raisonnement d'une personne — relève de l'activité intellectuelle exclue. La revendication devrait être formulée autour de l'économie de ressources, non de la finalité pédagogique"],
    ], largeurs=[22, 78])

    d.titre2("Candidat 4 — Notation de fiabilité intégrée à la génération")
    d.tableau(["Aspect", "Analyse"], [
        ["Problème technique", "Assurer la traçabilité des sources d'une réponse générée, en garantissant la cohérence entre le classement affiché à l'utilisateur et la numérotation citée par le modèle"],
        ["Solution", "Classement des résultats en niveaux de fiabilité, exclusion des niveaux inférieurs dès la requête, tri par niveau puis <b>numérotation attribuée après le tri</b>, injection du corpus numéroté dans les instructions, et transmission des métadonnées de sources en tête du flux de réponse"],
        ["Effet technique", "Cohérence garantie entre la citation produite par le modèle et l'affichage ; transmission des sources avant le contenu, permettant leur rendu sans attendre la fin de la génération"],
        ["Solidité", "Moyenne — l'effet est réel mais proche de la présentation d'informations"],
        ["Réserve", "Le classement de sources par fiabilité est un procédé connu. L'élément le plus défendable est l'ordonnancement de la numérotation après tri et l'émission anticipée des métadonnées"],
    ], largeurs=[22, 78])

    d.titre2("Candidat 5 — Résolution d'habilitation par relais anti-énumération")
    d.tableau(["Aspect", "Analyse"], [
        ["Problème technique", "Permettre à une application cliente de connaître les fonctionnalités auxquelles son utilisateur a droit, sans qu'un tiers puisse interroger le statut d'un autre utilisateur par énumération d'identifiants"],
        ["Solution", "L'identifiant n'est jamais accepté du client : il est dérivé du jeton d'authentification vérifié côté serveur, lequel interroge le service d'habilitation au moyen d'un secret qui ne quitte jamais le serveur, avec cache à durée de vie contrainte pour propager les révocations"],
        ["Effet technique", "Suppression d'une surface d'énumération ; propagation bornée dans le temps d'une révocation de droits"],
        ["Solidité", "Faible à moyenne — il s'agit de l'application rigoureuse de principes de sécurité connus"],
        ["Réserve", "Le principe de ne jamais faire confiance à l'identité déclarée par le client est un fondamental. Une revendication serait probablement rejetée pour défaut d'activité inventive"],
    ], largeurs=[22, 78])

    d.titre2("Synthèse comparative")
    d.tableau(["Candidat", "Effet technique", "Solidité", "Recommandation"], [
        ["1. Extraction en flux partiel", "Élevé", "Bonne", "Soumettre à un conseil pour recherche d'antériorité"],
        ["2. Coupure à double couche", "Élevé", "Moyenne à bonne", "Soumettre à un conseil"],
        ["3. Boucle cognitive", "Moyen", "Incertaine", "Étudier une revendication axée ressources"],
        ["4. Notation de fiabilité", "Moyen", "Moyenne", "Envisager en revendication dépendante"],
        ["5. Relais anti-énumération", "Faible", "Faible à moyenne", "Ne pas déposer — conserver en secret"],
    ], largeurs=[28, 18, 18, 36])

    # ─── 4 ───────────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Actifs relevant du secret des affaires")
    d.para("Le secret des affaires, régi par les articles L. 151-1 et suivants du Code "
           "de commerce, protège une information qui n'est pas généralement connue, qui "
           "tire une valeur commerciale de son caractère secret, et qui fait l'objet de "
           "mesures de protection raisonnables. Cette dernière condition est "
           "constitutive : sans mesures, il n'y a pas de secret protégeable.")

    d.titre2("Actifs concernés")
    d.tableau(["Actif", "Valeur du secret"], [
        ["Contenu intégral des jeux d'instructions système", "Reproduire le comportement du produit sans ce contenu suppose plusieurs mois d'itérations"],
        ["Formulation du contrat de posture anti-complaisance", "Résultat d'un travail d'ajustement ; une formulation approximative produit de la flatterie ou de l'hostilité"],
        ["Structures de sortie par persona", "Constituent le mécanisme réel de différenciation, non évident à l'observation"],
        ["Taxonomies de biais et de réflexes", "Choix et granularité des catégories, calibrés pour l'usage"],
        ["Seuils et paramètres", "Seuil de déclenchement du profil, bornes de qualification de tendance, coefficients de coût"],
        ["Listes de classement des sources", "Compilation de domaines par niveau de fiabilité"],
        ["Motifs de détection d'injection", "Leur divulgation faciliterait leur contournement"],
    ], largeurs=[34, 66])

    d.titre2("Mesures de protection requises")
    d.para("Les mesures suivantes conditionnent l'opposabilité du secret. Leur absence "
           "prive l'éditeur du bénéfice du régime.")
    d.puces([
        "<b>Marquage</b> — apposition d'une mention de confidentialité sur tout support. "
        "Les quatre documents de la présente série y satisfont.",
        "<b>Restriction d'accès</b> — limitation aux personnes ayant besoin d'en "
        "connaître, avec traçabilité des communications.",
        "<b>Engagements contractuels</b> — clause de confidentialité dans les contrats "
        "de travail, de prestation et de partenariat ; accord de confidentialité "
        "préalable à toute présentation à un investisseur ou à un client.",
        "<b>Cloisonnement technique</b> — les instructions système sont résolues côté "
        "serveur et ne transitent jamais par le paquet client, ce qui empêche leur "
        "extraction par simple inspection de l'application.",
        "<b>Traçabilité de la création</b> — horodatage des versions successives, "
        "l'historique de gestion de versions y pourvoyant.",
    ])

    d.encadre(
        "Point de vigilance sur l'extraction par conversation",
        "Un jeu d'instructions système reste théoriquement extractible par un "
        "utilisateur habile qui amènerait le modèle à le restituer. Cette exposition est "
        "inhérente à la technologie et ne peut être supprimée. Elle peut être réduite "
        "par des consignes de refus de restitution, mais ne doit pas être surestimée "
        "dans l'appréciation de la valeur du secret : la formulation exacte reste "
        "difficile à obtenir intégralement et à maintenir à jour.", AMBRE)

    # ─── 5 ───────────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Droit d'auteur")
    d.para("Le code source est protégé par le droit d'auteur dès sa création, sans "
           "formalité, en application de l'article L. 112-2 13° du Code de la propriété "
           "intellectuelle. La protection porte sur la forme d'expression, non sur les "
           "fonctionnalités, les algorithmes ni les langages employés.")

    d.titre2("Étendue et limites")
    d.puces([
        "<b>Protégé</b> — la rédaction du code, l'architecture des fichiers, la "
        "structure des données, la rédaction des jeux d'instructions en tant que texte "
        "original, les compilations de taxonomies dans leur choix et leur disposition.",
        "<b>Non protégé</b> — l'idée d'un assistant contradicteur, le principe d'un "
        "profil de biais, la fonctionnalité de vérification factuelle. Un concurrent "
        "peut légitimement développer un produit équivalent par une écriture "
        "indépendante.",
    ])

    d.titre2("Titularité des droits")
    d.encadre(
        "Vérifications indispensables",
        "En application de l'article L. 113-9 du Code de la propriété intellectuelle, "
        "les droits patrimoniaux sur un logiciel créé par un salarié dans l'exercice de "
        "ses fonctions sont dévolus de plein droit à l'employeur. Cette dévolution ne "
        "joue pas pour les prestataires indépendants, les stagiaires ni les "
        "contributeurs occasionnels : une cession écrite est alors nécessaire. Il "
        "convient de vérifier que toute contribution au code est couverte, à défaut de "
        "quoi la titularité serait partagée. Le recours à des outils d'assistance à la "
        "programmation appelle par ailleurs un examen des conditions d'utilisation "
        "applicables.", ROUGE)

    d.titre2("Dépendances tierces")
    d.para("Le produit incorpore des bibliothèques tierces sous licence libre. Un "
           "inventaire des licences doit être établi et maintenu, afin de vérifier "
           "l'absence de licence à réciprocité forte incompatible avec une distribution "
           "propriétaire, et de satisfaire les obligations d'attribution.")

    # ─── 6 ───────────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Marques et signes distinctifs")
    d.tableau(["Signe", "État", "Action recommandée"], [
        ["Challenger IA", "Exploité", "Vérifier la disponibilité puis déposer en classes 9, 41 et 42"],
        ["CHALLENGER (logotype)", "Exploité", "Déposer en marque figurative"],
        ["challengeria.fr", "Réservé", "Sécuriser les extensions défensives"],
        ["STARIAX", "Exploité par la société mère", "Vérifier la couverture du dépôt existant"],
    ], largeurs=[24, 24, 52])

    d.titre2("Classes de la classification de Nice")
    d.puces([
        "<b>Classe 9</b> — logiciels, applications téléchargeables.",
        "<b>Classe 41</b> — formation, éducation, activités de développement des "
        "capacités intellectuelles.",
        "<b>Classe 42</b> — logiciel en tant que service, conception et développement de "
        "logiciels.",
    ])
    d.encadre(
        "Réserve sur le caractère distinctif",
        "Le terme « Challenger » est un mot courant, y compris dans un usage "
        "élogieux, et le sigle « IA » est parfaitement descriptif du produit. Le signe "
        "verbal pris isolément pourrait se heurter à une objection de défaut de "
        "caractère distinctif ou de caractère descriptif. Le dépôt du logotype, dont la "
        "typographie est travaillée, offre une protection plus sûre. Une recherche "
        "d'antériorité préalable est indispensable.", AMBRE)

    # ─── 7 ───────────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Droit des bases de données")
    d.para("L'article L. 341-1 du Code de la propriété intellectuelle institue au profit "
           "du producteur d'une base de données un droit spécifique, indépendant du droit "
           "d'auteur, dès lors que la constitution, la vérification ou la présentation du "
           "contenu atteste d'un investissement substantiel.")
    d.para("Le corpus d'usage accumulé par Challenger IA — observations agrégées des "
           "raisonnements, distribution des biais par thème, efficacité comparée des "
           "objections — constitue un tel actif. Il présente deux caractéristiques "
           "stratégiques : il ne peut être obtenu qu'en exploitant un service comparable "
           "pendant une durée équivalente, et il croît sans effort marginal.")
    d.encadre(
        "Condition préalable à l'exploitation de ce corpus",
        "Toute exploitation dépassant la fourniture du service à l'utilisateur concerné "
        "— notamment l'agrégation à des fins d'amélioration du produit ou de "
        "constitution d'un jeu d'entraînement — suppose une base légale distincte et une "
        "information des personnes. Ce point doit être traité conjointement avec le "
        "document CIA-DOC-04 relatif à la protection des données. Une anonymisation "
        "effective, au sens où la réidentification devient raisonnablement impossible, "
        "fait sortir les données agrégées du champ du règlement.", AMBRE)

    # ─── 8 ───────────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Stratégie de protection recommandée")

    d.titre2("Principe directeur")
    d.para("La question posée n'est pas tant de rendre le produit incopiable — les "
           "fonctionnalités visibles sont toutes reproductibles — que de rendre coûteux "
           "le fait de s'en détourner. La protection juridique ne joue à cet égard qu'un "
           "rôle défensif ; l'avantage durable réside dans les actifs qui s'accumulent : "
           "le corpus d'usage et l'historique cognitif propre à chaque utilisateur.")

    d.titre2("Séquencement")
    d.tableau(["Priorité", "Action", "Horizon"], [
        ["1", "Formaliser les mesures de protection du secret : marquage, restriction d'accès, engagements de confidentialité", "Immédiat"],
        ["2", "Vérifier la titularité complète des droits sur le code et régulariser les contributions non couvertes", "Immédiat"],
        ["3", "Établir l'inventaire des licences des dépendances tierces", "Court terme"],
        ["4", "Conduire une recherche d'antériorité sur les candidats 1 et 2", "Court terme"],
        ["5", "Déposer le logotype et, sous réserve de disponibilité, le signe verbal", "Court terme"],
        ["6", "Décider du dépôt de brevet au vu de la recherche d'antériorité", "Moyen terme"],
        ["7", "Sécuriser la base légale d'exploitation du corpus d'usage", "Moyen terme"],
    ], largeurs=[10, 68, 22])

    d.titre2("Appréciation de l'opportunité d'un dépôt")
    d.para("Un dépôt de brevet européen représente un coût significatif, une publication "
           "au bout de dix-huit mois et une procédure d'examen de plusieurs années. Cette "
           "publication est à double tranchant : elle rend l'invention opposable, mais "
           "la divulgue à la concurrence.")
    d.para("Pour un éditeur au stade de développement de Challenger IA, l'arbitrage "
           "raisonnable consiste à privilégier le secret des affaires et le droit "
           "d'auteur, dont la protection est immédiate et gratuite, et à réserver le "
           "dépôt aux seuls mécanismes présentant à la fois un effet technique solide et "
           "une valeur défensive — au premier rang desquels le candidat 1. Un dépôt "
           "conserve en outre une valeur signalétique lors d'une levée de fonds ou d'une "
           "cession, indépendamment de son exploitation contentieuse.")

    d.titre1("Historique du document")
    d.tableau(["Version", "Date", "Objet"], [
        ["1.0", L.DATE, "Émission initiale"],
    ], largeurs=[15, 25, 60])


if __name__ == '__main__':
    n = generer_document(SORTIE, META, remplir)
    print(f"OK — {SORTIE} ({n} pages)")
