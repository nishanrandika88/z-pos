import { z } from "zod";

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());

const envSchema = z.object({
  VITE_SUPABASE_URL: optionalUrl,
  VITE_SUPABASE_ANON_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  VITE_SENTRY_DSN: optionalUrl,
  VITE_APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
});

export const env = envSchema.parse(import.meta.env);
