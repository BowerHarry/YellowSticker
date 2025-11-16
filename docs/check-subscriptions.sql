-- Check subscriptions and users
-- Run this in Supabase SQL Editor to diagnose notification issues

-- 1. Check all subscriptions
SELECT 
  s.id,
  s.user_id,
  s.production_id,
  s.payment_status,
  s.subscription_start,
  s.subscription_end,
  s.stripe_session_id,
  u.email,
  u.notification_preference,
  p.name as production_name
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
LEFT JOIN productions p ON s.production_id = p.id
ORDER BY s.created_at DESC;

-- 2. Check paid subscriptions only
SELECT 
  s.id,
  s.user_id,
  s.production_id,
  s.payment_status,
  u.email,
  p.name as production_name,
  p.id as production_id
FROM subscriptions s
JOIN users u ON s.user_id = u.id
JOIN productions p ON s.production_id = p.id
WHERE s.payment_status = 'paid'
ORDER BY s.created_at DESC;

-- 3. Check notification logs
SELECT * FROM notification_logs ORDER BY sent_at DESC LIMIT 10;

-- 4. Check production statuses
SELECT id, name, last_seen_status, last_checked_at FROM productions;

