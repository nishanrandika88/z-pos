export type OrderStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type PaymentMethod = "CASH" | "CARD" | "LANKAQR" | "BANK_TRANSFER";
export type ManualDiscountMode = "PERCENTAGE" | "FIXED";

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

export interface OrderPaymentCorrection {
  orderId: string;
  method: PaymentMethod;
  reason: string;
  amountTendered?: number;
  cardType?: string;
  bankName?: string;
  last4?: string;
}

export interface OrderContentCorrection {
  orderId: string;
  addedItems: Array<{ itemId: string; quantity: number }>;
  discountMode: ManualDiscountMode;
  discountValue: number;
  cashTendered?: number;
  reason: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  cashierName: string;
  subtotal: number;
  automaticDiscountTotal: number;
  manualDiscountTotal: number;
  manualDiscountType?: ManualDiscountMode;
  manualDiscountValue?: number;
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
  status?: OrderStatus;
}

export interface OrderPageOptions {
  page: number;
  pageSize: number;
}

export interface OrderListResult {
  orders: OrderSummary[];
  hasMore: boolean;
}
