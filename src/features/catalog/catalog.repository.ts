import { supabase } from "@/shared/lib/supabase";
import { relationName } from "@/shared/lib/supabase-relations";
import { compressImage } from "@/shared/lib/image-compression";
import type { Category, Item } from "@/domain/catalog/types";

interface CategoryRow {
  id: string;
  name: string;
  active: boolean;
  display_order?: number | null;
  created_at: string;
  updated_at: string;
}

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

export interface CreateItemInput {
  branchId: string;
  categoryId: string;
  itemCode: string;
  barcode?: string;
  itemName: string;
  description?: string;
  imageUrl?: string;
  sellingPrice: number;
}

export interface UpdateCategoryInput {
  id: string;
  name: string;
  active: boolean;
}

export interface ReorderInput {
  orderedIds: string[];
}

export interface UpdateItemInput {
  id: string;
  categoryId: string;
  itemCode: string;
  barcode?: string;
  itemName: string;
  description?: string;
  imageUrl?: string;
  sellingPrice: number;
  availability: boolean;
  active: boolean;
}

export interface UploadItemImageInput {
  branchId: string;
  file: File;
}

function mapCategory(row: CategoryRow, index = 0): Category {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    displayOrder: Number(row.display_order ?? index + 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCategories(): Promise<Category[]> {
  const result = await supabase
    .from("categories")
    .select("id, name, active, display_order, created_at, updated_at")
    .order("display_order")
    .order("name");
  let data = result.data as CategoryRow[] | null;
  let error = result.error;
  if (isMissingDisplayOrderError(error)) {
    const fallback = await supabase
      .from("categories")
      .select("id, name, active, created_at, updated_at")
      .order("name");
    data = (fallback.data?.map((row, index) => ({ ...row, display_order: index + 1 })) ?? null) as CategoryRow[] | null;
    error = fallback.error;
  }
  if (error) throw error;

  return sortCategories((data ?? []).map(mapCategory));
}

export async function createCategory(input: { branchId: string; name: string; active?: boolean }): Promise<Category> {
  const displayOrder = await nextDisplayOrder("categories", input.branchId);
  const result = await supabase
    .from("categories")
    .insert({
      branch_id: input.branchId,
      name: input.name.trim(),
      active: input.active ?? true,
      display_order: displayOrder,
    })
    .select("id, name, active, display_order, created_at, updated_at")
    .single();
  let data = result.data as CategoryRow | null;
  let error = result.error;

  if (isMissingDisplayOrderError(error)) {
    const fallback = await supabase
      .from("categories")
      .insert({
        branch_id: input.branchId,
        name: input.name.trim(),
        active: input.active ?? true,
      })
      .select("id, name, active, created_at, updated_at")
      .single();
    data = (fallback.data ? { ...fallback.data, display_order: displayOrder } : null) as CategoryRow | null;
    error = fallback.error;
  }
  if (error) throw error;
  if (!data) throw new Error("Could not create category.");

  return mapCategory(data);
}

export async function updateCategory(input: UpdateCategoryInput): Promise<Category> {
  const result = await supabase
    .from("categories")
    .update({
      name: input.name.trim(),
      active: input.active,
    })
    .eq("id", input.id)
    .select("id, name, active, display_order, created_at, updated_at")
    .single();
  let data = result.data as CategoryRow | null;
  let error = result.error;

  if (isMissingDisplayOrderError(error)) {
    const fallback = await supabase
      .from("categories")
      .update({
        name: input.name.trim(),
        active: input.active,
      })
      .eq("id", input.id)
      .select("id, name, active, created_at, updated_at")
      .single();
    data = (fallback.data ? { ...fallback.data, display_order: 0 } : null) as CategoryRow | null;
    error = fallback.error;
  }
  if (error) throw error;
  if (!data) throw new Error("Could not update category.");

  return mapCategory(data);
}

export async function reorderCategories(input: ReorderInput): Promise<void> {
  await saveDisplayOrder("categories", input.orderedIds);
}

export async function deactivateCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ active: false })
    .eq("id", id);

  if (error) throw error;
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

