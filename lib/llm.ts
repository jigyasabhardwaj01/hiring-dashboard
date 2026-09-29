import { cfg } from './config';
import type { Brief, Role, RoleScore, Verdict } from './types';

export interface AiResult {
  brief: Brief;
  emailSubject: string;
  emailBody: string; // contains {{CANDIDATE_NAME}}; the system swaps in the real name later
}
export interface AiInput {
  sanitized: string; // de-identified CV: the AI never sees PII
  appliedRole: Role;
  scores: Record<Role, RoleScore>;
  forceVerdict?: Verdict;
}

export const NAME_TOKEN = '{{CANDIDATE_NAME}}';
const ROLE_NAME: Record<Role, string> = { PM: 'Product Manager', SPM: 'Senior Product Manager' };

function scoreSummary(scores: Record<Role, RoleScore>) {
  return (['PM', 'SPM'] as Role[])
    .map((r) => `${r}: ${scores[r].total}/100 (${scores[r].dimensions.map((d) => `${d.label} ${d.score}`).join('; ')})`)
    .join('\n');
}

function decideVerdict(i: AiInput): Verdict {
  return i.forceVerdict ?? (i.scores[i.appliedRole].total >= cfg.threshold() ? 'interview' : 'reject');
}

const SYSTEM = `You help a startup founder screen Product Manager (PM) and Senior Product Manager (SPM) candidates.
The CV you receive is de-identified: the candidate is referred to only as "Candidate". Never guess, invent or mention a real name, employer contact details, email or phone number.
Be specific and evidence-based: cite things actually in the CV. Do not invent achievements.
Reply with ONLY a JSON object, no markdown fences, matching exactly:
{
 "summary": "2-3 sentence overview",
 "strengths": ["3-5 items"],
 "gaps": ["2-4 items"],
 "questions": ["5-7 tailored interview questions"],
 "verdict": "interview" | "reject",
 "verdictReason": "one sentence",
 "email": { "subject": "...", "body": "..." }
}
Email rules: greet with the literal text ${NAME_TOKEN} (e.g. "Hi ${NAME_TOKEN},"). Do NOT add a sign-off or signature; the system appends it. Keep it under 150 words, warm and professional.
- verdict "interview": invite them to a conversation, reference one or two specifics from their CV, ask them to reply with availability.
- verdict "reject": be kind and clear, give one honest, specific reason, make no false promises. If they look like a stronger fit for the other role, say so only if that role is actually open (both PM and SPM are).`;

function userPrompt(i: AiInput): string {
  const v = decideVerdict(i);
  return `Company: ${cfg.company()}
Applied role: ${ROLE_NAME[i.appliedRole]} (${i.appliedRole})
Rubric scores (0-100, computed by the system):
${scoreSummary(i.scores)}
Guideline: the system recommends "${v}" ${i.forceVerdict ? '(set by the founder, you must follow it)' : `(threshold ${cfg.threshold()} on the applied role, use your judgment but stay consistent with the scores)`}.

DE-IDENTIFIED CV:
"""
${i.sanitized.slice(0, 12000)}
"""`;
}

function parseJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI reply contained no JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

function validate(raw: any, i: AiInput): AiResult {
  const arr = (x: unknown) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  if (!raw?.email?.body || !raw?.email?.subject) throw new Error('AI reply was missing the email draft.');
  const verdict: Verdict = i.forceVerdict ?? (raw.verdict === 'reject' ? 'reject' : 'interview');
  const brief: Brief = {
    summary: String(raw.summary ?? ''),
    strengths: arr(raw.strengths),
    gaps: arr(raw.gaps),
    questions: arr(raw.questions),
    verdict,
    verdictReason: String(raw.verdictReason ?? ''),
  };
  if (!brief.strengths.length || !brief.questions.length) throw new Error('AI reply was incomplete (no strengths or questions).');
  return { brief, emailSubject: String(raw.email.subject), emailBody: String(raw.email.body) };
}

