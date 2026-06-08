alter table categories
add column if not exists display_order integer;

with ranked_categories as (
  select
    id,
    row_number() over (partition by branch_id order by name, created_at, id) as sort_order
  from categories
)
update categories
set display_order = ranked_categories.sort_order
from ranked_categories
where categories.id = ranked_categories.id
and categories.display_order is null;

alter table categories
alter column display_order set default 0;

alter table categories
alter column display_order set not null;

alter table items
add column if not exists display_order integer;

with ranked_items as (
  select
    id,
    row_number() over (partition by branch_id, category_id order by item_name, created_at, id) as sort_order
  from items
)
update items
set display_order = ranked_items.sort_order
from ranked_items
where items.id = ranked_items.id
and items.display_order is null;

alter table items
alter column display_order set default 0;

alter table items
alter column display_order set not null;

create index if not exists categories_branch_display_order_idx
on categories(branch_id, display_order, name);

create index if not exists items_category_display_order_idx
on items(branch_id, category_id, display_order, item_name);
