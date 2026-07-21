/**
 * Génération de PDF réels à partir d'un document structuré.
 *
 * ── Ce que « réel » veut dire ici ─────────────────────────────────────────
 * Pas une capture d'écran, pas un dump de texte : un vrai document paginé,
 * avec titres hiérarchisés, listes, tableaux, citations, coupures de page
 * propres et pagination « Page X / Y ». Le rendu passe par jsPDF, déjà présent
 * dans le projet et déjà utilisé pour les résumés de session.
 *
 * La fonction renvoie un `Blob` plutôt que de déclencher un téléchargement :
 * c'est l'appelant qui décide de la destination — Téléchargements, ou un
 * dossier de travail auquel l'utilisateur a donné accès (voir dossierTravail).
 */
import { jsPDF } from 'jspdf';

const BLEU = [93, 123, 255] as const;
const ENCRE = [20, 20, 20] as const;
const GRIS = [120, 120, 130] as const;
const GRIS_CLAIR = [225, 227, 235] as const;
const FOND_DOUX = [244, 246, 252] as const;

/* ─── Modèle de document ──────────────────────────────────────────────────── */

export type Bloc =
  | { type: 'titre1'; texte: string }
  | { type: 'titre2'; texte: string }
  | { type: 'paragraphe'; texte: string }
  | { type: 'liste'; items: string[]; ordonnee?: boolean }
  | { type: 'citation'; texte: string }
  | { type: 'tableau'; entetes: string[]; lignes: string[][] }
  | { type: 'code'; texte: string }
  | { type: 'separateur' };

export type DocumentPdf = {
  titre: string;
  sousTitre?: string;
  auteur?: string;
  date?: string;
  blocs: Bloc[];
};

/* ─── Constantes de mise en page ──────────────────────────────────────────── */

const MARGE = 20;          // mm
const LARGEUR = 210;       // A4
const HAUTEUR = 297;
const DISPO = LARGEUR - 2 * MARGE;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const encre = (d: jsPDF, c: readonly [number, number, number]) => d.setTextColor(c[0], c[1], c[2]);
const fond = (d: jsPDF, c: readonly [number, number, number]) => d.setFillColor(c[0], c[1], c[2]);
const trait = (d: jsPDF, c: readonly [number, number, number]) => d.setDrawColor(c[0], c[1], c[2]);

/** Nettoie le Markdown inline que le modèle laisse traîner (**gras**, `code`). */
function nettoyerInline(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#+\s*/, '')
    .trim();
}

/* ─── Rendu ───────────────────────────────────────────────────────────────── */

class Rendu {
  doc: jsPDF;
  y = MARGE + 4;
  meta: DocumentPdf;

  constructor(meta: DocumentPdf) {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    this.meta = meta;
  }

  /** Passe à une nouvelle page si le contenu à venir ne tient pas. */
  garde(hauteur: number) {
    if (this.y + hauteur > HAUTEUR - MARGE - 8) {
      this.doc.addPage();
      this.y = MARGE + 4;
    }
  }

  texte(t: string, x: number, maxW: number, lh: number): number {
    const lignes = this.doc.splitTextToSize(nettoyerInline(t), maxW) as string[];
    for (const l of lignes) {
      this.garde(lh);
      this.doc.text(l, x, this.y);
      this.y += lh;
    }
    return this.y;
  }

  couverture() {
    const d = this.doc;
    // Bandeau supérieur
    fond(d, BLEU);
    d.rect(0, 0, LARGEUR, 3, 'F');

    this.y = 40;
    d.setFont('helvetica', 'bold');
    d.setFontSize(11);
    encre(d, BLEU);
    d.text('CHALLENGER IA', MARGE, this.y);
    this.y += 14;

    d.setFontSize(26);
    encre(d, ENCRE);
    const titre = d.splitTextToSize(this.meta.titre, DISPO) as string[];
    for (const l of titre) { d.text(l, MARGE, this.y); this.y += 11; }

    if (this.meta.sousTitre) {
      this.y += 2;
      d.setFont('helvetica', 'normal');
      d.setFontSize(13);
      encre(d, GRIS);
      const st = d.splitTextToSize(this.meta.sousTitre, DISPO) as string[];
      for (const l of st) { d.text(l, MARGE, this.y); this.y += 7; }
    }

    this.y += 6;
    trait(d, GRIS_CLAIR);
    d.setLineWidth(0.5);
    d.line(MARGE, this.y, LARGEUR - MARGE, this.y);
    this.y += 8;

    d.setFontSize(9);
    encre(d, GRIS);
    const ligneMeta = [
      this.meta.auteur ? `Par ${this.meta.auteur}` : null,
      this.meta.date ?? new Date().toLocaleDateString('fr-FR'),
    ].filter(Boolean).join('  ·  ');
    d.text(ligneMeta, MARGE, this.y);
    this.y += 14;
  }

