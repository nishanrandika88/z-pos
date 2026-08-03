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

Expense events additionally cover create/update, approval, paid finalization, void reason, receipt review, reimbursement, and inventory effects.

Reopening a voided expense is restricted to active administrators in the same branch. It requires an optimistic version match, blocks expenses with reimbursements or incomplete stock reversals, and writes a dedicated audit event before the record becomes editable.

## Expense and receipt controls

- Expense permissions are granular (`expenses:read/create/update/approve/void/receipts/reimburse/categories/reports/export/inventory/salaries`). Admin receives them implicitly; cashiers require explicit `user_permissions` grants.
- All expense RLS checks require an active same-branch profile. Frontend route/action checks are UX only.
- Receipt files are stored in the private `expense-receipts` bucket at branch/user-prefixed paths, limited to approved image/PDF MIME types and 10 MB.
- Signed receipt URLs expire after five minutes. A stored financial attachment cannot be client-deleted.
- OCR provider and Supabase service-role keys exist only in the Edge Function environment. OCR JSON is untrusted, never rendered as HTML, and never auto-confirms an expense or stock movement.
- Employee selectors expose only same-branch employee/user identity needed for salary or payer entry. Salary details remain protected by `expenses:salaries`; directory reads are available only to authorized expense readers/creators, and employee changes still require salary-management permission.
- Category-specific requirements are repeated in RPC validation; frontend field visibility never replaces authorization or financial validation.
- Optimistic versions, row locks, request UUIDs, and unique stock-movement indexes protect concurrent and repeated operations.
- IP address
