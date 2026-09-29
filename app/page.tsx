'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Candidate, Role, RoleScore, Status, Verdict } from '@/lib/types';

interface AppStatus { llm: string; llmReady: boolean; emailReady: boolean; storage: string; threshold: number }

const STATUS_LABEL: Record<Status, string> = { pending: 'Pending', invited: 'Sent — Interview Invite', rejected: 'Sent — Rejection' };
const STATUS_STYLE: Record<Status, string> = {
  pending: 'bg-amber-100 text-amber-800',
  invited: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-slate-200 text-slate-700',
};
const scoreColor = (n: number) => (n >= 75 ? 'bg-emerald-500' : n >= 55 ? 'bg-amber-500' : 'bg-rose-500');
const scoreText = (n: number) => (n >= 75 ? 'text-emerald-700' : n >= 55 ? 'text-amber-700' : 'text-rose-700');

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Could not reach the server. Is the app still running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { data });
  return data as T;
}

function ErrorBox({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <span>{message}</span>
      {onClose && <button onClick={onClose} className="font-medium underline">Dismiss</button>}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 font-medium text-slate-500">{label}</span>
      <div className="h-2 w-24 rounded-full bg-slate-200"><div className={`h-2 rounded-full ${scoreColor(value)}`} style={{ width: `${value}%` }} /></div>
      <span className="w-7 tabular-nums font-semibold">{value}</span>
    </div>
  );
}

