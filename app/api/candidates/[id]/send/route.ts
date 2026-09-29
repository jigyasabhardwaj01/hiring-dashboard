import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';

// The ONLY place an email is ever sent, and only in response to the founder's click.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fail = (m: string, s: number) => NextResponse.json({ error: m }, { status: s });
  try {
    const { to, subject, body } = await req.json();
    const store = getStore();
    const c = await store.get(id);
    if (!c) return fail('Candidate not found.', 404);
    if (c.status !== 'pending') return fail('An email was already sent to this candidate.', 409);
    if (!c.brief) return fail('There is no AI draft yet. Regenerate the draft first.', 400);
    if (typeof to !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) return fail('Enter a valid recipient email address.', 400);
    if (!subject?.trim() || !body?.trim()) return fail('Subject and message cannot be empty.', 400);

    try {
      await sendEmail(to.trim(), subject.trim(), body);
    } catch (e) {
      return fail(`Email was NOT sent. ${(e as Error).message}`, 502);
    }
    const updated = await store.update(id, {
      email: to.trim(),
      draft_subject: subject,
      draft_body: body,
      status: c.brief.verdict === 'interview' ? 'invited' : 'rejected',
      sent_at: new Date().toISOString(),
    });
    return NextResponse.json({ candidate: updated });
  } catch (e) {
    return fail((e as Error).message, 500);
  }
}
