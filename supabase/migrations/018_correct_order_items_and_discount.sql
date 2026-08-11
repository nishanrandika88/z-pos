alter type audit_action add value if not exists 'ORDER_CONTENT_CORRECTION';

create or replace function correct_order_contents(
  target_order_id uuid,
  correction_payload jsonb,
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
  catalog_item items;
  added_item jsonb;
  added_item_id uuid;
  added_quantity numeric(12, 3);
  added_gross numeric(12, 2);
  added_discount numeric(12, 2);
  best_discount_percentage numeric(5, 2);
  added_items_count integer;
  seen_item_ids uuid[] := '{}';
  added_items_audit jsonb := '[]'::jsonb;
  discount_mode text;
  discount_value numeric(12, 2);
  new_subtotal numeric(12, 2);
  new_automatic_discount numeric(12, 2);
  discountable_total numeric(12, 2);
  new_manual_discount numeric(12, 2);
  previous_taxable_total numeric(12, 2);
  applied_tax_rate numeric;
  new_tax_total numeric(12, 2);
  new_grand_total numeric(12, 2);
  requested_cash_tendered numeric(12, 2);
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
    raise exception 'Only a branch administrator can correct order items or discounts';
  end if;

  if target_order.status <> 'COMPLETED' then
    raise exception 'Only completed orders can be corrected';
  end if;

  if nullif(btrim(correction_reason), '') is null then
    raise exception 'A correction reason is required';
  end if;

  if jsonb_typeof(coalesce(correction_payload -> 'addedItems', '[]'::jsonb)) <> 'array' then
    raise exception 'Added items must be an array';
  end if;

  added_items_count := jsonb_array_length(coalesce(correction_payload -> 'addedItems', '[]'::jsonb));
  if added_items_count > 100 then
    raise exception 'No more than 100 items can be added in one correction';
  end if;

  discount_mode := upper(coalesce(correction_payload ->> 'discountMode', ''));
  if discount_mode not in ('PERCENTAGE', 'FIXED') then
    raise exception 'Discount mode must be percentage or fixed amount';
  end if;

  begin
    discount_value := (correction_payload ->> 'discountValue')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Enter a valid bill discount';
  end;

  if discount_value is null or discount_value < 0 then
    raise exception 'Bill discount cannot be negative';
  end if;
  if discount_mode = 'PERCENTAGE' and discount_value > 100 then
    raise exception 'Bill discount percentage cannot exceed 100';
  end if;

  for added_item in
    select value from jsonb_array_elements(coalesce(correction_payload -> 'addedItems', '[]'::jsonb))
  loop
    begin
      added_item_id := (added_item ->> 'itemId')::uuid;
      added_quantity := (added_item ->> 'quantity')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each added item needs a valid item and quantity';
    end;

    if added_item_id is null or added_quantity is null or added_quantity <= 0 or added_quantity > 1000 then
      raise exception 'Added item quantity must be greater than 0 and no more than 1000';
    end if;
    if added_item_id = any(seen_item_ids) then
      raise exception 'Each item can appear only once in a correction';
    end if;
    seen_item_ids := array_append(seen_item_ids, added_item_id);

    select * into catalog_item
    from items
    where id = added_item_id
      and branch_id = target_order.branch_id;

    if catalog_item.id is null then
      raise exception 'An added item was not found in this branch';
    end if;

    select d.percentage into best_discount_percentage
    from discounts d
    where d.branch_id = target_order.branch_id
      and d.active = true
      and (
        (d.applicable_type = 'ITEM' and d.applicable_id = catalog_item.id)
        or (d.applicable_type = 'CATEGORY' and d.applicable_id = catalog_item.category_id)
      )
    order by d.percentage desc
    limit 1;

    added_gross := round(catalog_item.selling_price * added_quantity, 2);
    added_discount := round(added_gross * coalesce(best_discount_percentage, 0) / 100, 2);

    insert into order_items(
      order_id, item_id, item_code, item_name, quantity, unit_price, discount_total, line_total
    ) values (
      target_order.id,
      catalog_item.id,
      catalog_item.item_code,
      catalog_item.item_name,
      added_quantity,
      catalog_item.selling_price,
      added_discount,
      added_gross - added_discount
    );

    added_items_audit := added_items_audit || jsonb_build_array(jsonb_build_object(
      'item_id', catalog_item.id,
      'item_code', catalog_item.item_code,
      'item_name', catalog_item.item_name,
      'quantity', added_quantity,
      'unit_price', catalog_item.selling_price,
      'discount_total', added_discount,
      'line_total', added_gross - added_discount
    ));
  end loop;

  select
    coalesce(round(sum(unit_price * quantity), 2), 0),
    coalesce(round(sum(discount_total), 2), 0)
  into new_subtotal, new_automatic_discount
  from order_items
  where order_id = target_order.id;

  discountable_total := greatest(new_subtotal - new_automatic_discount, 0);
  if discount_mode = 'PERCENTAGE' then
    new_manual_discount := round(discountable_total * discount_value / 100, 2);
  else
    new_manual_discount := round(discount_value, 2);
  end if;

  if new_manual_discount > discountable_total then
    raise exception 'Bill discount cannot exceed the amount after automatic discounts';
  end if;

  previous_taxable_total := greatest(
    target_order.subtotal - target_order.automatic_discount_total - target_order.manual_discount_total,
    0
  );
  if previous_taxable_total > 0 then
    applied_tax_rate := target_order.tax_total * 100 / previous_taxable_total;
  else
    select coalesce(tax_rate, 0) into applied_tax_rate
    from company_settings
    where branch_id = target_order.branch_id;
    applied_tax_rate := coalesce(applied_tax_rate, 0);
  end if;

  new_tax_total := round(greatest(discountable_total - new_manual_discount, 0) * applied_tax_rate / 100, 2);
  new_grand_total := round(greatest(discountable_total - new_manual_discount, 0) + new_tax_total, 2);

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

  if current_payment.method = 'CASH' then
    begin
      requested_cash_tendered := coalesce(
        nullif(correction_payload ->> 'cashTendered', '')::numeric,
        current_payment.amount_tendered
      );
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Enter a valid corrected cash amount tendered';
    end;

    if requested_cash_tendered is null or requested_cash_tendered < new_grand_total then
      raise exception 'Cash tendered cannot be less than the corrected order total';
    end if;

    update payments
    set amount = new_grand_total,
        amount_tendered = requested_cash_tendered,
        balance_returned = requested_cash_tendered - new_grand_total
    where id = current_payment.id;
  else
    update payments set amount = new_grand_total where id = current_payment.id;
  end if;

  update orders
  set subtotal = new_subtotal,
      automatic_discount_total = new_automatic_discount,
      manual_discount_total = new_manual_discount,
      manual_discount_type = discount_mode,
      manual_discount_value = discount_value,
      tax_total = new_tax_total,
      grand_total = new_grand_total
  where id = target_order.id;

  insert into audit_logs(branch_id, user_id, action, entity, entity_id, old_value, new_value)
  values (
    target_order.branch_id,
    profile.id,
    'ORDER_CONTENT_CORRECTION',
    'orders',
    target_order.id,
    jsonb_build_object(
      'order_number', target_order.order_number,
      'subtotal', target_order.subtotal,
      'automatic_discount_total', target_order.automatic_discount_total,
      'manual_discount_total', target_order.manual_discount_total,
      'manual_discount_type', target_order.manual_discount_type,
      'manual_discount_value', target_order.manual_discount_value,
      'tax_total', target_order.tax_total,
      'grand_total', target_order.grand_total,
      'payment_amount', current_payment.amount
    ),
    jsonb_build_object(
      'order_number', target_order.order_number,
      'added_items', added_items_audit,
      'subtotal', new_subtotal,
      'automatic_discount_total', new_automatic_discount,
      'manual_discount_total', new_manual_discount,
      'manual_discount_type', discount_mode,
      'manual_discount_value', discount_value,
      'tax_rate', applied_tax_rate,
      'tax_total', new_tax_total,
      'grand_total', new_grand_total,
      'payment_amount', new_grand_total,
      'reason', btrim(correction_reason)
    )
  );
end;
$$;

revoke all on function correct_order_contents(uuid, jsonb, text) from public;
grant execute on function correct_order_contents(uuid, jsonb, text) to authenticated;

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
    manual_discount_type,
    manual_discount_value,
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
    case when (order_payload ->> 'manualDiscountMode') in ('PERCENTAGE', 'FIXED') then order_payload ->> 'manualDiscountMode' else 'FIXED' end,
    coalesce((order_payload ->> 'manualDiscountValue')::numeric, (order_payload #>> '{totals,manualDiscount}')::numeric, 0),
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
