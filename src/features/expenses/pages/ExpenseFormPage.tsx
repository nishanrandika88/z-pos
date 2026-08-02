import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Info, Plus, Save, Trash2, Upload } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type {
  EmployeeOption,
  ExpenseCategoryDetailsDraft,
  ExpenseDraft,
  ExpenseFormType,
  ExpenseFunding,
  ExpenseLine,
  ExpenseLineDraft,
  SalaryExpenseDraft,
  UnitType,
} from "@/domain/expenses/types";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { addMoney, calculateExpenseTotals, calculateSalaryNet, compareMoney } from "@/features/expenses/expense.service";
import { validateExpenseDraft } from "@/features/expenses/expense.schemas";
import {
  createExpense,
  findPotentialDuplicateExpense,
  getExpense,
  getExpenseReceipt,
  getRecentExpenseDefaults,
  listEmployeeOptions,
  listExpenseCategories,
  listInventoryItems,
  listSuppliers,
  updateExpense,
  uploadExpenseReceipt,
} from "@/features/expenses/expenses.repository";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

const currency = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const units: UnitType[] = ["UNIT", "GRAM", "KILOGRAM", "MILLILITRE", "LITRE", "PACK", "BOTTLE", "BOX", "OTHER"];
type FieldErrors = Record<string, string>;

