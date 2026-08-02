import { describe, expect, it } from "vitest";
import type { ExpenseDraft, ExpenseFormType } from "@/domain/expenses/types";
import { validateExpenseDraft } from "@/features/expenses/expense.schemas";

const categoryId = "11111111-1111-4111-8111-111111111111";
const clientRequestId = "22222222-2222-4222-8222-222222222222";

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    clientRequestId,
    expenseDate: "2026-08-03T09:00:00.000+05:30",
    categoryId,
    description: "Valid expense",
    paymentMethod: "CASH",
    status: "PENDING_APPROVAL",
    updateInventory: false,
    items: [{
      description: "Expense",
      quantity: "1.000",
      unitType: "UNIT",
      conversionFactor: "1.000",
      unitPrice: "100.00",
      taxAmount: "0.00",
      additionalCharges: "0.00",
      discountAmount: "0.00",
    }],
    fundings: [{ source: "SHOP_CASH", amount: "100.00" }],
    ...overrides,
  };
}

function messages(value: ExpenseDraft, formType: ExpenseFormType) {
  const result = validateExpenseDraft(value, formType);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("category-specific expense validation", () => {
  it("requires a description only when a general expense is submitted", () => {
    expect(messages(draft({ description: "" }), "GENERAL")).toContain("Enter a description.");
    expect(validateExpenseDraft(draft({ description: "", status: "DRAFT" }), "GENERAL").success).toBe(true);
  });

  it("requires salary details and rejects them on another form type", () => {
    expect(messages(draft({ salary: undefined }), "SALARY")).toContain("Salary details are required.");
    const salary = {
      employeeName: "Test Employee", periodStart: "2026-08-01", periodEnd: "2026-08-31",
      basicSalary: "100.00", allowances: "0.00", deductions: "0.00", advancePayments: "0.00",
      paymentStatus: "PENDING" as const,
    };
    expect(messages(draft({ salary }), "GENERAL")).toContain("Salary details are only valid for salary categories.");
  });

  it("requires rent period and landlord for submission", () => {
    const errors = messages(draft({ description: undefined, payee: undefined, categoryDetails: {} }), "RENT");
    expect(errors).toEqual(expect.arrayContaining([
      "Select the rental period start.",
      "Select the rental period end.",
      "Select or enter the landlord.",
    ]));
  });

  it("requires structured utility and equipment details", () => {
    expect(messages(draft({ categoryDetails: {} }), "UTILITY")).toEqual(expect.arrayContaining([
      "Enter the utility type.", "Enter the utility account number.",
      "Select the billing period start.", "Select the billing period end.",
    ]));
    expect(messages(draft({ payee: undefined, categoryDetails: {} }), "EQUIPMENT_REPAIR")).toEqual(expect.arrayContaining([
      "Describe the equipment or repair.", "Select the purchase or service date.",
      "Select or enter the supplier or technician.",
    ]));
  });

  it("requires every stock-updating line to have an inventory match", () => {
    expect(messages(draft({ updateInventory: true }), "INVENTORY_PURCHASE")).toContain(
      "Match this line to an inventory item or turn off stock updating.",
    );
    expect(validateExpenseDraft(draft({ updateInventory: false }), "INVENTORY_PURCHASE").success).toBe(true);
  });
});
