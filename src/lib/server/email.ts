// The site's email, sent through Resend: sign-in codes, and alerts when
// something breaks. From EMAIL_FROM, an address on the domain verified there.
import 'server-only';
import { config } from './config';

export const RESEND = 'https://api.resend.com/emails';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Sends one email, or says why Resend wouldn't. */
export async function sendEmail({ to, subject, text, html }: Email): Promise<void> {
  if (!config.resendKey) throw new Error('No RESEND_API_KEY set.');
  const res = await fetch(RESEND, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.emailFrom, to: [to], subject, text, ...(html ? { html } : {}) }),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (res.ok) return;
  let said = '';
  try {
    said = ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    // No reason given.
  }
  throw new Error(`Resend refused it (${res.status})${said ? `: ${said}` : ''}`);
}
