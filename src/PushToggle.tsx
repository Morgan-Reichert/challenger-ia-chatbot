import { useEffect, useState } from 'react';
import { Bell, BellOff, Check } from 'lucide-react';
import { isPushSupported, enablePush, pushPermission } from './push';

/** Carte d'activation des notifications push (rendue seulement si supporté). */
export default function PushToggle() {
  const [perm, setPerm] = useState<string>('default');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPerm(pushPermission()); }, []);

  if (!isPushSupported()) return null;

  const granted = perm === 'granted';
  const denied = perm === 'denied';

  return (
    <div className="border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-[#5D7BFF]/10 flex items-center justify-center flex-shrink-0">
        {granted ? <Bell className="w-4 h-4 text-[#5D7BFF]" /> : <BellOff className="w-4 h-4 text-[#5D7BFF]" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--text-primary)]">Notifications</p>
        <p className="text-xs text-[var(--text-primary)]/50 leading-snug">
          {denied
            ? 'Bloquées — autorisez-les dans les réglages du navigateur.'
            : 'Nouveautés, rappels et fin de tâche.'}
        </p>
      </div>
      {granted ? (
        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-500 flex-shrink-0">
          <Check className="w-3.5 h-3.5" /> Activées
        </span>
      ) : (
        <button
          onClick={async () => {
            setBusy(true);
            await enablePush();
            setPerm(pushPermission());
            setBusy(false);
          }}
          disabled={busy || denied}
          className="px-3 py-2 rounded-lg bg-[#5D7BFF] text-white text-[11px] font-bold disabled:opacity-50 flex-shrink-0 transition-colors hover:bg-[#4a68e8]"
        >
          {busy ? '…' : 'Activer'}
        </button>
      )}
    </div>
  );
}
