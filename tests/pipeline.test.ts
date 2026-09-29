import { describe, expect, it, vi } from 'vitest';
import { getStore } from '@/lib/db';
import { NAME_TOKEN } from '@/lib/llm';
import { processText, renderDraft } from '@/lib/pipeline';
import { PII, sample, SAMPLES } from './helpers';

const GOOD = { summary: 's', strengths: ['a'], gaps: ['b'], questions: ['q'], verdict: 'interview', verdictReason: 'r', email: { subject: 'Hi', body: `Hi ${NAME_TOKEN}, welcome.` } };

describe('renderDraft', () => {
  it('re-attaches the first name and appends the signature', () => {
    expect(renderDraft(`Hi ${NAME_TOKEN},\nBody`, 'Aisha Rahman')).toBe('Hi Aisha,\nBody\n\nBest,\nJo\nAcme');
  });
  it('falls back to "there" for unknown names and replaces every token', () => {
    expect(renderDraft(`${NAME_TOKEN} / ${NAME_TOKEN}`, 'Unknown Candidate')).toContain('there / there');
  });
});

describe('processText', () => {
  it('scores, drafts with the real name, and persists', async () => {
    const c = await processText(sample('aisha-rahman.txt'), 'a.txt', 'SPM', { provider: 'mock' });
    expect(c.status).toBe('pending');
    expect(c.overall_score).toBe(c.spm_score);
    expect(c.draft_body).toContain('Hi Aisha,');
    expect(c.draft_body).not.toContain(NAME_TOKEN);
    expect((await getStore().get(c.id))?.name).toBe('Aisha Rahman');
  });

  // Critical privacy regression: what actually goes over the wire to the LLM.
  it.each(SAMPLES)('never sends personal details to the LLM (%s)', async (file) => {
    process.env.LLM_API_KEY = 'k';
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD) }] } }] }) });
    vi.stubGlobal('fetch', f);
    const c = await processText(sample(file), file, 'PM', { provider: 'gemini' });
    expect(f).toHaveBeenCalledTimes(1);
    const wire = JSON.stringify(f.mock.calls[0]);
    for (const p of PII[file]) expect(wire.toLowerCase()).not.toContain(p.toLowerCase());
    expect(c.brief).not.toBeNull();
    expect(c.provider).toBe('gemini');
  });

  it('keeps the candidate, with scores, when the AI call fails', async () => {
    process.env.LLM_API_KEY = 'bad';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid key' } }) }));
    const c = await processText(sample('daniel-okafor.txt'), 'd.txt', 'PM', { provider: 'gemini' });
    expect(c.brief).toBeNull();
    expect(c.ai_error).toContain('invalid key');
    expect(c.draft_body).toBe('');
    expect(c.pm_score).toBeGreaterThan(0);
    expect(await getStore().list()).toHaveLength(1);
  });
});
