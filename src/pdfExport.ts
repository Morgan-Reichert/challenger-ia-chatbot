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

// ─── Couleurs ─────────────────────────────────────────────────────────────────

const BLUE   = [93, 123, 255] as const;
const DARK   = [20, 20, 20]   as const;
const LIGHT  = [240, 244, 255] as const;
const WHITE  = [255, 255, 255] as const;
const GREY   = [120, 120, 130] as const;
const GREEN  = [16, 185, 129]  as const;
const AMBER  = [200, 130, 10]  as const;
const PURPLE = [139, 92, 246]  as const;
const RED    = [220, 60, 60]   as const;
const BLUE_ACCENT = [110, 140, 255] as const; // nuance claire pour accents header

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rgb = (doc: jsPDF, c: readonly [number,number,number]) =>
  doc.setTextColor(c[0], c[1], c[2]);
const fill = (doc: jsPDF, c: readonly [number,number,number]) =>
  doc.setFillColor(c[0], c[1], c[2]);
const draw = (doc: jsPDF, c: readonly [number,number,number]) =>
  doc.setDrawColor(c[0], c[1], c[2]);

function wrap(doc: jsPDF, text: string, maxW: number): string[] {
  return doc.splitTextToSize(text, maxW) as string[];
}

function textBlock(doc: jsPDF, text: string, x: number, y: number, maxW: number, lh = 5.5): number {
  const lines = wrap(doc, text, maxW);
  lines.forEach((l: string, i: number) => doc.text(l, x, y + i * lh));
  return y + lines.length * lh;
}

function checkPage(doc: jsPDF, y: number, needed: number, margin: number): number {
  if (y + needed > doc.internal.pageSize.getHeight() - margin) {
    doc.addPage();
    return margin + 10;
  }
  return y;
}

// ─── Image loader ─────────────────────────────────────────────────────────────

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d')?.drawImage(img, 0, 0);
          resolve(c.toDataURL('image/png'));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
}

