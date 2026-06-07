import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CreditCard, Printer, Search, Wallet } from "lucide-react";
import { can } from "@/features/auth/rbac";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { auditReceiptReprint, listOrders } from "@/features/orders/orders.repository";
import { printReceipt } from "@/features/orders/receipt-print";
import type { OrderFilters, OrderPayment, OrderSummary } from "@/features/orders/types";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

const currency = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const dateTime = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" });
const emptyOrders: OrderSummary[] = [];

export function OrdersPage() {
  const profile = useAuthStore((state) => state.profile);
  const canReprint = can(profile?.role, "orders:reprint");
  const [filters, setFilters] = useState<OrderFilters>({});
  const [draftFilters, setDraftFilters] = useState<OrderFilters>({});
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: orders = emptyOrders, isLoading, error } = useQuery({
    queryKey: ["orders", filters],
    queryFn: () => listOrders(filters),
  });

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0],
    [orders, selectedOrderId],
  );

  async function printSelectedReceipt() {
    if (!selectedOrder) return;

    try {
      await auditReceiptReprint(selectedOrder.id);
      printReceipt(selectedOrder);
      setNotice("Receipt reprint audited.");
    } catch (printError) {
      setNotice(printError instanceof Error ? printError.message : "Could not reprint receipt.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-muted-foreground">Search orders, view details, and reprint receipts when allowed.</p>
        </div>
        {notice ? <p className="rounded-xl border border-brand-forest/10 bg-white px-4 py-2 text-sm font-medium text-brand-espresso shadow-sm">{notice}</p> : null}
      </div>

      <div className="grid gap-2 lg:grid-cols-[1fr_170px_170px_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search order number"
            value={draftFilters.search ?? ""}
            onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </div>
        <div className="relative">
          <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            type="date"
            value={draftFilters.dateFrom ?? ""}
            onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))}
          />
        </div>
        <div className="relative">
          <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            type="date"
            value={draftFilters.dateTo ?? ""}
            onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))}
          />
        </div>
        <Button onClick={() => setFilters(draftFilters)}>Search</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Recent orders</h2>
              <span className="text-sm text-muted-foreground">{orders.length} loaded</span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid min-h-64 place-items-center text-muted-foreground">Loading orders...</div>
            ) : error ? (
              <div className="grid min-h-64 place-items-center rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
                {error.message}
              </div>
            ) : orders.length === 0 ? (
              <div className="grid min-h-64 place-items-center text-muted-foreground">No orders found.</div>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <div className="grid grid-cols-[1.3fr_.8fr_.8fr_.7fr] border-b bg-brand-cream px-3 py-2 text-xs font-semibold uppercase text-brand-espresso/70">
                  <span>Order</span>
                  <span>Cashier</span>
                  <span>Status</span>
                  <span className="text-right">Total</span>
                </div>
                {orders.map((order) => (
                  <button
                    key={order.id}
                    className={[
                      "grid w-full grid-cols-[1.3fr_.8fr_.8fr_.7fr] items-center border-b px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-white",
                      selectedOrder?.id === order.id ? "bg-brand-orange/10" : "bg-white",
                    ].join(" ")}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <span>
                      <strong className="block text-brand-forest">{order.orderNumber}</strong>
                      <span className="text-xs text-brand-espresso/60">{dateTime.format(new Date(order.createdAt))}</span>
                    </span>
                    <span className="truncate text-brand-espresso">{order.cashierName}</span>
                    <span>
                      <StatusBadge status={order.status} />
                    </span>
                    <strong className="text-right text-brand-forest">{currency.format(order.grandTotal)}</strong>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Order details</h2>
              <Button size="sm" variant="outline" disabled={!selectedOrder || !canReprint} onClick={printSelectedReceipt}>
                <Printer className="h-4 w-4" />
                Reprint
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {selectedOrder ? (
              <OrderDetails order={selectedOrder} canReprint={canReprint} />
            ) : (
              <div className="grid min-h-64 place-items-center text-muted-foreground">Select an order.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: OrderSummary["status"] }) {
  const className =
    status === "COMPLETED"
      ? "bg-brand-lime/20 text-brand-forest"
      : status === "CANCELLED"
        ? "bg-brand-orange/15 text-brand-orange"
        : "bg-brand-cream text-brand-espresso";

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{status}</span>;
}

function OrderDetails({ order, canReprint }: { order: OrderSummary; canReprint: boolean }) {
  const payment = order.payments[0];

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-cream p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-brand-espresso/60">Order number</p>
            <p className="font-bold text-brand-forest">{order.orderNumber}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Info label="Date" value={dateTime.format(new Date(order.createdAt))} />
          <Info label="Cashier" value={order.cashierName} />
        </div>
      </div>

      <div className="space-y-2">
        {order.items.map((item) => (
          <div key={item.id} className="rounded-xl border p-3">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-semibold text-brand-espresso">{item.itemName}</p>
                <p className="text-xs text-brand-espresso/60">
                  {item.itemCode} x {item.quantity}
                </p>
              </div>
              <p className="font-bold">{currency.format(item.lineTotal)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4 text-sm">
        <SummaryRow label="Subtotal" value={order.subtotal} />
        <SummaryRow label="Auto discount" value={-order.automaticDiscountTotal} />
        <SummaryRow label="Bill discount" value={-order.manualDiscountTotal} />
        <SummaryRow label="Tax" value={order.taxTotal} />
        <div className="mt-3 flex justify-between border-t pt-3 text-lg font-bold">
          <span>Total</span>
          <span>{currency.format(order.grandTotal)}</span>
        </div>
      </div>

      {payment ? <PaymentBox payment={payment} /> : null}
      {!canReprint ? <p className="text-xs text-brand-espresso/60">Reprint requires admin or cashier reprint permission.</p> : null}
    </div>
  );
}

function PaymentBox({ payment }: { payment: OrderPayment }) {
  const isCash = payment.method === "CASH";

  return (
    <div className="rounded-xl border p-4 text-sm">
      <div className="mb-3 flex items-center gap-2 font-semibold">
        {isCash ? <Wallet className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
        {payment.method}
      </div>
      <SummaryRow label="Paid" value={payment.amount} />
      {isCash ? (
        <>
          <SummaryRow label="Tendered" value={payment.amountTendered ?? 0} />
          <SummaryRow label="Balance" value={payment.balanceReturned ?? 0} />
        </>
      ) : (
        <>
          <Info label="Card" value={payment.maskedCardNumber ?? "Masked card"} />
          <Info label="Bank" value={payment.bankName ?? "-"} />
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-brand-espresso/60">{label}</p>
      <p className="font-medium text-brand-espresso">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-2 flex justify-between">
      <span className="text-brand-espresso/60">{label}</span>
      <span className="font-semibold text-brand-forest">{currency.format(value)}</span>
    </div>
  );
}