export function ExpenseFormPage() {
  const { expenseId } = useParams();
  const [searchParams] = useSearchParams();
  const receiptId = searchParams.get("receiptId") ?? undefined;
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ExpenseDraft>(newDraft());
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const initializedEdit = useRef(false);
  const initializedReceipt = useRef(false);
  const categoriesQuery = useQuery({ queryKey: ["expense-categories"], queryFn: () => listExpenseCategories() });
  const suppliersQuery = useQuery({ queryKey: ["expense-suppliers"], queryFn: listSuppliers });
  const inventoryQuery = useQuery({ queryKey: ["expense-inventory"], queryFn: listInventoryItems });
  const employeeOptionsQuery = useQuery({ queryKey: ["expense-employee-options"], queryFn: listEmployeeOptions });
  const expenseQuery = useQuery({ queryKey: ["expense", expenseId], queryFn: () => getExpense(expenseId!), enabled: Boolean(expenseId) });
  const receiptQuery = useQuery({ queryKey: ["expense-receipt", receiptId], queryFn: () => getExpenseReceipt(receiptId!), enabled: Boolean(receiptId && !expenseId) });
  const defaultsQuery = useQuery({
    queryKey: ["expense-recent-defaults", draft.categoryId],
    queryFn: () => getRecentExpenseDefaults(draft.categoryId),
    enabled: Boolean(draft.categoryId && !expenseId),
    staleTime: 60_000,
  });
  const selectedCategory = categoriesQuery.data?.find((category) => category.id === draft.categoryId);
  const formType = selectedCategory?.formType ?? "GENERAL";
  const totalsResult = useMemo(() => {
    try { return { totals: calculateExpenseTotals(draft.items), error: undefined }; }
    catch (error) { return { totals: undefined, error: error instanceof Error ? error.message : "Invalid expense totals." }; }
  }, [draft.items]);

  useEffect(() => {
    if (!expenseQuery.data || initializedEdit.current) return;
    initializedEdit.current = true;
    const expense = expenseQuery.data;
    setDraft({
      clientRequestId: crypto.randomUUID(), expenseDate: expense.expenseDate, categoryId: expense.categoryId,
      supplierId: expense.supplierId, payee: expense.payee, invoiceNumber: expense.invoiceNumber,
      description: expense.description, paymentMethod: expense.paymentMethod,
      status: expense.status === "DRAFT" ? "DRAFT" : "PENDING_APPROVAL",
      updateInventory: expense.items.some((item) => Boolean(item.inventoryItemId)),
      items: expense.items.map(toDraftLine), fundings: expense.fundings.map(toDraftFunding),
      salary: expense.salary, categoryDetails: expense.categoryDetails,
    });
  }, [expenseQuery.data]);

  useEffect(() => {
    if (!receiptQuery.data || initializedReceipt.current) return;
    initializedReceipt.current = true;
    const extracted = (receiptQuery.data.correctedData ?? receiptQuery.data.extractedData) as ReceiptExtraction | undefined;
    if (!extracted || typeof extracted !== "object") return;
    setDraft((current) => ({
      ...current,
      expenseDate: extracted.purchaseDate ? new Date(`${extracted.purchaseDate}T12:00:00+05:30`).toISOString() : current.expenseDate,
      payee: extracted.supplierName || current.payee,
      invoiceNumber: extracted.invoiceNumber || current.invoiceNumber,
      items: Array.isArray(extracted.items) && extracted.items.length ? extracted.items.map((item) => ({
        ...emptyLine(), description: String(item.description || item.name || "Purchased item"),
        quantity: decimalText(item.quantity, "1.000"), unitPrice: decimalText(item.unitPrice, "0.00"),
        discountAmount: decimalText(item.discount, "0.00"), taxAmount: decimalText(item.tax, "0.00"),
      })) : current.items,
    }));
  }, [receiptQuery.data]);

  useEffect(() => {
    if (formType !== "SALARY" || !draft.salary) return;
    try {
      const net = calculateSalaryNet(draft.salary);
      const description = `Salary - ${draft.salary.employeeName || "employee"}`;
      setDraft((current) => {
        const line = current.items[0];
        const funding = current.fundings[0];
        if (line?.unitPrice === net && line.description === description && (current.fundings.length !== 1 || funding.amount === net)) return current;
        return {
          ...current,
          items: [{ ...emptyLine(), description, unitPrice: net }],
          fundings: current.fundings.length === 1 ? [{ ...funding, amount: net }] : current.fundings,
        };
      });
    } catch { /* Salary validation displays the actionable message. */ }
  }, [draft.salary, formType]);

  const saveMutation = useMutation({
    mutationFn: async (status: ExpenseDraft["status"]) => {
      const candidate = prepareDraft({ ...draft, status }, formType, selectedCategory?.name);
      const parsed = validateExpenseDraft(candidate, formType);
      const nextFieldErrors: FieldErrors = {};
      const validationErrors: string[] = [];
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => {
          const path = issue.path.join(".");
          if (!nextFieldErrors[path]) nextFieldErrors[path] = issue.message;
          validationErrors.push(issue.message);
        });
      }
      if (!selectedCategory) {
        nextFieldErrors.categoryId = "Select an expense category.";
        validationErrors.push(nextFieldErrors.categoryId);
      }
      if (totalsResult.error) validationErrors.push(totalsResult.error);
      if (formType === "SALARY" && candidate.salary && totalsResult.totals) {
        try {
          if (compareMoney(calculateSalaryNet(candidate.salary), totalsResult.totals.grandTotal) !== 0) validationErrors.push("Salary net must equal the expense total.");
        } catch (error) { validationErrors.push(error instanceof Error ? error.message : "Invalid salary values."); }
      }
      let fundingTotal = "0.00";
      try { fundingTotal = candidate.fundings.reduce((sum, funding) => addMoney(sum, funding.amount), "0.00"); }
      catch { validationErrors.push("Funding amounts must be valid money values."); }
      if (!totalsResult.totals || compareMoney(fundingTotal, totalsResult.totals.grandTotal) !== 0) {
        nextFieldErrors.fundings = "Sources of funds must equal the expense total.";
        validationErrors.push(nextFieldErrors.fundings);
      }
      setFieldErrors(nextFieldErrors);
      if (validationErrors.length) { setErrors(Array.from(new Set(validationErrors))); throw new ValidationError(); }
      if (!profile) throw new Error("Your session is no longer available.");

      const duplicate = totalsResult.totals ? await findPotentialDuplicateExpense({
        expenseDate: candidate.expenseDate, payee: candidate.payee, invoiceNumber: candidate.invoiceNumber,
        grandTotal: totalsResult.totals.grandTotal, excludeId: expenseId,
      }) : undefined;
      if (duplicate && !window.confirm(`Possible duplicate ${duplicate.expense_number} has the same date, total, and ${candidate.invoiceNumber ? "invoice number" : "payee"}. Save anyway?`)) {
        throw new Error("Save cancelled after duplicate warning.");
      }
      if (expenseId) { await updateExpense(expenseId, expenseQuery.data!.version, candidate); return expenseId; }

      const uploadedIds = receiptId ? [receiptId] : [];
      for (const file of files) {
        const receipt = await uploadExpenseReceipt({ branchId: profile.branchId, userId: profile.id, file });
        uploadedIds.push(receipt.id);
      }
      return createExpense({ ...candidate, receiptIds: uploadedIds });
    },
    onSuccess: async (id) => { await queryClient.invalidateQueries({ queryKey: ["expenses"] }); navigate(`/expenses/${id}`, { replace: true }); },
    onError: (error) => { if (!(error instanceof ValidationError)) setErrors([error.message]); },
  });

  function changeCategory(categoryId: string) {
    const next = categoriesQuery.data?.find((category) => category.id === categoryId);
    if (!next) { setDraft((current) => ({ ...current, categoryId: "" })); return; }
    if (selectedCategory && selectedCategory.formType !== next.formType && !window.confirm("Changing the category will clear incompatible category-specific fields. Continue?")) return;
    setDraft((current) => configureForCategory(current, selectedCategory?.formType, next.formType, categoryId));
    setErrors([]); setFieldErrors({});
  }

  function updateLine(index: number, patch: Partial<ExpenseLineDraft>) {
    setDraft((current) => ({ ...current, items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }));
  }

  function setSimpleAmount(amount: string) {
    setDraft((current) => ({
      ...current,
      items: [{ ...emptyLine(), description: simpleDescription(current, formType, selectedCategory?.name), unitPrice: amount }],
      fundings: current.fundings.length === 1 ? [{ ...current.fundings[0], amount }] : current.fundings,
    }));
  }

  function syncFunding() {
    if (!totalsResult.totals) return;
    setDraft((current) => ({ ...current, fundings: current.fundings.length === 1 ? [{ ...current.fundings[0], amount: totalsResult.totals!.grandTotal }] : current.fundings }));
  }

  function applyPreviousDefaults() {
    const previous = defaultsQuery.data;
    if (!previous) return;
    setDraft((current) => ({
      ...current,
      supplierId: previous.supplierId,
      payee: previous.payee,
      paymentMethod: previous.paymentMethod,
      categoryDetails: current.categoryDetails ? {
        ...current.categoryDetails,
        utilityType: previous.utilityType ?? current.categoryDetails.utilityType,
        accountNumber: previous.accountNumber ?? current.categoryDetails.accountNumber,
      } : current.categoryDetails,
      fundings: current.fundings.length === 1 && previous.fundingSource ? [{
        ...current.fundings[0],
        source: previous.fundingSource,
        personEmployeeId: undefined,
        personProfileId: undefined,
        personPaid: undefined,
        reimbursementRequired: undefined,
      }] : current.fundings,
    }));
  }

  if (expenseId && expenseQuery.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading expense…</p>;
  if (expenseQuery.error) return <p className="p-6 text-sm text-destructive">{expenseQuery.error.message}</p>;

  return <div className="space-y-4">
    <div className="flex items-center gap-3"><Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-semibold">{expenseId ? "Edit expense" : "New expense"}</h1><p className="text-sm text-muted-foreground">Choose a category first. Fields marked <span className="font-semibold text-destructive">*</span> are required. Tap or focus an <Info className="inline h-3.5 w-3.5" aria-hidden="true" /> icon for help.</p></div></div>
    {errors.length ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p className="font-semibold">Please fix the following:</p><ul className="mt-1 list-disc pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}

    <Card><CardHeader><h2 className="font-semibold">1. Expense basics</h2><p className="text-sm text-muted-foreground">Category controls which details appear below.</p></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Category" required info="The category controls which fields appear and how this expense is reported." error={fieldErrors.categoryId}><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={draft.categoryId} onChange={(event) => changeCategory(event.target.value)}><option value="">Select category</option>{(categoriesQuery.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
      <Field label="Date and time" required info="When this expense transaction occurred. For salary, use the time the payment was made; the salary period is entered separately." error={fieldErrors.expenseDate}><Input type="datetime-local" value={toInputDateTime(draft.expenseDate)} onChange={(event) => setDraft({ ...draft, expenseDate: new Date(event.target.value).toISOString() })} /></Field>
      <Field label="Payment method" required info="How the supplier or employee received the payment. Source of funds below records where the shop's money came from." error={fieldErrors.paymentMethod}><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value as ExpenseDraft["paymentMethod"] })}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="LANKAQR">LankaQR</option><option value="OTHER">Other</option></select></Field>
    </CardContent></Card>

    {selectedCategory ? <>
      {defaultsQuery.data ? <PreviousDefaultsCard defaults={defaultsQuery.data} onApply={applyPreviousDefaults} /> : null}
      <CategoryFields formType={formType} draft={draft} setDraft={setDraft} suppliers={suppliersQuery.data ?? []} employeeOptions={employeeOptionsQuery.data ?? []} fieldErrors={fieldErrors} />
      {formType === "INVENTORY_PURCHASE" ? <InventoryLines draft={draft} setDraft={setDraft} updateLine={updateLine} inventory={inventoryQuery.data ?? []} fieldErrors={fieldErrors} /> : null}
      {!["SALARY", "INVENTORY_PURCHASE"].includes(formType) ? <Card><CardHeader><h2 className="font-semibold">Amount</h2><p className="text-sm text-muted-foreground">A standard accounting line is created automatically.</p></CardHeader><CardContent className="max-w-sm"><Field label="Expense amount" required error={fieldErrors["items.0.unitPrice"]}><Input inputMode="decimal" value={draft.items[0]?.unitPrice ?? "0.00"} onChange={(event) => setSimpleAmount(event.target.value)} /></Field></CardContent></Card> : null}
      <FundingFields draft={draft} setDraft={setDraft} employeeOptions={employeeOptionsQuery.data ?? []} total={totalsResult.totals?.grandTotal} error={fieldErrors.fundings} onSync={syncFunding} />
      {!expenseId ? <ReceiptFields files={files} setFiles={setFiles} reviewedFileName={receiptQuery.data?.fileName} /> : null}
      <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-muted-foreground">Expense total</p><p className="text-2xl font-bold text-brand-forest">{totalsResult.totals ? currency.format(Number(totalsResult.totals.grandTotal)) : "Invalid totals"}</p><p className="text-xs text-muted-foreground">Subtotal {totalsResult.totals?.subtotal ?? "—"} · tax {totalsResult.totals?.taxTotal ?? "—"} · charges {totalsResult.totals?.additionalChargesTotal ?? "—"} · discount {totalsResult.totals?.discountTotal ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">A draft remains editable. Submission sends the record for approval; it does not mark it paid.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate("DRAFT")}>Save as draft</Button><Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate("PENDING_APPROVAL")}><Save className="h-4 w-4" />{saveMutation.isPending ? "Saving…" : "Submit for approval"}</Button></div></CardContent></Card>
    </> : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Select a category to continue.</CardContent></Card>}
    <p className="text-xs text-muted-foreground"><Link className="hover:underline" to="/expenses">Cancel and return to expenses</Link></p>
  </div>;
}

