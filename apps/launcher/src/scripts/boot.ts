/**
 * Critical-path launcher script (ADR-009): the page must be complete with only this.
 * It handles the tag filter and URL sync, then schedules the motion layer (anime.js +
 * the WebGL scene, or the about page's dot grid) via dynamic import after load + idle,
 * unless reduced motion is set.
 */
import { applyFilter, type FilterState, readUrlState, setFilterAnimator } from './filter.ts';

const root = document.documentElement;
const tagLinks = [...document.querySelectorAll<HTMLAnchorElement>('a[data-tag]')];

const current = (): FilterState => ({
  tag: root.dataset.tag ?? '',
});

const urlFor = (state: FilterState): string => {
  const params = new URLSearchParams();
  if (state.tag) params.set('tag', state.tag);
  const query = params.toString();
  return `/${query ? `?${query}` : ''}${location.hash}`;
};

function go(state: FilterState): void {
  const before = current();
  if (before.tag === state.tag) return;
  applyFilter(state);
  history.pushState(state, '', urlFor(state));
}

if (document.querySelector('[data-grid]')) {
  // Sync aria/counts with whatever the head script applied before paint.
  applyFilter(current(), { announce: false });

  for (const link of tagLinks) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      go({ ...current(), tag: link.dataset.tag ?? '' });
    });
  }
  window.addEventListener('popstate', () => {
    const next = readUrlState(location, root);
    const now = current();
    // Hash-only navigation (e.g. #games) also fires popstate; ignore it.
    if (next.tag !== now.tag) applyFilter(next);
  });
}

// ── Motion layer ─────────────────────────────────────────────────────────────
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

function loadMotion(): void {
  if (reduced.matches || root.hasAttribute('data-minimal')) return;
  void import('./enhance/motion.ts').then((motion) => motion.start({ setFilterAnimator }));
  const scene = document.querySelector<HTMLElement>('#scene[data-webgl]');
  // Feature-detect without creating a context: the scene owns the only one.
  if (scene && 'WebGL2RenderingContext' in window) {
    void import('./enhance/scene.ts').then((module) => module.start(scene));
  }
  const dots = document.querySelector<HTMLElement>('#scene[data-dots]');
  if (dots) void import('./enhance/dots.ts').then((module) => module.start(dots));
}

const idle = (fn: () => void) =>
  'requestIdleCallback' in window
    ? requestIdleCallback(fn, { timeout: 2500 })
    : setTimeout(fn, 300);

if (document.readyState === 'complete') idle(loadMotion);
else window.addEventListener('load', () => idle(loadMotion), { once: true });

// Pages restored from the back/forward cache must not keep an exit transition on screen.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  document.querySelector('.wipe')?.remove();
  for (const link of document.querySelectorAll<HTMLElement>('[data-game-link]')) {
    link.style.removeProperty('transform');
  }
});
