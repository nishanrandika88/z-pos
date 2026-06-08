import { supabase } from "@/shared/lib/supabase";
import { relationName } from "@/shared/lib/supabase-relations";
import type { Discount, Item } from "@/domain/catalog/types";
import type { OrderDraft } from "@/domain/orders/types";

interface ItemRow {
  id: string;
  item_code: string;
  barcode: string | null;
  item_name: string;
  description: string | null;
  image_url: string | null;
  selling_price: number | string;
  category_id: string;
  availability: boolean;
  active: boolean;
  display_order?: number | null;
  categories: { name?: string; active?: boolean; display_order?: number | null } | { name?: string; active?: boolean; display_order?: number | null }[] | null;
}

function mapItem(row: ItemRow): Item {
  const category = firstRelation(row.categories);
  return {
    id: row.id,
    itemCode: row.item_code,
    barcode: row.barcode ?? undefined,
    itemName: row.item_name,
    description: row.description ?? undefined,
    image: row.image_url ?? undefined,
    sellingPrice: Number(row.selling_price),
    categoryId: row.category_id,
    categoryName: relationName(row.categories, "Uncategorized"),
    categoryActive: category?.active,
    categoryDisplayOrder: Number(category?.display_order ?? 0),
    availability: row.availability,
    active: row.active,
    displayOrder: Number(row.display_order ?? 0),
  };
}

export async function listActiveItems(): Promise<Item[]> {
  const result = await supabase
    .from("items")
    .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, display_order, categories(name, active, display_order)")
    .eq("active", true)
    .eq("availability", true)
    .order("display_order")
    .order("item_name")
    .limit(100);
  let data = result.data as ItemRow[] | null;
  let error = result.error;

  if (isMissingDisplayOrderError(error)) {
    const fallback = await supabase
      .from("items")
      .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, categories(name, active)")
      .eq("active", true)
      .eq("availability", true)
      .order("item_name")
      .limit(100);
    data = (fallback.data?.map((row, index) => ({ ...row, display_order: index + 1 })) ?? null) as ItemRow[] | null;
    error = fallback.error;
  }
  if (error) throw error;

  return sortItems((data ?? []).map(mapItem).filter((item) => item.categoryActive !== false));
}

export async function searchItems(term: string): Promise<Item[]> {
  const normalized = term.trim();
  if (!normalized) return [];

  const result = await supabase
    .from("items")
    .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, display_order, categories(name, active, display_order)")
    .eq("active", true)
    .or(`item_code.ilike.%${normalized}%,barcode.eq.${normalized},item_name.ilike.%${normalized}%`)
    .order("display_order")
    .limit(30);
  let data = result.data as ItemRow[] | null;
  let error = result.error;

  if (isMissingDisplayOrderError(error)) {
    const fallback = await supabase
      .from("items")
      .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, categories(name, active)")
      .eq("active", true)
      .or(`item_code.ilike.%${normalized}%,barcode.eq.${normalized},item_name.ilike.%${normalized}%`)
      .order("item_name")
      .limit(30);
    data = (fallback.data?.map((row, index) => ({ ...row, display_order: index + 1 })) ?? null) as ItemRow[] | null;
    error = fallback.error;
  }
  if (error) throw error;

  return sortItems((data ?? []).map(mapItem).filter((item) => item.categoryActive !== false));
}

export async function loadActiveDiscounts(): Promise<Discount[]> {
  const { data, error } = await supabase
    .from("discounts")
    .select("id, name, percentage, applicable_type, applicable_id, active")
    .eq("active", true);

  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    percentage: Number(row.percentage),
    applicableType: row.applicable_type,
    applicableId: row.applicable_id,
    active: row.active,
  }));
}

export async function createOrder(draft: OrderDraft) {
  const { data, error } = await supabase.rpc("create_pos_order", {
    order_payload: draft,
  });

  if (error) throw error;
  return data;
}

function sortItems(items: Item[]) {
  return [...items].sort(
    (left, right) =>
      (left.categoryDisplayOrder ?? 0) - (right.categoryDisplayOrder ?? 0) ||
      left.displayOrder - right.displayOrder ||
      left.itemName.localeCompare(right.itemName),
  );
}

function firstRelation<T>(relation: T | T[] | null): T | undefined {
  if (Array.isArray(relation)) return relation[0];
  return relation ?? undefined;
}

function isMissingDisplayOrderError(error: { message?: string } | null) {
  return Boolean(error?.message?.toLowerCase().includes("display_order"));
}
