import { create } from "zustand";
import type { Discount, Item } from "@/domain/catalog/types";
import type { CartLine, PaymentDetails } from "@/domain/orders/types";
import { calculateLine, calculateTotals } from "@/features/pos/pos.service";

type ManualDiscountMode = "PERCENTAGE" | "FIXED";

interface PosState {
  lines: CartLine[];
  discounts: Discount[];
  manualDiscountMode: ManualDiscountMode;
  manualDiscountValue: number;
  payment?: PaymentDetails;
  setDiscounts: (discounts: Discount[]) => void;
  addItem: (item: Item) => void;
  removeItem: (itemId: string) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  setManualDiscount: (mode: ManualDiscountMode, value: number) => void;
  setPayment: (payment: PaymentDetails) => void;
}

function rebuildLine(line: CartLine, discounts: Discount[], quantity = line.quantity) {
  return calculateLine(line.item, quantity, discounts);
}

function discountsEqual(left: Discount[], right: Discount[]) {
  if (left.length !== right.length) return false;

  return left.every((discount, index) => {
    const other = right[index];
    return (
      other &&
      discount.id === other.id &&
      discount.percentage === other.percentage &&
      discount.active === other.active &&
      discount.applicableType === other.applicableType &&
      discount.applicableId === other.applicableId
    );
  });
}

export const usePosStore = create<PosState>((set) => ({
  lines: [],
  discounts: [],
  manualDiscountMode: "PERCENTAGE",
  manualDiscountValue: 0,
  setDiscounts(discounts) {
    set((state) => {
      if (discountsEqual(state.discounts, discounts)) return state;

      return {
        discounts,
        lines: state.lines.map((line) => rebuildLine(line, discounts)),
      };
    });
  },
  addItem(item) {
    set((state) => {
      const existing = state.lines.find((line) => line.item.id === item.id);
      if (existing) {
        return {
          lines: state.lines.map((line) =>
            line.item.id === item.id ? rebuildLine(line, state.discounts, line.quantity + 1) : line,
          ),
        };
      }
      return { lines: [...state.lines, calculateLine(item, 1, state.discounts)] };
    });
  },
  removeItem(itemId) {
    set((state) => {
      const lines = state.lines.filter((line) => line.item.id !== itemId);

      if (lines.length === 0) {
        return {
          lines,
          payment: undefined,
          manualDiscountMode: "PERCENTAGE",
          manualDiscountValue: 0,
        };
      }

      return { lines };
    });
  },
  setQuantity(itemId, quantity) {
    const safeQuantity = Math.max(1, quantity);
    set((state) => ({
      lines: state.lines.map((line) => (line.item.id === itemId ? rebuildLine(line, state.discounts, safeQuantity) : line)),
    }));
  },
  clearCart() {
    set({ lines: [], payment: undefined, manualDiscountMode: "PERCENTAGE", manualDiscountValue: 0 });
  },
  setManualDiscount(mode, value) {
    set({ manualDiscountMode: mode, manualDiscountValue: Math.max(0, value) });
  },
  setPayment(payment) {
    set({ payment });
  },
}));

export function useOrderTotals() {
  const lines = usePosStore((state) => state.lines);
  const mode = usePosStore((state) => state.manualDiscountMode);
  const value = usePosStore((state) => state.manualDiscountValue);
  const subtotalAfterAuto = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const manualDiscount = mode === "PERCENTAGE" ? subtotalAfterAuto * (value / 100) : value;
  return calculateTotals(lines, Math.min(manualDiscount, subtotalAfterAuto));
}
