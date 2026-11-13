import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport + 1);
}

test("página pública e acesso do organizador carregam sem vazamento lateral", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Seu futebol.*no ritmo do jogo/i })).toBeVisible();
  await expect(page).toHaveTitle("Rankaê | App para organizar peladas e futebol amador");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/);
  await expect(page.locator("#recursos .match-preview")).toBeVisible();
  await expect(page.locator(".marketing-hero .match-preview")).toHaveCount(0);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Rankaê | App para organizar peladas e futebol amador");
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText("R$ 29,90")).toBeVisible();
  const trialLink = page.getByRole("link", { name: "Testar grátis" }).first();
  await expect(trialLink).toHaveAttribute("href", /wa\.me\/5531995284698/);
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect.poll(() => page.locator(".marketing-header").evaluate((header) => Math.round(header.getBoundingClientRect().top))).toBeLessThan(20);

  await page.getByRole("link", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Acesso do organizador" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("ranka real exige autenticação", async ({ page }) => {
  await page.goto("/app/rankas/00000000-0000-0000-0000-000000000001");
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByRole("heading", { name: "Acesso do organizador" })).toBeVisible();
});

test("PWA expõe manifesto e página offline sem conteúdo privado", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.name).toContain("Rankaê");
  expect(manifest.start_url).toBe("/");

  await page.goto("/offline");
  await expect(page.getByText("Sem conexão", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/contribui|pagamento|jogador/i);
});

test("fluxo demonstrativo registra e corrige gol mesmo durante perda de rede", async ({ page, context }) => {
  await page.goto("/entrar");
  await page.getByRole("link", { name: "Abrir demonstração local" }).click();
  await expect(page).toHaveURL(/\/app\/rankas\/demo$/, { timeout: 15_000 });

  await page.goto("/app/rankas/demo/partida");
  const scores = page.locator(".score-number");
  await expect(scores.first()).toHaveText("0");

  await context.setOffline(true);
  await page.getByRole("button", { name: "+ GOL" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Salvar evento demo" }).click();
  await expect(scores.first()).toHaveText("1");
  await context.setOffline(false);

  await page.getByRole("button", { name: "Corrigir último gol" }).click();
  await expect(scores.first()).toHaveText("0");
  await expectNoHorizontalOverflow(page);
});

test("navegação móvel mantém atalhos e menu acessíveis", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Cenário específico do viewport móvel.");
  await page.goto("/app/rankas/demo/times");
  await expect(page.getByRole("navigation", { name: "Atalhos do ranka" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu do ranka" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contribuições" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
