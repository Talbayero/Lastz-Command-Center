import { expect, type Page } from "@playwright/test";

export function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function hasEnv(...names: string[]) {
  return names.every((name) => env(name).length > 0);
}

export function testIdPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

export async function signIn(page: Page, playerName: string, password: string) {
  await page.goto("/");
  await expect(page.getByTestId("auth-tab-login")).toBeVisible();
  await page.getByTestId("auth-player-name").fill(playerName);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
}
