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

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      if (!userId) return res.status(200).json({ received: true });

      const subscriptionId = session.subscription;
      let periodEnd = null;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        periodEnd = new Date(sub.current_period_end * 1000).toISOString();
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
      await supabase.from('subscriptions')
        .update({
          plan: isActive ? 'pro' : 'free',
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
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
    console.error('Webhook processing error:', err);
    return res.status(500).end();
  }

  return res.status(200).json({ received: true });
}