function PreviousDefaultsCard({ defaults, onApply }: { defaults: NonNullable<Awaited<ReturnType<typeof getRecentExpenseDefaults>>>; onApply: () => void }) {
  const reusable = [
    defaults.payee,
    defaults.utilityType,
    defaults.accountNumber ? `account ${defaults.accountNumber}` : undefined,
    label(defaults.paymentMethod),
    defaults.fundingSource ? label(defaults.fundingSource) : undefined,
  ].filter(Boolean).join(" · ");
  return <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Reuse details from {defaults.expenseNumber}?</p><p className="text-sm text-muted-foreground">{reusable || "Previous supplier and payment preferences are available."}</p><p className="text-xs text-muted-foreground">Amounts, invoice numbers, and transaction or billing dates are never copied.</p></div><Button type="button" variant="outline" onClick={onApply}>Use previous details</Button></CardContent></Card>;
}

function CategoryFields({ formType, draft, setDraft, suppliers, employeeOptions, fieldErrors }: {
  formType: ExpenseFormType; draft: ExpenseDraft; setDraft: React.Dispatch<React.SetStateAction<ExpenseDraft>>;
  suppliers: Array<{ id: string; name: string }>; employeeOptions: EmployeeOption[]; fieldErrors: FieldErrors;
}) {
  if (formType === "SALARY" && draft.salary) return <SalaryFields salary={draft.salary} employeeOptions={employeeOptions} errors={fieldErrors} onChange={(salary) => setDraft({ ...draft, salary })} />;
  const details = draft.categoryDetails ?? {};
  const setDetails = (patch: Partial<ExpenseCategoryDetailsDraft>) => setDraft({ ...draft, categoryDetails: { ...details, ...patch } });
  const payeeLabel = formType === "RENT" ? "Landlord" : formType === "UTILITY" ? "Utility provider" : formType === "EQUIPMENT_REPAIR" ? "Supplier or technician" : "Payee";
  return <Card><CardHeader><h2 className="font-semibold">2. {categoryTitle(formType)}</h2></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <Field label="Saved supplier" optional info="Choose a saved supplier to reuse its current name. Leave blank when the payee is not in the supplier list."><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={draft.supplierId ?? ""} onChange={(event) => setDraft({ ...draft, supplierId: event.target.value || undefined })}><option value="">No saved supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
    <Field label={payeeLabel} required={["RENT", "EQUIPMENT_REPAIR"].includes(formType)} optional={!["RENT", "EQUIPMENT_REPAIR"].includes(formType)} error={fieldErrors.payee}><Input value={draft.payee ?? ""} onChange={(event) => setDraft({ ...draft, payee: event.target.value })} /></Field>
    <Field label="Invoice or bill number" optional><Input value={draft.invoiceNumber ?? ""} onChange={(event) => setDraft({ ...draft, invoiceNumber: event.target.value })} /></Field>
    {formType === "RENT" ? <>
      <Field label="Rental period start" required error={fieldErrors["categoryDetails.periodStart"]}><Input type="date" value={details.periodStart ?? ""} onChange={(event) => setDetails({ periodStart: event.target.value })} /></Field>
      <Field label="Rental period end" required error={fieldErrors["categoryDetails.periodEnd"]}><Input type="date" value={details.periodEnd ?? ""} onChange={(event) => setDetails({ periodEnd: event.target.value })} /></Field>
      <Field label="Due date" optional><Input type="date" value={details.dueDate ?? ""} onChange={(event) => setDetails({ dueDate: event.target.value })} /></Field>
      <Field label="Payment date" optional><Input type="date" value={details.paymentDate ?? ""} onChange={(event) => setDetails({ paymentDate: event.target.value })} /></Field>
    </> : null}
    {formType === "UTILITY" ? <>
      <Field label="Utility type" required error={fieldErrors["categoryDetails.utilityType"]}><Input placeholder="Electricity, water, internet…" value={details.utilityType ?? ""} onChange={(event) => setDetails({ utilityType: event.target.value })} /></Field>
      <Field label="Account number" required error={fieldErrors["categoryDetails.accountNumber"]}><Input value={details.accountNumber ?? ""} onChange={(event) => setDetails({ accountNumber: event.target.value })} /></Field>
      <Field label="Billing period start" required error={fieldErrors["categoryDetails.periodStart"]}><Input type="date" value={details.periodStart ?? ""} onChange={(event) => setDetails({ periodStart: event.target.value })} /></Field>
      <Field label="Billing period end" required error={fieldErrors["categoryDetails.periodEnd"]}><Input type="date" value={details.periodEnd ?? ""} onChange={(event) => setDetails({ periodEnd: event.target.value })} /></Field>
      <Field label="Due date" optional><Input type="date" value={details.dueDate ?? ""} onChange={(event) => setDetails({ dueDate: event.target.value })} /></Field>
      <Field label="Payment date" optional><Input type="date" value={details.paymentDate ?? ""} onChange={(event) => setDetails({ paymentDate: event.target.value })} /></Field>
    </> : null}
    {formType === "EQUIPMENT_REPAIR" ? <>
      <Field label="Equipment or repair details" required className="md:col-span-2" error={fieldErrors["categoryDetails.equipmentDetails"]}><Input value={details.equipmentDetails ?? ""} onChange={(event) => setDetails({ equipmentDetails: event.target.value })} /></Field>
      <Field label="Purchase or service date" required error={fieldErrors["categoryDetails.serviceDate"]}><Input type="date" value={details.serviceDate ?? ""} onChange={(event) => setDetails({ serviceDate: event.target.value })} /></Field>
      <Field label="Warranty information" optional className="md:col-span-2"><Input placeholder="Warranty period, reference, or expiry" value={details.warrantyInformation ?? ""} onChange={(event) => setDetails({ warrantyInformation: event.target.value })} /></Field>
    </> : null}
    <Field label="Description or notes" required={formType === "GENERAL"} optional={formType !== "GENERAL"} className="md:col-span-2 xl:col-span-3" error={fieldErrors.description}><textarea className="min-h-20 w-full rounded-md border bg-white p-3 text-sm" value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
  </CardContent></Card>;
}

