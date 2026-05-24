export function ensureArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}
