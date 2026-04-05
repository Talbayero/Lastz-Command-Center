import { expect, test } from "@playwright/test";

test.describe("Auth flow", () => {
  test("shows the BOM access console for signed-out users", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /bom access console/i })).toBeVisible();
    await expect(page.getByTestId("auth-tab-login")).toBeVisible();
    await expect(page.getByTestId("auth-submit")).toHaveText(/sign in/i);
  });

  test("switches between sign-in and sign-up modes cleanly", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("auth-tab-signup").click();
    await expect(page.getByTestId("auth-confirm-password")).toBeVisible();
    await expect(page.getByTestId("auth-submit")).toHaveText(/create account/i);

    await page.getByTestId("auth-password").fill("TempPass123");
    await page.getByTestId("auth-confirm-password").fill("TempPass123");

    await page.getByTestId("auth-tab-login").click();
    await expect(page.getByTestId("auth-confirm-password")).toHaveCount(0);
    await expect(page.getByTestId("auth-password")).toHaveValue("");
    await expect(page.getByTestId("auth-submit")).toHaveText(/sign in/i);
  });

  test("shows validation feedback for invalid login", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("auth-player-name").fill("NotARealPlayer");
    await page.getByTestId("auth-password").fill("WrongPassword123");
    await page.getByTestId("auth-submit").click();

    await expect(page.getByText(/invalid player name or password/i)).toBeVisible();
  });
});