function SalaryFields({ salary, employeeOptions, errors, onChange }: { salary: SalaryExpenseDraft; employeeOptions: EmployeeOption[]; errors: FieldErrors; onChange: (salary: SalaryExpenseDraft) => void }) {
  let net = "—"; try { net = calculateSalaryNet(salary); } catch { /* validation handles this */ }
  const selectedValue = salary.employeeId ? `employee:${salary.employeeId}` : salary.employeeProfileId ? `profile:${salary.employeeProfileId}` : "";
  return <Card><CardHeader><h2 className="font-semibold">2. Salary details</h2><p className="text-sm text-muted-foreground">Net salary is calculated and used as the expense amount automatically.</p></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Field label="Employee record" optional helper="Select an employee or system user, or enter a non-login employee below."><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={selectedValue} onChange={(event) => { const option = employeeOptions.find((item) => item.value === event.target.value); onChange({ ...salary, employeeId: option?.employeeId, employeeProfileId: option?.profileId, employeeName: option?.fullName ?? "" }); }}><option value="">Manual / non-login employee</option>{employeeOptions.map((option) => <option key={option.value} value={option.value}>{option.fullName}{option.detail ? ` · ${option.detail}` : ""}</option>)}</select></Field>
    <Field label="Employee name" required error={errors["salary.employeeName"]}><Input disabled={Boolean(selectedValue)} value={salary.employeeName} onChange={(event) => onChange({ ...salary, employeeName: event.target.value })} /></Field>
    <Field label="Period start" required info="The first included work/pay day for this salary record. Salary periods should not overlap." error={errors["salary.periodStart"]}><Input type="date" value={salary.periodStart} onChange={(event) => onChange({ ...salary, periodStart: event.target.value })} /></Field>
    <Field label="Period end" required info="The last included work/pay day. Start the next salary period on the following day to avoid counting a day twice." error={errors["salary.periodEnd"]}><Input type="date" value={salary.periodEnd} onChange={(event) => onChange({ ...salary, periodEnd: event.target.value })} /></Field>
    <Field label="Basic salary" required info="The base salary for this specific period or installment, before allowances and deductions." error={errors["salary.basicSalary"]}><Input inputMode="decimal" value={salary.basicSalary} onChange={(event) => onChange({ ...salary, basicSalary: event.target.value })} /></Field>
    <Field label="Allowances" required info="Extra pay added to basic salary, such as travel, meals, or overtime." helper="Enter 0.00 when none." error={errors["salary.allowances"]}><Input inputMode="decimal" value={salary.allowances} onChange={(event) => onChange({ ...salary, allowances: event.target.value })} /></Field>
    <Field label="Deductions" required info="Amounts withheld from this payment, excluding salary advances already paid." helper="Enter 0.00 when none." error={errors["salary.deductions"]}><Input inputMode="decimal" value={salary.deductions} onChange={(event) => onChange({ ...salary, deductions: event.target.value })} /></Field>
    <Field label="Advances" required info="Salary money already paid earlier that must be subtracted now. For a separate LKR 25,000 installment, enter 25,000 as Basic salary and keep Advances at 0.00." helper="Enter 0.00 when none." error={errors["salary.advancePayments"]}><Input inputMode="decimal" value={salary.advancePayments} onChange={(event) => onChange({ ...salary, advancePayments: event.target.value })} /></Field>
    <Field label="Payment date" optional info="The calendar date the employee was actually paid. Leave blank while unpaid; marking the approved expense as paid fills today's date when this is blank."><Input type="date" value={salary.paymentDate ?? ""} onChange={(event) => onChange({ ...salary, paymentDate: event.target.value })} /></Field>
    <div className="rounded-md border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Calculated net salary</p><p className="text-xl font-semibold">{net === "—" ? net : currency.format(Number(net))}</p><p className="text-xs text-muted-foreground">Basic + allowances − deductions − advances</p></div>
  </CardContent></Card>;
}

