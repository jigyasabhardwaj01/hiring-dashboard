import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { runAi } from '@/lib/pipeline';
import type { Verdict } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Re-run the AI step (retry after a failure, or force an invite / rejection).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const forceVerdict: Verdict | undefined = body.verdict === 'interview' || body.verdict === 'reject' ? body.verdict : undefined;
    const store = getStore();
    const c = await store.get(id);
    if (!c) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
    if (c.status !== 'pending') return NextResponse.json({ error: 'An email was already sent to this candidate.' }, { status: 409 });
    const ai = await runAi(c, { forceVerdict, provider: c.sample && !process.env.LLM_API_KEY ? 'mock' : undefined });
    if (ai.ai_error && c.brief) return NextResponse.json({ error: `AI call failed: ${ai.ai_error}` }, { status: 502 });
    const updated = await store.update(id, ai);
    if (ai.ai_error) return NextResponse.json({ error: `AI call failed: ${ai.ai_error}`, candidate: updated }, { status: 502 });
    return NextResponse.json({ candidate: updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
