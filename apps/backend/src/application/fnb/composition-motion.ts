import type { MotionDefinition, MotionName } from "./composition-registry";

export interface ResolvedMotion {
  preset: MotionName;
  targetId: string;
  start: number;
  definition: MotionDefinition;
}

export function buildMotionRuntime(motions: ResolvedMotion[]): string {
  const data = JSON.stringify(motions).replace(/</g, "\\u003c");

  return `document.fonts.ready.then(() => {
  const motions = ${data};
  const frameScale = (document.getElementById('fnb-campaign').getBoundingClientRect().width || 1080)/1080;
  for (const target of document.querySelectorAll('[data-fnb-fit-width]')) {
    const computed = getComputedStyle(target);
    const probe = document.createElement('div');
    const maxHeight = Number(target.getAttribute('data-fnb-fit-height'))*frameScale;
    const maxWidth = Number(target.getAttribute('data-fnb-fit-width'))*frameScale;
    let size = parseFloat(computed.fontSize);
    probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;white-space:normal;overflow-wrap:anywhere;';
    probe.style.width = maxWidth+'px';
    probe.style.whiteSpace = computed.whiteSpace;
    probe.style.fontFamily = computed.fontFamily;
    probe.style.fontWeight = computed.fontWeight;
    probe.style.fontStyle = computed.fontStyle;
    probe.style.letterSpacing = computed.letterSpacing;
    probe.style.lineHeight = '1.2';
    probe.textContent = target.textContent;
    document.body.appendChild(probe);
    probe.style.fontSize = size+'px';
    while ((probe.getBoundingClientRect().height > maxHeight || probe.scrollWidth > maxWidth) && size > 20*frameScale) {
      size -= frameScale;
      probe.style.fontSize = size+'px';
    }
    target.style.fontSize = size+'px';
    target.style.lineHeight = '1.2';
    probe.remove();
  }
  const tl = gsap.timeline({ paused: true });
  function cubicBezier(value) {
    const match = /^cubic-bezier\\(([-.\\d]+),\\s*([-.\\d]+),\\s*([-.\\d]+),\\s*([-.\\d]+)\\)$/.exec(value || '');
    if (!match) return 'none';
    const [x1,y1,x2,y2] = match.slice(1).map(Number);
    const sample = (t,a,b) => 3*(1-t)*(1-t)*t*a + 3*(1-t)*t*t*b + t*t*t;
    return progress => {
      let low = 0, high = 1, t = progress;
      for (let i=0;i<24;i++) {
        const x = sample(t,x1,x2);
        if (Math.abs(x-progress)<0.0000001) break;
        if (x<progress) low=t; else high=t;
        t=(low+high)/2;
      }
      return sample(t,y1,y2);
    };
  }
  const pose = frame => ({x:frame.x,y:frame.y,scale:frame.scale,rotation:frame.rotation,opacity:frame.opacity});
  for (const motion of motions) {
    const target = document.getElementById(motion.targetId);
    if (!target) throw new Error('Missing motion target ' + motion.targetId);
    const frames = motion.definition.behavior.keyframes;
    tl.set(target,{...pose(frames[0]),transformOrigin:motion.definition.behavior.transformOrigin || 'center center'},motion.start);
    for (let i=1;i<frames.length;i++) {
      const from=frames[i-1], to=frames[i];
      tl.fromTo(target,pose(from),{...pose(to),duration:to.at-from.at,ease:cubicBezier(from.easing),immediateRender:false},motion.start+from.at);
    }
  }
  tl.seek(0);
  window.__timelines = window.__timelines || {};
  window.__timelines['fnb-campaign'] = tl;
});`;
}
