# Expense Management Implementation Plan

## 1. Current relevant architecture

Z-POS is a React 19 + TypeScript + Vite single-page application. Feature UI and repositories live under `src/features`; shared infrastructure and primitives live under `src/shared`; TanStack Query owns server state, Zustand owns short-lived POS state, React Hook Form and Zod are the established validation tools, and CSV is generated in the browser for the current report sizes.

Supabase provides Auth, PostgreSQL, Row Level Security (RLS), Storage, and transactional PostgreSQL RPCs. The current database is branch-scoped. `profiles` links each authenticated user to one branch and one of two roles (`ADMIN`, `CASHIER`); `user_permissions` already supports granular permission strings. Frontend route guards are role-based UX controls while RLS/RPC checks are authoritative. Sensitive multi-table order creation already uses a security-definer RPC and writes `audit_logs`.

There is no employee/payroll module and no inventory quantity or stock-movement model. `items` is a sellable menu/catalog table, not a raw-material ledger. Salary records therefore need an expense-specific payroll detail with an optional profile link, while ingredient purchases need a new inventory entity that can optionally link to a sellable catalog item.

Existing UI conventions are responsive cards/tables, lazy routes, an `AppShell` sidebar/mobile menu, shared Button/Input/Card/Badge primitives, `Intl.NumberFormat("en-LK", { currency: "LKR" })`, loading/error/empty states, and repository functions that map snake_case database records into camelCase domain types.

## 2. Recommended domain model

- `expense_categories`: branch-owned, configurable categories with a stable kind (`OPERATIONAL`, `INVENTORY`, or `SALARY`), active/archive state, and display order.
- `suppliers`: reusable branch-owned supplier/payee records. An expense also stores a supplier/payee snapshot so historical records survive supplier edits.
- `expenses`: financial header and lifecycle. It stores the reference, date, invoice number, category, payee snapshot, notes, totals, payment method, status, inventory-update intent, creator/updater/approver/voider, timestamps, and optimistic `version`.
- `expense_items`: immutable-at-finalization line snapshots with optional inventory-item linkage, purchased description, quantity, purchase unit, conversion factor, base quantity, unit price, tax/charges/discount, and server-calculated line total.
- `expense_fundings`: one or more contributions that sum to the expense total. Personal contributions capture the payer; shop cash/bank/card and other sources remain distinguishable. This supports split funding without changing the expense amount.
- `expense_reimbursements`: payments against personal funding only. They are cash-flow settlements, never expense rows, so they cannot double-count profit/loss.
- `salary_expense_details`: a one-to-one salary breakdown linked to an expense and optionally to a profile, with an employee-name snapshot and salary period/payment fields.
- `inventory_items`: branch-owned stockable raw materials or products, with base unit, quantity on hand, average purchase cost, reorder level, and optional catalog-item link.
- `inventory_unit_conversions`: item-specific conversion factors from purchase units to the item's base unit.
- `stock_movements`: append-only stock ledger. A unique purchase movement per expense item prevents stock from being received twice; voiding creates one unique reversal rather than deleting history.
- `expense_receipts`: private attachment metadata, SHA-256 hash, OCR lifecycle/provider/result, duplicate candidate, reviewer, and review timestamps.
- Existing `profiles`, `items`, `branches`, and `audit_logs` remain the identity, sellable catalog, tenant, and audit sources of truth.

All stored currency values use `numeric(14,2)` and all stock quantities use `numeric(14,3)`. Client numbers are display/input values only; authoritative totals are recalculated inside RPCs.

## 3. Database schema changes

A new additive migration will:

- add expense, funding, reimbursement, salary, OCR, stock, and unit enums;
- add the tables listed above, foreign keys, checks, archive flags, optimistic versions, and `updated_at` triggers;
- add a daily branch expense counter and `next_expense_number` function;
- add indexes for branch/date/status/category/supplier/creator, pending reimbursements, OCR status/file hash, invoice duplicate matching, and stock history;
- extend `audit_action` with expense/category/receipt/approval/void/reimbursement/inventory actions;
- create a private `expense-receipts` Storage bucket with branch-aware policies;
- create permission-aware helper functions and branch-scoped RLS policies;
- add transactional RPCs for create/update, status transitions, reimbursement, and receipt review;
- seed the requested default categories without preventing later custom categories.

