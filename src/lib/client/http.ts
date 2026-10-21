'use client';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function http<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A 504 without our JSON means the host stopped a request that ran too long.
    const fallback = res.status === 504 ? 'That took too long, so the server stopped it. Try again?' : 'Something went wrong.';
    throw new ApiError((data as { error?: string }).error ?? fallback, res.status);
  }
  return data as T;
}
