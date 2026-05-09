const BASE = '';

let cachedCsrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  const res = await fetch(`${BASE}/api/csrf`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch CSRF token: ${res.status}`);
  const data = await res.json() as { csrfToken: string };
  cachedCsrfToken = data.csrfToken;
  return cachedCsrfToken;
}

export function invalidateCsrfToken(): void {
  cachedCsrfToken = null;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function csrfApi<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getCsrfToken();
  return api<T>(path, {
    ...options,
    headers: {
      'X-CSRF-Token': token,
      ...options.headers as Record<string, string>,
    },
  });
}

export const apiFetch = api;
export const csrfFetch = csrfApi;

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body: unknown) =>
  csrfApi<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) =>
  csrfApi<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T>(path: string) =>
  csrfApi<T>(path, { method: 'DELETE' });
