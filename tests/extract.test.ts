import { describe, expect, it } from 'vitest';
import { assertNoPII, extractCv, nameFromFilename } from '@/lib/extract';
import { PII, sample, SAMPLES } from './helpers';

describe('extractCv', () => {
  it('finds name, email, phone and address', () => {
    const cv = extractCv(sample('aisha-rahman.txt'));
    expect(cv.name).toBe('Aisha Rahman');
    expect(cv.email).toBe('aisha.rahman@example.com');
    expect(cv.phone).toBe('+44 7700 900123');
    expect(cv.address).toContain('Park Lane');
  });

  it.each(SAMPLES)('de-identifies %s completely', (file) => {
    const cv = extractCv(sample(file));
    for (const p of PII[file]) expect(cv.sanitized.toLowerCase()).not.toContain(p.toLowerCase());
    expect(() => assertNoPII(cv.sanitized, cv.name, cv.email, cv.phone)).not.toThrow();
  });

  it('keeps role-relevant content', () => {
    const cv = extractCv(sample('aisha-rahman.txt'));
    expect(cv.sanitized).toContain('product strategy');
    expect(cv.sanitized).toContain('Lumen Payments');
  });

  it('replaces the name when it appears in the body', () => {
    const cv = extractCv('Jane Doe\njane@x.com\n\nSUMMARY\nJane Doe led a team. Jane shipped things. DOE was here.\n\nEXPERIENCE\nPM at Foo (2020 - 2024)');
    expect(cv.name).toBe('Jane Doe');
    expect(cv.sanitized).toContain('Candidate led a team');
    expect(cv.sanitized).not.toMatch(/jane|doe/i);
    expect(cv.sanitized).not.toContain('Candidate Candidate');
  });

  it('scrubs emails, phones and links that appear mid-document', () => {
    const cv = extractCv('Jane Doe\n\nSUMMARY\nReach me at jane@x.com or +1 415 555 0100, see linkedin.com/in/jd and https://jd.dev/me\n\nEXPERIENCE\nPM (2020 - 2024)');
    expect(cv.sanitized).not.toMatch(/@|linkedin|https?:|415/);
  });

  it('does not mistake date ranges for phone numbers', () => {
    const cv = extractCv('Jane Doe\n\nEXPERIENCE\nPM, Foo (2018-2022)\nPM, Bar (2015 - 2018)');
    expect(cv.sanitized).toContain('2018-2022');
    expect(cv.sanitized).toContain('2015 - 2018');
  });

  it('handles CVs with no section headings by dropping the first lines', () => {
    const cv = extractCv('Jane Doe\njane@x.com\n+1 415 555 0100\n12 Oak Street, Austin\nProduct manager who launched things.\n');
    expect(cv.name).toBe('Jane Doe');
    expect(cv.sanitized).toBe('Product manager who launched things.');
  });

  it('falls back to the email for the name and to "Unknown Candidate"', () => {
    expect(extractCv('maria.lopez@x.com\n\nSUMMARY\nhi').name).toBe('Maria Lopez');
    expect(extractCv('SUMMARY\nhi there').name).toBe('Unknown Candidate');
  });

  it('supports a "Name:" label', () => {
    expect(extractCv('Name: Priya Nair\nEmail: p@x.com\n\nSUMMARY\nx').name).toBe('Priya Nair');
  });
});

describe('years of experience', () => {
  const yrs = (exp: string) => extractCv(`A B\n\nEXPERIENCE\n${exp}`).yearsExperience;
  it('merges overlapping ranges instead of double counting', () => {
    expect(yrs('X (2016 - 2020)\nY (2018 - 2022)')).toBe(6);
  });
  it('sums disjoint ranges and treats Present as this year', () => {
    const now = new Date().getFullYear();
    expect(yrs(`X (2010 - 2012)\nY (${now - 3} - Present)`)).toBe(5);
  });
  it('understands month names', () => {
    expect(yrs('X (Jan 2019 - Mar 2023)')).toBe(4);
  });
  it('ignores education dates', () => {
    const cv = extractCv('A B\n\nEXPERIENCE\nX (2022 - 2024)\n\nEDUCATION\nBSc (2010 - 2014)');
    expect(cv.yearsExperience).toBe(2);
  });
  it('uses an explicit "N years of experience" claim if larger', () => {
    expect(extractCv('A B\n\nSUMMARY\nPM with 9 years of product experience.\n\nEXPERIENCE\nX (2022 - 2024)').yearsExperience).toBe(9);
  });
});

describe('assertNoPII', () => {
  it('throws if the email, phone or name is still present', () => {
    expect(() => assertNoPII('contact a@b.co', 'Jo Bloggs', 'a@b.co', null)).toThrow(/email/);
    expect(() => assertNoPII('call 4155550100', 'Jo Bloggs', null, '+1 415 555 0100')).toThrow(/phone/);
    expect(() => assertNoPII('Jo Bloggs did it', 'Jo Bloggs', null, null)).toThrow(/name/);
  });
});

