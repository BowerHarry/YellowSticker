-- Per-user alert fan-out. Previously `report-scrape` sent a single email to
-- `ALERT_EMAIL` when a production transitioned to available; from now on it
-- also emails every active subscriber. We dedupe on two axes:
--
--   productions.last_availability_transition_at
--     -- ticks forward *only* on a clean `unavailable → available` flip.
--     -- (distinct from `last_standing_tickets_found_at`, which is bumped
--     -- every scrape cycle while tickets exist and therefore would loop
--     -- the fan-out).
--
--   subscriptions.last_alerted_at
--     -- updated when we email a user, so "alert only if the current
--     -- availability transition is newer than their last alert" gives us
--     -- one email per subscriber per availability event, and lets new
--     -- subscribers who joined mid-availability catch the next cycle.

alter table public.productions
  add column if not exists last_availability_transition_at timestamptz;

comment on column public.productions.last_availability_transition_at is
  'UTC timestamp of the most recent unavailable→available transition. Used by report-scrape as the per-event anchor when fanning out subscriber emails. Distinct from last_standing_tickets_found_at which ticks every cycle while tickets exist.';

alter table public.subscriptions
  add column if not exists last_alerted_at timestamptz;

comment on column public.subscriptions.last_alerted_at is
  'UTC timestamp of the most recent standing-ticket availability email we sent this subscriber. NULL if we''ve never alerted them. report-scrape alerts when this is older than productions.last_availability_transition_at.';

-- Partial index so the "active subscribers for production X" query
-- report-scrape runs on every available-state cycle stays cheap even as
-- subscriptions accumulate. `subscription_end` participates so a B-tree
-- range predicate can cover both the status + freshness filters.
create index if not exists idx_subscriptions_alertable
  on public.subscriptions(production_id, subscription_end)
  where payment_status = 'paid';
