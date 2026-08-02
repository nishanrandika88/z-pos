import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ExternalLink, Pencil, Undo2, WalletCards } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { can } from "@/features/auth/rbac";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { ExpenseStatusBadge } from "@/features/expenses/components/ExpenseStatusBadge";
import {
  approveExpense,
  createReceiptSignedUrl,
  getExpense,
  markExpensePaid,
  recordReimbursement,
  voidExpense,
} from "@/features/expenses/expenses.repository";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

const currency = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });

export function ExpenseDetailPage() {
  const { expenseId = "" } = useParams();
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const expenseQuery = useQuery({ queryKey: ["expense", expenseId], queryFn: () => getExpense(expenseId), enabled: Boolean(expenseId) });
  const [notice, setNotice] = useState<string>();
  const actionMutation = useMutation({
    mutationFn: async (action: "approve" | "paid" | "void") => {
      const expense = expenseQuery.data!;
      if (action === "approve") return approveExpense(expense.id, expense.version);
      if (action === "paid") return markExpensePaid(expense.id, expense.version);
      const reason = window.prompt("Why is this financial record being voided?")?.trim();
      if (!reason) throw new Error("A void reason is required.");
      return voidExpense(expense.id, expense.version, reason);
    },
    onSuccess: async () => { setNotice("Expense status updated and audited."); await Promise.all([queryClient.invalidateQueries({ queryKey: ["expense", expenseId] }), queryClient.invalidateQueries({ queryKey: ["expenses"] })]); },
  });

  if (expenseQuery.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading expense…</p>;
  if (expenseQuery.error || !expenseQuery.data) return <p className="p-6 text-sm text-destructive">{expenseQuery.error?.message ?? "Expense not found."}</p>;
  const expense = expenseQuery.data;
  const canUpdate = can(profile?.role, "expenses:update", profile?.permissions);
  const canApprove = can(profile?.role, "expenses:approve", profile?.permissions);
  const canVoid = can(profile?.role, "expenses:void", profile?.permissions);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3"><Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft className="h-4 w-4" /></Button><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{expense.expenseNumber}</h1><ExpenseStatusBadge status={expense.status} /></div><p className="text-sm text-muted-foreground">{expense.categoryName} · {new Date(expense.expenseDate).toLocaleString()}</p></div></div>
        <div className="flex flex-wrap gap-2">
          {canUpdate && ["DRAFT", "PENDING_APPROVAL"].includes(expense.status) ? <Link className="inline-flex h-10 items-center gap-2 rounded-full border bg-white px-4 text-sm font-medium" to={`/expenses/${expense.id}/edit`}><Pencil className="h-4 w-4" />Edit</Link> : null}
          {canApprove && expense.status === "PENDING_APPROVAL" ? <Button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("approve")}><CheckCircle2 className="h-4 w-4" />Approve</Button> : null}
          {canApprove && expense.status === "APPROVED" ? <Button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("paid")}><WalletCards className="h-4 w-4" />Mark paid</Button> : null}
          {canVoid && expense.status !== "VOID" ? <Button variant="destructive" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("void")}><Undo2 className="h-4 w-4" />Void</Button> : null}
        </div>
      </div>

      {notice ? <p className="rounded-md border border-brand-forest/30 bg-brand-forest/5 p-3 text-sm text-brand-forest">{notice}</p> : null}
      {actionMutation.error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionMutation.error.message}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card><CardHeader><h2 className="font-semibold">Purchased items</h2></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-muted/40"><tr className="text-left"><th className="p-3">Description</th><th className="p-3">Inventory</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Tax / charges</th><th className="p-3 text-right">Discount</th><th className="p-3 text-right">Total</th></tr></thead><tbody>{expense.items.map((line) => <tr key={line.id} className="border-b last:border-0"><td className="p-3 font-medium">{line.description}</td><td className="p-3">{line.inventoryItemName ? <span>{line.inventoryItemName}<span className="block text-xs text-muted-foreground">{line.inventoryPostedAt ? "Stock posted" : "Not posted"}</span></span> : "—"}</td><td className="p-3 text-right">{line.quantity} {label(line.unitType)}</td><td className="p-3 text-right">{currency.format(Number(line.unitPrice))}</td><td className="p-3 text-right">{currency.format(Number(line.taxAmount) + Number(line.additionalCharges))}</td><td className="p-3 text-right">{currency.format(Number(line.discountAmount))}</td><td className="p-3 text-right font-semibold">{currency.format(Number(line.lineTotal))}</td></tr>)}</tbody></table></div></CardContent></Card>

          <Card><CardHeader><h2 className="font-semibold">Funding and reimbursements</h2></CardHeader><CardContent className="space-y-3">{expense.fundings.map((funding) => <FundingCard key={funding.id} expenseId={expense.id} funding={funding} expenseStatus={expense.status} />)}</CardContent></Card>

          {expense.salary ? <Card><CardHeader><h2 className="font-semibold">Salary record</h2></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Info label="Employee" value={expense.salary.employeeName} /><Info label="Period" value={`${expense.salary.periodStart} to ${expense.salary.periodEnd}`} /><Info label="Basic" value={currency.format(Number(expense.salary.basicSalary))} /><Info label="Allowances" value={currency.format(Number(expense.salary.allowances))} /><Info label="Deductions" value={currency.format(Number(expense.salary.deductions))} /><Info label="Advances" value={currency.format(Number(expense.salary.advancePayments))} /><Info label="Net" value={currency.format(Number(expense.grandTotal))} /><Info label="Payment status" value={label(expense.salary.paymentStatus)} /></CardContent></Card> : null}

          <Card><CardHeader><h2 className="font-semibold">Receipts and bills</h2></CardHeader><CardContent className="space-y-2">{expense.receipts.length === 0 ? <p className="text-sm text-muted-foreground">No attachment.</p> : expense.receipts.map((receipt) => <div key={receipt.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{receipt.fileName}</p><p className="text-xs text-muted-foreground">{label(receipt.processingStatus)} · {(receipt.fileSize / 1024 / 1024).toFixed(2)} MB{receipt.duplicateOfId ? " · Possible duplicate" : ""}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void createReceiptSignedUrl(receipt.storagePath).then((url) => window.open(url, "_blank", "noopener,noreferrer"))}><ExternalLink className="h-4 w-4" />Open</Button>{can(profile?.role, "expenses:receipts", profile?.permissions) ? <Link className="inline-flex h-9 items-center rounded-full border bg-white px-3 text-sm font-medium" to={`/expenses/receipts/${receipt.id}/review`}>Review</Link> : null}</div></div>)}</CardContent></Card>
        </div>

        <div className="space-y-4">
          <Card><CardHeader><h2 className="font-semibold">Total</h2></CardHeader><CardContent className="space-y-2"><MoneyRow label="Subtotal" value={expense.subtotal} /><MoneyRow label="Tax" value={expense.taxTotal} /><MoneyRow label="Additional charges" value={expense.additionalChargesTotal} /><MoneyRow label="Discount" value={`-${expense.discountTotal}`} /><div className="flex justify-between border-t pt-3 text-lg font-bold"><span>Grand total</span><span>{currency.format(Number(expense.grandTotal))}</span></div></CardContent></Card>
          <Card><CardHeader><h2 className="font-semibold">Details</h2></CardHeader><CardContent className="space-y-3"><Info label="Payee" value={expense.payee || "—"} /><Info label="Invoice number" value={expense.invoiceNumber || "—"} /><Info label="Payment method" value={label(expense.paymentMethod)} /><Info label="Created by" value={expense.createdByName} /><Info label="Last updated by" value={expense.updatedByName} /><Info label="Notes" value={expense.description || "—"} />{expense.voidReason ? <Info label="Void reason" value={expense.voidReason} /> : null}</CardContent></Card>
          <Card><CardHeader><h2 className="font-semibold">Lifecycle</h2></CardHeader><CardContent className="space-y-3 text-sm"><Timeline label="Created" date={expense.createdAt} /><Timeline label="Last updated" date={expense.updatedAt} /><Timeline label="Approved" date={expense.approvedAt} /><Timeline label="Marked paid" date={expense.paidAt} /><Timeline label="Voided" date={expense.voidedAt} /></CardContent></Card>
        </div>
      </div>
    </div>
  );
}