function Breakdown({ title, rs, applied }: { title: string; rs: RoleScore; applied: boolean }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{title} {applied && <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">applied</span>} <span className={scoreText(rs.total)}>{rs.total}</span></h4>
      <ul className="space-y-1.5">
        {rs.dimensions.map((d) => (
          <li key={d.key} title={d.evidence.join(', ')}>
            <div className="flex justify-between text-xs text-slate-600"><span>{d.label} <span className="text-slate-400">· {d.weight}%</span></span><span className="tabular-nums">{d.score}</span></div>
            <div className="h-1.5 rounded-full bg-slate-200"><div className={`h-1.5 rounded-full ${scoreColor(d.score)}`} style={{ width: `${d.score}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CandidateCard({ c, rank, onChange, onRemove }: { c: Candidate; rank: number; onChange: (c: Candidate) => void; onRemove: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(c.email ?? '');
  const [subject, setSubject] = useState(c.draft_subject);
  const [body, setBody] = useState(c.draft_body);
  const [busy, setBusy] = useState<'send' | 'redraft' | null>(null);
  const [error, setError] = useState<string | null>(c.ai_error ? `AI step failed: ${c.ai_error}` : null);
  const sent = c.status !== 'pending';
  const other: Role = c.applied_role === 'PM' ? 'SPM' : 'PM';
  const otherScore = other === 'PM' ? c.pm_score : c.spm_score;
  const betterElsewhere = otherScore >= c.overall_score + 8;

  useEffect(() => { setSubject(c.draft_subject); setBody(c.draft_body); setTo(c.email ?? ''); }, [c.draft_subject, c.draft_body, c.email]);

  async function send() {
    const kind = c.brief?.verdict === 'interview' ? 'interview invitation' : 'rejection';
    if (!confirm(`Send this ${kind} to ${to || '(no address)'}? This cannot be undone.`)) return;
    setBusy('send'); setError(null);
    try {
      const { candidate } = await api<{ candidate: Candidate }>(`/api/candidates/${c.id}/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, subject, body }) });
      onChange(candidate);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function redraft(verdict?: Verdict) {
    setBusy('redraft'); setError(null);
    try {
      const { candidate } = await api<{ candidate: Candidate }>(`/api/candidates/${c.id}/redraft`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verdict }) });
      onChange(candidate);
    } catch (e) {
      setError((e as Error).message);
      const cand = (e as { data?: { candidate?: Candidate } }).data?.candidate;
      if (cand) onChange(cand);
    } finally { setBusy(null); }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-left" aria-expanded={open}>
        <span className="w-6 text-lg font-semibold text-slate-400">{rank}</span>
        <span className="min-w-[10rem] flex-1">
          <span className="block font-semibold">{c.name} {c.sample && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">sample</span>}</span>
          <span className="text-sm text-slate-500">Applied: {c.applied_role === 'PM' ? 'Product Manager' : 'Senior PM'}</span>
          {betterElsewhere && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700">Stronger fit for {other}</span>}
        </span>
        <span className="text-center"><span className={`block text-2xl font-bold tabular-nums ${scoreText(c.overall_score)}`}>{c.overall_score}</span><span className="text-xs text-slate-500">overall fit</span></span>
        <span className="space-y-1"><ScoreBar label="PM" value={c.pm_score} /><ScoreBar label="SPM" value={c.spm_score} /></span>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-6 border-t border-slate-100 px-5 py-5">
          {error && <ErrorBox message={error} onClose={() => setError(null)} />}

          <div className="grid gap-8 md:grid-cols-2">
            <Breakdown title="PM rubric" rs={c.pm_breakdown} applied={c.applied_role === 'PM'} />
            <Breakdown title="SPM rubric" rs={c.spm_breakdown} applied={c.applied_role === 'SPM'} />
          </div>

          {c.brief ? (
            <section>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h3 className="text-base font-semibold">Interview brief</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${c.brief.verdict === 'interview' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  Recommended: {c.brief.verdict === 'interview' ? 'Interview' : 'Reject'}
                </span>
                <span className="text-xs text-slate-500">{c.brief.verdictReason}</span>
              </div>
              <p className="mb-4 text-sm text-slate-700">{c.brief.summary}</p>
              <div className="grid gap-6 md:grid-cols-3">
                {([['Strengths', c.brief.strengths], ['Gaps', c.brief.gaps], ['Suggested questions', c.brief.questions]] as const).map(([t, items]) => (
                  <div key={t}>
                    <h4 className="mb-1 text-sm font-semibold">{t}</h4>
                    <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              No brief yet. Scores are saved, but the AI step did not finish.
              <button disabled={busy !== null} onClick={() => redraft()} className="ml-3 rounded-md bg-amber-600 px-3 py-1 font-medium text-white disabled:opacity-50">{busy === 'redraft' ? 'Retrying…' : 'Retry AI'}</button>
            </div>
          )}

          {c.brief && (
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Draft email {sent && <span className="text-sm font-normal text-slate-500">— sent {c.sent_at && new Date(c.sent_at).toLocaleString()}</span>}</h3>
                {!sent && (
                  <div className="flex gap-2 text-xs">
                    <button disabled={busy !== null} onClick={() => redraft('interview')} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-100 disabled:opacity-50">Redraft as invite</button>
                    <button disabled={busy !== null} onClick={() => redraft('reject')} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-100 disabled:opacity-50">Redraft as rejection</button>
                    <button disabled={busy !== null} onClick={() => redraft()} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-100 disabled:opacity-50">Regenerate</button>
                  </div>
                )}
              </div>
              {busy === 'redraft' && <p className="mb-2 text-xs text-slate-500">Asking the AI…</p>}
              <label className="mb-2 block text-xs font-medium text-slate-600">To
                <input value={to} onChange={(e) => setTo(e.target.value)} disabled={sent} placeholder="candidate@email.com (not found in CV — enter it)" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100" />
              </label>
              <label className="mb-2 block text-xs font-medium text-slate-600">Subject
                <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sent} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100" />
              </label>
              <label className="block text-xs font-medium text-slate-600">Message
                <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={sent} rows={10} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100" />
              </label>
              {!sent && (
                <button onClick={send} disabled={busy !== null} className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {busy === 'send' ? 'Sending…' : c.brief.verdict === 'interview' ? 'Send interview invite' : 'Send rejection'}
                </button>
              )}
            </section>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-slate-600">What the AI saw (de-identified CV{c.provider ? ` · ${c.provider}` : ''})</summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{c.sanitized_text}</pre>
          </details>

          <div className="flex justify-between text-xs text-slate-400">
            <span>{c.cv_filename}</span>
            <button onClick={() => confirm(`Delete ${c.name}?`) && onRemove(c.id)} className="text-rose-500 hover:underline">Delete candidate</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function Page() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState<Role>('PM');
  const [fRole, setFRole] = useState<'all' | Role>('all');
  const [fStatus, setFStatus] = useState<'all' | Status>('all');
  const [sort, setSort] = useState<'overall' | 'pm' | 'spm' | 'newest'>('overall');

  const load = useCallback(async () => {
    try {
      setCandidates((await api<{ candidates: Candidate[] }>('/api/candidates')).candidates);
      setLoadError(null);
    } catch (e) { setLoadError((e as Error).message); }
  }, []);

  useEffect(() => { load(); api<AppStatus>('/api/status').then(setStatus).catch(() => {}); }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setUploadError('Please choose a CV file first.');
    setUploading(true); setUploadError(null); setWarning(null);
    const fd = new FormData();
    fd.append('file', file); fd.append('role', role);
    try {
      const { candidate, warning } = await api<{ candidate: Candidate; warning: string | null }>('/api/candidates', { method: 'POST', body: fd });
      setCandidates((cs) => [...(cs ?? []), candidate]);
      setWarning(warning); setFile(null);
      (e.target as HTMLFormElement).reset();
    } catch (err) { setUploadError((err as Error).message); } finally { setUploading(false); }
  }

  const replace = (c: Candidate) => setCandidates((cs) => cs?.map((x) => (x.id === c.id ? c : x)) ?? null);
  async function remove(id: string) {
    try { await api(`/api/candidates/${id}`, { method: 'DELETE' }); setCandidates((cs) => cs?.filter((c) => c.id !== id) ?? null); }
    catch (e) { setLoadError((e as Error).message); }
  }

  const visible = useMemo(() => {
    const key = { overall: (c: Candidate) => c.overall_score, pm: (c: Candidate) => c.pm_score, spm: (c: Candidate) => c.spm_score, newest: (c: Candidate) => +new Date(c.created_at) }[sort];
    return (candidates ?? []).filter((c) => (fRole === 'all' || c.applied_role === fRole) && (fStatus === 'all' || c.status === fStatus)).sort((a, b) => key(b) - key(a));
  }, [candidates, fRole, fStatus, sort]);

  const sel = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold">Hiring Dashboard</h1>
        <p className="text-slate-600">Upload a CV, get a ranked score, an interview brief and a draft email. Nothing is sent until you click Send.</p>
      </header>

      {status && (!status.llmReady || !status.emailReady || status.llm === 'mock') && (
        <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {status.llm === 'mock' && <p>AI is in <b>demo mode</b> (LLM_PROVIDER=mock): briefs are template-based, not written by an LLM.</p>}
          {!status.llmReady && <p><b>AI is not configured.</b> Scores will work, but briefs and drafts need LLM_API_KEY in .env.local.</p>}
          {!status.emailReady && <p><b>Email is not configured.</b> Set RESEND_API_KEY and EMAIL_FROM in .env.local before sending.</p>}
        </div>
      )}

      <form onSubmit={upload} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Add a candidate</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium">CV (PDF or DOCX)
            <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block text-sm" />
          </label>
          <fieldset className="text-sm">
            <legend className="font-medium">Applied for</legend>
            <div className="mt-1 flex gap-4">
              {(['PM', 'SPM'] as Role[]).map((r) => (
                <label key={r} className="flex items-center gap-1.5"><input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />{r === 'PM' ? 'Product Manager' : 'Senior PM'}</label>
              ))}
            </div>
          </fieldset>
          <button disabled={uploading} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{uploading ? 'Analyzing… (up to a minute)' : 'Analyze CV'}</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Name, email, phone and address are removed before anything is sent to the AI.</p>
        {uploadError && <div className="mt-3"><ErrorBox message={uploadError} onClose={() => setUploadError(null)} /></div>}
        {warning && <div className="mt-3"><ErrorBox message={warning} onClose={() => setWarning(null)} /></div>}
      </form>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">Filter</span>
        <select className={sel} value={fRole} onChange={(e) => setFRole(e.target.value as 'all' | Role)} aria-label="Filter by role"><option value="all">All roles</option><option value="PM">PM</option><option value="SPM">SPM</option></select>
        <select className={sel} value={fStatus} onChange={(e) => setFStatus(e.target.value as 'all' | Status)} aria-label="Filter by status"><option value="all">All statuses</option><option value="pending">Pending</option><option value="invited">Sent — Interview Invite</option><option value="rejected">Sent — Rejection</option></select>
        <span className="ml-4 font-medium">Sort</span>
        <select className={sel} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort"><option value="overall">Overall fit</option><option value="pm">PM score</option><option value="spm">SPM score</option><option value="newest">Newest</option></select>
        <span className="ml-auto text-slate-500">{visible.length} candidate{visible.length === 1 ? '' : 's'}</span>
      </div>

      {loadError && <ErrorBox message={loadError} />}
      {candidates === null && !loadError && <p className="text-slate-500">Loading…</p>}
      {candidates && visible.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No candidates match. Upload a CV above.</p>}
      <ul className="space-y-3">{visible.map((c, i) => <CandidateCard key={c.id} c={c} rank={i + 1} onChange={replace} onRemove={remove} />)}</ul>
    </main>
  );
}
