import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Plus, Save, Trash2, Upload } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { ExpenseDraft, ExpenseFunding, ExpenseLine, ExpenseLineDraft, SalaryExpenseDraft, UnitType } from "@/domain/expenses/types";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { addMoney, calculateExpenseTotals, calculateSalaryNet, compareMoney } from "@/features/expenses/expense.service";
import { expenseDraftSchema } from "@/features/expenses/expense.schemas";
import {
  createExpense,
  findPotentialDuplicateExpense,
  getExpense,
  getExpenseReceipt,
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
  const initializedEdit = useRef(false);
  const initializedReceipt = useRef(false);
  const categoriesQuery = useQuery({ queryKey: ["expense-categories"], queryFn: () => listExpenseCategories() });
  const suppliersQuery = useQuery({ queryKey: ["expense-suppliers"], queryFn: listSuppliers });
  const inventoryQuery = useQuery({ queryKey: ["expense-inventory"], queryFn: listInventoryItems });
  const expenseQuery = useQuery({ queryKey: ["expense", expenseId], queryFn: () => getExpense(expenseId!), enabled: Boolean(expenseId) });
  const receiptQuery = useQuery({ queryKey: ["expense-receipt", receiptId], queryFn: () => getExpenseReceipt(receiptId!), enabled: Boolean(receiptId && !expenseId) });
  const selectedCategory = categoriesQuery.data?.find((category) => category.id === draft.categoryId);
  const totalsResult = useMemo(() => {
    try { return { totals: calculateExpenseTotals(draft.items), error: undefined }; }
    catch (error) { return { totals: undefined, error: error instanceof Error ? error.message : "Invalid expense totals." }; }
  }, [draft.items]);

  useEffect(() => {
    if (!expenseQuery.data || initializedEdit.current) return;
    initializedEdit.current = true;
    const expense = expenseQuery.data;
    setDraft({
      clientRequestId: crypto.randomUUID(),
      expenseDate: expense.expenseDate,
      categoryId: expense.categoryId,
      supplierId: expense.supplierId,
      payee: expense.payee,
      invoiceNumber: expense.invoiceNumber,
      description: expense.description,
      paymentMethod: expense.paymentMethod,
      status: expense.status === "DRAFT" ? "DRAFT" : "PENDING_APPROVAL",
      updateInventory: expense.items.some((item) => Boolean(item.inventoryItemId)),
      items: expense.items.map(toDraftLine),
      fundings: expense.fundings.map(toDraftFunding),
      salary: expense.salary,
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
        ...emptyLine(),
        description: String(item.description || item.name || "Purchased item"),
        quantity: decimalText(item.quantity, "1.000"),
        unitPrice: decimalText(item.unitPrice, "0.00"),
        discountAmount: decimalText(item.discount, "0.00"),
        taxAmount: decimalText(item.tax, "0.00"),
      })) : current.items,
    }));
  }, [receiptQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (status: ExpenseDraft["status"]) => {
      const candidate = { ...draft, status };
      const parsed = expenseDraftSchema.safeParse(candidate);
      const validationErrors = parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      if (totalsResult.error) validationErrors.push(totalsResult.error);
      if (selectedCategory?.kind === "SALARY" && !candidate.salary) validationErrors.push("Salary details are required for the selected category.");
      let fundingTotal = "0.00";
      try { fundingTotal = candidate.fundings.reduce((sum, funding) => addMoney(sum, funding.amount), "0.00"); } catch { validationErrors.push("Funding amounts must be valid money values."); }
      if (!totalsResult.totals || compareMoney(fundingTotal, totalsResult.totals.grandTotal) !== 0) {
        validationErrors.push("Sources of funds must equal the expense total.");
      }
      if (validationErrors.length) { setErrors(validationErrors); throw new ValidationError(); }
      if (!profile) throw new Error("Your session is no longer available.");

      const duplicate = totalsResult.totals ? await findPotentialDuplicateExpense({
        expenseDate: candidate.expenseDate,
        payee: candidate.payee,
        invoiceNumber: candidate.invoiceNumber,
        grandTotal: totalsResult.totals.grandTotal,
        excludeId: expenseId,
      }) : undefined;
      if (duplicate && !window.confirm(`Possible duplicate ${duplicate.expense_number} has the same date, total, and ${candidate.invoiceNumber ? "invoice number" : "payee"}. Save anyway?`)) {
        throw new Error("Save cancelled after duplicate warning.");
      }

      if (expenseId) {
        await updateExpense(expenseId, expenseQuery.data!.version, candidate);
        return expenseId;
      }

      const uploadedIds = receiptId ? [receiptId] : [];
      for (const file of files) {
        const receipt = await uploadExpenseReceipt({ branchId: profile.branchId, userId: profile.id, file });
        uploadedIds.push(receipt.id);
      }
      return createExpense({ ...candidate, receiptIds: uploadedIds });
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      navigate(`/expenses/${id}`, { replace: true });
    },
    onError: (error) => { if (!(error instanceof ValidationError)) setErrors([error.message]); },
  });

  function updateLine(index: number, patch: Partial<ExpenseLineDraft>) {
    setDraft((current) => ({ ...current, items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }));
  }

  function syncFunding() {
    if (!totalsResult.totals) return;
    setDraft((current) => ({ ...current, fundings: current.fundings.length === 1 ? [{ ...current.fundings[0], amount: totalsResult.totals!.grandTotal }] : current.fundings }));
  }

  function syncSalaryLine() {
    if (!draft.salary) return;
    try {
      const net = calculateSalaryNet(draft.salary);
      setDraft((current) => ({ ...current, items: [{ ...emptyLine(), description: `Salary - ${draft.salary!.employeeName || "employee"}`, unitPrice: net }] }));
    } catch (error) { setErrors([error instanceof Error ? error.message : "Invalid salary values."]); }
  }

  if (expenseId && expenseQuery.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading expense…</p>;
  if (expenseQuery.error) return <p className="p-6 text-sm text-destructive">{expenseQuery.error.message}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-semibold">{expenseId ? "Edit expense" : "New expense"}</h1><p className="text-sm text-muted-foreground">Amounts are checked again by the database before saving.</p></div></div>

      {errors.length ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p className="font-semibold">Please fix the following:</p><ul className="mt-1 list-disc pl-5">{Array.from(new Set(errors)).map((error) => <li key={error}>{error}</li>)}</ul></div> : null}

      <Card><CardHeader><h2 className="font-semibold">Expense information</h2></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Date and time"><Input type="datetime-local" value={toInputDateTime(draft.expenseDate)} onChange={(event) => setDraft({ ...draft, expenseDate: new Date(event.target.value).toISOString() })} /></Field>
        <Field label="Category"><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value, salary: categoriesQuery.data?.find((category) => category.id === event.target.value)?.kind === "SALARY" ? draft.salary ?? emptySalary() : undefined })}><option value="">Select category</option>{(categoriesQuery.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
        <Field label="Supplier"><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={draft.supplierId ?? ""} onChange={(event) => setDraft({ ...draft, supplierId: event.target.value || undefined })}><option value="">No saved supplier</option>{(suppliersQuery.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
        <Field label="Payee (if not saved)"><Input value={draft.payee ?? ""} onChange={(event) => setDraft({ ...draft, payee: event.target.value })} /></Field>
        <Field label="Invoice / bill number"><Input value={draft.invoiceNumber ?? ""} onChange={(event) => setDraft({ ...draft, invoiceNumber: event.target.value })} /></Field>
        <Field label="Payment method"><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value as ExpenseDraft["paymentMethod"] })}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="LANKAQR">LankaQR</option><option value="OTHER">Other</option></select></Field>
        <Field label="Notes" className="md:col-span-2 xl:col-span-3"><textarea className="min-h-20 w-full rounded-md border bg-white p-3 text-sm" value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
      </CardContent></Card>

      {selectedCategory?.kind === "SALARY" && draft.salary ? <SalaryFields salary={draft.salary} onChange={(salary) => setDraft({ ...draft, salary })} onSync={syncSalaryLine} /> : null}

      <Card><CardHeader><div className="flex items-center justify-between"><div><h2 className="font-semibold">Purchased items</h2><p className="text-sm text-muted-foreground">Link inventory only when the purchase should increase stock.</p></div><Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, items: [...draft.items, emptyLine()] })}><Plus className="h-4 w-4" />Line</Button></div></CardHeader><CardContent className="space-y-3">
        {draft.items.map((line, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-12">
          <Field label="Item" className="xl:col-span-3"><Input value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></Field>
          <Field label="Inventory match" className="xl:col-span-2"><select className="h-10 w-full rounded-md border bg-white px-2 text-sm" value={line.inventoryItemId ?? ""} onChange={(event) => updateLine(index, { inventoryItemId: event.target.value || undefined })}><option value="">None</option>{(inventoryQuery.data ?? []).filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Quantity" className="xl:col-span-1"><Input inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></Field>
          <Field label="Unit" className="xl:col-span-1"><select className="h-10 w-full rounded-md border bg-white px-2 text-sm" value={line.unitType} onChange={(event) => updateLine(index, { unitType: event.target.value as UnitType })}>{units.map((unit) => <option key={unit} value={unit}>{label(unit)}</option>)}</select></Field>
          <Field label="To base" className="xl:col-span-1"><Input inputMode="decimal" value={line.conversionFactor} onChange={(event) => updateLine(index, { conversionFactor: event.target.value })} /></Field>
          <Field label="Unit price" className="xl:col-span-1"><Input inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} /></Field>
          <Field label="Tax" className="xl:col-span-1"><Input inputMode="decimal" value={line.taxAmount} onChange={(event) => updateLine(index, { taxAmount: event.target.value })} /></Field>
          <Field label="Charges" className="xl:col-span-1"><Input inputMode="decimal" value={line.additionalCharges} onChange={(event) => updateLine(index, { additionalCharges: event.target.value })} /></Field>
          <div className="flex items-end gap-1 xl:col-span-1"><Field label="Discount"><Input inputMode="decimal" value={line.discountAmount} onChange={(event) => updateLine(index, { discountAmount: event.target.value })} /></Field><Button variant="ghost" size="icon" aria-label="Remove line" disabled={draft.items.length === 1} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" /></Button></div>
        </div>)}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.updateInventory} onChange={(event) => setDraft({ ...draft, updateInventory: event.target.checked })} />Update matched inventory items after approval</label>
      </CardContent></Card>

      <Card><CardHeader><div className="flex items-center justify-between"><div><h2 className="font-semibold">Source of funds</h2><p className="text-sm text-muted-foreground">Personal reimbursements are settlements, not a second expense.</p></div><Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, fundings: [...draft.fundings, { source: "SHOP_CASH", amount: "0.00" }] })}><Plus className="h-4 w-4" />Source</Button></div></CardHeader><CardContent className="space-y-3">
        {draft.fundings.map((funding, index) => <div key={index} className="space-y-2 rounded-lg border p-3"><div className="grid gap-2 sm:grid-cols-[180px_160px_1fr_auto]"><select className="h-10 rounded-md border bg-white px-3 text-sm" value={funding.source} onChange={(event) => setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, source: event.target.value as typeof funding.source, reimbursementRequired: event.target.value === "PERSONAL" ? item.reimbursementRequired ?? true : undefined } : item) })}><option value="SHOP_CASH">Shop cash</option><option value="SHOP_BANK">Shop bank</option><option value="SHOP_CARD">Shop card</option><option value="PERSONAL">Personal money</option><option value="OTHER">Other</option></select><Input inputMode="decimal" value={funding.amount} onChange={(event) => setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item) })} />{funding.source === "PERSONAL" ? <Input placeholder="Person who paid" value={funding.personPaid ?? ""} onChange={(event) => setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, personPaid: event.target.value } : item) })} /> : <Input placeholder="Funding notes" value={funding.notes ?? ""} onChange={(event) => setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item) })} />}<Button variant="ghost" size="icon" disabled={draft.fundings.length === 1} onClick={() => setDraft({ ...draft, fundings: draft.fundings.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" /></Button></div>{funding.source === "PERSONAL" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={funding.reimbursementRequired ?? true} onChange={(event) => setDraft({ ...draft, fundings: draft.fundings.map((item, itemIndex) => itemIndex === index ? { ...item, reimbursementRequired: event.target.checked } : item) })} />Reimbursement is required</label> : null}</div>)}
        <Button variant="outline" size="sm" disabled={draft.fundings.length !== 1 || !totalsResult.totals} onClick={syncFunding}>Use expense total</Button>
      </CardContent></Card>

      {!expenseId ? <Card><CardHeader><h2 className="font-semibold">Receipt or bill</h2></CardHeader><CardContent><label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center"><Upload className="h-6 w-6" /><span className="text-sm font-medium">Upload JPG, PNG, WebP, or PDF (maximum 10 MB each)</span><input className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>{files.map((file) => <p key={`${file.name}-${file.size}`} className="mt-2 flex items-center gap-2 text-sm"><FileText className="h-4 w-4" />{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>)}{receiptQuery.data ? <p className="mt-2 text-sm text-brand-forest">Reviewed receipt {receiptQuery.data.fileName} will be linked.</p> : null}</CardContent></Card> : null}

      <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-muted-foreground">Expense total</p><p className="text-2xl font-bold text-brand-forest">{totalsResult.totals ? currency.format(Number(totalsResult.totals.grandTotal)) : "Invalid totals"}</p><p className="text-xs text-muted-foreground">Subtotal {totalsResult.totals?.subtotal ?? "—"} · tax {totalsResult.totals?.taxTotal ?? "—"} · charges {totalsResult.totals?.additionalChargesTotal ?? "—"} · discount {totalsResult.totals?.discountTotal ?? "—"}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate("DRAFT")}>Save as draft</Button><Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate("PENDING_APPROVAL")}><Save className="h-4 w-4" />{saveMutation.isPending ? "Saving…" : "Submit for approval"}</Button></div></CardContent></Card>
      <p className="text-xs text-muted-foreground"><Link className="hover:underline" to="/expenses">Cancel and return to expenses</Link></p>
    </div>
  );
}

function SalaryFields({ salary, onChange, onSync }: { salary: SalaryExpenseDraft; onChange: (salary: SalaryExpenseDraft) => void; onSync: () => void }) {
  let net = "—"; try { net = calculateSalaryNet(salary); } catch { /* shown during validation */ }
  return <Card><CardHeader><div className="flex items-center justify-between"><div><h2 className="font-semibold">Salary details</h2><p className="text-sm text-muted-foreground">Net salary: {net}</p></div><Button variant="outline" size="sm" onClick={onSync}>Use net as line total</Button></div></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Field label="Employee"><Input value={salary.employeeName} onChange={(event) => onChange({ ...salary, employeeName: event.target.value })} /></Field><Field label="Period start"><Input type="date" value={salary.periodStart} onChange={(event) => onChange({ ...salary, periodStart: event.target.value })} /></Field><Field label="Period end"><Input type="date" value={salary.periodEnd} onChange={(event) => onChange({ ...salary, periodEnd: event.target.value })} /></Field><Field label="Payment date"><Input type="date" value={salary.paymentDate ?? ""} onChange={(event) => onChange({ ...salary, paymentDate: event.target.value })} /></Field><Field label="Basic salary"><Input value={salary.basicSalary} onChange={(event) => onChange({ ...salary, basicSalary: event.target.value })} /></Field><Field label="Allowances"><Input value={salary.allowances} onChange={(event) => onChange({ ...salary, allowances: event.target.value })} /></Field><Field label="Deductions"><Input value={salary.deductions} onChange={(event) => onChange({ ...salary, deductions: event.target.value })} /></Field><Field label="Advances"><Input value={salary.advancePayments} onChange={(event) => onChange({ ...salary, advancePayments: event.target.value })} /></Field>
  </CardContent></Card>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={`space-y-1 text-sm ${className}`}><span className="font-medium">{label}</span>{children}</label>; }
function emptyLine(): ExpenseLineDraft { return { description: "", quantity: "1.000", unitType: "UNIT", conversionFactor: "1.000", unitPrice: "0.00", taxAmount: "0.00", additionalCharges: "0.00", discountAmount: "0.00" }; }
function emptySalary(): SalaryExpenseDraft { return { employeeName: "", periodStart: localDate(), periodEnd: localDate(), basicSalary: "0.00", allowances: "0.00", deductions: "0.00", advancePayments: "0.00", paymentStatus: "PENDING" }; }
function newDraft(): ExpenseDraft { return { clientRequestId: crypto.randomUUID(), expenseDate: new Date().toISOString(), categoryId: "", paymentMethod: "CASH", status: "DRAFT", updateInventory: false, items: [emptyLine()], fundings: [{ source: "SHOP_CASH", amount: "0.00" }] }; }
function toInputDateTime(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function localDate() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function decimalText(value: unknown, fallback: string) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number.toFixed(fallback.endsWith("000") ? 3 : 2) : fallback; }
class ValidationError extends Error {}

interface ReceiptExtraction {
  supplierName?: string | null;
  invoiceNumber?: string | null;
  purchaseDate?: string | null;
  items?: Array<{ description?: string; name?: string; quantity?: number | null; unitPrice?: number | null; discount?: number | null; tax?: number | null }>;
}

function toDraftLine(line: ExpenseLine): ExpenseLineDraft {
  return {
    inventoryItemId: line.inventoryItemId,
    description: line.description,
    quantity: line.quantity,
    unitType: line.unitType,
    conversionFactor: line.conversionFactor,
    unitPrice: line.unitPrice,
    taxAmount: line.taxAmount,
    additionalCharges: line.additionalCharges,
    discountAmount: line.discountAmount,
  };
}

function toDraftFunding(funding: ExpenseFunding) {
  return { source: funding.source, amount: funding.amount, personPaid: funding.personPaid, reimbursementRequired: funding.reimbursementRequired, notes: funding.notes };
}
