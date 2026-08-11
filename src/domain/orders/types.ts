import type { Item } from "@/domain/catalog/types";

export interface CartLine {
  item: Item;
  quantity: number;
  automaticDiscount: number;
  lineTotal: number;
}

export type PaymentMethod = "CASH" | "CARD" | "LANKAQR" | "BANK_TRANSFER";

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

export interface LankaQrPayment {
  method: "LANKAQR";
}

export interface BankTransferPayment {
  method: "BANK_TRANSFER";
}

export type PaymentDetails = CashPayment | CardPayment | LankaQrPayment | BankTransferPayment;

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
  manualDiscountMode?: "PERCENTAGE" | "FIXED";
  manualDiscountValue?: number;
  payment?: PaymentDetails;
}
