/**
 * Footer wink at game #1: a grid-snapped snake (SVG, not a second canvas) that lives in
 * the gaps around the footer text. Each `[data-wall]` group (a heading, a link column)
 * is one solid rectangle, the smallest box around all of its text, so the snake never
 * slides under a word and there are no notches between short and long lines to get
 * trapped in. On its own it hunts apples (BFS); while a mouse hovers the
 * footer it follows the cursor instead, so you can steer it onto the apple. It glides
 * between cells like the real game, and only runs while the footer is on screen and the
 * tab is visible.
 */

interface Cell {
  x: number;
  y: number;
}

const CELL = 22;
const STEP_AUTO_MS = 64;
const STEP_GUIDED_MS = 44;
const BASE_LENGTH = 7;
const MAX_LENGTH = 26;
const GROW = 3;
/** Fraction of a cell the drawn body leaves free on each side (stroke is 64% wide). */
const INSET = 0.16;
const SVG_NS = 'http://www.w3.org/2000/svg';

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const DIRS: Cell[] = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
];

export function startTrail(footer: HTMLElement, svg: SVGSVGElement): void {
  let cols = 1;
  let rows = 1;
  /** 1 where footer text covers the cell. */
  let walls = new Uint8Array(1);
  let body: Cell[] = [];
  let prev: Cell[] = [];
  let facing: Cell = { x: -1, y: 0 };
  let wanted = BASE_LENGTH;
  let apple: Cell | null = null;
  let guide: Cell | null = null;
  let acc = 0;
  let last = 0;
  let frame = 0;
  let visible = false;

  // Swap the static drawing for live elements in pixel space, covering the footer.
  svg.replaceChildren();
  svg.removeAttribute('preserveAspectRatio');
  svg.classList.add('is-live');
  const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const appleEl = el('circle', { r: String(CELL * 0.3), class: 'trail-apple' });
  const path = el('path', {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': String(CELL * 0.64),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    opacity: '0.9',
  });
  const eyes = [0, 1].map(() => el('circle', { r: String(CELL * 0.12), fill: 'var(--bg)' }));
  svg.append(appleEl, path, ...eyes);

  const index = (c: Cell) => c.y * cols + c.x;
  const inside = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < cols && c.y < rows;
  const open = (c: Cell) => inside(c) && walls[index(c)] === 0;

  /** The smallest box around every line of text inside `group`, or null if it has none. */
  const textBox = (group: Element) => {
    const range = document.createRange();
    const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    const walker = document.createTreeWalker(group, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        box.left = Math.min(box.left, r.left);
        box.top = Math.min(box.top, r.top);
        box.right = Math.max(box.right, r.right);
        box.bottom = Math.max(box.bottom, r.bottom);
      }
    }
    return box.left < box.right ? box : null;
  };

  /** Marks every cell whose drawable middle overlaps a text group's box. */
  const measureWalls = () => {
    walls = new Uint8Array(cols * rows);
    const origin = footer.getBoundingClientRect();
    for (const group of footer.querySelectorAll('[data-wall]')) {
      const r = textBox(group);
      if (r) {
        const left = r.left - origin.left;
        const right = r.right - origin.left;
        const top = r.top - origin.top;
        const bottom = r.bottom - origin.top;
        const x0 = Math.max(0, Math.floor(left / CELL - (1 - INSET)) + 1);
        const x1 = Math.min(cols - 1, Math.ceil(right / CELL - INSET) - 1);
        const y0 = Math.max(0, Math.floor(top / CELL - (1 - INSET)) + 1);
        const y1 = Math.min(rows - 1, Math.ceil(bottom / CELL - INSET) - 1);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) walls[y * cols + x] = 1;
      }
    }
  };

  /** Breadth-first search from the head through open cells the body won't still be in. */
  const search = () => {
    const parent = new Int32Array(cols * rows).fill(-1);
    const dist = new Int32Array(cols * rows).fill(-1);
    const occupied = new Uint8Array(cols * rows);
    // The tail moves out of the way as the head moves, so it doesn't block.
    for (const c of body.slice(0, -1)) if (inside(c)) occupied[index(c)] = 1;
    const head = body[0] as Cell;
    const order: number[] = [index(head)];
    dist[index(head)] = 0;
    for (let i = 0; i < order.length; i++) {
      const at = order[i] as number;
      const x = at % cols;
      const y = (at - x) / cols;
      for (const d of DIRS) {
        const next = { x: x + d.x, y: y + d.y };
        if (!open(next)) continue;
        const n = index(next);
        if (dist[n] !== -1 || occupied[n]) continue;
        dist[n] = (dist[at] as number) + 1;
        parent[n] = at;
        order.push(n);
      }
    }
    return { parent, dist, order };
  };

  /** The first step on the way to `goal` (an index reached by the search). */
  const firstStep = (parent: Int32Array, goal: number): Cell => {
    let at = goal;
    const head = index(body[0] as Cell);
    while (parent[at] !== head && parent[at] !== -1) at = parent[at] as number;
    return { x: at % cols, y: Math.floor(at / cols) };
  };

  const placeApple = () => {
    if (body.length === 0) return;
    const { order, dist } = search();
    const taken = new Set(body.map(index));
    // Only cells with all four sides open: never in a nook the snake can't turn out of.
    const roomy = (i: number) => {
      const c = { x: i % cols, y: Math.floor(i / cols) };
      return DIRS.every((d) => open({ x: c.x + d.x, y: c.y + d.y }));
    };
    const reachable = order.filter((i) => !taken.has(i));
    const spacious = reachable.filter(roomy);
    const free = spacious.length > 0 ? spacious : reachable;
    const far = free.filter((i) => (dist[i] as number) >= 6);
    const pool = far.length > 0 ? far : free;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    apple = pick === undefined ? null : { x: pick % cols, y: Math.floor(pick / cols) };
    if (apple) {
      appleEl.setAttribute('cx', String((apple.x + 0.5) * CELL));
      appleEl.setAttribute('cy', String((apple.y + 0.5) * CELL));
      // Restart the pop-in animation.
      appleEl.classList.remove('is-new');
      void appleEl.getBoundingClientRect();
      appleEl.classList.add('is-new');
    }
    appleEl.style.display = apple ? '' : 'none';
  };

  /** Finds a straight free run for a fresh snake, preferring the bottom right. */
  const spawn = () => {
    wanted = BASE_LENGTH;
    for (let y = rows - 2; y >= 0; y--) {
      let run = 0;
      for (let x = cols - 2; x >= 0; x--) {
        run = open({ x, y }) ? run + 1 : 0;
        if (run === BASE_LENGTH) {
          body = Array.from({ length: BASE_LENGTH }, (_, i) => ({ x: x + i, y }));
          prev = body;
          facing = { x: -1, y: 0 };
          return;
        }
      }
    }
    body = [];
    prev = [];
  };

  const measure = () => {
    const rect = footer.getBoundingClientRect();
    // The snake's world ends at [data-trail-floor] (the fine print's top rule), so the
    // whole strip below it is off-limits.
    const floor = footer.querySelector('[data-trail-floor]')?.getBoundingClientRect().top;
    const height = floor === undefined ? rect.height : floor - rect.top;
    cols = Math.max(4, Math.floor(rect.width / CELL));
    rows = Math.max(3, Math.floor(height / CELL));
    svg.setAttribute('viewBox', `0 0 ${cols * CELL} ${rows * CELL}`);
    svg.style.width = `${cols * CELL}px`;
    svg.style.height = `${rows * CELL}px`;
    measureWalls();
    // A resize can put text (or the edge) where the snake or apple was: start over.
    if (body.length === 0 || !body.every(open)) spawn();
    if (!apple || !open(apple) || body.some((c) => apple && same(c, apple))) placeApple();
    draw(1);
  };

  const pop = (c: Cell) => {
    const ring = el('circle', {
      cx: String((c.x + 0.5) * CELL),
      cy: String((c.y + 0.5) * CELL),
      r: String(CELL * 0.36),
      class: 'trail-pop',
    });
    ring.addEventListener('animationend', () => ring.remove());
    svg.insertBefore(ring, path);
  };

  const step = () => {
    prev = body;
    if (body.length === 0) return;
    const head = body[0] as Cell;
    const { parent, dist, order } = search();
    let goal: number | undefined;
    if (guide) {
      // Head for the reachable cell nearest the cursor; sit still once there.
      const target = guide;
      let best = Number.POSITIVE_INFINITY;
      for (const i of order) {
        const dx = (i % cols) - target.x;
        const dy = Math.floor(i / cols) - target.y;
        const score = (dx * dx + dy * dy) * 1000 + (dist[i] as number);
        if (score < best) {
          best = score;
          goal = i;
        }
      }
      if (goal === index(head)) return;
    } else if (apple && (dist[index(apple)] as number) > 0) {
      goal = index(apple);
    } else {
      // Apple cut off by the body: head for the farthest open cell to unwind.
      goal = order.at(-1);
    }
    if (goal === undefined || goal === index(head)) {
      // Boxed in. Start over somewhere open rather than freezing.
      spawn();
      if (!apple) placeApple();
      return;
    }
    const next = firstStep(parent, goal);
    facing = { x: next.x - head.x, y: next.y - head.y };
    const ate = apple !== null && same(next, apple);
    if (ate) wanted = Math.min(MAX_LENGTH, wanted + GROW);
    // Grow one cell per step toward `wanted`.
    const grown = [next, ...body];
    body = grown.length > wanted ? grown.slice(0, wanted) : grown;
    if (ate) {
      pop(next);
      placeApple();
    }
  };

  const center = (c: Cell, t = 1, from?: Cell) => {
    const x = from ? from.x + (c.x - from.x) * t : c.x;
    const y = from ? from.y + (c.y - from.y) * t : c.y;
    return { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
  };

  const draw = (t: number) => {
    const head = body[0];
    if (!head) {
      path.removeAttribute('d');
      for (const eye of eyes) eye.setAttribute('r', '0');
      return;
    }
    const h = center(head, t, prev[0] ?? head);
    const points = [h, ...body.slice(1).map((c) => center(c))];
    const prevTail = prev.at(-1);
    const tail = body.at(-1);
    if (prevTail && tail && body.length <= prev.length) points.push(center(tail, t, prevTail));
    path.setAttribute(
      'd',
      `M${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}`,
    );
    eyes.forEach((eye, i) => {
      const side = i === 0 ? -1 : 1;
      eye.setAttribute('r', String(CELL * 0.12));
      eye.setAttribute('cx', (h.x + (facing.x * 0.14 - facing.y * 0.2 * side) * CELL).toFixed(1));
      eye.setAttribute('cy', (h.y + (facing.y * 0.14 + facing.x * 0.2 * side) * CELL).toFixed(1));
    });
  };

  const tick = (now: number) => {
    frame = 0;
    if (!visible || document.hidden || reduced.matches) return;
    acc += Math.min(100, now - last);
    last = now;
    const stepMs = guide ? STEP_GUIDED_MS : STEP_AUTO_MS;
    while (acc >= stepMs) {
      acc -= stepMs;
      step();
    }
    draw(acc / stepMs);
    frame = requestAnimationFrame(tick);
  };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const run = () => {
    if (frame || !visible || document.hidden || reduced.matches) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };

  footer.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const rect = footer.getBoundingClientRect();
    guide = {
      x: Math.floor((event.clientX - rect.left) / CELL),
      y: Math.floor((event.clientY - rect.top) / CELL),
    };
  });
  footer.addEventListener('pointerleave', () => {
    guide = null;
  });

  new ResizeObserver(measure).observe(footer);
  void document.fonts?.ready.then(measure);
  measure();
  new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    run();
  }).observe(footer);
  document.addEventListener('visibilitychange', run);
}
