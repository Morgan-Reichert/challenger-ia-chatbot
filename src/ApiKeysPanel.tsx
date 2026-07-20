/**
 * Gestion des clés d'API depuis les réglages.
 *
 * La clé en clair n'est affichée qu'à sa création : elle n'est jamais stockée
 * en base, seule son empreinte l'est. L'interface le dit explicitement, faute
 * de quoi l'utilisateur croirait pouvoir la retrouver plus tard.
 */
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Copy, Check, Loader2, AlertTriangle } from 'lucide-react';
import { apiFetch } from './apiClient';

type Cle = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  total_calls: number;
};

export default function ApiKeysPanel({ userId }: { userId: string | null }) {
  const [cles, setCles] = useState<Cle[]>([]);
  const [chargement, setChargement] = useState(true);
  const [nom, setNom] = useState('');
  const [creation, setCreation] = useState(false);
  const [nouvelleCle, setNouvelleCle] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    if (!userId) { setChargement(false); return; }
    try {
      const res = await apiFetch('/api/keys', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setCles(d.cles ?? []);
      }
    } catch { /* silencieux : l'absence de clés n'est pas une erreur bloquante */ }
    setChargement(false);
  }, [userId]);

  useEffect(() => { void charger(); }, [charger]);

  const creer = async () => {
    setCreation(true);
    setErreur('');
    try {
      const res = await apiFetch('/api/keys', {
        method: 'POST',
        body: JSON.stringify({ name: nom || 'Clé sans nom' }),
      });
      const d = await res.json();
      if (!res.ok) { setErreur(d?.message ?? 'La création a échoué.'); }
      else { setNouvelleCle(d.cle); setNom(''); void charger(); }
    } catch (e) {
      setErreur(String(e));
    }
    setCreation(false);
  };

  const revoquer = async (id: string) => {
    await apiFetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    void charger();
  };

  if (!userId) return null;

  const actives = cles.filter((c) => !c.revoked_at);

  return (
    <div className="border-2 border-[#141414]/10">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b-2 border-[#141414]/10">
        <div className="w-8 h-8 flex items-center justify-center"
             style={{ background: '#8B5CF612', border: '1.5px solid #8B5CF630' }}>
          <KeyRound className="w-4 h-4 text-[#8B5CF6]" />
        </div>
        <h2 className="text-[11px] font-black uppercase tracking-widest text-[#8B5CF6]">Clés d&apos;API</h2>
      </div>

      <div className="px-5 py-4 space-y-4">
        <p className="text-[10px] text-[#141414]/50 leading-relaxed">
          Utilisez l&apos;API Challenger IA depuis vos propres applications. Les appels
          débitent <strong>le même solde de crédits</strong> que l&apos;application —
          un seul portefeuille, deux usages.
        </p>

        {nouvelleCle && (
          <div className="border-2 border-[#8B5CF6] bg-[#8B5CF6]/[0.04] p-4">
            <div className="flex gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-[#8B5CF6] flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-[#141414]/70 leading-relaxed">
                <strong>Copiez cette clé maintenant.</strong> Elle ne sera plus jamais
                affichée : nous n&apos;en conservons qu&apos;une empreinte, pas la clé.
              </p>
            </div>
            <div className="flex gap-2">
              <code className="flex-1 bg-white border border-[#141414]/15 px-3 py-2 text-[10px] font-mono break-all">
                {nouvelleCle}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(nouvelleCle);
                  setCopie(true);
                  setTimeout(() => setCopie(false), 2000);
                }}
                className="flex-shrink-0 px-3 bg-[#8B5CF6] text-white"
                aria-label="Copier la clé"
              >
                {copie ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              onClick={() => setNouvelleCle(null)}
              className="mt-3 text-[9px] font-black uppercase tracking-widest text-[#141414]/40 hover:text-[#141414]/70"
            >
              J&apos;ai copié la clé
            </button>
          </div>
        )}

        {/* Création */}
        <div className="flex gap-2">
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom de la clé (ex. Production)"
            maxLength={60}
            className="flex-1 px-3 py-2 text-[11px] border-2 border-[#141414]/10 focus:outline-none focus:border-[#8B5CF6]"
          />
          <button
            onClick={creer}
            disabled={creation}
            className="flex items-center gap-2 px-4 py-2 border-2 border-[#8B5CF6]/40 text-[#8B5CF6] text-[10px] font-black uppercase tracking-widest hover:bg-[#8B5CF6]/10 transition-all disabled:opacity-40"
          >
            {creation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Créer
          </button>
        </div>
        {erreur && <p className="text-[10px] font-bold text-red-600">{erreur}</p>}

        {/* Liste */}
        {chargement ? (
          <p className="text-[10px] text-[#141414]/40">Chargement…</p>
        ) : actives.length === 0 ? (
          <p className="text-[10px] text-[#141414]/35 italic">Aucune clé active.</p>
        ) : (
          <div className="space-y-1.5">
            {actives.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 border border-[#141414]/10 bg-[#141414]/[0.02]">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-[#141414] truncate">{c.name}</p>
                  <p className="text-[9px] font-mono text-[#141414]/40">{c.key_prefix}…</p>
                  <p className="text-[9px] text-[#141414]/35">
                    {c.total_calls} appel{c.total_calls > 1 ? 's' : ''}
                    {c.last_used_at
                      ? ` · dernier le ${new Date(c.last_used_at).toLocaleDateString('fr-FR')}`
                      : ' · jamais utilisée'}
                  </p>
                </div>
                <button
                  onClick={() => revoquer(c.id)}
                  className="flex-shrink-0 text-[9px] font-black uppercase tracking-widest text-red-600 hover:text-red-700"
                >
                  Révoquer
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-[#141414]/45 leading-relaxed border-t border-[#141414]/10 pt-3">
          Documentation et exemples :{' '}
          <a
            href="https://challenger-ia-nine.vercel.app/api-developpeurs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#8B5CF6] underline underline-offset-2"
          >
            challengeria.fr/api-developpeurs
          </a>
        </p>
      </div>
    </div>
  );
}
