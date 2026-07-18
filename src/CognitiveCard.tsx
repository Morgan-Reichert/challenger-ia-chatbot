import { useEffect, useState } from 'react';
import { Brain, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { loadCognitive, summarize, rank, progression, type Cognitive } from './cognitive';

/** Carte "Profil cognitif" : faiblesses de raisonnement récurrentes + progression. */
export default function CognitiveCard({ userId }: { userId: string | null }) {
  const [data, setData] = useState<Cognitive | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    if (!userId) { setLoading(false); return; }
    loadCognitive(userId).then((d) => { if (on) { setData(d); setLoading(false); } });
    return () => { on = false; };
  }, [userId]);

  const s = summarize(data);
  const maxCount = s ? Math.max(...s.top.map((t) => t.count), 1) : 1;
  const maxStrength = s ? Math.max(...s.strengths.map((t) => t.count), 1) : 1;
  const r = rank(data?.totalMessages ?? 0);
  const prog = progression(data);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-[#5D7BFF]/10 flex items-center justify-center flex-shrink-0">
          <Brain className="w-4 h-4 text-[#5D7BFF]" />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)]">Profil cognitif</p>
          <p className="text-xs text-[var(--text-primary)]/50">Ton rang, tes forces & ce qui reste à travailler</p>
        </div>
      </div>

      {/* Rang (titre + progression) */}
      {!loading && (
        <div className="mt-4 flex items-center gap-3">
          <div className="text-3xl leading-none flex-shrink-0">{r.cur.emoji}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-[var(--text-primary)]">{r.cur.title}</p>
            <div className="h-1.5 rounded-full bg-[var(--text-primary)]/[0.08] overflow-hidden mt-1.5">
              <div className="h-full rounded-full bg-[#5D7BFF] transition-all" style={{ width: `${Math.round(r.progress * 100)}%` }} />
            </div>
            <p className="text-[10px] text-[var(--text-primary)]/40 mt-1">
              {r.next ? `Encore ${r.next.min - r.total} pour « ${r.next.title} »` : 'Rang maximal atteint 👑'}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-[var(--text-primary)]/40 mt-4">Chargement…</p>
      ) : !s ? (
        <p className="text-xs text-[var(--text-primary)]/50 mt-5 leading-relaxed border-t border-[var(--border)] pt-4">
          Débats avec Challenger : l'IA repère tes <span className="font-semibold text-emerald-600">points forts</span> (nuance, exigence de preuve, contre-exemples anticipés…) autant que tes biais récurrents — et tu montes en grade à mesure que ton esprit s'affûte.
        </p>
      ) : (
        <div className="mt-5 border-t border-[var(--border)] pt-4 space-y-4">
          {/* Trajectoire chiffrée — ce que l'utilisateur perdrait en repartant de zéro */}
          {prog && (
            <div className="rounded-xl bg-[var(--text-primary)]/[0.03] p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)]/40 mb-2">
                Ta trajectoire · {prog.semaines} semaines
              </p>
              <div className="flex items-end gap-3">
                <div>
                  <p className="text-[9px] text-[var(--text-primary)]/35">Au départ</p>
                  <p className="text-base font-black text-[var(--text-primary)]/50">{prog.debut.toFixed(1)}</p>
                </div>
                <div className="flex-1 border-b border-dashed border-[var(--text-primary)]/15 mb-2" />
                <div className="text-right">
                  <p className="text-[9px] text-[var(--text-primary)]/35">Aujourd'hui</p>
                  <p
                    className="text-base font-black"
                    style={{ color: prog.variationPct < 0 ? '#10B981' : prog.variationPct > 0 ? '#F59E0B' : undefined }}
                  >
                    {prog.actuel.toFixed(1)}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-[var(--text-primary)]/45 mt-2 leading-relaxed">
                failles par message ·{' '}
                {prog.variationPct < 0
                  ? <span className="font-semibold text-emerald-600">{Math.abs(prog.variationPct)} % de moins qu'à tes débuts</span>
                  : prog.variationPct > 0
                    ? <span className="font-semibold text-orange-600">{prog.variationPct} % de plus qu'à tes débuts</span>
                    : <span>stable depuis tes débuts</span>}
              </p>
            </div>
          )}

          {s.trend && (
            <div className="flex items-center gap-2 text-xs">
              {s.trend === 'down' ? (
                <><TrendingDown className="w-4 h-4 text-emerald-500" /><span className="text-emerald-600 font-semibold">En progrès — moins de failles récemment 💪</span></>
              ) : s.trend === 'up' ? (
                <><TrendingUp className="w-4 h-4 text-orange-500" /><span className="text-orange-600 font-semibold">Vigilance — plus de failles ces derniers temps</span></>
              ) : (
                <><Minus className="w-4 h-4 text-[var(--text-primary)]/40" /><span className="text-[var(--text-primary)]/50">Niveau stable</span></>
              )}
            </div>
          )}

          {/* Points forts — reconnus seulement quand ils sont substantiels */}
          {s.strengths.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600/70 mb-2">Tes points forts</p>
              <div className="space-y-2.5">
                {s.strengths.map((t) => (
                  <div key={t.tag}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[var(--text-primary)]/80 font-medium">{t.label}</span>
                      <span className="text-[var(--text-primary)]/40">{t.count}×</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--text-primary)]/[0.08] overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((t.count / maxStrength) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.top.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#5D7BFF]/70 mb-2">À travailler</p>
              <div className="space-y-2.5">
                {s.top.map((t) => (
                  <div key={t.tag}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[var(--text-primary)]/80 font-medium">{t.label}</span>
                      <span className="text-[var(--text-primary)]/40">{t.count}×</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--text-primary)]/[0.08] overflow-hidden">
                      <div className="h-full rounded-full bg-[#5D7BFF]" style={{ width: `${Math.round((t.count / maxCount) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-[var(--text-primary)]/35">
            {s.totalMessages} message{s.totalMessages > 1 ? 's' : ''} analysé{s.totalMessages > 1 ? 's' : ''} · mis à jour en continu
          </p>
        </div>
      )}
    </div>
  );
}
