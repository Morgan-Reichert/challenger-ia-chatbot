import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { VerdictSpec } from './viz/vizParse';

// Métadonnées (dupliquées du composant Verdict pour rester autonome)
const FACT: Record<string, { label: string; color: string }> = {
  vrai: { label: 'Vrai', color: '#10B981' },
  probable_vrai: { label: 'Probablement vrai', color: '#34D399' },
  inconnu: { label: 'Inconnu', color: '#9CA3AF' },
  non_verifie: { label: 'Non vérifié', color: '#6B7280' },
  inconcluant: { label: 'Inconcluant', color: '#FBBF24' },
  probable_faux: { label: 'Probablement faux', color: '#F97316' },
  faux: { label: 'Faux', color: '#EF4444' },
};
const RISK: Record<string, { label: string; color: string }> = {
  safe: { label: 'Safe', color: '#10B981' }, faible: { label: 'Faible', color: '#84CC16' },
  modere: { label: 'Modéré', color: '#FBBF24' }, dangereux: { label: 'Dangereux', color: '#F97316' },
  critique: { label: 'Critique', color: '#EF4444' },
};
const CONSENSUS: Record<string, { label: string; color: string }> = {
  fort: { label: 'Consensus fort', color: '#10B981' }, modere: { label: 'Consensus modéré', color: '#2DD4BF' },
  debattu: { label: 'Sujet débattu', color: '#FBBF24' }, controverse: { label: 'Controversé', color: '#F97316' },
  marginal: { label: 'Position marginale', color: '#9CA3AF' },
};
const CONF = [
  { band: 'speculatif', label: 'Spéculatif', color: '#EF4444' },
  { band: 'faible', label: 'Faible', color: '#F97316' },
  { band: 'plausible', label: 'Plausible', color: '#FBBF24' },
  { band: 'eleve', label: 'Élevé', color: '#84CC16' },
  { band: 'quasi_certain', label: 'Quasi-certain', color: '#10B981' },
];

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' '); const lines: string[] = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string) {
  ctx.font = `700 30px ${SANS}`;
  const padX = 22, h = 52, textW = ctx.measureText(label.toUpperCase()).width;
  const dotR = 7, gap = 14, w = padX * 2 + dotR * 2 + gap + textW;
  ctx.fillStyle = color + '22'; ctx.strokeStyle = color + '77'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + padX + dotR, y + h / 2, dotR, 0, Math.PI * 2); ctx.fill();
  ctx.textBaseline = 'middle'; ctx.fillText(label.toUpperCase(), x + padX + dotR * 2 + gap, y + h / 2 + 1);
}

/** Dessine la carte Verdict et renvoie le canvas. */
function drawCard(spec: VerdictSpec): HTMLCanvasElement {
  const W = 1080, H = 1350, P = 90, BRAND = '#5D7BFF';
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  // Fond
  ctx.fillStyle = '#14161f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = BRAND; ctx.fillRect(0, 0, W, 10); // liseré haut

  let y = P + 30;
  // Marque
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = BRAND; ctx.font = `800 46px ${SANS}`;
  ctx.fillText('CHALLENGER IA', P, y);
  y += 26;
  ctx.fillStyle = '#7c8496'; ctx.font = `700 22px ${SANS}`;
  ctx.fillText('F A C T - C H E C K', P, y + 14); y += 70;

  // Claim
  if (spec.claim) {
    ctx.fillStyle = '#e9ebf2'; ctx.font = `600 44px ${SANS}`;
    const lines = wrap(ctx, `« ${spec.claim} »`, W - P * 2).slice(0, 5);
    for (const l of lines) { ctx.fillText(l, P, y + 44); y += 60; }
    y += 30;
  }

  // Lignes verdict
  const f = FACT[spec.fact] ?? FACT.non_verifie;
  const r = RISK[spec.risk] ?? RISK.safe;
  const c = CONSENSUS[spec.consensus] ?? CONSENSUS.debattu;
  const rows: [string, { label: string; color: string }][] = [['Fact', f], ['Risque', r], ['Consensus', c]];
  for (const [lab, m] of rows) {
    ctx.fillStyle = '#8a90a2'; ctx.font = `800 24px ${SANS}`; ctx.textBaseline = 'middle';
    ctx.fillText(lab.toUpperCase(), P, y + 26);
    pill(ctx, P + 250, y, m.label, m.color);
    ctx.textBaseline = 'alphabetic';
    y += 76;
  }

  // Confiance
  y += 20;
  const ci = CONF.findIndex((b) => b.band === spec.confidence);
  const conf = CONF[ci] ?? CONF[2];
  ctx.fillStyle = '#8a90a2'; ctx.font = `800 24px ${SANS}`; ctx.textBaseline = 'middle';
  ctx.fillText('CONFIANCE', P, y + 12);
  ctx.fillStyle = conf.color; ctx.font = `800 28px ${SANS}`;
  ctx.fillText(conf.label, P + 250, y + 12);
  y += 42;
  const barW = W - P * 2, seg = (barW - 4 * 12) / 5;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i <= ci ? conf.color : 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(P + i * (seg + 12), y, seg, 16, 8); ctx.fill();
  }
  y += 16;

  // Note
  if (spec.note) {
    y += 40; ctx.fillStyle = '#7c8496'; ctx.font = `400 26px ${SANS}`; ctx.textBaseline = 'alphabetic';
    for (const l of wrap(ctx, spec.note, W - P * 2).slice(0, 3)) { ctx.fillText(l, P, y); y += 36; }
  }

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(P, H - 150, W - P * 2, 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff'; ctx.font = `800 30px ${SANS}`;
  ctx.fillText('Challenger IA', W / 2, H - 95);
  ctx.fillStyle = '#7c8496'; ctx.font = `500 24px ${SANS}`;
  ctx.fillText("L'IA qui muscle votre esprit critique", W / 2, H - 55);

  return cv;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res) => {
    const r = new FileReader();
    r.onloadend = () => res(String(r.result).split(',')[1]);
    r.readAsDataURL(blob);
  });
}

/** Génère l'image du verdict et la partage (natif : feuille de partage ; web : navigator.share ou téléchargement). */
export async function shareVerdict(spec: VerdictSpec): Promise<void> {
  const canvas = drawCard(spec);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  const filename = 'verdict-challenger-ia.png';

  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob);
    const w = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title: 'Fact-check Challenger IA', text: 'Vérifié avec Challenger IA', files: [w.uri] });
    return;
  }

  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Fact-check Challenger IA' });
    return;
  }
  // Fallback web : téléchargement
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
