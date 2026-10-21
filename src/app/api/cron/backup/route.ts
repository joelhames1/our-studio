import { createHash, timingSafeEqual } from 'node:crypto';
import { eraseDue } from '@/lib/server/account';
import { sendAlert } from '@/lib/server/alerts';
import { backUp } from '@/lib/server/backup';
import { config } from '@/lib/server/config';

export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };
const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * The nightly backup, started by Vercel (vercel.json), then erasing any closed
 * accounts whose 30 days are up. Vercel sends CRON_SECRET with each scheduled
 * run; without it, nobody else can start one.
 */
export async function GET(req: Request) {
  const secret = config.cronSecret;
  if (!secret) return Response.json({ error: 'CRON_SECRET isn’t set, so scheduled backups are off.' }, { status: 503, headers: NO_STORE });
  if (!timingSafeEqual(digest(req.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`))) {
    return Response.json({ error: 'Not here.' }, { status: 401, headers: NO_STORE });
  }
  try {
    const backup = await backUp();
    // After the backup, so a mistake can still be undone from last night's copy.
    let erased = 0;
    try {
      erased = await eraseDue();
    } catch (e) {
      console.error('Erasing closed accounts failed:', (e as Error).message);
      await sendAlert('server', ['Erasing closed accounts whose 30 days are up didn’t work tonight; it tries again tomorrow.', `Why: ${(e as Error).message}`]);
    }
    return Response.json({ ...backup, erased }, { headers: NO_STORE });
  } catch (e) {
    const message = (e as Error).message;
    console.error('Nightly backup failed:', message);
    await sendAlert('backup', ['The nightly copy of the database didn’t save.', `Why: ${message}`, 'Setup → Backups → Back up now tries again.']);
    return Response.json({ error: 'The backup didn’t save.' }, { status: 500, headers: NO_STORE });
  }
}
