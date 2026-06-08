alter table company_settings
add column if not exists thank_you_message text not null default 'Thank you. Come again.',
add column if not exists exchange_policy_message text not null default 'Items with proof of purchase may be exchanged within five days.',
add column if not exists no_cash_refund_message text not null default 'No cash refund',
add column if not exists show_no_cash_refund boolean not null default true;

update company_settings
set thank_you_message = coalesce(nullif(receipt_footer, ''), thank_you_message)
where thank_you_message = 'Thank you. Come again.';
