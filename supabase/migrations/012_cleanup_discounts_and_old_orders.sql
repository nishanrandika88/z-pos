delete from discounts;

delete from orders
where created_at < timestamptz '2026-06-11 00:00:00+05:30';