// REGRESSION: real-world CV layouts where the name is not a clean header line (all showed up as "Squad",
// "PROFESSIONAL SYNOPSIS", "Product Manager"... before). Names often exist only in a sidebar, doubled in two
// cases with no space, next to the email, or only in the file name.
describe('name detection on messy real-world layouts', () => {
  const BODY = 'SUMMARY\nProduct manager with 3 years of experience launching SaaS products.\n\nEXPERIENCE\nProduct Manager, Foo (2022 - Present)\n- Led roadmap and shipped 4 releases.\n';
  const GENERIC = 'squad_1@pg27.mesaschool.co';

  it('finds a name doubled in two cases and glued together (sidebar text), and scrubs it everywhere', () => {
    const cv = extractCv(`${BODY}\nROHAN MEHTARohan Mehta\n${GENERIC}+91 98202 1134598202 11345 rohan-mehta\n`);
    expect(cv.name).toBe('Rohan Mehta');
    expect(cv.sanitized).not.toMatch(/rohan|mehta|squad|9820/i);
  });
  it('handles the reverse order (Title then UPPER)', () => {
    expect(extractCv(`${BODY}\nAvinash MukherjeeAVINASH MUKHERJEE ${GENERIC}\n`).name).toBe('Avinash Mukherjee');
  });
  it('finds a name on the same line as the email', () => {
    const cv = extractCv(`Kabir Mehta ${GENERIC}\n+91 98202 11345\n\n${BODY}`);
    expect(cv.name).toBe('Kabir Mehta');
    expect(cv.email).toBe(GENERIC);
  });
  it('falls back to the file name when the text has no name, and never turns a generic email into "Squad"', () => {
    const cv = extractCv(`${BODY}\n${GENERIC}\n`, '05_ishaan_roy.pdf');
    expect(cv.name).toBe('Ishaan Roy');
    expect(extractCv(`${BODY}\n${GENERIC}\n`).name).toBe('Unknown Candidate');
  });
  it('scrubs file-name-derived names found anywhere in the text', () => {
    const cv = extractCv(`${BODY}\n- Mentored by Ishaan Roy at Foo.\nishaan-roy-product\n${GENERIC}`, '05_ishaan_roy.pdf');
    expect(cv.sanitized).not.toMatch(/ishaan|\broy\b/i);
  });
  it.each(['PROFESSIONAL SYNOPSIS', 'Product Manager', 'AI Product Manager', 'Academic Qualifications', 'CORE COMPETENCIES', 'Strategy & Operations Leader', 'New Delhi'])(
    'never mistakes "%s" for a name',
    (line) => {
      expect(extractCv(`${line}\n${BODY}\n${GENERIC}\n`, '07_aditya_nair.pdf').name).toBe('Aditya Nair');
      expect(extractCv(`${line}\n${BODY}`).name).toBe('Unknown Candidate');
    }
  );
  it('prefers the name in the text over a junk file name', () => {
    expect(extractCv(`Priya Krishnan ${GENERIC}\n\n${BODY}`, 'resume_final_v3.pdf').name).toBe('Priya Krishnan');
  });
  it('prefers an explicit "Name:" label', () => {
    expect(extractCv(`Name: Meera Das\n\n${BODY}`, '05_ishaan_roy.pdf').name).toBe('Meera Das');
  });
  it('scrubs 5+5 digit phone numbers and social @handles', () => {
    const cv = extractCv(`Jane Doe\n\n${BODY}\n90491 53824\nPodcast (@builtforbharat) grew views.`);
    expect(cv.sanitized).not.toMatch(/90491|53824|builtforbharat|@/);
  });
  it('does not corrupt words that merely contain a short name token', () => {
    const cv = extractCv(`Arnav Sen\n\nSUMMARY\nSenior leader with a good sense of dashboards.\nArnav Sen led it.`, 'arnav_sen.pdf');
    expect(cv.sanitized).toContain('Senior leader');
    expect(cv.sanitized).toContain('sense');
    expect(cv.sanitized).not.toMatch(/Arnav/);
  });
});

describe('nameFromFilename', () => {
  it.each([
    ['05_ishaan_roy.pdf', 'Ishaan Roy'],
    ['pm_02_kabir_mehta.pdf', 'Kabir Mehta'],
    ['spm_16_siddharth_rao.pdf', 'Siddharth Rao'],
    ['Jane Doe - Resume.pdf', 'Jane Doe'],
    ['Jane_Doe_CV_final.docx', 'Jane Doe'],
  ])('%s → %s', (f, n) => expect(nameFromFilename(f)).toBe(n));
  it.each(['resume.pdf', 'cv_final_v2.pdf', 'download.pdf', '12345.pdf'])('%s → null (no name)', (f) => expect(nameFromFilename(f)).toBeNull());
});
