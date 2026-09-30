import { expect, test, type Page } from "@playwright/test";

const email = process.env.PLAYWRIGHT_USER_EMAIL;
const password = process.env.PLAYWRIGHT_USER_PASSWORD;

/**
 * The planning and render half spends a model call and minutes of Chrome capture, so it is opt-in on
 * top of the credentials rather than part of every run.
 */
const runRenderFlow = process.env.PLAYWRIGHT_VIDEO_FLOW === "1";

/** A real 400x400 PNG: the setup form refuses an image below its 200 px minimum. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAIAAAAP3aGbAAAACXBIWXMAAAABAAAAAQBPJcTWAAAFNUlEQVR4nO3UQQ0AIBDAsFODDnShHgv8yJImFbDX5uwF" +
  "kDDfCwAeGRaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhA" +
  "hmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFY" +
  "QIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBh" +
  "WECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQ" +
  "YVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgW" +
  "kGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQY" +
  "FpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVk" +
  "GBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYF" +
  "ZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmG" +
  "BWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZ" +
  "hgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEB" +
  "GYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZh" +
  "ARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECG" +
  "YQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhA" +
  "hmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAxgUddAAOeWz8yAAAAABJRU5ErkJggg==",
  "base64",
);

async function logIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard/);
}

/** The setup form's groups are fieldsets whose legends name them, and each option is a toggle button. */
async function choose(page: Page, legend: string, option: string): Promise<void> {
  await page.getByRole("group", { name: legend }).getByRole("button", { name: option }).click();
}

async function createProject(page: Page, options: { withPhoto?: boolean } = {}): Promise<string> {
  await page.goto("/dashboard/videos");
  await page.getByRole("link", { name: "Buat video" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/videos\/new$/);

  await page.locator("#video-title").fill(`Julumpia ${Date.now()}`);
  await choose(page, "Tipe video", "Diskon dan promo harga");
  await choose(page, "Durasi", "12 detik");
  await choose(page, "Rasio", "9:16");
  await choose(page, "Resolusi", "1080p");

  if (options.withPhoto !== false) {
    await page.locator('input[type="file"]').setInputFiles({ name: "julumpia.png", mimeType: "image/png", buffer: PNG_BYTES });
  }
  // The form refuses to submit without this, with or without a photo.
  await page.getByLabel("Saya memiliki hak untuk menggunakan semua aset yang diunggah.").check();

  await page.getByRole("button", { name: "Lanjut ke percakapan" }).click();

  await expect(page).toHaveURL(/\/dashboard\/videos\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  return page.url().split("/").pop()!;
}

test.describe("video flow", () => {
  test.skip(!email || !password, "PLAYWRIGHT_USER_EMAIL and PLAYWRIGHT_USER_PASSWORD are required");

  test.beforeEach(async ({ page }) => logIn(page));

  test("creates a project without a photo, because a composition can carry the video alone", async ({ page }) => {
    test.setTimeout(180_000);

    await createProject(page, { withPhoto: false });

    // The interview opens itself, and nothing is planned until the brief closes.
    await expect(page.getByRole("log", { name: "Riwayat percakapan" })).toContainText(/\?/, { timeout: 90_000 });
    await expect(page.getByRole("button", { name: "Susun preview" })).toBeDisabled();
  });

  test("creates a project with a photo and opens the interview", async ({ page }) => {
    // Creating the project, uploading, and the opening question all happen inside this test.
    test.setTimeout(180_000);

    await createProject(page);

    // The workspace opens the interview itself, so the first question arrives without a send.
    await expect(page.getByRole("log", { name: "Riwayat percakapan" })).toContainText(/\?/, { timeout: 60_000 });
    // Nothing is planned before the brief is finished, and the panel says so rather than offering a dead control.
    await expect(page.getByRole("button", { name: "Susun preview" })).toBeDisabled();
    await expect(page.getByText("Komposisi disusun setelah brief lengkap.")).toBeVisible();
  });

  test("plans a preview, approves it, and offers the export for download", async ({ page }) => {
    test.skip(!runRenderFlow, "Set PLAYWRIGHT_VIDEO_FLOW=1 to spend a plan and a render");
    // A plan, a preview render, and a delivery render run inside one test, so its budget is generous.
    test.setTimeout(1_800_000);

    await createProject(page);

    // One answer carries every field the discount recipe needs, so the interview has what it takes to close.
    await page.getByLabel("Pesan Anda").fill(
      "Julumpia, diskon 20% untuk semua menu, berlaku hari ini. Audiensnya mahasiswa dan pekerja kantor. " +
        "Tujuannya menambah pesanan. Pesan utamanya diskon 20% untuk semua menu. Ajakan: pesan sekarang.",
    );
    await page.getByRole("button", { name: "Kirim" }).click();

    // The brief is the interview's whole output; the composition pass starts only after it closes.
    await expect(page.getByRole("button", { name: "Susun preview" })).toBeEnabled({ timeout: 180_000 });
    await page.getByRole("button", { name: "Susun preview" }).click();

    // Approval stays disabled until a preview of exactly these bytes has rendered, which is the gate under test.
    const approve = page.getByRole("button", { name: "Setujui dan render" });
    await expect(approve).toBeEnabled({ timeout: 600_000 });
    await expect(page.locator("video")).toBeVisible();

    await approve.click();
    await expect(page.getByText("Selesai")).toBeVisible({ timeout: 900_000 });
    await expect(page.getByRole("button", { name: "Unduh" }).first()).toBeVisible();
  });
});
