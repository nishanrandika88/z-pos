import type { Item } from "@/domain/catalog/types";

export interface CartLine {
  item: Item;
  quantity: number;
  automaticDiscount: number;
  lineTotal: number;
}

export type PaymentMethod = "CASH" | "CARD";

export interface CashPayment {
  method: "CASH";
  amountTendered: number;
  balanceReturned: number;
}

export interface CardPayment {
  method: "CARD";
  cardType: string;
  bankName: string;
  last4: string;
  maskedNumber: string;
}

export type PaymentDetails = CashPayment | CardPayment;

export interface OrderTotals {
  subtotal: number;
  automaticDiscount: number;
  manualDiscount: number;
  tax: number;
  grandTotal: number;
}

export interface OrderDraft {
  lines: CartLine[];
  totals: OrderTotals;
  payment?: PaymentDetails;
}
