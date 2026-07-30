/**
 * Signalement d'un problème et journal des versions.
 *
 * Le signalement joint automatiquement la version, le build et le contexte
 * technique : réclamés à l'utilisateur, ces éléments sont presque toujours
 * absents ou approximatifs, et un rapport sans eux n'est pas exploitable.
 *
 * Aucun contenu de conversation n'est joint. Le diagnostic ne le justifie pas,
 * et l'envoyer sans demande explicite trahirait la confidentialité des
 * échanges.
 */
import { useState } from 'react';
import { LifeBuoy, History, Copy, Check, Mail, BookOpen, ArrowUpRight } from 'lucide-react';
import { JOURNAL } from './versions';

const CONTACT = 'stariax.dev.a@outlook.com';
// Centre d'aide STARIAX : FAQ, tickets, demandes et suivi des signalements.
const AIDE_URL = 'https://stariax.tech/help';

function contexteTechnique(): string {
  const l: string[] = [];
  l.push(`Version : ${__APP_VERSION__}`);
  l.push(`Build : ${__APP_BUILD__} (${__APP_BUILD_DATE__})`);
  if (typeof navigator !== 'undefined') {
    l.push(`Navigateur : ${navigator.userAgent}`);
    l.push(`Langue : ${navigator.language}`);
  }
  if (typeof window !== 'undefined') {
    l.push(`Fenêtre : ${window.innerWidth}×${window.innerHeight}`);
  }
  l.push(`Horodatage : ${new Date().toISOString()}`);
  return l.join('\n');
}

export default function SupportPanel() {
  const [description, setDescription] = useState('');
  const [copie, setCopie] = useState(false);

  const corps = () =>
    `${description.trim() || '(décrivez ici ce qui s’est passé)'}\n\n`
    + `— — — — — — — — — — — — — —\n`
    + `Contexte technique (ne pas supprimer) :\n${contexteTechnique()}`;

  const lienMail =
    `mailto:${CONTACT}`
    + `?subject=${encodeURIComponent(`Challenger IA — signalement (${__APP_VERSION__})`)}`
    + `&body=${encodeURIComponent(corps())}`;

  return (
    <div className="space-y-4">

      {/* ── Centre d'aide STARIAX ──────────────────────────────────────────── */}
      <a
        href={AIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group block border-2 border-[#10B981]/25 bg-[#10B981]/[0.04] hover:border-[#10B981]/50 hover:bg-[#10B981]/[0.07] transition-colors"
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center"
               style={{ background: '#10B98115', border: '1.5px solid #10B98130' }}>
            <BookOpen className="w-4 h-4 text-[#10B981]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#10B981]">Centre d&apos;aide</h2>
            <p className="mt-0.5 text-[10px] text-[#141414]/50 leading-relaxed">
              FAQ, tickets, demandes et suivi des signalements sur STARIAX.
            </p>
          </div>
          <ArrowUpRight className="w-4 h-4 flex-shrink-0 text-[#10B981]/50 group-hover:text-[#10B981] transition-colors" />
        </div>
      </a>

      {/* ── Signaler un problème ───────────────────────────────────────────── */}
      <div className="border-2 border-[#141414]/10 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
          <div className="w-8 h-8 flex items-center justify-center"
               style={{ background: '#EF444412', border: '1.5px solid #EF444430' }}>
            <LifeBuoy className="w-4 h-4 text-[#EF4444]" />
          </div>
          <h2 className="text-[11px] font-black uppercase tracking-widest text-[#EF4444]">Signaler un problème</h2>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-[10px] text-[#141414]/45 leading-relaxed">
            Décrivez ce que vous faisiez et ce qui s&apos;est passé. La version et le
            contexte technique sont joints automatiquement.
            <strong> Aucun contenu de conversation n&apos;est transmis.</strong>
          </p>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Ex. : en cliquant sur « Exporter en PDF », rien ne se passe et la page se fige."
            className="w-full px-3 py-2.5 text-[11px] border-2 border-[#141414]/10 focus:outline-none focus:border-[#EF4444] resize-none leading-relaxed"
          />

          <div className="flex flex-wrap gap-2">
            <a
              href={lienMail}
              className="flex items-center gap-2 px-4 py-2 bg-[#EF4444] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#dc2626] transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              Ouvrir dans ma messagerie
            </a>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(corps());
                setCopie(true);
                setTimeout(() => setCopie(false), 2000);
              }}
              className="flex items-center gap-2 px-4 py-2 border-2 border-[#141414]/15 text-[#141414]/60 text-[10px] font-black uppercase tracking-widest hover:border-[#141414]/35 transition-colors"
            >
              {copie ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copie ? 'Copié' : 'Copier le rapport'}
            </button>
          </div>

          <details className="border-t border-[#141414]/8 pt-3">
            <summary className="text-[9px] font-black uppercase tracking-widest text-[#141414]/35 cursor-pointer hover:text-[#141414]/60">
              Voir ce qui sera transmis
            </summary>
            <pre className="mt-2 p-3 bg-[#141414]/[0.03] border border-[#141414]/10 text-[9px] font-mono text-[#141414]/55 whitespace-pre-wrap break-all">
              {contexteTechnique()}
            </pre>
          </details>
        </div>
      </div>

      {/* ── Journal des versions ───────────────────────────────────────────── */}
      <div className="border-2 border-[#141414]/10 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
          <div className="w-8 h-8 flex items-center justify-center"
               style={{ background: '#5D7BFF12', border: '1.5px solid #5D7BFF30' }}>
            <History className="w-4 h-4 text-[#5D7BFF]" />
          </div>
          <h2 className="text-[11px] font-black uppercase tracking-widest text-[#5D7BFF]">Nouveautés</h2>
        </div>

        <div className="px-5 py-4 space-y-5">
          {JOURNAL.map((v) => (
            <div key={v.version} className="border-l-2 border-[#5D7BFF]/25 pl-4">
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-[11px] font-black text-[#141414]">{v.titre}</p>
                <span className="text-[9px] font-mono text-[#141414]/35">
                  {v.version} · {new Date(v.date).toLocaleDateString('fr-FR')}
                </span>
                {v.version === __APP_VERSION__ && (
                  <span className="text-[8px] font-black uppercase tracking-widest text-[#10B981]">
                    Version installée
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {v.changements.map((c) => (
                  <li key={c} className="text-[10px] text-[#141414]/55 leading-relaxed flex gap-2">
                    <span className="text-[#5D7BFF]/40 flex-shrink-0">—</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
