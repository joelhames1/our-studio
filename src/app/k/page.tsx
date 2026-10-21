import type { Metadata } from 'next';
import { LinkSignIn } from './LinkSignIn';

// Personal links look like /k#<token>. The part after # never leaves the
// phone, so tokens stay out of server logs, history sync and link previews.
export const metadata: Metadata = { title: 'Signing in · Our Studio', referrer: 'no-referrer' };

export default function SignInPage() {
  return <LinkSignIn />;
}
