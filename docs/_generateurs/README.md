# Générateurs de la documentation PDF

Régénère les quatre documents de la série `CIA-DOC-*` dans `docs/`.

## Prérequis
```bash
pip install reportlab pypdf pillow
```

## Génération
```bash
cd docs/_generateurs
python3 doc1_technique.py    # Documentation technique
python3 doc2_pi.py           # Propriété intellectuelle et brevetabilité
python3 doc3_prompts.py      # Prompt système et ingénierie de prompt
python3 doc4_rgpd.py         # RGPD, données et usages
```

## Organisation
- `pdfkit_cia.py` — socle de mise en page : couverture double logo, en-têtes,
  pagination « Page X / Y », sommaire automatique, numérotation hiérarchique.
- `legal_cia.py` — mentions légales et clause de confidentialité communes.
  La date et le numéro de version des quatre documents s'y modifient en un seul endroit.

## Notes techniques
- La génération se fait en **deux écritures** : la première compte les pages,
  la seconde renseigne le total dans le pied de page. ReportLab consommant les
  flowables, le contenu est reconstruit entre les deux.
- Les polices PDF de base n'ont pas de glyphes pour les emoji : `nettoyer()`
  les remplace ou les retire, faute de quoi ils s'afficheraient en carrés noirs.
- Les chemins des logos sont absolus dans `pdfkit_cia.py` (constantes
  `LOGO_CIA` et `LOGO_STARIAX`) — à ajuster en cas de déplacement des dossiers.

## Confidentialité
`CIA-DOC-03` reproduit **intégralement** les prompts système. Sa diffusion doit
rester strictement limitée.
