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
