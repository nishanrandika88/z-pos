import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CreditCard, Receipt, RefreshCw, ShoppingBag, TrendingUp } from "lucide-react";
import { buildItemSales, fetchOrdersForRange, summarizeOrders } from "@/features/reports/reports.repository";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";

const currency = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const dateTime = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" });

export function DashboardPage() {
  const today = localDate();
  const sevenDaysAgo = localDate(daysAgo(6));
  const { data: todayOrders = [], isFetching, refetch, error } = useQuery({
    queryKey: ["dashboard", "orders", today],
    queryFn: () => fetchOrdersForRange({ dateFrom: today, dateTo: today }),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const { data: weekOrders = [] } = useQuery({
    queryKey: ["dashboard", "orders", sevenDaysAgo, today],
    queryFn: () => fetchOrdersForRange({ dateFrom: sevenDaysAgo, dateTo: today }),
    refetchOnWindowFocus: false,
  });

  const summary = useMemo(() => summarizeOrders(todayOrders), [todayOrders]);
  const weekSummary = useMemo(() => summarizeOrders(weekOrders), [weekOrders]);
  const topItems = useMemo(() => buildItemSales(todayOrders).slice(0, 6), [todayOrders]);
  const recentOrders = todayOrders.slice(0, 8);

  const widgets = [
    { label: "Sales Today", value: currency.format(summary.grandTotal), icon: TrendingUp },
    { label: "Orders Today", value: summary.orderCount, icon: Receipt },
    { label: "Items Sold", value: summary.itemCount, icon: ShoppingBag },
    { label: "7 Day Revenue", value: currency.format(weekSummary.grandTotal), icon: BarChart3 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">Sales, orders, payment split, and top item performance.</p>
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-white p-3 text-sm text-destructive">{error.message}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {widgets.map((widget) => (
          <Card key={widget.label}>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{widget.label}</p>
                <p className="mt-1 text-2xl font-semibold">{widget.value}</p>
              </div>
              <widget.icon className="h-8 w-8 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Recent Orders Today</h2>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="grid min-h-48 place-items-center text-muted-foreground">No orders today.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2">Order</th>
                      <th>Time</th>
                      <th>Cashier</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="py-2 font-semibold text-brand-forest">{order.orderNumber}</td>
                        <td>{dateTime.format(new Date(order.createdAt))}</td>
                        <td>{order.cashierName}</td>
                        <td className="text-right font-semibold">{currency.format(order.grandTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4" />Payment Split</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <PaymentRow label="Cash" value={summary.cashTotal} total={summary.grandTotal} />
              <PaymentRow label="Card" value={summary.cardTotal} total={summary.grandTotal} />
              <PaymentRow label="LankaQR" value={summary.lankaQrTotal} total={summary.grandTotal} />
              <PaymentRow label="Bank Transfer" value={summary.bankTransferTotal} total={summary.grandTotal} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold">Top Items Today</h2>
            </CardHeader>
            <CardContent className="space-y-2">
              {topItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No item sales yet.</p>
              ) : (
                topItems.map((item) => (
                  <div key={item.itemCode || item.itemName} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.itemName}</p>
                      <p className="text-xs text-muted-foreground">{item.quantity} sold</p>
                    </div>
                    <span className="font-semibold text-brand-forest">{currency.format(item.netTotal)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PaymentRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold">{currency.format(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-cream">
        <div className="h-full rounded-full bg-brand-orange" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}
