import { describe, expect, it } from 'vitest';
import { extractCv } from '@/lib/extract';
import { scoreBoth, scoreRole, WEIGHTS } from '@/lib/scoring';
import { sample } from './helpers';

describe('scoring', () => {
  it('weights sum to 100 for both roles', () => {
    for (const r of ['PM', 'SPM'] as const) expect(Object.values(WEIGHTS[r]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('returns 6 dimensions with every score within 0-100', () => {
    const s = scoreRole(extractCv(sample('mei-lin-zhou.txt')).sanitized, 8, 'PM');
    expect(s.dimensions).toHaveLength(6);
    for (const d of s.dimensions) expect(d.score).toBeGreaterThanOrEqual(0), expect(d.score).toBeLessThanOrEqual(100);
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
  });

  it('empty text scores 0', () => {
    expect(scoreRole('', 0, 'PM').total).toBe(0);
    expect(scoreRole('', 0, 'SPM').total).toBe(0);
  });

  it('is deterministic', () => {
    const t = extractCv(sample('daniel-okafor.txt')).sanitized;
    expect(scoreBoth(t, 6)).toEqual(scoreBoth(t, 6));
  });

  it('more evidence never lowers the score', () => {
    const base = 'Owned the roadmap.';
    const more = base + ' Ran A/B tests with SQL dashboards and led a cross-functional team, shipped 3 launches, +20% conversion.';
    expect(scoreRole(more, 3, 'PM').total).toBeGreaterThan(scoreRole(base, 3, 'PM').total);
  });

  it('more years raise the experience score, capped at 100', () => {
    const exp = (y: number) => scoreRole('x', y, 'SPM').dimensions.find((d) => d.key === 'experience')!.score;
    expect(exp(2)).toBeLessThan(exp(6));
    expect(exp(30)).toBe(100);
  });

  it('SPM is a stricter bar than PM for the same mid-level CV', () => {
    const cv = extractCv(sample('daniel-okafor.txt'));
    const s = scoreBoth(cv.sanitized, cv.yearsExperience);
    expect(s.PM.total).toBeGreaterThan(s.SPM.total);
  });

  it('a senior CV outranks a junior CV for both roles', () => {
    const a = extractCv(sample('aisha-rahman.txt'));
    const r = extractCv(sample('rohan-verma.txt'));
    const sa = scoreBoth(a.sanitized, a.yearsExperience);
    const sr = scoreBoth(r.sanitized, r.yearsExperience);
    expect(sa.PM.total).toBeGreaterThan(sr.PM.total);
    expect(sa.SPM.total).toBeGreaterThan(sr.SPM.total);
  });
});
