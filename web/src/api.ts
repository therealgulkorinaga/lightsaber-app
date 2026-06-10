// API client. Identity is the Phase 1 dev user-switcher: X-User-Id from
// localStorage; the server enforces roles regardless (FR-9.7).

export interface User {
  id: string;
  name: string;
  role: 'author' | 'reviewer' | 'practice_lead' | 'analyst' | 'tenant_admin';
}

const USER_KEY = 'lsb_user_id';

export function currentUserId(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setCurrentUserId(id: string) {
  localStorage.setItem(USER_KEY, id);
}

export class ApiError extends Error {
  status: number;
  findings?: { level: string; code: string; field: string | null; message: string }[];
  constructor(status: number, body: any) {
    super(body?.error ?? `HTTP ${status}`);
    this.status = status;
    this.findings = body?.findings;
  }
}

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const uid = currentUserId();
  if (uid) headers['X-User-Id'] = uid;
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const get = <T = any>(url: string) => api<T>('GET', url);
export const post = <T = any>(url: string, body?: unknown) => api<T>('POST', url, body);
export const put = <T = any>(url: string, body?: unknown) => api<T>('PUT', url, body);
