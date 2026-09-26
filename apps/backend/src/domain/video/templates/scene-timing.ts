export function sceneTiming(duration: number, enterSeconds: number) {
  if (duration < 1.5) return { enter: 0, exit: 0, hold: duration, stagger: 0 };

  const enter = Math.min(enterSeconds, duration * 0.18);
  const exit = Math.min(0.3, duration * 0.12);

  return { enter, exit, hold: duration - enter - exit, stagger: enter / 4 };
}
