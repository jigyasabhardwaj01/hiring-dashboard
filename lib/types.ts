export type Role = 'PM' | 'SPM';
export type Status = 'pending' | 'invited' | 'rejected';
export type Verdict = 'interview' | 'reject';

export interface DimensionScore {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number; // share of the total, weights sum to 100
  evidence: string[];
}
export interface RoleScore {
  total: number; // 0-100
  dimensions: DimensionScore[];
}
export interface Brief {
  summary: string;
  strengths: string[];
  gaps: string[];
  questions: string[];
  verdict: Verdict;
  verdictReason: string;
}
export interface Candidate {
  id: string;
  created_at: string;
  name: string;
  email: string | null;
  phone: string | null;
  applied_role: Role;
  cv_filename: string;
  pm_score: number;
  spm_score: number;
  overall_score: number; // score for the applied role
  pm_breakdown: RoleScore;
  spm_breakdown: RoleScore;
  sanitized_text: string; // exactly what the AI saw
  brief: Brief | null;
  ai_error: string | null;
  provider: string | null;
  draft_subject: string;
  draft_body: string;
  status: Status;
  sent_at: string | null;
  sample: boolean;
}
