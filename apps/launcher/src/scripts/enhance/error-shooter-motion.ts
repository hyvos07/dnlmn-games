import { animate } from 'animejs';

export function pulseScore(element: HTMLElement): void {
  animate(element, {
    scale: [
      { to: 1.12, duration: 100 },
      { to: 1, duration: 300 },
    ],
    ease: 'outCubic',
    composition: 'replace',
  });
}
