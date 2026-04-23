-- Seed productions. `productions.theatre` (text) is the single source of
-- truth for venue; the old `theatres` table + `theatre_id` FK were
-- removed in `20260423007_drop_dead_tables.sql`.
insert into public.productions (slug, name, theatre, city, scraping_url, description, poster_url, start_date)
values
  ('hamilton', 'Hamilton', 'Victoria Palace Theatre', 'London', 'https://www.hamiltonmusical.com/london', 'The revolutionary musical about US founding father Alexander Hamilton', 'hamilton-poster.jpg', timezone('utc', now())),
  ('les-miserables', 'Les Misérables', 'Sondheim Theatre', 'London', 'https://buytickets.delfontmackintosh.co.uk/tickets/series/SONLMSEPT25', 'The epic musical phenomenon of love, sacrifice and redemption during the failed French revolution', 'les-miserables-poster.jpg', timezone('utc', now())),
  ('oliver', 'Oliver!', 'London Palladium', 'London', 'https://buytickets.delfontmackintosh.co.uk/tickets/series/GIEOLI', 'Lionel Bart''s classic musical adaptation of Charles Dickens'' Oliver Twist', 'oliver-poster.jpg', timezone('utc', now())),
  ('all-my-sons', 'All My Sons', 'Wyndham''s Theatre', 'London', 'https://buytickets.delfontmackintosh.co.uk/tickets/series/WYNAMS', 'Arthur Miller''s powerful drama about family, responsibility, and the American Dream', 'all-my-sons-poster.jpg', timezone('utc', now())),
  ('importance-of-being-earnest', 'The Importance of Being Earnest', 'Noël Coward Theatre', 'London', 'https://buytickets.delfontmackintosh.co.uk/tickets/series/COWIBE', 'Oscar Wilde''s witty comedy of mistaken identity, social satire, and the pursuit of love', 'importance-of-being-earnest-poster.jpg', timezone('utc', now())),
  ('dracula', 'Dracula', 'Noël Coward Theatre', 'London', 'https://buytickets.delfontmackintosh.co.uk/tickets/series/COWDRA', 'Bram Stoker''s classic gothic horror tale of the immortal vampire Count Dracula', 'dracula-poster.jpg', '2026-02-04 00:00:00+00'::timestamptz),
  ('inter-alia', 'Inter Alia', 'Wyndham''s Theatre', 'London', 'https://buytickets.delfontmackintosh.co.uk/tickets/series/WYNIA', 'A compelling new production', 'inter-alia-poster.jpg', '2026-03-19 00:00:00+00'::timestamptz)
on conflict (slug) do update set
  poster_url = excluded.poster_url,
  start_date = coalesce(excluded.start_date, productions.start_date, timezone('utc', now()));

update public.productions
set end_date = '2026-05-23 23:59:59+00'::timestamptz
where slug = 'dracula';

update public.productions
set end_date = '2026-06-20 23:59:59+00'::timestamptz
where slug = 'inter-alia';
