import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, vi } from 'vitest';

let dir: string;
const CLEAR = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'LLM_API_KEY', 'LLM_MODEL', 'RESEND_API_KEY', 'EMAIL_FROM', 'INTERVIEW_THRESHOLD'];

// Every test gets an isolated temp data dir and NO real credentials: tests never touch Neon, Resend or an LLM.
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-test-'));
  for (const k of CLEAR) delete process.env[k];
  Object.assign(process.env, { DATA_DIR: dir, LLM_PROVIDER: 'mock', SEED_SAMPLE_DATA: 'false', COMPANY_NAME: 'Acme', FOUNDER_NAME: 'Jo' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});
