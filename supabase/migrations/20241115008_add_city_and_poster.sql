-- Add city and poster_url columns to productions table
alter table public.productions
add column if not exists city text,
add column if not exists poster_url text;

-- Update existing productions with city information
update public.productions
set city = 'London'
where city is null;

