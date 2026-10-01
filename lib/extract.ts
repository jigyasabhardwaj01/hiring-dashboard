// Turns raw CV text into structured fields + a de-identified copy for the AI.
// Strategy (belt and braces):
//   1. Everything before the first section heading (name / contact block) is dropped.
//   2. Emails, phones, URLs and the candidate's name are scrubbed from what remains.
//   3. assertNoPII() re-checks the final text and throws if anything slipped through.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE =
  /\+\d[\d ().-]{8,}\d|\(\d{2,4}\)[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\b\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}\b|\b\d{10}\b|\b\d{5}[\s.-]\d{5}\b/g;
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

// ---- candidate name detection -------------------------------------------------------------------------
// Real CVs often put the name in a sidebar/graphic, doubled in two cases ("ROHAN MEHTARohan Mehta"), or on the same
// line as the email. So: scan the WHOLE document, split jammed text apart, score plausible names, and fall back to
// the file name ("05_ishaan_roy.pdf") and then the email address.
const NOT_NAME_WORDS = new Set(
  ('summary profile objective about experience work professional employment history education academic qualifications skills technical core competencies projects certifications achievements awards publications languages interests synopsis development ' +
    'product manager senior associate lead leader head director vice president engineer developer analyst consultant designer founder cofounder operations strategy marketing business delivery data growth program project technology software intern officer executive specialist advisory corporate ' +
    'curriculum vitae resume cv contact email phone mobile linkedin github address present current references declaration personal details ' +
    'new delhi bangalore bengaluru mumbai pune hyderabad chennai kolkata gurgaon gurugram noida india city state remote full time part ' +
    'university college institute school management science arts commerce engineering technology bachelor master degree').split(/\s+/)
);
const GENERIC_EMAIL = new Set(['squad', 'info', 'contact', 'hello', 'admin', 'mail', 'jobs', 'careers', 'hr', 'resume', 'cv', 'test', 'candidate', 'user', 'me']);
const FILE_NOISE = new Set(['cv', 'resume', 'curriculum', 'vitae', 'final', 'updated', 'new', 'copy', 'profile', 'application', 'pdf', 'docx', 'doc', 'txt', 'pm', 'spm', 'v1', 'v2', 'v3']);

const toTitle = (w: string) => (w === w.toUpperCase() || w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);
const titleCase = (n: string) => n.split(/\s+/).map(toTitle).join(' ');

