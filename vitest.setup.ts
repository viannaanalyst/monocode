// Node's experimental `localStorage` global is `undefined` unless the runtime is
// started with `--localstorage-file`, which shadows the DOM implementation that
// happy-dom installs. Tests that read `localStorage` directly then crash, so we
// back it with an in-memory store whenever the environment has no usable one.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: shim,
    configurable: true,
  });
}
