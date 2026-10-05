# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: video-flow.spec.ts >> video flow >> creates a project with a photo and opens the interview
- Location: e2e/video-flow.spec.ts:84:7

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e6]:
    - generic [ref=e7]:
      - paragraph [ref=e8]: Visuala AI
      - heading "Create product visuals, UGC videos, and fashion campaigns with AI." [level=1] [ref=e9]
      - paragraph [ref=e10]: Premium creative generation workspace for brands, creators, and affiliate teams.
    - generic [ref=e11]:
      - generic [ref=e12]:
        - paragraph [ref=e13]: Welcome back
        - heading "Log in to Visuala" [level=2] [ref=e14]
        - paragraph [ref=e15]: Access your AI creative dashboard.
      - button "Continue with Google" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
        - text: Continue with Google
      - generic [ref=e19]: or
      - generic [ref=e22]:
        - generic [ref=e23]:
          - generic [ref=e24]: Email
          - textbox "Email" [ref=e25]:
            - /placeholder: you@brand.com
            - text: e2e-video@visuala.test
        - generic [ref=e26]:
          - generic [ref=e27]: Password
          - textbox "Password" [active] [ref=e28]:
            - /placeholder: At least 8 characters
            - text: <pilih>
        - button "Log in" [ref=e29] [cursor=pointer]
      - paragraph [ref=e30]:
        - text: No account yet?
        - link "Register" [ref=e31] [cursor=pointer]:
          - /url: /register
  - button "Open Next.js Dev Tools" [ref=e37] [cursor=pointer]:
    - img [ref=e38]
  - alert [ref=e41]
