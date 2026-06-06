import { supabase } from "@/shared/lib/supabase";
import { relationName } from "@/shared/lib/supabase-relations";
import type { Discount, Item } from "@/domain/catalog/types";
import type { OrderDraft } from "@/domain/orders/types";

function mapItem(row: {
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
  categories: { name?: string } | { name?: string }[] | null;
}): Item {
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
    availability: row.availability,
    active: row.active,
  };
}

export async function listActiveItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, categories(name)")
    .eq("active", true)
    .eq("availability", true)
    .order("item_name")
    .limit(100);

  if (error) throw error;

  return data.map(mapItem);
}

export async function searchItems(term: string): Promise<Item[]> {
  const normalized = term.trim();
  if (!normalized) return [];

  const { data, error } = await supabase
    .from("items")
    .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, categories(name)")
    .eq("active", true)
    .or(`item_code.ilike.%${normalized}%,barcode.eq.${normalized},item_name.ilike.%${normalized}%`)
    .limit(30);

  if (error) throw error;

  return data.map(mapItem);
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
