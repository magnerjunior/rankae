import { z } from "zod";

export const WHATSAPP_NUMBER = "5531995284698";

export const commercialPlanSchema = z.object({
  monthlyPriceCents: z.number().int().positive(),
  compareAtPriceCents: z.number().int().positive().nullable(),
  extraRankaPriceCents: z.number().int().positive(),
  annualPriceCents: z.number().int().positive().nullable(),
  trialDays: z.number().int().min(0).max(90),
  active: z.boolean(),
});

export type CommercialPlan = z.infer<typeof commercialPlanSchema>;

export const DEFAULT_COMMERCIAL_PLAN: CommercialPlan = {
  monthlyPriceCents: 2990,
  compareAtPriceCents: 4990,
  extraRankaPriceCents: 1500,
  annualPriceCents: 29900,
  trialDays: 30,
  active: true,
};

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function whatsappLink(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function trialMessage() {
  return "Olá! Quero solicitar meu teste grátis do Rankaê.";
}

export const EXTRA_RANKA_MESSAGE = "Olá! Quero contratar um ranka adicional no Rankaê para minha conta.";
