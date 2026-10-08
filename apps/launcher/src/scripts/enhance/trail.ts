/**
 * Footer wink at game #1: a grid-snapped snake (SVG, not a second canvas) that chases
 * the cursor one cell at a time, glides between cells like the real game, grows while
 * you hover a link, and wanders on its own on touch screens. It only runs while the
 * footer is on screen and the tab is visible.
 */

interface Cell {
  x: number;
  y: number;
}

const CELL = 22;
const STEP_MS = 48;
const BASE_LENGTH = 8;
const HOVER_LENGTH = 20;
const SVG_NS = 'http://www.w3.org/2000/svg';

export function startTrail(footer: HTMLElement, svg: SVGSVGElement): void {
  let cols = 1;
  let rows = 1;
  let body: Cell[] = [];
  let prev: Cell[] = [];
  let target: Cell = { x: 0, y: 0 };
  let wanted = BASE_LENGTH;
  let chasing = false;
  let acc = 0;
  let last = 0;
  let frame = 0;
  let visible = false;
  let wanderAt = 0;

  // Replace the static drawing with live elements in pixel space.
  svg.replaceChildren();
  svg.removeAttribute('preserveAspectRatio');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', String(CELL * 0.64));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('opacity', '0.9');
  const eyes = [0, 1].map(() => {
    const eye = document.createElementNS(SVG_NS, 'circle');
    eye.setAttribute('r', String(CELL * 0.12));
    eye.setAttribute('fill', 'var(--bg)');
    return eye;
  });
  svg.append(path, ...eyes);

  const clamp = (c: Cell): Cell => ({
    x: Math.max(0, Math.min(cols - 1, c.x)),
    y: Math.max(0, Math.min(rows - 1, c.y)),
  });

  const measure = () => {
    const rect = footer.getBoundingClientRect();
    cols = Math.max(4, Math.floor(rect.width / CELL));
    rows = Math.max(3, Math.floor(rect.height / CELL));
    svg.setAttribute('viewBox', `0 0 ${cols * CELL} ${rows * CELL}`);
    svg.style.width = `${cols * CELL}px`;
    svg.style.height = `${rows * CELL}px`;
    if (body.length === 0) {
      const y = rows - 2;
      body = Array.from({ length: BASE_LENGTH }, (_, i) => ({ x: cols - 3 - i, y }));
      body.reverse();
      prev = body;
      target = { x: 2, y };
    }
    body = body.map(clamp);
    prev = prev.map(clamp);
    target = clamp(target);
  };

  const wander = (now: number) => {
    if (chasing || now < wanderAt) return;
    target = {
      x: Math.floor(Math.random() * cols),
      y: Math.floor(Math.random() * rows),
    };
    wanderAt = now + 1800 + Math.random() * 1800;
  };

  const step = () => {
    const head = body[0] as Cell;
    const neck = body[1];
    const dx = target.x - head.x;
    const dy = target.y - head.y;
    if (dx === 0 && dy === 0) {
      // Sitting on the target: shrink back toward the base length.
      prev = body;
      if (body.length > wanted) body = body.slice(0, -1);
      return;
    }
    const options: Cell[] = [];
    const horizontal = { x: head.x + Math.sign(dx), y: head.y };
    const vertical = { x: head.x, y: head.y + Math.sign(dy) };
    // Alternate axes on diagonals so it moves in a staircase, like the game's demo.
    if (Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && body.length % 2 === 0)) {
      options.push(horizontal, vertical);
    } else {
      options.push(vertical, horizontal);
    }
    // Target straight behind the head: both direct moves are blocked, so turn aside first.
    options.push(
      { x: head.x, y: head.y + (head.y > 0 ? -1 : 1) },
      { x: head.x + (head.x > 0 ? -1 : 1), y: head.y },
    );
    const next =
      options.find(
        (c) =>
          (c.x !== head.x || c.y !== head.y) &&
          !(neck && c.x === neck.x && c.y === neck.y) &&
          c.x >= 0 &&
          c.y >= 0 &&
          c.x < cols &&
          c.y < rows,
      ) ?? head;
    prev = body;
    // Grow one cell per step toward `wanted`, or shrink one per step back down.
    const grown = [next, ...body];
    body = grown.length > wanted ? grown.slice(0, Math.max(wanted, grown.length - 2)) : grown;
  };

  const center = (c: Cell, t = 1, from?: Cell) => {
    const x = from ? from.x + (c.x - from.x) * t : c.x;
    const y = from ? from.y + (c.y - from.y) * t : c.y;
    return { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
  };

  const draw = (t: number) => {
    const head = body[0] as Cell;
    const h = center(head, t, prev[0] ?? head);
    const points = [h, ...body.slice(1).map((c) => center(c))];
    const prevTail = prev.at(-1);
    const tail = body.at(-1);
    if (prevTail && tail && body.length <= prev.length) points.push(center(tail, t, prevTail));
    path.setAttribute(
      'd',
      `M${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}`,
    );
    const from = prev[0] ?? head;
    const dirX = Math.sign(head.x - from.x) || -1;
    const dirY = Math.sign(head.y - from.y);
    eyes.forEach((eye, i) => {
      const side = i === 0 ? -1 : 1;
      eye.setAttribute('cx', (h.x + (dirX * 0.14 - dirY * 0.2 * side) * CELL).toFixed(1));
      eye.setAttribute('cy', (h.y + (dirY * 0.14 + dirX * 0.2 * side) * CELL).toFixed(1));
    });
  };

  const tick = (now: number) => {
    frame = 0;
    if (!visible || document.hidden || reduced.matches) return;
    acc += Math.min(100, now - last);
    last = now;
    wander(now);
    while (acc >= STEP_MS) {
      acc -= STEP_MS;
      step();
    }
    draw(acc / STEP_MS);
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
    chasing = true;
    target = clamp({
      x: Math.floor((event.clientX - rect.left) / CELL),
      y: Math.floor((event.clientY - rect.top) / CELL),
    });
  });
  footer.addEventListener('pointerleave', () => {
    chasing = false;
  });
  footer.addEventListener('pointerover', (event) => {
    if ((event.target as Element).closest('a')) wanted = HOVER_LENGTH;
  });
  footer.addEventListener('pointerout', (event) => {
    if ((event.target as Element).closest('a')) wanted = BASE_LENGTH;
  });

  new ResizeObserver(measure).observe(footer);
  measure();
  draw(1);
  new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    run();
  }).observe(footer);
  document.addEventListener('visibilitychange', run);
}
