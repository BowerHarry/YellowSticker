-- Create theatres table to store theatre-specific scraping configuration
create table if not exists public.theatres (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  standing_ticket_prefixes text[] not null, -- Array of prefixes like ['STALLS-STAND-', 'GRAND CIRCLE-STAND-']
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Add theatre_id foreign key to productions
alter table public.productions 
add column if not exists theatre_id uuid references public.theatres(id) on delete restrict;

-- Create index for theatre lookups
create index if not exists idx_productions_theatre_id on public.productions(theatre_id);

-- Insert theatres with their standing ticket patterns
insert into public.theatres (name, standing_ticket_prefixes)
values
  ('Victoria Palace Theatre', ARRAY['GRAND CIRCLE-STAND-']),
  ('Sondheim Theatre', ARRAY['GRAND CIRCLE-STAND-']),
  ('London Palladium', ARRAY['STALLS-STAND-']),
  ('Wyndham''s Theatre', ARRAY['STALLS-STAND-', 'GRAND CIRCLE-STAND-']),
  ('Noël Coward Theatre', ARRAY['STALLS-STAND-', 'GRAND CIRCLE-STAND-'])
on conflict (name) do update set
  standing_ticket_prefixes = excluded.standing_ticket_prefixes;

-- Update existing productions to link to their theatres
update public.productions
set theatre_id = (select id from public.theatres where name = productions.theatre)
where theatre_id is null;

-- Add trigger for updated_at
create trigger set_timestamp_theatres
before update on public.theatres
for each row execute procedure public.set_updated_at();

-- Add comment
comment on table public.theatres is 'Theatres that provide standing tickets. Each theatre has a specific pattern for identifying standing ticket circles in the seating chart.';
comment on column public.theatres.standing_ticket_prefixes is 'Array of circle ID prefixes that identify standing tickets for this theatre. Circles with these prefixes and class != "na" are considered available standing tickets.';

