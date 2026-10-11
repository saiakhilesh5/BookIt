// Tiny TTL cache for read-heavy endpoints. Single-instance only; swap for Redis in a cluster.
const store = new Map();
const MAX_ENTRIES = 200;

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs) {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDeletePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function cached(key, ttlMs, compute) {
  const hit = cacheGet(key);
  if (hit !== undefined) return Promise.resolve(hit);
  return compute().then((value) => {
    cacheSet(key, value, ttlMs);
    return value;
  });
}