const QR_URL = 'https://i.postimg.cc/L5trkZXw/Untitled.png';

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function generateSessionPDF(
  summary: SessionSummary,
  sessionType: string,
  sessionDate: string,
  userName?: string
): Promise<void> {

  const qrDataUrl = await loadImageAsDataUrl(QR_URL);

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W     = doc.internal.pageSize.getWidth();   // 210
  const H     = doc.internal.pageSize.getHeight();  // 297
  const M     = 18;  // margin
  const CW    = W - M * 2;
  const HDR   = 52;  // header height

  // ── Header ────────────────────────────────────────────────────────────────
  fill(doc, BLUE);
  doc.rect(0, 0, W, HDR, 'F');

  // Geometric accent strips (solid, slightly lighter)
  fill(doc, BLUE_ACCENT);
  doc.rect(W - 30, 0, 30, HDR, 'F');
  doc.rect(W - 58, 8, 26, HDR - 8, 'F');

  // QR code top-right
  const QR = 26;
  const qrX = W - M - QR;
  const qrY = 5;
  if (qrDataUrl) {
    fill(doc, WHITE);
    doc.roundedRect(qrX - 2, qrY - 2, QR + 4, QR + 4, 1.5, 1.5, 'F');
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, QR, QR);
  }
  rgb(doc, [190, 205, 255]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.text('Challenger IA', qrX + QR / 2, qrY + QR + 5.5, { align: 'center' });

  // App label
  rgb(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('CHALLENGER IA', M, 13);

  // Title
  doc.setFontSize(17);
  doc.text('RÉSUMÉ DE SESSION', M, 24);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  rgb(doc, [190, 205, 255]);
  doc.text(
    `${sessionType}  ·  ${sessionDate}${userName ? `  ·  ${userName}` : ''}`,
    M, 34
  );

  // Thin separator line at bottom of header
  draw(doc, BLUE_ACCENT);
  doc.setLineWidth(0.3);
  doc.line(0, HDR, W, HDR);

  // ── Score badge (floats on header/content boundary) ────────────────────────
  const scoreColor = summary.score >= 8 ? GREEN : summary.score >= 6 ? AMBER : RED;
  const bx = W - M - 13;
  const by = HDR + 14;
  fill(doc, WHITE);
  draw(doc, scoreColor);
  doc.setLineWidth(1.5);
  doc.circle(bx, by, 12, 'FD');
  rgb(doc, scoreColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`${summary.score}`, bx, by + 1.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  rgb(doc, GREY);
  doc.text('/10', bx, by + 7, { align: 'center' });

  let y = HDR + 34;

  // ── Session title block ────────────────────────────────────────────────────
  fill(doc, LIGHT);
  draw(doc, [210, 220, 255]);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, CW, 20, 2, 2, 'FD');
  rgb(doc, DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(summary.titre.slice(0, 55), M + 5, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  rgb(doc, GREY);
  const justif = wrap(doc, summary.score_justification, CW - 12);
  doc.text(justif[0] ?? '', M + 5, y + 15);
  y += 28;

  // ── Vue d'ensemble ─────────────────────────────────────────────────────────
  y = checkPage(doc, y, 30, M);
  rgb(doc, BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('VUE D\'ENSEMBLE', M, y);
  y += 3;
  draw(doc, BLUE);
  doc.setLineWidth(0.4);
  doc.line(M, y, M + 38, y);
  y += 5;
  rgb(doc, DARK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  y = textBlock(doc, summary.vue_ensemble, M, y, CW, 5.5);
  y += 10;

  // ── Section renderer ───────────────────────────────────────────────────────
  const section = (
    title: string,
    items: string[],
    color: readonly [number,number,number],
    prefix: string
  ) => {
    if (!items?.length) return;
    y = checkPage(doc, y, 18 + items.length * 10, M);

    // Color bar + title
    fill(doc, color);
    doc.rect(M, y - 3, 3, 9, 'F');
    rgb(doc, color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`${prefix}  ${title}`, M + 6, y + 2);
    y += 10;

    items.forEach((item) => {
      y = checkPage(doc, y, 10, M);
      fill(doc, color);
      doc.circle(M + 3, y - 1.5, 1.1, 'F');
      rgb(doc, DARK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const lines = wrap(doc, item, CW - 12);
      lines.forEach((l: string, i: number) => doc.text(l, M + 8, y + i * 5.2));
      y += lines.length * 5.2 + 2.5;
    });
    y += 7;
  };

  section('POINTS FORTS',          summary.points_forts,      GREEN,  '✦');
  section('AXES D\'AMÉLIORATION',  summary.axes_amelioration, AMBER,  '↑');
  section('CONSEILS PRATIQUES',    summary.conseils,           PURPLE, '✧');

  // ── Citations ──────────────────────────────────────────────────────────────
  if (summary.citations?.length > 0) {
    y = checkPage(doc, y, 24, M);
    fill(doc, BLUE);
    doc.rect(M, y - 3, 3, 9, 'F');
    rgb(doc, BLUE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('EXTRAITS NOTABLES', M + 6, y + 2);
    y += 10;

    summary.citations.forEach((cite) => {
      y = checkPage(doc, y, 16, M);
      const lines = wrap(doc, `\u00ab ${cite} \u00bb`, CW - 16);
      const bh = lines.length * 5.5 + 8;
      fill(doc, LIGHT);
      draw(doc, BLUE);
      doc.setLineWidth(0.3);
      doc.roundedRect(M + 2, y - 4, CW - 4, bh, 1.5, 1.5, 'FD');
      fill(doc, BLUE);
      doc.rect(M + 2, y - 4, 2.5, bh, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      rgb(doc, [50, 70, 160]);
      lines.forEach((l: string, i: number) => doc.text(l, M + 8, y + i * 5.5));
      y += bh + 4;
    });
    y += 6;
  }

  // ── Mots-clés ──────────────────────────────────────────────────────────────
  if (summary.mots_cles?.length > 0) {
    y = checkPage(doc, y, 18, M);
    rgb(doc, GREY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('MOTS-CLÉS', M, y);
    y += 5;
    let kx = M;
    doc.setFontSize(7.5);
    summary.mots_cles.forEach((rawKw) => {
      const kw = String(rawKw);
      const kw_w = doc.getTextWidth(kw) + 8;
      if (kx + kw_w > W - M) { kx = M; y += 8; }
      y = checkPage(doc, y, 10, M);
      fill(doc, LIGHT);
      draw(doc, BLUE);
      doc.setLineWidth(0.3);
      doc.roundedRect(kx, y - 4, kw_w, 7, 1, 1, 'FD');
      rgb(doc, BLUE);
      doc.setFont('helvetica', 'bold');
      doc.text(kw, kx + 4, y);
      kx += kw_w + 3;
    });
    y += 12;
  }

  // ── Footer (every page) ────────────────────────────────────────────────────
  const total = (doc as any).internal.getNumberOfPages() as number;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    fill(doc, DARK);
    doc.rect(0, H - 9, W, 9, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    rgb(doc, GREY);
    doc.text('CHALLENGER IA — STARIAX GROUP © 2026', M, H - 3.5);
    doc.text(`${p} / ${total}`, W - M, H - 3.5, { align: 'right' });
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  doc.save(`challenger-resume-${new Date().toISOString().slice(0, 10)}.pdf`);
}
