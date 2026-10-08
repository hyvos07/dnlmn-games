import { describe, expect, it } from 'vitest';
import { createStorage, detectLocalStorage, type StorageBackend } from './storage.ts';

function fakeBackend(): StorageBackend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

describe('createStorage', () => {
  it('prefixes keys with dnlmn:<namespace>:', () => {
    const backend = fakeBackend();
    createStorage('snake', backend).set('best', 5);
    expect([...backend.data.keys()]).toEqual(['dnlmn:snake:best']);
  });

  it('round-trips JSON values', () => {
    const s = createStorage('snake', fakeBackend());
    const values: unknown[] = [42, { a: [1, 2], b: 'x' }, [1, 'two', false], true, false, 'hello'];
    values.forEach((v, i) => {
      s.set(`k${i}`, v);
      expect(s.get(`k${i}`, 'fallback')).toEqual(v);
    });
  });

  it('returns the fallback for missing keys and corrupt JSON', () => {
    const backend = fakeBackend();
    const s = createStorage('snake', backend);
    expect(s.get('nope', 7)).toBe(7);
    backend.data.set('dnlmn:snake:bad', '{not json');
    expect(s.get('bad', 'fb')).toBe('fb');
  });

  it('keys() and clear() are scoped to the namespace', () => {
    const backend = fakeBackend();
    const a = createStorage('alpha', backend);
    const b = createStorage('beta', backend);
    backend.data.set('foreign', 'x');
    a.set('one', 1);
    a.set('two', 2);
    b.set('one', 9);
    expect(a.keys().sort()).toEqual(['one', 'two']);
    a.clear();
    expect(a.keys()).toEqual([]);
    expect(b.get('one', 0)).toBe(9);
    expect(backend.data.get('foreign')).toBe('x');
  });

  it('remove deletes a single key', () => {
    const s = createStorage('snake', fakeBackend());
    s.set('a', 1);
    s.remove('a');
    expect(s.get('a', 0)).toBe(0);
  });

  it.each(['Bad', '', 'a'])('throws on invalid namespace %j', (ns) => {
    expect(() => createStorage(ns, fakeBackend())).toThrow();
  });

  it('uses memory when backend is null', () => {
    const s = createStorage('snake', null);
    s.set('k', { v: 1 });
    expect(s.get('k', null)).toEqual({ v: 1 });
    expect(s.keys()).toEqual(['k']);
  });

  it('falls back to memory when setItem throws', () => {
    const backend = fakeBackend();
    backend.setItem = () => {
      throw new Error('quota');
    };
    const s = createStorage('snake', backend);
    s.set('k', 3);
    expect(s.get('k', 0)).toBe(3);
  });

  it('returns the fallback when getItem throws', () => {
    const backend = fakeBackend();
    backend.getItem = () => {
      throw new Error('denied');
    };
    expect(createStorage('snake', backend).get('k', 'fb')).toBe('fb');
  });

  it('set(key, undefined) is a no-op', () => {
    const backend = fakeBackend();
    const s = createStorage('snake', backend);
    s.set('k', undefined);
    expect(backend.data.size).toBe(0);
    expect(s.get('k', 'fb')).toBe('fb');
  });
});

describe('detectLocalStorage', () => {
  it('returns a usable object in happy-dom', () => {
    const ls = detectLocalStorage();
    expect(ls).not.toBeNull();
    ls?.setItem('x', '1');
    expect(ls?.getItem('x')).toBe('1');
    ls?.removeItem('x');
  });
});
