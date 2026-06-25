import { expect, test } from "@playwright/test";

test.describe("auth pages", () => {
  test("register page renders email signup form", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  test("login page renders login form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Log in to Visuala" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");
  });

  test("login page shows callback error", async ({ page }) => {
    await page.goto("/login?error=Invalid%20auth%20callback.");

    await expect(page.getByText("Invalid auth callback.")).toBeVisible();
  });
});
