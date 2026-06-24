/**
 * SourcesPanel — affichage cliquable des sources web d'une réponse fact-check.
 * Les sources arrivent du serveur (api/chat.js) via l'événement SSE `cia_meta`,
 * déjà numérotées et classées par fiabilité.
 *
 * - SourceRef          : type partagé (aussi porté par Message.sources)
 * - SourcesPanel       : panneau repliable, une carte par source, ancre #cia-src-n
 * - CitationChip       : la puce [n] cliquable dans le texte → scrolle vers la carte
 * - linkifyCitations   : transforme les [n] du texte en liens #cia-src-n
 */
import React, { useState } from 'react';

export type SourceTier = 'high' | 'medium' | 'low' | 'unknown';

export interface SourceRef {
  n: number;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  date?: string | null;
  tier: SourceTier;
  tierLabel?: string;
}

const TIER_UI: Record<SourceTier, { color: string; label: string }> = {
  high:    { color: '#10B981', label: 'Fiable' },
  medium:  { color: '#FBBF24', label: 'Modérée' },
  low:     { color: '#EF4444', label: 'Peu fiable' },
  unknown: { color: '#9CA3AF', label: 'Non vérifiée' },
};

/** Transforme les `[n]` (n valide) en liens markdown `[n](#cia-src-n)`. */
export function linkifyCitations(text: string, count: number): string {
  if (count <= 0) return text;
  return text.replace(/\[(\d{1,2})\]/g, (m, num) => {
    const i = parseInt(num, 10);
    return i >= 1 && i <= count ? `[${i}](#cia-src-${i})` : m;
  });
}

function flash(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.style.transition = 'background-color 0.3s';
  const prev = el.style.backgroundColor;
  el.style.backgroundColor = 'rgba(93,123,255,0.25)';
  setTimeout(() => { el.style.backgroundColor = prev; }, 1100);
}

export function CitationChip({ targetId, children }: { targetId: string; children?: React.ReactNode }) {
  return (
    <sup
      role="link"
      tabIndex={0}
      onClick={(e) => { e.preventDefault(); flash(targetId); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); flash(targetId); } }}
      className="cursor-pointer text-[#5D7BFF] font-black px-0.5 hover:text-[#8AA0FF] align-super text-[0.65em]"
      title="Voir la source"
    >
      [{children}]
    </sup>
  );
}

export function SourcesPanel({ sources }: { sources: SourceRef[] }) {
  const [open, setOpen] = useState(true);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 border border-white/15 bg-black/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-[10px]">🌐</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-white/60">
          Sources · {sources.length}
        </span>
        <span className="ml-auto text-[9px] text-white/40">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="divide-y divide-white/8">
          {sources.map((s) => {
            const ui = TIER_UI[s.tier] ?? TIER_UI.unknown;
            return (
              <div key={s.n} id={`cia-src-${s.n}`} className="px-3 py-2 scroll-mt-4">
                <div className="flex items-start gap-2">
                  <span className="text-[9px] font-black text-white/40 mt-0.5 flex-shrink-0">[{s.n}]</span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-white/90 hover:text-[#8AA0FF] leading-snug font-medium break-words"
                    >
                      {s.title}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wide" style={{ color: ui.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: ui.color }} />
                        {ui.label}
                      </span>
                      <span className="text-[8px] text-white/35">{s.domain}</span>
                      {s.date && <span className="text-[8px] text-white/25">· {s.date}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
