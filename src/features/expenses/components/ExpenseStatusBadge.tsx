import type { ExpenseStatus, ReimbursementStatus } from "@/domain/expenses/types";
import { Badge } from "@/shared/ui/badge";

const labels: Record<ExpenseStatus | ReimbursementStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  PAID: "Paid",
  VOID: "Void",
  NOT_REQUIRED: "Not required",
  PENDING: "Pending",
  PARTIALLY_REIMBURSED: "Partially reimbursed",
  FULLY_REIMBURSED: "Fully reimbursed",
};

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus | ReimbursementStatus }) {
  const tone = status === "VOID" ? "border-destructive/30 bg-destructive/10 text-destructive" : status === "PAID" || status === "FULLY_REIMBURSED" ? "border-brand-forest/30 bg-brand-forest/10 text-brand-forest" : "bg-muted";
  return <Badge className={tone}>{labels[status]}</Badge>;
}
