export type ExpenseCategoryKind = "OPERATIONAL" | "INVENTORY" | "SALARY";
export type ExpenseFormType = "GENERAL" | "SALARY" | "RENT" | "UTILITY" | "INVENTORY_PURCHASE" | "EQUIPMENT_REPAIR";
export type ExpenseStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID" | "VOID";
export type ExpensePaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "LANKAQR" | "OTHER";
export type FundSource = "SHOP_CASH" | "SHOP_BANK" | "SHOP_CARD" | "PERSONAL" | "OTHER";
export type ReimbursementStatus = "NOT_REQUIRED" | "PENDING" | "PARTIALLY_REIMBURSED" | "FULLY_REIMBURSED";
export type UnitType = "UNIT" | "GRAM" | "KILOGRAM" | "MILLILITRE" | "LITRE" | "PACK" | "BOTTLE" | "BOX" | "OTHER";

export interface ExpenseCategory {
  id: string;
  name: string;
  kind: ExpenseCategoryKind;
  formType: ExpenseFormType;
  active: boolean;
  displayOrder: number;
}

export interface ExpenseLineDraft {
  inventoryItemId?: string;
  description: string;
  quantity: string;
  unitType: UnitType;
  conversionFactor: string;
  unitPrice: string;
  taxAmount: string;
  additionalCharges: string;
  discountAmount: string;
}

export interface ExpenseFundingDraft {
  source: FundSource;
  amount: string;
  personEmployeeId?: string;
  personProfileId?: string;
  personPaid?: string;
  reimbursementRequired?: boolean;
  notes?: string;
}

export interface SalaryExpenseDraft {
  employeeId?: string;
  employeeProfileId?: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  basicSalary: string;
  allowances: string;
  deductions: string;
  advancePayments: string;
  paymentDate?: string;
  paymentStatus: "PENDING" | "PARTIALLY_PAID" | "PAID";
  notes?: string;
}

export interface ExpenseCategoryDetailsDraft {
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
  paymentDate?: string;
  utilityType?: string;
  accountNumber?: string;
  equipmentDetails?: string;
  serviceDate?: string;
  warrantyInformation?: string;
}

export interface ExpenseDraft {
  clientRequestId: string;
  expenseDate: string;
  categoryId: string;
  supplierId?: string;
  payee?: string;
  invoiceNumber?: string;
  description?: string;
  paymentMethod: ExpensePaymentMethod;
  status: "DRAFT" | "PENDING_APPROVAL";
  updateInventory: boolean;
  items: ExpenseLineDraft[];
  fundings: ExpenseFundingDraft[];
  salary?: SalaryExpenseDraft;
  categoryDetails?: ExpenseCategoryDetailsDraft;
}

export interface ExpenseTotals {
  subtotal: string;
  taxTotal: string;
  additionalChargesTotal: string;
  discountTotal: string;
  grandTotal: string;
}

export interface ExpenseSummary extends ExpenseTotals {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  categoryId: string;
  categoryName: string;
  categoryKind: ExpenseCategoryKind;
  categoryFormType: ExpenseFormType;
  supplierId?: string;
  payee?: string;
  invoiceNumber?: string;
  description?: string;
  paymentMethod: ExpensePaymentMethod;
  status: ExpenseStatus;
  fundingSources: FundSource[];
  personalAmount: string;
  reimbursableAmount: string;
  reimbursedAmount: string;
  reimbursementStatus: ReimbursementStatus;
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ExpenseLine extends ExpenseLineDraft {
  id: string;
  baseQuantity: string;
  lineTotal: string;
  inventoryItemName?: string;
  inventoryPostedAt?: string;
}

export interface ExpenseFunding extends ExpenseFundingDraft {
  id: string;
  reimbursedAmount: string;
  reimbursementStatus: ReimbursementStatus;
}

export interface ExpenseReceipt {
  id: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  processingStatus: "UPLOADED" | "PROCESSING" | "EXTRACTED" | "FAILED" | "REVIEWED";
  ocrProvider?: string;
  extractedData?: unknown;
  correctedData?: unknown;
  errorMessage?: string;
  duplicateOfId?: string;
  createdAt: string;
}

export interface ExpenseDetail extends ExpenseSummary {
  voidReason?: string;
  approvedAt?: string;
  paidAt?: string;
  voidedAt?: string;
  items: ExpenseLine[];
  fundings: ExpenseFunding[];
  salary?: SalaryExpenseDraft;
  categoryDetails?: ExpenseCategoryDetailsDraft;
  receipts: ExpenseReceipt[];
}

export interface ExpenseFilters {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  supplierId?: string;
  userId?: string;
  fundSource?: FundSource;
  paymentMethod?: ExpensePaymentMethod;
  reimbursementStatus?: ReimbursementStatus;
  status?: ExpenseStatus;
  sort?: "expense_date" | "grand_total" | "created_at" | "expense_number";
  direction?: "asc" | "desc";
}

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  baseUnit: UnitType;
  quantityOnHand: string;
  averageCost: string;
  reorderLevel: string;
  catalogItemId?: string;
  active: boolean;
}

export interface EmployeeRecord {
  id: string;
  profileId?: string;
  employeeNumber?: string;
  fullName: string;
  jobTitle?: string;
  active: boolean;
}

export interface EmployeeOption {
  value: string;
  employeeId?: string;
  profileId?: string;
  fullName: string;
  detail?: string;
  source: "EMPLOYEE" | "USER";
}

export interface RecentExpenseDefaults {
  expenseNumber: string;
  supplierId?: string;
  payee?: string;
  paymentMethod: ExpensePaymentMethod;
  fundingSource?: Exclude<FundSource, "PERSONAL">;
  utilityType?: string;
  accountNumber?: string;
}
