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
  <a class="chip" data-tag="arcade">Arcade</a>
  <a class="chip" data-tag="classic">Classic</a>
  <a class="chip" data-tag="puzzle">Puzzle</a>
  <button data-touch-toggle aria-pressed="false">Touch</button>
</nav>
<ol data-grid>
  <li class="card-item" id="snake" data-tags="arcade classic" data-touch></li>
  <li class="card-item" id="mouse-only" data-tags="puzzle"></li>
  <li class="card-item" id="tetris" data-tags="arcade" data-touch></li>
  <li class="card-item ghost" id="ghost" aria-hidden="true"></li>
</ol>
<p data-empty hidden></p>
<p data-status></p>
`;

const item = (id: string) => document.getElementById(id) as HTMLElement;
const state = (tag = '', touch = false): FilterState => ({ tag, touch });
const root = () => document.documentElement;

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
  root().removeAttribute('data-tag');
  root().removeAttribute('data-touch');
  setFilterAnimator(null);
});

describe('readUrlState', () => {
  const read = (pathname: string, search = '') => readUrlState({ pathname, search }, document.body);

  it('reads the tag from the query string', () => {
    expect(read('/', '?tag=arcade')).toEqual(state('arcade'));
  });

  it('reads the tag from a /tag/<tag>/ path, with or without trailing slash', () => {
    expect(read('/tag/classic/')).toEqual(state('classic'));
    expect(read('/tag/classic')).toEqual(state('classic'));
  });

  it('prefers the query over the path', () => {
    expect(read('/tag/classic/', '?tag=arcade').tag).toBe('arcade');
  });

  it('ignores unknown tags', () => {
    expect(read('/', '?tag=nope')).toEqual(state());
    expect(read('/tag/nope/')).toEqual(state());
  });

  it('treats an empty tag as no filter', () => {
    expect(read('/', '?tag=')).toEqual(state());
  });

  it('reads touch=1 only', () => {
    expect(read('/', '?touch=1').touch).toBe(true);
    expect(read('/', '?touch=0').touch).toBe(false);
    expect(read('/', '?touch=true').touch).toBe(false);
    expect(read('/', '?tag=arcade&touch=1')).toEqual(state('arcade', true));
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
    expect(matches(item('mouse-only'), state('puzzle'))).toBe(true);
  });

  it('matches by touch support', () => {
    expect(matches(item('snake'), state('', true))).toBe(true);
    expect(matches(item('mouse-only'), state('', true))).toBe(false);
  });

  it('combines tag and touch', () => {
    expect(matches(item('snake'), state('arcade', true))).toBe(true);
    expect(matches(item('mouse-only'), state('puzzle', true))).toBe(false);
    expect(matches(item('tetris'), state('classic', true))).toBe(false);
  });

  it('only matches ghost placeholders when no filter is active', () => {
    expect(matches(item('ghost'), state())).toBe(true);
    expect(matches(item('ghost'), state('arcade'))).toBe(false);
    expect(matches(item('ghost'), state('', true))).toBe(false);
    expect(matches(item('ghost'), state('arcade', true))).toBe(false);
  });

  it('treats an item without data-tags as untagged', () => {
    const bare = document.createElement('li');
    expect(matches(bare, state())).toBe(true);
    expect(matches(bare, state('arcade'))).toBe(false);
  });
});

describe('applyFilter', () => {
  it('sets and removes the html attributes', () => {
    applyFilter(state('arcade', true));
    expect(root().dataset.tag).toBe('arcade');
    expect(root().hasAttribute('data-touch')).toBe(true);

    applyFilter(state());
    expect(root().hasAttribute('data-tag')).toBe(false);
    expect(root().hasAttribute('data-touch')).toBe(false);
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

  it('syncs the touch toggle', () => {
    const toggle = document.querySelector('[data-touch-toggle]');
    applyFilter(state('', true));
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    applyFilter(state());
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
  });

  it('announces how many games are showing, ignoring ghosts', () => {
    const status = document.querySelector('[data-status]');
    applyFilter(state());
    expect(status?.textContent).toBe('Showing 3 games.');

    applyFilter(state('classic'));
    expect(status?.textContent).toBe('Showing 1 game tagged classic.');
  });

  it('shows the empty state only when nothing matches', () => {
    const empty = document.querySelector<HTMLElement>('[data-empty]');
    applyFilter(state('puzzle', true));
    expect(empty?.hidden).toBe(false);
    expect(document.querySelector('[data-status]')?.textContent).toBe(
      'Showing 0 games tagged puzzle and that work with touch.',
    );
    applyFilter(state());
    expect(empty?.hidden).toBe(true);
  });

  it('announces to the live region only when announce is true', () => {
    const status = document.querySelector('[data-status]');
    applyFilter(state('arcade', true), { announce: false });
    expect(status?.textContent).toBe('');

    applyFilter(state('arcade', true));
    expect(status?.textContent).toBe('Showing 2 games tagged arcade and that work with touch.');

    applyFilter(state('classic'));
    expect(status?.textContent).toBe('Showing 1 game tagged classic.');

    applyFilter(state());
    expect(status?.textContent).toBe('Showing 3 games.');
  });

  it('tolerates a page without optional elements', () => {
    document.body.innerHTML = '';
    expect(() => applyFilter(state('arcade'))).not.toThrow();
    expect(root().dataset.tag).toBe('arcade');
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
