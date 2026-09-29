import { describe, expect, it } from 'vitest';
import { getStore } from '@/lib/db';
import { processText } from '@/lib/pipeline';
import { sample } from './helpers';

describe('file store', () => {
  it('starts empty and reports a missing candidate as null', async () => {
    expect(await getStore().list()).toEqual([]);
    expect(await getStore().get('nope')).toBeNull();
  });
  it('inserts, updates, and removes', async () => {
    const s = getStore();
    const c = await processText(sample('mei-lin-zhou.txt'), 'm.txt', 'PM', { provider: 'mock' });
    expect(await s.list()).toHaveLength(1);
    const u = await s.update(c.id, { draft_subject: 'new' });
    expect(u.draft_subject).toBe('new');
    expect((await s.get(c.id))?.draft_subject).toBe('new');
    await s.remove(c.id);
    expect(await s.list()).toEqual([]);
  });
  it('throws when updating a missing candidate', async () => {
    await expect(getStore().update('nope', { name: 'x' })).rejects.toThrow(/not found/);
  });
  it('falls back to the file store unless DATABASE_URL / Supabase is set', () => {
    expect(getStore().kind).toBe('file');
  });
});
