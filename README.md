# Hiring Dashboard

**Live app:** https://hiring-dashboard-inky.vercel.app · **Repo:** https://github.com/jigyasabhardwaj01/hiring-dashboard

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
| `LLM_MODEL` | Optional override (defaults: `gemini-3.8-flash` / `claude-sonnet-5-5` / `gpt-4o`) |
| `RESEND_API_KEY` | From resend.com |
| `EMAIL_REDIRECT_TO` | Optional test mode: every email is delivered to this address (subject shows the intended candidate). Use your Resend account email while on the sandbox sender; remove once your domain is verified |
| `EMAIL_FROM` | e.g. `Acme Hiring <hiring@acme.com>`. The domain must be verified in Resend |
| `DATABASE_URL` | Optional. Neon/Postgres connection string; the table is created automatically |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Optional. Leave blank to store data in `./data` on your computer |
| `COMPANY_NAME`, `FOUNDER_NAME` | Used in email copy and signature |
| `INTERVIEW_THRESHOLD` | Applied-role score needed to recommend an interview (default 65) |

Restart `npm run dev` after editing. The banner at the top of the page tells you what's missing.

### Using Supabase (optional)
1. Create a project, open the SQL editor, run `supabase/schema.sql`.
2. Put the project URL and the **service role** key in `.env.local`. This key is used server-side only; never expose it.

## Deploy (Vercel)
1. Push to GitHub (done), then on vercel.com choose **Add New → Project → import the repo** (framework: Next.js, no build settings needed).
2. Add these Environment Variables: `DATABASE_URL`, `LLM_PROVIDER`, `LLM_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `COMPANY_NAME`, `FOUNDER_NAME`.
3. Deploy and open the URL. There is no login: anyone with the link can use the app, so keep the URL private.

Notes: use a database (`DATABASE_URL`) when hosted; the local-file store doesn't persist on serverless hosts. The raw CV file is only kept on local disk when writable; hosted, the database holds the scores, de-identified text and contact details. Sample data is only auto-loaded for the local file store.

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

## Testing

```bash
npm test            # 78 unit / regression / API tests (no network, no real keys, isolated temp data)
npm run typecheck
npm run build && PORT=3100 npm start &
BASE=http://localhost:3100 npm run smoke     # live smoke test against a running server
```

- **Unit:** extraction, de-identification, scoring, years-of-experience, LLM parsing/validation, providers (Gemini/Anthropic/OpenAI request shape and error mapping), file store, PDF/DOCX/TXT parsing.
- **Regression (things that broke or must never break):** no personal details ever appear in the request sent to the AI; the draft has the real name and no `{{token}}`; an email is *never* sent by upload/redraft; a second send is refused (409); failed sends leave the status Pending; an AI failure still saves the candidate; PDFs still parse after DOCX (and repeatedly).
- **API tests** call the real route handlers (upload, list/seed, redraft, edit, delete, send with a stubbed Resend).
- **Smoke** hits the real server (and whatever database `.env.local` points at): page render, status, DOCX→PDF→TXT uploads, error paths, persistence, edit/save, safety checks, then deletes everything it created. It sends no email unless you set `SMOKE_SEND_TO=you@example.com`.

## Project layout
```
app/page.tsx                 the dashboard UI
app/api/candidates/…         upload, list, edit, delete, redraft, send
lib/parse.ts                 PDF/DOCX/TXT → text (unpdf, mammoth)
lib/extract.ts               field extraction + de-identification
lib/scoring.ts               rubrics
lib/llm.ts                   Anthropic / OpenAI / mock providers
lib/email.ts                 Resend
lib/db.ts                    Supabase or local JSON store
app/components/              UI: dashboard list, detail panel, upload modal
tests/  scripts/smoke.mjs    test suites and live smoke test
sample-cvs/                  4 fake CVs used as seed data
```
Uploaded CV files are kept in `data/uploads/` (local disk, even when Supabase is used for records).
The `data/` folder contains real candidate data once you use the app, so treat it accordingly.
