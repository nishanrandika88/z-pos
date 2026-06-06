import { supabase } from "@/shared/lib/supabase";
import { relationName } from "@/shared/lib/supabase-relations";
import { compressImage } from "@/shared/lib/image-compression";
import type { Category, Item } from "@/domain/catalog/types";

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
  categories: { name?: string } | { name?: string }[] | null;
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

function mapCategory(row: {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}): Category {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, active, created_at, updated_at")
    .order("name");
  if (error) throw error;

  return data.map(mapCategory);
}

export async function createCategory(input: { branchId: string; name: string; active?: boolean }): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert({
      branch_id: input.branchId,
      name: input.name.trim(),
      active: input.active ?? true,
    })
    .select("id, name, active, created_at, updated_at")
    .single();

  if (error) throw error;

  return mapCategory(data);
}

export async function updateCategory(input: UpdateCategoryInput): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .update({
      name: input.name.trim(),
      active: input.active,
    })
    .eq("id", input.id)
    .select("id, name, active, created_at, updated_at")
    .single();

  if (error) throw error;

  return mapCategory(data);
}

export async function deactivateCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ active: false })
    .eq("id", id);

  if (error) throw error;
}

function mapItem(row: ItemRow): Item {
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

export async function listItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, categories(name)")
    .order("item_name");
  if (error) throw error;

  return data.map(mapItem);
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  const { data, error } = await supabase
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
    .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, categories(name)")
    .single();

  if (error) throw error;

  return mapItem(data);
}

export async function updateItem(input: UpdateItemInput): Promise<Item> {
  const { data, error } = await supabase
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
    .select("id, item_code, barcode, item_name, description, image_url, selling_price, category_id, availability, active, categories(name)")
    .single();

  if (error) throw error;

  return mapItem(data);
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
