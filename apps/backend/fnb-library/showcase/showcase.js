/* Human catalogue only. Component fragments have no runtime dependency. */
const libraryRoot = new URL('../', document.baseURI);
const sourceCache = new Map();
async function loadSource(file) {
  if (!sourceCache.has(file)) sourceCache.set(file, fetch(new URL(file, libraryRoot)).then(response => {
    if (!response.ok) throw new Error(file + ': HTTP ' + response.status);
    return response.text();
  }));
  return sourceCache.get(file);
}
async function loadJSON(file) { return JSON.parse(await loadSource(file)); }
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function frame() {
  const node = element('div', 'hf-frame');
  node.dataset.width = '1080'; node.dataset.height = '1920';
  return node;
}
async function instantiate(entry, variant = entry.defaultVariant, count) {
  const template = document.createElement('template');
  template.innerHTML = await loadSource(entry.file);
  const root = template.content.firstElementChild;
  if (variant) root.dataset.variant = variant;
  if (count !== undefined) {
    const first = root.querySelector('[data-asset="product"]');
    root.replaceChildren();
    for (let i = 0; i < count; i++) {
      const image = first.cloneNode(true); image.dataset.index = String(i); root.append(image);
    }
    root.style.setProperty('--product-count', String(count));
  }
  return root;
}
function usage(sample, root, file) {
  const details = element('details');
  details.append(element('summary', '', 'Usage markup'));
  const link = element('a', '', 'Open source fragment'); link.href = new URL(file, libraryRoot); details.append(link);
  const pre = element('pre');
  const markup = root.cloneNode(true);
  markup.querySelectorAll('img').forEach(image => image.setAttribute('src', 'YOUR_ASSET.png'));
  pre.append(element('code', '', markup.outerHTML)); details.append(pre); sample.append(details);
}
const groups = {
  'product-components': ['ProductHero', 'ProductStack', 'IngredientBurst'],
  'promo-components': ['DiscountBadge', 'PriceSmash', 'OldNewPrice', 'BundleDeal'],
  'typography-components': ['BigStatement', 'KineticWords', 'TextBehindProduct', 'FlavorCallout'],
  'brand-components': ['BrandBackground', 'LogoLockup'],
  'cta-components': ['OrderNowCTA', 'PromoEndCard']
};
async function renderComponents(registry) {
  for (const [sectionId, names] of Object.entries(groups)) {
    const section = document.getElementById(sectionId);
    for (const name of names) {
      const entry = registry.components[name];
      const group = element('div', 'component-group');
      const heading = element('div', 'group-heading');
      heading.append(element('h3', '', name), element('p', '', entry.purpose)); group.append(heading);
      const grid = element('div', 'variant-grid'); group.append(grid); section.append(group);
      for (const [index, variant] of entry.variants.entries()) {
        const sample = element('figure', 'sample'); const preview = element('div', 'preview');
        const root = await instantiate(entry, variant, name === 'ProductStack' ? index + 2 : undefined);
        preview.append(root); sample.append(preview);
        const caption = element('figcaption'); caption.append(element('b', '', name), element('span', '', variant)); sample.append(caption);
        usage(sample, root, entry.file); grid.append(sample);
      }
    }
  }
}
async function renderLayouts(registry) {
  const grid = document.querySelector('#layout-components .variant-grid');
  for (const [name, entry] of Object.entries(registry.layouts)) {
    const sample = element('figure', 'sample'); const scene = frame();
    const background = await instantiate(registry.components.BrandBackground, 'solid');
    background.style.setProperty('--background-color', 'var(--surface)'); scene.append(background);
    const layout = await instantiate(entry, 'default');
    for (const slot of layout.querySelectorAll('[data-slot]')) {
      const slotName = slot.dataset.slot;
      const componentName = slotName === 'primary' ? 'BigStatement' : slotName === 'secondary' ? 'ProductHero' : 'PriceSmash';
      const variant = slotName === 'primary' ? 'editorial' : slotName === 'secondary' ? 'clean' : 'minimal';
      const child = await instantiate(registry.components[componentName], variant);
      if (slotName === 'primary') child.style.setProperty('--headline-size', '17cqw');
      if (slotName === 'accent') child.style.setProperty('--price-size', '13cqw');
      slot.append(child);
    }
    scene.append(layout); sample.append(scene);
    const caption = element('figcaption'); caption.append(element('b', '', name), element('span', '', 'default')); sample.append(caption);
    usage(sample, layout, entry.file); grid.append(sample);
  }
}
async function renderMotions(motionRegistry) {
  const list = document.getElementById('motion-list');
  for (const [id, entry] of Object.entries(motionRegistry.motions)) {
    const definition = await loadJSON('motions/' + entry.file);
    const details = element('details', 'motion-entry');
    details.append(element('summary', '', definition.name + ' — ' + id));
    details.append(element('p', '', entry.energy + ' energy · ' + definition.duration + 's · targets: ' + entry.compatibleTargets.join(', ')));
    const pre = element('pre'); pre.append(element('code', '', JSON.stringify(definition, null, 2))); details.append(pre);
    const link = element('a', '', 'Open motion JSON'); link.href = new URL('motions/' + entry.file, libraryRoot); details.append(link); list.append(details);
  }
}
async function renderExamples(registry, recipes) {
  const grid = document.querySelector('#example-compositions .example-grid');
  for (const [index, recipe] of recipes.examples.entries()) {
    const figure = element('figure'); const scene = frame();
    for (const item of recipe.components) {
      const root = await instantiate(registry.components[item.component], item.variant, item.count);
      if (item.placement) root.classList.add('hf-place');
      if (item.style) root.setAttribute('style', item.style);
      for (const [name, value] of Object.entries(item.attributes || {})) root.setAttribute(name, value);
      for (const override of item.content || []) {
        const target = root.querySelector(override.selector);
        if (override.lines) {
          target.replaceChildren();
          override.lines.forEach((line, i) => { if (i) target.append(document.createElement('br')); target.append(document.createTextNode(line)); });
        } else target.textContent = override.text;
      }
      scene.append(root);
    }
    figure.append(scene);
    const caption = element('figcaption');
    caption.append(element('strong', '', String(index + 1).padStart(2, '0') + ' — ' + recipe.name), element('p', '', recipe.components.map(item => item.component).join(' · ')));
    figure.append(caption); grid.append(figure);
  }
}
document.getElementById('debug-toggle').addEventListener('click', function () {
  const enabled = document.body.dataset.debug !== 'true';
  document.body.dataset.debug = String(enabled); this.setAttribute('aria-pressed', String(enabled));
});
window.hfShowcaseReady = (async () => {
  const registry = await loadJSON('registry.json');
  const [motionRegistry, recipes] = await Promise.all([loadJSON(registry.motionRegistry), loadJSON(registry.examples.file)]);
  await renderComponents(registry);
  await renderLayouts(registry);
  await renderMotions(motionRegistry);
  await renderExamples(registry, recipes);
  document.getElementById('library-status').textContent = 'Library loaded: 15 components, 64 variants, 8 layouts, 18 motion presets.';
  document.body.dataset.libraryReady = 'true';
})().catch(error => {
  const status = document.getElementById('library-status');
  status.textContent = 'Unable to load library sources: ' + error.message + '. Serve the project over HTTP, check the file paths, then reload.';
  document.body.dataset.libraryReady = 'false';
  throw error;
});
