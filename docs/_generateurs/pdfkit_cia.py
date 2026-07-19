"""
Socle de mise en page pour la documentation Challenger IA / STARIAX.

Couverture double logo, mentions légales, sommaire automatique (2 passes),
numérotation hiérarchique des sections et pagination « Page X / Y ».
"""
import re
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, Preformatted, KeepTogether, NextPageTemplate,
)
from reportlab.platypus.tableofcontents import TableOfContents

# ─── Identité visuelle ───────────────────────────────────────────────────────
BLEU        = colors.HexColor('#5D7BFF')
BLEU_SOMBRE = colors.HexColor('#3B55C9')
ENCRE       = colors.HexColor('#141414')
GRIS        = colors.HexColor('#6B7280')
GRIS_CLAIR  = colors.HexColor('#E5E7EB')
FOND_DOUX   = colors.HexColor('#F0F4FF')
AMBRE       = colors.HexColor('#B45309')
ROUGE       = colors.HexColor('#B91C1C')

LOGO_CIA     = '/Users/morganreichert/Desktop/challenger-ia-chatbot/public/logocompletbleu.png'
LOGO_STARIAX = '/Users/morganreichert/Desktop/stariax-app/public/logo stariax/logocomplet.png'

EDITEUR = "STARIAX GROUP — European Tech Group"
PRODUIT = "Challenger IA"

# ─── Nettoyage typographique ─────────────────────────────────────────────────
# Les polices PDF de base (Helvetica/Courier) n'ont pas de glyphes pour les
# emoji ni pour certains symboles : sans substitution, ils sortent en carrés
# noirs. On remplace par des équivalents textuels plutôt que de les perdre.
_SUBSTITUTIONS = {
    '≠': '!=', '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '↔': '<->',
    '⌄': 'v', '✓': '[ok]', '✅': '[OK]', '❌': '[NON]', '⚠️': '[!]', '⚠': '[!]',
    '🚨': '[ALERTE]', '❓': '[?]', '📊': '', '🎯': '', '🏆': '', '🌱': '',
    '🔍': '', '⚖️': '', '⚖': '', '🗡️': '', '🗡': '', '🧠': '', '👑': '',
    '💪': '', '🔄': '[PARTIEL]', '⚔️': '', '⚔': '', '🧭': '', '🧪': '',
    '💡': '', '🏛️': '', '🏛': '', '💰': '', '🎓': '', '🔬': '', '🤝': '',
    '🚀': '', '🎨': '', '🧬': '', '💼': '', '🌍': '', '🔐': '', '🏥': '',
    '🧩': '', '🚗': '', '🎮': '', '📱': '', '🔧': '', '📦': '', '🗄️': '',
    ' ': ' ', ' ': ' ', '‑': '-',
}
_EMOJI = re.compile(
    '[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF'
    '\U00002190-\U000021FF\U00002B00-\U00002BFF️‍]'
)


def nettoyer(txt: str) -> str:
    """Rend une chaîne sûre pour les polices PDF de base."""
    if txt is None:
        return ''
    for k, v in _SUBSTITUTIONS.items():
        txt = txt.replace(k, v)
    return _EMOJI.sub('', txt)


def echapper(txt: str) -> str:
    """Nettoie puis échappe les entités XML de ReportLab."""
    txt = nettoyer(txt)
    return txt.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _couper_lignes(texte: str, largeur: int) -> str:
    """Coupe dur les lignes trop longues : Preformatted ne fait pas de retour
    à la ligne automatique et déborderait silencieusement de la page."""
    sortie = []
    for ligne in nettoyer(texte).split('\n'):
        while len(ligne) > largeur:
            point = ligne.rfind(' ', 0, largeur)
            if point < largeur * 0.6:
                point = largeur
            sortie.append(ligne[:point])
            ligne = '    ' + ligne[point:].lstrip()
        sortie.append(ligne)
    return '\n'.join(sortie)


