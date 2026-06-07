create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type app_role as enum ('ADMIN', 'CASHIER');
create type discount_applicable_type as enum ('ITEM', 'CATEGORY');
create type order_status as enum ('PENDING', 'COMPLETED', 'CANCELLED');
create type payment_method as enum ('CASH', 'CARD');
create type printer_type as enum ('EPSON_ESC_POS', 'XPRINTER', 'HPRT', 'RONGTA', 'GENERIC_THERMAL');
create type receipt_width as enum ('58MM', '80MM');
create type audit_action as enum (
  'LOGIN',
  'LOGOUT',
  'USER_CHANGE',
  'ITEM_CHANGE',
  'CATEGORY_CHANGE',
  'DISCOUNT_CHANGE',
  'ORDER_CREATE',
  'ORDER_CANCEL',
  'RECEIPT_REPRINT',
  'MANUAL_DISCOUNT'
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid not null references branches(id),
  full_name text not null,
  email text not null unique,
  role app_role not null default 'CASHIER',
  active boolean not null default true,
  last_login timestamptz,
  locked_until timestamptz,
  failed_login_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_permissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  permission text not null,
  granted_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (profile_id, permission)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  category_id uuid not null references categories(id),
  item_code text not null,
  barcode text,
  item_name text not null,
  description text,
  image_url text,
  selling_price numeric(12, 2) not null check (selling_price > 0),
  availability boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, item_code),
  unique (branch_id, barcode)
);

create table discounts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  percentage numeric(5, 2) not null check (percentage > 0 and percentage <= 100),
  applicable_type discount_applicable_type not null,
  applicable_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  cashier_id uuid not null references profiles(id),
  shift_start timestamptz not null default now(),
  shift_end timestamptz,
  opening_cash numeric(12, 2) not null default 0,
  closing_cash numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shift_end is null or shift_end >= shift_start)
);

create table order_counters (
  branch_id uuid not null references branches(id),
  business_date date not null,
  last_sequence integer not null default 0,
  primary key (branch_id, business_date)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  shift_id uuid references shifts(id),
  order_number text not null unique,
  cashier_id uuid not null references profiles(id),
  status order_status not null default 'PENDING',
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  automatic_discount_total numeric(12, 2) not null default 0 check (automatic_discount_total >= 0),
  manual_discount_total numeric(12, 2) not null default 0 check (manual_discount_total >= 0),
  manual_discount_type text check (manual_discount_type in ('PERCENTAGE', 'FIXED')),
  manual_discount_value numeric(12, 2) not null default 0,
  tax_total numeric(12, 2) not null default 0 check (tax_total >= 0),
  grand_total numeric(12, 2) not null check (grand_total >= 0),
  offline_client_id text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, offline_client_id)
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid not null references items(id),
  item_code text not null,
  item_name text not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  discount_total numeric(12, 2) not null default 0 check (discount_total >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  method payment_method not null,
  amount numeric(12, 2) not null check (amount >= 0),
  amount_tendered numeric(12, 2),
  balance_returned numeric(12, 2),
  card_type text,
  bank_name text,
  card_last4 char(4),
  masked_card_number text,
  created_at timestamptz not null default now(),
  check (method <> 'CARD' or (card_last4 is not null and masked_card_number is not null)),
  check (masked_card_number is null or masked_card_number !~ '[0-9]{12,}')
);

create table printers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  printer_name text not null,
  printer_type printer_type not null,
  receipt_width receipt_width not null default '80MM',
  auto_print boolean not null default true,
  print_copies integer not null default 1 check (print_copies between 1 and 5),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table company_settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) unique,
  company_name text not null,
  address text,
  phone text,
  email text,
  tax_number text,
  currency text not null default 'LKR',
  receipt_footer text,
  tax_rate numeric(5, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  user_id uuid references profiles(id),
  action audit_action not null,
  entity text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table offline_sync_events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  client_id text not null,
  entity text not null,
  entity_id text not null,
  payload jsonb not null,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SYNCED', 'CONFLICT', 'FAILED')),
  error_message text,
  created_at timestamptz not null default now(),
  synced_at timestamptz,
  unique (branch_id, client_id, entity, entity_id)
);

