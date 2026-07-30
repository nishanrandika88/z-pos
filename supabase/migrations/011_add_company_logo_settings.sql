alter table company_settings
add column if not exists logo_url text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'brand-assets',
  'brand-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read brand assets" on storage.objects;
drop policy if exists "admin manage brand assets" on storage.objects;

create policy "public read brand assets"
on storage.objects
for select
to public
using (bucket_id = 'brand-assets');

create policy "admin manage brand assets"
on storage.objects
for all
to authenticated
using (bucket_id = 'brand-assets' and public.is_admin())
with check (bucket_id = 'brand-assets' and public.is_admin());
