import { promises as fs } from 'fs';
import path from 'path';
import { dataDir, getStore } from './db';
import { processText } from './pipeline';
import type { Role } from './types';

const SAMPLES: { file: string; role: Role }[] = [
  { file: 'aisha-rahman.txt', role: 'SPM' },
  { file: 'daniel-okafor.txt', role: 'SPM' },
  { file: 'mei-lin-zhou.txt', role: 'PM' },
  { file: 'rohan-verma.txt', role: 'PM' },
];
const marker = () => path.join(dataDir(), '.seeded');

export async function seedSamples(): Promise<number> {
  for (const s of SAMPLES) {
    const text = await fs.readFile(path.join(process.cwd(), 'sample-cvs', s.file), 'utf8');
    // Sample data always uses the offline demo writer so first run needs no API keys.
    await processText(text, s.file, s.role, { sample: true, provider: 'mock' });
  }
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(marker(), new Date().toISOString());
  return SAMPLES.length;
}

export async function seedIfFirstRun() {
  // Auto-seed only for the local file store; hosted/serverless filesystems can't hold the marker.
  if (process.env.SEED_SAMPLE_DATA === 'false' || getStore().kind !== 'file') return;
  try {
    await fs.access(marker());
    return;
  } catch {}
  if ((await getStore().list()).length === 0) await seedSamples();
  else await fs.writeFile(marker(), 'existing');
}
