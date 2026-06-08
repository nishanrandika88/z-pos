import { supabase } from "@/shared/lib/supabase";
import type { OrderFilters, OrderItemLine, OrderPayment, OrderStatus, OrderSummary } from "@/features/orders/types";

type Relation<T> = T | T[] | null;

type OrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  subtotal: number | string;
  automatic_discount_total: number | string;
  manual_discount_total: number | string;
  tax_total: number | string;
  grand_total: number | string;
  created_at: string;
  completed_at: string | null;
  cashier: Relation<{ full_name: string | null; display_name?: string | null; email: string | null }>;
  order_items: Array<{
    id: string;
    item_code: string;
    item_name: string;
    quantity: number | string;
    unit_price: number | string;
    discount_total: number | string;
    line_total: number | string;
  }> | null;
  payments: Array<{
    id: string;
    method: "CASH" | "CARD";
    amount: number | string;
    amount_tendered: number | string | null;
    balance_returned: number | string | null;
    card_type: string | null;
    bank_name: string | null;
    card_last4: string | null;
    masked_card_number: string | null;
  }> | null;
};

function first<T>(relation: Relation<T>): T | undefined {
  if (Array.isArray(relation)) return relation[0];
  return relation ?? undefined;
}

function numberValue(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function mapOrderItem(row: NonNullable<OrderRow["order_items"]>[number]): OrderItemLine {
  return {
    id: row.id,
    itemCode: row.item_code,
    itemName: row.item_name,
    quantity: numberValue(row.quantity),
    unitPrice: numberValue(row.unit_price),
    discountTotal: numberValue(row.discount_total),
    lineTotal: numberValue(row.line_total),
  };
}

function mapPayment(row: NonNullable<OrderRow["payments"]>[number]): OrderPayment {
  return {
    id: row.id,
    method: row.method,
    amount: numberValue(row.amount),
    amountTendered: row.amount_tendered == null ? undefined : numberValue(row.amount_tendered),
    balanceReturned: row.balance_returned == null ? undefined : numberValue(row.balance_returned),
    cardType: row.card_type ?? undefined,
    bankName: row.bank_name ?? undefined,
    cardLast4: row.card_last4 ?? undefined,
    maskedCardNumber: row.masked_card_number ?? undefined,
  };
}

function mapOrder(row: OrderRow): OrderSummary {
  const cashier = first(row.cashier);

  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    cashierName: cashier?.display_name ?? cashier?.full_name ?? cashier?.email ?? "Unknown cashier",
    subtotal: numberValue(row.subtotal),
    automaticDiscountTotal: numberValue(row.automatic_discount_total),
    manualDiscountTotal: numberValue(row.manual_discount_total),
    taxTotal: numberValue(row.tax_total),
    grandTotal: numberValue(row.grand_total),
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    items: (row.order_items ?? []).map(mapOrderItem),
    payments: (row.payments ?? []).map(mapPayment),
  };
}

const orderSelect = `
  id,
  order_number,
  status,
  subtotal,
  automatic_discount_total,
  manual_discount_total,
  tax_total,
  grand_total,
  created_at,
  completed_at,
  cashier:profiles(full_name,display_name,email),
  order_items(id,item_code,item_name,quantity,unit_price,discount_total,line_total),
  payments(id,method,amount,amount_tendered,balance_returned,card_type,bank_name,card_last4,masked_card_number)
`;

const orderSelectWithoutDisplayName = `
  id,
  order_number,
  status,
  subtotal,
  automatic_discount_total,
  manual_discount_total,
  tax_total,
  grand_total,
  created_at,
  completed_at,
  cashier:profiles(full_name,email),
  order_items(id,item_code,item_name,quantity,unit_price,discount_total,line_total),
  payments(id,method,amount,amount_tendered,balance_returned,card_type,bank_name,card_last4,masked_card_number)
`;

export async function listOrders(filters: OrderFilters): Promise<OrderSummary[]> {
  let { data, error } = await buildOrdersQuery(orderSelect, filters);

  if (isMissingDisplayNameError(error)) {
    const fallback = await buildOrdersQuery(orderSelectWithoutDisplayName, filters);
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) throw error;

  return (data as unknown as OrderRow[]).map(mapOrder);
}

export async function getOrderById(orderId: string): Promise<OrderSummary> {
  let { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .eq("id", orderId)
    .single();

  if (isMissingDisplayNameError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(orderSelectWithoutDisplayName)
      .eq("id", orderId)
      .single();
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) throw error;

  return mapOrder(data as OrderRow);
}

export async function auditReceiptReprint(orderId: string) {
  const { error } = await supabase.rpc("audit_receipt_reprint", { target_order_id: orderId });
  if (error) throw error;
}

function buildOrdersQuery(select: string, filters: OrderFilters) {
  let query = supabase
    .from("orders")
    .select(select)
    .order("created_at", { ascending: false })
    .limit(50);

  if (filters.search?.trim()) {
    query = query.ilike("order_number", `%${filters.search.trim()}%`);
  }

  if (filters.dateFrom) {
    query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
  }

  if (filters.dateTo) {
    query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
  }

  return query;
}

function isMissingDisplayNameError(error: { message?: string } | null) {
  return Boolean(error?.message?.toLowerCase().includes("display_name"));
}
