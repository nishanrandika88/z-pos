-- Allow administrators to reopen a voided expense as an editable draft while
-- retaining its completed purchase/reversal stock history.

alter type audit_action add value if not exists 'EXPENSE_REOPEN';

alter table stock_movements
add column expense_id uuid references expenses(id) on delete set null;

update stock_movements sm
set expense_id = ei.expense_id
from expense_items ei
where ei.id = sm.expense_item_id
  and sm.expense_id is null;

create index stock_movements_expense_idx
on stock_movements(expense_id, created_at desc)
where expense_id is not null;

alter table stock_movements
drop constraint stock_movements_expense_item_id_fkey;

alter table stock_movements
add constraint stock_movements_expense_item_id_fkey
foreign key (expense_item_id) references expense_items(id) on delete set null;

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
      expense_id, expense_item_id, performed_by, notes
    ) values (
      target_expense.branch_id, stock.id, 'PURCHASE', line.base_quantity, purchase_unit_cost,
      target_expense_id, line.id, actor_id, 'Stock received from expense ' || target_expense.expense_number
    );
    update expense_items set inventory_posted_at = now() where id = line.id;
  end loop;
end;
$$;

revoke all on function _post_expense_inventory(uuid, uuid) from public, authenticated;

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
    select sm.*
    from stock_movements sm
    where sm.expense_id = target_expense_id
      and sm.movement_type = 'PURCHASE'
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
      expense_id, expense_item_id, reversal_of_id, performed_by, notes
    ) values (
      movement.branch_id, movement.inventory_item_id, 'EXPENSE_VOID', -movement.quantity_delta,
      movement.unit_cost, target_expense_id, movement.expense_item_id, movement.id, profile.id,
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

create or replace function reopen_void_expense(target_expense_id uuid, expected_version integer)
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
  if profile.id is null or profile.role <> 'ADMIN' then
    raise exception 'Only an administrator can reopen a voided expense';
  end if;

  select * into target_expense from expenses where id = target_expense_id for update;
  if target_expense.id is null or target_expense.branch_id <> profile.branch_id then raise exception 'Expense not found'; end if;
  if target_expense.version <> expected_version then raise exception 'Expense was changed by another user'; end if;
  if target_expense.status <> 'VOID' then raise exception 'Only a voided expense can be reopened'; end if;

  if exists (
    select 1
    from expense_reimbursements er
    join expense_fundings ef on ef.id = er.expense_funding_id
    where ef.expense_id = target_expense_id
  ) then
    raise exception 'A reimbursed expense cannot be reopened; create a replacement expense instead';
  end if;

  if exists (
    select 1
    from stock_movements purchase
    where purchase.expense_id = target_expense_id
      and purchase.movement_type = 'PURCHASE'
      and not exists (
        select 1 from stock_movements reversal
        where reversal.reversal_of_id = purchase.id
          and reversal.movement_type = 'EXPENSE_VOID'
      )
  ) then
    raise exception 'The expense stock reversal is incomplete and it cannot be reopened';
  end if;

  -- Historical purchase/reversal pairs remain linked to the expense, while the
  -- editable item rows are released to be replaced by update_expense.
  update stock_movements
  set expense_item_id = null
  where expense_id = target_expense_id
    and expense_item_id is not null;

  update expense_items
  set inventory_posted_at = null
  where expense_id = target_expense_id;

  update salary_expense_details
  set payment_status = 'PENDING'
  where expense_id = target_expense_id;

  update expenses set
    status = 'DRAFT',
    approved_by = null,
    approved_at = null,
    paid_at = null,
    voided_by = null,
    voided_at = null,
    void_reason = null,
    updated_by = profile.id,
    version = version + 1
  where id = target_expense_id
  returning version into next_version;

  insert into audit_logs(branch_id, user_id, action, entity, entity_id, old_value, new_value)
  values (
    profile.branch_id,
    profile.id,
    'EXPENSE_REOPEN',
    'expenses',
    target_expense_id,
    jsonb_build_object('status', target_expense.status, 'version', target_expense.version, 'void_reason', target_expense.void_reason),
    jsonb_build_object('status', 'DRAFT', 'version', next_version)
  );
  return next_version;
end;
$$;

grant execute on function reopen_void_expense(uuid, integer) to authenticated;
revoke all on function reopen_void_expense(uuid, integer) from public, anon;
