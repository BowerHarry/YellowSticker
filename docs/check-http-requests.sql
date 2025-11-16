-- Check the structure of net.http_request_queue to see available columns
select column_name, data_type
from information_schema.columns
where table_schema = 'net' and table_name = 'http_request_queue';

-- Check recent HTTP requests made by pg_net
-- First, let's see what's actually in the queue (adjust columns based on what exists)
select *
from net.http_request_queue
where url like '%scrape-tickets%'
order by id desc
limit 10;

-- Alternative: Check cron job run details for any errors or notices
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

-- Check the actual cron job configuration
select 
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
from cron.job
where jobname = 'scrape-tickets';

-- Test the wrapper function manually
select public.invoke_scrape_tickets_guarded();
