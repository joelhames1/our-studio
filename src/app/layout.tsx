import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import { AppShell } from '@/components/AppShell';
import { getUser } from '@/lib/server/auth';
import { hasAgreed } from '@/lib/server/consent';
import './globals.css';

export const metadata: Metadata = {
  title: 'Our Studio',
  description: 'Design together, decide together, print together: for trips, birthdays, graduations and everything in between.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Our Studio', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#fbf7f0',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders per request so its scripts get that request's CSP nonce.
  await connection();
  const user = await getUser();
  // The AI services themselves refuse until you've agreed, so if this can't be checked the page still shows.
  const agreed = user
    ? await hasAgreed(user).catch((e) => {
        console.error('Couldn’t check the AI agreement:', (e as Error).message);
        return true;
      })
    : true;
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {user ? (
          <AppShell me={user} agreed={agreed}>
            {children}
          </AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
