import { z } from "zod";
import { passwordSchema } from "@/features/auth/auth.schemas";

export const userSchema = z.object({
  fullName: z.string().min(2).max(120),
  displayName: z.string().max(40).optional(),
  email: z.string().email(),
  role: z.enum(["ADMIN", "CASHIER"]),
  active: z.boolean().default(true),
});

export const createUserSchema = userSchema.extend({
  id: z.string().uuid(),
  password: passwordSchema,
});

export type UserForm = z.infer<typeof userSchema>;
export type CreateUserForm = z.infer<typeof createUserSchema>;
