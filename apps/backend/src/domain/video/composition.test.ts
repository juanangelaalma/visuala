import { describe, expect, it } from "vitest";
import { buildComposition } from "./composition";
import { escapeHtml } from "./templates/escape-html";
import { manifestFixture, manifestSceneFixture } from "./render-manifest.test-helpers";

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

  it("refuses a manifest whose template version is not the one the registry holds", () => {
    expect(() => buildComposition(manifestFixture({ templateVersion: "2.0.0" }))).toThrowError(/version/);
  });
});

describe("escapeHtml", () => {
  it("escapes every character that can break out of text or an attribute", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
