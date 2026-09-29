import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { cfg } from './config';
import { dataDir, getStore } from './db';
import { assertNoPII, extractCv } from './extract';
import { generate, NAME_TOKEN } from './llm';
import { parseCv } from './parse';
import { scoreBoth } from './scoring';
import type { Candidate, Role, RoleScore, Verdict } from './types';

const signature = () => `\n\nBest,\n${cfg.founder()}\n${cfg.company()}`;
const firstName = (name: string) => (name === 'Unknown Candidate' ? 'there' : name.split(/\s+/)[0]);

// The only place identity is re-attached to AI output.
export const renderDraft = (body: string, name: string) => body.split(NAME_TOKEN).join(firstName(name)) + signature();

export interface AiDraft {
  brief: Candidate['brief'];
  ai_error: string | null;
  provider: string | null;
  draft_subject: string;
  draft_body: string;
}

export async function runAi(
  c: Pick<Candidate, 'name' | 'sanitized_text' | 'applied_role' | 'pm_breakdown' | 'spm_breakdown'>,
  opts: { forceVerdict?: Verdict; provider?: string } = {}
): Promise<AiDraft> {
  try {
    const { result, provider } = await generate(
      {
        sanitized: c.sanitized_text,
        appliedRole: c.applied_role,
        scores: { PM: c.pm_breakdown, SPM: c.spm_breakdown } as Record<Role, RoleScore>,
        forceVerdict: opts.forceVerdict,
      },
      opts.provider
    );
    return {
      brief: result.brief,
      ai_error: null,
      provider,
      draft_subject: result.emailSubject,
      draft_body: renderDraft(result.emailBody, c.name),
    };
  } catch (e) {
    return { brief: null, ai_error: (e as Error).message, provider: null, draft_subject: '', draft_body: '' };
  }
}

export async function processText(
  text: string,
  filename: string,
  role: Role,
  opts: { sample?: boolean; provider?: string; fileBuffer?: Buffer } = {}
): Promise<Candidate> {
  const cv = extractCv(text);
  assertNoPII(cv.sanitized, cv.name, cv.email, cv.phone);
  const scores = scoreBoth(cv.sanitized, cv.yearsExperience);
  const id = randomUUID();

  const base = {
    name: cv.name,
    sanitized_text: cv.sanitized,
    applied_role: role,
    pm_breakdown: scores.PM,
    spm_breakdown: scores.SPM,
  };
  const ai = await runAi(base, { provider: opts.provider });

  const candidate: Candidate = {
    id,
    created_at: new Date().toISOString(),
    name: cv.name,
    email: cv.email,
    phone: cv.phone,
    applied_role: role,
    cv_filename: filename,
    pm_score: scores.PM.total,
    spm_score: scores.SPM.total,
    overall_score: scores[role].total,
    pm_breakdown: scores.PM,
    spm_breakdown: scores.SPM,
    sanitized_text: cv.sanitized,
    ...ai,
    status: 'pending',
    sent_at: null,
    sample: Boolean(opts.sample),
  };

  if (opts.fileBuffer) {
    const dir = path.join(dataDir(), 'uploads');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${id}${path.extname(filename).toLowerCase()}`), opts.fileBuffer);
  }
  await getStore().insert(candidate);
  return candidate;
}

export async function processUpload(buffer: Buffer, filename: string, role: Role) {
  const text = await parseCv(buffer, filename);
  return processText(text, filename, role, { fileBuffer: buffer });
}