```

# Test source

```ts
  1   | import { expect, test, type Page } from "@playwright/test";
  2   | 
  3   | const email = process.env.PLAYWRIGHT_USER_EMAIL;
  4   | const password = process.env.PLAYWRIGHT_USER_PASSWORD;
  5   | 
  6   | /**
  7   |  * The planning and render half spends a model call and minutes of Chrome capture, so it is opt-in on
  8   |  * top of the credentials rather than part of every run.
  9   |  */
  10  | const runRenderFlow = process.env.PLAYWRIGHT_VIDEO_FLOW === "1";
  11  | 
  12  | /** A real 400x400 PNG: the setup form refuses an image below its 200 px minimum. */
  13  | const PNG_BYTES = Buffer.from(
  14  |   "iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAIAAAAP3aGbAAAACXBIWXMAAAABAAAAAQBPJcTWAAAFNUlEQVR4nO3UQQ0AIBDAsFODDnShHgv8yJImFbDX5uwF" +
  15  |   "kDDfCwAeGRaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhA" +
  16  |   "hmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFY" +
  17  |   "QIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBh" +
  18  |   "WECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQ" +
  19  |   "YVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgW" +
  20  |   "kGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQY" +
  21  |   "FpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVk" +
  22  |   "GBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYF" +
  23  |   "ZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmG" +
  24  |   "BWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZ" +
  25  |   "hgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEB" +
  26  |   "GYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZh" +
  27  |   "ARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECG" +
  28  |   "YQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhA" +
  29  |   "hmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAxgUddAAOeWz8yAAAAABJRU5ErkJggg==",
  30  |   "base64",
  31  | );
  32  | 
  33  | async function logIn(page: Page): Promise<void> {
  34  |   await page.goto("/login");
  35  |   await page.getByLabel("Email").fill(email!);
  36  |   await page.getByLabel("Password").fill(password!);
  37  |   await page.getByRole("button", { name: "Log in" }).click();
> 38  |   await page.waitForURL(/\/dashboard/);
      |              ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  39  | }
  40  | 
  41  | /** The setup form's groups are fieldsets whose legends name them, and each option is a toggle button. */
  42  | async function choose(page: Page, legend: string, option: string): Promise<void> {
  43  |   await page.getByRole("group", { name: legend }).getByRole("button", { name: option }).click();
  44  | }
  45  | 
  46  | async function createProject(page: Page, options: { withPhoto?: boolean } = {}): Promise<string> {
  47  |   await page.goto("/dashboard/videos");
  48  |   await page.getByRole("link", { name: "Buat video" }).first().click();
  49  |   await expect(page).toHaveURL(/\/dashboard\/videos\/new$/);
  50  | 
  51  |   await page.locator("#video-title").fill(`Julumpia ${Date.now()}`);
  52  |   await choose(page, "Tipe video", "Diskon dan promo harga");
  53  |   await choose(page, "Durasi", "12 detik");
  54  |   await choose(page, "Rasio", "9:16");
  55  |   await choose(page, "Resolusi", "1080p");
  56  | 
  57  |   if (options.withPhoto !== false) {
  58  |     await page.locator('input[type="file"]').setInputFiles({ name: "julumpia.png", mimeType: "image/png", buffer: PNG_BYTES });
  59  |   }
  60  |   // The form refuses to submit without this, with or without a photo.
  61  |   await page.getByLabel("Saya memiliki hak untuk menggunakan semua aset yang diunggah.").check();
  62  | 
  63  |   await page.getByRole("button", { name: "Lanjut ke percakapan" }).click();
  64  | 
  65  |   await expect(page).toHaveURL(/\/dashboard\/videos\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  66  |   return page.url().split("/").pop()!;
  67  | }
  68  | 
  69  | test.describe("video flow", () => {
  70  |   test.skip(!email || !password, "PLAYWRIGHT_USER_EMAIL and PLAYWRIGHT_USER_PASSWORD are required");
  71  | 
  72  |   test.beforeEach(async ({ page }) => logIn(page));
  73  | 
  74  |   test("creates a project without a photo, because a composition can carry the video alone", async ({ page }) => {
  75  |     test.setTimeout(180_000);
  76  | 
  77  |     await createProject(page, { withPhoto: false });
  78  | 
  79  |     // The interview opens itself, and nothing is planned until the brief closes.
  80  |     await expect(page.getByRole("log", { name: "Riwayat percakapan" })).toContainText(/\?/, { timeout: 90_000 });
  81  |     await expect(page.getByRole("button", { name: "Susun preview" })).toBeDisabled();
  82  |   });
  83  | 
  84  |   test("creates a project with a photo and opens the interview", async ({ page }) => {
  85  |     // Creating the project, uploading, and the opening question all happen inside this test.
  86  |     test.setTimeout(180_000);
  87  | 
  88  |     await createProject(page);
  89  | 
  90  |     // The workspace opens the interview itself, so the first question arrives without a send.
  91  |     await expect(page.getByRole("log", { name: "Riwayat percakapan" })).toContainText(/\?/, { timeout: 60_000 });
  92  |     // Nothing is planned before the brief is finished, and the panel says so rather than offering a dead control.
  93  |     await expect(page.getByRole("button", { name: "Susun preview" })).toBeDisabled();
  94  |     await expect(page.getByText("Komposisi disusun setelah brief lengkap.")).toBeVisible();
  95  |   });
  96  | 
  97  |   test("plans a preview, approves it, and offers the export for download", async ({ page }) => {
  98  |     test.skip(!runRenderFlow, "Set PLAYWRIGHT_VIDEO_FLOW=1 to spend a plan and a render");
  99  |     // A plan, a preview render, and a delivery render run inside one test, so its budget is generous.
  100 |     test.setTimeout(1_800_000);
  101 | 
  102 |     await createProject(page);
  103 | 
  104 |     // One answer carries every field the discount recipe needs, so the interview has what it takes to close.
  105 |     await page.getByLabel("Pesan Anda").fill(
  106 |       "Julumpia, diskon 20% untuk semua menu, berlaku hari ini. Audiensnya mahasiswa dan pekerja kantor. " +
  107 |         "Tujuannya menambah pesanan. Pesan utamanya diskon 20% untuk semua menu. Ajakan: pesan sekarang.",
  108 |     );
  109 |     await page.getByRole("button", { name: "Kirim" }).click();
  110 | 
  111 |     // The brief is the interview's whole output; the composition pass starts only after it closes.
  112 |     await expect(page.getByRole("button", { name: "Susun preview" })).toBeEnabled({ timeout: 180_000 });
  113 |     await page.getByRole("button", { name: "Susun preview" }).click();
  114 | 
  115 |     // Approval stays disabled until a preview of exactly these bytes has rendered, which is the gate under test.
  116 |     const approve = page.getByRole("button", { name: "Setujui dan render" });
  117 |     await expect(approve).toBeEnabled({ timeout: 600_000 });
  118 |     await expect(page.locator("video")).toBeVisible();
  119 | 
  120 |     await approve.click();
  121 |     // The download control appears only after a final render has succeeded, and it is the point of the test.
  122 |     // Do not wait on the word "Selesai": it is a substring of "Belum ada video yang selesai dirender." too.
  123 |     await expect(page.getByRole("button", { name: "Unduh" }).first()).toBeVisible({ timeout: 900_000 });
  124 |   });
  125 | });
  126 | 
```