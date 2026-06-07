# Offline Sync and Printing

## Offline Billing

Client storage:

- IndexedDB database: `z-pos-offline`.
- Store queued orders, receipt snapshots, and sync attempts.
- Each offline order gets `offline_client_id = registerId + timestamp + crypto random`.

Sync flow:

1. Cashier completes payment offline.
2. Order draft is saved locally with a pending local receipt number.
3. When online, the app calls `create_pos_order`.
4. Server assigns canonical `order_number`.
5. Client updates local receipt history.
6. Duplicate upload is blocked by `orders.unique(branch_id, offline_client_id)`.

Conflict resolution:

- Duplicate offline client ID: treat as already synced.
- Product price changed after offline sale: preserve captured sale price in `order_items`.
- Deleted item: allow sync because receipt line stores item snapshot.
- Failed sync: keep queued and show admin/cashier warning.

## Printing

Browser print:

- Fast fallback for standard printers.
- Render receipt HTML with 58mm/80mm CSS.

Thermal raw print:

- Use a local print bridge installed on POS machines.
- Browser sends signed print job to `http://localhost:<port>/print`.
- Bridge converts receipt model into ESC/POS commands.

Receipt model:

```ts
interface ReceiptModel {
  width: "58MM" | "80MM";
  company: { name: string; address?: string; phone?: string };
  order: { number: string; date: string; cashier: string };
  lines: { name: string; qty: number; price: number; total: number }[];
  totals: { subtotal: number; discount: number; tax: number; grandTotal: number };
  payment: { method: "CASH" | "CARD"; maskedCardNumber?: string };
  footer?: string;
}
```

Print rule:

- Payment success.
- Order save success.
- Receipt generated from persisted order response.
- Audit every reprint.