create unique index categories_branch_name_unique on categories (branch_id, lower(name));
create unique index discounts_one_active_target on discounts (branch_id, applicable_type, applicable_id) where active;
create index profiles_branch_idx on profiles(branch_id);
create index categories_branch_active_idx on categories(branch_id, active);
create index items_branch_search_idx on items(branch_id, active, item_code, barcode);
create index items_name_trgm_idx on items using gin (item_name gin_trgm_ops);
create index orders_branch_created_idx on orders(branch_id, created_at desc);
create index orders_cashier_created_idx on orders(cashier_id, created_at desc);
create index order_items_order_idx on order_items(order_id);
create index audit_logs_branch_created_idx on audit_logs(branch_id, created_at desc);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger branches_updated_at before update on branches for each row execute function set_updated_at();
create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();
create trigger categories_updated_at before update on categories for each row execute function set_updated_at();
create trigger items_updated_at before update on items for each row execute function set_updated_at();
create trigger discounts_updated_at before update on discounts for each row execute function set_updated_at();
create trigger shifts_updated_at before update on shifts for each row execute function set_updated_at();
create trigger orders_updated_at before update on orders for each row execute function set_updated_at();
create trigger printers_updated_at before update on printers for each row execute function set_updated_at();
create trigger company_settings_updated_at before update on company_settings for each row execute function set_updated_at();

create or replace function current_profile()
returns profiles
language sql
security definer
set search_path = public
stable
as $$
  select * from profiles where id = auth.uid() and active = true;
$$;

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'ADMIN' and active = true);
$$;

create or replace function same_branch(target_branch_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from profiles where id = auth.uid() and active = true and branch_id = target_branch_id);
$$;

