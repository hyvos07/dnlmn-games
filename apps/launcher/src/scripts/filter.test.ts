import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyFilter,
  type FilterState,
  matches,
  readUrlState,
  setFilterAnimator,
} from './filter.ts';

// happy-dom may not ship CSS.escape; the filter module relies on it.
if (typeof globalThis.CSS === 'undefined' || typeof globalThis.CSS.escape !== 'function') {
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) },
  });
}

const FIXTURE = `
<nav>
  <a class="chip" data-tag="" aria-current="true">All</a>
  <a class="chip" data-tag="desktop">Desktop</a>
  <a class="chip" data-tag="classic">Classic</a>
  <a class="chip" data-tag="special">Special</a>
  <a class="chip" data-tag="mobile">Mobile</a>
</nav>
<ol data-grid>
  <li class="card-item" id="snake" data-tags="desktop classic"></li>
  <li class="card-item" id="mouse-only" data-tags="special"></li>
  <li class="card-item" id="tetris" data-tags="desktop"></li>
  <li class="card-item ghost" id="ghost" aria-hidden="true"></li>
</ol>
<p data-empty hidden></p>
<p data-status></p>
`;

const item = (id: string) => document.getElementById(id) as HTMLElement;
const state = (tag = ''): FilterState => ({ tag });
const root = () => document.documentElement;

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
  root().removeAttribute('data-tag');
  setFilterAnimator(null);
});

describe('readUrlState', () => {
  const read = (pathname: string, search = '') => readUrlState({ pathname, search }, document.body);

  it('reads the tag from the query string', () => {
    expect(read('/', '?tag=desktop')).toEqual(state('desktop'));
  });

  it('reads the tag from a /tag/<tag>/ path, with or without trailing slash', () => {
    expect(read('/tag/classic/')).toEqual(state('classic'));
    expect(read('/tag/classic')).toEqual(state('classic'));
  });

  it('prefers the query over the path', () => {
    expect(read('/tag/classic/', '?tag=desktop').tag).toBe('desktop');
  });

  it('ignores unknown tags', () => {
    expect(read('/', '?tag=nope')).toEqual(state());
    expect(read('/tag/nope/')).toEqual(state());
  });

  it('treats an empty tag as no filter', () => {
    expect(read('/', '?tag=')).toEqual(state());
  });
});

describe('matches', () => {
  it('matches everything with an empty filter', () => {
    for (const id of ['snake', 'mouse-only', 'tetris']) {
      expect(matches(item(id), state())).toBe(true);
    }
  });

  it('matches by tag', () => {
    expect(matches(item('snake'), state('classic'))).toBe(true);
    expect(matches(item('tetris'), state('classic'))).toBe(false);
    expect(matches(item('mouse-only'), state('special'))).toBe(true);
  });

  it('only matches ghost placeholders when no filter is active', () => {
    expect(matches(item('ghost'), state())).toBe(true);
    expect(matches(item('ghost'), state('desktop'))).toBe(false);
  });

  it('treats an item without data-tags as untagged', () => {
    const bare = document.createElement('li');
    expect(matches(bare, state())).toBe(true);
    expect(matches(bare, state('desktop'))).toBe(false);
  });
});

describe('applyFilter', () => {
  it('sets and removes the html attributes', () => {
    applyFilter(state('desktop'));
    expect(root().dataset.tag).toBe('desktop');

    applyFilter(state());
    expect(root().hasAttribute('data-tag')).toBe(false);
  });

  it('marks only the active chip with aria-current', () => {
    applyFilter(state('classic'));
    const current = [...document.querySelectorAll<HTMLElement>('.chip[aria-current]')];
    expect(current).toHaveLength(1);
    expect(current[0]?.dataset.tag).toBe('classic');

    applyFilter(state());
    const all = document.querySelector('.chip[data-tag=""]');
    expect(all?.getAttribute('aria-current')).toBe('true');
    expect(document.querySelectorAll('.chip[aria-current]')).toHaveLength(1);
  });

  it('announces how many games are showing, ignoring ghosts', () => {
    const status = document.querySelector('[data-status]');
    applyFilter(state());
    expect(status?.textContent).toBe('Showing 3 games.');

    applyFilter(state('classic'));
    expect(status?.textContent).toBe('Showing 1 game in classic.');
  });

  it('shows the empty state only when nothing matches', () => {
    const empty = document.querySelector<HTMLElement>('[data-empty]');
    applyFilter(state('mobile'));
    expect(empty?.hidden).toBe(false);
    expect(document.querySelector('[data-status]')?.textContent).toBe('Showing 0 games in mobile.');
    applyFilter(state());
    expect(empty?.hidden).toBe(true);
  });

  it('announces to the live region only when announce is true', () => {
    const status = document.querySelector('[data-status]');
    applyFilter(state('desktop'), { announce: false });
    expect(status?.textContent).toBe('');

    applyFilter(state('desktop'));
    expect(status?.textContent).toBe('Showing 2 games in desktop.');

    applyFilter(state('classic'));
    expect(status?.textContent).toBe('Showing 1 game in classic.');

    applyFilter(state());
    expect(status?.textContent).toBe('Showing 3 games.');
  });

  it('tolerates a page without optional elements', () => {
    document.body.innerHTML = '';
    expect(() => applyFilter(state('desktop'))).not.toThrow();
    expect(root().dataset.tag).toBe('desktop');
  });

  it('routes the change through a registered animator with willShow', () => {
    const seen: Record<string, boolean> = {};
    const animator = vi.fn((change: () => void, willShow: (el: HTMLElement) => boolean) => {
      // The change has not run yet when the animator is called.
      expect(root().hasAttribute('data-tag')).toBe(false);
      for (const id of ['snake', 'mouse-only', 'tetris', 'ghost']) seen[id] = willShow(item(id));
      change();
    });
    setFilterAnimator(animator);

    applyFilter(state('classic'));
    expect(animator).toHaveBeenCalledTimes(1);
    expect(seen).toEqual({ snake: true, 'mouse-only': false, tetris: false, ghost: false });
    expect(root().dataset.tag).toBe('classic');
  });

  it('skips the animator when announce is false and applies the change directly', () => {
    const animator = vi.fn();
    setFilterAnimator(animator);
    applyFilter(state('classic'), { announce: false });
    expect(animator).not.toHaveBeenCalled();
    expect(root().dataset.tag).toBe('classic');
  });
});
