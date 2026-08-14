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
  completed_orders as (
    select
      orders.id,
      orders.grand_total,
      (timezone('Asia/Colombo', orders.created_at))::date as business_date
    from orders
    where orders.status = 'COMPLETED'
  ),
  sales as (
    select
      count(*) filter (where completed_orders.business_date = business_dates.today) as orders_today,
      coalesce(sum(completed_orders.grand_total) filter (where completed_orders.business_date = business_dates.today), 0) as sales_today,
      coalesce(sum(completed_orders.grand_total) filter (where completed_orders.business_date between business_dates.week_start and business_dates.today), 0) as sales_this_week,
      coalesce(sum(completed_orders.grand_total) filter (where completed_orders.business_date between business_dates.month_start and business_dates.today), 0) as sales_this_month,
      coalesce(sum(completed_orders.grand_total), 0) as total_sales
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
