// The home screen's greeting, shared by the server's first guess and the browser's correction.

/** Where the browser leaves its time zone, so the next visit's first paint already says the right thing. */
export const TZ_COOKIE = 'studio_tz';

export const helloFor = (hour: number) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

/** The greeting for a time zone, or plain "Hello" when there isn't a usable one. */
export function helloIn(tz: string | undefined, now = new Date()): string {
  if (!tz) return 'Hello';
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now));
    return Number.isFinite(hour) ? helloFor(hour) : 'Hello';
  } catch {
    return 'Hello'; // not a real time zone
  }
}
