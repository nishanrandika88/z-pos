# Security Architecture

## Authentication

- Supabase Auth email/password.
- Refresh tokens are managed by Supabase.
- Passwords must be at least 12 characters with uppercase, lowercase, number, and symbol.
- Configure JWT expiry and refresh rotation in Supabase.
- Account locking is enforced with `failed_login_count` and `locked_until` via Auth hooks or Edge Functions.

## Authorization

- Frontend route guards are UX controls only.
- RLS policies are the source of truth.
- Admin can manage branch data.
- Cashier can create POS orders and read own orders.
- Optional cashier permissions are stored in `user_permissions`.

## Data Protection

- Never store CVV, PIN, or full card number.
- Store only `card_last4` and masked card display.
- Store item snapshots on order lines for historical accuracy.
- Avoid PII in Sentry events.

## Application Security

- Validate forms with Zod and database constraints.
- Sanitize file uploads by MIME type and size.
- Use Content Security Policy on Vercel.
- Avoid rendering untrusted HTML.
- Use signed URLs for private storage objects.
- Rate-limit sensitive Edge Functions.

## Audit Logging

Events:

- login
- logout
- user change
- item change
- category change
- discount change
- order creation
- order cancellation
- manual bill discount
- receipt reprint

Audit fields:

- user
- action
- entity
- entity id
- old value
- new value
- timestamp
- IP address