No existing table is dropped and no existing role enum is changed.

## 4. Relationships

```text
branches
  |-- expense_categories -- expenses -- expense_items -- stock_movements
  |                           |   |          |                 |
  |                           |   |          +-- inventory_items -- items (optional catalog link)
  |                           |   +-- expense_receipts
  |                           +-- expense_fundings -- expense_reimbursements
  |                           +-- salary_expense_details -- profiles (optional employee link)
  |                           +-- suppliers
  +-- profiles -- created/updated/approved/voided/processed/reviewed user links

expenses and all important transitions -- audit_logs
```

Supplier, employee, item description, unit price, and category meaning are snapshotted where financial history requires it; reusable entities remain linked for filters and current-state navigation.

## 5. API endpoints / server actions

The frontend will continue using Supabase table APIs for reads and low-risk master-data CRUD. Transactional writes use RPCs:

- `create_expense(expense_payload jsonb) -> uuid`: validates permission/branch, recalculates totals, writes header/lines/funding/salary/receipt links, detects duplicate submission via client request ID, and audits in one transaction.
- `update_expense(target_id uuid, expected_version integer, expense_payload jsonb) -> integer`: updates editable records, rejects stale versions, replaces draft line/funding detail safely, and audits old/new values.
- `submit_expense`, `approve_expense`, `mark_expense_paid`, `void_expense`: explicit lifecycle transitions; approval/paid transition posts inventory exactly once, and void creates reversal movements.
- `record_expense_reimbursement`: locks personal funding, validates the remaining reimbursable amount, inserts the settlement, and returns the derived reimbursement status.
- `review_expense_receipt`: stores corrected extraction and review state without turning it into an expense until the user explicitly creates/updates one.
- Table reads cover paginated expense lists/details, categories, suppliers, inventory, reimbursements, and receipt jobs; aggregate report queries use branch-scoped database functions/views as volume grows.

## 6. UI screens and components

Routes and screen responsibilities:

1. `/expenses`: dashboard totals, pending actions, recent expenses, and entry points.
2. `/expenses/list`: paginated searchable/sortable list with date, category, supplier, user, fund source, payment, reimbursement, and status filters.
3. `/expenses/new` and `/expenses/:id/edit`: responsive header/line editor, exact total preview, funding, conditional personal-payment and salary sections, and duplicate-submit protection.
4. `/expenses/:id`: financial snapshot, attachment preview, lifecycle/audit timeline, stock receipt state, approve/void/pay/reimburse actions.
5. `/expenses/receipts/:id/review`: OCR confidence/warnings, editable header and lines, inventory matching or authorized item creation, duplicate warning, total reconciliation, and confirm-to-expense action.
6. `/expenses/categories`: configurable category CRUD/archive.
7. `/expenses/reimbursements`: personal contributions, remaining balances, partial/full reimbursement processing.
8. `/expenses/salaries`: salary-focused filter, period and payment status views, and salary entry.
9. `/reports`: expense, inventory purchase, salary, funding, income/expense, and profit/loss report tabs with CSV export.

Shared feature components will include money fields, line editor, filters, status badges, funding editor, salary section, receipt uploader, duplicate warning, responsive tables, and confirmation dialogs.

## 7. Receipt OCR architecture and flow

Receipt files are validated in the browser, hashed with Web Crypto, and uploaded to a private branch/user-prefixed Storage path. Only metadata and storage paths are stored in PostgreSQL; signed URLs are generated for authorized viewers. A Supabase Edge Function receives a receipt ID, verifies the authenticated user's permission and branch, downloads the private object, and invokes an `OcrProvider` adapter. Provider credentials exist only as Edge Function secrets.

