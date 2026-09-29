import fs from 'fs';
import path from 'path';
export const sample = (f: string) => fs.readFileSync(path.join(process.cwd(), 'sample-cvs', f), 'utf8');
export const SAMPLES = ['aisha-rahman.txt', 'daniel-okafor.txt', 'mei-lin-zhou.txt', 'rohan-verma.txt'];

export const PII: Record<string, string[]> = {
  'aisha-rahman.txt': ['Aisha', 'Rahman', 'aisha.rahman@example.com', '7700 900123', 'Park Lane', 'linkedin'],
  'daniel-okafor.txt': ['Daniel', 'Okafor', 'daniel.okafor@example.com', '555-0142', 'Market Street'],
  'mei-lin-zhou.txt': ['Zhou', 'meilin.zhou@example.com', '555-018-2244', 'Harbour Road'],
  'rohan-verma.txt': ['Rohan', 'Verma', 'rohan.verma@example.com', '98765 43210', 'MG Road'],
};

export const form = (fields: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};
export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
export const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
