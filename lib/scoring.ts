import type { DimensionScore, Role, RoleScore } from './types';

// Deterministic rubric. Each dimension counts distinct evidence terms in the
// de-identified CV, then converts to 0-100 against a role-specific target
// (SPM must show more evidence than PM). Weights per role sum to 100.

interface Dim {
  key: string;
  label: string;
  terms: string[];
  target: Record<Role, number>;
}

const DIMS: Dim[] = [
  {
    key: 'product',
    label: 'Product sense / strategy',
    terms: ['product strategy', 'strategy', 'roadmap', 'vision', 'discovery', 'user research', 'customer interview', 'prioritiz', 'positioning', 'go-to-market', 'gtm', 'jobs to be done', 'hypothes', 'experiment', 'mvp', 'product-market fit', 'north star', 'okr', 'market analysis', 'competitive', 'pricing', 'new product', '0-to-1', '0 to 1'],
    target: { PM: 6, SPM: 9 },
  },
  {
    key: 'execution',
    label: 'Execution & delivery',
    terms: ['launched', 'shipped', 'delivered', 'release', 'sprint', 'agile', 'scrum', 'milestone', 'on time', 'backlog', 'rolled out', 'migrat', 'scaled', 'reduced', 'increased', 'grew', 'owned', 'end-to-end'],
    target: { PM: 7, SPM: 9 },
  },
  {
    key: 'data',
    label: 'Data / analytical skills',
    terms: ['sql', 'analytics', 'dashboard', 'metric', 'kpi', 'a/b test', 'experiment', 'funnel', 'cohort', 'retention', 'conversion', 'amplitude', 'mixpanel', 'looker', 'tableau', 'python', 'data-driven', 'statistic', 'forecast', 'churn'],
    target: { PM: 5, SPM: 6 },
  },
  {
    key: 'stakeholder',
    label: 'Stakeholder & cross-functional leadership',
    terms: ['cross-functional', 'stakeholder', 'engineering', 'design', 'sales', 'marketing', 'executive', 'leadership', 'led ', 'managed', 'mentor', 'team of', 'partnered', 'aligned', 'c-level', 'board', 'director', 'hired', 'coached', 'influenc'],
    target: { PM: 5, SPM: 8 },
  },
  {
    key: 'communication',
    label: 'Communication',
    terms: ['presented', 'wrote', 'authored', 'documented', 'prd', 'spec', 'narrative', 'storytelling', 'workshop', 'published', 'spoke', 'communicat', 'newsletter', 'demo', 'roadmap review', 'all-hands'],
    target: { PM: 4, SPM: 5 },
  },
];

export const WEIGHTS: Record<Role, Record<string, number>> = {
  PM: { product: 25, execution: 20, data: 15, stakeholder: 15, communication: 10, experience: 15 },
  SPM: { product: 25, execution: 15, data: 10, stakeholder: 20, communication: 10, experience: 20 },
};
const IDEAL_YEARS: Record<Role, number> = { PM: 4, SPM: 8 };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function scoreRole(sanitized: string, years: number, role: Role): RoleScore {
  const t = sanitized.toLowerCase();
  const metrics = (sanitized.match(/\d+(?:\.\d+)?\s?(?:%|x\b|k\b|m\b)|\$\s?\d/gi) ?? []).length;
  const words = sanitized.split(/\s+/).filter(Boolean).length;

  const dimensions: DimensionScore[] = DIMS.map((d) => {
    const hits = d.terms.filter((term) => t.includes(term));
    let points = hits.length;
    if (d.key === 'execution') points += Math.min(metrics, 6) * 0.5;
    if (d.key === 'communication') points += Math.min(metrics, 4) * 0.5 + (words >= 250 && words <= 900 ? 2 : 0);
    return {
      key: d.key,
      label: d.label,
      score: clamp((points / d.target[role]) * 100),
      weight: WEIGHTS[role][d.key],
      evidence: hits.slice(0, 5).map((h) => h.trim()),
    };
  });
  dimensions.push({
    key: 'experience',
    label: 'Years of relevant experience',
    score: clamp((years / IDEAL_YEARS[role]) * 100),
    weight: WEIGHTS[role].experience,
    evidence: [`~${years} years`],
  });
  const total = clamp(dimensions.reduce((s, d) => s + (d.score * d.weight) / 100, 0));
  return { total, dimensions };
}

export function scoreBoth(sanitized: string, years: number) {
  return { PM: scoreRole(sanitized, years, 'PM'), SPM: scoreRole(sanitized, years, 'SPM') };
}
