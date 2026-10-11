// `.lean()` reads skip the models' toJSON transform, so their `_id`/`__v` would reach the wire
// while hydrated reads expose `id`. Normalize lean results so every endpoint has one shape.
export function publicize(value) {
  if (Array.isArray(value)) return value.map(publicize);
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  // BSON leaf values (ObjectId, Long, ...) stringify as they would through JSON anyway.
  if (typeof value._bsontype === 'string' || typeof value.toHexString === 'function') return value.toString();

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (key === '__v') continue;
    out[key === '_id' ? 'id' : key] = publicize(val);
  }
  return out;
}
