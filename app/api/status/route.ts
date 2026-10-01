import { NextResponse } from 'next/server';
import { cfg, emailReady, llmReady } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    llm: cfg.provider(),
    llmReady: llmReady(),
    emailReady: emailReady(),
    emailRedirect: cfg.emailRedirect() || null,
    storage: cfg.postgres() ? 'neon postgres' : cfg.supabase() ? 'supabase' : 'local file',
    threshold: cfg.threshold(),
  });
}
