export type OrderStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type PaymentMethod = "CASH" | "CARD";

export interface OrderItemLine {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discountTotal: number;
  lineTotal: number;
}

export interface OrderPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  amountTendered?: number;
  balanceReturned?: number;
  cardType?: string;
  bankName?: string;
  cardLast4?: string;
  maskedCardNumber?: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  cashierName: string;
  subtotal: number;
  automaticDiscountTotal: number;
  manualDiscountTotal: number;
  taxTotal: number;
  grandTotal: number;
  createdAt: string;
  completedAt?: string;
  items: OrderItemLine[];
  payments: OrderPayment[];
}

export interface OrderFilters {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}
