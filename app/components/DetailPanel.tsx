'use client';

import { useEffect, useState } from 'react';
import type { Candidate, Role, RoleScore, Verdict } from '@/lib/types';
import { api, postJson, ROLE_NAME, type AppStatus } from '@/lib/client';
import { Alert, Avatar, Bar, btn, Icon, Modal, RoleChip, ScoreRing, Spinner, StatusBadge, TONE_TEXT } from './ui';
import { tone } from '@/lib/client';

type Tab = 'overview' | 'brief' | 'email' | 'cv';
const TABS: [Tab, string][] = [['overview', 'Scores'], ['brief', 'Interview brief'], ['email', 'Email'], ['cv', 'CV & privacy']];

function Breakdown({ title, rs, applied }: { title: string; rs: RoleScore; applied: boolean }) {
  return (
    <div className="rounded-2xl border border-blush-100 bg-gradient-to-b from-white to-ivory p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-display text-base font-semibold">{title}{applied && <span className="rounded-full bg-blush-100 px-2 py-0.5 text-[11px] font-medium text-blush-700">applied</span>}</h4>
        <span className={`font-display text-2xl font-semibold tabular-nums ${TONE_TEXT[tone(rs.total)]}`}>{rs.total}</span>
      </div>
      <ul className="space-y-3">
        {rs.dimensions.map((d) => (
          <li key={d.key}>
            <div className="mb-1 flex justify-between text-xs"><span className="text-slate-700">{d.label} <span className="text-slate-400">· {d.weight}%</span></span><span className="tabular-nums font-medium">{d.score}</span></div>
            <Bar value={d.score} />
            {d.evidence.length > 0 && <p className="mt-1 truncate text-[11px] text-slate-400">{d.evidence.join(' · ')}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BriefList({ title, items, icon, chip }: { title: string; items: string[]; icon: string; chip: string }) {
  return (
    <section>
      <h4 className="mb-2.5 font-display text-base font-semibold">{title}</h4>
      <ul className="space-y-2.5 text-sm leading-relaxed text-slate-700">{items.map((s, i) => <li key={i} className="flex gap-2.5"><span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${chip}`}><Icon name={icon} className="h-3 w-3" /></span><span>{s}</span></li>)}</ul>
    </section>
  );
}

export function DetailPanel({ c, status, onChange, onRemove, onBack, notify }: {
  c: Candidate; status: AppStatus | null; onChange: (c: Candidate) => void; onRemove: (id: string) => void; onBack: () => void; notify: (k: 'success' | 'error', t: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [to, setTo] = useState(c.email ?? '');
  const [subject, setSubject] = useState(c.draft_subject);
  const [body, setBody] = useState(c.draft_body);
  const [busy, setBusy] = useState<null | 'send' | 'redraft' | 'save'>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset local editor state when switching candidate or when the server draft changes (redraft).
  useEffect(() => { setTo(c.email ?? ''); setSubject(c.draft_subject); setBody(c.draft_body); setError(null); }, [c.id, c.draft_subject, c.draft_body, c.email]);
  useEffect(() => { setTab('overview'); }, [c.id]);

  const sent = c.status !== 'pending';
  const dirty = !sent && (subject !== c.draft_subject || body !== c.draft_body || to !== (c.email ?? ''));
  const other: Role = c.applied_role === 'PM' ? 'SPM' : 'PM';
  const otherScore = other === 'PM' ? c.pm_score : c.spm_score;
  const diff = otherScore - c.overall_score;
  const verdict = c.brief?.verdict;
  const validTo = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim());
  const emailOff = status ? !status.emailReady : false;

  async function run<T>(kind: 'send' | 'redraft' | 'save', fn: () => Promise<T>, ok?: string) {
    setBusy(kind); setError(null);
    try { const r = await fn(); if (ok) notify('success', ok); return r; }
    catch (e) {
      const msg = (e as Error).message;
      setError(msg); notify('error', msg);
      const cand = (e as { data?: { candidate?: Candidate } }).data?.candidate;
      if (cand) onChange(cand);
    } finally { setBusy(null); }
  }

  const redraft = (v?: Verdict) => run('redraft', async () => {
    const { candidate } = await api<{ candidate: Candidate }>(`/api/candidates/${c.id}/redraft`, postJson({ verdict: v }));
    onChange(candidate); setTab(v || c.brief ? 'email' : 'brief');
  }, v === 'interview' ? 'Redrafted as an interview invite.' : v === 'reject' ? 'Redrafted as a rejection.' : 'Draft regenerated.');

  const save = () => run('save', async () => {
    const { candidate } = await api<{ candidate: Candidate }>(`/api/candidates/${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft_subject: subject, draft_body: body, email: to }) });
    onChange(candidate);
  }, 'Draft saved.');

  const send = async () => {
    setConfirmSend(false);
    await run('send', async () => {
      const { candidate } = await api<{ candidate: Candidate }>(`/api/candidates/${c.id}/send`, postJson({ to, subject, body }));
      onChange(candidate);
    }, `Email sent to ${to.trim()}.`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-blush-100 bg-gradient-to-b from-blush-50/70 to-white px-6 py-5">
        <button onClick={onBack} className="mb-3 text-sm text-slate-500 hover:text-slate-800 lg:hidden">← All candidates</button>
        <div className="flex items-center gap-4">
          <Avatar name={c.name} size={48} />
          <div className="min-w-0 flex-1">
            <h2 data-testid="detail-name" className="truncate font-display text-2xl font-semibold">{c.name}</h2>
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><RoleChip role={c.applied_role} /> Applied for {ROLE_NAME[c.applied_role]}{c.sample && <span className="rounded-full bg-lav-100 px-2 py-0.5 text-[11px] text-lav-700">sample</span>}</p>
          </div>
          <ScoreRing value={c.overall_score} size={60} label="Overall fit" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status={c.status} />
          {diff >= 8 && <span className="rounded-full bg-lav-50 px-2.5 py-1 text-xs font-medium text-lav-700 ring-1 ring-inset ring-lav-200">Stronger fit for {other} (+{diff})</span>}
        </div>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-blush-100 px-4">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition ${tab === k ? 'border-blush-500 text-blush-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6" role="tabpanel">
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
        {c.ai_error && !c.brief && <Alert kind="warn" action={<button className={btn.secondary} onClick={() => redraft()} disabled={busy !== null}>{busy === 'redraft' ? <><Spinner /> Retrying…</> : 'Retry AI'}</button>}>Scores are saved but the AI step failed: {c.ai_error}</Alert>}

        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3 text-center">
              {(['PM', 'SPM'] as Role[]).map((r) => {
                const v = r === 'PM' ? c.pm_score : c.spm_score;
                return <div key={r} className={`flex items-center justify-center gap-3 rounded-2xl border p-3.5 shadow-soft ${r === c.applied_role ? 'border-blush-300 bg-blush-50/70' : 'border-lav-100 bg-lav-50/50'}`}><ScoreRing value={v} size={52} label={`${r} fit`} /><div className="text-left"><p className="font-display text-base font-semibold">{r} fit</p><p className="text-xs text-slate-500">{r === c.applied_role ? 'applied role' : 'other role'}</p></div></div>;
              })}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Breakdown title="PM rubric" rs={c.pm_breakdown} applied={c.applied_role === 'PM'} />
              <Breakdown title="SPM rubric" rs={c.spm_breakdown} applied={c.applied_role === 'SPM'} />
            </div>
          </>
        )}

        {tab === 'brief' && (c.brief ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span data-testid="verdict" className={`rounded-full px-3 py-1 text-sm font-semibold ${verdict === 'interview' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>Recommended: {verdict === 'interview' ? 'Interview' : 'Reject'}</span>
              <span className="text-sm text-slate-500">{c.brief.verdictReason}</span>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{c.brief.summary}</p>
            <div className="grid gap-6 md:grid-cols-2">
              <BriefList title="Strengths" items={c.brief.strengths} icon="check" chip="bg-emerald-100 text-emerald-700" />
              <BriefList title="Gaps" items={c.brief.gaps} icon="alert" chip="bg-amber-100 text-amber-700" />
            </div>
            <BriefList title="Suggested interview questions" items={c.brief.questions} icon="question" chip="bg-lav-100 text-lav-700" />
          </>
        ) : <p className="text-sm text-slate-500">No brief yet.</p>)}

        {tab === 'email' && (c.brief ? (
          <div className="space-y-4">
            {sent && <Alert kind="info">Sent {c.sent_at && new Date(c.sent_at).toLocaleString()} to {c.email}.</Alert>}
            {!sent && emailOff && <Alert kind="warn">Email isn’t set up yet. Add RESEND_API_KEY and EMAIL_FROM to .env.local to enable sending.</Alert>}
            {!sent && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500">Draft as:</span>
                <button className={btn.secondary} disabled={busy !== null} onClick={() => redraft('interview')}>Interview invite</button>
                <button className={btn.secondary} disabled={busy !== null} onClick={() => redraft('reject')}>Rejection</button>
                <button className={btn.secondary} disabled={busy !== null} onClick={() => redraft()}>{busy === 'redraft' ? <><Spinner /> Writing…</> : 'Regenerate'}</button>
              </div>
            )}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-600">To
                <input aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} disabled={sent} placeholder="candidate@email.com" className="mt-1 w-full rounded-xl border border-blush-200 bg-white px-3.5 py-2.5 text-sm focus:border-blush-400 disabled:bg-slate-50" />
                {!sent && !to && <span className="mt-1 block text-amber-600">No email address found in the CV. Enter one to send.</span>}
                {!sent && to && !validTo && <span className="mt-1 block text-rose-600">That doesn’t look like a valid email address.</span>}
                {!sent && c.sample && <span className="mt-1 block text-slate-500">Sample candidate: this address is fake. Change it to test sending to yourself.</span>}
              </label>
              <label className="block text-xs font-medium text-slate-600">Subject
                <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sent} className="mt-1 w-full rounded-xl border border-blush-200 bg-white px-3.5 py-2.5 text-sm focus:border-blush-400 disabled:bg-slate-50" />
              </label>
              <label className="block text-xs font-medium text-slate-600">Message
                <textarea aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} disabled={sent} rows={12} className="mt-1 w-full rounded-xl border border-blush-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed focus:border-blush-400 disabled:bg-slate-50" />
              </label>
            </div>
            {!sent && (
              <div className="flex flex-wrap items-center gap-3">
                <button className={btn.primary} disabled={busy !== null || !validTo || !subject.trim() || !body.trim() || emailOff} onClick={() => setConfirmSend(true)}>
                  {busy === 'send' ? <><Spinner /> Sending…</> : <><Icon name="mail" />{ verdict === 'interview' ? 'Review & send invite' : 'Review & send rejection'}</>}
                </button>
                {dirty && <button className={btn.secondary} disabled={busy !== null} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>}
                {dirty && <span className="text-xs text-slate-500">Unsaved changes</span>}
              </div>
            )}
          </div>
        ) : <p className="text-sm text-slate-500">No draft yet.</p>)}

        {tab === 'cv' && (
          <div className="space-y-4">
            <Alert kind="info">The AI only saw the text below. Your candidate’s name, email, phone, address and links were removed first and the name was replaced with “Candidate”. Model: {c.provider ?? 'not run'}.</Alert>
            <pre data-testid="ai-input" className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-800 p-4 text-xs leading-relaxed text-blush-50">{c.sanitized_text}</pre>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>File: {c.cv_filename}{c.phone ? '' : ''}</span>
              <button onClick={() => setConfirmDelete(true)} className="font-medium text-rose-600 hover:underline">Delete candidate</button>
            </div>
          </div>
        )}
      </div>

      <Modal open={confirmSend} onClose={() => setConfirmSend(false)} title={verdict === 'interview' ? 'Send interview invite?' : 'Send rejection?'}
        footer={<><button className={btn.secondary} onClick={() => setConfirmSend(false)}>Cancel</button><button className={btn.primary} onClick={send}>Send now</button></>}>
        <dl className="space-y-2 text-sm">
          <div><dt className="text-xs text-slate-500">To</dt><dd className="font-medium">{to.trim()}</dd></div>
          <div><dt className="text-xs text-slate-500">Subject</dt><dd className="font-medium">{subject}</dd></div>
          <div><dt className="text-xs text-slate-500">Message</dt><dd className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-blush-50/60 p-3">{body}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">This can’t be undone. The candidate’s status will change to {verdict === 'interview' ? 'Sent — Interview Invite' : 'Sent — Rejection'}.</p>
      </Modal>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${c.name}?`}
        footer={<><button className={btn.secondary} onClick={() => setConfirmDelete(false)}>Cancel</button><button className={btn.danger} onClick={() => { setConfirmDelete(false); onRemove(c.id); }}>Delete</button></>}>
        <p className="text-sm text-slate-600">This removes the candidate and their scores from the dashboard.</p>
      </Modal>
    </div>
  );
}
