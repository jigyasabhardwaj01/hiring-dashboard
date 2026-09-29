import type { Role, Status } from './types';

export interface AppStatus { llm: string; llmReady: boolean; emailReady: boolean; storage: string; threshold: number }

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw Object.assign(new Error('Could not reach the server. Is the app still running?'), { data: undefined });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { data });
  return data as T;
}

export const postJson = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const STATUS_LABEL: Record<Status, string> = { pending: 'Pending', invited: 'Sent — Interview Invite', rejected: 'Sent — Rejection' };
export const ROLE_NAME: Record<Role, string> = { PM: 'Product Manager', SPM: 'Senior Product Manager' };

export type Tone = 'good' | 'ok' | 'low';
export const tone = (n: number): Tone => (n >= 75 ? 'good' : n >= 55 ? 'ok' : 'low');
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
