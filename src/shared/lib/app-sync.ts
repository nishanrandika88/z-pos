import type { QueryClient } from "@tanstack/react-query";
import {
  clearCachedActiveDiscounts,
  clearCachedActiveItems,
  clearCachedCatalogData,
  clearCachedCatalogDiscounts,
} from "@/features/catalog/catalog-cache";
import { clearCachedOrders } from "@/features/orders/orders-cache";
import { clearCachedCompanySettings } from "@/features/settings/settings.repository";

const appQueryKeys = [
  ["categories"],
  ["items"],
  ["items", "active"],
  ["discounts"],
  ["discounts", "active"],
  ["orders"],
  ["company-settings"],
] as const;

export async function syncAppData(queryClient: QueryClient) {
  clearAppDataCaches();

  await Promise.all(
    appQueryKeys.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey,
        refetchType: "active",
      }),
    ),
  );
}

export function clearAppDataCaches() {
  clearCachedActiveDiscounts();
  clearCachedActiveItems();
  clearCachedCatalogData();
  clearCachedCatalogDiscounts();
  clearCachedOrders();
  clearCachedCompanySettings();
}
