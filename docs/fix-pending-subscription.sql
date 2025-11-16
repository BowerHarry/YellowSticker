-- Manual fix for pending subscription
-- Replace the session_id with your actual Stripe checkout session ID
-- Replace user_id and production_id with the values from the session metadata

-- Example: Update subscription for session cs_test_a1QCUIuwYbNkXpbplGGXZdrCI6F96S8ovc84wF7NFlHj37lDXsknwsNSoO

UPDATE public.subscriptions
SET 
  payment_status = 'paid',
  subscription_start = NOW(),
  subscription_end = NOW() + INTERVAL '1 year',
  stripe_session_id = 'cs_test_a1QCUIuwYbNkXpbplGGXZdrCI6F96S8ovc84wF7NFlHj37lDXsknwsNSoO'
WHERE 
  stripe_session_id = 'cs_test_a1QCUIuwYbNkXpbplGGXZdrCI6F96S8ovc84wF7NFlHj37lDXsknwsNSoO'
  OR (user_id = '0943f66d-d8cb-4e14-80c4-cae32cb30daf' AND production_id = '1c28d754-ecef-453a-817e-a977b2f8564a');

-- Verify the update
SELECT * FROM public.subscriptions 
WHERE user_id = '0943f66d-d8cb-4e14-80c4-cae32cb30daf' 
  AND production_id = '1c28d754-ecef-453a-817e-a977b2f8564a';

