/**
 * Rate-limit + quota + déduction de crédits — atomique côté Supabase.
 *
 * Si Supabase n'est pas configuré côté serveur (VITE_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY), le module passe en `skipped:true` et n'applique
 * aucun contrôle (utile en local).
 *
 * Limites par défaut — peuvent être surchargées via env :
 *  - CHAT_RATE_LIMIT_PER_MIN  (défaut 30)
 *  - CHAT_FREE_DAILY_LIMIT    (défaut 20)
 *  - CHAT_PRO_DAILY_LIMIT     (défaut 150)
 *
 * Pré-requis Supabase : exécuter `supabase/schema.sql` (table chat_usage +
 * fonction RPC check_chat_quota).
 */
import { createClient } from '@supabase/supabase-js';

let _client = null;

function getSupabase() {
  if (_client) return _client;
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function isQuotaEnforced() {
  return !!getSupabase();
}

/**
 * Vérifie quota + rate limit + crédits pour `uid` et consomme `cost` crédits si
 * besoin. Retourne `{ allowed, reason?, plan?, credits?, skipped? }`.
 *
 * Codes `reason` possibles : 'rate_limited' | 'no_credits' | 'quota_error'.
 */
export async function checkAndConsumeQuota(uid, cost = 1) {
  const supa = getSupabase();
  if (!supa) return { allowed: true, skipped: true };
  if (!uid) return { allowed: false, reason: 'quota_error' };

  const rateLimit = Number(process.env.CHAT_RATE_LIMIT_PER_MIN ?? 30);
  const freeLimit = Number(process.env.CHAT_FREE_DAILY_LIMIT  ?? 20);
  const proLimit  = Number(process.env.CHAT_PRO_DAILY_LIMIT   ?? 150);

  try {
    const { data, error } = await supa.rpc('check_chat_quota', {
      p_user_id: uid,
      p_cost: cost,
      p_rate_limit_per_min: rateLimit,
      p_free_daily_limit: freeLimit,
      p_pro_daily_limit: proLimit,
    });
    if (error) {
      console.error('[quota] RPC error:', error.message);
      return { allowed: false, reason: 'quota_error' };
    }
    return data ?? { allowed: false, reason: 'quota_error' };
  } catch (e) {
    console.error('[quota] exception:', e?.message);
    return { allowed: false, reason: 'quota_error' };
  }
}
