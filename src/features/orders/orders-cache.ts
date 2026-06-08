import type { OrderFilters, OrderSummary } from "@/features/orders/types";

const ordersCacheKey = "z-pos:orders:recent:v1";
const maxCacheAgeMs = 24 * 60 * 60 * 1000;

interface OrdersCachePayload {
  savedAt: number;
  data: OrderSummary[];
}

export function readCachedOrders(filters: OrderFilters = {}) {
  return applyOrderFilters(readCache(), filters);
}

export function writeCachedOrders(orders: OrderSummary[]) {
  writeCache(sortRecent(orders).slice(0, 50));
}

export function addCachedOrder(order: OrderSummary) {
  const current = readCache();
  writeCachedOrders([order, ...current.filter((entry) => entry.id !== order.id)]);
}

export function mergeRecentOrder(orders: OrderSummary[] | undefined, order: OrderSummary) {
  return sortRecent([order, ...(orders ?? []).filter((entry) => entry.id !== order.id)]).slice(0, 50);
}

function applyOrderFilters(orders: OrderSummary[], filters: OrderFilters) {
  const query = filters.search?.trim().toLowerCase();
  return sortRecent(orders).filter((order) => {
    const createdAt = new Date(order.createdAt).getTime();
    const matchesSearch = !query || order.orderNumber.toLowerCase().includes(query);
    const matchesFrom = !filters.dateFrom || createdAt >= new Date(`${filters.dateFrom}T00:00:00`).getTime();
    const matchesTo = !filters.dateTo || createdAt <= new Date(`${filters.dateTo}T23:59:59.999`).getTime();
    return matchesSearch && matchesFrom && matchesTo;
  });
}

function sortRecent(orders: OrderSummary[]) {
  return [...orders].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function readCache() {
  try {
    const raw = localStorage.getItem(ordersCacheKey);
    if (!raw) return [];

    const payload = JSON.parse(raw) as OrdersCachePayload;
    if (!payload.data || Date.now() - payload.savedAt > maxCacheAgeMs) return [];
    return payload.data;
  } catch {
    return [];
  }
}

function writeCache(data: OrderSummary[]) {
  try {
    localStorage.setItem(ordersCacheKey, JSON.stringify({ savedAt: Date.now(), data } satisfies OrdersCachePayload));
  } catch {
    // Live queries still work when localStorage is unavailable.
  }
}
