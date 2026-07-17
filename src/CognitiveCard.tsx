import { useEffect, useState } from 'react';
import { Brain, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { loadCognitive, summarize, type Cognitive } from './cognitive';

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

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-[#5D7BFF]/10 flex items-center justify-center flex-shrink-0">
          <Brain className="w-4 h-4 text-[#5D7BFF]" />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)]">Profil cognitif</p>
          <p className="text-xs text-[var(--text-primary)]/50">Tes faiblesses de raisonnement récurrentes</p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--text-primary)]/40 mt-4">Chargement…</p>
      ) : !s ? (
        <p className="text-xs text-[var(--text-primary)]/50 mt-4 leading-relaxed">
          Débats avec Challenger : l'IA repère tes biais récurrents (généralisations, corrélation/causalité, appels à l'autorité…) et affichera ici ta progression.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
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

          <p className="text-[10px] text-[var(--text-primary)]/35">
            {s.totalMessages} message{s.totalMessages > 1 ? 's' : ''} analysé{s.totalMessages > 1 ? 's' : ''} · mis à jour en continu
          </p>
        </div>
      )}
    </div>
  );
}
