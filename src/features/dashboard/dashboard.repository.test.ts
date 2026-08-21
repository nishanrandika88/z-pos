import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/shared/lib/supabase", () => ({ supabase: { rpc } }));

import { emptyDashboardSummary, fetchDashboardSummary, paymentPercentage } from "@/features/dashboard/dashboard.repository";

describe("dashboard summary", () => {
  beforeEach(() => rpc.mockReset());

  it("normalizes numeric database values", async () => {
    rpc.mockResolvedValue({
      data: {
        ordersToday: 4,
        itemsSoldToday: "9.5",
        salesToday: "12500.00",
        salesThisWeek: "42000.00",
        salesThisMonth: "99000.00",
        totalSales: "250000.00",
        commissionToday: "150.00",
        commissionThisWeek: "600.00",
        commissionThisMonth: "1400.00",
        totalCommission: "3500.00",
        netSalesToday: "12350.00",
        netSalesThisWeek: "41400.00",
        netSalesThisMonth: "97600.00",
        totalNetSales: "246500.00",
        cashTotal: "7500.00",
        cardTotal: "5000.00",
        paymentTotal: "12500.00",
      },
      error: null,
    });

    await expect(fetchDashboardSummary()).resolves.toEqual({
      ...emptyDashboardSummary,
      ordersToday: 4,
      itemsSoldToday: 9.5,
      salesToday: 12500,
      salesThisWeek: 42000,
      salesThisMonth: 99000,
      totalSales: 250000,
      commissionToday: 150,
      commissionThisWeek: 600,
      commissionThisMonth: 1400,
      totalCommission: 3500,
      netSalesToday: 12350,
      netSalesThisWeek: 41400,
      netSalesThisMonth: 97600,
      totalNetSales: 246500,
      cashTotal: 7500,
      cardTotal: 5000,
      paymentTotal: 12500,
    });
  });

  it("calculates a payment share and handles an empty day", () => {
    expect(paymentPercentage(2500, 10000)).toBe(25);
    expect(paymentPercentage(0, 0)).toBe(0);
  });
});
