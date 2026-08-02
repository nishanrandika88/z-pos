import type { Item } from "@/domain/catalog/types";
import { listCategories, listItems } from "@/features/catalog/catalog.repository";
import { listOrders } from "@/features/orders/orders.repository";
import type { OrderFilters, OrderSummary, PaymentMethod } from "@/features/orders/types";
import type { ExpenseSummary } from "@/domain/expenses/types";
import { listExpenses } from "@/features/expenses/expenses.repository";
import { parseDecimal } from "@/features/expenses/expense.service";

const pageSize = 500;

export interface SalesSummary {
  orderCount: number;
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  cashTotal: number;
  cardTotal: number;
  lankaQrTotal: number;
  bankTransferTotal: number;
}

export interface ItemSalesRow {
  itemCode: string;
  itemName: string;
  quantity: number;
  grossTotal: number;
  discountTotal: number;
  netTotal: number;
}

export interface ExpenseReportSummary {
  expenseCount: number;
  total: number;
  shopFunded: number;
  personallyFunded: number;
  reimbursed: number;
  pendingReimbursement: number;
  salaryTotal: number;
  inventoryPurchaseTotal: number;
  byCategory: Array<{ name: string; total: number }>;
  bySupplier: Array<{ name: string; total: number }>;
  byUser: Array<{ name: string; total: number }>;
}

export async function fetchOrdersForRange(filters: OrderFilters) {
  const orders: OrderSummary[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 20) {
    const result = await listOrders(filters, { page, pageSize });
    orders.push(...result.orders);
    hasMore = result.hasMore;
    page += 1;
  }

  return orders;
}

export async function fetchCatalogExportData() {
  const [categories, items] = await Promise.all([listCategories(), listItems()]);
  return { categories, items };
}

export async function fetchExpensesForRange(dateFrom?: string, dateTo?: string) {
  const expenses: ExpenseSummary[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 20) {
    const result = await listExpenses({ dateFrom, dateTo }, { page, pageSize });
    expenses.push(...result.expenses);
    hasMore = result.hasMore;
    page += 1;
  }
  return expenses.filter((expense) => !["DRAFT", "VOID"].includes(expense.status));
}

export function summarizeExpenses(expenses: ExpenseSummary[]): ExpenseReportSummary {
  const category = new Map<string, number>();
  const supplier = new Map<string, number>();
  const user = new Map<string, number>();
  const summary = expenses.reduce<Omit<ExpenseReportSummary, "byCategory" | "bySupplier" | "byUser">>((result, expense) => {
    const total = moneyNumber(expense.grandTotal);
    const personal = moneyNumber(expense.personalAmount);
    const reimbursed = moneyNumber(expense.reimbursedAmount);
    result.expenseCount += 1;
    result.total += total;
    result.personallyFunded += personal;
    result.shopFunded += Math.max(0, total - personal);
    result.reimbursed += reimbursed;
    result.pendingReimbursement += Math.max(0, moneyNumber(expense.reimbursableAmount) - reimbursed);
    if (expense.categoryKind === "SALARY") result.salaryTotal += total;
    if (expense.categoryKind === "INVENTORY") result.inventoryPurchaseTotal += total;
    category.set(expense.categoryName, (category.get(expense.categoryName) ?? 0) + total);
    supplier.set(expense.payee || "No supplier", (supplier.get(expense.payee || "No supplier") ?? 0) + total);
    user.set(expense.createdByName, (user.get(expense.createdByName) ?? 0) + total);
    return result;
  }, { expenseCount: 0, total: 0, shopFunded: 0, personallyFunded: 0, reimbursed: 0, pendingReimbursement: 0, salaryTotal: 0, inventoryPurchaseTotal: 0 });
  return {
    ...summary,
    byCategory: sortedTotals(category),
    bySupplier: sortedTotals(supplier),
    byUser: sortedTotals(user),
  };
}