function FundingCard({ expenseId, funding, expenseStatus }: { expenseId: string; funding: Awaited<ReturnType<typeof getExpense>>["fundings"][number]; expenseStatus: string }) {
  const profile = useAuthStore((state) => state.profile);
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(() => Math.max(0, Number(funding.amount) - Number(funding.reimbursedAmount)).toFixed(2));
  const [notes, setNotes] = useState("");
  const mutation = useMutation({ mutationFn: () => recordReimbursement({ fundingId: funding.id, amount, date: new Date().toISOString(), notes }), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["expense", expenseId] }), queryClient.invalidateQueries({ queryKey: ["expenses"] })]); } });
  const canReimburse = funding.source === "PERSONAL" && funding.reimbursementRequired !== false && funding.reimbursementStatus !== "FULLY_REIMBURSED" && ["APPROVED", "PAID"].includes(expenseStatus) && can(profile?.role, "expenses:reimburse", profile?.permissions);
  return <div className="rounded-md border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{label(funding.source)} · {currency.format(Number(funding.amount))}</p><p className="text-xs text-muted-foreground">{funding.personPaid || funding.notes || "Shop funded"}</p></div><ExpenseStatusBadge status={funding.reimbursementStatus} /></div>{funding.source === "PERSONAL" ? <p className="mt-2 text-sm">Reimbursed {currency.format(Number(funding.reimbursedAmount))} of {currency.format(Number(funding.amount))}</p> : null}{canReimburse ? <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr_auto]"><Input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} /><Input value={notes} placeholder="Reimbursement notes" onChange={(event) => setNotes(event.target.value)} /><Button disabled={mutation.isPending || Number(amount) <= 0} onClick={() => mutation.mutate()}>Reimburse</Button></div> : null}{mutation.error ? <p className="mt-2 text-sm text-destructive">{mutation.error.message}</p> : null}</div>;
}

function MoneyRow({ label: title, value }: { label: string; value: string }) { return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{title}</span><span>{currency.format(Number(value))}</span></div>; }
function Info({ label: title, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p><p className="whitespace-pre-wrap text-sm">{value}</p></div>; }
function Timeline({ label: title, date }: { label: string; date?: string }) { return date ? <div className="border-l-2 border-brand-orange pl-3"><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{new Date(date).toLocaleString()}</p></div> : null; }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
