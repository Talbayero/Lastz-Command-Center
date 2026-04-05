import { expect, test } from "@playwright/test";
import { env, hasEnv, signIn, testIdPart } from "./helpers";

test.describe("Protected account and admin journeys", () => {
  test("locks temporary-password users into the password gate", async ({ page }) => {
    test.skip(
      !hasEnv("E2E_TEMP_USERNAME", "E2E_TEMP_PASSWORD"),
      "Set E2E_TEMP_USERNAME and E2E_TEMP_PASSWORD to run the forced-password-change journey."
    );

    await signIn(page, env("E2E_TEMP_USERNAME"), env("E2E_TEMP_PASSWORD"));

    await expect(page.getByText(/password update required/i)).toBeVisible();
    await expect(page.getByTestId("account-panel-dialog")).toBeVisible();
    await expect(page.getByTestId("account-force-password-note")).toBeVisible();
    await expect(page.getByTestId("account-close-button")).toHaveCount(0);

    await page.goto("/?view=recruitment");
    await expect(page.getByText(/password update required/i)).toBeVisible();
    await expect(page.getByTestId("account-panel-dialog")).toBeVisible();
  });

  test("admin reset and delete flows enforce guardrails before mutation", async ({ page }) => {
    test.skip(
      !hasEnv("E2E_ADMIN_USERNAME", "E2E_ADMIN_PASSWORD", "E2E_ADMIN_TARGET_USER"),
      "Set E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD, and E2E_ADMIN_TARGET_USER to run admin journey coverage."
    );

    const targetUser = env("E2E_ADMIN_TARGET_USER");
    const targetTestId = testIdPart(targetUser);

    await signIn(page, env("E2E_ADMIN_USERNAME"), env("E2E_ADMIN_PASSWORD"));
    await expect(page.getByTestId("account-open-button")).toBeVisible();

    await page.goto("/?view=admin");
    await page.getByTestId("admin-user-search").fill(targetUser);

    const row = page.getByTestId(`admin-user-row-${targetTestId}`);
    await expect(row).toBeVisible();

    await page.getByTestId(`admin-temp-password-${targetTestId}`).fill("short");
    await page.getByTestId(`admin-reset-user-${targetTestId}`).click();
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();

    let dialogMessage = "";
    page.once("dialog", async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.dismiss();
    });

    await page.getByTestId(`admin-delete-user-${targetTestId}`).click();
    await expect
      .poll(() => dialogMessage, { message: "Expected delete confirmation dialog to appear." })
      .toContain(targetUser);
    await expect(row).toBeVisible();
  });
});

test.describe("Recruitment mutation flow", () => {
  test("imports, edits, and deletes a migration candidate via CSV", async ({ page }) => {
    test.skip(
      !hasEnv("E2E_ADMIN_USERNAME", "E2E_ADMIN_PASSWORD") || env("E2E_ALLOW_MUTATIONS") !== "true",
      "Set E2E_ADMIN_USERNAME/E2E_ADMIN_PASSWORD and E2E_ALLOW_MUTATIONS=true to run the recruitment mutation journey."
    );

    const uniqueName = `E2E MIG ${Date.now()}`;
    const rowTestId = testIdPart(uniqueName);
    const updatedNotes = `Updated note ${Date.now()}`;
    const csv = [
      "player_name,original_server,original_alliance,status,contact_status,category,reason_for_leaving,tech_power,hero_power,troop_power,mod_vehicle_power,structure_power,march_1_power,march_2_power,march_3_power,march_4_power,kills,notes",
      `"${uniqueName}",123,QA,Scouted,Not Contacted,Regular,Initial import,12000000,24000000,36000000,4800000,60000000,0,0,0,0,7000000,Imported by Playwright`,
    ].join("\n");

    await signIn(page, env("E2E_ADMIN_USERNAME"), env("E2E_ADMIN_PASSWORD"));
    await expect(page.getByTestId("account-open-button")).toBeVisible();

    await page.goto("/?view=recruitment");
    await page.getByTestId("recruitment-tab-migrations").click();
    await page.getByTestId("recruitment-csv-upload-migrations").setInputFiles({
      name: "migration-e2e.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    await expect(page.getByText(/migration import complete/i)).toBeVisible();
    await page.getByTestId("recruitment-search-migrations").fill(uniqueName);
    await expect(page.getByTestId(`recruitment-row-migrations-${rowTestId}`)).toBeVisible();

    await page.getByTestId(`recruitment-edit-migrations-${rowTestId}`).click();
    await expect(page.getByText(new RegExp(`Inline editing: ${uniqueName}`))).toBeVisible();
    await page.getByTestId("recruitment-migration-notes").first().fill(updatedNotes);
    await page.getByTestId("recruitment-save-record-migrations").click();

    await expect(page.getByText(/migration candidate saved/i)).toBeVisible();
    await expect(page.getByText(new RegExp(`Notes: ${updatedNotes}`))).toBeVisible();

    await page.getByTestId(`recruitment-delete-migrations-${rowTestId}`).click();
    await expect(page.getByText(/migration candidate removed/i)).toBeVisible();
    await expect(page.getByTestId(`recruitment-row-migrations-${rowTestId}`)).toHaveCount(0);
  });
});
