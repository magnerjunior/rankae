import { describe, expect, it } from "vitest";
import { formatCurrency, trialMessage, whatsappLink } from "@/lib/commercial";

describe("commercial helpers", () => {
  it("formats Brazilian prices without floating point leakage", () => {
    expect(formatCurrency(2990)).toBe("R$ 29,90");
    expect(formatCurrency(1500)).toBe("R$ 15,00");
  });

  it("builds an encoded WhatsApp trial request", () => {
    const link = whatsappLink(trialMessage());
    expect(link).toContain("https://wa.me/5531995284698?text=");
    expect(decodeURIComponent(link)).toContain("teste grátis do Rankaê");
    expect(decodeURIComponent(link)).not.toContain("30 dias");
  });
});
