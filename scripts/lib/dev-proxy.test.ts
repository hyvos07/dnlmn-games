import { describe, expect, it } from 'vitest';
import { routePort } from './dev-proxy.ts';

describe('routePort', () => {
  const games = { snake: 5201, 'tile-flip': 5202 };

  it.each([
    ['/snake/', 5201],
    ['/snake/src/main.ts?t=1', 5201],
    ['/snake', 5201],
    ['/tile-flip/@vite/client', 5202],
    ['/', 4322],
    ['/about/', 4322],
    ['/_astro/x.js', 4322],
    ['/snakes/', 4322],
    ['/?tag=arcade', 4322],
  ])('%s → %i', (url, port) => {
    expect(routePort(url, games, 4322)).toBe(port);
  });
});
