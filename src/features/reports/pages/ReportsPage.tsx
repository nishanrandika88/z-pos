import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, RefreshCw, X } from "lucide-react";
import {
  buildItemSales,
  catalogRows,
  fetchCatalogExportData,
  fetchOrdersForRange,
  itemSalesRows,
  orderRows,
  summarizeOrders,
} from "@/features/reports/reports.repository";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { downloadCsv } from "@/shared/lib/csv";

type ReportType = "sales" | "orders" | "items" | "catalog";

const currency = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const emptyOrders: Awaited<ReturnType<typeof fetchOrdersForRange>> = [];
const emptyCatalogItems: Awaited<ReturnType<typeof fetchCatalogExportData>>["items"] = [];
const reportTypes: Array<{ id: ReportType; label: string }> = [
  { id: "sales", label: "Sales" },
  { id: "orders", label: "Orders" },
  { id: "items", label: "Item Sales" },
  { id: "catalog", label: "Catalog" },
];

export function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("sales");
  const [dateFrom, setDateFrom] = useState(localDate());
  const [dateTo, setDateTo] = useState(localDate());
  const isCatalogReport = reportType === "catalog";
  const ordersQuery = useQuery({
    queryKey: ["reports", "orders", dateFrom, dateTo],
    queryFn: () => fetchOrdersForRange({ dateFrom, dateTo }),
    enabled: !isCatalogReport,
    refetchOnWindowFocus: false,
  });
  const catalogQuery = useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: fetchCatalogExportData,
    enabled: isCatalogReport,
    refetchOnWindowFocus: false,
  });

  const orders = ordersQuery.data ?? emptyOrders;
  const itemSales = useMemo(() => buildItemSales(orders), [orders]);
  const summary = useMemo(() => summarizeOrders(orders), [orders]);
  const catalogItems = catalogQuery.data?.items ?? emptyCatalogItems;
  const isFetching = isCatalogReport ? catalogQuery.isFetching : ordersQuery.isFetching;
  const error = isCatalogReport ? catalogQuery.error : ordersQuery.error;

  function refresh() {
    void (isCatalogReport ? catalogQuery.refetch() : ordersQuery.refetch());
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
  }

  function exportReport() {
    const suffix = isCatalogReport ? "catalog" : `${dateFrom || "all"}_to_${dateTo || "all"}`;
    if (reportType === "sales") {
      downloadCsv(`sales-summary-${suffix}.csv`, [
        {
          Orders: summary.orderCount,
          "Items Sold": summary.itemCount,
          Subtotal: summary.subtotal,
          Discount: summary.discountTotal,
          Tax: summary.taxTotal,
          Total: summary.grandTotal,
          Cash: summary.cashTotal,
          Card: summary.cardTotal,
        },
      ]);
    }
    if (reportType === "orders") downloadCsv(`orders-${suffix}.csv`, orderRows(orders));
    if (reportType === "items") downloadCsv(`item-sales-${suffix}.csv`, itemSalesRows(itemSales));
    if (reportType === "catalog") downloadCsv("catalog-export.csv", catalogRows(catalogItems));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-muted-foreground">Sales, order, item sales, and catalog exports for Excel.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[160px_160px_auto_auto_auto]">
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} disabled={isCatalogReport} />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} disabled={isCatalogReport} />
          <Button variant="outline" onClick={clearFilters} disabled={isCatalogReport || (!dateFrom && !dateTo)}>
            <X className="h-4 w-4" />
            Clear
          </Button>
          <Button variant="outline" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={exportReport} disabled={isFetching || (isCatalogReport ? catalogItems.length === 0 : orders.length === 0)}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="pos-scrollbar flex gap-2 overflow-x-auto pb-1">
        {reportTypes.map((type) => (
          <button
            key={type.id}
            className={[
              "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition",
              reportType === type.id ? "border-brand-orange bg-brand-orange text-white" : "bg-white text-brand-espresso/70",
            ].join(" ")}
            onClick={() => setReportType(type.id)}
            type="button"
          >
            {type.label}
          </button>
        ))}
      </div>

      {!isCatalogReport ? <TotalSalesStrip summary={summary} dateFrom={dateFrom} dateTo={dateTo} /> : null}

      {error ? <div className="rounded-md border border-destructive/30 bg-white p-3 text-sm text-destructive">{error.message}</div> : null}

      {reportType === "sales" ? <SalesReport summary={summary} /> : null}
      {reportType === "orders" ? <OrdersReport orders={orders} /> : null}
      {reportType === "items" ? <ItemSalesReport rows={itemSales} /> : null}
      {reportType === "catalog" ? <CatalogReport items={catalogItems} /> : null}
    </div>
  );
}

