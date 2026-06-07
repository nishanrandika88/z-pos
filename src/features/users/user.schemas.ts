import { z } from "zod";
import { passwordSchema } from "@/features/auth/auth.schemas";

export const userSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.enum(["ADMIN", "CASHIER"]),
  active: z.boolean().default(true),
});

export const createUserSchema = userSchema.extend({
  password: passwordSchema,
});

export type UserForm = z.infer<typeof userSchema>;
export type CreateUserForm = z.infer<typeof createUserSchema>;
