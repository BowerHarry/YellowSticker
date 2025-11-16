-- Storage setup for production posters
-- 
-- IMPORTANT: Supabase doesn't support creating storage buckets via SQL migrations.
-- You must create the bucket manually using one of these methods:
--
-- Option 1: Supabase Dashboard
--   1. Go to Storage → New bucket
--   2. Name: "production-posters"
--   3. Check "Public bucket"
--   4. Click Create
--
-- Option 2: Supabase CLI
--   supabase storage create production-posters --public
--
-- After creating the bucket, this migration will set up the RLS policy for public read access.

-- Allow public read access to production posters
-- This policy allows anyone to read files from the production-posters bucket
-- Drop the policy if it exists first, then create it
drop policy if exists "Public read access for production posters" on storage.objects;

create policy "Public read access for production posters"
on storage.objects for select
using (bucket_id = 'production-posters');

