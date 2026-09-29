import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { CvParseError } from '@/lib/parse';
import { processUpload } from '@/lib/pipeline';
import { seedIfFirstRun } from '@/lib/seed';
import type { Role } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const err = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function GET() {
  try {
    await seedIfFirstRun();
    return NextResponse.json({ candidates: await getStore().list() });
  } catch (e) {
    return err((e as Error).message, 500);
  }
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err('Upload was not understood. Please choose a file and try again.', 400);
  }
  const file = form.get('file');
  const role = form.get('role');
  if (!(file instanceof File) || file.size === 0) return err('Please choose a CV file (PDF or DOCX).', 400);
  if (role !== 'PM' && role !== 'SPM') return err('Please select the role: PM or SPM.', 400);
  if (file.size > 5 * 1024 * 1024) return err('File is larger than 5 MB.', 400);

  try {
    const candidate = await processUpload(Buffer.from(await file.arrayBuffer()), file.name, role as Role);
    // AI failures don't lose the upload: the candidate is saved with scores and an ai_error.
    return NextResponse.json({ candidate, warning: candidate.ai_error ? `Scored, but the AI step failed: ${candidate.ai_error}` : null });
  } catch (e) {
    if (e instanceof CvParseError) return err(e.message, 422);
    return err((e as Error).message, 500);
  }
}
