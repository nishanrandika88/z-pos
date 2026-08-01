import { describe, expect, it } from "vitest";
import type { OrderSummary, PaymentMethod } from "@/features/orders/types";
import { summarizeOrders } from "@/features/reports/reports.repository";

function order(id: string, method: PaymentMethod, amount: number): OrderSummary {
  return {
    id,
    orderNumber: `INV-${id}`,
    status: "COMPLETED",
    cashierName: "Cashier",
    subtotal: amount,
    automaticDiscountTotal: 0,
    manualDiscountTotal: 0,
    taxTotal: 0,
    grandTotal: amount,
    createdAt: "2026-08-01T00:00:00.000Z",
    items: [],
    payments: [
      {
        id: `payment-${id}`,
        method,
        amount,
      },
    ],
  };
}

describe("payment reporting", () => {
  it("separates all payment methods", () => {
    const summary = summarizeOrders([
      order("cash", "CASH", 200),
      order("card", "CARD", 1_000),
      order("qr", "LANKAQR", 500),
      order("transfer", "BANK_TRANSFER", 300),
    ]);

    expect(summary.cashTotal).toBe(200);
    expect(summary.cardTotal).toBe(1_000);
    expect(summary.lankaQrTotal).toBe(500);
    expect(summary.bankTransferTotal).toBe(300);
    expect(summary.grandTotal).toBe(2_000);
  });
});
