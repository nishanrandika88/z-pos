alter type audit_action add value if not exists 'ORDER_PAYMENT_CORRECTION';

create or replace function correct_order_payment(
  target_order_id uuid,
  payment_payload jsonb,
  correction_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile profiles;
  target_order orders;
  current_payment payments;
  requested_method text;
  requested_tendered numeric(12, 2);
  requested_card_type text;
  requested_bank_name text;
  requested_last4 text;
begin
  select * into profile from current_profile();
  if profile.id is null then
    raise exception 'Unauthorized';
  end if;

  select * into target_order
  from orders
  where id = target_order_id
  for update;

  if target_order.id is null then
    raise exception 'Order not found';
  end if;

  if profile.role <> 'ADMIN' or profile.branch_id <> target_order.branch_id then
    raise exception 'Only a branch administrator can correct an order payment';
  end if;

  if target_order.status <> 'COMPLETED' then
    raise exception 'Only completed orders can have their payment corrected';
  end if;

  if nullif(btrim(correction_reason), '') is null then
    raise exception 'A correction reason is required';
  end if;

  select * into current_payment
  from payments
  where order_id = target_order.id
  order by created_at, id
  limit 1
  for update;

  if current_payment.id is null then
    raise exception 'Order payment not found';
  end if;

  if (select count(*) from payments where order_id = target_order.id) <> 1 then
    raise exception 'Orders with multiple payments cannot be corrected here';
  end if;

  requested_method := upper(coalesce(payment_payload ->> 'method', ''));
  if requested_method not in ('CASH', 'CARD', 'LANKAQR', 'BANK_TRANSFER') then
    raise exception 'Unsupported payment method';
  end if;

  if requested_method = 'CASH' then
    begin
      requested_tendered := (payment_payload ->> 'amountTendered')::numeric;
    exception when invalid_text_representation then
      raise exception 'Enter a valid cash amount tendered';
    end;

    if requested_tendered is null or requested_tendered < target_order.grand_total then
      raise exception 'Cash tendered cannot be less than the order total';
    end if;

    update payments
    set method = 'CASH',
        amount = target_order.grand_total,
        amount_tendered = requested_tendered,
        balance_returned = requested_tendered - target_order.grand_total,
        card_type = null,
        bank_name = null,
        card_last4 = null,
        masked_card_number = null
    where id = current_payment.id;
  elsif requested_method = 'CARD' then
    requested_card_type := nullif(btrim(payment_payload ->> 'cardType'), '');
    requested_bank_name := nullif(btrim(payment_payload ->> 'bankName'), '');
    requested_last4 := nullif(btrim(payment_payload ->> 'last4'), '');

    if requested_card_type is null or requested_bank_name is null or requested_last4 is null or requested_last4 !~ '^[0-9]{4}$' then
      raise exception 'Card type, bank name, and the last 4 card digits are required';
    end if;

    update payments
    set method = 'CARD',
        amount = target_order.grand_total,
        amount_tendered = null,
        balance_returned = null,
        card_type = requested_card_type,
        bank_name = requested_bank_name,
        card_last4 = requested_last4,
        masked_card_number = 'XXXX XXXX XXXX ' || requested_last4
    where id = current_payment.id;
  else
    update payments
    set method = requested_method::payment_method,
        amount = target_order.grand_total,
        amount_tendered = null,
        balance_returned = null,
        card_type = null,
        bank_name = null,
        card_last4 = null,
        masked_card_number = null
    where id = current_payment.id;
  end if;

  insert into audit_logs(branch_id, user_id, action, entity, entity_id, old_value, new_value)
  values (
    target_order.branch_id,
    profile.id,
    'ORDER_PAYMENT_CORRECTION',
    'payments',
    current_payment.id,
    jsonb_build_object(
      'order_id', target_order.id,
      'order_number', target_order.order_number,
      'method', current_payment.method,
      'amount', current_payment.amount,
      'amount_tendered', current_payment.amount_tendered,
      'balance_returned', current_payment.balance_returned,
      'card_type', current_payment.card_type,
      'bank_name', current_payment.bank_name,
      'card_last4', current_payment.card_last4
    ),
    jsonb_build_object(
      'order_id', target_order.id,
      'order_number', target_order.order_number,
      'method', requested_method,
      'amount', target_order.grand_total,
      'amount_tendered', case when requested_method = 'CASH' then requested_tendered else null end,
      'balance_returned', case when requested_method = 'CASH' then requested_tendered - target_order.grand_total else null end,
      'card_type', case when requested_method = 'CARD' then requested_card_type else null end,
      'bank_name', case when requested_method = 'CARD' then requested_bank_name else null end,
      'card_last4', case when requested_method = 'CARD' then requested_last4 else null end,
      'reason', btrim(correction_reason)
    )
  );
end;
$$;

revoke all on function correct_order_payment(uuid, jsonb, text) from public;
grant execute on function correct_order_payment(uuid, jsonb, text) to authenticated;
