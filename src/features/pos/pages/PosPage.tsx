import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  UserCircle,
  Wallet,
  X,
} from "lucide-react";
import type { Discount, Item } from "@/domain/catalog/types";
import type { OrderDraft, PaymentDetails } from "@/domain/orders/types";
import {
  readCachedActiveDiscounts,
  readCachedActiveItems,
  writeCachedActiveDiscounts,
  writeCachedActiveItems,
} from "@/features/catalog/catalog-cache";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { getOrderById } from "@/features/orders/orders.repository";
import { addCachedOrder, mergeRecentOrder } from "@/features/orders/orders-cache";
import { openReceiptWindow, printReceipt } from "@/features/orders/receipt-print";
import type { OrderSummary } from "@/features/orders/types";
import { createOrder, listActiveItems, loadActiveDiscounts, searchItems } from "@/features/pos/pos.repository";
import { findBestAutomaticDiscount } from "@/features/pos/pos.service";
import { useOrderTotals, usePosStore } from "@/features/pos/stores/pos.store";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

const currency = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const emptyItems: Item[] = [];
const emptyDiscounts: Discount[] = [];
type Notice = { type: "success" | "error"; message: string } | null;
type CreateOrderVariables = { draft: OrderDraft; receiptWindow: Window | null };

export function PosPage() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [category, setCategory] = useState("Lunch");
  const [notice, setNotice] = useState<Notice>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const profile = useAuthStore((state) => state.profile);
  const userDisplayName = profile?.displayName || profile?.fullName || "Admin";
  const { lines, addItem, removeItem, setQuantity, clearCart, setDiscounts, setManualDiscount, setPayment, payment } = usePosStore();
  const totals = useOrderTotals();
  const createOrderMutation = useMutation<OrderSummary, Error, CreateOrderVariables>({
    async mutationFn({ draft }) {
      const orderId = await createOrder(draft);
      return getOrderById(orderId);
    },
    onSuccess(order, variables) {
      void printReceipt(order, variables.receiptWindow).catch((error) => {
        setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not print receipt." });
      });
      addCachedOrder(order);
      queryClient.setQueryData<OrderSummary[]>(["orders", {}], (current) => mergeRecentOrder(current, order));
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      clearCart();
      setNotice({ type: "success", message: `Order ${order.orderNumber} saved and sent to print.` });
    },
    onError(error, variables) {
      variables.receiptWindow?.close();
      setNotice({ type: "error", message: error.message });
    },
  });
  const { data: activeItems = emptyItems } = useQuery({
    queryKey: ["items", "active"],
    queryFn: listActiveItems,
    initialData: readCachedActiveItems,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const normalizedTerm = term.trim().toLowerCase();
  const localSearchResults = useMemo(() => {
    if (!normalizedTerm) return emptyItems;

    return activeItems.filter(
      (item) =>
        item.itemName.toLowerCase().includes(normalizedTerm) ||
        item.itemCode.toLowerCase().includes(normalizedTerm) ||
        item.barcode?.toLowerCase() === normalizedTerm,
    );
  }, [activeItems, normalizedTerm]);
  const { data: remoteSearchResults = emptyItems } = useQuery({
    queryKey: ["items", "search", debouncedTerm],
    queryFn: () => searchItems(debouncedTerm),
    enabled: debouncedTerm.trim().length >= 2 && localSearchResults.length === 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: discounts = emptyDiscounts } = useQuery({
    queryKey: ["discounts", "active"],
    queryFn: loadActiveDiscounts,
    initialData: readCachedActiveDiscounts,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => setDiscounts(discounts), [discounts, setDiscounts]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedTerm(term.trim()), 180);
    return () => window.clearTimeout(timeoutId);
  }, [term]);

  useEffect(() => {
    if (activeItems.length > 0) {
      writeCachedActiveItems(activeItems);
    }
  }, [activeItems]);

  useEffect(() => {
    if (discounts.length > 0) {
      writeCachedActiveDiscounts(discounts);
    }
  }, [discounts]);

  useEffect(() => {
    if (!notice) return;

    const timeoutId = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const exactBarcodeMatch = useMemo(
    () =>
      activeItems.find((item) => item.barcode && item.barcode === term.trim()) ??
      remoteSearchResults.find((item) => item.barcode && item.barcode === term.trim()),
    [activeItems, remoteSearchResults, term],
  );

  const visibleProducts = useMemo(() => {
    const searchResults = localSearchResults.length > 0 ? localSearchResults : remoteSearchResults;
    const source = normalizedTerm ? searchResults : activeItems;
    return source.filter((item) => {
      const matchesCategory = item.categoryName === category || normalizedTerm.length > 0;
      const matchesTerm =
        !normalizedTerm ||
        item.itemName.toLowerCase().includes(normalizedTerm) ||
        item.itemCode.toLowerCase().includes(normalizedTerm) ||
        item.barcode?.toLowerCase() === normalizedTerm;
      return matchesCategory && matchesTerm;
    });
  }, [activeItems, category, localSearchResults, normalizedTerm, remoteSearchResults]);

  const categories = useMemo(() => {
    return Array.from(new Set(activeItems.map((item) => item.categoryName))).filter(Boolean);
  }, [activeItems]);

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(category)) {
      setCategory(categories[0]);
    }
  }, [categories, category]);

  useEffect(() => {
    if (!exactBarcodeMatch) return;
    addItem(exactBarcodeMatch);
    setTerm("");
  }, [exactBarcodeMatch, addItem]);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") clearCart();
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [clearCart]);

  function selectedPayment(): PaymentDetails {
    if (payment) return payment;

    return {
      method: "CASH",
      amountTendered: totals.grandTotal,
      balanceReturned: 0,
    };
  }

  function selectCardPayment() {
    setPayment({
      method: "CARD",
      cardType: payment?.method === "CARD" ? payment.cardType : "Visa",
      bankName: payment?.method === "CARD" ? payment.bankName : "",
      last4: payment?.method === "CARD" ? payment.last4 : "",
      maskedNumber: payment?.method === "CARD" ? payment.maskedNumber : "",
    });
  }

  function updateCardPayment(field: "cardType" | "bankName" | "last4", value: string) {
    const current = payment?.method === "CARD" ? payment : undefined;
    const last4 = field === "last4" ? value.replace(/\D/g, "").slice(0, 4) : current?.last4 ?? "";

    setPayment({
      method: "CARD",
      cardType: field === "cardType" ? value : current?.cardType ?? "Visa",
      bankName: field === "bankName" ? value : current?.bankName ?? "",
      last4,
      maskedNumber: last4.length === 4 ? `XXXX XXXX XXXX ${last4}` : "",
    });
  }

  function completeSale() {
    if (lines.length === 0 || createOrderMutation.isPending) return;

    const salePayment = selectedPayment();
    if (salePayment.method === "CARD" && (!salePayment.cardType || !salePayment.bankName.trim() || !/^\d{4}$/.test(salePayment.last4))) {
      setNotice({ type: "error", message: "Enter card type, bank name, and the last 4 card digits." });
      return;
    }

    const receiptWindow = openReceiptWindow();

    createOrderMutation.mutate({
      draft: {
        lines,
        totals,
        payment: salePayment,
      },
      receiptWindow,
    });
  }

  return (
    <div className="relative min-h-dvh bg-brand-cream lg:grid lg:h-dvh lg:min-h-0 lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
      {notice ? <NoticeToast notice={notice} onClose={() => setNotice(null)} /> : null}
      <section className="flex min-h-[56dvh] flex-col gap-4 p-3 pb-4 sm:p-4 lg:min-h-0">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-espresso/60" />
            <Input
              ref={searchRef}
              className="h-12 rounded-full border-0 bg-white px-4 pr-11 text-sm shadow-sm"
              placeholder="Search products, scan barcode, or enter item code"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </div>
        </div>

        <div className="pos-scrollbar -mx-3 flex shrink-0 gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {categories.map((name) => (
            <button
              key={name}
              className={[
                "shrink-0 rounded-full border px-5 py-3 text-sm font-medium transition",
                category === name
                  ? "border-brand-orange bg-brand-orange text-white"
                  : "border-transparent bg-white text-brand-espresso/70 hover:bg-white",
              ].join(" ")}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="pos-scrollbar min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
          {visibleProducts.length === 0 ? (
            <div className="grid h-full min-h-72 place-items-center rounded-2xl border border-dashed border-brand-forest/20 bg-white text-sm text-brand-espresso/60">
              No active products found
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {visibleProducts.map((item) => {
                const ruleDiscount = findBestAutomaticDiscount(item, discounts);
                const discountedPrice = ruleDiscount ? item.sellingPrice * (1 - ruleDiscount.percentage / 100) : item.sellingPrice;

                return (
                  <button
                    key={item.id}
                    className="group relative rounded-2xl bg-white p-3 text-center shadow-sm transition hover:shadow-lg"
                    onClick={() => addItem(item)}
                  >
                    {ruleDiscount ? <DiscountPill className="absolute right-2 top-2" percentage={ruleDiscount.percentage} /> : null}
                    <div className="mx-auto h-16 w-16 overflow-hidden rounded-full shadow-[0_8px_18px_rgba(0,0,0,.12)] sm:h-20 sm:w-20">
                      <img
                        className="h-full w-full object-cover transition group-hover:scale-105"
                        src={item.image}
                        alt={item.itemName}
                        loading="lazy"
                      />
                    </div>
                    <p className="mt-3 min-h-10 text-sm font-medium leading-5 text-brand-espresso">{item.itemName}</p>
                    <span className="mt-2 inline-flex flex-col items-center rounded-full bg-brand-cream px-2.5 py-0.5 text-xs font-bold leading-tight text-brand-forest xl:px-3 xl:py-1 xl:text-sm">
                      {ruleDiscount ? (
                        <span className="text-[10px] font-semibold text-brand-espresso/45 line-through xl:text-xs">
                          {currency.format(item.sellingPrice)}
                        </span>
                      ) : null}
                      {currency.format(discountedPrice)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="flex min-h-[68dvh] flex-col border-t border-brand-forest/10 bg-white lg:h-dvh lg:min-h-0 lg:border-l lg:border-t-0">
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-brand-forest/10 px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-orange/12 text-brand-orange">
              <ReceiptText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold leading-5 text-brand-forest">Active bill</h2>
              <p className="truncate text-xs font-medium text-brand-espresso/55">
                {lines.length === 0 ? "Ready for items" : `${lines.length} ${lines.length === 1 ? "item" : "items"} selected`}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-brand-forest/10 bg-white px-3 py-1.5 text-sm font-semibold text-brand-forest shadow-sm">
            <UserCircle className="h-5 w-5 shrink-0" />
            <span className="max-w-[7rem] truncate sm:max-w-40">{userDisplayName}</span>
          </div>
        </div>

        <div className="pos-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {lines.length === 0 ? (
            <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-brand-forest/20 text-sm text-brand-espresso/60">
              Add products to start an order
            </div>
          ) : (
            lines.map((line, index) => (
              <div
                key={line.item.id}
                className={[
                  "mb-4 rounded-2xl border p-4",
                  index === lines.length - 1 ? "border-brand-fresh bg-brand-lime/10" : "border-brand-forest/10 bg-brand-cream/35",
                ].join(" ")}
              >
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold leading-5 text-brand-espresso">{line.item.itemName}</p>
                      {line.automaticDiscount > 0 ? <DiscountPill percentage={discountPercentForLine(line)} /> : null}
                    </div>
                    <p className="mt-1 text-xs text-brand-espresso/60">{line.item.categoryName} - {line.item.itemCode}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {line.automaticDiscount > 0 ? (
                      <p className="text-[11px] font-semibold text-brand-espresso/45 line-through">
                        {currency.format(line.item.sellingPrice * line.quantity)}
                      </p>
                    ) : null}
                    <p className="text-sm font-bold text-brand-forest">{currency.format(line.lineTotal)}</p>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <label className="block w-fit">
                    <div className="inline-flex rounded-full border border-brand-forest/15">
                      <button className="grid h-8 w-8 place-items-center text-brand-espresso/70 hover:text-brand-orange" onClick={() => setQuantity(line.item.id, line.quantity - 1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        className="h-8 min-w-12 border-x border-brand-forest/15 px-1 text-center text-xs font-semibold outline-none"
                        inputMode="numeric"
                        style={{ width: `${Math.max(3, String(line.quantity).length + 1)}ch` }}
                        value={line.quantity}
                        onChange={(event) => setQuantity(line.item.id, Number(event.target.value) || 1)}
                      />
                      <button className="grid h-8 w-8 place-items-center text-brand-espresso/70 hover:text-brand-orange" onClick={() => setQuantity(line.item.id, line.quantity + 1)}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </label>

                  <Button size="icon" variant="ghost" className="h-8 w-8 text-brand-espresso/50 hover:text-destructive" onClick={() => removeItem(line.item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sticky bottom-0 shrink-0 border-t border-brand-forest/10 bg-white p-4 shadow-[0_-12px_30px_rgba(59,47,47,.08)]">
          <div className="mb-3">
            <Input
              className="h-10 rounded-full text-sm"
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="Bill discount (%)"
              onChange={(event) => setManualDiscount("PERCENTAGE", Math.min(Number(event.target.value) || 0, 100))}
            />
          </div>
          <SummaryRow label="Subtotal" value={totals.subtotal} />
          <SummaryRow label="Rule discount" value={-totals.automaticDiscount} />
          <SummaryRow label="Bill discount" value={-totals.manualDiscount} />
          <SummaryRow label="Tax" value={totals.tax} />
          <div className="mt-3 flex items-center justify-between text-xl font-bold text-brand-forest">
            <span>Total</span>
            <span>{currency.format(totals.grandTotal)}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              className={[
                "h-11 font-bold",
                payment?.method === "CASH" || !payment
                  ? "bg-brand-orange text-white hover:bg-brand-orange/90"
                  : "border bg-white text-brand-espresso hover:bg-brand-cream",
              ].join(" ")}
              onClick={() => setPayment({ method: "CASH", amountTendered: totals.grandTotal, balanceReturned: 0 })}
            >
              <Wallet className="h-4 w-4" />
              Cash
            </Button>
            <Button
              className={[
                "h-11 font-bold",
                payment?.method === "CARD"
                  ? "bg-brand-orange text-white hover:bg-brand-orange/90"
                  : "border bg-white text-brand-espresso hover:bg-brand-cream",
              ].join(" ")}
              onClick={selectCardPayment}
              disabled={lines.length === 0}
            >
              <CreditCard className="h-4 w-4" />
              Card
            </Button>
          </div>
          {lines.length > 0 && payment?.method === "CARD" ? (
            <div className="mt-3 grid gap-2 rounded-2xl border border-brand-forest/10 bg-brand-cream p-2.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="relative">
                  <select
                    className="h-10 w-full appearance-none rounded-full border border-brand-forest/15 bg-white px-3 pr-10 text-sm font-medium text-brand-espresso outline-none"
                    value={payment.cardType}
                    onChange={(event) => updateCardPayment("cardType", event.target.value)}
                  >
                    <option value="Visa">Visa</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="Amex">Amex</option>
                    <option value="Other">Other</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-espresso/55" />
                </div>
                <Input
                  className="h-10 rounded-full border-brand-forest/15 bg-white text-sm"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Last 4 digits"
                  value={payment.last4}
                  onChange={(event) => updateCardPayment("last4", event.target.value)}
                />
              </div>
              <Input
                className="h-10 rounded-full border-brand-forest/15 bg-white text-sm"
                placeholder="Bank name"
                value={payment.bankName}
                onChange={(event) => updateCardPayment("bankName", event.target.value)}
              />
              <div className="flex items-center justify-between gap-3 rounded-full bg-white px-3 py-2 text-xs text-brand-espresso/70">
                <span className="flex items-center gap-2 font-semibold text-brand-forest">
                  <CreditCard className="h-3.5 w-3.5" />
                  Secure card
                </span>
                <span className="font-mono tracking-wide">{payment.maskedNumber || "XXXX XXXX XXXX ----"}</span>
              </div>
            </div>
          ) : null}
          <Button
            className="mt-3 h-11 w-full bg-brand-fresh font-bold text-white hover:bg-brand-fresh/90"
            onClick={completeSale}
            disabled={lines.length === 0 || createOrderMutation.isPending}
          >
            <ReceiptText className="h-4 w-4" />
            {createOrderMutation.isPending ? "Saving..." : "Complete Sale"}
          </Button>
        </div>
      </aside>
    </div>
  );
}

function NoticeToast({ notice, onClose }: { notice: Exclude<Notice, null>; onClose: () => void }) {
  const isSuccess = notice.type === "success";

  return (
    <div
      className={[
        "absolute right-4 top-4 z-20 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-full border bg-white px-4 py-3 text-sm font-semibold shadow-xl",
        isSuccess ? "border-brand-fresh/40 text-brand-forest" : "border-brand-orange/40 text-destructive",
      ].join(" ")}
      role="status"
    >
      {isSuccess ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <X className="h-5 w-5 shrink-0" />}
      <span>{notice.message}</span>
      <button className="grid h-7 w-7 place-items-center rounded-full text-brand-espresso/50 hover:bg-brand-cream" onClick={onClose} aria-label="Close notification">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-2 flex items-center justify-between text-xs text-brand-espresso/75">
      <span>{label}</span>
      <span>{currency.format(value)}</span>
    </div>
  );
}

function discountPercentForLine(line: { automaticDiscount: number; item: Item; quantity: number }) {
  const gross = line.item.sellingPrice * line.quantity;
  if (gross <= 0) return 0;
  return Math.round((line.automaticDiscount / gross) * 100);
}

function DiscountPill({ percentage, className = "" }: { percentage: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full bg-brand-orange px-2 py-0.5 text-[10px] font-black leading-4 text-white ${className}`}>
      -{Math.round(percentage)}%
    </span>
  );
}