function InventoryLines({ draft, setDraft, updateLine, inventory, fieldErrors }: { draft: ExpenseDraft; setDraft: React.Dispatch<React.SetStateAction<ExpenseDraft>>; updateLine: (index: number, patch: Partial<ExpenseLineDraft>) => void; inventory: Array<{ id: string; name: string; baseUnit: UnitType; averageCost: string; active: boolean }>; fieldErrors: FieldErrors }) {
  return <Card><CardHeader><div className="flex items-center justify-between"><div><h2 className="font-semibold">3. Purchased items</h2><p className="text-sm text-muted-foreground">Select an inventory match to auto-fill its base unit. Previous cost is shown only as a reference.</p></div><Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, items: [...draft.items, emptyLine()] })}><Plus className="h-4 w-4" />Line</Button></div></CardHeader><CardContent className="space-y-3">
    {draft.items.map((line, index) => { const matched = inventory.find((item) => item.id === line.inventoryItemId); return <div key={index} className="space-y-3 rounded-lg border p-3"><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[2fr_2fr_1fr_1fr_1fr_auto]"><Field label="Item" required error={fieldErrors[`items.${index}.description`]}><Input value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></Field><Field label="Inventory match" required={draft.updateInventory} optional={!draft.updateInventory} error={fieldErrors[`items.${index}.inventoryItemId`]} helper={matched ? `Current average cost: ${currency.format(Number(matched.averageCost))}` : undefined}><select className="h-10 w-full rounded-md border bg-white px-2 text-sm" value={line.inventoryItemId ?? ""} onChange={(event) => { const item = inventory.find((candidate) => candidate.id === event.target.value); updateLine(index, { inventoryItemId: item?.id, unitType: item?.baseUnit ?? line.unitType, conversionFactor: item ? "1.000" : line.conversionFactor }); }}><option value="">None</option>{inventory.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Quantity" required error={fieldErrors[`items.${index}.quantity`]}><Input inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></Field><Field label="Unit" required><select className="h-10 w-full rounded-md border bg-white px-2 text-sm" value={line.unitType} onChange={(event) => updateLine(index, { unitType: event.target.value as UnitType })}>{units.map((unit) => <option key={unit} value={unit}>{label(unit)}</option>)}</select></Field><Field label="Unit price" required error={fieldErrors[`items.${index}.unitPrice`]}><Input inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} /></Field><div className="flex items-end"><Button variant="ghost" size="icon" aria-label="Remove line" disabled={draft.items.length === 1} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" /></Button></div></div><details><summary className="cursor-pointer text-sm font-medium text-brand-forest">More line details</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Field label="Conversion to base" required><Input inputMode="decimal" value={line.conversionFactor} onChange={(event) => updateLine(index, { conversionFactor: event.target.value })} /></Field><Field label="Tax" optional><Input inputMode="decimal" value={line.taxAmount} onChange={(event) => updateLine(index, { taxAmount: event.target.value })} /></Field><Field label="Additional charges" optional><Input inputMode="decimal" value={line.additionalCharges} onChange={(event) => updateLine(index, { additionalCharges: event.target.value })} /></Field><Field label="Discount" optional><Input inputMode="decimal" value={line.discountAmount} onChange={(event) => updateLine(index, { discountAmount: event.target.value })} /></Field></div></details></div>; })}
    <div className="flex items-center gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.updateInventory} onChange={(event) => setDraft({ ...draft, updateInventory: event.target.checked })} />Update matched inventory after approval</label><InfoHint text="When enabled, approving this expense increases stock for every matched inventory line. Saving a draft or submitting for approval does not change stock." /></div>
  </CardContent></Card>;
}

function FundingFields({ draft, setDraft, employeeOptions, total, error, onSync }: { draft: ExpenseDraft; setDraft: React.Dispatch<React.SetStateAction<ExpenseDraft>>; employeeOptions: EmployeeOption[]; total?: string; error?: string; onSync: () => void }) {
  return <Card><CardHeader><div className="flex items-center justify-between"><div><h2 className="font-semibold">3. Source of funds</h2><p className="text-sm text-muted-foreground">Funding must equal the expense total. Personal payments create a reimbursement balance.</p></div><Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, fundings: [...draft.fundings, { source: "SHOP_CASH", amount: "0.00" }] })}><Plus className="h-4 w-4" />Source</Button></div></CardHeader><CardContent className="space-y-3">
    {draft.fundings.map((funding, index) => { const selectedPayer = funding.personEmployeeId ? `employee:${funding.personEmployeeId}` : funding.personProfileId ? `profile:${funding.personProfileId}` : ""; return <div key={index} className="space-y-2 rounded-lg border p-3"><div className="grid gap-2 sm:grid-cols-[180px_160px_1fr_auto]"><Field label="Funding source" required info="Where the money came from. Shop cash/bank/card belongs to the business; Personal money means a person paid for the shop."><select className="h-10 rounded-md border bg-white px-3 text-sm" value={funding.source} onChange={(event) => setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, source: event.target.value as typeof funding.source, personEmployeeId: event.target.value === "PERSONAL" ? item.personEmployeeId : undefined, personProfileId: event.target.value === "PERSONAL" ? item.personProfileId : undefined, personPaid: event.target.value === "PERSONAL" ? item.personPaid : undefined, reimbursementRequired: event.target.value === "PERSONAL" ? item.reimbursementRequired ?? true : undefined } : item) })}><option value="SHOP_CASH">Shop cash</option><option value="SHOP_BANK">Shop bank</option><option value="SHOP_CARD">Shop card</option><option value="PERSONAL">Personal money</option><option value="OTHER">Other</option></select></Field><Field label="Amount" required info="How much this funding source contributed. All funding amounts together must equal the expense total."><Input inputMode="decimal" value={funding.amount} onChange={(event) => setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item) })} /></Field>{funding.source === "PERSONAL" ? <Field label="Person who paid" required helper="Choose an employee/user to preserve their identity for reimbursement, or enter a manual payer."><><select className="mb-2 h-10 w-full rounded-md border bg-white px-3 text-sm" value={selectedPayer} onChange={(event) => { const option = employeeOptions.find((candidate) => candidate.value === event.target.value); setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, personEmployeeId: option?.employeeId, personProfileId: option?.profileId, personPaid: option?.fullName ?? "" } : item) }); }}><option value="">Manual / non-login payer</option>{employeeOptions.map((option) => <option key={option.value} value={option.value}>{option.fullName}</option>)}</select><Input disabled={Boolean(selectedPayer)} placeholder="Name of payer" value={funding.personPaid ?? ""} onChange={(event) => setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, personEmployeeId: undefined, personProfileId: undefined, personPaid: event.target.value } : item) })} /></></Field> : <Field label="Funding notes" optional><Input value={funding.notes ?? ""} onChange={(event) => setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item) })} /></Field>}<div className="flex items-end"><Button variant="ghost" size="icon" disabled={draft.fundings.length === 1} onClick={() => setDraft({ ...draft, fundings: draft.fundings.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" /></Button></div></div>{funding.source === "PERSONAL" ? <div className="flex items-center gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={funding.reimbursementRequired ?? true} onChange={(event) => setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, reimbursementRequired: event.target.checked } : item) })} />Reimbursement is required</label><InfoHint text="Enable this when the shop must pay this person back. Leave it off when the personal payment is a contribution that will not be repaid. Normally salary uses shop cash or shop bank instead." /></div> : null}</div>; })}
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" disabled={draft.fundings.length !== 1 || !total} onClick={onSync}>Use expense total</Button><InfoHint text="Copies the calculated expense total into the single funding amount. When an expense uses multiple funding sources, enter each share manually." />{error ? <p className="basis-full text-sm text-destructive">{error}</p> : null}</div>
  </CardContent></Card>;
}

