/**
 * Namespaced, JSON-encoded persistence. The SDK is the only code allowed to touch
 * `localStorage` (RULES §1, §3). Keys are stored as `dnlmn:<namespace>:<key>`.
 * When storage is unavailable or full (private mode, quota), values live in memory
 * for the rest of the session instead of throwing.
 */

export interface GameStorage {
  /** Read a value, or `fallback` if it's missing or unreadable. */
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  /** Keys (without the prefix) currently stored in this namespace. */
  keys(): string[];
  /** Remove every key in this namespace, and nothing else. */
  clear(): void;
}

/** The subset of the Web Storage API the SDK needs. Lets tests inject a fake. */
export interface StorageBackend {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_ROOT = 'dnlmn';
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

/** `window.localStorage` if it exists and actually accepts writes, else `null`. */
export function detectLocalStorage(): StorageBackend | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = `${STORAGE_ROOT}:__probe__`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * Create storage for one namespace: a game slug, or `global` for settings shared by every game.
 * Pass `backend: null` to force the in-memory fallback.
 */
export function createStorage(
  namespace: string,
  backend: StorageBackend | null | undefined = detectLocalStorage(),
): GameStorage {
  if (!NAMESPACE_PATTERN.test(namespace)) {
    throw new Error(`[games/sdk] invalid storage namespace "${namespace}"`);
  }
  const prefix = `${STORAGE_ROOT}:${namespace}:`;
  // Values that couldn't be persisted, kept so reads in this session stay consistent.
  const memory = new Map<string, string>();

  const read = (key: string): string | null => {
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      return backend?.getItem(prefix + key) ?? null;
    } catch {
      return null;
    }
  };

  return {
    get<T>(key: string, fallback: T): T {
      const raw = read(key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    set<T>(key: string, value: T): void {
      const raw = JSON.stringify(value);
      if (raw === undefined) return;
      try {
        if (!backend) throw new Error('no backend');
        backend.setItem(prefix + key, raw);
        memory.delete(key);
      } catch {
        memory.set(key, raw);
      }
    },
    remove(key: string): void {
      memory.delete(key);
      try {
        backend?.removeItem(prefix + key);
      } catch {
        // Nothing to do: the value is gone from memory, and the backend is unusable.
      }
    },
    keys(): string[] {
      const found = new Set(memory.keys());
      try {
        if (backend) {
          for (let i = 0; i < backend.length; i++) {
            const full = backend.key(i);
            if (full?.startsWith(prefix)) found.add(full.slice(prefix.length));
          }
        }
      } catch {
        // Fall through with the in-memory keys.
      }
      return [...found];
    },
    clear(): void {
      for (const key of this.keys()) this.remove(key);
    },
  };
}
