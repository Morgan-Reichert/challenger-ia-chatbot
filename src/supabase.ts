import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_ENABLED = !!(url && key);

export const supabase = SUPABASE_ENABLED ? createClient(url!, key!) : null;

export type Plan = 'free' | 'pro';

/**
 * Lit le plan d'abonnement de l'utilisateur depuis Supabase.
 * Retourne 'free' si aucune entrée ou Supabase non configuré.
 */
export async function getSubscription(userId: string): Promise<Plan> {
  if (!supabase) return 'free';
  try {
    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .single();

    if (!data) return 'free';
    if (data.plan === 'pro' && (data.status === 'active' || data.status === 'trialing')) return 'pro';
    // Période encore valide même si annulée
    if (data.plan === 'pro' && data.current_period_end) {
      if (new Date(data.current_period_end) > new Date()) return 'pro';
    }
    return 'free';
  } catch {
    return 'free';
  }
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
export async function getUserCredits(userId: string): Promise<{ credits: number; lifetime: number }> {
  if (!supabase) return { credits: 0, lifetime: 0 };
  try {
    const { data } = await supabase
      .from('user_credits')
      .select('credits, lifetime_credits')
      .eq('user_id', userId)
      .single();
    return {
      credits:  data?.credits          ?? 0,
      lifetime: data?.lifetime_credits ?? 0,
    };
  } catch {
    return { credits: 0, lifetime: 0 };
  }
}

/**
 * Déduit 1 crédit. Retourne true si succès.
 * Utilise une fonction RPC `deduct_one_credit(p_user_id text)` côté Supabase
 * ou fait un UPDATE direct (avec vérification >= 1).
 */
export async function deductOneCredit(userId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    // Appel RPC si disponible, sinon UPDATE direct
    const { error } = await supabase.rpc('deduct_one_credit', { p_user_id: userId });
    return !error;
  } catch {
    // Fallback : UPDATE direct
    try {
      const { error } = await supabase
        .from('user_credits')
        .update({ credits: supabase.rpc('greatest', { a: 0, b: -1 }) })
        .eq('user_id', userId)
        .gte('credits', 1);
      return !error;
    } catch {
      return false;
    }
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