# ─── Styles ──────────────────────────────────────────────────────────────────
def _styles():
    s = getSampleStyleSheet()
    base = dict(fontName='Helvetica', textColor=ENCRE, leading=13.5)
    return {
        'corps': ParagraphStyle('corps', **base, fontSize=9.2, alignment=TA_JUSTIFY,
                                spaceAfter=6),
        'h1': ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=15,
                             textColor=BLEU_SOMBRE, spaceBefore=18, spaceAfter=9,
                             leading=18),
        'h2': ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=11.5,
                             textColor=ENCRE, spaceBefore=13, spaceAfter=6, leading=14),
        'h3': ParagraphStyle('h3', fontName='Helvetica-Bold', fontSize=9.8,
                             textColor=GRIS, spaceBefore=9, spaceAfter=4, leading=12),
        'puce': ParagraphStyle('puce', **base, fontSize=9.2, leftIndent=11,
                               bulletIndent=2, spaceAfter=3),
        'code': ParagraphStyle('code', fontName='Courier', fontSize=6.6,
                               textColor=ENCRE, leading=8.2),
        'legende': ParagraphStyle('legende', fontName='Helvetica-Oblique', fontSize=8,
                                  textColor=GRIS, spaceAfter=8, leading=10),
        'cellule': ParagraphStyle('cellule', fontName='Helvetica', fontSize=7.6,
                                  textColor=ENCRE, leading=9.4),
        'cellule_g': ParagraphStyle('cellule_g', fontName='Helvetica-Bold', fontSize=7.6,
                                    textColor=colors.white, leading=9.4),
        'titre_couv': ParagraphStyle('tc', fontName='Helvetica-Bold', fontSize=25,
                                     textColor=ENCRE, alignment=TA_CENTER, leading=29),
        'stitre_couv': ParagraphStyle('stc', fontName='Helvetica', fontSize=11.5,
                                      textColor=GRIS, alignment=TA_CENTER, leading=16),
        'toc1': ParagraphStyle('toc1', fontName='Helvetica-Bold', fontSize=9.5,
                               textColor=BLEU_SOMBRE, leading=15, spaceBefore=5),
        'toc2': ParagraphStyle('toc2', fontName='Helvetica', fontSize=8.8,
                               textColor=ENCRE, leading=12.5, leftIndent=13),
    }


class _Doc(BaseDocTemplate):
    """Gère en-tête, pied de page et remontée des titres vers le sommaire."""

    def __init__(self, chemin, titre_doc, reference, **kw):
        super().__init__(chemin, pagesize=A4, title=titre_doc,
                         author=EDITEUR, subject=f"{PRODUIT} — {titre_doc}",
                         creator=EDITEUR, **kw)
        self.titre_doc = titre_doc
        self.reference = reference
        cadre = Frame(18 * mm, 20 * mm, A4[0] - 36 * mm, A4[1] - 46 * mm, id='corps')
        self.addPageTemplates([
            PageTemplate(id='couverture', frames=[
                Frame(18 * mm, 20 * mm, A4[0] - 36 * mm, A4[1] - 30 * mm, id='couv')]),
            PageTemplate(id='contenu', frames=[cadre], onPage=self._decor),
        ])

    def _decor(self, canvas, doc):
        canvas.saveState()
        l, h = A4
        # En-tête
        try:
            canvas.drawImage(LOGO_CIA, 18 * mm, h - 17 * mm, width=26 * mm, height=5.2 * mm,
                             mask='auto', preserveAspectRatio=True, anchor='w')
        except Exception:
            pass
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(GRIS)
        canvas.drawRightString(l - 18 * mm, h - 14 * mm, nettoyer(self.titre_doc))
        canvas.setStrokeColor(GRIS_CLAIR)
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, h - 19 * mm, l - 18 * mm, h - 19 * mm)
        # Pied de page
        canvas.line(18 * mm, 15 * mm, l - 18 * mm, 15 * mm)
        canvas.setFont('Helvetica', 6.8)
        canvas.setFillColor(GRIS)
        canvas.drawString(18 * mm, 11 * mm, f"{EDITEUR} — {PRODUIT}")
        canvas.setFont('Helvetica-Bold', 6.8)
        canvas.setFillColor(ROUGE)
        canvas.drawCentredString(l / 2, 11 * mm, "DOCUMENT CONFIDENTIEL")
        canvas.setFont('Helvetica', 6.8)
        canvas.setFillColor(GRIS)
        canvas.drawRightString(l - 18 * mm, 11 * mm,
                               f"Page {canvas.getPageNumber()} / {getattr(self, '_total', '?')}")
        canvas.setFont('Helvetica', 5.8)
        canvas.drawString(18 * mm, 7.5 * mm, f"Réf. {self.reference}")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if hasattr(flowable, '_toc_niveau'):
            self.notify('TOCEntry',
                        (flowable._toc_niveau, flowable.getPlainText(), self.page))


