import { supabase } from "@/shared/lib/supabase";

export interface DashboardSummary {
  ordersToday: number;
  itemsSoldToday: number;
  salesToday: number;
  salesThisWeek: number;
  salesThisMonth: number;
  totalSales: number;
  commissionToday: number;
  commissionThisWeek: number;
  commissionThisMonth: number;
  totalCommission: number;
  netSalesToday: number;
  netSalesThisWeek: number;
  netSalesThisMonth: number;
  totalNetSales: number;
  cashTotal: number;
  cardTotal: number;
  lankaQrTotal: number;
  bankTransferTotal: number;
  paymentTotal: number;
}

export const emptyDashboardSummary: DashboardSummary = {
  ordersToday: 0,
  itemsSoldToday: 0,
  salesToday: 0,
  salesThisWeek: 0,
  salesThisMonth: 0,
  totalSales: 0,
  commissionToday: 0,
  commissionThisWeek: 0,
  commissionThisMonth: 0,
  totalCommission: 0,
  netSalesToday: 0,
  netSalesThisWeek: 0,
  netSalesThisMonth: 0,
  totalNetSales: 0,
  cashTotal: 0,
  cardTotal: 0,
  lankaQrTotal: 0,
  bankTransferTotal: 0,
  paymentTotal: 0,
};

type DashboardSummaryPayload = Partial<Record<keyof DashboardSummary, number | string | null>>;

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc("get_dashboard_summary");
  if (error) throw error;

  return normalizeDashboardSummary((data ?? {}) as DashboardSummaryPayload);
}

export function normalizeDashboardSummary(payload: DashboardSummaryPayload): DashboardSummary {
  return Object.fromEntries(
    Object.keys(emptyDashboardSummary).map((key) => [key, numberValue(payload[key as keyof DashboardSummary])]),
  ) as unknown as DashboardSummary;
}

export function paymentPercentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
