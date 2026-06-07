import { z } from "zod";

export const discountSchema = z.object({
  name: z.string().min(2).max(80),
  percentage: z.number().min(0.01).max(100),
  applicableType: z.enum(["ITEM", "CATEGORY"]),
  applicableId: z.string().uuid(),
  active: z.boolean().default(true),
});

export type DiscountForm = z.infer<typeof discountSchema>;
