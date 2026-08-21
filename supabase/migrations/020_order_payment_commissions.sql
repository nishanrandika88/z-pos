alter table payments
  add column commission_rate numeric(5, 2),
  add column commission_amount numeric(12, 2);

create or replace function calculate_payment_commission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.commission_rate := case new.method
    when 'CARD' then 3.00
    when 'LANKAQR' then 1.00
    else 0.00
  end;
  new.commission_amount := round(new.amount * new.commission_rate / 100, 2);
  return new;
end;
$$;

create trigger payments_calculate_commission
before insert or update of method, amount on payments
for each row execute function calculate_payment_commission();

-- Apply the current commission policy to every historical payment.
update payments
set commission_rate = case method
      when 'CARD' then 3.00
      when 'LANKAQR' then 1.00
      else 0.00
    end,
    commission_amount = round(
      amount * case method
        when 'CARD' then 3.00
        when 'LANKAQR' then 1.00
        else 0.00
      end / 100,
      2
    );

alter table payments
  alter column commission_rate set default 0,
  alter column commission_rate set not null,
  alter column commission_amount set default 0,
  alter column commission_amount set not null,
  add constraint payments_commission_rate_range check (commission_rate between 0 and 100),
  add constraint payments_commission_amount_range check (commission_amount between 0 and amount);

create or replace function get_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with business_dates as (
    select
      (timezone('Asia/Colombo', now()))::date as today,
      date_trunc('week', timezone('Asia/Colombo', now()))::date as week_start,
      date_trunc('month', timezone('Asia/Colombo', now()))::date as month_start
  ),
  payment_commissions as (
    select
      payments.order_id,
      coalesce(sum(payments.commission_amount), 0) as commission_amount
    from payments
    group by payments.order_id
  ),
  completed_orders as (
    select
      orders.id,
      orders.grand_total,
      coalesce(payment_commissions.commission_amount, 0) as commission_amount,
      orders.grand_total - coalesce(payment_commissions.commission_amount, 0) as net_total,
      (timezone('Asia/Colombo', orders.created_at))::date as business_date
    from orders
    left join payment_commissions on payment_commissions.order_id = orders.id
    where orders.status = 'COMPLETED'
  ),
  sales as (
    select
      count(*) filter (where completed_orders.business_date = business_dates.today) as orders_today,
      coalesce(sum(completed_orders.grand_total) filter (where completed_orders.business_date = business_dates.today), 0) as sales_today,
      coalesce(sum(completed_orders.grand_total) filter (where completed_orders.business_date between business_dates.week_start and business_dates.today), 0) as sales_this_week,
      coalesce(sum(completed_orders.grand_total) filter (where completed_orders.business_date between business_dates.month_start and business_dates.today), 0) as sales_this_month,
      coalesce(sum(completed_orders.grand_total), 0) as total_sales,
      coalesce(sum(completed_orders.commission_amount) filter (where completed_orders.business_date = business_dates.today), 0) as commission_today,
      coalesce(sum(completed_orders.commission_amount) filter (where completed_orders.business_date between business_dates.week_start and business_dates.today), 0) as commission_this_week,
      coalesce(sum(completed_orders.commission_amount) filter (where completed_orders.business_date between business_dates.month_start and business_dates.today), 0) as commission_this_month,
      coalesce(sum(completed_orders.commission_amount), 0) as total_commission,
      coalesce(sum(completed_orders.net_total) filter (where completed_orders.business_date = business_dates.today), 0) as net_sales_today,
      coalesce(sum(completed_orders.net_total) filter (where completed_orders.business_date between business_dates.week_start and business_dates.today), 0) as net_sales_this_week,
      coalesce(sum(completed_orders.net_total) filter (where completed_orders.business_date between business_dates.month_start and business_dates.today), 0) as net_sales_this_month,
      coalesce(sum(completed_orders.net_total), 0) as total_net_sales
    from completed_orders
    cross join business_dates
  ),
  items as (
    select coalesce(sum(order_items.quantity), 0) as items_sold_today
    from completed_orders
    cross join business_dates
    join order_items on order_items.order_id = completed_orders.id
    where completed_orders.business_date = business_dates.today
  ),
  payment_split as (
    select
      coalesce(sum(payments.amount) filter (where payments.method = 'CASH'), 0) as cash_total,
      coalesce(sum(payments.amount) filter (where payments.method = 'CARD'), 0) as card_total,
      coalesce(sum(payments.amount) filter (where payments.method = 'LANKAQR'), 0) as lanka_qr_total,
      coalesce(sum(payments.amount) filter (where payments.method = 'BANK_TRANSFER'), 0) as bank_transfer_total,
      coalesce(sum(payments.amount), 0) as payment_total
    from completed_orders
    cross join business_dates
    join payments on payments.order_id = completed_orders.id
    where completed_orders.business_date = business_dates.today
  )
  select jsonb_build_object(
    'ordersToday', sales.orders_today,
    'itemsSoldToday', items.items_sold_today,
    'salesToday', sales.sales_today,
    'salesThisWeek', sales.sales_this_week,
    'salesThisMonth', sales.sales_this_month,
    'totalSales', sales.total_sales,
    'commissionToday', sales.commission_today,
    'commissionThisWeek', sales.commission_this_week,
    'commissionThisMonth', sales.commission_this_month,
    'totalCommission', sales.total_commission,
    'netSalesToday', sales.net_sales_today,
    'netSalesThisWeek', sales.net_sales_this_week,
    'netSalesThisMonth', sales.net_sales_this_month,
    'totalNetSales', sales.total_net_sales,
    'cashTotal', payment_split.cash_total,
    'cardTotal', payment_split.card_total,
    'lankaQrTotal', payment_split.lanka_qr_total,
    'bankTransferTotal', payment_split.bank_transfer_total,
    'paymentTotal', payment_split.payment_total
  )
  from sales
  cross join items
  cross join payment_split;
$$;

revoke all on function get_dashboard_summary() from public;
grant execute on function get_dashboard_summary() to authenticated;
