-- Debug script for scrape-tickets cron job
-- Run these queries in Supabase SQL Editor

-- 1. Check cron job configuration
select 
  jobid,
  jobname,
  schedule,
  command,
  active
from cron.job
where jobname = 'scrape-tickets';

-- 2. Check recent cron job executions
select 
  runid,
  start_time,
  end_time,
  status,
  return_message,
  job_pid
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'scrape-tickets')
order by start_time desc
limit 10;

-- 3. Test the wrapper function manually (this will queue an HTTP request)
-- Run this and then immediately check Edge Function logs
select public.invoke_scrape_tickets_guarded();

-- 4. Check if the function exists and what it does
select 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
where n.nspname = 'public' 
  and p.proname in ('invoke_scrape_tickets', 'invoke_scrape_tickets_guarded');

-- 5. Check recent production updates (to see if scraper is running)
select 
  name,
  last_checked_at,
  last_standing_tickets_found_at,
  last_seen_status
from productions
order by last_checked_at desc nulls last;