async function callAnthropic(i: AiInput): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cfg.llmKey(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model() || 'claude-sonnet-5-5',
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt(i) }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${data?.error?.message ?? 'request failed'}`);
  return data.content?.map((c: any) => c.text ?? '').join('') ?? '';
}

async function callOpenAI(i: AiInput): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.llmKey()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model() || 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt(i) },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${data?.error?.message ?? 'request failed'}`);
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(i: AiInput): Promise<string> {
  const model = cfg.model() || 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': cfg.llmKey(), 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt(i) }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${data?.error?.message ?? 'request failed'}`);
  return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
}

// Offline demo writer: builds the brief from rubric scores only. Used for sample data / no-key demos.
function mock(i: AiInput): AiResult {
  const rs = i.scores[i.appliedRole];
  const sorted = [...rs.dimensions].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, 3);
  const low = sorted.slice(-2);
  const verdict = decideVerdict(i);
  const other: Role = i.appliedRole === 'PM' ? 'SPM' : 'PM';
  const qFor: Record<string, string> = {
    product: 'Walk me through a product decision where you had to choose between two good options. How did you decide?',
    execution: 'Tell me about a launch that slipped. What did you do, and what would you change?',
    data: 'Describe a time data contradicted your intuition. What did you do next?',
    stakeholder: 'How do you handle an engineering lead who disagrees with your priorities?',
    communication: 'How do you write up a product bet so a busy exec can back or reject it in 5 minutes?',
    experience: 'Which past role best prepared you for this one, and why?',
  };
  const strengths = top.map((d) => `${d.label}: ${d.score}/100${d.evidence.length ? ` (CV mentions ${d.evidence.slice(0, 3).join(', ')})` : ''}`);
  const gaps = low.map((d) => `${d.label} looks thin on the CV (${d.score}/100)`);
  const questions = [...low, ...top].map((d) => qFor[d.key]).concat('What would your first 30 days look like here?');
  const brief: Brief = {
    summary: `Candidate scores ${rs.total}/100 for ${ROLE_NAME[i.appliedRole]} and ${i.scores[other].total}/100 for ${ROLE_NAME[other]}. (Demo writer: connect an LLM for a richer brief.)`,
    strengths,
    gaps,
    questions,
    verdict,
    verdictReason:
      verdict === 'interview'
        ? `Applied-role score ${rs.total} is at or above the ${cfg.threshold()} threshold.`
        : `Applied-role score ${rs.total} is below the ${cfg.threshold()} threshold.`,
  };
  const body =
    verdict === 'interview'
      ? `Hi ${NAME_TOKEN},\n\nThanks for applying for the ${ROLE_NAME[i.appliedRole]} role at ${cfg.company()}. Your background in ${top[0].label.toLowerCase()} stood out, and we'd love to talk with you.\n\nCould you reply with a few times over the next week for a 45-minute conversation?`
      : `Hi ${NAME_TOKEN},\n\nThank you for applying for the ${ROLE_NAME[i.appliedRole]} role at ${cfg.company()} and for the time you put in. After reviewing your background, we've decided not to move forward: we're looking for more depth in ${low[0].label.toLowerCase()} right now.\n\nWe appreciate your interest and wish you the best.`;
  return {
    brief,
    emailSubject: verdict === 'interview' ? `Interview invitation: ${ROLE_NAME[i.appliedRole]} at ${cfg.company()}` : `Your application to ${cfg.company()}`,
    emailBody: body,
  };
}

export async function generate(i: AiInput, provider = cfg.provider()): Promise<{ result: AiResult; provider: string }> {
  if (provider === 'mock') return { result: mock(i), provider };
  if (!cfg.llmKey()) throw new Error('No AI key configured. Set LLM_API_KEY in .env.local (or LLM_PROVIDER=mock for the demo writer).');
  let text: string;
  if (provider === 'anthropic') text = await callAnthropic(i);
  else if (provider === 'openai') text = await callOpenAI(i);
  else if (provider === 'gemini') text = await callGemini(i);
  else throw new Error(`Unknown LLM_PROVIDER "${provider}". Use gemini, anthropic, openai or mock.`);
  try {
    return { result: validate(parseJson(text), i), provider };
  } catch (e) {
    throw new Error(`AI reply could not be understood: ${(e as Error).message}`);
  }
}
