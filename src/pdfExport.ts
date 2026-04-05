// ─── PDF Export — Résumé de session ──────────────────────────────────────────

import { jsPDF } from 'jspdf';

export type SessionSummary = {
  titre: string;
  vue_ensemble: string;
  points_forts: string[];
  axes_amelioration: string[];
  conseils: string[];
  citations: string[];
  score: number;
  score_justification: string;
  mots_cles: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BLUE = [93, 123, 255] as const;
const DARK = [20, 20, 20] as const;
const LIGHT_BG = [240, 244, 255] as const;
const WHITE = [255, 255, 255] as const;
const GREY = [120, 120, 130] as const;
const GREEN = [16, 185, 129] as const;
const AMBER = [245, 158, 11] as const;
const PURPLE = [139, 92, 246] as const;
const RED = [239, 68, 68] as const;

function setRgb(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}
function setFillRgb(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
}
function setDrawRgb(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

/** Split text to lines within maxWidth, return array of lines */
function splitLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth);
}

/** Draw wrapped text and return new Y position */
function drawText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5.5
): number {
  const lines = splitLines(doc, text, maxWidth);
  lines.forEach((line: string, i: number) => {
    doc.text(line, x, y + i * lineHeight);
  });
  return y + lines.length * lineHeight;
}

/** Add a new page if content would overflow */
function checkPage(doc: jsPDF, y: number, needed: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - margin) {
    doc.addPage();
    return margin + 10;
  }
  return y;
}

// ─── Main export function ─────────────────────────────────────────────────────

