-- Add column to track when standing tickets were last found
alter table public.productions
add column if not exists last_standing_tickets_found_at timestamptz;