The normalized provider-independent result contains supplier, invoice number, purchase date, currency, items, subtotal, discounts, tax, charges, total, per-field confidence, raw provider metadata, and warnings. Processing uses `UPLOADED -> PROCESSING -> EXTRACTED | FAILED -> REVIEWED`. Transient errors are retried with bounded exponential backoff; permanent/unsupported failures remain manually reviewable.

Practical provider comparison (verified against official documentation in August 2026):

- Azure Document Intelligence and AWS Textract have receipt/invoice-specific models, structured line items, confidence/typed fields, and asynchronous options. They are strong default managed-document choices but add vendor identity, regional, rate-limit, and per-page costs.
- Google Document AI has a GA Expense Parser and low published per-page pricing, but its documented pretrained expense-language list is narrower, which must be tested against Sri Lankan supplier formats.
- OpenAI vision plus strict structured output is flexible for unusual layouts and contextual normalization, but output still requires arithmetic validation and confidence/warning heuristics; data-retention settings and token/image cost must be reviewed.
- Tesseract is private/self-hosted and inexpensive per call, but supplies text rather than a reliable receipt schema and needs image preprocessing, parsing, infrastructure, and extensive local-format evaluation.

The first implementation provides an adapter boundary, a server-only OpenAI-compatible vision adapter when configured, and a manual fallback. Production rollout must benchmark at least 50 representative English/Sinhala/Tamil bills before choosing the default provider.

Duplicate detection is layered: exact file hash is a strong duplicate; normalized supplier + invoice number is a strong business duplicate; supplier + date + total is a warning; and missing invoice numbers never block solely on fuzzy matching. The user can inspect a candidate and an authorized user can proceed with a documented override.

## 8. Inventory integration

Existing `items` represents things sold, so stockable ingredients/materials use `inventory_items`; an optional `catalog_item_id` supports purchased retail products without forcing ingredients into the POS catalog. Each stock item has a base unit. Expense lines store purchase unit and conversion factor so, for example, `2 kg * 1000 = 2000 g` can be posted when grams are the base unit.

Submitting or uploading never changes stock. The approving/paid transition inserts a `PURCHASE` stock movement for each inventory-linked line marked to update stock, updates quantity and weighted-average purchase cost while rows are locked, and stamps the line's inventory posting time. A unique partial index on purchase movement `expense_item_id` makes retries idempotent. Voiding a posted expense inserts one `EXPENSE_VOID` inverse movement and prevents an invalid reversal if later consumption would make policy-defined negative stock unsafe.

## 9. Role and permission rules

Granular permission strings:

- `expenses:read`, `expenses:create`, `expenses:update`
- `expenses:void`, `expenses:approve`
- `expenses:receipts`, `expenses:reimburse`
- `expenses:categories`, `expenses:reports`, `expenses:export`
- `expenses:inventory`, `expenses:salaries`

Admins receive all expense permissions implicitly. Cashiers receive none implicitly in the initial rollout, but existing `user_permissions` can grant the minimum required actions. RLS/RPCs check active profile, branch, and permission. UI guards mirror those checks but are not relied on for security. Finalized financial rows cannot be hard-deleted; draft removal, if later enabled, remains audited and admin-only.

## 10. Validation and security

- Zod validates shape, lengths, enum values, dates, MIME/size, positive quantities, and conditional personal/salary fields; PostgreSQL repeats invariants and calculates authoritative totals.
- Totals use decimal strings across the RPC boundary and PostgreSQL `numeric`; client formatting never becomes authoritative.
- Funding must equal total; reimbursements cannot exceed personal funding; salary net equals basic + allowances - deductions - advances; discount cannot make a line negative.
- RPCs lock rows for status, reimbursement, and inventory transitions; `expected_version` rejects lost updates.
- A client request UUID and database unique constraint prevent duplicate form submission.
- Receipt MIME is allow-listed (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), size is capped, objects are private, paths are server/branch checked, and API credentials never enter `VITE_*` variables.
- OCR output is untrusted draft JSON. It is length-limited, never rendered as HTML, never auto-posted, and must pass the same validation as manual input.
- Audits capture action, actor, reason, and relevant before/after values. Receipt raw output avoids secrets and is retained under a configurable retention policy.

