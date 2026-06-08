import { supabase } from "@/shared/lib/supabase";
import type { Discount } from "@/domain/catalog/types";

interface DiscountRow {
  id: string;
  name: string;
  percentage: number | string;
  applicable_type: "ITEM" | "CATEGORY";
  applicable_id: string;
  active: boolean;
}

export interface SaveDiscountInput {
  branchId: string;
  name: string;
  percentage: number;
  applicableType: "ITEM" | "CATEGORY";
  applicableId: string;
  active: boolean;
}

export interface UpdateDiscountInput extends Omit<SaveDiscountInput, "branchId"> {
  id: string;
}

function mapDiscount(row: DiscountRow): Discount {
  return {
    id: row.id,
    name: row.name,
    percentage: Number(row.percentage),
    applicableType: row.applicable_type,
    applicableId: row.applicable_id,
    active: row.active,
  };
}

export async function listDiscounts(): Promise<Discount[]> {
  const { data, error } = await supabase
    .from("discounts")
    .select("id, name, percentage, applicable_type, applicable_id, active")
    .order("active", { ascending: false })
    .order("name");

  if (error) throw error;
  return data.map(mapDiscount);
}

export async function createDiscount(input: SaveDiscountInput): Promise<Discount> {
  const { data, error } = await supabase
    .from("discounts")
    .insert({
      branch_id: input.branchId,
      name: input.name.trim(),
      percentage: input.percentage,
      applicable_type: input.applicableType,
      applicable_id: input.applicableId,
      active: input.active,
    })
    .select("id, name, percentage, applicable_type, applicable_id, active")
    .single();

  if (error) throw error;
  return mapDiscount(data);
}

export async function updateDiscount(input: UpdateDiscountInput): Promise<Discount> {
  const { data, error } = await supabase
    .from("discounts")
    .update({
      name: input.name.trim(),
      percentage: input.percentage,
      applicable_type: input.applicableType,
      applicable_id: input.applicableId,
      active: input.active,
    })
    .eq("id", input.id)
    .select("id, name, percentage, applicable_type, applicable_id, active")
    .single();

  if (error) throw error;
  return mapDiscount(data);
}

export async function deactivateDiscount(id: string): Promise<void> {
  const { error } = await supabase
    .from("discounts")
    .update({ active: false })
    .eq("id", id);

  if (error) throw error;
}
