import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_ENABLED = !!(url && key);

export const supabase = SUPABASE_ENABLED ? createClient(url!, key!) : null;

/**
 * Inscrit un email dans la table `subscribers`.
 * Silencieux en cas d'erreur (ex : email déjà présent).
 */
export async function subscribeToNewsletter(email: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('subscribers').insert({ email });
  } catch {
    // silent — doublon ou erreur réseau
  }
}
