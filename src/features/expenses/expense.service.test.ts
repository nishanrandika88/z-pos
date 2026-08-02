import { describe, expect, it } from "vitest";
import { calculateExpenseLine, calculateExpenseTotals, calculateSalaryNet, reimbursementStatus } from "@/features/expenses/expense.service";

const line = {
  description: "Fresh milk",
  quantity: "2.500",
  unitType: "LITRE" as const,
  conversionFactor: "1000.000",
  unitPrice: "400.00",
  taxAmount: "25.00",
  additionalCharges: "10.00",
  discountAmount: "35.00",
};

describe("expense calculations", () => {
  it("calculates line and converted base quantity without floating point arithmetic", () => {
    expect(calculateExpenseLine(line)).toMatchObject({
      grossAmount: "1000.00",
      lineTotal: "1000.00",
      baseQuantity: "2500.000",
    });
  });

  it("aggregates tax, charges, discounts, and grand total", () => {
    expect(calculateExpenseTotals([line, { ...line, quantity: "1.000" }])).toEqual({
      subtotal: "1400.00",
      taxTotal: "50.00",
      additionalChargesTotal: "20.00",
      discountTotal: "70.00",
      grandTotal: "1400.00",
    });
  });

  it("rejects a discount that makes a line negative", () => {
    expect(() => calculateExpenseLine({ ...line, discountAmount: "2000.00" })).toThrow("cannot be negative");
  });

  it("calculates salary net", () => {
    expect(calculateSalaryNet({ basicSalary: "50000.00", allowances: "5000.00", deductions: "2000.00", advancePayments: "3000.00" })).toBe("50000.00");
  });

  it("derives every reimbursement state without changing the expense", () => {
    expect(reimbursementStatus("0.00", "0.00")).toBe("NOT_REQUIRED");
    expect(reimbursementStatus("1000.00", "0.00")).toBe("PENDING");
    expect(reimbursementStatus("1000.00", "250.00")).toBe("PARTIALLY_REIMBURSED");
    expect(reimbursementStatus("1000.00", "1000.00")).toBe("FULLY_REIMBURSED");
  });
});
