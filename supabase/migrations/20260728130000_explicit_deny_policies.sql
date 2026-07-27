-- Make the deny-all posture explicit, and clear the `rls_enabled_no_policy`
-- INFO lints.
--
-- `20260727120000_enable_rls.sql` enabled RLS on these tables and deliberately
-- created no policies: nothing outside the service role touches them, and
-- service_role bypasses RLS entirely. That is already a working deny-all —
-- verified against production, where every one of these tables returns
-- `200 → 0 rows` to the publishable key.
--
-- The linter can't tell a deliberate deny-all from forgotten policies, so it
-- flags all five indefinitely. Permanent noise on the advisor board is how real
-- findings get missed, hence these no-op policies.
--
-- THESE GRANT NOTHING. `using (false)` matches no rows and
-- `with check (false)` accepts no writes, for every command, for both API
-- roles — exactly the behaviour that already exists. The policies serve as
-- documentation in the schema itself: a reader of `pg_policies` sees intent
-- rather than an absence.
--
-- They are permissive (the default), not restrictive, which matters for the
-- future: permissive policies are OR'd together, so adding a real policy later
-- grants access as expected instead of being silently blocked by this one. If
-- these were RESTRICTIVE they would veto every future policy.
--
-- To genuinely expose one of these tables later, add a policy alongside — do
-- not repurpose these.

create policy "no api access (service role bypasses rls)"
  on public.users for all to anon, authenticated
  using (false) with check (false);

create policy "no api access (service role bypasses rls)"
  on public.subscriptions for all to anon, authenticated
  using (false) with check (false);

create policy "no api access (service role bypasses rls)"
  on public.notification_logs for all to anon, authenticated
  using (false) with check (false);

create policy "no api access (service role bypasses rls)"
  on public.scrape_heartbeats for all to anon, authenticated
  using (false) with check (false);

create policy "no api access (service role bypasses rls)"
  on public.scraper_settings for all to anon, authenticated
  using (false) with check (false);
