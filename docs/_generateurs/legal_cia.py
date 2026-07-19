"""Mentions légales et clauses de confidentialité communes aux 4 documents."""

DATE = "19 juillet 2026"
VERSION = "1.0"


def _clause_confidentialite(niveau: int):
    """La clause s'ajuste au niveau : un document interne n'emporte pas les mêmes
    obligations qu'un document couvert par le secret des affaires."""
    if niveau <= 1:
        return [
            "Ce document est classé PUBLIC. Sa diffusion est libre.",
        ]
    if niveau == 2:
        return [
            "Ce document est classé INTERNE. Il ne contient ni secret technique, ni "
            "jeu d'instructions système, ni algorithme propriétaire : il ne rapporte "
            "que des métadonnées de développement.",
            "Sa diffusion est néanmoins réservée aux collaborateurs et partenaires de "
            "STARIAX GROUP ayant à en connaître. Sa communication publique n'est pas "
            "souhaitée, dans la mesure où il renseigne sur le rythme, l'organisation "
            "et les priorités de développement de l'éditeur.",
            "Le destinataire s'abstient de le publier ou de le communiquer à un "
            "concurrent de l'éditeur.",
        ]
    return [
        "Ce document est classé CONFIDENTIEL. Il contient des informations techniques "
        "non publiques, des secrets d'affaires et des éléments constitutifs du "
        "savoir-faire de STARIAX GROUP, notamment les jeux d'instructions système, "
        "les algorithmes d'analyse cognitive et les mécanismes de notation des sources.",
        "Sa communication est strictement réservée aux personnes ayant besoin d'en "
        "connaître dans le cadre de leurs fonctions ou d'une relation contractuelle "
        "avec STARIAX GROUP. Toute reproduction, représentation, diffusion, "
        "transmission ou mise à disposition d'un tiers, en tout ou partie et par "
        "quelque procédé que ce soit, est interdite sans autorisation écrite "
        "préalable de l'éditeur.",
        "Le destinataire s'engage à prendre toutes mesures raisonnables pour "
        "préserver la confidentialité de ce document, à en restreindre l'accès et à "
        "le détruire ou le restituer sur simple demande de l'éditeur.",
    ]


def blocs(portee: str, niveau: int = 3):
    return [
        ("Éditeur et titulaire des droits", [
            "STARIAX GROUP (European Tech Group), société éditrice, est titulaire de "
            "l'ensemble des droits de propriété intellectuelle portant sur le logiciel "
            "Challenger IA, sur sa documentation, sur son architecture, sur ses jeux "
            "d'instructions système et sur les marques et logos associés.",
            "Challenger IA est un produit de STARIAX GROUP, exploité sous le nom de "
            "domaine challengeria.fr et distribué sous forme d'application web et "
            "d'applications mobiles natives iOS et Android (identifiant applicatif "
            "tech.stariax.challengeria).",
        ]),
        ("Objet du document", [
            portee,
            "Le présent document décrit un état du système à la date d'émission indiquée "
            "en couverture. Le logiciel étant en développement actif, certaines "
            "caractéristiques sont susceptibles d'évoluer. Toute divergence constatée "
            "entre ce document et le code source doit être résolue en faveur du code "
            "source, qui fait foi.",
        ]),
        ("Clause de confidentialité", _clause_confidentialite(niveau)),
        *([] if niveau <= 2 else [("Protection au titre du secret des affaires", [
            "Les informations contenues dans ce document constituent des secrets "
            "d'affaires au sens de l'article L. 151-1 du Code de commerce et de la "
            "directive (UE) 2016/943 : elles ne sont pas généralement connues, elles "
            "revêtent une valeur commerciale du fait de leur caractère secret, et elles "
            "font l'objet de mesures de protection raisonnables de la part de leur "
            "détenteur légitime.",
            "Leur obtention, utilisation ou divulgation illicite engage la responsabilité "
            "civile de son auteur et peut donner lieu à des mesures provisoires et "
            "conservatoires ainsi qu'à des dommages et intérêts.",
        ])]),
        ("Droit applicable et juridiction", [
            "Le présent document et les obligations de confidentialité qu'il emporte sont "
            "régis par le droit français. Tout litige relatif à son interprétation ou à "
            "son exécution relève de la compétence exclusive des tribunaux français "
            "compétents, nonobstant pluralité de défendeurs ou appel en garantie.",
        ]),
        ("Limitation de responsabilité", [
            "Ce document est fourni à titre informatif. STARIAX GROUP ne garantit ni "
            "l'exhaustivité ni l'absence d'erreur de son contenu et ne saurait être tenu "
            "responsable des conséquences d'une utilisation qui en serait faite au-delà "
            "de sa finalité documentaire.",
        ]),
    ]
