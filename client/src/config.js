
function resolveApiOrigin() {
  if (import.meta.env.DEV) {
    return '';
  }

  if (typeof window !== 'undefined') {
    const fromEnv = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '');
    const isDirectBackend =
      /^https?:\/\/(localhost|127\.0\.0\.1):5000$/i.test(fromEnv);
    if (fromEnv && !isDirectBackend) {
      return fromEnv;
    }
    return '';
  }

  return (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '');
}

export const API_ORIGIN = resolveApiOrigin();
export const API_BASE = `${API_ORIGIN}/api/chat`;

export function getSocketUrl() {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return import.meta.env.VITE_API_ORIGIN || 'http://localhost:5000';
}
