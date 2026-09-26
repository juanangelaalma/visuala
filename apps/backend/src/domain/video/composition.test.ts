import { describe, expect, it } from "vitest";
import { buildComposition } from "./composition";
import { manifestFixture, manifestSceneFixture } from "./render-manifest.test-helpers";
import { frameDimensions, VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS_SECONDS, VIDEO_RESOLUTIONS, VIDEO_STYLE_IDS } from "./settings";
import { escapeHtml } from "./templates/escape-html";
import { RENDER_TEMPLATES } from "./templates/registry";

describe("buildComposition", () => {
  it("produces byte-identical files for the same manifest", () => {
    const manifest = manifestFixture();
    expect(buildComposition(manifest).files).toEqual(buildComposition(manifest).files);
  });

  it("emits nothing that would be fetched at render time", () => {
    const { files } = buildComposition(manifestFixture());
    for (const file of files) {
      expect(file.contents).not.toMatch(/https?:\/\//);
      expect(file.contents).not.toMatch(/src="\/\//);
    }
  });

  it("escapes on-screen copy instead of emitting it as markup", () => {
    const { files } = buildComposition(manifestFixture({
      scenes: [{ ...manifestSceneFixture(), onScreenTitle: '<script>alert(1)</script>' }],
    }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("keeps user text out of the emitted JavaScript", () => {
    const { files } = buildComposition(manifestFixture({
      scenes: [{ ...manifestSceneFixture(), onScreenTitle: '"); alert(1); //' }],
    }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    const script = html.slice(html.indexOf("<script>"));
    expect(script).not.toContain("alert(1)");
  });

  it("stages every scene with the timing the storyboard froze", () => {
    const { files } = buildComposition(manifestFixture());
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).toMatch(/data-composition-id="main"/);
    expect(html).toMatch(/data-width="1080"/);
    expect(html).toMatch(/data-height="1920"/);
    expect(html).toMatch(/data-duration="10"/);
    expect(html).toMatch(/class="scene clip" data-start="0" data-duration="4" data-track-index="0"/);
    expect(html).toMatch(/window\.__timelines\["main"\] = tl/);
  });

  it("keeps a frozen product-spotlight manifest on the legacy layout for clean_product", () => {
    const { files } = buildComposition(manifestFixture({
      templateId: "product-spotlight",
      templateVersion: "1.0.0",
      styleId: "clean_product",
    }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    const css = files.find((file) => file.path === "styles.css")?.contents ?? "";
    expect(html).toContain('class="copy center"');
    expect(css).toContain(".scene-image { position: absolute; inset: 0;");
    expect(html).not.toContain('class="editorial-media"');
  });

  it("resolves the template the manifest froze, not the one the video type would select", () => {
    // `product_promo` would select `product-spotlight`; the frozen id must win, which is what makes a
    // registry edit unable to change what an already-queued job renders. The template shows in the
    // markup and the style pack shows in the stylesheet, so each is asserted against the file it
    // actually lands in.
    const { files } = buildComposition(manifestFixture({ templateId: "offer-board", styleId: "premium_dark" }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    const css = files.find((file) => file.path === "styles.css")?.contents ?? "";
    expect(html).toContain('class="plate"');
    expect(css).toContain("#171717");
  });

  it.each(["editorial-split", "gallery-reveal"])("builds registered pilot %s", (templateId) => {
    const manifest = manifestFixture({ templateId, templateVersion: "1.0.0" });
    const first = buildComposition(manifest);
    expect(first.files).toEqual(buildComposition(manifest).files);
    const html = first.files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain("gsap.timeline({ paused: true })");
    expect(html).toContain('window.__timelines["main"]');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it.each([
    ["16:9", 1920, 1080, ".editorial-media { position: absolute; top: 0; bottom: 0; left: 0; width: 58%;", ".editorial-copy { position: absolute; top: 0; right: 0; bottom: 0; width: 42%;"],
    ["9:16", 1080, 1920, ".editorial-media { position: absolute; top: 0; right: 0; left: 0; height: 55%;", ".editorial-copy { position: absolute; right: 0; bottom: 0; left: 0; height: 45%;"],
    ["1:1", 1080, 1080, ".editorial-media { position: absolute; top: 0; bottom: 0; left: 0; width: 52%;", ".editorial-copy { position: absolute; top: 0; right: 0; bottom: 0; width: 48%;"],
  ] as const)("uses the editorial %s absolute composition", (aspectRatio, width, height, mediaRule, copyRule) => {
    const { files } = buildComposition(manifestFixture({
      templateId: "editorial-split",
      aspectRatio,
      width,
      height,
    }));
    const css = files.find((file) => file.path === "styles.css")?.contents ?? "";
    expect(css).toContain(mediaRule);
    expect(css).toContain(copyRule);
    expect(css).not.toContain("display: grid");
  });

  it("wraps long unbroken editorial copy within its panel", () => {
    const css = buildComposition(manifestFixture({ templateId: "editorial-split" })).files[1]!.contents;
    expect(css).toMatch(/\.editorial-copy h1 \{[^}]*overflow-wrap: anywhere; word-break: normal; \}/);
    expect(css).toContain(".editorial-copy p { overflow-wrap: anywhere; word-break: normal; }");
  });

  it("uses short-side editorial motion with separate opposing title and body beats", () => {
    const { files } = buildComposition(manifestFixture({ templateId: "editorial-split" }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).toContain('.editorial-image", { x: "-86px"');
    expect(html).toContain('-title", { x: "32px"');
    expect(html).toContain('-body", { x: "32px"');
    expect(html.indexOf('-body", { x: "32px"')).toBeGreaterThan(html.indexOf('-title", { x: "32px"'));
  });

  it("reveals the gallery image at 1.035 before starting the title", () => {
    const { files } = buildComposition(manifestFixture({ templateId: "gallery-reveal" }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).toContain('.gallery-image", { scale: 1.035');
    expect(html).not.toMatch(/-aperture\"[^\n]+scale:/);
    expect(html).toContain('-title", { y: 32, opacity: 0 }');
    expect(html).toContain('duration: 0.225, ease: "power3.out" }, 0.225);');
  });

  it.each(["9:16", "1:1"] as const)("preserves the full product and separates gallery copy at %s", (aspectRatio) => {
    const dimensions = frameDimensions({ aspectRatio, resolution: "1080p" });
    const css = buildComposition(manifestFixture({ aspectRatio, ...dimensions, templateId: "gallery-reveal" })).files[1]!.contents;
    expect(css).toContain(".gallery-aperture { position: absolute; top: var(--safe); right: var(--safe); bottom: 34%; left: var(--safe); overflow: hidden; border-radius:");
    expect(css).toContain(".gallery-aperture { position: absolute;");
    expect(css).toContain("background: var(--surface);");
    expect(css).toContain(".gallery-image { width: 100%; height: 100%; object-fit: contain;");
    expect(css).toContain(".gallery-copy { position: absolute; top: calc(66% + var(--safe));");
  });

  it.each(["editorial-split", "gallery-reveal"])("keeps %s scenes on non-overlapping hard cuts with intact intervals", (templateId) => {
    const { files } = buildComposition(manifestFixture({ templateId, scenes: [
      manifestSceneFixture({ order: 1, startSeconds: 0, endSeconds: 4 }),
      manifestSceneFixture({ order: 2, startSeconds: 4, endSeconds: 10 }),
    ] }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).toContain('data-start="0" data-duration="4" data-track-index="0"');
    expect(html).toContain('data-start="4" data-duration="6" data-track-index="1"');
    expect(files[1]!.contents).toContain(`.${templateId === "editorial-split" ? "editorial" : "gallery"}-scene { overflow: hidden; isolation: isolate; clip-path: inset(0); }`);
  });

  it.each(["9:16", "1:1", "16:9"] as const)("allocates gallery image and readable copy regions at %s", (aspectRatio) => {
    const dimensions = frameDimensions({ aspectRatio, resolution: "1080p" });
    const css = buildComposition(manifestFixture({ aspectRatio, ...dimensions, templateId: "gallery-reveal" })).files[1]!.contents;
    expect(css).toContain(".gallery-aperture { position: absolute;");
    expect(css).toContain(aspectRatio === "16:9" ? "right: 42%; bottom: var(--safe);" : "bottom: 34%;");
    expect(css).toContain(aspectRatio === "16:9" ? "left: 62%; justify-content: center;" : "top: calc(66% + var(--safe));");
    expect(css).toContain(`font-size: ${aspectRatio === "16:9" ? "38px" : aspectRatio === "1:1" ? "44px" : "48px"}; line-height: 1.05; overflow-wrap: anywhere;`);
  });

  it("continues gallery scale into non-final exits while the final CTA holds", () => {
    const { files } = buildComposition(manifestFixture({ templateId: "gallery-reveal" }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).toContain('tl.to("#scene-1 .gallery-image", { scale: 0.965');
    expect(html).not.toContain('tl.to("#scene-2 .gallery-image"');
    expect(html).toContain('<p class="gallery-cta">Pesan sekarang</p>');
  });

  it.each(["editorial-split", "gallery-reveal"])("keeps short pilot scene %s static", (templateId) => {
    const { files } = buildComposition(manifestFixture({
      templateId,
      scenes: [manifestSceneFixture({ endSeconds: 0.5 })],
    }));
    const html = files.find((file) => file.path === "index.html")?.contents ?? "";
    expect(html).not.toContain("tl.fromTo(");
    expect(html).not.toContain("tl.to(");
  });

  it("registers both pilots without changing the legacy-first selector order", () => {
    expect(RENDER_TEMPLATES.map((template) => template.id)).toEqual([
      "product-spotlight",
      "offer-board",
      "editorial-split",
      "gallery-reveal",
      "kinetic-type",
      "artisan-detail",
      "menu-sequence",
      "offer-takeover",
    ]);
  });

  it("builds deterministic sources across the supported matrix", () => {
    for (const template of RENDER_TEMPLATES) {
      for (const styleId of VIDEO_STYLE_IDS) {
        for (const aspectRatio of VIDEO_ASPECT_RATIOS) {
          for (const resolution of VIDEO_RESOLUTIONS) {
            for (const durationSeconds of VIDEO_DURATIONS_SECONDS) {
              const manifest = manifestFixture({
                templateId: template.id,
                templateVersion: template.version,
                videoType: template.supports[0]!,
                styleId,
                aspectRatio,
                resolution,
                durationSeconds,
                ...frameDimensions({ aspectRatio, resolution }),
                scenes: [manifestSceneFixture({ endSeconds: durationSeconds })],
              });
              const source = buildComposition(manifest);
              expect(source.files).toEqual(buildComposition(manifest).files);
              expect(source.files.map((file) => file.path)).toEqual(["index.html", "styles.css"]);
              for (const file of source.files) expect(file.contents).not.toMatch(/https?:\/\//);
            }
          }
        }
      }
    }
  });

  it.each(RENDER_TEMPLATES.map((template) => template.id))("escapes approved copy for %s", (templateId) => {
    const template = RENDER_TEMPLATES.find((candidate) => candidate.id === templateId)!;
    const approved = `<strong>Approved & \"quoted\"</strong>`;
    const { files } = buildComposition(manifestFixture({ templateId, templateVersion: template.version, videoType: template.supports[0]!, keyMessage: approved, callToAction: approved, menuItems: [{ name: approved, price: approved }], scenes: [manifestSceneFixture({ onScreenTitle: approved, onScreenCopy: approved, caption: approved })] }));
    const html = files[0]!.contents;
    expect(html).not.toContain(approved);
    expect(html).toContain(escapeHtml(approved));
  });

  it.each(RENDER_TEMPLATES.map((template) => template.id))("keeps user text out of scripts for %s", (templateId) => {
    const template = RENDER_TEMPLATES.find((candidate) => candidate.id === templateId)!;
    const attack = `\"); alert(1); //`;
    const { files } = buildComposition(manifestFixture({ templateId, templateVersion: template.version, videoType: template.supports[0]!, keyMessage: attack, callToAction: attack, menuItems: [{ name: attack, price: attack }], scenes: [manifestSceneFixture({ onScreenTitle: attack, onScreenCopy: attack, caption: attack })] }));
    const html = files[0]!.contents;
    expect(html.slice(html.indexOf("<script>"))).not.toContain("alert(1)");
  });

  it.each(RENDER_TEMPLATES.map((template) => template.id))("builds sparse, long, and short content for %s", (templateId) => {
    const template = RENDER_TEMPLATES.find((candidate) => candidate.id === templateId)!;
    const longTitle = "T".repeat(40);
    const longCopy = "C".repeat(90);
    const { files } = buildComposition(manifestFixture({ templateId, templateVersion: template.version, videoType: template.supports[0]!, brandName: null, callToAction: null, menuItems: [], assets: [], scenes: [manifestSceneFixture({ endSeconds: 0.5, assetIds: [], onScreenTitle: longTitle, onScreenCopy: longCopy, caption: null })] }));
    const html = files[0]!.contents;
    expect(html).toContain(longTitle);
    expect(html).toContain(longCopy);
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("src=\"assets/");
  });

  it.each([
    ["kinetic-type", ["product_launch"]],
    ["artisan-detail", ["product_promo", "product_launch"]],
    ["menu-sequence", ["menu_showcase"]],
    ["offer-takeover", ["discount_promo"]],
  ] as const)("declares the exact support contract for %s", (templateId, supports) => {
    expect(RENDER_TEMPLATES.find((template) => template.id === templateId)?.supports).toEqual(supports);
  });

  it.each([
    ["kinetic-type", "9:16", ".kinetic-media { position: absolute; right: var(--safe); bottom: var(--safe); width: 38%; height: 34%;"],
    ["kinetic-type", "16:9", ".kinetic-media { position: absolute; right: var(--safe); bottom: var(--safe); width: 38%; height: 34%;"],
    ["artisan-detail", "9:16", "top: 0; right: 0; left: 0; height: 65%;"],
    ["artisan-detail", "16:9", "top: 0; bottom: 0; left: 0; width: 65%;"],
    ["menu-sequence", "9:16", "right: 0; bottom: 0; left: 0; height: 44%;"],
    ["menu-sequence", "16:9", "top: 0; bottom: 0; left: 0; width: 46%;"],
    ["offer-takeover", "9:16", ".takeover-offer { position: absolute; top: 12%;"],
    ["offer-takeover", "16:9", ".takeover-offer { position: absolute; top: 12%;"],
  ] as const)("uses the %s %s layout contract", (templateId, aspectRatio, literalRule) => {
    const template = RENDER_TEMPLATES.find((candidate) => candidate.id === templateId)!;
    const dimensions = frameDimensions({ aspectRatio, resolution: "1080p" });
    const css = buildComposition(manifestFixture({ templateId, templateVersion: template.version, videoType: template.supports[0]!, aspectRatio, ...dimensions })).files[1]!.contents;
    expect(css).toContain(literalRule);
  });

  it.each([
    ["9:16", "44px"],
    ["1:1", "48px"],
    ["16:9", "56px"],
  ] as const)("sizes and wraps editorial titles for 40 characters at %s", (aspectRatio, size) => {
    const template = RENDER_TEMPLATES.find((candidate) => candidate.id === "editorial-split")!;
    const dimensions = frameDimensions({ aspectRatio, resolution: "1080p" });
    const css = buildComposition(manifestFixture({ templateId: template.id, templateVersion: template.version, aspectRatio, ...dimensions, scenes: [manifestSceneFixture({ onScreenTitle: "A title containing exactly forty characters!!!!" })] })).files[1]!.contents;
    expect(css).toContain(`.editorial-copy h1 { font-size: ${size}; overflow-wrap: anywhere; word-break: normal;`);
  });

  it("scales gallery title size to each aspect ratio", () => {
    const sizes = VIDEO_ASPECT_RATIOS.map((aspectRatio) => {
      const template = RENDER_TEMPLATES.find((candidate) => candidate.id === "gallery-reveal")!;
      const dimensions = frameDimensions({ aspectRatio, resolution: "1080p" });
      const css = buildComposition(manifestFixture({ templateId: template.id, templateVersion: template.version, aspectRatio, ...dimensions })).files[1]!.contents;
      return css.match(/\.gallery-copy h1 \{ font-size: ([^;]+); line-height:/)?.[1];
    });
    expect(sizes).toEqual(["48px", "44px", "38px"]);
  });

  it("keeps every kinetic word in at most four groups and completes the final group inside entrance", () => {
    const html = buildComposition(manifestFixture({ templateId: "kinetic-type", videoType: "product_launch", scenes: [manifestSceneFixture({ onScreenTitle: "one two three four five six seven eight nine" })] })).files[0]!.contents;
    expect((html.match(/class="kinetic-word"/g) ?? [])).toHaveLength(3);
    expect(html).toContain("one two three");
    expect(html).toContain("four five six");
    expect(html).toContain("seven eight nine");
    expect(html).toContain('-word-2", { y: "72px", opacity: 0 }, { y: 0, opacity: 1, duration: 0.15, ease: "power4.out" }, 0.3);');
  });

  it("completes artisan and editorial copy beats inside entrance", () => {
    const artisan = buildComposition(manifestFixture({ templateId: "artisan-detail" })).files[0]!.contents;
    const editorial = buildComposition(manifestFixture({ templateId: "editorial-split" })).files[0]!.contents;
    expect(artisan).toContain('-copy", { y: "28px", opacity: 0 }, { y: 0, opacity: 1, duration: 0.225');
    expect(editorial).toContain('-body", { x: "32px", opacity: 0 }, { x: 0, opacity: 1, duration: 0.225');
  });

  it("fits the gallery image, title, and body into phased entrance", () => {
    const html = buildComposition(manifestFixture({ templateId: "gallery-reveal" })).files[0]!.contents;
    expect(html).toContain('.gallery-image", { scale: 1.035 }, { scale: 1, duration: 0.225');
    expect(html).toContain('-title", { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: 0.225');
    expect(html).toContain('-body", { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: 0.225');
    expect(html).toContain('}, 0.225);');
  });

  it("renders every approved menu row or scene copy when the menu is empty", () => {
    const menu = buildComposition(manifestFixture({ templateId: "menu-sequence", videoType: "menu_showcase", menuItems: [{ name: "Espresso", price: "20" }, { name: "Latte", price: "30" }] })).files[0]!.contents;
    const fallback = buildComposition(manifestFixture({ templateId: "menu-sequence", videoType: "menu_showcase", menuItems: [] })).files[0]!.contents;
    expect(menu).toContain("Espresso");
    expect(menu).toContain("Latte");
    expect(fallback).toContain('class="menu-fallback"');
    expect(fallback).toContain("Kopi Nusantara");
    expect(fallback).toContain("Seduh pagi jadi lebih mudah");
  });

  it("uses approved offer fields without parsing discount copy and persists the CTA rail", () => {
    const html = buildComposition(manifestFixture({ templateId: "offer-takeover", videoType: "discount_promo", brandName: "Approved Brand", keyMessage: "Save exactly 17 percent", callToAction: "Use approved CTA", menuItems: [{ name: "Bundle", price: "Approved 42" }] })).files[0]!.contents;
    expect(html).toContain('<strong>Approved 42</strong>');
    expect(html).not.toContain("Save exactly 17 percent");
    expect(html).toContain("Use approved CTA");
    expect(html).toContain('data-start="0" data-duration="10" data-track-index="90"');
    expect(html).not.toMatch(/17%|42%/);
  });

  it.each(["kinetic-type", "artisan-detail", "menu-sequence", "offer-takeover"])("keeps Task 5 short scenes static and final content held for %s", (templateId) => {
    const template = RENDER_TEMPLATES.find((candidate) => candidate.id === templateId)!;
    const html = buildComposition(manifestFixture({ templateId, templateVersion: template.version, videoType: template.supports[0]!, scenes: [manifestSceneFixture({ endSeconds: 0.5 })] })).files[0]!.contents;
    expect(html).not.toContain("tl.fromTo(");
    expect(html).not.toContain("tl.to(");
    expect(html).not.toMatch(/opacity:\s*0[^\n]+0\.5/);
  });

  it("refuses a manifest whose template version is not the one the registry holds", () => {
    expect(() => buildComposition(manifestFixture({ templateVersion: "2.0.0" }))).toThrowError(/version/);
  });
});

describe("escapeHtml", () => {
  it("escapes every character that can break out of text or an attribute", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
