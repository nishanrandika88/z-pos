insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'item-images',
  'item-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read item images" on storage.objects;
drop policy if exists "admin manage item images" on storage.objects;

create policy "public read item images"
on storage.objects
for select
to public
using (bucket_id = 'item-images');

create policy "admin manage item images"
on storage.objects
for all
to authenticated
using (bucket_id = 'item-images' and public.is_admin())
with check (bucket_id = 'item-images' and public.is_admin());
