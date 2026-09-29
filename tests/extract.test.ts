import { describe, expect, it } from 'vitest';
import { assertNoPII, extractCv } from '@/lib/extract';
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
