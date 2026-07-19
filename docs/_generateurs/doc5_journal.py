# -*- coding: utf-8 -*-
"""Document 5 — Journal de développement (historique intégral des commits)."""
import os
import subprocess
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdfkit_cia import generer_document, AMBRE, BLEU_SOMBRE, GRIS, ENCRE, nettoyer
import legal_cia as L

DEPOT = '/Users/morganreichert/Desktop/challenger-ia-chatbot'
SORTIE = f'{DEPOT}/docs/CIA-DOC-05_Journal-de-developpement.pdf'

META = dict(
    titre="Journal de développement",
    sous_titre="Historique intégral des modifications du code source<br/>Traçabilité horodatée, commit par commit",
    reference="CIA-DOC-05",
    version=L.VERSION,
    date=L.DATE,
    resume="",
    niveau=2,
)

MOIS_FR = {
    '01': 'janvier', '02': 'février', '03': 'mars', '04': 'avril',
    '05': 'mai', '06': 'juin', '07': 'juillet', '08': 'août',
    '09': 'septembre', '10': 'octobre', '11': 'novembre', '12': 'décembre',
}
LIBELLE_STATUT = {
    'A': 'Ajout', 'M': 'Modification', 'D': 'Suppression',
    'R': 'Renommage', 'C': 'Copie', 'T': 'Changement de type',
}


def git(*args):
    return subprocess.run(['git', *args], cwd=DEPOT, capture_output=True,
                          text=True, check=True).stdout


def collecter():
    """Fusionne --numstat (volumes) et --name-status (nature) par commit."""
    SEP = '\x1e'
    volumes = defaultdict(dict)
    brut = git('log', '--reverse', '--numstat',
               f'--format={SEP}%H|%h|%an|%aI|%s')
    courant = None
    for ligne in brut.split('\n'):
        if ligne.startswith(SEP):
            courant = ligne[1:].split('|', 4)[0]
        elif ligne.strip() and courant:
            p = ligne.split('\t')
            if len(p) == 3:
                add = 0 if p[0] == '-' else int(p[0])
                sup = 0 if p[1] == '-' else int(p[1])
                volumes[courant][p[2]] = (add, sup)

    commits = []
    brut = git('log', '--reverse', '--name-status',
               f'--format={SEP}%H|%h|%an|%aI|%s')
    c = None
    for ligne in brut.split('\n'):
        if ligne.startswith(SEP):
            h, court, auteur, iso, sujet = ligne[1:].split('|', 4)
            c = {'hash': h, 'court': court, 'auteur': auteur, 'iso': iso,
                 'sujet': sujet, 'fichiers': []}
            commits.append(c)
        elif ligne.strip() and c:
            p = ligne.split('\t')
            statut = p[0][0]
            chemin = p[-1]
            add, sup = volumes[c['hash']].get(chemin, (0, 0))
            c['fichiers'].append({'statut': statut, 'chemin': chemin,
                                  'add': add, 'sup': sup})
    return commits


