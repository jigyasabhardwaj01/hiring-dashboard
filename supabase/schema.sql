-- Run this once in the Supabase SQL editor.
create table if not exists candidates (
  id text primary key,
  created_at timestamptz not null default now(),
  name text not null,
  email text,
  phone text,
  applied_role text not null check (applied_role in ('PM','SPM')),
  cv_filename text not null,
  pm_score int not null,
  spm_score int not null,
  overall_score int not null,
  pm_breakdown jsonb not null,
  spm_breakdown jsonb not null,
  sanitized_text text not null,
  brief jsonb,
  ai_error text,
  provider text,
  draft_subject text not null default '',
  draft_body text not null default '',
  status text not null default 'pending' check (status in ('pending','invited','rejected')),
  sent_at timestamptz,
  sample boolean not null default false
);
-- Server-side only (service key). Keep RLS on so the anon key can never read PII.
alter table candidates enable row level security;
