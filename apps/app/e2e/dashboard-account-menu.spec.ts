import { expect, test } from "@playwright/test";

const email = process.env.PLAYWRIGHT_USER_EMAIL;
const password = process.env.PLAYWRIGHT_USER_PASSWORD;

test.describe("dashboard account menu", () => {
  test.skip(!email || !password, "PLAYWRIGHT_USER_EMAIL and PLAYWRIGHT_USER_PASSWORD are required");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/dashboard/);
  });

  test("shows credit balance above profile", async ({ page }) => {
    const creditBalance = page.getByRole("link", { name: /Credit balance .+ credits/i });

    await expect(creditBalance).toHaveAttribute("href", "/billing/plans");
  });

  test("opens from profile and exposes account actions", async ({ page }) => {
    const trigger = page.getByRole("button", { name: /account menu/i });

    await expect(page.getByRole("navigation", { name: "Dashboard navigation" }).getByText("Logout")).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("account-actions")).toBeVisible();
    await expect(page.getByRole("link", { name: "Profile Settings" })).toHaveAttribute("href", "/dashboard/profile");
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("account-actions")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("closes after second trigger click", async ({ page }) => {
    const trigger = page.getByRole("button", { name: /account menu/i });

    await trigger.click();
    await trigger.click();

    await expect(page.getByTestId("account-actions")).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("closes after outside click", async ({ page }) => {
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("main").click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId("account-actions")).toHaveCount(0);
  });

  test("closes and navigates after selecting Profile Settings", async ({ page }) => {
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("link", { name: "Profile Settings" }).click();

    await expect(page).toHaveURL(/\/dashboard\/profile$/);
    await expect(page.getByTestId("account-actions")).toHaveCount(0);
  });

  test("logs out through the account menu", async ({ page }) => {
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("button", { name: "Logout" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  });

  test("opens while collapsed without expanding the sidebar", async ({ page }) => {
    const sidebar = page.getByRole("complementary", { name: "Dashboard menu" });

    await page.getByRole("button", { name: "Collapse dashboard menu" }).click();

    let previousWidth: number | null = null;
    let stableChecks = 0;
    await expect.poll(async () => {
      const width = (await sidebar.boundingBox())?.width ?? null;
      stableChecks = width !== null && width === previousWidth ? stableChecks + 1 : 0;
      previousWidth = width;
      return stableChecks;
    }).toBeGreaterThanOrEqual(2);

    const collapsedBox = await sidebar.boundingBox();
    expect(collapsedBox).not.toBeNull();
    const collapsedWidth = collapsedBox!.width;

    await page.getByRole("button", { name: /account menu/i }).click();

    await expect(page.getByTestId("account-actions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Expand dashboard menu" })).toBeVisible();
    await expect.poll(async () => (await sidebar.boundingBox())?.width ?? null).toBe(collapsedWidth);
  });
});
