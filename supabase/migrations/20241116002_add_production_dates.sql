-- Add start_date and end_date to productions table
-- This allows productions to have a date range when they are active
-- Only productions within their date range will be scraped and shown on the site

alter table public.productions 
add column if not exists start_date timestamptz,
add column if not exists end_date timestamptz;

-- Set start_date to now for all existing productions
update public.productions
set start_date = timezone('utc', now())
where start_date is null;

-- Create index for efficient date range queries
create index if not exists idx_productions_date_range 
on public.productions(start_date, end_date) 
where start_date is not null;

-- Add comment explaining the date range logic
comment on column public.productions.start_date is 'Production start date. Production is active when current date is between start_date and end_date (inclusive).';
comment on column public.productions.end_date is 'Production end date. If null, production has no end date. Production is active when current date is between start_date and end_date (inclusive).';

