-- Stable form behavior and structured category details for progressive expense entry.

create type expense_form_type as enum (
  'GENERAL',
  'SALARY',
  'RENT',
  'UTILITY',
  'INVENTORY_PURCHASE',
  'EQUIPMENT_REPAIR'
);

alter table expense_categories
add column form_type expense_form_type;

update expense_categories
set form_type = case
  when kind = 'SALARY' then 'SALARY'::expense_form_type
  when kind = 'INVENTORY' then 'INVENTORY_PURCHASE'::expense_form_type
  when lower(name) = 'shop rent' then 'RENT'::expense_form_type
  when lower(name) = 'utility bills' then 'UTILITY'::expense_form_type
  when lower(name) = 'equipment purchases and repairs' then 'EQUIPMENT_REPAIR'::expense_form_type
  else 'GENERAL'::expense_form_type
end;

alter table expense_categories
alter column form_type set default 'GENERAL',
alter column form_type set not null;

alter table expense_categories
add constraint expense_categories_kind_form_type_check check (
  (form_type = 'SALARY' and kind = 'SALARY')
  or (form_type = 'INVENTORY_PURCHASE' and kind = 'INVENTORY')
  or (form_type in ('GENERAL', 'RENT', 'UTILITY', 'EQUIPMENT_REPAIR') and kind = 'OPERATIONAL')
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  profile_id uuid references profiles(id) on delete set null,
  employee_number text,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  job_title text,
  active boolean not null default true,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index employees_profile_unique on employees(profile_id) where profile_id is not null;
create unique index employees_branch_number_unique on employees(branch_id, lower(employee_number)) where employee_number is not null;
create index employees_branch_active_name_idx on employees(branch_id, active, full_name);

create or replace function validate_employee_profile_branch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.profile_id is not null and not exists (
    select 1 from profiles p where p.id = new.profile_id and p.branch_id = new.branch_id
  ) then raise exception 'Linked user profile must belong to the employee branch'; end if;
  return new;
end;
$$;

create trigger employees_validate_profile_branch
before insert or update of profile_id, branch_id on employees
for each row execute function validate_employee_profile_branch();

revoke all on function validate_employee_profile_branch() from public, anon, authenticated;

alter table salary_expense_details
add column employee_id uuid references employees(id);

create index salary_expense_employee_record_idx on salary_expense_details(employee_id) where employee_id is not null;

create table expense_category_details (
  expense_id uuid primary key references expenses(id) on delete cascade,
  form_type expense_form_type not null,
  period_start date,
  period_end date,
  due_date date,
  payment_date date,
  utility_type text,
  account_number text,
  equipment_details text,
  service_date date,
  warranty_information text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create index expense_category_details_form_period_idx on expense_category_details(form_type, period_start desc, period_end desc);
create trigger employees_updated_at before update on employees for each row execute function set_updated_at();
create trigger expense_category_details_updated_at before update on expense_category_details for each row execute function set_updated_at();

alter table employees enable row level security;
alter table expense_category_details enable row level security;

create policy "employee readers" on employees for select
using (same_branch(branch_id) and has_expense_permission('expenses:salaries'));
create policy "employee managers" on employees for all
using (same_branch(branch_id) and has_expense_permission('expenses:salaries'))
with check (same_branch(branch_id) and has_expense_permission('expenses:salaries'));
create policy "expense category detail readers" on expense_category_details for select
using (exists (
  select 1 from expenses e
  where e.id = expense_id and same_branch(e.branch_id) and has_expense_permission('expenses:read')
));

grant select, insert, update on employees to authenticated;
grant select on expense_category_details to authenticated;

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
  target_employee employees;
  line jsonb;
  funding jsonb;
  salary jsonb;
  category_details jsonb;
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
  employee_id_value uuid;
  employee_profile_id_value uuid;
  employee_name_value text;
  effective_payee text;
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
  effective_payee := coalesce(target_supplier.name, nullif(trim(expense_payload ->> 'payee'), ''));

  if jsonb_typeof(expense_payload -> 'items') <> 'array' or jsonb_array_length(expense_payload -> 'items') = 0 then
    raise exception 'At least one expense item is required';
  end if;
  if jsonb_array_length(expense_payload -> 'items') > 100 then raise exception 'At most 100 expense items are allowed'; end if;

  delete from salary_expense_details where expense_id = target_expense_id;
  delete from expense_category_details where expense_id = target_expense_id;
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
    ) then raise exception 'Inventory item is not available in this branch'; end if;
    if target_category.form_type = 'INVENTORY_PURCHASE'
      and coalesce((expense_payload ->> 'updateInventory')::boolean, false)
      and inventory_id is null then
      raise exception 'Match every purchased line to an inventory item when stock updating is enabled';
    end if;

    insert into expense_items (
      expense_id, inventory_item_id, description, quantity, unit_type, conversion_factor,
      base_quantity, unit_price, tax_amount, additional_charges, discount_amount, line_total
    ) values (
      target_expense_id, inventory_id, trim(line ->> 'description'), quantity_value,
      (line ->> 'unitType')::expense_unit_type, conversion_value,
      round(quantity_value * conversion_value, 3), unit_price_value, tax_value,
      charges_value, discount_value, line_total_value
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
      target_expense_id, (funding ->> 'source')::expense_fund_source, (funding ->> 'amount')::numeric,
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
  if target_category.form_type = 'SALARY' and (salary is null or salary = 'null'::jsonb) then
    raise exception 'Salary details are required for a salary expense';
  end if;
  if target_category.form_type <> 'SALARY' and salary is not null and salary <> 'null'::jsonb then
    raise exception 'Salary details are only valid for salary categories';
  end if;
  if salary is not null and salary <> 'null'::jsonb then
    employee_id_value := nullif(salary ->> 'employeeId', '')::uuid;
    employee_profile_id_value := nullif(salary ->> 'employeeProfileId', '')::uuid;
    employee_name_value := trim(salary ->> 'employeeName');
    if employee_id_value is not null then
      select * into target_employee from employees
      where id = employee_id_value and branch_id = target_expense.branch_id and active = true;
      if target_employee.id is null then raise exception 'Employee is not available in this branch'; end if;
      employee_name_value := target_employee.full_name;
      employee_profile_id_value := coalesce(target_employee.profile_id, employee_profile_id_value);
    end if;
    if employee_profile_id_value is not null and not exists (
      select 1 from profiles p where p.id = employee_profile_id_value and p.branch_id = target_expense.branch_id and p.active
    ) then raise exception 'Employee profile is not available in this branch'; end if;
    salary_net := round(
      coalesce((salary ->> 'basicSalary')::numeric, 0)
      + coalesce((salary ->> 'allowances')::numeric, 0)
      - coalesce((salary ->> 'deductions')::numeric, 0)
      - coalesce((salary ->> 'advancePayments')::numeric, 0), 2
    );
    if salary_net < 0 then raise exception 'Salary net amount cannot be negative'; end if;
    if salary_net <> grand_total_value then raise exception 'Salary net amount must equal the expense total'; end if;

    insert into salary_expense_details (
      expense_id, employee_id, employee_profile_id, employee_name_snapshot,
      salary_period_start, salary_period_end, basic_salary, allowances, deductions,
      advance_payments, net_amount, payment_date, payment_status, notes
    ) values (
      target_expense_id, employee_id_value, employee_profile_id_value, employee_name_value,
      (salary ->> 'periodStart')::date, (salary ->> 'periodEnd')::date,
      (salary ->> 'basicSalary')::numeric, coalesce((salary ->> 'allowances')::numeric, 0),
      coalesce((salary ->> 'deductions')::numeric, 0), coalesce((salary ->> 'advancePayments')::numeric, 0),
      salary_net, nullif(salary ->> 'paymentDate', '')::date,
      'PENDING', nullif(trim(salary ->> 'notes'), '')
    );
  end if;

  category_details := expense_payload -> 'categoryDetails';
  if target_category.form_type in ('RENT', 'UTILITY', 'EQUIPMENT_REPAIR') then
    if category_details is null or category_details = 'null'::jsonb then
      raise exception 'Category-specific details are required';
    end if;
    if target_expense.status = 'PENDING_APPROVAL' then
      if target_category.form_type = 'RENT' and (
        nullif(category_details ->> 'periodStart', '') is null
        or nullif(category_details ->> 'periodEnd', '') is null
        or effective_payee is null
      ) then raise exception 'Rent period and landlord are required'; end if;
      if target_category.form_type = 'UTILITY' and (
        char_length(trim(coalesce(category_details ->> 'utilityType', ''))) < 2
        or char_length(trim(coalesce(category_details ->> 'accountNumber', ''))) < 2
        or nullif(category_details ->> 'periodStart', '') is null
        or nullif(category_details ->> 'periodEnd', '') is null
      ) then raise exception 'Utility type, account number, and billing period are required'; end if;
      if target_category.form_type = 'EQUIPMENT_REPAIR' and (
        char_length(trim(coalesce(category_details ->> 'equipmentDetails', ''))) < 2
        or nullif(category_details ->> 'serviceDate', '') is null
        or effective_payee is null
      ) then raise exception 'Equipment details, supplier or technician, and service date are required'; end if;
    end if;

    insert into expense_category_details (
      expense_id, form_type, period_start, period_end, due_date, payment_date,
      utility_type, account_number, equipment_details, service_date, warranty_information
    ) values (
      target_expense_id, target_category.form_type,
      nullif(category_details ->> 'periodStart', '')::date,
      nullif(category_details ->> 'periodEnd', '')::date,
      nullif(category_details ->> 'dueDate', '')::date,
      nullif(category_details ->> 'paymentDate', '')::date,
      nullif(trim(category_details ->> 'utilityType'), ''),
      nullif(trim(category_details ->> 'accountNumber'), ''),
      nullif(trim(category_details ->> 'equipmentDetails'), ''),
      nullif(category_details ->> 'serviceDate', '')::date,
      nullif(trim(category_details ->> 'warrantyInformation'), '')
    );
  end if;

  if target_expense.status = 'PENDING_APPROVAL'
    and target_category.form_type = 'GENERAL'
    and char_length(trim(coalesce(expense_payload ->> 'description', ''))) < 2 then
    raise exception 'A description is required for a general expense';
  end if;

  update expenses set
    category_id = target_category.id,
    supplier_id = supplier_id_value,
    payee_snapshot = effective_payee,
    invoice_number = nullif(trim(expense_payload ->> 'invoiceNumber'), ''),
    description = nullif(trim(expense_payload ->> 'description'), ''),
    subtotal = round(subtotal_value, 2), tax_total = round(tax_total_value, 2),
    additional_charges_total = round(charges_total_value, 2),
    discount_total = round(discount_total_value, 2), grand_total = round(grand_total_value, 2),
    payment_method = (expense_payload ->> 'paymentMethod')::expense_payment_method,
    update_inventory = coalesce((expense_payload ->> 'updateInventory')::boolean, false),
    updated_by = actor_id
  where id = target_expense_id;
end;
$$;

revoke all on function _write_expense_payload(uuid, jsonb, uuid) from public, authenticated;

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
  update salary_expense_details set
    payment_status = 'PAID',
    payment_date = coalesce(payment_date, current_date)
  where expense_id = target_expense_id;
  insert into audit_logs(branch_id, user_id, action, entity, entity_id, old_value, new_value)
  values (profile.branch_id, profile.id, 'EXPENSE_PAID', 'expenses', target_expense_id,
    jsonb_build_object('status', target_expense.status), jsonb_build_object('status', 'PAID', 'version', next_version));
  return next_version;
end;
$$;

grant execute on function mark_expense_paid(uuid, integer) to authenticated;
revoke all on function mark_expense_paid(uuid, integer) from public, anon;