create or replace function next_order_number(target_branch_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_sequence integer;
  current_business_date date := current_date;
begin
  insert into order_counters(branch_id, business_date, last_sequence)
  values (target_branch_id, current_business_date, 1)
  on conflict (branch_id, business_date)
  do update set last_sequence = order_counters.last_sequence + 1
  returning last_sequence into next_sequence;

  return 'INV-' || to_char(current_business_date, 'YYYYMMDD') || '-' || lpad(next_sequence::text, 6, '0');
end;
$$;

create or replace function create_pos_order(order_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile profiles;
  new_order_id uuid;
  generated_number text;
begin
  select * into profile from current_profile();
  if profile.id is null then
    raise exception 'Unauthorized';
  end if;

  generated_number := next_order_number(profile.branch_id);

  insert into orders (
    branch_id,
    order_number,
    cashier_id,
    status,
    subtotal,
    automatic_discount_total,
    manual_discount_total,
    tax_total,
    grand_total,
    completed_at
  )
  values (
    profile.branch_id,
    generated_number,
    profile.id,
    'COMPLETED',
    coalesce((order_payload #>> '{totals,subtotal}')::numeric, 0),
    coalesce((order_payload #>> '{totals,automaticDiscount}')::numeric, 0),
    coalesce((order_payload #>> '{totals,manualDiscount}')::numeric, 0),
    coalesce((order_payload #>> '{totals,tax}')::numeric, 0),
    coalesce((order_payload #>> '{totals,grandTotal}')::numeric, 0),
    now()
  )
  returning id into new_order_id;

  insert into order_items(order_id, item_id, item_code, item_name, quantity, unit_price, discount_total, line_total)
  select
    new_order_id,
    (line #>> '{item,id}')::uuid,
    line #>> '{item,itemCode}',
    line #>> '{item,itemName}',
    (line ->> 'quantity')::numeric,
    (line #>> '{item,sellingPrice}')::numeric,
    coalesce((line ->> 'automaticDiscount')::numeric, 0),
    (line ->> 'lineTotal')::numeric
  from jsonb_array_elements(order_payload -> 'lines') as line;

  insert into payments(order_id, method, amount, amount_tendered, balance_returned, card_type, bank_name, card_last4, masked_card_number)
  values (
    new_order_id,
    (order_payload #>> '{payment,method}')::payment_method,
    coalesce((order_payload #>> '{totals,grandTotal}')::numeric, 0),
    nullif(order_payload #>> '{payment,amountTendered}', '')::numeric,
    nullif(order_payload #>> '{payment,balanceReturned}', '')::numeric,
    order_payload #>> '{payment,cardType}',
    order_payload #>> '{payment,bankName}',
    nullif(order_payload #>> '{payment,last4}', ''),
    order_payload #>> '{payment,maskedNumber}'
  );

  insert into audit_logs(branch_id, user_id, action, entity, entity_id, new_value)
  values (profile.branch_id, profile.id, 'ORDER_CREATE', 'orders', new_order_id, jsonb_build_object('order_number', generated_number));

  return new_order_id;
end;
$$;

alter table branches enable row level security;
alter table profiles enable row level security;
alter table user_permissions enable row level security;
alter table categories enable row level security;
alter table items enable row level security;
alter table discounts enable row level security;
alter table shifts enable row level security;
alter table order_counters enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table printers enable row level security;
alter table company_settings enable row level security;
alter table audit_logs enable row level security;
alter table offline_sync_events enable row level security;

create policy "branch read" on branches for select using (same_branch(id) or is_admin());
create policy "admin manage branches" on branches for all using (is_admin()) with check (is_admin());

create policy "profile self read" on profiles for select using (id = auth.uid() or is_admin() or same_branch(branch_id));
create policy "admin manage profiles" on profiles for all using (is_admin()) with check (is_admin());
create policy "admin manage permissions" on user_permissions for all using (is_admin()) with check (is_admin());

create policy "branch read categories" on categories for select using (same_branch(branch_id));
create policy "admin manage categories" on categories for all using (is_admin() and same_branch(branch_id)) with check (is_admin() and same_branch(branch_id));
create policy "branch read items" on items for select using (same_branch(branch_id));
create policy "admin manage items" on items for all using (is_admin() and same_branch(branch_id)) with check (is_admin() and same_branch(branch_id));
create policy "branch read discounts" on discounts for select using (same_branch(branch_id));
create policy "admin manage discounts" on discounts for all using (is_admin() and same_branch(branch_id)) with check (is_admin() and same_branch(branch_id));

create policy "cashier read own shifts" on shifts for select using (cashier_id = auth.uid() or is_admin());
create policy "branch create shifts" on shifts for insert with check (cashier_id = auth.uid() and same_branch(branch_id));
create policy "admin manage shifts" on shifts for all using (is_admin() and same_branch(branch_id)) with check (is_admin() and same_branch(branch_id));

create policy "admin read branch orders" on orders for select using (is_admin() and same_branch(branch_id));
create policy "cashier read own orders" on orders for select using (cashier_id = auth.uid());
create policy "cashier create own orders" on orders for insert with check (cashier_id = auth.uid() and same_branch(branch_id));
create policy "admin update orders" on orders for update using (is_admin() and same_branch(branch_id));

create policy "read order items by visible order" on order_items for select using (
  exists (select 1 from orders where orders.id = order_items.order_id and (orders.cashier_id = auth.uid() or (is_admin() and same_branch(orders.branch_id))))
);
create policy "read payments by visible order" on payments for select using (
  exists (select 1 from orders where orders.id = payments.order_id and (orders.cashier_id = auth.uid() or (is_admin() and same_branch(orders.branch_id))))
);

create policy "admin manage printers" on printers for all using (is_admin() and same_branch(branch_id)) with check (is_admin() and same_branch(branch_id));
create policy "branch read settings" on company_settings for select using (same_branch(branch_id));
create policy "admin manage settings" on company_settings for all using (is_admin() and same_branch(branch_id)) with check (is_admin() and same_branch(branch_id));
create policy "admin read audit" on audit_logs for select using (is_admin() and same_branch(branch_id));
create policy "branch sync events" on offline_sync_events for all using (same_branch(branch_id)) with check (same_branch(branch_id));
