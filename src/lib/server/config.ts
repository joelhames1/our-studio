// Everything configurable lives in environment variables (Vercel > Settings >
// Environment Variables, or .env.local when running on a laptop).
import 'server-only';

export type ImageProviderId = 'fal' | 'openai' | 'claude-svg' | 'mock';

const env = (name: string) => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
};

export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Link tokens shorter than this don't count; `openssl rand -hex 24` makes a 48-character one. */
export const MIN_TOKEN_LENGTH = 24;
const strong = (v: string | undefined) => (v && v.length >= MIN_TOKEN_LENGTH ? v : undefined);
const TOKEN_VARS = ['ERIN_LINK_TOKEN', 'JOEL_LINK_TOKEN'] as const;
/** A plausible email address, lowercased; anything else doesn't count. */
const email = (v: string | undefined) => (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : undefined);

export const config = {
  get erinToken() {
    return strong(env('ERIN_LINK_TOKEN'));
  },
  get joelToken() {
    return strong(env('JOEL_LINK_TOKEN'));
  },
  /** Link token variables that are set but too short to be used. */
  get weakTokens(): string[] {
    return TOKEN_VARS.filter((n) => env(n) && !strong(env(n)));
  },
  /** SIGN_IN_LINKS=off: personal links stop working (sessions they started carry on). */
  get linksOff() {
    return env('SIGN_IN_LINKS')?.toLowerCase() === 'off';
  },
  /** Both personal links are set, strong enough, and switched on. */
  get linksConfigured() {
    return !!(this.erinToken && this.joelToken) && !this.linksOff;
  },
  /** Erin's and Joel's addresses: the first household's, added to the directory the first time it's set up (people.ts). */
  get erinEmail() {
    return email(env('ERIN_GOOGLE_EMAIL'));
  },
  get joelEmail() {
    return email(env('JOEL_GOOGLE_EMAIL'));
  },
  /** Where the privacy page and terms say to write, and the contact Google's brand verification asks for. */
  get contactEmail() {
    return email(env('CONTACT_EMAIL'));
  },
  /** The site's own OAuth client from Google Cloud. Anything that isn't a client ID (a pasted secret, say) doesn't count. */
  get googleClientId() {
    const v = env('GOOGLE_CLIENT_ID');
    return v && /^[\w-]+\.apps\.googleusercontent\.com$/.test(v) ? v : undefined;
  },
  get googleClientSecret() {
    return env('GOOGLE_CLIENT_SECRET');
  },
  /** Both halves of the client are set: sign-in goes straight to Google rather than through Supabase. */
  get googleDirect() {
    return !!(this.googleClientId && this.googleClientSecret);
  },
  /** "Continue with Google" works: Google (or Supabase) is connected. Who gets in is up to the directory of people (people.ts). */
  get googleSignIn() {
    return !!(this.googleDirect || (this.supabaseUrl && this.supabaseKey));
  },
  /** Resend, which sends the site's email: sign-in codes, and alerts when something breaks. */
  get resendKey() {
    return env('RESEND_API_KEY');
  },
  /** Who the site's email is from: an address on the domain verified with Resend. ALERT_FROM, its old name, still works. */
  get emailFrom() {
    return env('EMAIL_FROM') ?? env('ALERT_FROM') ?? 'Our Studio <studio@evolvingword.com>';
  },
  /** Where the alerts go: ALERT_EMAIL, or the site's contact address. */
  get alertEmail() {
    return email(env('ALERT_EMAIL')) ?? this.contactEmail;
  },
  get alertsOn() {
    return !!(this.resendKey && this.alertEmail);
  },
  /**
   * "Email me a code" works: Resend can send and the server has its own secret
   * to sign with. Codes go to the addresses in the directory of people, the
   * same ones Google sign-in matches.
   */
  get emailCodes() {
    return !!(this.resendKey && this.serverSecret);
  },
  /** Vercel sends this with each scheduled run (the nightly backup), so nobody else can start one. */
  get cronSecret() {
    return strong(env('CRON_SECRET'));
  },
  /** Bump to sign everyone out. */
  get sessionVersion() {
    return env('SESSION_VERSION') ?? '1';
  },
  /** Just the Project URL's origin: a pasted ".../rest/v1/" or trailing slash would send requests to the wrong place. */
  get supabaseUrl() {
    const v = env('SUPABASE_URL') ?? env('NEXT_PUBLIC_SUPABASE_URL');
    if (!v) return undefined;
    try {
      return new URL(v).origin;
    } catch {
      // Not a web address at all: left as it is, so Setup can say what's wrong with it.
      return v;
    }
  },
  get supabaseKey() {
    return env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY');
  },
  /** The server's own secret, for signing what Google and email codes hand out: made from the Supabase key, which only the server has. */
  get serverSecret() {
    const key = this.supabaseKey;
    return key ? `supabase|${key}` : undefined;
  },
  get anthropicKey() {
    return env('ANTHROPIC_API_KEY');
  },
  /** Claude model for words, tweaks and checks. Model ids are lowercase; "CLAUDE-OPUS-5-5" would be refused. */
  get anthropicModel() {
    return (env('ANTHROPIC_MODEL') ?? DEFAULT_MODEL).toLowerCase().replace(/^["']|["']$/g, '');
  },
  get falKey() {
    return env('FAL_KEY');
  },
  get openaiKey() {
    return env('OPENAI_API_KEY');
  },
  /** fal model ids, overridable without a code change. */
  get falImageModel() {
    return env('FAL_IMAGE_MODEL') ?? 'fal-ai/gpt-image-1.5';
  },
  get falUpscaleModel() {
    return env('FAL_UPSCALE_MODEL') ?? 'fal-ai/esrgan';
  },
  get falBackgroundModel() {
    return env('FAL_BACKGROUND_MODEL') ?? 'fal-ai/birefnet';
  },
  get openaiImageModel() {
    return env('OPENAI_IMAGE_MODEL') ?? 'gpt-image-1.5';
  },
  /** Rough cost of one draft image, for the spend guard. */
  get costPerImageUsd() {
    const n = Number(env('COST_PER_IMAGE_USD') ?? 0.06);
    return Number.isFinite(n) && n >= 0 ? n : 0.06;
  },
  /** Image quality for drafts: low | medium | high. */
  get imageQuality(): 'low' | 'medium' | 'high' {
    const q = env('IMAGE_QUALITY');
    return q === 'low' || q === 'high' ? q : 'medium';
  },
  get monthlyBudgetUsd() {
    const n = Number(env('MONTHLY_BUDGET_USD') ?? 25);
    return Number.isFinite(n) && n >= 0 ? n : 25;
  },
  get dataDir() {
    return env('DATA_DIR') ?? '.data';
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
  get isVercel() {
    return !!process.env.VERCEL;
  },
  /** Which artwork engine to use. Explicit IMAGE_PROVIDER wins; otherwise the best key present. */
  get imageProvider(): ImageProviderId {
    const forced = env('IMAGE_PROVIDER') as ImageProviderId | undefined;
    if (forced && ['fal', 'openai', 'claude-svg', 'mock'].includes(forced)) return forced;
    if (this.falKey) return 'fal';
    if (this.openaiKey) return 'openai';
    if (this.anthropicKey) return 'claude-svg';
    return 'mock';
  },
  /** Some way in is set up: personal links, Google or email codes. */
  get authConfigured() {
    return this.linksConfigured || this.googleSignIn || this.emailCodes;
  },
  /**
   * Dev convenience: with no link tokens, a local "who are you?" picker. Only
   * on a laptop with local storage: never in a production build, never on
   * Vercel, never next to real data.
   */
  get devLogin() {
    return !this.authConfigured && !this.isProduction && !this.isVercel && !this.supabaseUrl && !this.supabaseKey;
  },
};
