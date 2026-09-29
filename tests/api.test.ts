import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/candidates/route';
import { DELETE, PATCH } from '@/app/api/candidates/[id]/route';
import { POST as REDRAFT } from '@/app/api/candidates/[id]/redraft/route';
import { POST as SEND } from '@/app/api/candidates/[id]/send/route';
import { GET as STATUS } from '@/app/api/status/route';
import { ctx, form, json, sample } from './helpers';

const upload = (file = 'aisha-rahman.txt', role = 'SPM') =>
  POST(new Request('http://x/api/candidates', { method: 'POST', body: form({ file: new File([sample(file)], file), role }) }));
const add = async (file = 'aisha-rahman.txt', role = 'SPM') => (await (await upload(file, role)).json()).candidate;
const list = async () => (await (await GET()).json()).candidates;
const resendOk = () => {
  const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'em_1' }) });
  vi.stubGlobal('fetch', f);
  process.env.RESEND_API_KEY = 're_test';
  process.env.EMAIL_FROM = 'Hiring <hiring@acme.test>';
  return f;
};

describe('GET /api/candidates + seeding', () => {
  it('seeds 4 samples once on first run and does not reseed after deletion', async () => {
    delete process.env.SEED_SAMPLE_DATA;
    const first = await list();
    expect(first).toHaveLength(4);
    expect(first.every((c: any) => c.sample && c.brief)).toBe(true);
    for (const c of first) await DELETE(new Request('http://x'), ctx(c.id));
    expect(await list()).toHaveLength(0);
  });
  it('SEED_SAMPLE_DATA=false keeps it empty', async () => {
    expect(await list()).toEqual([]);
  });
  it('sample data covers both verdicts', async () => {
    delete process.env.SEED_SAMPLE_DATA;
    const verdicts = new Set((await list()).map((c: any) => c.brief.verdict));
    expect(verdicts).toEqual(new Set(['interview', 'reject']));
  });
});

describe('POST /api/candidates (upload)', () => {
  it('processes a CV: 200, scored, drafted, stored, raw file kept', async () => {
    const res = await upload();
    const { candidate: c, warning } = await res.json();
    expect(res.status).toBe(200);
    expect(warning).toBeNull();
    expect(c).toMatchObject({ name: 'Aisha Rahman', applied_role: 'SPM', status: 'pending', email: 'aisha.rahman@example.com' });
    expect(fs.existsSync(path.join(process.env.DATA_DIR!, 'uploads', `${c.id}.txt`))).toBe(true);
    expect(await list()).toHaveLength(1);
  });
  it('400s on missing file, bad role, or oversized file', async () => {
    const r = (fields: any) => POST(new Request('http://x', { method: 'POST', body: form(fields) }));
    expect((await r({ role: 'PM' })).status).toBe(400);
    expect((await r({ file: new File(['x'], 'a.txt'), role: 'CEO' })).status).toBe(400);
    expect((await r({ file: new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.pdf'), role: 'PM' })).status).toBe(400);
    expect((await POST(new Request('http://x', { method: 'POST', body: 'not a form' }))).status).toBe(400);
  });
  it('422s with a readable message on an unreadable CV and saves nothing', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: form({ file: new File(['garbage'], 'bad.pdf'), role: 'PM' }) }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/bad\.pdf/);
    expect(await list()).toHaveLength(0);
  });
  it('still saves the candidate and returns a warning when the AI fails', async () => {
    process.env.LLM_PROVIDER = 'gemini'; // no key
    const res = await upload();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.warning).toMatch(/AI step failed/);
    expect(body.candidate.brief).toBeNull();
    expect(body.candidate.pm_score).toBeGreaterThan(0);
  });
  it('NEVER sends an email during upload or redraft', async () => {
    const f = resendOk();
    const c = await add();
    await REDRAFT(new Request('http://x', json({ verdict: 'reject' })), ctx(c.id));
    expect(f.mock.calls.filter(([u]) => String(u).includes('resend'))).toHaveLength(0);
  });
});

