import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarDays, CalendarRange, CreditCard, Receipt, RefreshCw, ShoppingBag, TrendingDown, TrendingUp } from "lucide-react";
import { emptyDashboardSummary, fetchDashboardSummary, paymentPercentage } from "@/features/dashboard/dashboard.repository";
import { buildItemSales, fetchOrdersForRange } from "@/features/reports/reports.repository";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";

const currency = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const dateTime = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" });
const quantity = new Intl.NumberFormat("en-LK", { maximumFractionDigits: 3 });

export function DashboardPage() {
  const today = localDate();
  const {
    data: summary = emptyDashboardSummary,
    isFetching: isSummaryFetching,
    refetch: refetchSummary,
    error: summaryError,
  } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: fetchDashboardSummary,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const {
    data: todayOrders = [],
    isFetching: areTodayOrdersFetching,
    refetch: refetchTodayOrders,
    error: todayOrdersError,
  } = useQuery({
    queryKey: ["dashboard", "orders", today],
    queryFn: () => fetchOrdersForRange({ dateFrom: today, dateTo: today, status: "COMPLETED" }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const topItems = useMemo(() => buildItemSales(todayOrders).slice(0, 6), [todayOrders]);
  const recentOrders = todayOrders.slice(0, 8);
  const isFetching = isSummaryFetching || areTodayOrdersFetching;
  const error = summaryError ?? todayOrdersError;

  const widgets = [
    { label: "Orders Today", value: quantity.format(summary.ordersToday), icon: Receipt },
    { label: "Items Sold", value: quantity.format(summary.itemsSoldToday), icon: ShoppingBag },
    { label: "Gross Sales Today", value: currency.format(summary.salesToday), icon: TrendingUp },
    { label: "Commission Today", value: currency.format(summary.commissionToday), icon: TrendingDown },
    { label: "Net Sales Today", value: currency.format(summary.netSalesToday), icon: TrendingUp },
    { label: "Net This Week", value: currency.format(summary.netSalesThisWeek), icon: CalendarDays },
    { label: "Net This Month", value: currency.format(summary.netSalesThisMonth), icon: CalendarRange },
    { label: "Total Net Sales", value: currency.format(summary.totalNetSales), icon: BarChart3 },
  ];

  async function refreshDashboard() {
    await Promise.all([refetchSummary(), refetchTodayOrders()]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">Sales, orders, payment split, and top item performance.</p>
        </div>
        <Button variant="outline" onClick={() => void refreshDashboard()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-white p-3 text-sm text-destructive">{error.message}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {widgets.map((widget) => (
          <Card key={widget.label}>
            <CardContent className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{widget.label}</p>
                <p className="mt-1 break-words text-xl font-semibold" title={String(widget.value)}>{widget.value}</p>
              </div>
              <widget.icon className="h-7 w-7 shrink-0 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Recent Completed Orders Today</h2>
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
              <div>
                <h2 className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4" />Today&apos;s Payment Split</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Each bar shows the method&apos;s share of {currency.format(summary.paymentTotal)} in completed payments today.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <PaymentRow label="Cash" value={summary.cashTotal} total={summary.paymentTotal} />
              <PaymentRow label="Card" value={summary.cardTotal} total={summary.paymentTotal} />
              <PaymentRow label="LankaQR" value={summary.lankaQrTotal} total={summary.paymentTotal} />
              <PaymentRow label="Bank Transfer" value={summary.bankTransferTotal} total={summary.paymentTotal} />
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
  const percent = paymentPercentage(value, total);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold">{currency.format(value)} <span className="text-xs text-muted-foreground">({percent}%)</span></span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-brand-cream"
        role="progressbar"
        aria-label={`${label}: ${percent}% of today's completed payments`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full rounded-full bg-brand-orange" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
