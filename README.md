# Hiring Dashboard

Upload a CV, pick the role (PM or Senior PM), and get a ranked score, an interview brief and a draft email.
**You stay in control: nothing is emailed until you click Send.**

```
Founder uploads CV + role
  → System parses the CV, strips personal details
  → System scores against BOTH the PM and SPM rubrics
  → AI (sees de-identified text only) writes the interview brief + draft email
  → System puts the real name back, saves, shows it on the dashboard
  → You edit the draft and click Send → Resend delivers it → status updates
```

## Run it (5 minutes)

Requires [Node.js 20+](https://nodejs.org).

```bash
cd hiring-dashboard
npm install
cp .env.example .env.local     # then edit .env.local (see below)
npm run dev
```

Open http://localhost:3000. On first run 4 sample candidates load automatically
(set `SEED_SAMPLE_DATA=false` to disable, or `npm run seed` to add them again).
You can also upload the files in `sample-cvs/` to try the real flow.

### `.env.local`

| Variable | What it's for |
|---|---|
| `LLM_PROVIDER` | `gemini`, `anthropic`, `openai`, or `mock` (offline demo writer, no key needed) |
| `LLM_API_KEY` | Your AI provider key |
| `LLM_MODEL` | Optional override (defaults: `gemini-2.5-flash` / `claude-sonnet-5-5` / `gpt-4o`) |
| `RESEND_API_KEY` | From resend.com |
| `EMAIL_FROM` | e.g. `Acme Hiring <hiring@acme.com>`. The domain must be verified in Resend |
| `DATABASE_URL` | Optional. Neon/Postgres connection string; the table is created automatically |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Optional. Leave blank to store data in `./data` on your computer |
| `COMPANY_NAME`, `FOUNDER_NAME` | Used in email copy and signature |
| `INTERVIEW_THRESHOLD` | Applied-role score needed to recommend an interview (default 65) |

Restart `npm run dev` after editing. The banner at the top of the page tells you what's missing.

### Using Supabase (optional)
1. Create a project, open the SQL editor, run `supabase/schema.sql`.
2. Put the project URL and the **service role** key in `.env.local`. This key is used server-side only; never expose it.

## How privacy works
- Everything before the first section heading (name, contact block) is dropped. Emails, phone numbers, links and the candidate's name are scrubbed from the rest.
- A guard (`assertNoPII` in `lib/extract.ts`) re-checks the final text and aborts if the name/email/phone is still present.
- The AI only sees "Candidate". Its email draft uses a `{{CANDIDATE_NAME}}` token; the system swaps in the real first name (`renderDraft` in `lib/pipeline.ts`).
- Each candidate card has **"What the AI saw"** so you can verify exactly what was sent.
- Limitation: scrubbing is rule-based. Unusual CV layouts (e.g. name only in a photo/header image, or personal info mid-document) can slip through, so skim "What the AI saw" for real CVs.

## How scoring works (`lib/scoring.ts`)
Six dimensions, weighted 0–100 per role (weights sum to 100):

| Dimension | PM | SPM |
|---|---|---|
| Product sense / strategy | 25 | 25 |
| Execution & delivery | 20 | 15 |
| Data / analytical | 15 | 10 |
| Stakeholder & cross-functional leadership | 15 | 20 |
| Communication (evidenced in CV) | 10 | 10 |
| Years of relevant experience | 15 | 20 |

Each dimension counts distinct evidence terms (e.g. "roadmap", "A/B test", "led a team") and
quantified results in the de-identified CV, compared with a per-role target: SPM needs more evidence
than PM. Years come from merged employment date ranges (or "N years of experience" statements); the ideal
is 4 years for PM and 8 for SPM. **Overall fit** = the score for the role applied for. A "Stronger fit for X"
tag appears when the other role scores 8+ points higher.

The scoring is a transparent keyword heuristic, not a judgement of quality. Tune the term lists and weights at the top of `lib/scoring.ts`.
Recommended verdict = interview if the applied-role score ≥ `INTERVIEW_THRESHOLD`; the AI can reason on top of that, and you can redraft as invite/rejection at any time.

## Errors you'll see (never silent)
- **CV can't be read** (corrupt, password-protected, scanned image, wrong type): red message under the upload form.
- **AI call fails**: the candidate is still saved with scores; the card shows the error and a **Retry AI** button.
- **Email fails**: red message on the card, status stays Pending, nothing is marked sent.
- **Storage/network problems**: shown at the top of the list.

## Project layout
```
app/page.tsx                 the dashboard UI
app/api/candidates/…         upload, list, edit, delete, redraft, send
lib/parse.ts                 PDF/DOCX → text
lib/extract.ts               field extraction + de-identification
lib/scoring.ts               rubrics
lib/llm.ts                   Anthropic / OpenAI / mock providers
lib/email.ts                 Resend
lib/db.ts                    Supabase or local JSON store
sample-cvs/                  4 fake CVs used as seed data
```
Uploaded CV files are kept in `data/uploads/` (local disk, even when Supabase is used for records).
The `data/` folder contains real candidate data once you use the app, so treat it accordingly.
