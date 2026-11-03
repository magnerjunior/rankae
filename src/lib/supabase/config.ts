import { z } from "zod";

const publicConfigSchema = z.object({
  url: z.string().url(),
  publishableKey: z.string().min(20),
});

export function hasSupabaseConfig(): boolean {
  return publicConfigSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }).success;
}

export function getSupabaseConfig() {
  return publicConfigSchema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function isDemoEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_ENABLE_DEMO === "true";
}
