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