function ReceiptFields({ files, setFiles, reviewedFileName }: { files: File[]; setFiles: (files: File[]) => void; reviewedFileName?: string }) {
  return <Card><CardHeader><h2 className="font-semibold">4. Receipt or supporting document <span className="text-sm font-normal text-muted-foreground">(Optional)</span></h2></CardHeader><CardContent><label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center"><Upload className="h-6 w-6" /><span className="text-sm font-medium">Upload JPG, PNG, WebP, or PDF (maximum 10 MB each)</span><input className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>{files.map((file) => <p key={`${file.name}-${file.size}`} className="mt-2 flex items-center gap-2 text-sm"><FileText className="h-4 w-4" />{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>)}{reviewedFileName ? <p className="mt-2 text-sm text-brand-forest">Reviewed receipt {reviewedFileName} will be linked.</p> : null}</CardContent></Card>;
}

function Field({ label: title, required, optional, info, helper, error, className = "", children }: { label: string; required?: boolean; optional?: boolean; info?: string; helper?: string; error?: string; className?: string; children: React.ReactNode }) {
  return <div className={`space-y-1 text-sm ${className}`}><div className="flex items-center gap-1 font-medium"><span>{title}{required ? <span className="text-destructive"> *</span> : null}{optional ? <span className="font-normal text-muted-foreground"> (Optional)</span> : null}</span>{info ? <InfoHint text={info} /> : null}</div><label className="block"><span className="sr-only">{title}</span>{children}</label>{helper ? <span className="block text-xs text-muted-foreground">{helper}</span> : null}{error ? <span className="block text-xs text-destructive">{error}</span> : null}</div>;
}

