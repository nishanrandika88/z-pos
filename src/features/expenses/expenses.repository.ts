/* Supabase is not configured with generated Database types in this repository; mapping is isolated below. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  EmployeeOption,
  EmployeeRecord,
  ExpenseCategory,
  ExpenseDetail,
  ExpenseDraft,
  ExpenseFilters,
  ExpenseFunding,
  ExpenseLine,
  ExpenseReceipt,
  ExpenseSummary,
  InventoryItem,
} from "@/domain/expenses/types";
import { reimbursementStatus } from "@/features/expenses/expense.service";
import { receiptFileSchema } from "@/features/expenses/expense.schemas";
import { supabase } from "@/shared/lib/supabase";

const expenseSelect = `
  id, expense_number, expense_date, category_id, supplier_id, payee_snapshot, invoice_number,
  description, subtotal, tax_total, additional_charges_total, discount_total, grand_total,
  payment_method, status, update_inventory, version, created_at, updated_at, approved_at, paid_at,
  voided_at, void_reason,
  category:expense_categories!expenses_category_id_fkey(name, kind, form_type),
  created_profile:profiles!expenses_created_by_fkey(full_name, display_name),
  updated_profile:profiles!expenses_updated_by_fkey(full_name, display_name),
  fundings:expense_fundings!inner(id, source, amount, person_paid, reimbursement_required, notes, reimbursements:expense_reimbursements(id, amount, reimbursement_date, notes))
`;

type PageOptions = { page: number; pageSize: number };

export interface ExpensePage {
  expenses: ExpenseSummary[];
  count: number;
  hasMore: boolean;
}

export interface SupplierOption {
  id: string;
  name: string;
  active: boolean;
}

export async function listExpenseCategories(includeArchived = false): Promise<ExpenseCategory[]> {
  let query = supabase
    .from("expense_categories")
    .select("id, name, kind, form_type, active, display_order")
    .order("display_order")
    .order("name");
  if (!includeArchived) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    formType: row.form_type,
    active: row.active,
    displayOrder: row.display_order,
  }));
}

export async function saveExpenseCategory(input: {
  id?: string;
  branchId: string;
  name: string;
  kind: ExpenseCategory["kind"];
  formType: ExpenseCategory["formType"];
  active: boolean;
  displayOrder?: number;
  userId: string;
}) {
  const payload = {
    branch_id: input.branchId,
    name: input.name.trim(),
    kind: input.kind,
    form_type: input.formType,
    active: input.active,
    display_order: input.displayOrder ?? 0,
    updated_by: input.userId,
    ...(input.id ? {} : { created_by: input.userId }),
  };
  const query = input.id
    ? supabase.from("expense_categories").update(payload).eq("id", input.id)
    : supabase.from("expense_categories").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function listEmployees(includeArchived = false): Promise<EmployeeRecord[]> {
  let query = supabase
    .from("employees")
    .select("id, profile_id, employee_number, full_name, job_title, active")
    .order("full_name");
  if (!includeArchived) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    profileId: row.profile_id ?? undefined,
    employeeNumber: row.employee_number ?? undefined,
    fullName: row.full_name,
    jobTitle: row.job_title ?? undefined,
    active: row.active,
  }));
}

export async function listEmployeeOptions(): Promise<EmployeeOption[]> {
  const [employees, profilesResult] = await Promise.all([
    listEmployees(),
    supabase.from("profiles").select("id, full_name, display_name, active").eq("active", true).order("full_name"),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  const linkedProfileIds = new Set(employees.flatMap((employee) => employee.profileId ? [employee.profileId] : []));
  return [
    ...employees.map((employee) => ({
      value: `employee:${employee.id}`,
      employeeId: employee.id,
      profileId: employee.profileId,
      fullName: employee.fullName,
      detail: [employee.employeeNumber, employee.jobTitle].filter(Boolean).join(" · ") || "Employee",
      source: "EMPLOYEE" as const,
    })),
    ...(profilesResult.data ?? [])
      .filter((profile) => !linkedProfileIds.has(profile.id))
      .map((profile) => ({
        value: `profile:${profile.id}`,
        profileId: profile.id,
        fullName: profile.full_name,
        detail: `${profile.display_name || profile.full_name} · System user`,
        source: "USER" as const,
      })),
  ];
}

export async function saveEmployee(input: {
  id?: string;
  branchId: string;
  userId: string;
  profileId?: string;
  employeeNumber?: string;
  fullName: string;
  jobTitle?: string;
  active: boolean;
}) {
  const payload = {
    branch_id: input.branchId,
    profile_id: input.profileId || null,
    employee_number: input.employeeNumber?.trim() || null,
    full_name: input.fullName.trim(),
    job_title: input.jobTitle?.trim() || null,
    active: input.active,
    updated_by: input.userId,
    ...(input.id ? {} : { created_by: input.userId }),
  };
  const query = input.id
    ? supabase.from("employees").update(payload).eq("id", input.id)
    : supabase.from("employees").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function listSuppliers(): Promise<SupplierOption[]> {
  const { data, error } = await supabase.from("suppliers").select("id, name, active").eq("active", true).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createSupplier(input: { branchId: string; name: string; userId: string }) {
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ branch_id: input.branchId, name: input.name.trim(), created_by: input.userId, updated_by: input.userId })
    .select("id, name, active")
    .single();
  if (error) throw error;
  return data as SupplierOption;
}

export async function listInventoryItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, name, sku, base_unit, quantity_on_hand, average_cost, reorder_level, catalog_item_id, active")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku ?? undefined,
    baseUnit: row.base_unit,
    quantityOnHand: String(row.quantity_on_hand),
    averageCost: String(row.average_cost),
    reorderLevel: String(row.reorder_level),
    catalogItemId: row.catalog_item_id ?? undefined,
    active: row.active,
  }));
}

export async function createInventoryItem(input: {
  branchId: string;
  userId: string;
  name: string;
  sku?: string;
  baseUnit: InventoryItem["baseUnit"];
  reorderLevel?: string;
}) {
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      branch_id: input.branchId,
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      base_unit: input.baseUnit,
      reorder_level: input.reorderLevel || "0",
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select("id, name, sku, base_unit, quantity_on_hand, average_cost, reorder_level, catalog_item_id, active")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    sku: data.sku ?? undefined,
    baseUnit: data.base_unit,
    quantityOnHand: String(data.quantity_on_hand),
    averageCost: String(data.average_cost),
    reorderLevel: String(data.reorder_level),
    catalogItemId: data.catalog_item_id ?? undefined,
    active: data.active,
  } satisfies InventoryItem;
}

export async function listExpenses(filters: ExpenseFilters, options: PageOptions): Promise<ExpensePage> {
  const start = (options.page - 1) * options.pageSize;
  const end = start + options.pageSize - 1;
  let query = supabase.from("expenses").select(expenseSelect, { count: "exact" });

  if (filters.search?.trim()) {
    const search = filters.search.trim().replace(/[,()]/g, " ");
    query = query.or(`expense_number.ilike.%${search}%,payee_snapshot.ilike.%${search}%,invoice_number.ilike.%${search}%`);
  }
  if (filters.dateFrom) query = query.gte("expense_date", `${filters.dateFrom}T00:00:00+05:30`);
  if (filters.dateTo) query = query.lte("expense_date", `${filters.dateTo}T23:59:59.999+05:30`);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.supplierId) query = query.eq("supplier_id", filters.supplierId);
  if (filters.userId) query = query.eq("created_by", filters.userId);
  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.fundSource) query = query.eq("fundings.source", filters.fundSource);

  const sort = filters.sort ?? "expense_date";
  const { data, error, count } = await query
    .order(sort, { ascending: filters.direction === "asc" })
    .order("id", { ascending: false })
    .range(start, end);
  if (error) throw error;

  let mapped = (data ?? []).map(mapExpenseSummary);
  if (filters.reimbursementStatus) {
    mapped = mapped.filter((expense) => expense.reimbursementStatus === filters.reimbursementStatus);
  }
  return { expenses: mapped, count: count ?? mapped.length, hasMore: end + 1 < (count ?? 0) };
}

export async function getExpense(id: string): Promise<ExpenseDetail> {
  const { data, error } = await supabase
    .from("expenses")
    .select(`${expenseSelect}, items:expense_items(id, inventory_item_id, description, quantity, unit_type, conversion_factor, base_quantity, unit_price, tax_amount, additional_charges, discount_amount, line_total, inventory_posted_at, inventory:inventory_items(name)), salary:salary_expense_details(employee_id, employee_profile_id, employee_name_snapshot, salary_period_start, salary_period_end, basic_salary, allowances, deductions, advance_payments, net_amount, payment_date, payment_status, notes), category_details:expense_category_details(form_type, period_start, period_end, due_date, payment_date, utility_type, account_number, equipment_details, service_date, warranty_information), receipts:expense_receipts(id, storage_path, original_file_name, mime_type, file_size, file_hash, processing_status, ocr_provider, extracted_data, corrected_data, error_message, duplicate_of_id, created_at)`)
    .eq("id", id)
    .single();
  if (error) throw error;

  const summary = mapExpenseSummary(data);
  const salary = first(data.salary);
  const categoryDetails = first(data.category_details);
  return {
    ...summary,
    voidReason: data.void_reason ?? undefined,
    approvedAt: data.approved_at ?? undefined,
    paidAt: data.paid_at ?? undefined,
    voidedAt: data.voided_at ?? undefined,
    items: (data.items ?? []).map(mapExpenseLine),
    fundings: (data.fundings ?? []).map(mapExpenseFunding),
    salary: salary ? {
      employeeId: salary.employee_id ?? undefined,
      employeeProfileId: salary.employee_profile_id ?? undefined,
      employeeName: salary.employee_name_snapshot,
      periodStart: salary.salary_period_start,
      periodEnd: salary.salary_period_end,
      basicSalary: String(salary.basic_salary),
      allowances: String(salary.allowances),
      deductions: String(salary.deductions),
      advancePayments: String(salary.advance_payments),
      paymentDate: salary.payment_date ?? undefined,
      paymentStatus: salary.payment_status,
      notes: salary.notes ?? undefined,
    } : undefined,
    categoryDetails: categoryDetails ? {
      periodStart: categoryDetails.period_start ?? undefined,
      periodEnd: categoryDetails.period_end ?? undefined,
      dueDate: categoryDetails.due_date ?? undefined,
      paymentDate: categoryDetails.payment_date ?? undefined,
      utilityType: categoryDetails.utility_type ?? undefined,
      accountNumber: categoryDetails.account_number ?? undefined,
      equipmentDetails: categoryDetails.equipment_details ?? undefined,
      serviceDate: categoryDetails.service_date ?? undefined,
      warrantyInformation: categoryDetails.warranty_information ?? undefined,
    } : undefined,
    receipts: (data.receipts ?? []).map(mapReceipt),
  };
}

export async function createExpense(draft: ExpenseDraft & { receiptIds?: string[] }) {
  const { data, error } = await supabase.rpc("create_expense", { expense_payload: draft });
  if (error) throw error;
  return data as string;
}

export async function findPotentialDuplicateExpense(input: {
  expenseDate: string;
  payee?: string;
  invoiceNumber?: string;
  grandTotal: string;
  excludeId?: string;
}) {
  const day = new Date(input.expenseDate).toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
  let query = supabase
    .from("expenses")
    .select("id, expense_number, expense_date, payee_snapshot, invoice_number, grand_total")
    .neq("status", "VOID")
    .gte("expense_date", `${day}T00:00:00+05:30`)
    .lte("expense_date", `${day}T23:59:59.999+05:30`)
    .eq("grand_total", input.grandTotal);
  if (input.invoiceNumber?.trim()) query = query.ilike("invoice_number", input.invoiceNumber.trim());
  else if (input.payee?.trim()) query = query.ilike("payee_snapshot", input.payee.trim());
  else return undefined;
  if (input.excludeId) query = query.neq("id", input.excludeId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data ?? undefined;
}

export async function updateExpense(id: string, version: number, draft: ExpenseDraft) {
  const { data, error } = await supabase.rpc("update_expense", {
    target_expense_id: id,
    expected_version: version,
    expense_payload: draft,
  });
  if (error) throw error;
  return data as number;
}

export async function approveExpense(id: string, version: number) {
  return versionAction("approve_expense", id, version);
}

export async function markExpensePaid(id: string, version: number) {
  return versionAction("mark_expense_paid", id, version);
}

export async function voidExpense(id: string, version: number, reason: string) {
  const { data, error } = await supabase.rpc("void_expense", { target_expense_id: id, expected_version: version, reason });
  if (error) throw error;
  return data as number;
}

export async function recordReimbursement(input: { fundingId: string; amount: string; date: string; notes?: string }) {
  const { data, error } = await supabase.rpc("record_expense_reimbursement", {
    target_funding_id: input.fundingId,
    reimbursement_amount: input.amount,
    target_date: input.date,
    reimbursement_notes: input.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function uploadExpenseReceipt(input: { branchId: string; userId: string; file: File }) {
  receiptFileSchema.parse({ name: input.file.name, size: input.file.size, type: input.file.type });
  const receiptId = crypto.randomUUID();
  const hash = await sha256(input.file);
  const { data: duplicate } = await supabase
    .from("expense_receipts")
    .select("id")
    .eq("branch_id", input.branchId)
    .eq("file_hash", hash)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "receipt";
  const storagePath = `${input.branchId}/${input.userId}/${receiptId}/${safeName}`;
  const { error: uploadError } = await supabase.storage.from("expense-receipts").upload(storagePath, input.file, {
    contentType: input.file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("expense_receipts")
    .insert({
      id: receiptId,
      branch_id: input.branchId,
      storage_path: storagePath,
      original_file_name: input.file.name,
      mime_type: input.file.type,
      file_size: input.file.size,
      file_hash: hash,
      duplicate_of_id: duplicate?.id ?? null,
      uploaded_by: input.userId,
    })
    .select("id, storage_path, original_file_name, mime_type, file_size, file_hash, processing_status, duplicate_of_id, created_at")
    .single();
  if (error) {
    await supabase.storage.from("expense-receipts").remove([storagePath]);
    throw error;
  }
  return mapReceipt(data);
}

export async function processExpenseReceipt(receiptId: string) {
  const { data, error } = await supabase.functions.invoke("process-expense-receipt", { body: { receiptId } });
  if (error) throw error;
  return data;
}

export async function getExpenseReceipt(receiptId: string) {
  const { data, error } = await supabase
    .from("expense_receipts")
    .select("id, storage_path, original_file_name, mime_type, file_size, file_hash, processing_status, ocr_provider, extracted_data, corrected_data, error_message, duplicate_of_id, created_at")
    .eq("id", receiptId)
    .single();
  if (error) throw error;
  return mapReceipt(data);
}

export async function reviewExpenseReceipt(receiptId: string, correctedData: unknown) {
  const { error } = await supabase.rpc("review_expense_receipt", { target_receipt_id: receiptId, corrected_payload: correctedData });
  if (error) throw error;
}

export async function createReceiptSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
}

function mapExpenseSummary(row: any): ExpenseSummary {
  const category = first(row.category);
  const created = first(row.created_profile);
  const updated = first(row.updated_profile);
  const fundings = (row.fundings ?? []) as any[];
  const personalAmount = sumAmounts(fundings.filter((funding) => funding.source === "PERSONAL"));
  const reimbursableAmount = sumAmounts(fundings.filter((funding) => funding.source === "PERSONAL" && funding.reimbursement_required !== false));
  const reimbursedAmount = sumAmounts(fundings.flatMap((funding) => funding.reimbursements ?? []));
  return {
    id: row.id,
    expenseNumber: row.expense_number,
    expenseDate: row.expense_date,
    categoryId: row.category_id,
    categoryName: category?.name ?? "Uncategorized",
    categoryKind: category?.kind ?? "OPERATIONAL",
    categoryFormType: category?.form_type ?? "GENERAL",
    supplierId: row.supplier_id ?? undefined,
    payee: row.payee_snapshot ?? undefined,
    invoiceNumber: row.invoice_number ?? undefined,
    description: row.description ?? undefined,
    subtotal: String(row.subtotal),
    taxTotal: String(row.tax_total),
    additionalChargesTotal: String(row.additional_charges_total),
    discountTotal: String(row.discount_total),
    grandTotal: String(row.grand_total),
    paymentMethod: row.payment_method,
    status: row.status,
    fundingSources: Array.from(new Set(fundings.map((funding) => funding.source))),
    personalAmount,
    reimbursableAmount,
    reimbursedAmount,
    reimbursementStatus: reimbursementStatus(reimbursableAmount, reimbursedAmount),
    createdByName: displayName(created),
    updatedByName: displayName(updated),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function mapExpenseLine(row: any): ExpenseLine {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id ?? undefined,
    inventoryItemName: first(row.inventory)?.name,
    description: row.description,
    quantity: String(row.quantity),
    unitType: row.unit_type,
    conversionFactor: String(row.conversion_factor),
    baseQuantity: String(row.base_quantity),
    unitPrice: String(row.unit_price),
    taxAmount: String(row.tax_amount),
    additionalCharges: String(row.additional_charges),
    discountAmount: String(row.discount_amount),
    lineTotal: String(row.line_total),
    inventoryPostedAt: row.inventory_posted_at ?? undefined,
  };
}

function mapExpenseFunding(row: any): ExpenseFunding {
  const reimbursedAmount = sumAmounts(row.reimbursements ?? []);
  return {
    id: row.id,
    source: row.source,
    amount: String(row.amount),
    personPaid: row.person_paid ?? undefined,
    reimbursementRequired: row.reimbursement_required,
    notes: row.notes ?? undefined,
    reimbursedAmount,
    reimbursementStatus: row.reimbursement_required === false ? "NOT_REQUIRED" : reimbursementStatus(String(row.amount), reimbursedAmount),
  };
}

function mapReceipt(row: any): ExpenseReceipt {
  return {
    id: row.id,
    storagePath: row.storage_path,
    fileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    fileHash: row.file_hash,
    processingStatus: row.processing_status,
    ocrProvider: row.ocr_provider ?? undefined,
    extractedData: row.extracted_data ?? undefined,
    correctedData: row.corrected_data ?? undefined,
    errorMessage: row.error_message ?? undefined,
    duplicateOfId: row.duplicate_of_id ?? undefined,
    createdAt: row.created_at,
  };
}

async function versionAction(functionName: "approve_expense" | "mark_expense_paid", id: string, version: number) {
  const { data, error } = await supabase.rpc(functionName, { target_expense_id: id, expected_version: version });
  if (error) throw error;
  return data as number;
}

function sumAmounts(rows: any[]) {
  const cents = rows.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  return (cents / 100).toFixed(2);
}

function first<T>(relation: T | T[] | null | undefined): T | undefined {
  return Array.isArray(relation) ? relation[0] : relation ?? undefined;
}

function displayName(profile: any) {
  return profile?.display_name || profile?.full_name || "Unknown user";
}

async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
