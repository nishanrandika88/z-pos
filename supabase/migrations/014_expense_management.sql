-- Expense management is additive: existing POS tables and behavior are unchanged.

create type expense_category_kind as enum ('OPERATIONAL', 'INVENTORY', 'SALARY');
create type expense_status as enum ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'VOID');
create type expense_payment_method as enum ('CASH', 'CARD', 'BANK_TRANSFER', 'LANKAQR', 'OTHER');
create type expense_fund_source as enum ('SHOP_CASH', 'SHOP_BANK', 'SHOP_CARD', 'PERSONAL', 'OTHER');
create type expense_unit_type as enum ('UNIT', 'GRAM', 'KILOGRAM', 'MILLILITRE', 'LITRE', 'PACK', 'BOTTLE', 'BOX', 'OTHER');
create type salary_payment_status as enum ('PENDING', 'PARTIALLY_PAID', 'PAID');
create type receipt_processing_status as enum ('UPLOADED', 'PROCESSING', 'EXTRACTED', 'FAILED', 'REVIEWED');
create type inventory_movement_type as enum ('PURCHASE', 'EXPENSE_VOID', 'ADJUSTMENT');

alter type audit_action add value if not exists 'EXPENSE_CREATE';
alter type audit_action add value if not exists 'EXPENSE_UPDATE';
alter type audit_action add value if not exists 'EXPENSE_APPROVE';
alter type audit_action add value if not exists 'EXPENSE_PAID';
alter type audit_action add value if not exists 'EXPENSE_VOID';
alter type audit_action add value if not exists 'EXPENSE_REIMBURSE';
alter type audit_action add value if not exists 'EXPENSE_CATEGORY_CHANGE';
alter type audit_action add value if not exists 'EXPENSE_RECEIPT_REVIEW';
alter type audit_action add value if not exists 'INVENTORY_CHANGE';

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null check (char_length(trim(name)) between 2 and 100),
  kind expense_category_kind not null default 'OPERATIONAL',
  active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index expense_categories_branch_name_unique on expense_categories(branch_id, lower(name));
create index expense_categories_branch_active_idx on expense_categories(branch_id, active, display_order, name);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null check (char_length(trim(name)) between 2 and 160),
  contact_name text,
  phone text,
  email text,
  address text,
  tax_number text,
  active boolean not null default true,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index suppliers_branch_name_unique on suppliers(branch_id, lower(name));
create index suppliers_branch_active_idx on suppliers(branch_id, active, name);

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  catalog_item_id uuid references items(id),
  sku text,
  name text not null check (char_length(trim(name)) between 2 and 160),
  base_unit expense_unit_type not null,
  quantity_on_hand numeric(14,3) not null default 0,
  average_cost numeric(14,4) not null default 0 check (average_cost >= 0),
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  active boolean not null default true,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index inventory_items_branch_name_unique on inventory_items(branch_id, lower(name));
create unique index inventory_items_branch_sku_unique on inventory_items(branch_id, lower(sku)) where sku is not null;
create index inventory_items_branch_active_idx on inventory_items(branch_id, active, name);

create table inventory_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  from_unit expense_unit_type not null,
  factor_to_base numeric(14,6) not null check (factor_to_base > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_item_id, from_unit)
);

create table expense_counters (
  branch_id uuid not null references branches(id),
  business_date date not null,
  last_sequence integer not null default 0 check (last_sequence >= 0),
  primary key (branch_id, business_date)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  expense_number text not null,
  client_request_id uuid not null,
  expense_date timestamptz not null,
  category_id uuid not null references expense_categories(id),
  supplier_id uuid references suppliers(id),
  payee_snapshot text,
  invoice_number text,
  description text,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_total numeric(14,2) not null default 0 check (tax_total >= 0),
  additional_charges_total numeric(14,2) not null default 0 check (additional_charges_total >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  grand_total numeric(14,2) not null default 0 check (grand_total >= 0),
  payment_method expense_payment_method not null,
  status expense_status not null default 'DRAFT',
  update_inventory boolean not null default false,
  created_by uuid not null references profiles(id),
  updated_by uuid not null references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  paid_at timestamptz,
  voided_by uuid references profiles(id),
  voided_at timestamptz,
  void_reason text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, expense_number),
  unique (branch_id, client_request_id),
  check (status <> 'VOID' or (voided_by is not null and voided_at is not null and char_length(trim(void_reason)) >= 3))
);

create index expenses_branch_date_idx on expenses(branch_id, expense_date desc, id);
create index expenses_branch_status_date_idx on expenses(branch_id, status, expense_date desc);
create index expenses_branch_category_date_idx on expenses(branch_id, category_id, expense_date desc);
create index expenses_branch_supplier_date_idx on expenses(branch_id, supplier_id, expense_date desc) where supplier_id is not null;
create index expenses_branch_creator_date_idx on expenses(branch_id, created_by, expense_date desc);
create index expenses_invoice_lookup_idx on expenses(branch_id, lower(payee_snapshot), lower(invoice_number)) where invoice_number is not null;