function InfoHint({ text }: { text: string }) {
  return <span className="relative inline-flex shrink-0"><button type="button" className="peer inline-flex cursor-help rounded-full text-brand-forest outline-none focus-visible:ring-2 focus-visible:ring-brand-forest/40" aria-label={`Information: ${text}`}><Info className="h-3.5 w-3.5" aria-hidden="true" /></button><span className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-3rem)] rounded-md bg-slate-950 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity peer-hover:visible peer-hover:opacity-100 peer-focus:visible peer-focus:opacity-100" aria-hidden="true">{text}</span></span>;
}

function configureForCategory(current: ExpenseDraft, previous: ExpenseFormType | undefined, next: ExpenseFormType, categoryId: string): ExpenseDraft {
  if (previous === next) return { ...current, categoryId };
  if (next === "SALARY") return { ...current, categoryId, salary: emptySalary(), categoryDetails: undefined, updateInventory: false, items: [emptyLine("Salary - employee")] };
  if (next === "INVENTORY_PURCHASE") return { ...current, categoryId, salary: undefined, categoryDetails: undefined, updateInventory: false, items: previous ? [emptyLine()] : current.items };
  const amount = previous ? "0.00" : safeTotal(current.items);
  return { ...current, categoryId, salary: undefined, categoryDetails: defaultCategoryDetails(next), updateInventory: false, items: [{ ...emptyLine(), description: categoryTitle(next), unitPrice: amount }], fundings: current.fundings.length === 1 ? [{ ...current.fundings[0], amount }] : current.fundings };
}

