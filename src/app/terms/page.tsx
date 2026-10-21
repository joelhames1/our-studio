import type { Metadata } from 'next';
import Link from 'next/link';
import { config } from '@/lib/server/config';
import { Bullets, Contact, LegalPage, Section } from '@/components/Legal';

export const metadata: Metadata = { title: 'Terms · Our Studio' };

/** The terms of use, in plain words. Open to anyone. */
export default function TermsPage() {
  const contact = <Contact email={config.contactEmail} />;
  return (
    <LegalPage
      title="Terms"
      intro={
        <p>
          Our Studio is a private, invite-only site where family and friends design things together and get them printed. It&apos;s a personal,
          non-commercial project. Using it means agreeing to these terms and to the <Link href="/privacy" className="text-lagoon-deep underline underline-offset-4">privacy page</Link>.
        </p>
      }
    >
      <Section title="Your account">
        <p>Only people who were invited can use Our Studio. Keep your Google account secure, and don&apos;t share your access with anyone else.</p>
      </Section>

      <Section title="What you make">
        <Bullets>
          <li>
            What you add and make here is yours. You let Our Studio store it, show it to the other people in the studio, and send it to the services listed on
            the privacy page so the site can do its job.
          </li>
          <li>
            Only add words, names, pictures and descriptions you have the right to use, and nothing illegal, hateful, or meant to harass or harm someone.
          </li>
        </Bullets>
      </Section>

      <Section title="AI and printers">
        <Bullets>
          <li>
            Word ideas, artwork and printer details come from AI and the web, and can be wrong or odd. Check every word, name and date before you approve a
            design or send it to print.
          </li>
          <li>
            Printer details are gathered from printers&apos; own websites and aren&apos;t verified. Confirm prices, minimums and timing with the printer.
            Ordering and paying for prints is between you and the printer; Our Studio doesn&apos;t sell anything or take payments.
          </li>
        </Bullets>
      </Section>

      <Section title="Fair use">
        <p>
          AI requests have hourly and daily limits that keep costs sensible. Don&apos;t try to get around them, break the site, or get into anything you
          weren&apos;t invited to.
        </p>
      </Section>

      <Section title="No guarantees">
        <p>
          Our Studio is free and provided as is. It may be unavailable at times, change, or lose data, so keep your own copy of any print files you need. To the
          extent the law allows, Our Studio and the people who run it aren&apos;t responsible for losses that come from using it.
        </p>
      </Section>

      <Section title="Ending">
        <p>
          Access can be removed, and the site closed, at any time. You can stop using it and ask for your information to be deleted at any time (see
          the privacy page).
        </p>
      </Section>

      <Section title="Changes, and questions">
        <p>If these terms change, the date at the top changes too. Questions: {contact}.</p>
      </Section>
    </LegalPage>
  );
}