create table expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  inventory_item_id uuid references inventory_items(id),
  description text not null check (char_length(trim(description)) between 1 and 200),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_type expense_unit_type not null,
  conversion_factor numeric(14,6) not null default 1 check (conversion_factor > 0),
  base_quantity numeric(14,3) not null check (base_quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  additional_charges numeric(14,2) not null default 0 check (additional_charges >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  inventory_posted_at timestamptz,
  created_at timestamptz not null default now()
);

create index expense_items_expense_idx on expense_items(expense_id);
create index expense_items_inventory_idx on expense_items(inventory_item_id) where inventory_item_id is not null;

create table expense_fundings (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  source expense_fund_source not null,
  amount numeric(14,2) not null check (amount > 0),
  person_paid text,
  reimbursement_required boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  check (source <> 'PERSONAL' or char_length(trim(person_paid)) >= 2)
);

create index expense_fundings_expense_idx on expense_fundings(expense_id);
create index expense_fundings_personal_idx on expense_fundings(expense_id, source) where source = 'PERSONAL';

create table expense_reimbursements (
  id uuid primary key default gen_random_uuid(),
  expense_funding_id uuid not null references expense_fundings(id),
  amount numeric(14,2) not null check (amount > 0),
  reimbursement_date timestamptz not null default now(),
  processed_by uuid not null references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create index expense_reimbursements_funding_date_idx on expense_reimbursements(expense_funding_id, reimbursement_date desc);

create table salary_expense_details (
  expense_id uuid primary key references expenses(id) on delete cascade,
  employee_profile_id uuid references profiles(id),
  employee_name_snapshot text not null check (char_length(trim(employee_name_snapshot)) between 2 and 120),
  salary_period_start date not null,
  salary_period_end date not null,
  basic_salary numeric(14,2) not null check (basic_salary >= 0),
  allowances numeric(14,2) not null default 0 check (allowances >= 0),
  deductions numeric(14,2) not null default 0 check (deductions >= 0),
  advance_payments numeric(14,2) not null default 0 check (advance_payments >= 0),
  net_amount numeric(14,2) not null check (net_amount >= 0),
  payment_date date,
  payment_status salary_payment_status not null default 'PENDING',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_period_end >= salary_period_start),
  check (net_amount = round(basic_salary + allowances - deductions - advance_payments, 2))
);

create index salary_expense_period_idx on salary_expense_details(salary_period_start desc, salary_period_end desc);
create index salary_expense_employee_idx on salary_expense_details(employee_profile_id) where employee_profile_id is not null;

create table expense_receipts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  expense_id uuid references expenses(id) on delete set null,
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  file_hash char(64) not null check (file_hash ~ '^[0-9a-f]{64}$'),
  processing_status receipt_processing_status not null default 'UPLOADED',
  ocr_provider text,
  provider_job_id text,
  extracted_data jsonb,
  corrected_data jsonb,
  confidence numeric(5,4) check (confidence between 0 and 1),
  error_message text,
  duplicate_of_id uuid references expense_receipts(id),
  uploaded_by uuid not null references profiles(id),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expense_receipts_expense_idx on expense_receipts(expense_id);
create index expense_receipts_branch_hash_idx on expense_receipts(branch_id, file_hash);
create index expense_receipts_branch_status_idx on expense_receipts(branch_id, processing_status, created_at);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  inventory_item_id uuid not null references inventory_items(id),
  movement_type inventory_movement_type not null,
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  expense_item_id uuid references expense_items(id),
  reversal_of_id uuid references stock_movements(id),
  performed_by uuid not null references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create unique index stock_movement_purchase_once on stock_movements(expense_item_id) where movement_type = 'PURCHASE';
create unique index stock_movement_reversal_once on stock_movements(reversal_of_id) where movement_type = 'EXPENSE_VOID';
create index stock_movements_item_date_idx on stock_movements(inventory_item_id, created_at desc);
create index stock_movements_branch_date_idx on stock_movements(branch_id, created_at desc);

create trigger expense_categories_updated_at before update on expense_categories for each row execute function set_updated_at();
create trigger suppliers_updated_at before update on suppliers for each row execute function set_updated_at();
create trigger inventory_items_updated_at before update on inventory_items for each row execute function set_updated_at();
create trigger inventory_unit_conversions_updated_at before update on inventory_unit_conversions for each row execute function set_updated_at();
create trigger expenses_updated_at before update on expenses for each row execute function set_updated_at();
create trigger salary_expense_details_updated_at before update on salary_expense_details for each row execute function set_updated_at();
create trigger expense_receipts_updated_at before update on expense_receipts for each row execute function set_updated_at();

insert into expense_categories (branch_id, name, kind, display_order)
select b.id, seed.name, seed.kind::expense_category_kind, seed.display_order
from branches b
cross join (values
  ('Employee salaries', 'SALARY', 10),
  ('Shop rent', 'OPERATIONAL', 20),
  ('Utility bills', 'OPERATIONAL', 30),
  ('Food ingredients and stock', 'INVENTORY', 40),
  ('Packaging materials', 'INVENTORY', 50),
  ('Equipment purchases and repairs', 'OPERATIONAL', 60),
  ('Transport', 'OPERATIONAL', 70),
  ('Cleaning supplies', 'INVENTORY', 80),
  ('Marketing', 'OPERATIONAL', 90),
  ('Licences, subscriptions and service fees', 'OPERATIONAL', 100),
  ('Miscellaneous', 'OPERATIONAL', 110)
) as seed(name, kind, display_order)
on conflict (branch_id, lower(name)) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function has_expense_permission(required_permission text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = 'ADMIN'
        or exists (
          select 1 from user_permissions up
          where up.profile_id = p.id and up.permission = required_permission
        )
      )
  );