function isPlausibleName(seg: string): boolean {
  const words = seg.trim().split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (HEADING.test(seg.trim())) return false;
  return words.every((w) => /^[A-Z][A-Za-z.'-]*$/.test(w) && w.replace(/[.'-]/g, '').length >= 2 && !NOT_NAME_WORDS.has(w.toLowerCase().replace(/[.'-]/g, '')));
}

export function nameFromFilename(filename?: string): string | null {
  if (!filename) return null;
  const base = filename.replace(/\.[A-Za-z0-9]+$/, '');
  const tokens = base.split(/[\s_.\-()]+/).filter((t) => /^[A-Za-z]{2,}$/.test(t) && !FILE_NOISE.has(t.toLowerCase()));
  return tokens.length >= 2 && tokens.length <= 4 ? tokens.map(toTitle).join(' ') : null;
}

function nameFromEmail(email: string | null): string | null {
  if (!email) return null;
  const parts = email.split('@')[0].split(/[._-]+/).map((p) => p.replace(/\d+/g, '')).filter(Boolean);
  if (parts.length < 2 || parts.some((p) => p.length < 2 || GENERIC_EMAIL.has(p.toLowerCase()) || /squad/i.test(p))) return null;
  return parts.map(toTitle).join(' ');
}

function findName(lines: string[], email: string | null, filename?: string): string {
  for (const l of lines) {
    const m = l.match(/^\s*name\s*:\s*(.+)$/i);
    if (m) return titleCase(m[1].trim());
  }
  const fileName = nameFromFilename(filename);
  const fileKey = fileName?.toLowerCase().replace(/[^a-z]/g, '');
  const best = new Map<string, { name: string; score: number }>();
  lines.forEach((line, i) => {
    const hadEmail = EMAIL.test(line);
    EMAIL.lastIndex = 0;
    const cleaned = line.replace(EMAIL, ' | ').replace(URLS, ' | ').replace(PHONE, ' | ');
    // split jammed text: "MEHTARohan" / "MukherjeeAVINASH" / separators
    const segs = cleaned.replace(/([a-z])([A-Z])/g, '$1|$2').replace(/([A-Z])([A-Z][a-z])/g, '$1|$2').split(/[|•·,;:\t]+|\s{2,}/).map((x) => x.trim()).filter(Boolean);
    const seen = new Map<string, number>();
    for (const seg of segs) if (isPlausibleName(seg)) seen.set(seg.toLowerCase(), (seen.get(seg.toLowerCase()) ?? 0) + 1);
    for (const seg of segs) {
      if (!isPlausibleName(seg)) continue;
      const key = seg.toLowerCase().replace(/[^a-z]/g, '');
      let score = 0;
      if (fileKey && key === fileKey) score += 3;
      if ((seen.get(seg.toLowerCase()) ?? 0) >= 2) score += 3; // same name twice in one line, e.g. UPPER + Title
      if (i < 3) score += 2;
      if (hadEmail) score += 1;
      if (score === 0) continue;
      const prev = best.get(key);
      const pretty = seg === seg.toUpperCase() ? titleCase(seg) : seg;
      if (!prev || score > prev.score || (score === prev.score && seg !== seg.toUpperCase() && prev.name === prev.name.toUpperCase())) best.set(key, { name: pretty, score: Math.max(score, prev?.score ?? 0) });
    }
  });
  const top = [...best.values()].sort((a, b) => b.score - a.score)[0];
  if (top && top.score >= 2) return top.name;
  return fileName ?? nameFromEmail(email) ?? 'Unknown Candidate';
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

function scrub(text: string, name: string, phone: string | null): string {
  let t = text.replace(EMAIL, '').replace(URLS, '').replace(PHONE, '').replace(/(^|[\s(])@[A-Za-z0-9_.]{2,}/g, '$1'); // also social @handles
  // remove any leftover copy of the phone number, however it was spaced
  const digits = phone?.replace(/\D/g, '').slice(-10) ?? '';
  if (digits.length >= 8) t = t.replace(new RegExp(digits.split('').join('[\\s.-]*'), 'g'), '');
  const tokens = name.split(/\s+/).filter((w) => w.length >= 2);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (tokens.length && name !== 'Unknown Candidate') {
    t = t.replace(new RegExp(esc(name), 'gi'), 'Candidate');
    // long tokens are replaced even when glued to other text ("MEHTARohan"); short ones only as whole words
    for (const tok of tokens) t = t.replace(new RegExp(tok.length >= 4 ? esc(tok) : `\\b${esc(tok)}\\b`, 'gi'), 'Candidate');
  }
  return t
    .split('\n')
    .filter((l) => l.replace(/Candidate|[^A-Za-z]/g, '').length > 0 || !l.includes('Candidate')) // drop lines that are only the name
    .join('\n')
    .replace(/@/g, '')
    .replace(/(Candidate[\s-]*){2,}/g, 'Candidate ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

export function extractCv(raw: string, filename?: string): ExtractedCv {
  const text = raw.replace(/\r/g, '').replace(/ /g, ' ');
  const lines = text.split('\n');
  const email = text.match(EMAIL)?.[0] ?? null;
  const phone = text.match(PHONE)?.[0]?.trim() ?? null;

  const { header, out } = sections(lines);
  const hasHeadings = Object.keys(out).length > 0;
  const headerLines = hasHeadings ? header : lines.filter((l) => l.trim()).slice(0, 4);
  const name = findName(lines, email, filename);
  const address =
    headerLines.find((l) => /\b\d+\s+\w+.*\b(street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|blvd|drive|dr\.?)\b|,\s*[A-Z]{2}\s+\d{5}|address\s*:/i.test(l))?.trim() ?? null;

  const experience = pick(out, 'experience', 'employment');
  const summary = pick(out, 'summary', 'profile', 'objective', 'about');
  const education = pick(out, 'education');
  const skills = pick(out, 'skills');
  const body = hasHeadings ? lines.slice(header.length).join('\n') : lines.slice(headerLines.length).join('\n');
  const sanitized = scrub(body, name, phone);

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