  bloc(b: Bloc) {
    const d = this.doc;
    switch (b.type) {
      case 'titre1':
        this.y += 4;
        this.garde(12);
        d.setFont('helvetica', 'bold');
        d.setFontSize(15);
        encre(d, ENCRE);
        this.texte(b.texte, MARGE, DISPO, 7);
        trait(d, BLEU);
        d.setLineWidth(0.6);
        d.line(MARGE, this.y + 0.5, MARGE + 18, this.y + 0.5);
        this.y += 4;
        break;

      case 'titre2':
        this.y += 2;
        this.garde(9);
        d.setFont('helvetica', 'bold');
        d.setFontSize(12);
        encre(d, BLEU);
        this.texte(b.texte, MARGE, DISPO, 6);
        this.y += 1;
        break;

      case 'paragraphe':
        d.setFont('helvetica', 'normal');
        d.setFontSize(10.5);
        encre(d, ENCRE);
        this.texte(b.texte, MARGE, DISPO, 5.6);
        this.y += 2.5;
        break;

      case 'liste': {
        d.setFont('helvetica', 'normal');
        d.setFontSize(10.5);
        encre(d, ENCRE);
        b.items.forEach((item, i) => {
          const puce = b.ordonnee ? `${i + 1}.` : '—';
          const lignes = d.splitTextToSize(nettoyerInline(item), DISPO - 7) as string[];
          this.garde(lignes.length * 5.4);
          encre(d, BLEU);
          d.text(puce, MARGE, this.y);
          encre(d, ENCRE);
          lignes.forEach((l, j) => d.text(l, MARGE + 7, this.y + j * 5.4));
          this.y += lignes.length * 5.4 + 0.6;
        });
        this.y += 2;
        break;
      }

      case 'citation': {
        d.setFont('helvetica', 'italic');
        d.setFontSize(10.5);
        const lignes = d.splitTextToSize(nettoyerInline(b.texte), DISPO - 8) as string[];
        this.garde(lignes.length * 5.6 + 3);
        const hautBarre = this.y - 3;
        encre(d, GRIS);
        lignes.forEach((l, j) => d.text(l, MARGE + 6, this.y + j * 5.6));
        fond(d, BLEU);
        d.rect(MARGE, hautBarre, 1.5, lignes.length * 5.6 + 1, 'F');
        this.y += lignes.length * 5.6 + 4;
        break;
      }

      case 'code': {
        d.setFont('courier', 'normal');
        d.setFontSize(9);
        const lignes = d.splitTextToSize(b.texte, DISPO - 8) as string[];
        this.garde(lignes.length * 4.6 + 6);
        fond(d, FOND_DOUX);
        d.rect(MARGE, this.y - 3, DISPO, lignes.length * 4.6 + 5, 'F');
        encre(d, ENCRE);
        lignes.forEach((l, j) => d.text(l, MARGE + 4, this.y + j * 4.6 + 1));
        this.y += lignes.length * 4.6 + 7;
        break;
      }

      case 'tableau':
        this.tableau(b.entetes, b.lignes);
        break;

      case 'separateur':
        this.y += 3;
        trait(d, GRIS_CLAIR);
        d.setLineWidth(0.3);
        d.line(MARGE, this.y, LARGEUR - MARGE, this.y);
        this.y += 5;
        break;
    }
  }

  tableau(entetes: string[], lignes: string[][]) {
    const d = this.doc;
    const nCol = entetes.length;
    const largeurCol = DISPO / nCol;
    d.setFontSize(9);

    const hauteurLigne = (cells: string[], gras: boolean): number => {
      d.setFont('helvetica', gras ? 'bold' : 'normal');
      let maxL = 1;
      for (const c of cells) {
        const l = d.splitTextToSize(nettoyerInline(c), largeurCol - 4) as string[];
        maxL = Math.max(maxL, l.length);
      }
      return maxL * 4.4 + 3;
    };

    const dessineLigne = (cells: string[], gras: boolean, fondLigne?: readonly [number, number, number]) => {
      const h = hauteurLigne(cells, gras);
      this.garde(h);
      if (fondLigne) { fond(d, fondLigne); d.rect(MARGE, this.y - 3.5, DISPO, h, 'F'); }
      d.setFont('helvetica', gras ? 'bold' : 'normal');
      encre(d, gras ? [255, 255, 255] : ENCRE);
      cells.forEach((c, i) => {
        const l = d.splitTextToSize(nettoyerInline(c), largeurCol - 4) as string[];
        l.forEach((ligne, j) => d.text(ligne, MARGE + i * largeurCol + 2, this.y + j * 4.4));
      });
      trait(d, GRIS_CLAIR);
      d.setLineWidth(0.2);
      d.line(MARGE, this.y + h - 3.5, LARGEUR - MARGE, this.y + h - 3.5);
      this.y += h;
    };

    this.y += 2;
    dessineLigne(entetes, true, BLEU);
    lignes.forEach((lg, i) => dessineLigne(lg, false, i % 2 ? FOND_DOUX : undefined));
    this.y += 3;
  }

