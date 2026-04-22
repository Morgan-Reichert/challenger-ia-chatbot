/**
 * Challenger IA — Sound effects via Web Audio API
 * Aucun fichier externe. Tous les sons sont générés algorithmiquement.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx || ctx.state === 'closed') {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function master(ac: AudioContext, vol = 0.18): GainNode {
  const g = ac.createGain();
  g.gain.value = vol;
  g.connect(ac.destination);
  return g;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tone(
  ac: AudioContext,
  dest: AudioNode,
  freq: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  gainStart = 0.8,
  gainEnd = 0,
) {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  env.gain.setValueAtTime(gainStart, startTime);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainEnd), startTime + duration);
  osc.connect(env);
  env.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

function noise(ac: AudioContext, dest: AudioNode, startTime: number, duration: number, vol = 0.3) {
  const bufSize = ac.sampleRate * duration;
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const env = ac.createGain();
  env.gain.setValueAtTime(vol, startTime);
  env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  src.connect(env);
  env.connect(dest);
  src.start(startTime);
}

// ── Sound library ─────────────────────────────────────────────────────────────

/** Message envoyé par l'utilisateur — whoosh ascendant */
export function playSend() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.15);
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.12);
  env.gain.setValueAtTime(0.6, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(env); env.connect(g);
  osc.start(t); osc.stop(t + 0.15);
}

/** Début du streaming IA — pop doux */
export function playReceive() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.12);
  tone(ac, g, 520, 'sine', t, 0.06, 0.5, 0);
  tone(ac, g, 780, 'sine', t + 0.05, 0.08, 0.3, 0);
}

/** Fin de la réponse IA — chime court */
export function playDone() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.13);
  tone(ac, g, 660, 'sine', t,       0.09, 0.5, 0);
  tone(ac, g, 880, 'sine', t + 0.07, 0.09, 0.4, 0);
  tone(ac, g, 1100,'sine', t + 0.14, 0.12, 0.3, 0);
}

/** Erreur — descente courte */
export function playError() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.14);
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.18);
  env.gain.setValueAtTime(0.4, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(env); env.connect(g);
  osc.start(t); osc.stop(t + 0.21);
}

/** Nouvelle conversation créée — ding léger */
export function playNewConv() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.1);
  tone(ac, g, 800,  'sine', t,       0.1, 0.4, 0);
  tone(ac, g, 1200, 'sine', t + 0.08, 0.12, 0.3, 0);
}

/** Commande slash — tick sec */
export function playSlash() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.08);
  noise(ac, g, t, 0.04, 0.25);
  tone(ac, g, 1400, 'square', t, 0.035, 0.2, 0);
}

/** Copier — click discret */
export function playCopy() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.09);
  noise(ac, g, t, 0.03, 0.2);
  tone(ac, g, 1100, 'sine', t, 0.06, 0.3, 0);
}

/** Suppression — pop descendant */
export function playDelete() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.1);
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, t);
  osc.frequency.exponentialRampToValueAtTime(220, t + 0.1);
  env.gain.setValueAtTime(0.4, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(env); env.connect(g);
  osc.start(t); osc.stop(t + 0.13);
}

/** Micro activé — bip on */
export function playMicOn() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.1);
  tone(ac, g, 600, 'sine', t,       0.06, 0.4, 0);
  tone(ac, g, 900, 'sine', t + 0.05, 0.07, 0.3, 0);
}

/** Micro désactivé — bip off */
export function playMicOff() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.1);
  tone(ac, g, 900, 'sine', t,       0.06, 0.4, 0);
  tone(ac, g, 600, 'sine', t + 0.05, 0.07, 0.3, 0);
}

/** Outil épinglé — double ding */
export function playPin() {
  const ac = getCtx(); if (!ac) return;
  const t = ac.currentTime;
  const g = master(ac, 0.1);
  tone(ac, g, 740,  'sine', t,        0.08, 0.4, 0);
  tone(ac, g, 1109, 'sine', t + 0.07, 0.1,  0.3, 0);
}
