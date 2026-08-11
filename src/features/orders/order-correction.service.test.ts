import { describe, expect, it } from "vitest";
import type { Discount, Item } from "@/domain/catalog/types";
import { calculateOrderCorrectionPreview, initialOrderDiscount } from "@/features/orders/order-correction.service";
import type { OrderSummary } from "@/features/orders/types";

const item: Item = {
  id: "item-1",
  itemCode: "JUICE-1",
  itemName: "Juice",
  sellingPrice: 500,
  categoryId: "category-1",
  categoryName: "Drinks",
  availability: true,
  active: true,
  displayOrder: 1,
};

const discounts: Discount[] = [{
  id: "discount-1",
  name: "Juice 10%",
  percentage: 10,
  applicableType: "ITEM",
  applicableId: item.id,
  active: true,
}];

const order: OrderSummary = {
  id: "order-1",
  orderNumber: "INV-1",
  status: "COMPLETED",
  cashierName: "Cashier",
  subtotal: 1_000,
  automaticDiscountTotal: 0,
  manualDiscountTotal: 100,
  taxTotal: 90,
  grandTotal: 990,
  createdAt: "2026-08-01T00:00:00Z",
  items: [],
  payments: [],
};

describe("order correction totals", () => {
  it("preserves a legacy bill discount as a fixed amount", () => {
    expect(initialOrderDiscount(order)).toEqual({ mode: "FIXED", value: 100 });

    expect(calculateOrderCorrectionPreview(order, [{ item, quantity: 1 }], discounts, "FIXED", 100)).toEqual({
      addedSubtotal: 500,
      addedAutomaticDiscount: 50,
      subtotal: 1_500,
      automaticDiscount: 50,
      manualDiscount: 100,
      tax: 135,
      grandTotal: 1_485,
    });
  });

  it("recalculates a percentage bill discount over the corrected amount", () => {
    expect(calculateOrderCorrectionPreview(order, [{ item, quantity: 1 }], discounts, "PERCENTAGE", 10)).toMatchObject({
      subtotal: 1_500,
      automaticDiscount: 50,
      manualDiscount: 145,
      tax: 130.5,
      grandTotal: 1_435.5,
    });
  });

  it("uses the stored discount mode and value when available", () => {
    expect(initialOrderDiscount({ ...order, manualDiscountType: "PERCENTAGE", manualDiscountValue: 10 }))
      .toEqual({ mode: "PERCENTAGE", value: 10 });
  });
});
