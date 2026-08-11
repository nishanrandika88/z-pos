import type { Discount, Item } from "@/domain/catalog/types";
import { calculateLine } from "@/features/pos/pos.service";
import type { ManualDiscountMode, OrderSummary } from "@/features/orders/types";

export interface AddedCorrectionItem {
  item: Item;
  quantity: number;
}

export interface OrderCorrectionPreview {
  addedSubtotal: number;
  addedAutomaticDiscount: number;
  subtotal: number;
  automaticDiscount: number;
  manualDiscount: number;
  tax: number;
  grandTotal: number;
}

export function initialOrderDiscount(order: OrderSummary): { mode: ManualDiscountMode; value: number } {
  if (order.manualDiscountType) {
    return { mode: order.manualDiscountType, value: order.manualDiscountValue ?? 0 };
  }
  return { mode: "FIXED", value: order.manualDiscountTotal };
}

export function calculateOrderCorrectionPreview(
  order: OrderSummary,
  addedItems: AddedCorrectionItem[],
  discounts: Discount[],
  discountMode: ManualDiscountMode,
  discountValue: number,
): OrderCorrectionPreview {
  const addedLines = addedItems.map(({ item, quantity }) => calculateLine(item, Math.max(0, quantity), discounts));
  const addedSubtotal = addedLines.reduce((sum, line) => sum + roundMoney(line.item.sellingPrice * line.quantity), 0);
  const addedAutomaticDiscount = addedLines.reduce((sum, line) => sum + roundMoney(line.automaticDiscount), 0);
  const subtotal = roundMoney(order.subtotal + addedSubtotal);
  const automaticDiscount = roundMoney(order.automaticDiscountTotal + addedAutomaticDiscount);
  const discountableTotal = Math.max(0, subtotal - automaticDiscount);
  const safeDiscountValue = Math.max(0, Number.isFinite(discountValue) ? discountValue : 0);
  const requestedManualDiscount = discountMode === "PERCENTAGE"
    ? discountableTotal * (Math.min(safeDiscountValue, 100) / 100)
    : safeDiscountValue;
  const manualDiscount = roundMoney(Math.min(requestedManualDiscount, discountableTotal));
  const previousTaxableTotal = Math.max(
    0,
    order.subtotal - order.automaticDiscountTotal - order.manualDiscountTotal,
  );
  const taxRate = previousTaxableTotal > 0 ? order.taxTotal / previousTaxableTotal : 0;
  const taxableTotal = Math.max(0, discountableTotal - manualDiscount);
  const tax = roundMoney(taxableTotal * taxRate);

  return {
    addedSubtotal: roundMoney(addedSubtotal),
    addedAutomaticDiscount: roundMoney(addedAutomaticDiscount),
    subtotal,
    automaticDiscount,
    manualDiscount,
    tax,
    grandTotal: roundMoney(taxableTotal + tax),
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