export function expenseRows(expenses: ExpenseSummary[]) {
  return expenses.map((expense) => ({
    Reference: expense.expenseNumber,
    Date: new Date(expense.expenseDate).toLocaleString(),
    Category: expense.categoryName,
    Supplier: expense.payee ?? "",
    Invoice: expense.invoiceNumber ?? "",
    "Entered By": expense.createdByName,
    Status: expense.status,
    "Funding Sources": expense.fundingSources.join(" + "),
    "Personal Amount": expense.personalAmount,
    "Reimbursable Amount": expense.reimbursableAmount,
    Reimbursed: expense.reimbursedAmount,
    "Reimbursement Status": expense.reimbursementStatus,
    Subtotal: expense.subtotal,
    Tax: expense.taxTotal,
    Charges: expense.additionalChargesTotal,
    Discount: expense.discountTotal,
    Total: expense.grandTotal,
  }));
}

export function summarizeOrders(orders: OrderSummary[]): SalesSummary {
  return orders.reduce<SalesSummary>(
    (summary, order) => {
      summary.orderCount += 1;
      summary.itemCount += order.items.reduce((sum, item) => sum + item.quantity, 0);
      summary.subtotal += order.subtotal;
      summary.discountTotal += order.automaticDiscountTotal + order.manualDiscountTotal;
      summary.taxTotal += order.taxTotal;
      summary.grandTotal += order.grandTotal;
      order.payments.forEach((payment) => {
        if (payment.method === "CASH") summary.cashTotal += payment.amount;
        if (payment.method === "CARD") summary.cardTotal += payment.amount;
        if (payment.method === "LANKAQR") summary.lankaQrTotal += payment.amount;
        if (payment.method === "BANK_TRANSFER") summary.bankTransferTotal += payment.amount;
      });
      return summary;
    },
    {
      orderCount: 0,
      itemCount: 0,
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 0,
      cashTotal: 0,
      cardTotal: 0,
      lankaQrTotal: 0,
      bankTransferTotal: 0,
    },
  );
}

export function buildItemSales(orders: OrderSummary[]): ItemSalesRow[] {
  const rows = new Map<string, ItemSalesRow>();

  orders.forEach((order) => {
    order.items.forEach((item) => {
      const key = item.itemCode || item.itemName;
      const current = rows.get(key) ?? {
        itemCode: item.itemCode,
        itemName: item.itemName,
        quantity: 0,
        grossTotal: 0,
        discountTotal: 0,
        netTotal: 0,
      };
      current.quantity += item.quantity;
      current.grossTotal += item.unitPrice * item.quantity;
      current.discountTotal += item.discountTotal;
      current.netTotal += item.lineTotal;
      rows.set(key, current);
    });
  });

  return Array.from(rows.values()).sort((left, right) => right.netTotal - left.netTotal);
}

export function catalogRows(items: Item[]) {
  return items.map((item) => ({
    Code: item.itemCode,
    Barcode: item.barcode ?? "",
    Name: item.itemName,
    Category: item.categoryName,
    Price: item.sellingPrice,
    Available: item.availability ? "Yes" : "No",
    Active: item.active ? "Yes" : "Archived",
  }));
}

export function orderRows(orders: OrderSummary[]) {
  return orders.map((order) => ({
    "Order Number": order.orderNumber,
    Date: new Date(order.createdAt).toLocaleString(),
    Cashier: order.cashierName,
    Status: order.status,
    Items: order.items.reduce((sum, item) => sum + item.quantity, 0),
    Subtotal: order.subtotal,
    Discount: order.automaticDiscountTotal + order.manualDiscountTotal,
    Tax: order.taxTotal,
    Total: order.grandTotal,
    Payment: order.payments.map((payment) => paymentMethodLabel(payment.method)).join(" + "),
  }));
}

function paymentMethodLabel(method: PaymentMethod) {
  if (method === "LANKAQR") return "LankaQR";
  if (method === "BANK_TRANSFER") return "Online Bank Transfer";
  return method === "CARD" ? "Card" : "Cash";
}

export function itemSalesRows(rows: ItemSalesRow[]) {
  return rows.map((row) => ({
    Code: row.itemCode,
    Name: row.itemName,
    Quantity: row.quantity,
    Gross: row.grossTotal,
    Discount: row.discountTotal,
    Net: row.netTotal,
  }));
}

function sortedTotals(values: Map<string, number>) {
  return Array.from(values, ([name, total]) => ({ name, total })).sort((left, right) => right.total - left.total);
}

function moneyNumber(value: string) {
  return Number(parseDecimal(value, 2)) / 100;
}
