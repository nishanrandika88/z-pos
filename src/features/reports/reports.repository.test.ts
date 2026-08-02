import { describe, expect, it } from "vitest";
import type { OrderSummary, PaymentMethod } from "@/features/orders/types";
import type { ExpenseSummary } from "@/domain/expenses/types";
import { summarizeExpenses, summarizeOrders } from "@/features/reports/reports.repository";

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

describe("expense reporting", () => {
  it("excludes reimbursement from expense total and separates funding", () => {
    const expense: ExpenseSummary = {
      id: "expense-1", expenseNumber: "EXP-1", expenseDate: "2026-08-01T00:00:00.000Z",
      categoryId: "category-1", categoryName: "Ingredients", categoryKind: "INVENTORY",
      payee: "Supplier", subtotal: "1000.00", taxTotal: "0.00", additionalChargesTotal: "0.00",
      discountTotal: "0.00", grandTotal: "1000.00", paymentMethod: "CASH", status: "PAID",
      fundingSources: ["SHOP_CASH", "PERSONAL"], personalAmount: "400.00", reimbursableAmount: "400.00", reimbursedAmount: "250.00",
      reimbursementStatus: "PARTIALLY_REIMBURSED", createdByName: "Admin", updatedByName: "Admin",
      createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", version: 2,
    };
    expect(summarizeExpenses([expense])).toMatchObject({
      total: 1000,
      shopFunded: 600,
      personallyFunded: 400,
      reimbursed: 250,
      pendingReimbursement: 150,
      inventoryPurchaseTotal: 1000,
    });
  });
});
