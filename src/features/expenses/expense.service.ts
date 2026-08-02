import type {
  ExpenseLineDraft,
  ExpenseTotals,
  ReimbursementStatus,
  SalaryExpenseDraft,
} from "@/domain/expenses/types";

const moneyScale = 2;
const quantityScale = 3;

export interface CalculatedExpenseLine extends ExpenseLineDraft {
  baseQuantity: string;
  grossAmount: string;
  lineTotal: string;
}

export function calculateExpenseLine(line: ExpenseLineDraft): CalculatedExpenseLine {
  const quantity = parseDecimal(line.quantity, quantityScale);
  const conversionFactor = parseDecimal(line.conversionFactor, quantityScale);
  const unitPrice = parseDecimal(line.unitPrice, moneyScale);
  const tax = parseDecimal(line.taxAmount, moneyScale);
  const charges = parseDecimal(line.additionalCharges, moneyScale);
  const discount = parseDecimal(line.discountAmount, moneyScale);

  if (quantity <= 0n) throw new Error("Quantity must be greater than zero.");
  if (conversionFactor <= 0n) throw new Error("Unit conversion must be greater than zero.");
  if (unitPrice < 0n || tax < 0n || charges < 0n || discount < 0n) {
    throw new Error("Money values cannot be negative.");
  }

  const gross = divideRound(quantity * unitPrice, 10n ** BigInt(quantityScale));
  const lineTotal = gross + tax + charges - discount;
  if (lineTotal < 0n) throw new Error("A line total cannot be negative.");

  const baseQuantity = divideRound(quantity * conversionFactor, 10n ** BigInt(quantityScale));
  return {
    ...line,
    baseQuantity: formatDecimal(baseQuantity, quantityScale),
    grossAmount: formatDecimal(gross, moneyScale),
    lineTotal: formatDecimal(lineTotal, moneyScale),
  };
}

export function calculateExpenseTotals(lines: ExpenseLineDraft[]): ExpenseTotals {
  if (lines.length === 0) throw new Error("At least one expense item is required.");

  return lines.reduce<ExpenseTotals>(
    (totals, line) => {
      const calculated = calculateExpenseLine(line);
      return {
        subtotal: addMoney(totals.subtotal, calculated.grossAmount),
        taxTotal: addMoney(totals.taxTotal, line.taxAmount),
        additionalChargesTotal: addMoney(totals.additionalChargesTotal, line.additionalCharges),
        discountTotal: addMoney(totals.discountTotal, line.discountAmount),
        grandTotal: addMoney(totals.grandTotal, calculated.lineTotal),
      };
    },
    {
      subtotal: "0.00",
      taxTotal: "0.00",
      additionalChargesTotal: "0.00",
      discountTotal: "0.00",
      grandTotal: "0.00",
    },
  );
}

export function calculateSalaryNet(salary: Pick<SalaryExpenseDraft, "basicSalary" | "allowances" | "deductions" | "advancePayments">) {
  const net =
    parseDecimal(salary.basicSalary, moneyScale) +
    parseDecimal(salary.allowances, moneyScale) -
    parseDecimal(salary.deductions, moneyScale) -
    parseDecimal(salary.advancePayments, moneyScale);
  if (net < 0n) throw new Error("Salary deductions and advances cannot exceed earnings.");
  return formatDecimal(net, moneyScale);
}

export function reimbursementStatus(personalAmount: string, reimbursedAmount: string): ReimbursementStatus {
  const personal = parseDecimal(personalAmount, moneyScale);
  const reimbursed = parseDecimal(reimbursedAmount, moneyScale);
  if (personal === 0n) return "NOT_REQUIRED";
  if (reimbursed === 0n) return "PENDING";
  if (reimbursed < personal) return "PARTIALLY_REIMBURSED";
  return "FULLY_REIMBURSED";
}

export function addMoney(left: string, right: string) {
  return formatDecimal(parseDecimal(left, moneyScale) + parseDecimal(right, moneyScale), moneyScale);
}

export function compareMoney(left: string, right: string) {
  const difference = parseDecimal(left, moneyScale) - parseDecimal(right, moneyScale);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

export function parseDecimal(value: string | number, scale: number): bigint {
  const normalized = String(value).trim();
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Invalid decimal value: ${normalized || "empty"}`);

  const fraction = match[3] ?? "";
  if (fraction.length > scale) throw new Error(`Value supports at most ${scale} decimal places.`);
  const result = BigInt(match[2]) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0") || "0");
  return match[1] === "-" ? -result : result;
}

export function formatDecimal(value: bigint, scale: number) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const base = 10n ** BigInt(scale);
  return `${sign}${absolute / base}.${(absolute % base).toString().padStart(scale, "0")}`;
}

function divideRound(value: bigint, divisor: bigint) {
  const quotient = value / divisor;
  const remainder = value % divisor;
  return remainder * 2n >= divisor ? quotient + 1n : quotient;
}
