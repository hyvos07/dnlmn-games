/**
 * Enhancement layer (ADR-009), loaded after first paint and never under reduced motion.
 * Title power-on wave, letter bounces, card reveal on scroll, live gameplay clips on
 * cards, 3D tilt + glare, card → game exit wipe, FLIP filtering, and the footer snake.
 */
import { animate, cleanInlineStyles, type JSAnimation, random, set, stagger } from 'animejs';
import type { FilterAnimator } from '../filter.ts';
import { startTrail } from './trail.ts';

interface Hooks {
  setFilterAnimator: (fn: FilterAnimator | null) => void;
}

const fine = window.matchMedia('(pointer: fine)').matches;

export function start({ setFilterAnimator }: Hooks): void {
  titleWave();
  revealCards();
  livePreviews();
  if (fine) tiltCards();
  exitTransitions();
  setFilterAnimator(flipFilter);
  const footer = document.querySelector<HTMLElement>('[data-section="footer"]');
  const trail = footer?.querySelector<SVGSVGElement>('[data-trail]');
  if (footer && trail) startTrail(footer, trail);
}

/** The h1 is already painted (it's the LCP element); this "powers it on" in place. */
function titleWave(): void {
  const letters = [...document.querySelectorAll<HTMLElement>('[data-title] .ch')];
  if (letters.length === 0) return;
  animate(letters, {
    translateY: { from: '-0.36em', to: '0em' },
    rotate: { from: () => random(-16, 16), to: 0 },
    scale: { from: 1.16, to: 1 },
    '--flash': { from: 1, to: 0 },
    duration: 1150,
    delay: stagger(48),
    ease: 'outElastic(1, .55)',
    onComplete: (self) => cleanInlineStyles(self),
  });
  for (const letter of letters) {
    letter.addEventListener('pointerenter', () => {
      animate(letter, {
        translateY: [
          { to: '-0.16em', duration: 130, ease: 'outQuad' },
          { to: '0em', duration: 700, ease: 'outElastic(1, .4)' },
        ],
        rotate: [
          { to: random(-10, 10), duration: 130, ease: 'outQuad' },
          { to: 0, duration: 700, ease: 'outElastic(1, .4)' },
        ],
        composition: 'replace',
      });
    });
  }
}

/** Cards below the fold start lowered and fade in, in batches, as they scroll into view. */
function revealCards(): void {
  const items = [...document.querySelectorAll<HTMLElement>('[data-grid] > .card-item')];
  const below = items.filter((item) => item.getBoundingClientRect().top > window.innerHeight);
  if (below.length === 0) return;
  set(below, { opacity: 0, translateY: 64, rotate: () => random(-3, 3) });
  const observer = new IntersectionObserver(
    (entries) => {
      const batch = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
      if (batch.length === 0) return;
      for (const target of batch) observer.unobserve(target);
      animate(batch, {
        opacity: 1,
        translateY: 0,
        rotate: 0,
        duration: 1000,
        delay: stagger(90),
        ease: 'outExpo',
        // Not cleanInlineStyles: that would restore the hidden pre-state set above.
        onComplete: () => {
          for (const target of batch) {
            (target as HTMLElement).style.removeProperty('opacity');
            (target as HTMLElement).style.removeProperty('transform');
          }
        },
      });
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  for (const item of below) observer.observe(item);
}

/**
 * Cards with a `data-preview` clip (ADR-011) get it laid over the still once they come
 * near the screen. The still is the clip's first frame, so the fade-in is seamless.
 * The clip is only fetched here, so it never competes with first paint.
 */
function livePreviews(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const media = entry.target as HTMLElement;
        const clip = new Image();
        clip.className = 'card-preview';
        clip.alt = '';
        clip.decoding = 'async';
        clip.addEventListener('load', () => clip.classList.add('is-ready'), { once: true });
        clip.addEventListener('error', () => clip.remove(), { once: true });
        clip.src = media.dataset.preview as string;
        media.querySelector('picture')?.after(clip);
      }
    },
    { rootMargin: '200px 0px' },
  );
  for (const media of document.querySelectorAll<HTMLElement>('[data-preview]')) {
    observer.observe(media);
  }
}

