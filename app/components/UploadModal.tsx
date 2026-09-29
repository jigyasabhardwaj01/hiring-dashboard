'use client';

import { useRef, useState } from 'react';
import type { Candidate, Role } from '@/lib/types';
import { api } from '@/lib/client';
import { Alert, btn, Icon, Modal, Spinner } from './ui';

const ACCEPT = ['pdf', 'docx', 'txt'];

export function UploadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (c: Candidate, warning: string | null) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState<Role>('PM');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | null | undefined) {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPT.includes(ext)) return setError('Please choose a PDF or DOCX file.');
    if (f.size > 5 * 1024 * 1024) return setError('That file is larger than 5 MB.');
    setError(null);
    setFile(f);
  }

  async function submit() {
    if (!file) return setError('Choose a CV first.');
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.append('file', file); fd.append('role', role);
    try {
      const { candidate, warning } = await api<{ candidate: Candidate; warning: string | null }>('/api/candidates', { method: 'POST', body: fd });
      setFile(null);
      onDone(candidate, warning);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const close = () => { if (!busy) { setError(null); onClose(); } };

  return (
    <Modal open={open} onClose={close} locked={busy} title="Add a candidate"
      footer={<><button className={btn.secondary} onClick={close} disabled={busy}>Cancel</button><button className={btn.primary} onClick={submit} disabled={busy || !file}>{busy ? <><Spinner /> Analyzing…</> : 'Analyze CV'}</button></>}>
      <div className="space-y-5">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
          className={`rounded-2xl border-2 border-dashed p-7 text-center transition ${drag ? 'border-blush-400 bg-blush-50' : 'border-blush-200 bg-blush-50/40'}`}>
          <input ref={input} data-testid="cv-input" type="file" accept=".pdf,.docx,.txt" className="sr-only" id="cv-file" onChange={(e) => pick(e.target.files?.[0])} />
          {file ? (
            <div><p className="font-medium">{file.name}</p><p className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB · <button className="underline" onClick={() => { setFile(null); if (input.current) input.current.value = ''; }} disabled={busy}>remove</button></p></div>
          ) : (
            <label htmlFor="cv-file" className="cursor-pointer">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-blush-600 shadow-soft"><Icon name="file" className="h-5 w-5" /></span>
              <span className="mt-2 block text-sm font-medium text-blush-700 underline underline-offset-2">Choose a file</span>
              <span className="block text-xs text-slate-500">or drag and drop · PDF or DOCX · up to 5 MB</span>
            </label>
          )}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Applied for</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['PM', 'SPM'] as Role[]).map((r) => (
              <label key={r} className={`cursor-pointer rounded-xl border border-blush-200 px-3 py-3 text-sm transition hover:bg-blush-50 has-[:checked]:border-blush-500 has-[:checked]:bg-blush-50 has-[:checked]:ring-1 has-[:checked]:ring-blush-500 ${busy ? 'opacity-60' : ''}`}>
                <input type="radio" name="role" className="sr-only" checked={role === r} onChange={() => setRole(r)} disabled={busy} />
                <span className="block font-semibold">{r === 'PM' ? 'Product Manager' : 'Senior PM'}</span>
                <span className="text-xs text-slate-500">{r}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <p className="flex gap-2.5 rounded-xl bg-lav-50 p-3.5 text-xs leading-relaxed text-lav-900">
          <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" /><span>Name, email, phone, address and links are removed <b>before</b> anything is sent to the AI. The candidate is scored against both PM and SPM rubrics. This can take up to a minute.</span>
        </p>
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      </div>
    </Modal>
  );
}
