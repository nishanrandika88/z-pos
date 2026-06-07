create or replace function audit_receipt_reprint(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile profiles;
  target_order orders;
  can_reprint boolean;
begin
  select * into profile from current_profile();
  if profile.id is null then
    raise exception 'Unauthorized';
  end if;

  select * into target_order from orders where id = target_order_id;
  if target_order.id is null then
    raise exception 'Order not found';
  end if;

  can_reprint :=
    (profile.role = 'ADMIN' and profile.branch_id = target_order.branch_id)
    or (
      profile.id = target_order.cashier_id
      and exists (
        select 1
        from user_permissions
        where profile_id = profile.id
          and permission = 'orders:reprint'
      )
    );

  if not can_reprint then
    raise exception 'Reprint not permitted';
  end if;

  insert into audit_logs(branch_id, user_id, action, entity, entity_id, new_value)
  values (
    target_order.branch_id,
    profile.id,
    'RECEIPT_REPRINT',
    'orders',
    target_order.id,
    jsonb_build_object('order_number', target_order.order_number)
  );
end;
$$;
