import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { VerdictSpec } from './viz/vizParse';

// Métadonnées (alignées sur le composant Verdict — mêmes anti-confusions).
// Le vert/rouge ne vit QUE sur l'axe FAIT. Consensus & Confiance sont neutres.
const FACT: Record<string, { label: string; color: string }> = {
  vrai: { label: 'Vrai', color: '#10B981' },
  probable_vrai: { label: 'Probablement vrai', color: '#34D399' },
  inconnu: { label: 'Inconnu', color: '#9CA3AF' },
  non_verifie: { label: 'Non vérifié', color: '#6B7280' },
  inconcluant: { label: 'Inconcluant', color: '#FBBF24' },
  probable_faux: { label: 'Probablement faux', color: '#F97316' },
  faux: { label: 'Faux', color: '#EF4444' },
};
const FACT_PHRASE: Record<string, string> = {
  vrai: 'Cette affirmation est exacte.',
  probable_vrai: 'Cette affirmation est probablement exacte.',
  inconnu: 'Impossible de trancher avec les éléments disponibles.',
  non_verifie: 'Non vérifié, faute de sources fiables.',
  inconcluant: 'Les éléments ne permettent pas de trancher.',
  probable_faux: 'Cette affirmation est probablement fausse.',
  faux: 'Cette affirmation est fausse.',
};
const RISK: Record<string, { label: string; color: string }> = {
  safe: { label: 'Aucun risque notable', color: '#64748B' }, faible: { label: 'Risque faible', color: '#F59E0B' },
  modere: { label: 'Risque modéré', color: '#FBBF24' }, dangereux: { label: 'Dangereux', color: '#F97316' },
  critique: { label: 'Critique', color: '#EF4444' },
};
const CONSENSUS: Record<string, { label: string; color: string }> = {
  fort: { label: 'Consensus fort', color: '#6366F1' }, modere: { label: 'Consensus modéré', color: '#818CF8' },
  debattu: { label: 'Sujet débattu', color: '#94A3B8' }, controverse: { label: 'Sujet controversé', color: '#94A3B8' },
  marginal: { label: 'Position marginale', color: '#64748B' },
};
const CONF = [
  { band: 'speculatif', label: 'Spéculatif', color: '#CBD5E1' },
  { band: 'faible', label: 'Faible', color: '#94A3B8' },
  { band: 'plausible', label: 'Plausible', color: '#60A5FA' },
  { band: 'eleve', label: 'Élevé', color: '#3B82F6' },
  { band: 'quasi_certain', label: 'Quasi-certain', color: '#2563EB' },
];

/** Charge une image (logo). Renvoie null si indisponible → repli texte. */
function chargerImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

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
async function drawCard(spec: VerdictSpec): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1350, P = 90, BRAND = '#5D7BFF';
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  // Fond
  ctx.fillStyle = '#14161f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = BRAND; ctx.fillRect(0, 0, W, 10); // liseré haut

  ctx.textAlign = 'left';
  let y = P;
  // Marque — LOGO (image) au lieu du texte. Repli texte si l'image manque.
  const logo = await chargerImage('/logocompletblanc.png');
  if (logo && logo.naturalWidth > 0) {
    const h = 64, w = logo.naturalWidth * (h / logo.naturalHeight);
    ctx.drawImage(logo, P, y, Math.min(w, W - P * 2), h);
    y += h + 12;
  } else {
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = BRAND; ctx.font = `800 46px ${SANS}`;
    ctx.fillText('CHALLENGER IA', P, y + 46); y += 62;
  }
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#7c8496'; ctx.font = `700 22px ${SANS}`;
  ctx.fillText('F A C T - C H E C K', P, y + 20); y += 66;

  // Claim
  if (spec.claim) {
    ctx.fillStyle = '#e9ebf2'; ctx.font = `600 44px ${SANS}`;
    const lines = wrap(ctx, `« ${spec.claim} »`, W - P * 2).slice(0, 4);
    for (const l of lines) { ctx.fillText(l, P, y + 44); y += 58; }
    y += 26;
  }

  // FAIT — bannière dominante (seul axe vert=vrai / rouge=faux).
  const f = FACT[spec.fact] ?? FACT.non_verifie;
  const phrase = FACT_PHRASE[spec.fact] ?? '';
  const bannerH = phrase ? 152 : 96;
  ctx.fillStyle = f.color + '1A'; ctx.strokeStyle = f.color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(P, y, W - P * 2, bannerH, 18); ctx.fill(); ctx.stroke();
  ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(P + 40, y + 52, 12, 0, Math.PI * 2); ctx.fill();
  ctx.textBaseline = 'middle'; ctx.fillStyle = f.color; ctx.font = `800 52px ${SANS}`;
  ctx.fillText(f.label.toUpperCase(), P + 70, y + 54);
  if (phrase) {
    ctx.font = `600 32px ${SANS}`;
    ctx.fillText(phrase, P + 40, y + 112);
  }
  ctx.textBaseline = 'alphabetic';
  y += bannerH + 44;

  // Solidité & contexte — axes NEUTRES (indigo/bleu), jamais « validation ».
  const r = RISK[spec.risk] ?? RISK.safe;
  const c = CONSENSUS[spec.consensus] ?? CONSENSUS.debattu;
  ctx.fillStyle = '#6b7180'; ctx.font = `800 22px ${SANS}`;
  ctx.fillText('SOLIDITÉ & CONTEXTE DU VERDICT', P, y); y += 34;
  const rows: [string, { label: string; color: string }][] = [['Consensus', c], ['Risque', r]];
  for (const [lab, m] of rows) {
    ctx.fillStyle = '#8a90a2'; ctx.font = `800 24px ${SANS}`; ctx.textBaseline = 'middle';
    ctx.fillText(lab.toUpperCase(), P, y + 26);
    pill(ctx, P + 250, y, m.label, m.color);
    ctx.textBaseline = 'alphabetic';
    y += 74;
  }

  // Confiance — bande d'intensité NEUTRE (bleu = solidité des preuves).
  y += 14;
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
  y += 34;

  // Clarification anti-confusion.
  ctx.fillStyle = '#6b7180'; ctx.font = `400 23px ${SANS}`; ctx.textBaseline = 'alphabetic';
  for (const l of wrap(ctx, 'Consensus & confiance mesurent la solidité de ce verdict, pas si l\'opinion est validée.', W - P * 2).slice(0, 2)) {
    ctx.fillText(l, P, y); y += 31;
  }

  // Note
  if (spec.note) {
    y += 16; ctx.fillStyle = '#7c8496'; ctx.font = `400 26px ${SANS}`;
    for (const l of wrap(ctx, spec.note, W - P * 2).slice(0, 2)) { ctx.fillText(l, P, y); y += 36; }
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
  const canvas = await drawCard(spec);
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
