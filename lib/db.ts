import { promises as fs } from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';
import { cfg } from './config';
import type { Candidate } from './types';

export interface Store {
  kind: 'supabase' | 'file' | 'postgres';
  list(): Promise<Candidate[]>;
  get(id: string): Promise<Candidate | null>;
  insert(c: Candidate): Promise<void>;
  update(id: string, patch: Partial<Candidate>): Promise<Candidate>;
  remove(id: string): Promise<void>;
}

export const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'candidates.json');

const fileStore: Store = {
  kind: 'file',
  async list() {
    try {
      return JSON.parse(await fs.readFile(FILE, 'utf8'));
    } catch (e: any) {
      if (e.code === 'ENOENT') return [];
      throw new Error(`Could not read local database (${FILE}): ${e.message}`);
    }
  },
  async get(id) {
    return (await this.list()).find((c) => c.id === id) ?? null;
  },
  async insert(c) {
    const all = await this.list();
    all.push(c);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(all, null, 2));
  },
  async update(id, patch) {
    const all = await this.list();
    const i = all.findIndex((c) => c.id === id);
    if (i < 0) throw new Error('Candidate not found.');
    all[i] = { ...all[i], ...patch };
    await fs.writeFile(FILE, JSON.stringify(all, null, 2));
    return all[i];
  },
  async remove(id) {
    await fs.writeFile(FILE, JSON.stringify((await this.list()).filter((c) => c.id !== id), null, 2));
  },
};

function supabaseStore(): Store {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
  const fail = (what: string, e: { message: string }) => new Error(`Supabase ${what} failed: ${e.message}`);
  return {
    kind: 'supabase',
    async list() {
      const { data, error } = await sb.from('candidates').select('*');
      if (error) throw fail('read', error);
      return data as Candidate[];
    },
    async get(id) {
      const { data, error } = await sb.from('candidates').select('*').eq('id', id).maybeSingle();
      if (error) throw fail('read', error);
      return data as Candidate | null;
    },
    async insert(c) {
      const { error } = await sb.from('candidates').insert(c);
      if (error) throw fail('insert', error);
    },
    async update(id, patch) {
      const { data, error } = await sb.from('candidates').update(patch).eq('id', id).select().single();
      if (error) throw fail('update', error);
      return data as Candidate;
    },
    async remove(id) {
      const { error } = await sb.from('candidates').delete().eq('id', id);
      if (error) throw fail('delete', error);
    },
  };
}

// Neon / any Postgres via DATABASE_URL. Table is created automatically on first use.
const JSON_COLS = ['pm_breakdown', 'spm_breakdown', 'brief'];
let ready: Promise<unknown> | null = null;

function postgresStore(): Store {
  const sql = neon(process.env.DATABASE_URL!);
  const q = async (text: string, params: unknown[] = []) => {
    try {
      ready ??= sql.query(`create table if not exists candidates (
        id text primary key, created_at timestamptz not null default now(), name text not null, email text, phone text,
        applied_role text not null, cv_filename text not null, pm_score int not null, spm_score int not null, overall_score int not null,
        pm_breakdown jsonb not null, spm_breakdown jsonb not null, sanitized_text text not null, brief jsonb, ai_error text, provider text,
        draft_subject text not null default '', draft_body text not null default '', status text not null default 'pending',
        sent_at timestamptz, sample boolean not null default false)`);
      await ready;
      return (await sql.query(text, params)) as Candidate[];
    } catch (e) {
      ready = null;
      throw new Error(`Database error: ${(e as Error).message}`);
    }
  };
  const vals = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => (JSON_COLS.includes(k) && v !== null ? JSON.stringify(v) : v));
  const iso = (c: Candidate) => ({ ...c, created_at: new Date(c.created_at).toISOString(), sent_at: c.sent_at ? new Date(c.sent_at).toISOString() : null });
  return {
    kind: 'postgres',
    async list() {
      return (await q('select * from candidates order by created_at')).map(iso);
    },
    async get(id) {
      const r = await q('select * from candidates where id = $1', [id]);
      return r[0] ? iso(r[0]) : null;
    },
    async insert(c) {
      const keys = Object.keys(c);
      await q(`insert into candidates (${keys.join(',')}) values (${keys.map((k, i) => `$${i + 1}${JSON_COLS.includes(k) ? '::jsonb' : ''}`).join(',')})`, vals(c as any));
    },
    async update(id, patch) {
      const keys = Object.keys(patch);
      const r = await q(
        `update candidates set ${keys.map((k, i) => `${k} = $${i + 1}${JSON_COLS.includes(k) ? '::jsonb' : ''}`).join(',')} where id = $${keys.length + 1} returning *`,
        [...vals(patch as any), id]
      );
      if (!r[0]) throw new Error('Candidate not found.');
      return iso(r[0]);
    },
    async remove(id) {
      await q('delete from candidates where id = $1', [id]);
    },
  };
}

export const getStore = (): Store => (cfg.postgres() ? postgresStore() : cfg.supabase() ? supabaseStore() : fileStore);
