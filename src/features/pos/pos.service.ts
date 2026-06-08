import type { Discount, Item } from "@/domain/catalog/types";
import type { CartLine, OrderTotals } from "@/domain/orders/types";

export function findBestAutomaticDiscount(item: Item, discounts: Discount[]) {
  return discounts
    .filter(
      (discount) =>
        discount.active &&
        ((discount.applicableType === "ITEM" && discount.applicableId === item.id) ||
          (discount.applicableType === "CATEGORY" && discount.applicableId === item.categoryId)),
    )
    .sort((left, right) => right.percentage - left.percentage)[0];
}

export function calculateLine(item: Item, quantity: number, discounts: Discount[]): CartLine {
  const discount = findBestAutomaticDiscount(item, discounts);
  const gross = item.sellingPrice * quantity;
  const automaticDiscount = discount ? gross * (discount.percentage / 100) : 0;

  return {
    item,
    quantity,
    automaticDiscount,
    lineTotal: gross - automaticDiscount,
  };
}

export function calculateTotals(lines: CartLine[], manualDiscount: number, taxRate = 0): OrderTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.item.sellingPrice * line.quantity, 0);
  const automaticDiscount = lines.reduce((sum, line) => sum + line.automaticDiscount, 0);
  const taxableAmount = Math.max(subtotal - automaticDiscount - manualDiscount, 0);
  const tax = taxableAmount * taxRate;

  return {
    subtotal,
    automaticDiscount,
    manualDiscount,
    tax,
    grandTotal: taxableAmount + tax,
  };
}

export function generateOrderNumber(sequence: number, date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `INV-${ymd}-${String(sequence).padStart(6, "0")}`;
}
