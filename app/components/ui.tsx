'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Role, Status } from '@/lib/types';
import { STATUS_LABEL, tone, type Tone } from '@/lib/client';

export const TONE_TEXT: Record<Tone, string> = { good: 'text-emerald-600', ok: 'text-amber-600', low: 'text-rose-600' };
export const TONE_BG: Record<Tone, string> = { good: 'bg-emerald-500', ok: 'bg-amber-500', low: 'bg-rose-500' };
const TONE_STROKE: Record<Tone, string> = { good: 'stroke-emerald-500', ok: 'stroke-amber-500', low: 'stroke-rose-500' };

export function ScoreRing({ value, size = 56, stroke = 6, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Score'} ${value} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-blush-100" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className={`${TONE_STROKE[tone(value)]} transition-[stroke-dashoffset] duration-500`} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums ${TONE_TEXT[tone(value)]}`} style={{ fontSize: size * 0.32 }}>{value}</span>
    </div>
  );
}

export function Bar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-blush-100/80 ${className}`}>
      <div className={`h-full rounded-full ${TONE_BG[tone(value)]} transition-[width] duration-500`} style={{ width: `${value}%` }} />
    </div>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  invited: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const STATUS_DOT: Record<Status, string> = { pending: 'bg-amber-500', invited: 'bg-emerald-500', rejected: 'bg-slate-400' };
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span data-testid="status-badge" className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${role === 'SPM' ? 'bg-lav-100 text-lav-700' : 'bg-blush-100 text-blush-700'}`}>{role}</span>;
}

const AVATAR_TONES = [
  'from-blush-200 to-blush-300 text-blush-900',
  'from-lav-200 to-lav-300 text-lav-900',
  'from-amber-100 to-blush-200 text-blush-900',
  'from-emerald-100 to-lav-200 text-slate-800',
  'from-blush-100 to-lav-200 text-lav-900',
];
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const tone = AVATAR_TONES[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold shadow-sm ring-2 ring-white ${tone}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>{ini}</span>
  );
}

const ICONS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4-4',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M15.5 3.2a3.5 3.5 0 0 1 0 6.6',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4 18-7z',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17.5 19 7',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h6',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  alert: 'M12 4 3 20h18L12 4zM12 10v4M12 17.5v.01',
  question: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  inbox: 'M3 13l3-8h12l3 8v6H3v-6zM3 13h5l1 3h6l1-3h5',
  pointer: 'M8 12h10M13 7l5 5-5 5M4 6v12',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 21l5-3 5 3-1.5-7',
};
export function Icon({ name, className = 'h-4 w-4' }: { name: keyof typeof ICONS | string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={ICONS[name]} /></svg>
  );
}

export function Alert({ kind = 'error', children, onClose, action }: { kind?: 'error' | 'warn' | 'info'; children: React.ReactNode; onClose?: () => void; action?: React.ReactNode }) {
  const s = { error: 'border-rose-200 bg-rose-50 text-rose-800', warn: 'border-amber-200 bg-amber-50 text-amber-900', info: 'border-lav-200 bg-lav-50 text-lav-900' }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${s}`}>
      <span className="min-w-0 flex-1 break-words">{children}</span>
      <span className="flex items-center gap-3">{action}{onClose && <button onClick={onClose} className="font-medium underline underline-offset-2">Dismiss</button>}</span>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, locked }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; locked?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !locked && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, locked]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-lift outline-none sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-blush-100 px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} disabled={locked} aria-label="Close" className="rounded-full p-1.5 text-slate-400 hover:bg-blush-50 hover:text-blush-700 disabled:opacity-40"><Icon name="x" /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-blush-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export interface Toast { id: number; kind: 'success' | 'error'; text: string }
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    if (kind === 'success') setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const view = (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm text-white shadow-lift ${t.kind === 'success' ? 'bg-slate-800' : 'bg-rose-700'}`}>
          <Icon name={t.kind === 'success' ? 'check' : 'alert'} className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{t.text}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="ml-2 opacity-70 hover:opacity-100"><Icon name="x" className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
  return { notify, view };
}

export const btn = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-blush-500 to-blush-600 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:from-blush-600 hover:to-blush-700 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blush-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-xl border border-blush-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blush-300 hover:bg-blush-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blush-600 disabled:cursor-not-allowed disabled:opacity-50',
  danger: 'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50',
};

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}
