alter table profiles
add column if not exists display_name text;

update profiles
set display_name = split_part(full_name, ' ', 1)
where display_name is null
  and full_name is not null;