  pagination() {
    const d = this.doc;
    const total = d.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      d.setPage(p);
      d.setFont('helvetica', 'normal');
      d.setFontSize(8);
      encre(d, GRIS);
      d.text(`Page ${p} / ${total}`, LARGEUR - MARGE, HAUTEUR - 10, { align: 'right' });
      d.text('Challenger IA', MARGE, HAUTEUR - 10);
    }
  }

  construire(): Blob {
    this.couverture();
    for (const b of this.meta.blocs) this.bloc(b);
    this.pagination();
    return this.doc.output('blob');
  }
}

/** Rend un document structuré en PDF réel, renvoyé en Blob. */
export function genererPdf(document: DocumentPdf): Blob {
  return new Rendu(document).construire();
}

/* ─── Markdown → document ─────────────────────────────────────────────────── */

/**
 * Convertit le Markdown produit par le modèle en document structuré.
 *
 * Le chat génère déjà du Markdown : plutôt qu'imposer au modèle un format JSON
 * fragile, on parse le Markdown qu'il sait produire de façon fiable. Le
 * parseur est volontairement simple — titres, listes, citations, tableaux,
 * blocs de code, paragraphes — ce qui couvre ce qu'une réponse contient.
 */
export function markdownVersDocument(markdown: string, titre: string, sousTitre?: string): DocumentPdf {
  const blocs: Bloc[] = [];
  const lignes = markdown.replace(/\r/g, '').split('\n');
  let i = 0;

  const estSeparateurTableau = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-');
  const cellules = (l: string) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

  while (i < lignes.length) {
    const l = lignes[i];
    const nu = l.trim();

    if (nu === '') { i++; continue; }

    // Tableau : ligne d'en-tête suivie d'une ligne de séparation.
    if (nu.includes('|') && i + 1 < lignes.length && estSeparateurTableau(lignes[i + 1])) {
      const entetes = cellules(nu);
      const corps: string[][] = [];
      i += 2;
      while (i < lignes.length && lignes[i].includes('|') && lignes[i].trim() !== '') {
        corps.push(cellules(lignes[i]));
        i++;
      }
      blocs.push({ type: 'tableau', entetes, lignes: corps });
      continue;
    }

    // Bloc de code délimité par ```
    if (nu.startsWith('```')) {
      const buff: string[] = [];
      i++;
      while (i < lignes.length && !lignes[i].trim().startsWith('```')) { buff.push(lignes[i]); i++; }
      i++; // ferme le ```
      blocs.push({ type: 'code', texte: buff.join('\n') });
      continue;
    }

    // Séparateur horizontal
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(nu)) { blocs.push({ type: 'separateur' }); i++; continue; }

    // Titres
    if (/^#{1,2}\s/.test(nu)) { blocs.push({ type: 'titre1', texte: nu.replace(/^#{1,2}\s/, '') }); i++; continue; }
    if (/^#{3,6}\s/.test(nu)) { blocs.push({ type: 'titre2', texte: nu.replace(/^#{3,6}\s/, '') }); i++; continue; }

    // Citation
    if (nu.startsWith('>')) {
      const buff: string[] = [];
      while (i < lignes.length && lignes[i].trim().startsWith('>')) {
        buff.push(lignes[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocs.push({ type: 'citation', texte: buff.join(' ') });
      continue;
    }

    // Listes (puces ou numérotées) : on regroupe les lignes contiguës.
    if (/^\s*([-*+]|\d+\.)\s/.test(l)) {
      const ordonnee = /^\s*\d+\.\s/.test(l);
      const items: string[] = [];
      while (i < lignes.length && /^\s*([-*+]|\d+\.)\s/.test(lignes[i])) {
        items.push(lignes[i].replace(/^\s*([-*+]|\d+\.)\s/, '').trim());
        i++;
      }
      blocs.push({ type: 'liste', items, ordonnee });
      continue;
    }

    // Paragraphe : lignes contiguës jusqu'à une ligne vide ou un bloc spécial.
    const para: string[] = [];
    while (
      i < lignes.length &&
      lignes[i].trim() !== '' &&
      !/^#{1,6}\s/.test(lignes[i].trim()) &&
      !/^\s*([-*+]|\d+\.)\s/.test(lignes[i]) &&
      !lignes[i].trim().startsWith('>') &&
      !lignes[i].trim().startsWith('```') &&
      !(lignes[i].includes('|') && i + 1 < lignes.length && estSeparateurTableau(lignes[i + 1]))
    ) {
      para.push(lignes[i].trim());
      i++;
    }
    if (para.length) blocs.push({ type: 'paragraphe', texte: para.join(' ') });
  }

  return { titre, sousTitre, date: new Date().toLocaleDateString('fr-FR'), blocs };
}