class Document:
    """API de construction d'un document."""

    def __init__(self, chemin, titre, sous_titre, reference, version, date, resume):
        self.chemin, self.titre, self.sous_titre = chemin, titre, sous_titre
        self.reference, self.version, self.date, self.resume = reference, version, date, resume
        self.st = _styles()
        self.flow = []
        self._n1 = self._n2 = self._n3 = 0

    # ── Couverture + pages liminaires ────────────────────────────────────────
    def couverture(self):
        s, f = self.st, self.flow
        f.append(Spacer(1, 14 * mm))
        try:
            f.append(Image(LOGO_STARIAX, width=52 * mm, height=52 * mm,
                           hAlign='CENTER', kind='proportional'))
        except Exception:
            pass
        f.append(Spacer(1, 2 * mm))
        f.append(Paragraph(f"<b>{echapper(EDITEUR)}</b>", s['stitre_couv']))
        f.append(Spacer(1, 20 * mm))
        try:
            f.append(Image(LOGO_CIA, width=96 * mm, height=19 * mm, hAlign='CENTER',
                           kind='proportional'))
        except Exception:
            pass
        f.append(Spacer(1, 16 * mm))
        f.append(Paragraph(echapper(self.titre), s['titre_couv']))
        f.append(Spacer(1, 5 * mm))
        # nettoyer() et non echapper() : le sous-titre accepte <br/>
        f.append(Paragraph(nettoyer(self.sous_titre), s['stitre_couv']))
        f.append(Spacer(1, 18 * mm))

        meta = [
            ['Référence', self.reference],
            ['Version', self.version],
            ['Date d\'émission', self.date],
            ['Éditeur', EDITEUR],
            ['Produit', f"{PRODUIT} (challengeria.fr)"],
            ['Classification', 'CONFIDENTIEL — Diffusion restreinte'],
        ]
        t = Table([[Paragraph(f"<b>{echapper(a)}</b>", s['cellule']),
                    Paragraph(echapper(b), s['cellule'])] for a, b in meta],
                  colWidths=[45 * mm, 90 * mm], hAlign='CENTER')
        t.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 0.8, BLEU),
            ('INNERGRID', (0, 0), (-1, -1), 0.4, GRIS_CLAIR),
            ('BACKGROUND', (0, 0), (0, -1), FOND_DOUX),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        f.append(t)
        f.append(Spacer(1, 12 * mm))
        f.append(self._bandeau(
            "Ce document contient des informations confidentielles et des secrets d'affaires "
            f"appartenant à {EDITEUR}. Toute reproduction, diffusion ou communication à un tiers, "
            "totale ou partielle, est interdite sans autorisation écrite préalable.", ROUGE))
        # La couverture n'a ni en-tête ni pied de page : on bascule ensuite
        # sur le gabarit de contenu, qui les porte.
        f.append(NextPageTemplate('contenu'))
        f.append(PageBreak())

    def mentions_legales(self, blocs):
        self.titre1("Mentions légales et clause de confidentialité")
        for titre, corps in blocs:
            self.titre2(titre)
            for p in corps:
                self.para(p)
        self.flow.append(PageBreak())

    def sommaire(self):
        s = self.st
        self.flow.append(Paragraph("Sommaire", s['h1']))
        toc = TableOfContents()
        toc.levelStyles = [s['toc1'], s['toc2']]
        self.flow.append(toc)
        self.flow.append(PageBreak())

    # ── Éléments de contenu ──────────────────────────────────────────────────
    def titre1(self, txt):
        self._n1 += 1
        self._n2 = self._n3 = 0
        p = Paragraph(f"{self._n1}. {echapper(txt)}", self.st['h1'])
        p._toc_niveau = 0
        self.flow.append(p)

    def titre2(self, txt):
        self._n2 += 1
        self._n3 = 0
        p = Paragraph(f"{self._n1}.{self._n2} {echapper(txt)}", self.st['h2'])
        p._toc_niveau = 1
        self.flow.append(p)

    def titre3(self, txt):
        self._n3 += 1
        self.flow.append(Paragraph(
            f"{self._n1}.{self._n2}.{self._n3} {echapper(txt)}", self.st['h3']))

    def para(self, txt):
        self.flow.append(Paragraph(echapper(txt), self.st['corps']))

    def para_riche(self, txt):
        """Paragraphe autorisant <b> et <i> ; le reste est nettoyé."""
        self.flow.append(Paragraph(nettoyer(txt), self.st['corps']))

    def puces(self, items):
        for it in items:
            self.flow.append(Paragraph(nettoyer(it), self.st['puce'],
                                       bulletText='•'))
        self.flow.append(Spacer(1, 4))

    def code(self, txt, largeur=118):
        bloc = Preformatted(_couper_lignes(txt, largeur), self.st['code'])
        t = Table([[bloc]], colWidths=[A4[0] - 36 * mm - 2])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F7F8FA')),
            ('BOX', (0, 0), (-1, -1), 0.5, GRIS_CLAIR),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        self.flow.append(t)
        self.flow.append(Spacer(1, 6))

    def tableau(self, entetes, lignes, largeurs=None):
        s = self.st
        data = [[Paragraph(f"<b>{echapper(h)}</b>", s['cellule_g']) for h in entetes]]
        for lg in lignes:
            data.append([Paragraph(nettoyer(str(c)), s['cellule']) for c in lg])
        dispo = A4[0] - 36 * mm
        if largeurs:
            tot = sum(largeurs)
            largeurs = [w / tot * dispo for w in largeurs]
        else:
            largeurs = [dispo / len(entetes)] * len(entetes)
        t = Table(data, colWidths=largeurs, repeatRows=1, hAlign='LEFT')
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), BLEU),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F7F8FA')]),
            ('BOX', (0, 0), (-1, -1), 0.6, GRIS_CLAIR),
            ('INNERGRID', (0, 0), (-1, -1), 0.35, GRIS_CLAIR),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 3.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ]))
        self.flow.append(t)
        self.flow.append(Spacer(1, 8))

    def _bandeau(self, txt, couleur):
        p = Paragraph(nettoyer(txt), ParagraphStyle(
            'bandeau', fontName='Helvetica', fontSize=8.2, leading=11,
            textColor=ENCRE, alignment=TA_JUSTIFY))
        t = Table([[p]], colWidths=[A4[0] - 36 * mm - 2])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FFF7F5')),
            ('BOX', (0, 0), (-1, -1), 0.9, couleur),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ]))
        return t

    def encadre(self, titre, txt, couleur=AMBRE):
        self.flow.append(KeepTogether([
            self._bandeau(f"<b>{nettoyer(titre)}</b><br/><br/>{nettoyer(txt)}", couleur)]))
        self.flow.append(Spacer(1, 8))

    def saut(self):
        self.flow.append(PageBreak())

    # ── Génération ───────────────────────────────────────────────────────────
    def _construire(self, total=None):
        doc = _Doc(self.chemin, self.titre, self.reference)
        doc._total = total if total is not None else '?'
        doc.multiBuild(self.flow)


def generer_document(chemin, meta, remplir):
    """Construit le PDF en deux écritures.

    ReportLab consomme les flowables : le contenu est donc reconstruit à neuf
    pour la seconde écriture. La première sert uniquement à connaître le nombre
    total de pages, afin d'afficher « Page X / Y » dans le pied de page.
    """
    from pypdf import PdfReader

    d1 = Document(chemin, **meta)
    remplir(d1)
    d1._construire()
    total = len(PdfReader(chemin).pages)

    d2 = Document(chemin, **meta)
    remplir(d2)
    d2._construire(total=total)
    return total
