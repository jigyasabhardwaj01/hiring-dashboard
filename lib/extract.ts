// Turns raw CV text into structured fields + a de-identified copy for the AI.
// Strategy (belt and braces):
//   1. Everything before the first section heading (name / contact block) is dropped.
//   2. Emails, phones, URLs and the candidate's name are scrubbed from what remains.
//   3. assertNoPII() re-checks the final text and throws if anything slipped through.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE =
  /\+\d[\d ().-]{8,}\d|\(\d{2,4}\)[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\b\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}\b|\b\d{10}\b/g;
const URLS = /(?:https?:\/\/|www\.)\S+|(?:linkedin|github|twitter|behance|dribbble)\.com\S*/gi;
const HEADING =
  /^(summary|professional summary|profile|objective|about( me)?|experience|work experience|professional experience|employment( history)?|education|skills|technical skills|core skills|projects|certifications|achievements|awards|publications|languages|interests)\s*:?\s*$/i;

export interface ExtractedCv {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  yearsExperience: number;
  sanitized: string;
}

function sections(lines: string[]) {
  const out: Record<string, string[]> = {};
  let current: string | null = null;
  const header: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (HEADING.test(t)) {
      current = t.toLowerCase().replace(/[:\s]+$/, '');
      out[current] = out[current] ?? [];
    } else if (current) out[current].push(line);
    else header.push(line);
  }
  return { header, out };
}

function pick(out: Record<string, string[]>, ...keys: string[]) {
  return keys.flatMap((k) => Object.entries(out).filter(([h]) => h.includes(k)).flatMap(([, v]) => v)).join('\n').trim();
}

function findName(header: string[], email: string | null): string {
  for (const l of header) {
    const m = l.match(/^\s*name\s*:\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  for (const l of header) {
    const t = l.trim();
    if (!t || /[@\d]/.test(t)) continue;
    const words = t.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w))) return t;
  }
  if (email) {
    const local = email.split('@')[0].replace(/[0-9]+/g, '');
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length) return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  }
  return 'Unknown Candidate';
}

function yearsFrom(text: string, fallbackText: string): number {
  const nowYear = new Date().getFullYear();
  const range =
    /(?:[A-Za-z]{3,9}\.?\s+)?((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(?:[A-Za-z]{3,9}\.?\s+)?((?:19|20)\d{2}|present|current|now)/gi;
  const src = text || fallbackText;
  const spans: [number, number][] = [];
  for (const m of src.matchAll(range)) {
    const s = +m[1];
    const e = /^\d/.test(m[2]) ? +m[2] : nowYear;
    if (e >= s && s > 1970) spans.push([s, Math.min(e, nowYear)]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const sp of spans) {
    if (!cur) cur = [...sp];
    else if (sp[0] <= cur[1]) cur[1] = Math.max(cur[1], sp[1]);
    else {
      total += cur[1] - cur[0];
      cur = [...sp];
    }
  }
  if (cur) total += cur[1] - cur[0];
  const explicit = [...fallbackText.matchAll(/(\d{1,2})\+?\s*(?:years|yrs)(?:\s+of)?\s+(?:[a-z-]+\s+){0,3}experience/gi)].map((m) => +m[1]);
  return Math.min(40, Math.max(total, ...explicit, 0));
}

function scrub(text: string, name: string): string {
  let t = text.replace(EMAIL, '').replace(URLS, '').replace(PHONE, '');
  const tokens = name.split(/\s+/).filter((w) => w.length >= 2);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (tokens.length) {
    t = t.replace(new RegExp(`\\b${esc(name)}\\b`, 'gi'), 'Candidate');
    for (const tok of tokens) if (tok.length >= 3) t = t.replace(new RegExp(`\\b${esc(tok)}\\b`, 'gi'), 'Candidate');
  }
  return t.replace(/(Candidate\s+){2,}/g, 'Candidate ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function assertNoPII(sanitized: string, name: string, email: string | null, phone: string | null) {
  const lower = sanitized.toLowerCase();
  const leaks: string[] = [];
  if (email && lower.includes(email.toLowerCase())) leaks.push('email');
  // Compare the last 9 digits so country-code / formatting differences can't hide a leak.
  const tail = phone?.replace(/\D/g, '').slice(-9) ?? '';
  if (tail.length >= 7 && sanitized.replace(/\D/g, '').includes(tail)) leaks.push('phone');
  if (name !== 'Unknown Candidate' && lower.includes(name.toLowerCase())) leaks.push('name');
  if (leaks.length) throw new Error(`De-identification failed (${leaks.join(', ')} still present); nothing was sent to the AI.`);
}

export function extractCv(raw: string): ExtractedCv {
  const text = raw.replace(/\r/g, '').replace(/ /g, ' ');
  const lines = text.split('\n');
  const email = text.match(EMAIL)?.[0] ?? null;
  const phone = text.match(PHONE)?.[0]?.trim() ?? null;

  const { header, out } = sections(lines);
  const hasHeadings = Object.keys(out).length > 0;
  const headerLines = hasHeadings ? header : lines.filter((l) => l.trim()).slice(0, 4);
  const name = findName(headerLines, email);
  const address =
    headerLines.find((l) => /\b\d+\s+\w+.*\b(street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|blvd|drive|dr\.?)\b|,\s*[A-Z]{2}\s+\d{5}|address\s*:/i.test(l))?.trim() ?? null;

  const experience = pick(out, 'experience', 'employment');
  const summary = pick(out, 'summary', 'profile', 'objective', 'about');
  const education = pick(out, 'education');
  const skills = pick(out, 'skills');
  const body = hasHeadings ? lines.slice(header.length).join('\n') : lines.slice(headerLines.length).join('\n');
  const sanitized = scrub(body, name);

  return {
    name,
    email,
    phone,
    address,
    summary,
    experience,
    education,
    skills,
    yearsExperience: yearsFrom(experience, body),
    sanitized,
  };
}
