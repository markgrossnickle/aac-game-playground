// The only sanctioned persistence for a game: a namespaced JSON blob in
// localStorage with a schema version and a migration hook. Keys never collide
// between games, and a broken or outdated blob falls back to defaults instead
// of crashing the game.

export interface StoreOptions<T> {
  /** Bump when the shape of T changes; `migrate` receives the old blob. */
  version: number;
  defaults: T;
  migrate?: (old: unknown, oldVersion: number) => T;
}

export interface Store<T> {
  /** Current state (mutable; call save() after changing it). */
  readonly state: T;
  save(): void;
  reset(): void;
  update(fn: (s: T) => void): void;
}

interface Envelope<T> {
  v: number;
  data: T;
}

export function createStore<T extends object>(gameId: string, opts: StoreOptions<T>): Store<T> {
  const key = `game:${gameId}`;
  let state: T = structuredClone(opts.defaults);

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const env = JSON.parse(raw) as Partial<Envelope<T>>;
      if (env && typeof env.v === "number" && env.data && typeof env.data === "object") {
        if (env.v === opts.version) {
          state = { ...structuredClone(opts.defaults), ...(env.data as T) };
        } else if (opts.migrate) {
          state = opts.migrate(env.data, env.v);
        }
      }
    }
  } catch {
    // Corrupt or unavailable storage: start from defaults.
  }

  const save = (): void => {
    try {
      const env: Envelope<T> = { v: opts.version, data: state };
      localStorage.setItem(key, JSON.stringify(env));
    } catch {
      // Private mode or quota: the game keeps working, progress just does not persist.
    }
  };

  return {
    get state() {
      return state;
    },
    save,
    reset() {
      state = structuredClone(opts.defaults);
      save();
    },
    update(fn) {
      fn(state);
      save();
    },
  };
}
