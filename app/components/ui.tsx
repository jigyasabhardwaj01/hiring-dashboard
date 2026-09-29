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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className={`${TONE_STROKE[tone(value)]} transition-[stroke-dashoffset] duration-500`} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums ${TONE_TEXT[tone(value)]}`} style={{ fontSize: size * 0.32 }}>{value}</span>
    </div>
  );
}

export function Bar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-slate-200 ${className}`}>
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
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${role === 'SPM' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>{role}</span>;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const hue = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 45% 45%)` }}>{ini}</span>
  );
}

export function Alert({ kind = 'error', children, onClose, action }: { kind?: 'error' | 'warn' | 'info'; children: React.ReactNode; onClose?: () => void; action?: React.ReactNode }) {
  const s = { error: 'border-rose-200 bg-rose-50 text-rose-800', warn: 'border-amber-200 bg-amber-50 text-amber-900', info: 'border-sky-200 bg-sky-50 text-sky-900' }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${s}`}>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} disabled={locked} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
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
        <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${t.kind === 'success' ? 'bg-slate-900' : 'bg-rose-700'}`}>
          <span>{t.kind === 'success' ? '✓' : '⚠'}</span><span className="break-words">{t.text}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  );
  return { notify, view };
}

export const btn = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50',
  danger: 'inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50',
};

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}
