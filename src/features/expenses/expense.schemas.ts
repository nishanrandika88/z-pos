import { z } from "zod";
import type { ExpenseDraft, ExpenseFormType } from "@/domain/expenses/types";

const decimal = (scale: number) =>
  z.string().trim().regex(new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`), `Enter a non-negative number with up to ${scale} decimal places.`);
const money = decimal(2);
const quantity = decimal(3).refine((value) => Number(value) > 0, "Quantity must be greater than zero.");

export const expenseLineSchema = z.object({
  inventoryItemId: z.string().uuid().optional().or(z.literal("")),
  description: z.string().trim().min(1).max(200),
  quantity,
  unitType: z.enum(["UNIT", "GRAM", "KILOGRAM", "MILLILITRE", "LITRE", "PACK", "BOTTLE", "BOX", "OTHER"]),
  conversionFactor: quantity,
  unitPrice: money,
  taxAmount: money,
  additionalCharges: money,
  discountAmount: money,
});

export const expenseFundingSchema = z.object({
  source: z.enum(["SHOP_CASH", "SHOP_BANK", "SHOP_CARD", "PERSONAL", "OTHER"]),
  amount: money.refine((value) => Number(value) > 0, "Funding amount must be greater than zero."),
  personPaid: z.string().trim().max(120).optional(),
  reimbursementRequired: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
}).superRefine((funding, context) => {
  if (funding.source === "PERSONAL" && !funding.personPaid) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["personPaid"], message: "Enter the person who paid." });
  }
});

export const salaryExpenseSchema = z.object({
  employeeId: z.string().uuid().optional().or(z.literal("")),
  employeeProfileId: z.string().uuid().optional().or(z.literal("")),
  employeeName: z.string().trim().min(2).max(120),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  basicSalary: money,
  allowances: money,
  deductions: money,
  advancePayments: money,
  paymentDate: z.string().date().optional().or(z.literal("")),
  paymentStatus: z.enum(["PENDING", "PARTIALLY_PAID", "PAID"]),
  notes: z.string().trim().max(500).optional(),
}).refine((salary) => salary.periodEnd >= salary.periodStart, {
  path: ["periodEnd"],
  message: "Salary period end must be on or after the start.",
});

export const expenseCategoryDetailsSchema = z.object({
  periodStart: z.string().date().optional().or(z.literal("")),
  periodEnd: z.string().date().optional().or(z.literal("")),
  dueDate: z.string().date().optional().or(z.literal("")),
  paymentDate: z.string().date().optional().or(z.literal("")),
  utilityType: z.string().trim().max(80).optional(),
  accountNumber: z.string().trim().max(120).optional(),
  equipmentDetails: z.string().trim().max(500).optional(),
  serviceDate: z.string().date().optional().or(z.literal("")),
  warrantyInformation: z.string().trim().max(500).optional(),
}).refine((details) => !details.periodStart || !details.periodEnd || details.periodEnd >= details.periodStart, {
  path: ["periodEnd"],
  message: "Period end must be on or after the start.",
});

export const expenseDraftSchema = z.object({
  clientRequestId: z.string().uuid(),
  expenseDate: z.string().datetime({ offset: true }),
  categoryId: z.string().uuid(),
  supplierId: z.string().uuid().optional().or(z.literal("")),
  payee: z.string().trim().max(160).optional(),
  invoiceNumber: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional(),
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER", "LANKAQR", "OTHER"]),
  status: z.enum(["DRAFT", "PENDING_APPROVAL"]),
  updateInventory: z.boolean(),
  items: z.array(expenseLineSchema).min(1).max(100),
  fundings: z.array(expenseFundingSchema).min(1).max(10),
  salary: salaryExpenseSchema.optional(),
  categoryDetails: expenseCategoryDetailsSchema.optional(),
});

export function validateExpenseDraft(draft: ExpenseDraft, formType: ExpenseFormType) {
  return expenseDraftSchema.superRefine((value, context) => {
    const submitting = value.status === "PENDING_APPROVAL";
    const requireText = (valueToCheck: string | undefined, path: Array<string | number>, message: string) => {
      if (!valueToCheck?.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path, message });
    };
    const requireDate = (valueToCheck: string | undefined, path: Array<string | number>, message: string) => {
      if (!valueToCheck) context.addIssue({ code: z.ZodIssueCode.custom, path, message });
    };

    if (formType === "SALARY" && !value.salary) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["salary"], message: "Salary details are required." });
    }
    if (formType !== "SALARY" && value.salary) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["salary"], message: "Salary details are only valid for salary categories." });
    }
    if (!submitting) return;

    if (formType === "GENERAL") requireText(value.description, ["description"], "Enter a description.");
    if (formType === "RENT") {
      requireDate(value.categoryDetails?.periodStart, ["categoryDetails", "periodStart"], "Select the rental period start.");
      requireDate(value.categoryDetails?.periodEnd, ["categoryDetails", "periodEnd"], "Select the rental period end.");
      if (!value.supplierId && !value.payee?.trim()) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["payee"], message: "Select or enter the landlord." });
      }
    }
    if (formType === "UTILITY") {
      requireText(value.categoryDetails?.utilityType, ["categoryDetails", "utilityType"], "Enter the utility type.");
      requireText(value.categoryDetails?.accountNumber, ["categoryDetails", "accountNumber"], "Enter the utility account number.");
      requireDate(value.categoryDetails?.periodStart, ["categoryDetails", "periodStart"], "Select the billing period start.");
      requireDate(value.categoryDetails?.periodEnd, ["categoryDetails", "periodEnd"], "Select the billing period end.");
    }
    if (formType === "EQUIPMENT_REPAIR") {
      requireText(value.categoryDetails?.equipmentDetails, ["categoryDetails", "equipmentDetails"], "Describe the equipment or repair.");
      requireDate(value.categoryDetails?.serviceDate, ["categoryDetails", "serviceDate"], "Select the purchase or service date.");
      if (!value.supplierId && !value.payee?.trim()) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["payee"], message: "Select or enter the supplier or technician." });
      }
    }
    if (formType === "INVENTORY_PURCHASE" && value.updateInventory) {
      value.items.forEach((item, index) => {
        if (!item.inventoryItemId) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index, "inventoryItemId"], message: "Match this line to an inventory item or turn off stock updating." });
        }
      });
    }
  }).safeParse(draft);
}

export const receiptFileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(10 * 1024 * 1024, "Receipts must be 10 MB or smaller."),
  type: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
});

export type ExpenseDraftForm = z.infer<typeof expenseDraftSchema>;
