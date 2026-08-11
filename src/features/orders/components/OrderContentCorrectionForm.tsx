import { type FormEvent, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Discount, Item } from "@/domain/catalog/types";
import {
  calculateOrderCorrectionPreview,
  initialOrderDiscount,
  type AddedCorrectionItem,
} from "@/features/orders/order-correction.service";
import type { ManualDiscountMode, OrderContentCorrection, OrderSummary } from "@/features/orders/types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

const currency = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });

export function OrderContentCorrectionForm({
  order,
  items,
  discounts,
  pending,
  onSubmit,
}: {
  order: OrderSummary;
  items: Item[];
  discounts: Discount[];
  pending: boolean;
  onSubmit: (correction: OrderContentCorrection) => Promise<void>;
}) {
  const initialDiscount = initialOrderDiscount(order);
  const payment = order.payments[0];
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [addedItems, setAddedItems] = useState<AddedCorrectionItem[]>([]);
  const [discountMode, setDiscountMode] = useState<ManualDiscountMode>(initialDiscount.mode);
  const [discountValue, setDiscountValue] = useState(String(initialDiscount.value || ""));
  const [cashTendered, setCashTendered] = useState(String(payment?.amountTendered ?? order.grandTotal));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const numericDiscount = Number(discountValue) || 0;
  const preview = useMemo(
    () => calculateOrderCorrectionPreview(order, addedItems, discounts, discountMode, numericDiscount),
    [addedItems, discountMode, discounts, numericDiscount, order],
  );
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return items
      .filter((item) =>
        !addedItems.some((added) => added.item.id === item.id)
        && (
          item.itemName.toLowerCase().includes(term)
          || item.itemCode.toLowerCase().includes(term)
          || item.barcode?.toLowerCase() === term
        ))
      .slice(0, 8);
  }, [addedItems, items, search]);
  const discountChanged = discountMode !== initialDiscount.mode || Math.abs(numericDiscount - initialDiscount.value) > 0.001;

  function addItem(item: Item) {
    setAddedItems((current) => [...current, { item, quantity: 1 }]);
    setSearch("");
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanReason = reason.trim();
    const tendered = Number(cashTendered);

    if (addedItems.length === 0 && !discountChanged) {
      setError("Add at least one item or change the bill discount.");
      return;
    }
    if (!cleanReason) {
      setError("Enter a reason for the correction.");
      return;
    }
    if (!Number.isFinite(numericDiscount) || numericDiscount < 0) {
      setError("Enter a valid bill discount.");
      return;
    }
    if (discountMode === "PERCENTAGE" && numericDiscount > 100) {
      setError("Bill discount percentage cannot exceed 100.");
      return;
    }
    const discountableTotal = preview.subtotal - preview.automaticDiscount;
    if (discountMode === "FIXED" && numericDiscount > discountableTotal) {
      setError("Bill discount cannot exceed the amount after automatic discounts.");
      return;
    }
    if (addedItems.some((added) => !Number.isFinite(added.quantity) || added.quantity <= 0 || added.quantity > 1000)) {
      setError("Each added item needs a quantity greater than 0 and no more than 1000.");
      return;
    }
    if (payment?.method === "CASH" && (!Number.isFinite(tendered) || tendered < preview.grandTotal)) {
      setError("Cash tendered must be at least the corrected order total.");
      return;
    }

    setError(null);
    try {
      await onSubmit({
        orderId: order.id,
        addedItems: addedItems.map((added) => ({ itemId: added.item.id, quantity: added.quantity })),
        discountMode,
        discountValue: numericDiscount,
        cashTendered: payment?.method === "CASH" ? tendered : undefined,
        reason: cleanReason,
      });
      setEditing(false);
    } catch {
      // The page-level mutation displays the database error.
    }
  }

  if (!editing) {
    return (
      <Button className="w-full" size="sm" variant="outline" onClick={() => setEditing(true)}>
        <Pencil className="h-4 w-4" />
        Add items or update bill discount
      </Button>
    );
  }

  return (
    <form className="space-y-4 rounded-xl border border-brand-orange/40 bg-brand-orange/5 p-4" onSubmit={save}>
      <div>
        <p className="font-semibold text-brand-espresso">Correct items and bill discount</p>
        <p className="text-xs text-brand-espresso/60">Admin only. Added items use the current catalog price and active automatic discount.</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-brand-espresso" htmlFor={`item-search-${order.id}`}>Add missing items</label>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id={`item-search-${order.id}`}
            className="pl-9"
            placeholder="Search item name, code, or barcode"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {search.trim() ? (
          <div className="max-h-48 divide-y overflow-auto rounded-lg border bg-white">
            {results.length > 0 ? results.map((item) => (
              <button key={item.id} className="flex w-full items-center justify-between gap-3 p-2 text-left text-sm hover:bg-brand-cream" type="button" onClick={() => addItem(item)}>
                <span className="min-w-0"><strong className="block truncate">{item.itemName}</strong><span className="text-xs text-muted-foreground">{item.itemCode}</span></span>
                <span className="flex shrink-0 items-center gap-1 font-semibold text-brand-forest"><Plus className="h-3.5 w-3.5" />{currency.format(item.sellingPrice)}</span>
              </button>
            )) : <p className="p-3 text-sm text-muted-foreground">No matching active items.</p>}
          </div>
        ) : null}

        {addedItems.map((added) => (
          <div key={added.item.id} className="grid grid-cols-[1fr_92px_auto] items-end gap-2 rounded-lg border bg-white p-2">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{added.item.itemName}</p><p className="text-xs text-muted-foreground">{currency.format(added.item.sellingPrice)} each</p></div>
            <label className="text-xs font-medium">Quantity<Input className="mt-1 h-9" min="0.001" max="1000" step="0.001" type="number" value={added.quantity} onChange={(event) => setAddedItems((current) => current.map((entry) => entry.item.id === added.item.id ? { ...entry, quantity: Number(event.target.value) } : entry))} /></label>
            <Button aria-label={`Remove ${added.item.itemName}`} size="icon" type="button" variant="ghost" onClick={() => setAddedItems((current) => current.filter((entry) => entry.item.id !== added.item.id))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-brand-espresso">Bill discount</p>
        <div className="grid grid-cols-2 gap-2 rounded-full bg-white p-1">
          <Button size="sm" type="button" variant={discountMode === "PERCENTAGE" ? "default" : "ghost"} onClick={() => setDiscountMode("PERCENTAGE")}>Percentage</Button>
          <Button size="sm" type="button" variant={discountMode === "FIXED" ? "default" : "ghost"} onClick={() => setDiscountMode("FIXED")}>Amount</Button>
        </div>
        <Input
          inputMode="decimal"
          max={discountMode === "PERCENTAGE" ? 100 : Math.max(0, preview.subtotal - preview.automaticDiscount)}
          min="0"
          placeholder={discountMode === "PERCENTAGE" ? "Discount percentage" : "Discount amount"}
          value={discountValue}
          onChange={(event) => setDiscountValue(event.target.value)}
        />
      </div>

      <div className="space-y-1 rounded-lg border bg-white p-3 text-sm">
        <PreviewRow label="Corrected subtotal" value={preview.subtotal} />
        <PreviewRow label="Automatic discount" value={-preview.automaticDiscount} />
        <PreviewRow label="Bill discount" value={-preview.manualDiscount} />
        <PreviewRow label="Tax" value={preview.tax} />
        <div className="mt-2 flex justify-between border-t pt-2 font-bold"><span>Corrected total</span><span>{currency.format(preview.grandTotal)}</span></div>
      </div>

      {payment?.method === "CASH" ? (
        <label className="block text-sm font-medium text-brand-espresso">Corrected cash tendered<Input className="mt-1" inputMode="decimal" value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} /></label>
      ) : null}

      <label className="block text-sm font-medium text-brand-espresso">Correction reason<Input className="mt-1" placeholder="Example: Two juices were missing from the bill" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={pending}>{pending ? "Saving…" : "Save correction"}</Button>
        <Button size="sm" type="button" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </form>
  );
}

function PreviewRow({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{currency.format(value)}</span></div>;
}
