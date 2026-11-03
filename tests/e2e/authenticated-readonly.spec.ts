import { expect, test } from "@playwright/test";

const email = process.env.E2E_ORGANIZER_EMAIL;
const password = process.env.E2E_ORGANIZER_PASSWORD;
const rankaId = process.env.E2E_RANKA_ID;

test("organizador autenticado abre o hub sem mutar dados", async ({ page }) => {
  test.skip(!email || !password || !rankaId, "Requer credenciais fictícias de staging e migrations aplicadas.");
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.goto(`/app/rankas/${rankaId}/jogo`);
  await expect(page.getByRole("navigation", { name: "Etapas do jogo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "1. Chegada" })).toBeVisible();
  await expect(page.getByRole("link", { name: "2. Times" })).toBeVisible();
  await expect(page.getByRole("link", { name: "3. Partida" })).toBeVisible();
});