## 11. Reporting approach

Initial branch-sized reports use indexed Supabase queries and client-side CSV, matching the existing architecture. Report domain functions combine completed sales with non-void approved/paid expenses and exclude reimbursements from expense totals. Reports cover daily/weekly/monthly totals, category, supplier, creator, shop/personal funding, pending reimbursement, salary, inventory purchase cost, income versus expense, and monthly profit/loss.

For larger datasets, replace client pagination with stable SQL report functions or materialized monthly summaries without changing UI contracts. Date boundaries are sent as explicit timestamps in the branch's business timezone; current deployment defaults to Asia/Colombo.

## 12. Testing strategy

- Pure Vitest unit tests: decimal-string calculations, line/header totals, salary net, reimbursement derivation, unit conversions, report aggregation, CSV rows, filter serialization, and OCR normalization.
- Repository tests with a mocked Supabase client: pagination, filters, duplicate warnings, file errors, and failed OCR fallback.
- PostgreSQL integration tests in a disposable Supabase project: RLS for admin/cashier/grants/cross-branch access, create/update/version conflict, lifecycle rules, partial reimbursement locking, idempotent stock receipt, reversal, audit rows, and duplicate request/hash constraints.
- Component/browser tests when a DOM test environment is added: line editor, validation summaries, loading/empty/error/success states, mobile layouts, OCR correction, and duplicate submission.
- Manual acceptance matrix: phone photo, rotated/low-quality photo, multipage PDF, unsupported/oversize file, repeated upload, OCR outage, and manual-only entry.

## 13. Migration and rollout

1. Back up staging, apply the additive migration, inspect seeded categories/RLS/functions, and run database smoke tests.
2. Deploy UI with expense navigation visible only to admins. Keep OCR provider disabled so manual upload/review is the safe fallback.
3. Pilot manual expenses and reporting; reconcile a sample month against existing records.
4. Configure an OCR provider secret in staging, benchmark representative bills, set cost/rate alerts, and enable the Edge Function.
5. Enable inventory posting only after opening quantities/base units are verified. Never backfill stock from historical expenses automatically.
6. Grant selected cashier permissions individually, monitor audit/duplicate/failed OCR metrics, then broaden access.
7. Rollback UI/Edge Function independently if needed. The additive schema remains dormant; financial data is not deleted during rollback.

## 14. Expected files

Create:

- `supabase/migrations/014_expense_management.sql`
- `supabase/functions/process-expense-receipt/*`
- `src/domain/expenses/types.ts`
- `src/features/expenses/expense.schemas.ts`
- `src/features/expenses/expense.service.ts` and tests
- `src/features/expenses/expenses.repository.ts`
- expense pages/components under `src/features/expenses/`
- expense report tests/formatters as required
- this plan and focused documentation updates

Modify:

- `src/features/auth/rbac.ts` and auth profile loading for grants
- `src/app/router.tsx` and `src/app/shell/AppShell.tsx`
- `src/features/reports/reports.repository.ts`, tests, and `ReportsPage.tsx`
- `docs/architecture.md`, `docs/api.md`, and `docs/security.md`
- `.env.example` only for non-secret provider selection; provider API keys remain Edge Function secrets

## 15. Implementation phases (dependency order)

### Phase 1 - Domain, calculations, and schema

- Goal: establish financial/stock invariants before UI work.
- Files/modules: domain types, expense schemas/service/tests, migration.
- Database: all enums/tables/indexes/triggers/storage/RLS/helper functions and seeds.
- Backend: transactional create/update/lifecycle/reimbursement/inventory RPCs.
- Frontend: reusable input models and exact calculation helpers only.
- Tests: totals, salary, funding, reimbursement, conversion, lifecycle SQL smoke tests.
- Acceptance: invalid totals/funding/status changes fail server-side; identical retries do not duplicate expenses or stock.

### Phase 2 - Core expense entry and browsing

