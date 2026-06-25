import { createClient } from '@supabase/supabase-js';
import { apiFetch } from './apiClient';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_ENABLED = !!(url && key);

export const supabase = SUPABASE_ENABLED ? createClient(url!, key!) : null;

export type Plan = 'free' | 'pro';

// ─── État compte (crédits + plan) ───────────────────────────────────────────────
// SÉCURITÉ : crédits & abonnement sont lus/écrits UNIQUEMENT via le serveur
// (/api/credits, identifié par le token Firebase). Le client n'accède plus
// jamais directement aux tables user_credits / subscriptions.
async function fetchAccount(): Promise<{ credits: number; lifetime: number; plan: Plan }> {
  try {
    const res = await apiFetch('/api/credits', { method: 'GET' });
    if (!res.ok) return { credits: 0, lifetime: 0, plan: 'free' };
    const d = await res.json();
    return { credits: d.credits ?? 0, lifetime: d.lifetime ?? 0, plan: d.plan === 'pro' ? 'pro' : 'free' };
  } catch {
    return { credits: 0, lifetime: 0, plan: 'free' };
  }
}

/**
 * Lit le plan d'abonnement de l'utilisateur (via le serveur).
 * Retourne 'free' par défaut.
 */
export async function getSubscription(_userId: string): Promise<Plan> {
  return (await fetchAccount()).plan;
}

/**
 * Inscrit un email dans la table `subscribers`.
 */
export async function subscribeToNewsletter(email: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('subscribers').insert({ email });
  } catch {
    // silent — doublon ou erreur réseau
  }
}

// ─── Crédits ──────────────────────────────────────────────────────────────────

/**
 * Lit le solde de crédits de l'utilisateur (restants + total acheté).
 * Table Supabase : user_credits (user_id text PK, credits int, lifetime_credits int, updated_at timestamptz)
 */
export async function getUserCredits(_userId: string): Promise<{ credits: number; lifetime: number }> {
  const a = await fetchAccount();
  return { credits: a.credits, lifetime: a.lifetime };
}

/**
 * Déduit 1 crédit (via le serveur, sur le compte de l'utilisateur authentifié).
 * Retourne true si succès.
 */
export async function deductOneCredit(_userId: string): Promise<boolean> {
  try {
    const res = await apiFetch('/api/credits', { method: 'POST', body: JSON.stringify({ action: 'spend' }) });
    if (!res.ok) return false;
    return !!(await res.json()).ok;
  } catch {
    return false;
  }
}

/**
 * Réclame la récompense du défi quotidien (+1 crédit, max 1/jour, garanti serveur).
 * `amount` est ignoré : le serveur fixe la récompense. Retourne true si crédité.
 */
export async function addCredits(_userId: string, _amount: number): Promise<boolean> {
  try {
    const res = await apiFetch('/api/credits', { method: 'POST', body: JSON.stringify({ action: 'claim' }) });
    if (!res.ok) return false;
    return !!(await res.json()).credited;
  } catch {
    return false;
  }
}

/**
 * Obtient les liens Stripe pour les packs de crédits (configurés en env vars).
 */
export const CREDIT_PACKS = [
  { id: 'pack_50',   label: 'Starter',  credits: 50,   price: '1,99 €',  envKey: 'VITE_STRIPE_CREDITS_50' },
  { id: 'pack_200',  label: 'Standard', credits: 200,  price: '5,99 €',  envKey: 'VITE_STRIPE_CREDITS_200' },
  { id: 'pack_1000', label: 'Boost',    credits: 1000, price: '24,99 €', envKey: 'VITE_STRIPE_CREDITS_1000' },
] as const;