describe('POST /api/candidates/:id/send', () => {
  const body = (c: any, over = {}) => json({ to: c.email, subject: c.draft_subject, body: c.draft_body, ...over });

  it('sends exactly once via Resend with the edited text, then marks the status', async () => {
    const f = resendOk();
    const c = await add('aisha-rahman.txt', 'SPM'); // interview
    const res = await SEND(new Request('http://x', body(c, { body: 'Edited by founder' })), ctx(c.id));
    const out = (await res.json()).candidate;
    expect(res.status).toBe(200);
    expect(out.status).toBe('invited');
    expect(out.sent_at).toBeTruthy();
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.authorization).toBe('Bearer re_test');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ from: 'Hiring <hiring@acme.test>', to: ['aisha.rahman@example.com'], text: 'Edited by founder' });
  });
  it('marks rejections as "rejected"', async () => {
    resendOk();
    const c = await add('rohan-verma.txt', 'PM');
    expect(c.brief.verdict).toBe('reject');
    expect((await (await SEND(new Request('http://x', body(c)), ctx(c.id))).json()).candidate.status).toBe('rejected');
  });
  it('refuses a second send (409) and does not call Resend again', async () => {
    const f = resendOk();
    const c = await add();
    await SEND(new Request('http://x', body(c)), ctx(c.id));
    const again = await SEND(new Request('http://x', body(c)), ctx(c.id));
    expect(again.status).toBe(409);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('is a visible failure, and status stays pending, when Resend rejects', async () => {
    process.env.RESEND_API_KEY = 're';
    process.env.EMAIL_FROM = 'a@b.co';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'domain not verified' }) }));
    const c = await add();
    const res = await SEND(new Request('http://x', body(c)), ctx(c.id));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/NOT sent.*domain not verified/);
    expect((await list())[0].status).toBe('pending');
  });
  it('is a visible failure when email is not configured', async () => {
    const c = await add();
    const res = await SEND(new Request('http://x', body(c)), ctx(c.id));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/not configured/);
  });
  it('validates recipient, subject/body, existence and that a draft exists', async () => {
    const f = resendOk();
    const c = await add();
    expect((await SEND(new Request('http://x', body(c, { to: 'nope' })), ctx(c.id))).status).toBe(400);
    expect((await SEND(new Request('http://x', body(c, { subject: ' ' })), ctx(c.id))).status).toBe(400);
    expect((await SEND(new Request('http://x', body(c)), ctx('missing'))).status).toBe(404);
    process.env.LLM_PROVIDER = 'gemini';
    const noBrief = await add('daniel-okafor.txt', 'PM');
    expect((await SEND(new Request('http://x', body(noBrief, { to: 'a@b.co', subject: 's', body: 'b' })), ctx(noBrief.id))).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('redraft / edit / delete / status', () => {
  it('redraft can force an invite or a rejection and keeps the real name', async () => {
    const c = await add('rohan-verma.txt', 'PM');
    const res = await REDRAFT(new Request('http://x', json({ verdict: 'interview' })), ctx(c.id));
    const out = (await res.json()).candidate;
    expect(out.brief.verdict).toBe('interview');
    expect(out.draft_body).toContain('Hi Rohan,');
    expect(out.draft_subject).toMatch(/Interview/);
  });
  it('redraft retries a failed AI step and clears the error', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    const c = await add();
    expect(c.ai_error).toBeTruthy();
    process.env.LLM_PROVIDER = 'mock';
    const out = (await (await REDRAFT(new Request('http://x', json({})), ctx(c.id))).json()).candidate;
    expect(out.ai_error).toBeNull();
    expect(out.brief).not.toBeNull();
  });
  it('a failed redraft returns 502 and keeps the previous brief', async () => {
    const c = await add();
    process.env.LLM_PROVIDER = 'gemini';
    const res = await REDRAFT(new Request('http://x', json({})), ctx(c.id));
    expect(res.status).toBe(502);
    expect((await list())[0].brief).not.toBeNull();
  });
  it('redraft is blocked (409) after sending, and 404s for unknown ids', async () => {
    resendOk();
    const c = await add();
    await SEND(new Request('http://x', json({ to: c.email, subject: 's', body: 'b' })), ctx(c.id));
    expect((await REDRAFT(new Request('http://x', json({})), ctx(c.id))).status).toBe(409);
    expect((await REDRAFT(new Request('http://x', json({})), ctx('nope'))).status).toBe(404);
  });
  it('PATCH saves draft edits and DELETE removes', async () => {
    const c = await add();
    const p = await PATCH(new Request('http://x', json({ draft_subject: 'S', draft_body: 'B', email: ' x@y.co ' })), ctx(c.id));
    expect((await p.json()).candidate).toMatchObject({ draft_subject: 'S', draft_body: 'B', email: 'x@y.co' });
    expect((await DELETE(new Request('http://x'), ctx(c.id))).status).toBe(200);
    expect(await list()).toHaveLength(0);
  });
  it('status reports configuration, never secrets', async () => {
    process.env.RESEND_API_KEY = 'secret-re';
    process.env.EMAIL_FROM = 'a@b.co';
    process.env.LLM_API_KEY = 'secret-llm';
    const text = await (await STATUS()).text();
    expect(JSON.parse(text)).toMatchObject({ emailReady: true, llmReady: true, storage: 'local file' });
    expect(text).not.toMatch(/secret/);
  });
});