function TotalSalesStrip({ summary, dateFrom, dateTo }: { summary: ReturnType<typeof summarizeOrders>; dateFrom: string; dateTo: string }) {
  const rangeText =
    dateFrom && dateTo
      ? `${dateFrom} to ${dateTo}`
      : dateFrom
        ? `From ${dateFrom}`
        : dateTo
          ? `Until ${dateTo}`
          : "All available dates";

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Total sale</p>
          <p className="text-xs text-brand-espresso/60">{rangeText}</p>
        </div>
        <p className="text-2xl font-bold text-brand-forest">{currency.format(summary.grandTotal)}</p>
      </CardContent>
    </Card>
  );
}

function SalesReport({ summary }: { summary: ReturnType<typeof summarizeOrders> }) {
  const cards = [
    { label: "Orders", value: summary.orderCount },
    { label: "Items Sold", value: summary.itemCount },
    { label: "Subtotal", value: currency.format(summary.subtotal) },
    { label: "Discount", value: currency.format(summary.discountTotal) },
    { label: "Cash", value: currency.format(summary.cashTotal) },
    { label: "Card", value: currency.format(summary.cardTotal) },
    { label: "Tax", value: currency.format(summary.taxTotal) },
    { label: "Total", value: currency.format(summary.grandTotal) },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent>
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrdersReport({ orders }: { orders: Awaited<ReturnType<typeof fetchOrdersForRange>> }) {
  return (
    <ReportTable
      title="Orders"
      emptyText="No orders found for this range."
      headers={["Order", "Date", "Cashier", "Items", "Discount", "Total"]}
      rows={orders.map((order) => [
        order.orderNumber,
        new Date(order.createdAt).toLocaleString(),
        order.cashierName,
        order.items.reduce((sum, item) => sum + item.quantity, 0),
        currency.format(order.automaticDiscountTotal + order.manualDiscountTotal),
        currency.format(order.grandTotal),
      ])}
    />
  );
}

function ItemSalesReport({ rows }: { rows: ReturnType<typeof buildItemSales> }) {
  return (
    <ReportTable
      title="Item Sales"
      emptyText="No item sales found for this range."
      headers={["Code", "Item", "Qty", "Gross", "Discount", "Net"]}
      rows={rows.map((row) => [
        row.itemCode,
        row.itemName,
        row.quantity,
        currency.format(row.grossTotal),
        currency.format(row.discountTotal),
        currency.format(row.netTotal),
      ])}
    />
  );
}

function CatalogReport({ items }: { items: Awaited<ReturnType<typeof fetchCatalogExportData>>["items"] }) {
  return (
    <ReportTable
      title="Catalog Export"
      emptyText="No catalog items found."
      headers={["Code", "Name", "Category", "Price", "Status"]}
      rows={items.map((item) => [
        item.itemCode,
        item.itemName,
        item.categoryName,
        currency.format(item.sellingPrice),
        item.active ? "Active" : "Archived",
      ])}
    />
  );
}

function ReportTable({ title, emptyText, headers, rows }: { title: string; emptyText: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="h-4 w-4" />{title}</h2>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="grid min-h-56 place-items-center text-muted-foreground">{emptyText}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  {headers.map((header) => <th key={header} className="py-2">{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 250).map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b last:border-0">
                    {row.map((cell, cellIndex) => <td key={cellIndex} className="py-2">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 250 ? <p className="mt-3 text-xs text-muted-foreground">Showing first 250 rows. Export includes all rows.</p> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