export function generateSessionPDF(
  summary: SessionSummary,
  sessionType: string,
  sessionDate: string,
  userName?: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = W - margin * 2;

  // ── Cover / Header block ───────────────────────────────────────────────────
  setFillRgb(doc, BLUE);
  doc.rect(0, 0, W, 42, 'F');

  // Accents géométriques
  setFillRgb(doc, [255, 255, 255]);
  doc.setGState(new (doc as any).GState({ opacity: 0.04 }));
  doc.rect(W - 28, 0, 28, 42, 'F');
  doc.rect(W - 56, 10, 28, 32, 'F');
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  // App name
  setRgb(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setLetterSpacing(2);
  doc.text('CHALLENGER IA', margin, 14);
  doc.setLetterSpacing(0);

  // Titre
  doc.setFontSize(18);
  doc.text('RÉSUMÉ DE SESSION', margin, 24);

  // Sous-titre
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setRgb(doc, [200, 210, 255]);
  doc.text(`${sessionType}  ·  ${sessionDate}${userName ? `  ·  ${userName}` : ''}`, margin, 33);

  let y = 54;

  // ── Score badge (cercle + note) ────────────────────────────────────────────
  const scoreColor = summary.score >= 8 ? GREEN : summary.score >= 6 ? AMBER : RED;
  const cx = W - margin - 14;
  const cy = 22;
  setFillRgb(doc, WHITE);
  setDrawRgb(doc, scoreColor);
  doc.setLineWidth(1.5);
  doc.circle(cx, cy, 12, 'FD');
  setRgb(doc, scoreColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`${summary.score}`, cx, cy + 1.5, { align: 'center' });
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  setRgb(doc, GREY);
  doc.text('/10', cx, cy + 7, { align: 'center' });

  // ── Titre de la session ────────────────────────────────────────────────────
  setFillRgb(doc, LIGHT_BG);
  doc.roundedRect(margin, y, contentW, 18, 2, 2, 'F');
  setRgb(doc, DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(summary.titre, margin + 5, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setRgb(doc, GREY);
  const justifLines = splitLines(doc, summary.score_justification, contentW - 10);
  justifLines.slice(0, 1).forEach((l: string) => doc.text(l, margin + 5, y + 13));
  y += 24;

  // ── Vue d'ensemble ─────────────────────────────────────────────────────────
  y = checkPage(doc, y, 28, margin);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setRgb(doc, BLUE);
  doc.setLetterSpacing(1.5);
  doc.text('VUE D\'ENSEMBLE', margin, y);
  doc.setLetterSpacing(0);
  y += 5;
  setDrawRgb(doc, BLUE);
  doc.setLineWidth(0.4);
  doc.line(margin, y, margin + 36, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  setRgb(doc, DARK);
  y = drawText(doc, summary.vue_ensemble, margin, y, contentW, 5.5);
  y += 10;

  // ── Section helper ─────────────────────────────────────────────────────────
  const drawSection = (
    title: string,
    items: string[],
    color: readonly [number, number, number],
    bullet: string,
    icon: string
  ) => {
    y = checkPage(doc, y, 20 + items.length * 10, margin);

    // Section title bar
    setFillRgb(doc, color);
    doc.rect(margin, y - 4, 3, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setRgb(doc, color);
    doc.setLetterSpacing(1.5);
    doc.text(`${icon}  ${title}`, margin + 6, y + 2);
    doc.setLetterSpacing(0);
    y += 10;

    items.forEach((item) => {
      y = checkPage(doc, y, 12, margin);

      // Bullet dot
      setFillRgb(doc, color);
      doc.circle(margin + 3, y - 1.5, 1.2, 'F');

      // Item text
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setRgb(doc, DARK);
      const lines = splitLines(doc, item, contentW - 12);
      lines.forEach((line: string, i: number) => {
        doc.text(line, margin + 8, y + i * 5.2);
      });
      y += lines.length * 5.2 + 2;
    });

    y += 8;
  };

  drawSection('POINTS FORTS', summary.points_forts, GREEN, '✓', '✦');
  drawSection('AXES D\'AMÉLIORATION', summary.axes_amelioration, AMBER, '↑', '↑');
  drawSection('CONSEILS PRATIQUES', summary.conseils, PURPLE, '→', '✧');

  // ── Citations notables ─────────────────────────────────────────────────────
  if (summary.citations.length > 0) {
    y = checkPage(doc, y, 20 + summary.citations.length * 16, margin);
    setFillRgb(doc, BLUE);
    doc.rect(margin, y - 4, 3, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setRgb(doc, BLUE);
    doc.setLetterSpacing(1.5);
    doc.text('❝  EXTRAITS NOTABLES', margin + 6, y + 2);
    doc.setLetterSpacing(0);
    y += 10;

    summary.citations.forEach((cite) => {
      y = checkPage(doc, y, 18, margin);
      setFillRgb(doc, LIGHT_BG);
      setDrawRgb(doc, BLUE);
      doc.setLineWidth(0.3);
      const lines = splitLines(doc, `« ${cite} »`, contentW - 14);
      const boxH = lines.length * 5.5 + 8;
      doc.roundedRect(margin + 2, y - 4, contentW - 4, boxH, 1.5, 1.5, 'FD');
      setFillRgb(doc, BLUE);
      doc.rect(margin + 2, y - 4, 2.5, boxH, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      setRgb(doc, [60, 80, 160]);
      lines.forEach((line: string, i: number) => {
        doc.text(line, margin + 8, y + i * 5.5);
      });
      y += boxH + 4;
    });
    y += 6;
  }

  // ── Mots-clés ──────────────────────────────────────────────────────────────
  if (summary.mots_cles.length > 0) {
    y = checkPage(doc, y, 20, margin);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setRgb(doc, GREY);
    doc.setLetterSpacing(1.5);
    doc.text('MOTS-CLÉS', margin, y);
    doc.setLetterSpacing(0);
    y += 6;

    let kx = margin;
    summary.mots_cles.forEach((kw) => {
      doc.setFontSize(7.5);
      const kw_w = doc.getTextWidth(kw) + 8;
      if (kx + kw_w > W - margin) { kx = margin; y += 8; }
      setFillRgb(doc, LIGHT_BG);
      setDrawRgb(doc, BLUE);
      doc.setLineWidth(0.3);
      doc.roundedRect(kx, y - 4, kw_w, 7, 1, 1, 'FD');
      setRgb(doc, BLUE);
      doc.setFont('helvetica', 'bold');
      doc.text(kw, kx + 4, y);
      kx += kw_w + 3;
    });
    y += 12;
  }

  // ── Footer sur chaque page ─────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    setFillRgb(doc, DARK);
    doc.rect(0, H - 10, W, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setRgb(doc, GREY);
    doc.text('CHALLENGER IA — STARIAX GROUP © 2026', margin, H - 4);
    doc.text(`${p} / ${totalPages}`, W - margin, H - 4, { align: 'right' });
  }

  // ── Download ───────────────────────────────────────────────────────────────
  const filename = `challenger-resume-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