/** 3D tilt + glare from the pointer, via CSS custom properties (no WebGL). */
function tiltCards(): void {
  for (const card of document.querySelectorAll<HTMLElement>('.card')) {
    let frame = 0;
    let rect: DOMRect | null = null;
    card.addEventListener('pointerenter', () => {
      rect = card.getBoundingClientRect();
      card.classList.add('is-tilting');
    });
    card.addEventListener('pointermove', (event) => {
      if (!rect) rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        card.style.setProperty('--ry', `${((x - 0.5) * 14).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${((0.5 - y) * 11).toFixed(2)}deg`);
        card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      });
    });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      rect = null;
      card.classList.remove('is-tilting');
      for (const prop of ['--rx', '--ry', '--mx', '--my']) card.style.removeProperty(prop);
    });
  }
}

/** Clicking a game: the card lifts, an accent wipe grows from the click, then we navigate. */
function exitTransitions(): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-game-link]')) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      const href = link.href;
      const go = () => window.location.assign(href);
      const fallback = window.setTimeout(go, 900);
      const x = event.clientX || window.innerWidth / 2;
      const y = event.clientY || window.innerHeight / 2;
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );
      const wipe = document.createElement('div');
      wipe.className = 'wipe';
      document.body.append(wipe);
      if (link.classList.contains('card')) {
        animate(link, { scale: 1.035, translateY: -10, duration: 260, ease: 'outQuad' });
      }
      animate(wipe, {
        clipPath: {
          from: `circle(0px at ${x}px ${y}px)`,
          to: `circle(${radius}px at ${x}px ${y}px)`,
        },
        duration: 460,
        delay: 90,
        ease: 'inOutQuart',
        onComplete: () => {
          window.clearTimeout(fallback);
          go();
        },
      });
    });
  }
}

const shown = (item: HTMLElement) => getComputedStyle(item).display !== 'none';

/** Finishes a filter change whose fade-out is still running (rapid clicks, back/forward). */
let flushPending: (() => void) | null = null;

/** FLIP: leaving cards shrink away, survivors glide to their new slots, newcomers pop in. */
const flipFilter: FilterAnimator = (change, willShow) => {
  // Apply any in-flight change first, so an older change can never land after this one.
  flushPending?.();
  const items = [...document.querySelectorAll<HTMLElement>('[data-grid] > .card-item')];
  const before = items.filter(shown);
  const leaving = before.filter((item) => !willShow(item));

  const settle = (out?: JSAnimation) => {
    const first = new Map(before.map((item) => [item, item.getBoundingClientRect()]));
    change();
    // The leaving cards are hidden now; drop their faded-out styles for next time.
    if (out) cleanInlineStyles(out);
    const after = items.filter(shown);
    const entering: HTMLElement[] = [];
    for (const item of after) {
      const was = first.get(item);
      if (!was) {
        entering.push(item);
        continue;
      }
      const now = item.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      animate(item, {
        translateX: { from: dx, to: 0 },
        translateY: { from: dy, to: 0 },
        duration: 700,
        ease: 'outExpo',
        onComplete: (self) => cleanInlineStyles(self),
      });
    }
    if (entering.length > 0) {
      animate(entering, {
        opacity: { from: 0, to: 1 },
        scale: { from: 0.86, to: 1 },
        translateY: { from: 28, to: 0 },
        duration: 650,
        delay: stagger(60),
        ease: 'outBack(1.4)',
        onComplete: (self) => cleanInlineStyles(self),
      });
    }
  };

  if (leaving.length === 0) {
    settle();
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    flushPending = null;
    out.cancel();
    settle(out);
  };
  const out = animate(leaving, {
    opacity: 0,
    scale: 0.9,
    duration: 180,
    ease: 'inQuad',
    onComplete: () => finish(),
  });
  flushPending = finish;
};