export async function listItems(): Promise<Item[]> {
  const result = await supabase
    .from("items")
    .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, display_order, categories(name, active, display_order)")
    .order("category_id")
    .order("display_order")
    .order("item_name");
  let data = result.data as ItemRow[] | null;
  let error = result.error;
  if (isMissingDisplayOrderError(error)) {
    const fallback = await supabase
      .from("items")
      .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, categories(name, active)")
      .order("item_name");
    data = (fallback.data?.map((row, index) => ({ ...row, display_order: index + 1 })) ?? null) as ItemRow[] | null;
    error = fallback.error;
  }
  if (error) throw error;

  return sortItems((data ?? []).map(mapItem));
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  const displayOrder = await nextDisplayOrder("items", input.branchId, input.categoryId);
  const result = await supabase
    .from("items")
    .insert({
      branch_id: input.branchId,
      category_id: input.categoryId,
      item_code: input.itemCode.trim(),
      barcode: input.barcode?.trim() || null,
      item_name: input.itemName.trim(),
      description: input.description?.trim() || null,
      image_url: input.imageUrl?.trim() || null,
      selling_price: input.sellingPrice,
      availability: true,
      active: true,
      display_order: displayOrder,
    })
    .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, display_order, categories(name, active, display_order)")
    .single();
  let data = result.data as ItemRow | null;
  let error = result.error;

  if (isMissingDisplayOrderError(error)) {
    const fallback = await supabase
      .from("items")
      .insert({
        branch_id: input.branchId,
        category_id: input.categoryId,
        item_code: input.itemCode.trim(),
        barcode: input.barcode?.trim() || null,
        item_name: input.itemName.trim(),
        description: input.description?.trim() || null,
        image_url: input.imageUrl?.trim() || null,
        selling_price: input.sellingPrice,
        availability: true,
        active: true,
      })
      .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, categories(name, active)")
      .single();
    data = (fallback.data ? { ...fallback.data, display_order: displayOrder } : null) as ItemRow | null;
    error = fallback.error;
  }
  if (error) throw error;
  if (!data) throw new Error("Could not create item.");

  return mapItem(data);
}

export async function updateItem(input: UpdateItemInput): Promise<Item> {
  const result = await supabase
    .from("items")
    .update({
      category_id: input.categoryId,
      item_code: input.itemCode.trim(),
      barcode: input.barcode?.trim() || null,
      item_name: input.itemName.trim(),
      description: input.description?.trim() || null,
      image_url: input.imageUrl?.trim() || null,
      selling_price: input.sellingPrice,
      availability: input.availability,
      active: input.active,
    })
    .eq("id", input.id)
    .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, display_order, categories(name, active, display_order)")
    .single();
  let data = result.data as ItemRow | null;
  let error = result.error;

  if (isMissingDisplayOrderError(error)) {
    const fallback = await supabase
      .from("items")
      .update({
        category_id: input.categoryId,
        item_code: input.itemCode.trim(),
        barcode: input.barcode?.trim() || null,
        item_name: input.itemName.trim(),
        description: input.description?.trim() || null,
        image_url: input.imageUrl?.trim() || null,
        selling_price: input.sellingPrice,
        availability: input.availability,
        active: input.active,
      })
      .eq("id", input.id)
      .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, categories(name, active)")
      .single();
    data = (fallback.data ? { ...fallback.data, display_order: 0 } : null) as ItemRow | null;
    error = fallback.error;
  }
  if (error) throw error;
  if (!data) throw new Error("Could not update item.");

  return mapItem(data);
}

export async function reorderItems(input: ReorderInput): Promise<void> {
  await saveDisplayOrder("items", input.orderedIds);
}

export async function deactivateItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("items")
    .update({ active: false, availability: false })
    .eq("id", id);

  if (error) throw error;
}

export async function uploadItemImage(input: UploadItemImageInput): Promise<string> {
  const compressedImage = await compressImage(input.file);
  const objectPath = `${input.branchId}/${crypto.randomUUID()}-${compressedImage.fileName}`;

  const { error } = await supabase.storage
    .from("item-images")
    .upload(objectPath, compressedImage.blob, {
      cacheControl: "31536000",
      contentType: compressedImage.contentType,
      upsert: false,
    });

  if (error) {
    if (error.message.toLowerCase().includes("bucket not found")) {
      throw new Error("Storage bucket 'item-images' was not found. Run the Supabase Storage bucket SQL before uploading images.");
    }

    throw error;
  }

  const { data } = supabase.storage.from("item-images").getPublicUrl(objectPath);
  return data.publicUrl;
}

function sortCategories(categories: Category[]) {
  return [...categories].sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
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

async function nextDisplayOrder(table: "categories" | "items", branchId: string, categoryId?: string) {
  let query = supabase.from(table).select("display_order").eq("branch_id", branchId);
  if (table === "items" && categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query.order("display_order", { ascending: false }).limit(1).maybeSingle();
  if (isMissingDisplayOrderError(error)) return 1;
  if (error) throw error;

  return Number(data?.display_order ?? 0) + 1;
}

async function saveDisplayOrder(table: "categories" | "items", orderedIds: string[]) {
  const updates = orderedIds.map((id, index) =>
    supabase
      .from(table)
      .update({ display_order: index + 1 })
      .eq("id", id),
  );
  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;
  if (isMissingDisplayOrderError(error ?? null)) return;
  if (error) throw error;
}

function isMissingDisplayOrderError(error: { message?: string } | null) {
  return Boolean(error?.message?.toLowerCase().includes("display_order"));
}
