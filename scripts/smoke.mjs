// Live smoke test: run against a RUNNING server (npm run build && npm start, or npm run dev).
//   npm run smoke                 -> http://localhost:3000
//   BASE=http://localhost:3100 npm run smoke
//   SMOKE_SEND_TO=you@example.com npm run smoke   -> also sends ONE real email (off by default)
// Everything it creates is deleted at the end.
import fs from 'fs';

const BASE = process.env.BASE || 'http://localhost:3000';
const fx = (f) => fs.readFileSync(new URL(`../tests/fixtures/${f}`, import.meta.url));
const txt = (f) => fs.readFileSync(new URL(`../sample-cvs/${f}`, import.meta.url));
let pass = 0, fail = 0, skipped = 0;
const created = [];

const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); return ok; };
const skip = (name, why) => { skipped++; console.log(`  - skipped ${name} (${why})`); };
const req = async (path, init) => { const r = await fetch(BASE + path, init); let j = null; try { j = await r.clone().json(); } catch {} return { status: r.status, json: j, res: r }; };
const upload = async (buf, name, role) => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); fd.append('role', role); const r = await req('/api/candidates', { method: 'POST', body: fd }); if (r.json?.candidate) created.push(r.json.candidate.id); return r; };
const post = (path, body) => req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

