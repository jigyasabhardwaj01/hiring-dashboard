import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// Save edits to the draft (subject/body) without sending.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const { draft_subject, draft_body, email } = await req.json();
    const patch: Record<string, string> = {};
    if (typeof draft_subject === 'string') patch.draft_subject = draft_subject;
    if (typeof draft_body === 'string') patch.draft_body = draft_body;
    if (typeof email === 'string') patch.email = email.trim();
    return NextResponse.json({ candidate: await getStore().update(id, patch) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await getStore().remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
