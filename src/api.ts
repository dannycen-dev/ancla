import type { DayLog, Plan } from './types'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Error ${res.status}`)
  }
  return data as T
}

export function apiMe() {
  return req<{ authenticated: boolean; username?: string }>('/api/auth/me')
}

export function apiLogin(username: string, password: string) {
  return req<{ ok: boolean; username: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function apiLogout() {
  return req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
}

export function apiPlan() {
  return req<{ plan: Plan }>('/api/plan')
}

export function apiGetLog(date: string) {
  return req<{ log: DayLog | null }>(`/api/logs/${date}`)
}

export function apiPutLog(date: string, payload: DayLog) {
  return req<{ ok: boolean }>(`/api/logs/${date}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function apiWeekLogs() {
  return req<{ logs: Record<string, DayLog> }>('/api/logs')
}
