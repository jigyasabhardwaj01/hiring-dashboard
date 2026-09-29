import { cfg } from './config';

export async function sendEmail(to: string, subject: string, body: string): Promise<string> {
  if (!cfg.resendKey() || !cfg.emailFrom())
    throw new Error('Email is not configured. Set RESEND_API_KEY and EMAIL_FROM in .env.local.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.resendKey()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: cfg.emailFrom(), to: [to], subject, text: body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${data?.message ?? 'send failed'}`);
  return data.id as string;
}
