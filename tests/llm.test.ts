import { describe, expect, it, vi } from 'vitest';
import { generate, NAME_TOKEN, parseJson, validate } from '@/lib/llm';
import { extractCv } from '@/lib/extract';
import { scoreBoth } from '@/lib/scoring';
import { sample } from './helpers';

const cv = extractCv(sample('aisha-rahman.txt'));
const input = (over = {}) => ({ sanitized: cv.sanitized, appliedRole: 'SPM' as const, scores: scoreBoth(cv.sanitized, cv.yearsExperience), ...over });
const GOOD = {
  summary: 's', strengths: ['a'], gaps: ['b'], questions: ['q'], verdict: 'interview', verdictReason: 'r',
  email: { subject: 'Hi', body: `Hi ${NAME_TOKEN}, come in.` },
};
const stubFetch = (status: number, body: unknown) => {
  const f = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  vi.stubGlobal('fetch', f);
  return f;
};

describe('parseJson / validate', () => {
  it('extracts JSON wrapped in prose or code fences', () => {
    expect(parseJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('throws when there is no JSON', () => {
    expect(() => parseJson('nope')).toThrow(/no JSON/);
  });
  it('accepts a complete reply', () => {
    const r = validate(GOOD, input());
    expect(r.brief.verdict).toBe('interview');
    expect(r.emailBody).toContain(NAME_TOKEN);
  });
  it('rejects a reply with no email or no strengths/questions', () => {
    expect(() => validate({ ...GOOD, email: undefined }, input())).toThrow(/email/);
    expect(() => validate({ ...GOOD, strengths: [], questions: [] }, input())).toThrow(/incomplete/);
  });
  it('forced verdict always wins over the model verdict', () => {
    expect(validate(GOOD, input({ forceVerdict: 'reject' })).brief.verdict).toBe('reject');
  });
  it('coerces non-string list items and unknown verdicts safely', () => {
    const r = validate({ ...GOOD, strengths: [1, 'x'], verdict: 'maybe' }, input());
    expect(r.brief.strengths).toEqual(['1', 'x']);
    expect(r.brief.verdict).toBe('interview');
  });
});

describe('mock provider', () => {
  it('recommends interview at/above threshold and reject below', async () => {
    process.env.INTERVIEW_THRESHOLD = '65';
    expect((await generate(input({ appliedRole: 'SPM' }))).result.brief.verdict).toBe('interview');
    process.env.INTERVIEW_THRESHOLD = '101';
    expect((await generate(input())).result.brief.verdict).toBe('reject');
  });
  it('uses the name token and never a real name', async () => {
    const { result } = await generate(input());
    expect(result.emailBody).toContain(NAME_TOKEN);
    expect(JSON.stringify(result)).not.toMatch(/Aisha|Rahman/);
  });
});

describe('gemini provider', () => {
  it('sends the key in a header (not the URL), asks for JSON, and parses the reply', async () => {
    process.env.LLM_API_KEY = 'gem-key';
    const f = stubFetch(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD) }] } }] });
    const { result, provider } = await generate(input(), 'gemini');
    expect(provider).toBe('gemini');
    expect(result.brief.strengths).toEqual(['a']);
    const [url, init] = f.mock.calls[0];
    expect(url).toContain('/models/gemini-3.8-flash:generateContent');
    expect(url).not.toContain('gem-key');
    expect(init.headers['x-goog-api-key']).toBe('gem-key');
    expect(JSON.parse(init.body).generationConfig.responseMimeType).toBe('application/json');
  });
  it('honours LLM_MODEL', async () => {
    process.env.LLM_API_KEY = 'k';
    process.env.LLM_MODEL = 'gemini-2.5-pro';
    const f = stubFetch(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD) }] } }] });
    await generate(input(), 'gemini');
    expect(f.mock.calls[0][0]).toContain('gemini-2.5-pro');
  });
  it('surfaces API errors readably', async () => {
    process.env.LLM_API_KEY = 'k';
    stubFetch(400, { error: { message: 'API key not valid' } });
    await expect(generate(input(), 'gemini')).rejects.toThrow('Gemini API 400: API key not valid');
  });
  it('surfaces unparseable replies', async () => {
    process.env.LLM_API_KEY = 'k';
    stubFetch(200, { candidates: [{ content: { parts: [{ text: 'sorry, I cannot' }] } }] });
    await expect(generate(input(), 'gemini')).rejects.toThrow(/could not be understood/);
  });
});

describe('other providers and config errors', () => {
  it('anthropic and openai parse their response shapes', async () => {
    process.env.LLM_API_KEY = 'k';
    stubFetch(200, { content: [{ text: JSON.stringify(GOOD) }] });
    expect((await generate(input(), 'anthropic')).result.brief.summary).toBe('s');
    stubFetch(200, { choices: [{ message: { content: JSON.stringify(GOOD) } }] });
    expect((await generate(input(), 'openai')).result.brief.summary).toBe('s');
  });
  it('errors clearly with no key or an unknown provider', async () => {
    await expect(generate(input(), 'gemini')).rejects.toThrow(/No AI key/);
    process.env.LLM_API_KEY = 'k';
    await expect(generate(input(), 'nope')).rejects.toThrow(/Unknown LLM_PROVIDER/);
  });
});