def remplir(d):
    commits = collecter()
    total_add = sum(f['add'] for c in commits for f in c['fichiers'])
    total_sup = sum(f['sup'] for c in commits for f in c['fichiers'])
    premier, dernier = commits[0], commits[-1]

    d.couverture()
    d.mentions_legales(L.blocs(
        "Le présent document constitue le journal de développement du logiciel "
        "Challenger IA. Il retrace, de manière horodatée et exhaustive, "
        f"l'intégralité des {len(commits)} modifications apportées au code source "
        "depuis la création du dépôt : ajouts, modifications et suppressions de "
        "fichiers, avec leur volume de lignes.", niveau=2))

    # ─── Classification ──────────────────────────────────────────────────────
    d.titre1("Classification du document")
    d.para("La documentation Challenger IA suit une échelle de classification à "
           "quatre niveaux. Le présent document est classé <b>niveau 2 — INTERNE</b>.")
    d.tableau(["Niveau", "Libellé", "Portée", "Documents concernés"], [
        ["1", "Public", "Diffusion libre", "Politique de confidentialité, conditions générales"],
        ["2", "Interne", "Collaborateurs et partenaires ayant à en connaître", "CIA-DOC-05 (le présent document)"],
        ["3", "Confidentiel", "Diffusion restreinte, autorisation écrite requise", "CIA-DOC-01, CIA-DOC-02, CIA-DOC-04"],
        ["4", "Secret", "Cercle strictement limité, secret des affaires", "CIA-DOC-03 (jeux d'instructions système)"],
    ], largeurs=[8, 14, 38, 40])
    d.para("Ce document ne contient ni jeu d'instructions système, ni algorithme "
           "propriétaire, ni secret technique : il ne rapporte que des métadonnées "
           "de versionnement (dates, auteurs, chemins de fichiers, volumes). Sa "
           "divulgation ne compromettrait pas le savoir-faire de l'éditeur, mais "
           "renseignerait sur le rythme et l'organisation du développement, ce qui "
           "justifie une diffusion interne.")

    # ─── Synthèse ────────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Synthèse")
    d.tableau(["Indicateur", "Valeur"], [
        ["Nombre total de commits", str(len(commits))],
        ["Première modification", premier['iso'][:10].replace('-', '/') + ' à ' + premier['iso'][11:16]],
        ["Dernière modification", dernier['iso'][:10].replace('-', '/') + ' à ' + dernier['iso'][11:16]],
        ["Lignes ajoutées (cumul)", f"{total_add:,}".replace(',', ' ')],
        ["Lignes supprimées (cumul)", f"{total_sup:,}".replace(',', ' ')],
        ["Solde net", f"{total_add - total_sup:,}".replace(',', ' ')],
        ["Fichiers distincts touchés", str(len({f['chemin'] for c in commits for f in c['fichiers']}))],
    ], largeurs=[42, 58])

    d.titre2("Contributeurs")
    auteurs = Counter(c['auteur'] for c in commits)
    d.tableau(["Auteur", "Commits", "Part"],
              [[a, str(n), f"{n * 100 // len(commits)} %"] for a, n in auteurs.most_common()],
              largeurs=[60, 20, 20])

    d.titre2("Répartition mensuelle")
    par_mois = Counter(c['iso'][:7] for c in commits)
    lignes = []
    for mois in sorted(par_mois):
        an, m = mois.split('-')
        cs = [c for c in commits if c['iso'][:7] == mois]
        a = sum(f['add'] for c in cs for f in c['fichiers'])
        s = sum(f['sup'] for c in cs for f in c['fichiers'])
        lignes.append([f"{MOIS_FR[m].capitalize()} {an}", str(par_mois[mois]),
                       f"+{a:,}".replace(',', ' '), f"-{s:,}".replace(',', ' ')])
    d.tableau(["Période", "Commits", "Lignes ajoutées", "Lignes supprimées"],
              lignes, largeurs=[40, 18, 21, 21])

    d.titre2("Fichiers les plus modifiés")
    touche = Counter(f['chemin'] for c in commits for f in c['fichiers'])
    d.tableau(["Fichier", "Révisions"],
              [[p, str(n)] for p, n in touche.most_common(15)],
              largeurs=[80, 20])

    d.titre2("Nature des opérations")
    natures = Counter(f['statut'] for c in commits for f in c['fichiers'])
    d.tableau(["Opération", "Occurrences"],
              [[LIBELLE_STATUT.get(k, k), str(v)] for k, v in natures.most_common()],
              largeurs=[70, 30])

    # ─── Chronologie ─────────────────────────────────────────────────────────
    d.saut()
    d.titre1("Chronologie détaillée")
    d.para("Les modifications sont présentées dans l'ordre chronologique croissant, "
           "regroupées par mois. Chaque entrée indique la date et l'heure locales, "
           "l'empreinte du commit, son auteur, son objet, puis le détail des "
           "fichiers concernés avec la nature de l'opération et le volume de lignes "
           "ajoutées ou supprimées.")

    mois_courant = None
    for c in commits:
        mois = c['iso'][:7]
        if mois != mois_courant:
            mois_courant = mois
            an, m = mois.split('-')
            d.titre2(f"{MOIS_FR[m].capitalize()} {an}")

        horodatage = f"{c['iso'][8:10]}/{c['iso'][5:7]}/{c['iso'][:4]} à {c['iso'][11:16]}"
        d.para_riche(
            f"<b>{horodatage}</b> &nbsp;·&nbsp; "
            f"<font face='Courier' size='8'>{c['court']}</font> &nbsp;·&nbsp; "
            f"<font color='#6B7280'>{nettoyer(c['auteur'])}</font><br/>"
            f"<b>{nettoyer(c['sujet'])}</b>"
        )
        if c['fichiers']:
            lignes = [[LIBELLE_STATUT.get(f['statut'], f['statut']), f['chemin'],
                       f"+{f['add']}" if f['add'] else '—',
                       f"-{f['sup']}" if f['sup'] else '—']
                      for f in c['fichiers']]
            d.tableau(["Opération", "Fichier", "Ajoutées", "Supprimées"],
                      lignes, largeurs=[14, 62, 12, 12])
        else:
            d.para("Aucun fichier modifié (commit de fusion ou vide).")

    d.titre1("Historique du document")
    d.tableau(["Version", "Date", "Objet"], [
        ["1.0", L.DATE, f"Émission initiale — {len(commits)} commits couverts, "
                        f"du {premier['iso'][:10]} au {dernier['iso'][:10]}"],
    ], largeurs=[12, 22, 66])


if __name__ == '__main__':
    n = generer_document(SORTIE, META, remplir)
    print(f"OK — {SORTIE} ({n} pages)")