- Goal: admins can create, find, edit, review, approve, pay, and void expenses.
- Files/modules: repository, dashboard/list/form/detail/components, router/nav/RBAC.
- Database: no new design changes beyond Phase 1; fix-forward migration only if needed.
- Backend: typed reads and RPC wrappers.
- Frontend: responsive dashboard/list/filter/pagination, exact line editor, personal/salary conditional sections, detail lifecycle.
- Tests: schemas, repository mapping/filtering, form duplicate-submit guard, permission-visible actions.
- Acceptance: a manual operational, salary, or inventory-purchase expense completes its valid lifecycle with correct audit and totals.

### Phase 3 - Attachments and reviewed OCR

- Goal: private bill upload, safe extraction, correction, duplicate detection, and manual fallback.
- Files/modules: Storage repository/components, OCR review page, Edge Function adapters/normalizer.
- Database: receipt metadata/functions already in Phase 1.
- Backend: authenticated Edge Function, bounded retries, normalized output, receipt review RPC.
- Frontend: upload/hash/progress, OCR state polling, editable review, inventory matching, duplicate resolution.
- Tests: invalid/oversize upload, exact/fuzzy duplicate, provider normalization, OCR failure/manual correction.
- Acceptance: extraction never creates confirmed financial/stock data; a user can always finish manually.

### Phase 4 - Reimbursement and inventory operations

- Goal: settle personal funding and receive/reverse stock without double counting.
- Files/modules: reimbursement/inventory views, repository actions, detail timelines.
- Database: existing Phase 1 RPCs and ledger.
- Backend: row-locked partial reimbursement and idempotent posting/reversal.
- Frontend: pending balances, partial/full settlement, unit/base quantities and stock movement history.
- Tests: over-reimbursement, concurrent reimbursement, second approval/retry, weighted cost, void reversal.
- Acceptance: reimbursement changes cash-settlement state only; the expense total is unchanged; stock posts at most once.

### Phase 5 - Reporting, hardening, and rollout docs

- Goal: reconciled expense/profit reports and production-ready controls.
- Files/modules: reports repository/page/tests and architecture/API/security docs.
- Database: indexed aggregate query functions if staging volume shows client querying is insufficient.
- Backend: report queries that exclude drafts/voids and exclude reimbursement from expenses.
- Frontend: expense report tabs, filters, CSV export, accessible loading/empty/error states.
- Tests: every report dimension, income/expense/profit math, CSV, cross-branch/RLS matrix.
- Acceptance: report totals reconcile to approved/paid expense detail and completed sales for the same date boundaries.

## 16. Risks, assumptions, and unresolved decisions

- Assumption: salaries are recorded, not a full payroll/tax/attendance engine. A future employee module can be linked without rewriting expense history.
- Assumption: profiles are optional employee links; non-login employees are preserved by name snapshot until a dedicated employee master is introduced.
- Assumption: inventory opening balances and consumption/recipe depletion are outside this expense module. Purchases create stock; POS sales do not yet consume ingredients.
- Assumption: admins are the initial authorized group; granular cashier grants are enabled after the user-management UI supports them.
- Assumption: expense approval is one-step. Multi-level approval thresholds can be added as a separate approval table later.
- Assumption: LKR is the accounting currency; foreign-currency conversion is outside this phase.
- Risk: OCR quality on local handwritten, Sinhala/Tamil, faint thermal, and mixed-format receipts is unknown. Mitigation is mandatory review, manual fallback, and a representative benchmark before provider enablement.
- Risk: frontend JavaScript uses binary floating point. Mitigation is integer-minor-unit helpers for previews plus authoritative PostgreSQL numeric recalculation.
- Risk: existing direct-table repositories rely heavily on RLS but do not have generated database types. New repository mappings must be tested against migration column names.
- Unresolved but non-blocking product choices: receipt retention duration, reimbursement approval evidence, negative-stock reversal policy, and whether cashier permissions should be granted by default. Initial behavior is private indefinite retention, audited reimbursement notes, block unsafe negative reversals, and admin-only access.

These defaults are additive and reversible; none requires destructive migration or silently changes existing POS behavior.
