'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Candidate, Role, Status } from '@/lib/types';
import { api, timeAgo, type AppStatus } from '@/lib/client';
import { Alert, Avatar, Bar, btn, RoleChip, ScoreRing, StatusBadge, useToasts } from './components/ui';
import { UploadModal } from './components/UploadModal';
import { DetailPanel } from './components/DetailPanel';

type Sort = 'overall' | 'pm' | 'spm' | 'newest';
const STATUS_TABS: ['all' | Status, string][] = [['all', 'All'], ['pending', 'Pending'], ['invited', 'Invited'], ['rejected', 'Rejected']];

function Pill({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return <span title={detail} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}><span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />{label}</span>;
}

export default function Page() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState<'all' | Role>('all');
  const [fStatus, setFStatus] = useState<'all' | Status>('all');
  const [sort, setSort] = useState<Sort>('overall');
  const { notify, view: toastView } = useToasts();

  const load = useCallback(async () => {
    try { setCandidates((await api<{ candidates: Candidate[] }>('/api/candidates')).candidates); setLoadError(null); }
    catch (e) { setLoadError((e as Error).message); }
  }, []);
  useEffect(() => { load(); api<AppStatus>('/api/status').then(setStatus).catch(() => {}); }, [load]);

  const replace = (c: Candidate) => setCandidates((cs) => cs?.map((x) => (x.id === c.id ? c : x)) ?? null);
  async function remove(id: string) {
    try { await api(`/api/candidates/${id}`, { method: 'DELETE' }); setCandidates((cs) => cs?.filter((c) => c.id !== id) ?? null); setSelectedId(null); notify('success', 'Candidate deleted.'); }
    catch (e) { notify('error', (e as Error).message); }
  }

  const stats = useMemo(() => {
    const cs = candidates ?? [];
    return { total: cs.length, pending: cs.filter((c) => c.status === 'pending').length, invited: cs.filter((c) => c.status === 'invited').length, rejected: cs.filter((c) => c.status === 'rejected').length, avg: cs.length ? Math.round(cs.reduce((s, c) => s + c.overall_score, 0) / cs.length) : 0 };
  }, [candidates]);

  const visible = useMemo(() => {
    const key = { overall: (c: Candidate) => c.overall_score, pm: (c: Candidate) => c.pm_score, spm: (c: Candidate) => c.spm_score, newest: (c: Candidate) => +new Date(c.created_at) }[sort];
    const needle = q.trim().toLowerCase();
    return (candidates ?? []).filter((c) => (fRole === 'all' || c.applied_role === fRole) && (fStatus === 'all' || c.status === fStatus) && (!needle || c.name.toLowerCase().includes(needle))).sort((a, b) => key(b) - key(a));
  }, [candidates, fRole, fStatus, sort, q]);

  const selected = candidates?.find((c) => c.id === selectedId) ?? null;
  const count = (s: 'all' | Status) => (s === 'all' ? stats.total : stats[s]);
  const sel = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto"><h1 className="text-lg font-bold leading-tight">Hiring Dashboard</h1><p className="text-xs text-slate-500">PM & Senior PM screening · you approve every email</p></div>
          {status && (
            <div className="hidden items-center gap-2 md:flex" aria-label="System status">
              <Pill ok={status.llmReady && status.llm !== 'mock'} label={status.llm === 'mock' ? 'AI: demo mode' : status.llmReady ? `AI: ${status.llm}` : 'AI: no key'} detail={status.llm === 'mock' ? 'Template-based briefs; set LLM_PROVIDER and LLM_API_KEY' : status.llmReady ? 'AI provider configured' : 'Set LLM_API_KEY in .env.local'} />
              <Pill ok={status.emailReady} label={status.emailReady ? 'Email ready' : 'Email: not set up'} detail={status.emailReady ? 'Resend configured' : 'Set RESEND_API_KEY and EMAIL_FROM'} />
              <Pill ok label={`DB: ${status.storage}`} detail="Where candidates are stored" />
            </div>
          )}
          <button className={btn.primary} onClick={() => setUploadOpen(true)}>＋ Add candidate</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {status && (!status.llmReady || !status.emailReady || status.llm === 'mock') && (
          <Alert kind="warn">
            {status.llm === 'mock' && <>AI is in <b>demo mode</b>: briefs are template-based. </>}
            {!status.llmReady && <><b>AI isn’t configured</b>: scores work, but briefs and drafts need LLM_API_KEY. </>}
            {!status.emailReady && <><b>Email isn’t configured</b>: set RESEND_API_KEY and EMAIL_FROM to enable sending.</>}
          </Alert>
        )}

        <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {([['Candidates', stats.total, ''], ['Awaiting decision', stats.pending, 'text-amber-600'], ['Invited', stats.invited, 'text-emerald-600'], ['Rejected', stats.rejected, 'text-slate-500'], ['Average fit', stats.avg, '']] as const).map(([label, v, cls]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p data-testid={`kpi-${label.toLowerCase().replace(/ /g, '-')}`} className={`mt-1 text-2xl font-bold tabular-nums ${cls}`}>{v}</p></div>
          ))}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" aria-label="Search candidates" className={`${sel} w-full sm:w-56`} />
          <div role="group" aria-label="Filter by role" className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
            {(['all', 'PM', 'SPM'] as const).map((r) => <button key={r} onClick={() => setFRole(r)} aria-pressed={fRole === r} className={`px-3 py-2 ${fRole === r ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'}`}>{r === 'all' ? 'All roles' : r}</button>)}
          </div>
          <div role="group" aria-label="Filter by status" className="inline-flex flex-wrap gap-1 text-sm">
            {STATUS_TABS.map(([s, label]) => <button key={s} onClick={() => setFStatus(s)} aria-pressed={fStatus === s} className={`rounded-full px-3 py-1.5 ${fStatus === s ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50'}`}>{label} <span className="opacity-70">{count(s)}</span></button>)}
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-500">Sort
            <select className={sel} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by"><option value="overall">Overall fit</option><option value="pm">PM score</option><option value="spm">SPM score</option><option value="newest">Newest</option></select>
          </label>
        </div>

        {loadError && <Alert onClose={() => setLoadError(null)} action={<button className={btn.secondary} onClick={load}>Retry</button>}>{loadError}</Alert>}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className={selected ? 'hidden lg:block' : ''}>
            {candidates === null && !loadError && <ul className="space-y-2" aria-busy>{[0, 1, 2].map((i) => <li key={i} className="h-[76px] animate-pulse rounded-xl bg-slate-200/70" />)}</ul>}
            {candidates && candidates.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center"><p className="text-4xl" aria-hidden>📥</p><h3 className="mt-2 font-semibold">No candidates yet</h3><p className="mt-1 text-sm text-slate-500">Upload a CV to get a score, an interview brief and a draft email.</p><button className={`${btn.primary} mt-4`} onClick={() => setUploadOpen(true)}>＋ Add your first candidate</button></div>
            )}
            {candidates && candidates.length > 0 && visible.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No candidates match these filters.</p>}
            <ol className="space-y-2" aria-label="Ranked candidates">
              {visible.map((c, i) => (
                <li key={c.id}>
                  <button data-testid="candidate-row" onClick={() => setSelectedId(c.id)} aria-current={c.id === selectedId} className={`flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition hover:border-indigo-300 hover:shadow-sm ${c.id === selectedId ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200'}`}>
                    <span className="w-5 text-center text-sm font-semibold text-slate-400">{i + 1}</span>
                    <Avatar name={c.name} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate font-semibold">{c.name}</span><RoleChip role={c.applied_role} /></span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-slate-500"><span className="w-7">PM</span><Bar value={c.pm_score} className="w-14" /><span className="w-6 tabular-nums">{c.pm_score}</span><span className="w-8">SPM</span><Bar value={c.spm_score} className="w-14" /><span className="tabular-nums">{c.spm_score}</span></span>
                      <span className="mt-1.5 flex items-center gap-2"><StatusBadge status={c.status} /><span className="text-[11px] text-slate-400">{timeAgo(c.created_at)}</span></span>
                    </span>
                    <ScoreRing value={c.overall_score} size={48} label={`${c.name} overall fit`} />
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <aside className={`${selected ? '' : 'hidden lg:block'} overflow-hidden rounded-2xl border border-slate-200 bg-white lg:sticky lg:top-24 lg:h-[calc(100vh-7.5rem)]`} aria-label="Candidate details">
            {selected ? (
              <DetailPanel c={selected} status={status} onChange={replace} onRemove={remove} onBack={() => setSelectedId(null)} notify={notify} />
            ) : (
              <div className="flex h-full min-h-[20rem] flex-col items-center justify-center p-8 text-center text-slate-500"><p className="text-4xl" aria-hidden>👈</p><p className="mt-2 font-medium text-slate-700">Select a candidate</p><p className="text-sm">See scores, the interview brief and the draft email.</p></div>
            )}
          </aside>
        </div>
      </main>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={(c, warning) => {
        setCandidates((cs) => [...(cs ?? []), c]); setSelectedId(c.id); setUploadOpen(false);
        if (warning) notify('error', warning); else notify('success', `${c.name} added: fit ${c.overall_score}/100.`);
      }} />
      {toastView}
    </div>
  );
}
