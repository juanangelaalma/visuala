import { z } from "zod";

const rectangleSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
export const geometryResultSchema = z.object({
  sceneCount: z.number().int().nonnegative(),
  foregroundCount: z.number().int().nonnegative(),
  issues: z.array(z.object({
    code: z.string(),
    scene: z.string(),
    selector: z.string(),
    message: z.string(),
    bbox: rectangleSchema,
  })),
});

// Executed in the producer's page, not Node; no preview-only DOM or timing implementation.
export const COMPOSITION_GEOMETRY_SCRIPT = String.raw`(async function () {
  const sample = window.__visualaGateSample;
  const issues = [];
  const tolerance = 3;
  const rectangle = (element) => {
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const intersects = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > tolerance && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > tolerance;
  const outside = (a, b) => a.x < b.x - tolerance || a.x + a.width > b.x + b.width + tolerance || a.y < b.y - tolerance || a.y + a.height > b.y + b.height + tolerance;
  const opacity = (element) => {
    let alpha = 1;
    for (let node = element; node; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden') return 0;
      alpha *= Number(css.opacity);
    }
    return alpha;
  };
  const canvas = document.querySelector('[data-composition-id="main"]');
  if (!canvas || !sample) throw new Error('Composition geometry sampling has no root or sample.');
  const canvasBox = rectangle(canvas);
  const selector = (element) => {
    const scene = element.closest('.hf-scene');
    const module = element.closest('.hf-module');
    const prefix = scene ? '#' + scene.id : '[data-composition-id="main"]';
    const zone = module && module.dataset.zone;
    return prefix + (zone ? ' [data-zone="' + zone + '"]' : '') + (element.classList.length ? ' .' + Array.from(element.classList).join('.') : ' ' + element.tagName.toLowerCase());
  };
  const add = (code, element, message, bbox = rectangle(element)) => issues.push({ code, scene: element.closest('.hf-scene')?.dataset.scene || 'main', selector: selector(element), message, bbox });
  const scenes = Array.from(document.querySelectorAll('.hf-scene'));
  let foregroundCount = 0;
  for (const scene of scenes) {
    const sceneVisible = opacity(scene) > .05;
    const content = scene.querySelector(':scope > .hf-scene__content');
    const isReadable = sample.sceneId === scene.dataset.scene;
    if (isReadable && !content) add('content_zone_missing', scene, 'Scene has no scoped content zone.');
    if (!sceneVisible && !isReadable) continue;
    const zone = content ? rectangle(content) : canvasBox;
    const texts = [];
    const images = [];
    for (const module of scene.querySelectorAll('.hf-module')) {
      if (module.classList.contains('hf-BackgroundTexture')) continue;
      const moduleBox = rectangle(module);
      const moduleVisible = sceneVisible && opacity(module) > .05 && moduleBox.width > 0 && moduleBox.height > 0;
      if (isReadable && moduleVisible && outside(moduleBox, zone)) add('module_out_of_zone', module, 'Important module leaves the scene content zone.');
      const walker = document.createTreeWalker(module, NodeFilter.SHOW_TEXT);
      const runs = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim()) continue;
        const element = node.parentElement;
        if (!element || element.closest('script,style')) continue;
        const alpha = opacity(element);
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0).map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
        const painted = rects.some(r => intersects(r, canvasBox));
        if (isReadable && sample.requireAll && (alpha < .5 || !painted)) add('important_text_missing', element, 'Important text is not readable before the scene closes: ' + node.textContent.trim().slice(0, 80));
        if (alpha <= .05) continue;
        if (painted) foregroundCount++;
        if (!isReadable || alpha < .5) continue;
        runs.push(...rects);
        for (const rect of rects) {
          if (outside(rect, canvasBox)) add('text_out_of_frame', element, 'Readable text leaves the output frame.', rect);
          if (rect.x < moduleBox.x - tolerance || rect.x + rect.width > moduleBox.x + moduleBox.width + tolerance) add('text_overflow', element, 'Text exceeds its allocated module width.', rect);
          for (let parent = element; parent && parent !== scene.parentElement; parent = parent.parentElement) {
            const css = getComputedStyle(parent);
            const box = rectangle(parent);
            const clippedX = /hidden|clip|auto|scroll/.test(css.overflowX) && (rect.x < box.x - tolerance || rect.x + rect.width > box.x + box.width + tolerance);
            const clippedY = /hidden|clip|auto|scroll/.test(css.overflowY) && (rect.y < box.y - tolerance || rect.y + rect.height > box.y + box.height + tolerance);
            if (clippedX || clippedY) {
              add('text_clipped', element, 'Readable text is clipped by ' + selector(parent) + '.', rect);
              break;
            }
          }
        }
      }
      if (runs.length) texts.push({ module, runs });
      for (const image of module.querySelectorAll('img')) {
        if (!image.complete) {
          try { await image.decode(); } catch {}
        }
        if (!image.complete || image.naturalWidth === 0) {
          add('image_missing', image, 'Image did not load: ' + image.getAttribute('src'));
          continue;
        }
        const imageBox = rectangle(image);
        if (opacity(image) > .05 && intersects(imageBox, canvasBox)) foregroundCount++;
        if (isReadable && sample.requireAll && (opacity(image) < .5 || !intersects(imageBox, canvasBox))) add('important_image_missing', image, 'Product image is not visible before the scene closes.');
        if (isReadable && opacity(image) >= .5) images.push({ module, box: moduleBox });
      }
    }
    if (!isReadable) continue;
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        if (texts[i].runs.some(a => texts[j].runs.some(b => intersects(a, b)))) add('text_overlap', texts[i].module, 'Readable text overlaps ' + selector(texts[j].module) + '.');
      }
      for (const image of images) {
        if (image.module !== texts[i].module && texts[i].runs.some(r => intersects(r, image.box))) add('image_text_overlap', texts[i].module, 'Readable text overlaps the important image zone ' + selector(image.module) + '.');
      }
    }
  }
  for (const host of document.querySelectorAll('[data-composition-src]')) {
    if (opacity(host) <= .05) continue;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const element = node.parentElement;
      if (!node.textContent.trim() || !element || element.closest('script,style') || opacity(element) <= .05) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (Array.from(range.getClientRects()).some(r => intersects(r, canvasBox))) foregroundCount++;
    }
    for (const media of host.querySelectorAll('img,video,canvas,svg')) {
      if (opacity(media) > .05 && intersects(rectangle(media), canvasBox) && (media.tagName !== 'IMG' || media.naturalWidth > 0)) foregroundCount++;
    }
  }
  if (sample.boundary && foregroundCount === 0) add('blank_boundary', canvas, 'No foreground text or image is painted at a scene boundary.');
  return { sceneCount: scenes.length, foregroundCount, issues };
})()`;