console.log(`Smoke testing ${BASE}`);
try {
  console.log('\nApp & config');
  const home = await fetch(BASE);
  check('home page renders', home.status === 200 && (await home.text()).includes('Hiring Dashboard'));
  const st = await req('/api/status');
  check('status endpoint', st.status === 200 && typeof st.json.llmReady === 'boolean', JSON.stringify(st.json));
  console.log(`    (ai=${st.json.llm} ready=${st.json.llmReady}, email=${st.json.emailReady}, storage=${st.json.storage})`);
  check('status leaks no secrets', !/re_[A-Za-z0-9_]{10,}|napi_|postgres(ql)?:\/\/|sk-[A-Za-z0-9]{10,}/i.test(JSON.stringify(st.json)));
  const list0 = await req('/api/candidates');
  check('list candidates', list0.status === 200 && Array.isArray(list0.json.candidates), JSON.stringify(list0.json).slice(0, 200));
  const before = list0.json.candidates.length;

  console.log('\nUpload pipeline (DOCX → PDF → TXT in one process)');
  const d = await upload(fx('daniel.docx'), 'daniel.docx', 'PM');
  check('DOCX upload ok', d.status === 200 && d.json.candidate?.name === 'Daniel Okafor', JSON.stringify(d.json).slice(0, 200));
  const p = await upload(fx('aisha.pdf'), 'aisha.pdf', 'SPM');
  check('PDF upload ok (after a DOCX)', p.status === 200 && p.json.candidate?.name === 'Aisha Rahman', JSON.stringify(p.json).slice(0, 200));
  const t = await upload(txt('mei-lin-zhou.txt'), 'mei.txt', 'PM');
  check('TXT upload ok', t.status === 200 && t.json.candidate?.name === 'Mei Lin Zhou');
  const cands = [d, p, t].map((r) => r.json.candidate).filter(Boolean);
  check('scores in range and SPM < PM for mid-level DOCX', cands.every((c) => c.pm_score >= 0 && c.spm_score <= 100) && d.json.candidate?.pm_score > d.json.candidate?.spm_score);
  check('personal details never in AI input', cands.every((c) => ![c.name.split(' ')[0], c.email, (c.phone || '').replace(/\D/g, '').slice(-7)].some((x) => x && c.sanitized_text.includes(x))));
  const persisted = await req('/api/candidates');
  check('uploads persisted in the database', persisted.json.candidates.length === before + cands.length, `${before} → ${persisted.json.candidates.length}`);

  console.log('\nError handling');
  const bad = await upload(Buffer.from('not a pdf'), 'broken.pdf', 'PM');
  check('corrupt PDF → 422 with readable message', bad.status === 422 && /broken\.pdf/.test(bad.json.error), JSON.stringify(bad.json));
  const exe = await upload(Buffer.from('x'.repeat(500)), 'cv.exe', 'PM');
  check('unsupported type → 422', exe.status === 422);
  const norole = await req('/api/candidates', { method: 'POST', body: (() => { const f = new FormData(); f.append('file', new Blob(['x']), 'a.txt'); return f; })() });
  check('missing role → 400', norole.status === 400);
  check('unknown candidate send → 404', (await post('/api/candidates/does-not-exist/send', { to: 'a@b.co', subject: 's', body: 'b' })).status === 404);

  const c = cands[0];
  if (c) {
    if (c.brief) {
      console.log('\nAI brief & draft');
      check('brief has strengths, gaps, questions, verdict', c.brief.strengths.length && c.brief.gaps.length && c.brief.questions.length && ['interview', 'reject'].includes(c.brief.verdict));
      check('draft addresses real first name; no template token left', c.draft_body.includes('Hi Daniel') && !c.draft_body.includes('{{'));
      const rd = await post(`/api/candidates/${c.id}/redraft`, { verdict: 'reject' });
      check('redraft as rejection', rd.status === 200 && rd.json.candidate.brief.verdict === 'reject' && rd.json.candidate.draft_body.includes('Daniel'), JSON.stringify(rd.json).slice(0, 200));
    } else {
      console.log('\nAI step unavailable — verifying graceful degradation');
      check('candidate saved with scores despite AI failure', !!c.ai_error && c.pm_score > 0, JSON.stringify(c.ai_error));
      check('upload response carries a visible warning', /AI step failed/.test(d.json.warning || ''));
      const rd = await post(`/api/candidates/${c.id}/redraft`, {});
      check('retry AI surfaces a visible error (502)', rd.status === 502 && !!rd.json.error, JSON.stringify(rd.json).slice(0, 200));
      skip('brief / redraft / send checks', 'no working AI provider configured');
    }

    console.log('\nEdit & send safety');
    const pt = await req(`/api/candidates/${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft_subject: 'Smoke subject', email: 'smoke@example.com' }) });
    check('PATCH saves draft edits', pt.status === 200 && pt.json.candidate.draft_subject === 'Smoke subject');
    const again = (await req('/api/candidates')).json.candidates.find((x) => x.id === c.id);
    check('edits persisted', again?.draft_subject === 'Smoke subject' && again.email === 'smoke@example.com');
    check('status untouched by upload/redraft/edit (never auto-sends)', cands.every((x) => x.status === 'pending') && again.status === 'pending' && !again.sent_at);
    check('invalid recipient rejected before any send', c.brief ? (await post(`/api/candidates/${c.id}/send`, { to: 'nope', subject: 's', body: 'b' })).status === 400 : true);
    if (process.env.SMOKE_SEND_TO && c.brief && st.json.emailReady) {
      const s = await post(`/api/candidates/${c.id}/send`, { to: process.env.SMOKE_SEND_TO, subject: '[Smoke test] Hiring Dashboard', body: 'Smoke test email.' });
      check(`REAL email sent to ${process.env.SMOKE_SEND_TO}`, s.status === 200 && s.json.candidate.status !== 'pending', JSON.stringify(s.json).slice(0, 300));
      check('second send blocked (409)', (await post(`/api/candidates/${c.id}/send`, { to: process.env.SMOKE_SEND_TO, subject: 's', body: 'b' })).status === 409);
    } else skip('real email send', 'set SMOKE_SEND_TO=you@example.com to enable');
  }
} catch (e) {
  check('smoke run completed without crashing', false, e.stack);
} finally {
  console.log('\nCleanup');
  for (const id of created) await req(`/api/candidates/${id}`, { method: 'DELETE' });
  const left = ((await req('/api/candidates')).json?.candidates ?? []).filter((x) => created.includes(x.id));
  check('test data removed', left.length === 0);
  console.log(`\n${fail === 0 ? 'SMOKE PASSED' : 'SMOKE FAILED'}: ${pass} passed, ${fail} failed, ${skipped} skipped`);
  process.exit(fail === 0 ? 0 : 1);
}
