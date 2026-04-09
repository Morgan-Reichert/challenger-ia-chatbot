import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // Crédits par montant (centimes) — doit correspondre aux prix Stripe
  const CREDITS_BY_AMOUNT = {
    199:  50,    // Starter  1,99€
    599:  200,   // Standard 5,99€
    2499: 1000,  // Boost    24,99€
  };

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;

      // Diagnostic : log pour Vercel
      console.log('[webhook] session.id:', session.id);
      console.log('[webhook] client_reference_id:', userId);
      console.log('[webhook] amount_total:', session.amount_total);
      console.log('[webhook] subscription:', session.subscription);

      if (!userId) {
        console.log('[webhook] SKIP: client_reference_id vide');
        return res.status(200).json({ received: true, skip: 'no_user_id' });
      }

      const subscriptionId = session.subscription;

      // ── Paiement unique → achat de crédits ──────────────────────────────
      if (!subscriptionId) {
        const credits = CREDITS_BY_AMOUNT[session.amount_total];
        if (!credits) {
          console.log('[webhook] SKIP: montant inconnu:', session.amount_total);
          return res.status(200).json({ received: true, skip: 'unknown_amount', amount: session.amount_total });
        }
        console.log('[webhook] Ajout crédits:', credits, 'pour', userId);
        const { error } = await supabase.rpc('add_credits', { p_user_id: userId, p_amount: credits });
        if (error) {
          console.error('[webhook] RPC error:', error.message);
          return res.status(200).json({ received: true, rpc_error: error.message });
        }
        console.log('[webhook] Crédits ajoutés avec succès');
        return res.status(200).json({ received: true, credits_added: credits, user: userId });
      }

      // ── Abonnement → plan Pro ────────────────────────────────────────────
      let periodEnd = null;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const ts = sub.current_period_end
          ?? sub.items?.data?.[0]?.current_period_end
          ?? null;
        if (ts) periodEnd = new Date(ts * 1000).toISOString();
      }

      await supabase.from('subscriptions').upsert({
        user_id: userId,
        email: session.customer_details?.email ?? null,
        stripe_customer_id: session.customer,
        stripe_subscription_id: subscriptionId,
        plan: 'pro',
        status: 'active',
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }

    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const isActive = sub.status === 'active' || sub.status === 'trialing';
      const ts = sub.current_period_end
        ?? sub.items?.data?.[0]?.current_period_end
        ?? null;
      await supabase.from('subscriptions')
        .update({
          plan: isActive ? 'pro' : 'free',
          status: sub.status,
          current_period_end: ts ? new Date(ts * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', sub.id);
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await supabase.from('subscriptions')
        .update({ plan: 'free', status: 'canceled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.id);
    }
  } catch (err) {
    console.error('Webhook processing error:', err.message, err.stack);
    return res.status(500).end();
  }

  return res.status(200).json({ received: true });
}
