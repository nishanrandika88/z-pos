import type { Category, Discount, Item } from "@/domain/catalog/types";

const activeItemsCacheKey = "z-pos:catalog:active-items:v2";
const activeDiscountsCacheKey = "z-pos:catalog:active-discounts:v2";
const catalogCategoriesCacheKey = "z-pos:catalog:categories:v2";
const catalogItemsCacheKey = "z-pos:catalog:items:v2";
const catalogDiscountsCacheKey = "z-pos:catalog:discounts:v2";
const maxCacheAgeMs = 24 * 60 * 60 * 1000;

interface CatalogCachePayload<T> {
  savedAt: number;
  data: T;
}

export function readCachedActiveItems(): Item[] | undefined {
  const payload = readCache<Item[]>(activeItemsCacheKey) ?? readCache<Item[]>(catalogItemsCacheKey);
  return normalizeItems(payload)
    ?.filter((item) => item.active && item.availability && item.categoryActive !== false)
    .sort(compareItems);
}

export function writeCachedActiveItems(items: Item[]) {
  writeCache(activeItemsCacheKey, normalizeItems(items)?.sort(compareItems) ?? items);
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

export function readCachedCatalogDiscounts(): Discount[] | undefined {
  return readCache<Discount[]>(catalogDiscountsCacheKey);
}

export function writeCachedCatalogDiscounts(discounts: Discount[]) {
  writeCache(catalogDiscountsCacheKey, discounts);
}

export function clearCachedCatalogDiscounts() {
  try {
    localStorage.removeItem(catalogDiscountsCacheKey);
  } catch {
    // Ignore cache cleanup failures.
  }
}

export function readCachedCatalogCategories(): Category[] | undefined {
  return normalizeCategories(readCache<Category[]>(catalogCategoriesCacheKey))?.sort(compareCategories);
}

export function writeCachedCatalogCategories(categories: Category[]) {
  writeCache(catalogCategoriesCacheKey, normalizeCategories(categories)?.sort(compareCategories) ?? categories);
}

export function readCachedCatalogItems(): Item[] | undefined {
  return normalizeItems(readCache<Item[]>(catalogItemsCacheKey))?.sort(compareItems);
}

export function writeCachedCatalogItems(items: Item[]) {
  writeCache(catalogItemsCacheKey, normalizeItems(items)?.sort(compareItems) ?? items);
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

function normalizeCategories(categories: Category[] | undefined) {
  return categories?.map((category, index) => ({
    ...category,
    displayOrder: Number(category.displayOrder ?? index + 1),
  }));
}

function normalizeItems(items: Item[] | undefined) {
  return items?.map((item, index) => ({
    ...item,
    displayOrder: Number(item.displayOrder ?? index + 1),
    categoryDisplayOrder: Number(item.categoryDisplayOrder ?? 0),
  }));
}

function compareCategories(left: Category, right: Category) {
  return left.displayOrder - right.displayOrder || left.name.localeCompare(right.name);
}

function compareItems(left: Item, right: Item) {
  return (
    (left.categoryDisplayOrder ?? 0) - (right.categoryDisplayOrder ?? 0) ||
    left.displayOrder - right.displayOrder ||
    left.itemName.localeCompare(right.itemName)
  );
}
