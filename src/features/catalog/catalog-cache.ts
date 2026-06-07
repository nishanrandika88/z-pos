import type { Category, Discount, Item } from "@/domain/catalog/types";

const activeItemsCacheKey = "z-pos:catalog:active-items:v1";
const activeDiscountsCacheKey = "z-pos:catalog:active-discounts:v1";
const catalogCategoriesCacheKey = "z-pos:catalog:categories:v1";
const catalogItemsCacheKey = "z-pos:catalog:items:v1";
const maxCacheAgeMs = 24 * 60 * 60 * 1000;

interface CatalogCachePayload<T> {
  savedAt: number;
  data: T;
}

export function readCachedActiveItems(): Item[] | undefined {
  const payload = readCache<Item[]>(activeItemsCacheKey) ?? readCache<Item[]>(catalogItemsCacheKey);
  return payload?.filter((item) => item.active);
}

export function writeCachedActiveItems(items: Item[]) {
  writeCache(activeItemsCacheKey, items);
}

export function clearCachedActiveItems() {
  try {
    localStorage.removeItem(activeItemsCacheKey);
  } catch {
    // Ignore cache cleanup failures.
  }
}

export function readCachedActiveDiscounts(): Discount[] | undefined {
  return readCache<Discount[]>(activeDiscountsCacheKey);
}

export function writeCachedActiveDiscounts(discounts: Discount[]) {
  writeCache(activeDiscountsCacheKey, discounts);
}

export function clearCachedActiveDiscounts() {
  try {
    localStorage.removeItem(activeDiscountsCacheKey);
  } catch {
    // Ignore cache cleanup failures.
  }
}

export function readCachedCatalogCategories(): Category[] | undefined {
  return readCache<Category[]>(catalogCategoriesCacheKey);
}

export function writeCachedCatalogCategories(categories: Category[]) {
  writeCache(catalogCategoriesCacheKey, categories);
}

export function readCachedCatalogItems(): Item[] | undefined {
  return readCache<Item[]>(catalogItemsCacheKey);
}

export function writeCachedCatalogItems(items: Item[]) {
  writeCache(catalogItemsCacheKey, items);
}

export function clearCachedCatalogData() {
  try {
    localStorage.removeItem(catalogCategoriesCacheKey);
    localStorage.removeItem(catalogItemsCacheKey);
  } catch {
    // Ignore cache cleanup failures.
  }
}

function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;

    const payload = JSON.parse(raw) as CatalogCachePayload<T>;
    if (!payload.data) return undefined;
    if (Date.now() - payload.savedAt > maxCacheAgeMs) return undefined;

    return payload.data;
  } catch {
    return undefined;
  }
}

function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies CatalogCachePayload<T>),
    );
  } catch {
    // Storage can be unavailable in private mode. The live query still works.
  }
}
