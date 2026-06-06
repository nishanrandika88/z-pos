import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().min(2).max(80),
  active: z.boolean().default(true),
});

export const itemSchema = z.object({
  itemCode: z.string().min(2).max(40),
  barcode: z.string().max(80).optional(),
  itemName: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  sellingPrice: z.number().positive(),
  categoryId: z.string().uuid(),
  availability: z.boolean().default(true),
  active: z.boolean().default(true),
});

export type CategoryForm = z.infer<typeof categorySchema>;
export type ItemForm = z.infer<typeof itemSchema>;
