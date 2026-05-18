-- ─────────────────────────────────────────────────────────────────────────────
-- Challenger IA — Schéma Supabase (à exécuter dans le SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────
-- Couvre :
--   • Crédits (user_credits, add_credits, deduct_one_credit)
--   • Abonnements (subscriptions)
--   • Rate-limit + quota chat (chat_usage, check_chat_quota)
--   • Daily challenges générés par cron (daily_challenges_cache)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Crédits ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_credits (
  user_id          text PRIMARY KEY,
  credits          int  NOT NULL DEFAULT 0,
  lifetime_credits int  NOT NULL DEFAULT 0,
  updated_at       timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION add_credits(p_user_id text, p_amount int)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_credits (user_id, credits, lifetime_credits)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET
    credits          = user_credits.credits + p_amount,
    lifetime_credits = user_credits.lifetime_credits + p_amount,
    updated_at       = now();
END;
$$;

CREATE OR REPLACE FUNCTION deduct_one_credit(p_user_id text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE user_credits
     SET credits    = GREATEST(0, credits - 1),
         updated_at = now()
   WHERE user_id = p_user_id AND credits >= 1;
END;
$$;

-- ─── Abonnements ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                text PRIMARY KEY,
  email                  text,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan                   text NOT NULL DEFAULT 'free',
  status                 text,
  current_period_end     timestamptz,
  updated_at             timestamptz DEFAULT now()
);

-- ─── Newsletter (existant) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscribers (
  email      text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- ─── Rate-limit + quota du chat ─────────────────────────────────────────────
-- Une ligne par utilisateur. Compteur quotidien + fenêtre glissante d'1 min.
CREATE TABLE IF NOT EXISTS chat_usage (
  user_id            text PRIMARY KEY,
  day                date        NOT NULL DEFAULT current_date,
  day_count          int         NOT NULL DEFAULT 0,
  minute_window      timestamptz NOT NULL DEFAULT now(),
  minute_count       int         NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- RPC atomique : vérifie rate limit + quota + crédits, et consomme.
-- Retourne JSON : { allowed: bool, reason?: text, plan: text, credits: int, day_count: int }
CREATE OR REPLACE FUNCTION check_chat_quota(
  p_user_id           text,
  p_cost              int,
  p_rate_limit_per_min int,
  p_free_daily_limit  int,
  p_pro_daily_limit   int
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_plan         text := 'free';
  v_credits      int  := 0;
  v_day_count    int  := 0;
  v_minute_count int  := 0;
  v_now          timestamptz := now();
  v_daily_limit  int;
BEGIN
  -- Plan
  SELECT plan INTO v_plan FROM subscriptions WHERE user_id = p_user_id;
  IF v_plan IS NULL THEN v_plan := 'free'; END IF;

  -- Crédits
  SELECT credits INTO v_credits FROM user_credits WHERE user_id = p_user_id;
  IF v_credits IS NULL THEN v_credits := 0; END IF;

  -- Crée la ligne usage si absente
  INSERT INTO chat_usage (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Reset compteur quotidien si nouveau jour
  UPDATE chat_usage
     SET day = current_date, day_count = 0, updated_at = v_now
   WHERE user_id = p_user_id AND day < current_date;

  -- Reset fenêtre minute si > 60s
  UPDATE chat_usage
     SET minute_window = v_now, minute_count = 0, updated_at = v_now
   WHERE user_id = p_user_id AND minute_window < v_now - interval '1 minute';

  -- Lit les compteurs actuels
  SELECT minute_count, day_count INTO v_minute_count, v_day_count
    FROM chat_usage WHERE user_id = p_user_id;

  -- Rate limit (toujours appliqué, Pro inclus)
  IF v_minute_count >= p_rate_limit_per_min THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'rate_limited',
      'plan', v_plan, 'credits', v_credits, 'day_count', v_day_count
    );
  END IF;

  -- Quota journalier selon plan
  v_daily_limit := CASE WHEN v_plan = 'pro' THEN p_pro_daily_limit ELSE p_free_daily_limit END;

  IF v_day_count >= v_daily_limit THEN
    -- Quota épuisé → tente la déduction de crédits
    IF v_credits < p_cost THEN
      RETURN jsonb_build_object(
        'allowed', false, 'reason', 'no_credits',
        'plan', v_plan, 'credits', v_credits, 'day_count', v_day_count
      );
    END IF;
    UPDATE user_credits SET credits = credits - p_cost, updated_at = v_now
     WHERE user_id = p_user_id;
    v_credits := v_credits - p_cost;
  END IF;

  -- Incrémente compteurs
  UPDATE chat_usage
     SET day_count    = day_count    + 1,
         minute_count = minute_count + 1,
         updated_at   = v_now
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'plan', v_plan, 'credits', v_credits, 'day_count', v_day_count + 1
  );
END;
$$;

-- ─── Daily challenges générés (cache pour cron) ─────────────────────────────
CREATE TABLE IF NOT EXISTS daily_challenges_cache (
  day        date PRIMARY KEY,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
