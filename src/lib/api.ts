const defaultApiBase = import.meta.env.DEV ? '/api' : 'https://guestbook-9z8.pages.dev/api';

export const API_BASE = (import.meta.env.PUBLIC_API_BASE || defaultApiBase).replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
