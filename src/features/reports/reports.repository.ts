import type { Item } from "@/domain/catalog/types";
import { listCategories, listItems } from "@/features/catalog/catalog.repository";
import { listOrders } from "@/features/orders/orders.repository";
import type { OrderFilters, OrderSummary } from "@/features/orders/types";

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
}

export interface ItemSalesRow {
  itemCode: string;
  itemName: string;
  quantity: number;
  grossTotal: number;
  discountTotal: number;
  netTotal: number;
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
      });
      return summary;
    },
    { orderCount: 0, itemCount: 0, subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0, cashTotal: 0, cardTotal: 0 },
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
    Payment: order.payments.map((payment) => payment.method).join(" + "),
  }));
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
