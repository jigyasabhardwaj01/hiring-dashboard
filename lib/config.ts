export const cfg = {
  provider: () => (process.env.LLM_PROVIDER || 'anthropic').toLowerCase(),
  llmKey: () => process.env.LLM_API_KEY || '',
  model: () => process.env.LLM_MODEL || '',
  resendKey: () => process.env.RESEND_API_KEY || '',
  emailFrom: () => process.env.EMAIL_FROM || '',
  company: () => process.env.COMPANY_NAME || 'our company',
  founder: () => process.env.FOUNDER_NAME || 'The Founder',
  threshold: () => Number(process.env.INTERVIEW_THRESHOLD || 65),
  postgres: () => Boolean(process.env.DATABASE_URL),
  supabase: () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
};
export const llmReady = () => cfg.provider() === 'mock' || Boolean(cfg.llmKey());
export const emailReady = () => Boolean(cfg.resendKey() && cfg.emailFrom());