function prepareDraft(draft: ExpenseDraft, formType: ExpenseFormType, categoryName?: string): ExpenseDraft {
  if (["SALARY", "INVENTORY_PURCHASE"].includes(formType)) return draft;
  return { ...draft, salary: undefined, updateInventory: false, items: draft.items.map((line, index) => index === 0 ? { ...line, description: simpleDescription(draft, formType, categoryName), inventoryItemId: undefined } : line) };
}

function defaultCategoryDetails(formType: ExpenseFormType): ExpenseCategoryDetailsDraft | undefined {
  const today = localDate(); const start = `${today.slice(0, 8)}01`;
  if (formType === "RENT" || formType === "UTILITY") return { periodStart: start, periodEnd: today };
  if (formType === "EQUIPMENT_REPAIR") return { serviceDate: today };
  return undefined;
}

function simpleDescription(draft: ExpenseDraft, formType: ExpenseFormType, categoryName?: string) {
  if (formType === "GENERAL") return draft.description?.trim() || categoryName || "General expense";
  if (formType === "RENT") return `Rent${draft.categoryDetails?.periodStart ? ` - ${draft.categoryDetails.periodStart}` : ""}`;
  if (formType === "UTILITY") return `${draft.categoryDetails?.utilityType?.trim() || "Utility"} bill`;
  if (formType === "EQUIPMENT_REPAIR") return draft.categoryDetails?.equipmentDetails?.trim() || "Equipment purchase or repair";
  return categoryName || "Expense";
}

function categoryTitle(formType: ExpenseFormType) { return ({ GENERAL: "General expense details", SALARY: "Salary details", RENT: "Rent details", UTILITY: "Utility bill details", INVENTORY_PURCHASE: "Purchased items", EQUIPMENT_REPAIR: "Equipment or repair details" })[formType]; }
function emptyLine(description = ""): ExpenseLineDraft { return { description, quantity: "1.000", unitType: "UNIT", conversionFactor: "1.000", unitPrice: "0.00", taxAmount: "0.00", additionalCharges: "0.00", discountAmount: "0.00" }; }
function emptySalary(): SalaryExpenseDraft { const today = localDate(); return { employeeName: "", periodStart: `${today.slice(0, 8)}01`, periodEnd: today, basicSalary: "0.00", allowances: "0.00", deductions: "0.00", advancePayments: "0.00", paymentStatus: "PENDING" }; }
function newDraft(): ExpenseDraft { return { clientRequestId: crypto.randomUUID(), expenseDate: new Date().toISOString(), categoryId: "", paymentMethod: "CASH", status: "DRAFT", updateInventory: false, items: [emptyLine()], fundings: [{ source: "SHOP_CASH", amount: "0.00" }] }; }
function safeTotal(items: ExpenseLineDraft[]) { try { return calculateExpenseTotals(items).grandTotal; } catch { return "0.00"; } }
function toInputDateTime(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function localDate() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function decimalText(value: unknown, fallback: string) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number.toFixed(fallback.endsWith("000") ? 3 : 2) : fallback; }
class ValidationError extends Error {}

interface ReceiptExtraction {
  supplierName?: string | null; invoiceNumber?: string | null; purchaseDate?: string | null;
  items?: Array<{ description?: string; name?: string; quantity?: number | null; unitPrice?: number | null; discount?: number | null; tax?: number | null }>;
}

function toDraftLine(line: ExpenseLine): ExpenseLineDraft { return { inventoryItemId: line.inventoryItemId, description: line.description, quantity: line.quantity, unitType: line.unitType, conversionFactor: line.conversionFactor, unitPrice: line.unitPrice, taxAmount: line.taxAmount, additionalCharges: line.additionalCharges, discountAmount: line.discountAmount }; }
function toDraftFunding(funding: ExpenseFunding) { return { source: funding.source, amount: funding.amount, personEmployeeId: funding.personEmployeeId, personProfileId: funding.personProfileId, personPaid: funding.personPaid, reimbursementRequired: funding.reimbursementRequired, notes: funding.notes }; }