$$;

create or replace function next_expense_number(target_branch_id uuid, target_date date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_sequence integer;
begin
  insert into expense_counters(branch_id, business_date, last_sequence)
  values (target_branch_id, target_date, 1)
  on conflict (branch_id, business_date)
  do update set last_sequence = expense_counters.last_sequence + 1
  returning last_sequence into next_sequence;

  return 'EXP-' || to_char(target_date, 'YYYYMMDD') || '-' || lpad(next_sequence::text, 5, '0');
end;
$$;

create or replace function expense_reimbursement_status(personal_amount numeric, reimbursed_amount numeric)
returns text
language sql
immutable
as $$
  select case
    when coalesce(personal_amount, 0) = 0 then 'NOT_REQUIRED'
    when coalesce(reimbursed_amount, 0) = 0 then 'PENDING'
    when reimbursed_amount < personal_amount then 'PARTIALLY_REIMBURSED'
    else 'FULLY_REIMBURSED'
  end;
$$;

create or replace function _write_expense_payload(target_expense_id uuid, expense_payload jsonb, actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_expense expenses;
  target_category expense_categories;
  target_supplier suppliers;
  line jsonb;
  funding jsonb;
  salary jsonb;
  quantity_value numeric(14,3);
  conversion_value numeric(14,6);
  unit_price_value numeric(14,2);
  tax_value numeric(14,2);
  charges_value numeric(14,2);
  discount_value numeric(14,2);
  gross_value numeric(14,2);
  line_total_value numeric(14,2);
  subtotal_value numeric(14,2) := 0;
  tax_total_value numeric(14,2) := 0;
  charges_total_value numeric(14,2) := 0;
  discount_total_value numeric(14,2) := 0;
  grand_total_value numeric(14,2) := 0;
  funding_total_value numeric(14,2) := 0;
  inventory_id uuid;
  supplier_id_value uuid;
  salary_net numeric(14,2);
begin
  select * into target_expense from expenses where id = target_expense_id for update;
  if target_expense.id is null then raise exception 'Expense not found'; end if;

  select * into target_category
  from expense_categories
  where id = (expense_payload ->> 'categoryId')::uuid
    and branch_id = target_expense.branch_id
    and active = true;
  if target_category.id is null then raise exception 'Select an active expense category from this branch'; end if;

  supplier_id_value := nullif(expense_payload ->> 'supplierId', '')::uuid;
  if supplier_id_value is not null then
    select * into target_supplier from suppliers
    where id = supplier_id_value and branch_id = target_expense.branch_id and active = true;
    if target_supplier.id is null then raise exception 'Supplier is not available in this branch'; end if;
  end if;

  if jsonb_typeof(expense_payload -> 'items') <> 'array' or jsonb_array_length(expense_payload -> 'items') = 0 then
    raise exception 'At least one expense item is required';
  end if;
  if jsonb_array_length(expense_payload -> 'items') > 100 then raise exception 'At most 100 expense items are allowed'; end if;

  delete from salary_expense_details where expense_id = target_expense_id;
  delete from expense_fundings where expense_id = target_expense_id;
  delete from expense_items where expense_id = target_expense_id;

  for line in select value from jsonb_array_elements(expense_payload -> 'items') loop
    quantity_value := (line ->> 'quantity')::numeric;
    conversion_value := coalesce(nullif(line ->> 'conversionFactor', '')::numeric, 1);
    unit_price_value := coalesce(nullif(line ->> 'unitPrice', '')::numeric, 0);
    tax_value := coalesce(nullif(line ->> 'taxAmount', '')::numeric, 0);
    charges_value := coalesce(nullif(line ->> 'additionalCharges', '')::numeric, 0);
    discount_value := coalesce(nullif(line ->> 'discountAmount', '')::numeric, 0);
    if quantity_value <= 0 or conversion_value <= 0 or unit_price_value < 0 or tax_value < 0 or charges_value < 0 or discount_value < 0 then
      raise exception 'Expense line contains invalid quantity or money values';
    end if;

    gross_value := round(quantity_value * unit_price_value, 2);
    line_total_value := round(gross_value + tax_value + charges_value - discount_value, 2);
    if line_total_value < 0 then raise exception 'Expense line total cannot be negative'; end if;

    inventory_id := nullif(line ->> 'inventoryItemId', '')::uuid;
    if inventory_id is not null and not exists (
      select 1 from inventory_items where id = inventory_id and branch_id = target_expense.branch_id and active = true
    ) then
      raise exception 'Inventory item is not available in this branch';
    end if;

    insert into expense_items (
      expense_id, inventory_item_id, description, quantity, unit_type, conversion_factor,
      base_quantity, unit_price, tax_amount, additional_charges, discount_amount, line_total
    ) values (
      target_expense_id,
      inventory_id,
      trim(line ->> 'description'),
      quantity_value,
      (line ->> 'unitType')::expense_unit_type,
      conversion_value,
      round(quantity_value * conversion_value, 3),
      unit_price_value,
      tax_value,
      charges_value,
      discount_value,
      line_total_value
    );

    subtotal_value := subtotal_value + gross_value;
    tax_total_value := tax_total_value + tax_value;
    charges_total_value := charges_total_value + charges_value;
    discount_total_value := discount_total_value + discount_value;
    grand_total_value := grand_total_value + line_total_value;
  end loop;

  if jsonb_typeof(expense_payload -> 'fundings') <> 'array' or jsonb_array_length(expense_payload -> 'fundings') = 0 then
    raise exception 'At least one source of funds is required';
  end if;
  if jsonb_array_length(expense_payload -> 'fundings') > 10 then raise exception 'At most 10 funding contributions are allowed'; end if;

  for funding in select value from jsonb_array_elements(expense_payload -> 'fundings') loop
    if (funding ->> 'amount')::numeric <= 0 then raise exception 'Funding amount must be greater than zero'; end if;
    if (funding ->> 'source') = 'PERSONAL' and char_length(trim(coalesce(funding ->> 'personPaid', ''))) < 2 then
      raise exception 'Enter the person who used personal money';
    end if;
    insert into expense_fundings(expense_id, source, amount, person_paid, reimbursement_required, notes)
    values (
      target_expense_id,
      (funding ->> 'source')::expense_fund_source,
      (funding ->> 'amount')::numeric,
      nullif(trim(funding ->> 'personPaid'), ''),
      case when (funding ->> 'source') = 'PERSONAL' then coalesce((funding ->> 'reimbursementRequired')::boolean, true) else false end,
      nullif(trim(funding ->> 'notes'), '')
    );
    funding_total_value := funding_total_value + (funding ->> 'amount')::numeric;
  end loop;
  if round(funding_total_value, 2) <> round(grand_total_value, 2) then
    raise exception 'Sources of funds must equal the expense total';
  end if;

  salary := expense_payload -> 'salary';
  if target_category.kind = 'SALARY' and (salary is null or salary = 'null'::jsonb) then
    raise exception 'Salary details are required for a salary expense';
  end if;
  if salary is not null and salary <> 'null'::jsonb then
    if nullif(salary ->> 'employeeProfileId', '')::uuid is not null and not exists (
      select 1 from profiles p where p.id = nullif(salary ->> 'employeeProfileId', '')::uuid and p.branch_id = target_expense.branch_id and p.active
    ) then raise exception 'Employee profile is not available in this branch'; end if;
    salary_net := round(
      coalesce((salary ->> 'basicSalary')::numeric, 0)
      + coalesce((salary ->> 'allowances')::numeric, 0)
      - coalesce((salary ->> 'deductions')::numeric, 0)
      - coalesce((salary ->> 'advancePayments')::numeric, 0),
      2
    );
    if salary_net < 0 then raise exception 'Salary net amount cannot be negative'; end if;
    if salary_net <> grand_total_value then raise exception 'Salary net amount must equal the expense total'; end if;

    insert into salary_expense_details (
      expense_id, employee_profile_id, employee_name_snapshot, salary_period_start, salary_period_end,
      basic_salary, allowances, deductions, advance_payments, net_amount, payment_date, payment_status, notes
    ) values (
      target_expense_id,
      nullif(salary ->> 'employeeProfileId', '')::uuid,
      trim(salary ->> 'employeeName'),
      (salary ->> 'periodStart')::date,
      (salary ->> 'periodEnd')::date,
      (salary ->> 'basicSalary')::numeric,
      coalesce((salary ->> 'allowances')::numeric, 0),
      coalesce((salary ->> 'deductions')::numeric, 0),
      coalesce((salary ->> 'advancePayments')::numeric, 0),
      salary_net,
      nullif(salary ->> 'paymentDate', '')::date,
      (salary ->> 'paymentStatus')::salary_payment_status,
      nullif(trim(salary ->> 'notes'), '')
    );
  end if;

  update expenses set
    category_id = target_category.id,
    supplier_id = supplier_id_value,
    payee_snapshot = coalesce(target_supplier.name, nullif(trim(expense_payload ->> 'payee'), '')),
    invoice_number = nullif(trim(expense_payload ->> 'invoiceNumber'), ''),
    description = nullif(trim(expense_payload ->> 'description'), ''),
    subtotal = round(subtotal_value, 2),
    tax_total = round(tax_total_value, 2),
    additional_charges_total = round(charges_total_value, 2),
    discount_total = round(discount_total_value, 2),
    grand_total = round(grand_total_value, 2),
    payment_method = (expense_payload ->> 'paymentMethod')::expense_payment_method,
    update_inventory = coalesce((expense_payload ->> 'updateInventory')::boolean, false),
    updated_by = actor_id
  where id = target_expense_id;
end;
$$;

revoke all on function _write_expense_payload(uuid, jsonb, uuid) from public, authenticated;

create or replace function create_expense(expense_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile profiles;
  new_expense_id uuid;
  request_id uuid;
  requested_status expense_status;
  expense_date_value timestamptz;
  receipt_id_value uuid;
begin
  select * into profile from current_profile();
  if profile.id is null or not has_expense_permission('expenses:create') then raise exception 'Expense creation is not permitted'; end if;

  request_id := (expense_payload ->> 'clientRequestId')::uuid;
  select id into new_expense_id from expenses where branch_id = profile.branch_id and client_request_id = request_id;
  if new_expense_id is not null then return new_expense_id; end if;

  requested_status := coalesce(nullif(expense_payload ->> 'status', '')::expense_status, 'DRAFT');
  if requested_status not in ('DRAFT', 'PENDING_APPROVAL') then raise exception 'New expenses must be draft or pending approval'; end if;
  expense_date_value := (expense_payload ->> 'expenseDate')::timestamptz;

  insert into expenses (
    branch_id, expense_number, client_request_id, expense_date, category_id, payment_method,
    status, created_by, updated_by
  ) values (
    profile.branch_id,
    next_expense_number(profile.branch_id, expense_date_value::date),
    request_id,
    expense_date_value,
    (expense_payload ->> 'categoryId')::uuid,
    (expense_payload ->> 'paymentMethod')::expense_payment_method,
    requested_status,
    profile.id,
    profile.id
  ) returning id into new_expense_id;

  perform _write_expense_payload(new_expense_id, expense_payload, profile.id);

  if jsonb_typeof(expense_payload -> 'receiptIds') = 'array' then
    for receipt_id_value in select value::text::uuid from jsonb_array_elements_text(expense_payload -> 'receiptIds') loop
      update expense_receipts set expense_id = new_expense_id
      where id = receipt_id_value and branch_id = profile.branch_id and uploaded_by = profile.id and expense_id is null;
    end loop;
  end if;

  insert into audit_logs(branch_id, user_id, action, entity, entity_id, new_value)
  select profile.branch_id, profile.id, 'EXPENSE_CREATE', 'expenses', new_expense_id,
    jsonb_build_object('expense_number', expense_number, 'status', status, 'grand_total', grand_total)
  from expenses where id = new_expense_id;

  return new_expense_id;
exception when unique_violation then
  select id into new_expense_id from expenses where branch_id = profile.branch_id and client_request_id = request_id;
  if new_expense_id is not null then return new_expense_id; end if;
  raise;
end;
$$;

create or replace function update_expense(target_expense_id uuid, expected_version integer, expense_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  profile profiles;
  target_expense expenses;
  next_version integer;
  requested_status expense_status;
begin
  select * into profile from current_profile();
  if profile.id is null or not has_expense_permission('expenses:update') then raise exception 'Expense update is not permitted'; end if;
  select * into target_expense from expenses where id = target_expense_id for update;
  if target_expense.id is null or target_expense.branch_id <> profile.branch_id then raise exception 'Expense not found'; end if;
  if target_expense.status not in ('DRAFT', 'PENDING_APPROVAL') then raise exception 'Finalized expenses cannot be edited; void and replace them'; end if;
  if target_expense.version <> expected_version then raise exception 'Expense was changed by another user'; end if;

  requested_status := coalesce(nullif(expense_payload ->> 'status', '')::expense_status, target_expense.status);
  if requested_status not in ('DRAFT', 'PENDING_APPROVAL') then raise exception 'Invalid editable expense status'; end if;

  update expenses set
    expense_date = (expense_payload ->> 'expenseDate')::timestamptz,
    status = requested_status,
    version = version + 1,
    updated_by = profile.id
  where id = target_expense_id
  returning version into next_version;

  perform _write_expense_payload(target_expense_id, expense_payload, profile.id);
  insert into audit_logs(branch_id, user_id, action, entity, entity_id, old_value, new_value)
  values (
    profile.branch_id, profile.id, 'EXPENSE_UPDATE', 'expenses', target_expense_id,
    jsonb_build_object('version', target_expense.version, 'status', target_expense.status, 'grand_total', target_expense.grand_total),
    jsonb_build_object('version', next_version, 'status', requested_status)
  );
  return next_version;
end;
$$;

create or replace function _post_expense_inventory(target_expense_id uuid, actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_expense expenses;
  line expense_items;
  stock inventory_items;
  purchase_unit_cost numeric(14,4);
  next_average numeric(14,4);
begin
  select * into target_expense from expenses where id = target_expense_id for update;
  if not target_expense.update_inventory then return; end if;

  for line in
    select * from expense_items
    where expense_id = target_expense_id and inventory_item_id is not null
    order by id
  loop
    if exists (select 1 from stock_movements where expense_item_id = line.id and movement_type = 'PURCHASE') then
      continue;
    end if;

    select * into stock from inventory_items where id = line.inventory_item_id for update;
    if stock.id is null or stock.branch_id <> target_expense.branch_id then raise exception 'Inventory item is not available in this branch'; end if;
    purchase_unit_cost := round(line.line_total / line.base_quantity, 4);
    next_average := case
      when stock.quantity_on_hand + line.base_quantity <= 0 then purchase_unit_cost
      else round(((stock.quantity_on_hand * stock.average_cost) + (line.base_quantity * purchase_unit_cost)) / (stock.quantity_on_hand + line.base_quantity), 4)
    end;

    update inventory_items set
      quantity_on_hand = quantity_on_hand + line.base_quantity,
      average_cost = next_average,
      updated_by = actor_id
    where id = stock.id;

    insert into stock_movements (
      branch_id, inventory_item_id, movement_type, quantity_delta, unit_cost,
      expense_item_id, performed_by, notes
    ) values (
      target_expense.branch_id, stock.id, 'PURCHASE', line.base_quantity, purchase_unit_cost,
      line.id, actor_id, 'Stock received from expense ' || target_expense.expense_number
    );
    update expense_items set inventory_posted_at = now() where id = line.id;
  end loop;
end;
$$;

revoke all on function _post_expense_inventory(uuid, uuid) from public, authenticated;

create or replace function approve_expense(target_expense_id uuid, expected_version integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  profile profiles;
  target_expense expenses;
  next_version integer;
begin
  select * into profile from current_profile();
  if profile.id is null or not has_expense_permission('expenses:approve') then raise exception 'Expense approval is not permitted'; end if;
  select * into target_expense from expenses where id = target_expense_id for update;
  if target_expense.id is null or target_expense.branch_id <> profile.branch_id then raise exception 'Expense not found'; end if;
  if target_expense.version <> expected_version then raise exception 'Expense was changed by another user'; end if;
  if target_expense.status <> 'PENDING_APPROVAL' then raise exception 'Only pending expenses can be approved'; end if;

  update expenses set status = 'APPROVED', approved_by = profile.id, approved_at = now(), updated_by = profile.id, version = version + 1
  where id = target_expense_id returning version into next_version;
  perform _post_expense_inventory(target_expense_id, profile.id);
  insert into audit_logs(branch_id, user_id, action, entity, entity_id, old_value, new_value)
  values (profile.branch_id, profile.id, 'EXPENSE_APPROVE', 'expenses', target_expense_id,
    jsonb_build_object('status', target_expense.status), jsonb_build_object('status', 'APPROVED', 'version', next_version));
  return next_version;
end;
$$;

create or replace function mark_expense_paid(target_expense_id uuid, expected_version integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  profile profiles;
  target_expense expenses;
  next_version integer;
begin
  select * into profile from current_profile();
  if profile.id is null or not has_expense_permission('expenses:approve') then raise exception 'Expense payment finalization is not permitted'; end if;
  select * into target_expense from expenses where id = target_expense_id for update;
  if target_expense.id is null or target_expense.branch_id <> profile.branch_id then raise exception 'Expense not found'; end if;
  if target_expense.version <> expected_version then raise exception 'Expense was changed by another user'; end if;
  if target_expense.status <> 'APPROVED' then raise exception 'Only approved expenses can be marked paid'; end if;

  perform _post_expense_inventory(target_expense_id, profile.id);
  update expenses set status = 'PAID', paid_at = now(), updated_by = profile.id, version = version + 1
  where id = target_expense_id returning version into next_version;
  insert into audit_logs(branch_id, user_id, action, entity, entity_id, old_value, new_value)
  values (profile.branch_id, profile.id, 'EXPENSE_PAID', 'expenses', target_expense_id,
    jsonb_build_object('status', target_expense.status), jsonb_build_object('status', 'PAID', 'version', next_version));
  return next_version;
end;
$$;

create or replace function void_expense(target_expense_id uuid, expected_version integer, reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  profile profiles;
  target_expense expenses;
  movement stock_movements;
  stock inventory_items;
  next_version integer;
begin
  select * into profile from current_profile();
  if profile.id is null or not has_expense_permission('expenses:void') then raise exception 'Expense voiding is not permitted'; end if;
  if char_length(trim(coalesce(reason, ''))) < 3 then raise exception 'A void reason is required'; end if;
  select * into target_expense from expenses where id = target_expense_id for update;
  if target_expense.id is null or target_expense.branch_id <> profile.branch_id then raise exception 'Expense not found'; end if;
  if target_expense.version <> expected_version then raise exception 'Expense was changed by another user'; end if;
  if target_expense.status = 'VOID' then return target_expense.version; end if;

  for movement in
    select sm.* from stock_movements sm
    join expense_items ei on ei.id = sm.expense_item_id
    where ei.expense_id = target_expense_id and sm.movement_type = 'PURCHASE'
    order by sm.id
  loop
    if exists (select 1 from stock_movements where reversal_of_id = movement.id and movement_type = 'EXPENSE_VOID') then continue; end if;
    select * into stock from inventory_items where id = movement.inventory_item_id for update;
    if stock.quantity_on_hand - movement.quantity_delta < 0 then
      raise exception 'Cannot void because stock has already been consumed; record an inventory adjustment first';
    end if;
    update inventory_items set
      quantity_on_hand = quantity_on_hand - movement.quantity_delta,
      average_cost = case
        when quantity_on_hand - movement.quantity_delta = 0 then 0
        else greatest(0, round(((quantity_on_hand * average_cost) - (movement.quantity_delta * movement.unit_cost)) / (quantity_on_hand - movement.quantity_delta), 4))
      end,
      updated_by = profile.id
    where id = stock.id;
    insert into stock_movements (
      branch_id, inventory_item_id, movement_type, quantity_delta, unit_cost,
      expense_item_id, reversal_of_id, performed_by, notes
    ) values (
      movement.branch_id, movement.inventory_item_id, 'EXPENSE_VOID', -movement.quantity_delta,
      movement.unit_cost, movement.expense_item_id, movement.id, profile.id,
      'Reversal for voided expense ' || target_expense.expense_number
    );
  end loop;

  update expenses set status = 'VOID', voided_by = profile.id, voided_at = now(), void_reason = trim(reason), updated_by = profile.id, version = version + 1
  where id = target_expense_id returning version into next_version;
  insert into audit_logs(branch_id, user_id, action, entity, entity_id, old_value, new_value)
  values (profile.branch_id, profile.id, 'EXPENSE_VOID', 'expenses', target_expense_id,
    jsonb_build_object('status', target_expense.status), jsonb_build_object('status', 'VOID', 'reason', trim(reason), 'version', next_version));
  return next_version;
end;
$$;

create or replace function record_expense_reimbursement(
  target_funding_id uuid,
  reimbursement_amount numeric,
  target_date timestamptz,
  reimbursement_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile profiles;
  funding expense_fundings;
  target_expense expenses;
  already_reimbursed numeric(14,2);
  new_reimbursement_id uuid;
begin
  select * into profile from current_profile();
  if profile.id is null or not has_expense_permission('expenses:reimburse') then raise exception 'Reimbursement processing is not permitted'; end if;
  select * into funding from expense_fundings where id = target_funding_id for update;
  select * into target_expense from expenses where id = funding.expense_id;
  if funding.id is null or funding.source <> 'PERSONAL' or not funding.reimbursement_required or target_expense.branch_id <> profile.branch_id then raise exception 'Reimbursable personal funding was not found'; end if;
  if target_expense.status not in ('APPROVED', 'PAID') then raise exception 'Only approved or paid expenses can be reimbursed'; end if;
  if reimbursement_amount <= 0 then raise exception 'Reimbursement must be greater than zero'; end if;
  select coalesce(sum(amount), 0) into already_reimbursed from expense_reimbursements where expense_funding_id = funding.id;
  if already_reimbursed + reimbursement_amount > funding.amount then raise exception 'Reimbursement exceeds the remaining personal amount'; end if;

  insert into expense_reimbursements(expense_funding_id, amount, reimbursement_date, processed_by, notes)
  values (funding.id, round(reimbursement_amount, 2), coalesce(target_date, now()), profile.id, nullif(trim(reimbursement_notes), ''))
  returning id into new_reimbursement_id;
  insert into audit_logs(branch_id, user_id, action, entity, entity_id, new_value)
  values (profile.branch_id, profile.id, 'EXPENSE_REIMBURSE', 'expense_reimbursements', new_reimbursement_id,
    jsonb_build_object('expense_id', target_expense.id, 'funding_id', funding.id, 'amount', round(reimbursement_amount, 2),
      'status', expense_reimbursement_status(funding.amount, already_reimbursed + reimbursement_amount)));
  return new_reimbursement_id;
end;
$$;

create or replace function review_expense_receipt(target_receipt_id uuid, corrected_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile profiles;
  receipt expense_receipts;
begin
  select * into profile from current_profile();
  if profile.id is null or not has_expense_permission('expenses:receipts') then raise exception 'Receipt review is not permitted'; end if;
  select * into receipt from expense_receipts where id = target_receipt_id for update;
  if receipt.id is null or receipt.branch_id <> profile.branch_id then raise exception 'Receipt not found'; end if;
  if corrected_payload is null or jsonb_typeof(corrected_payload) <> 'object' then raise exception 'Corrected receipt data is required'; end if;
  update expense_receipts set corrected_data = corrected_payload, processing_status = 'REVIEWED', reviewed_by = profile.id, reviewed_at = now(), error_message = null
  where id = receipt.id;
  insert into audit_logs(branch_id, user_id, action, entity, entity_id, old_value, new_value)
  values (profile.branch_id, profile.id, 'EXPENSE_RECEIPT_REVIEW', 'expense_receipts', receipt.id,
    jsonb_build_object('status', receipt.processing_status), jsonb_build_object('status', 'REVIEWED'));
end;
$$;

alter table expense_categories enable row level security;
alter table suppliers enable row level security;
alter table inventory_items enable row level security;
alter table inventory_unit_conversions enable row level security;
alter table expense_counters enable row level security;
alter table expenses enable row level security;
alter table expense_items enable row level security;
alter table expense_fundings enable row level security;
alter table expense_reimbursements enable row level security;
alter table salary_expense_details enable row level security;
alter table expense_receipts enable row level security;
alter table stock_movements enable row level security;

create policy "expense category readers" on expense_categories for select
using (same_branch(branch_id) and has_expense_permission('expenses:read'));
create policy "expense category managers" on expense_categories for all
using (same_branch(branch_id) and has_expense_permission('expenses:categories'))
with check (same_branch(branch_id) and has_expense_permission('expenses:categories'));

create policy "supplier readers" on suppliers for select
using (same_branch(branch_id) and has_expense_permission('expenses:read'));
create policy "supplier managers" on suppliers for all
using (same_branch(branch_id) and has_expense_permission('expenses:create'))
with check (same_branch(branch_id) and has_expense_permission('expenses:create'));

create policy "inventory readers" on inventory_items for select
using (same_branch(branch_id) and has_expense_permission('expenses:read'));
create policy "inventory managers" on inventory_items for all
using (same_branch(branch_id) and has_expense_permission('expenses:inventory'))
with check (same_branch(branch_id) and has_expense_permission('expenses:inventory'));
create policy "inventory conversion readers" on inventory_unit_conversions for select
using (exists (select 1 from inventory_items ii where ii.id = inventory_item_id and same_branch(ii.branch_id) and has_expense_permission('expenses:read')));
create policy "inventory conversion managers" on inventory_unit_conversions for all
using (exists (select 1 from inventory_items ii where ii.id = inventory_item_id and same_branch(ii.branch_id) and has_expense_permission('expenses:inventory')))
with check (exists (select 1 from inventory_items ii where ii.id = inventory_item_id and same_branch(ii.branch_id) and has_expense_permission('expenses:inventory')));

create policy "expense readers" on expenses for select
using (same_branch(branch_id) and has_expense_permission('expenses:read'));
create policy "expense item readers" on expense_items for select
using (exists (select 1 from expenses e where e.id = expense_id and same_branch(e.branch_id) and has_expense_permission('expenses:read')));
create policy "expense funding readers" on expense_fundings for select
using (exists (select 1 from expenses e where e.id = expense_id and same_branch(e.branch_id) and has_expense_permission('expenses:read')));
create policy "expense reimbursement readers" on expense_reimbursements for select
using (exists (
  select 1 from expense_fundings ef join expenses e on e.id = ef.expense_id
  where ef.id = expense_funding_id and same_branch(e.branch_id) and has_expense_permission('expenses:read')
));
create policy "salary expense readers" on salary_expense_details for select
using (exists (select 1 from expenses e where e.id = expense_id and same_branch(e.branch_id) and has_expense_permission('expenses:salaries')));
create policy "stock movement readers" on stock_movements for select
using (same_branch(branch_id) and has_expense_permission('expenses:read'));

create policy "receipt readers" on expense_receipts for select
using (same_branch(branch_id) and has_expense_permission('expenses:read'));
create policy "receipt uploaders" on expense_receipts for insert
with check (same_branch(branch_id) and uploaded_by = auth.uid() and has_expense_permission('expenses:receipts'));

drop policy if exists "expense receipt object readers" on storage.objects;
drop policy if exists "expense receipt object uploaders" on storage.objects;
drop policy if exists "expense receipt object deleters" on storage.objects;
create policy "expense receipt object readers" on storage.objects for select to authenticated
using (
  bucket_id = 'expense-receipts'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.active and p.branch_id::text = (storage.foldername(name))[1])
  and has_expense_permission('expenses:read')
);
create policy "expense receipt object uploaders" on storage.objects for insert to authenticated
with check (
  bucket_id = 'expense-receipts'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.active and p.branch_id::text = (storage.foldername(name))[1])
  and has_expense_permission('expenses:receipts')
);
create policy "expense receipt object deleters" on storage.objects for delete to authenticated
using (
  bucket_id = 'expense-receipts'
  and owner_id = auth.uid()::text
  and exists (select 1 from profiles p where p.id = auth.uid() and p.active and p.branch_id::text = (storage.foldername(name))[1])
  and has_expense_permission('expenses:receipts')
  and not exists (select 1 from expense_receipts er where er.storage_path = name)
);

grant execute on function has_expense_permission(text) to authenticated;
grant execute on function create_expense(jsonb) to authenticated;
grant execute on function update_expense(uuid, integer, jsonb) to authenticated;
grant execute on function approve_expense(uuid, integer) to authenticated;
grant execute on function mark_expense_paid(uuid, integer) to authenticated;
grant execute on function void_expense(uuid, integer, text) to authenticated;
grant execute on function record_expense_reimbursement(uuid, numeric, timestamptz, text) to authenticated;
grant execute on function review_expense_receipt(uuid, jsonb) to authenticated;

revoke all on expense_counters from anon, authenticated;
revoke all on function next_expense_number(uuid, date) from public, anon, authenticated;
revoke all on function create_expense(jsonb) from public, anon;
revoke all on function update_expense(uuid, integer, jsonb) from public, anon;
revoke all on function approve_expense(uuid, integer) from public, anon;
revoke all on function mark_expense_paid(uuid, integer) from public, anon;
revoke all on function void_expense(uuid, integer, text) from public, anon;
revoke all on function record_expense_reimbursement(uuid, numeric, timestamptz, text) from public, anon;
revoke all on function review_expense_receipt(uuid, jsonb) from public, anon;

create policy "users read own permissions" on user_permissions for select
using (profile_id = auth.uid());
