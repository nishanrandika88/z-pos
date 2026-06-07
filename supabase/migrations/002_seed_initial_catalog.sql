insert into branches (code, name, address, phone)
values ('MAIN', 'Main Branch', 'Main Street', '+94 000 000 0000')
on conflict (code) do update set
  name = excluded.name,
  address = excluded.address,
  phone = excluded.phone,
  active = true,
  updated_at = now();

insert into company_settings (
  branch_id,
  company_name,
  address,
  phone,
  email,
  tax_number,
  currency,
  receipt_footer,
  tax_rate
)
select
  b.id,
  'Z-POS Retail',
  'Main Street',
  '+94 000 000 0000',
  'hello@z-pos.local',
  'TAX-0001',
  'LKR',
  'Thank you. Come again.',
  0
from branches b
where b.code = 'MAIN'
on conflict (branch_id) do update set
  company_name = excluded.company_name,
  address = excluded.address,
  phone = excluded.phone,
  email = excluded.email,
  tax_number = excluded.tax_number,
  currency = excluded.currency,
  receipt_footer = excluded.receipt_footer,
  tax_rate = excluded.tax_rate,
  updated_at = now();

insert into categories (branch_id, name, active)
select b.id, category_name, true
from branches b
cross join (
  values
    ('Lunch'),
    ('Breakfast'),
    ('Desserts'),
    ('Supper'),
    ('Beverages')
) as seed(category_name)
where b.code = 'MAIN'
on conflict (branch_id, lower(name)) do update set
  active = true,
  updated_at = now();

insert into items (
  branch_id,
  category_id,
  item_code,
  barcode,
  item_name,
  description,
  image_url,
  selling_price,
  availability,
  active
)
select
  b.id,
  c.id,
  seed.item_code,
  seed.barcode,
  seed.item_name,
  seed.description,
  seed.image_url,
  seed.selling_price,
  true,
  true
from branches b
join (
  values
    ('Lunch', 'NOD-001', '100000000001', 'Schezwan Egg Noodles', 'Spicy egg noodles with vegetables.', 'https://images.unsplash.com/photo-1617093727343-374698b1b08d?q=80&w=800&auto=format&fit=crop', 2400.00),
    ('Breakfast', 'NOD-002', '100000000002', 'Stir Egg Fry Udon Noodles', 'Udon noodles with egg and greens.', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?q=80&w=800&auto=format&fit=crop', 2450.00),
    ('Lunch', 'NOD-003', '100000000003', 'Thai Style Fried Noodles', 'Thai fried noodles with fresh garnish.', 'https://images.unsplash.com/photo-1512058564366-18510be2db19?q=80&w=800&auto=format&fit=crop', 2550.00),
    ('Supper', 'PST-001', '100000000004', 'Chinese Prawn Spaghetti', 'Prawn spaghetti with chili and herbs.', 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?q=80&w=800&auto=format&fit=crop', 2750.00),
    ('Desserts', 'SBA-001', '100000000005', 'Japanese Soba Noodles', 'Soba noodles with soy broth.', 'https://images.unsplash.com/photo-1585032226651-759b368d7246?q=80&w=800&auto=format&fit=crop', 2650.00),
    ('Beverages', 'THA-001', '100000000006', 'Chilli Garlic Thai Noodles', 'Thai noodles with chilli garlic sauce.', 'https://images.unsplash.com/photo-1555126634-323283e090fa?q=80&w=800&auto=format&fit=crop', 2350.00)
) as seed(category_name, item_code, barcode, item_name, description, image_url, selling_price)
  on true
join categories c
  on c.branch_id = b.id
  and lower(c.name) = lower(seed.category_name)
where b.code = 'MAIN'
on conflict (branch_id, item_code) do update set
  category_id = excluded.category_id,
  barcode = excluded.barcode,
  item_name = excluded.item_name,
  description = excluded.description,
  image_url = excluded.image_url,
  selling_price = excluded.selling_price,
  availability = true,
  active = true,
  updated_at = now();

insert into printers (
  branch_id,
  printer_name,
  printer_type,
  receipt_width,
  auto_print,
  print_copies,
  active
)
select
  b.id,
  'Default Thermal Printer',
  'GENERIC_THERMAL',
  '80MM',
  true,
  1,
  true
from branches b
where b.code = 'MAIN'
and not exists (
  select 1
  from printers p
  where p.branch_id = b.id
  and p.printer_name = 'Default Thermal Printer'
);
