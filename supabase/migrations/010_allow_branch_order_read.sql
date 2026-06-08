create or replace function can_read_branch_orders(target_branch_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and active = true
      and branch_id = target_branch_id
      and role in ('ADMIN', 'CASHIER')
  );
$$;

drop policy if exists "admin read branch orders" on orders;
drop policy if exists "cashier read own orders" on orders;
drop policy if exists "read order items by visible order" on order_items;
drop policy if exists "read payments by visible order" on payments;

create policy "branch users read branch orders"
on orders
for select
using (can_read_branch_orders(branch_id));

create policy "branch users read branch order items"
on order_items
for select
using (
  exists (
    select 1
    from orders
    where orders.id = order_items.order_id
      and can_read_branch_orders(orders.branch_id)
  )
);

create policy "branch users read branch payments"
on payments
for select
using (
  exists (
    select 1
    from orders
    where orders.id = payments.order_id
      and can_read_branch_orders(orders.branch_id)
  )
);
