import type { Metadata } from 'next';
import Link from 'next/link';
import { config } from '@/lib/server/config';
import { Bullets, Contact, LegalPage, Section } from '@/components/Legal';

export const metadata: Metadata = { title: 'Privacy · Our Studio' };

/**
 * Who paints artwork, as this site is actually set up, so the page names
 * whoever really sees the descriptions. Null when Claude draws it (Anthropic
 * is already listed) or there's no artwork service.
 */
function artwork(): { name: string; viaOpenAI: boolean } | null {
  switch (config.imageProvider) {
    case 'fal':
      return { name: 'fal.ai', viaOpenAI: /gpt-image/i.test(config.falImageModel) };
    case 'openai':
      return { name: 'OpenAI', viaOpenAI: false };
    default:
      return null;
  }
}

/** The privacy policy. Open to anyone; it has to describe what the app really does, so update it with the code. */
export default function PrivacyPage() {
  const contact = <Contact email={config.contactEmail} />;
  const art = artwork();
  const openai = art?.name === 'OpenAI' || art?.viaOpenAI;
  return (
    <LegalPage
      title="Privacy"
      intro={
        <p>
          Our Studio is a small, invite-only site where family and friends design things together and get them printed. It&apos;s a personal project, not a
          business: nothing here is sold, there are no ads, and nothing is tracked for marketing. This page says what the site keeps, where, who else handles
          it, and how to have it removed.
        </p>
      }
    >
      <Section title="Who can see what">
        <Bullets>
          <li>Only people who were invited can sign in. Anyone else who tries is turned away.</li>
          <li>
            Everyone who can sign in sees the projects: their designs, words, hearts and approvals. The designs you pass on stay private to you.
          </li>
          <li>
            If you make a link for a print shop, anyone with that link can see that one order (its details, mockups and print files) for 14 days, or until
            you turn the link off.
          </li>
        </Bullets>
      </Section>

      <Section title="What it keeps">
        <Bullets>
          <li>
            <span className="font-medium">Who you are.</span> Your name, the address you sign in with, and which households you belong to (and whether
            you&apos;re an owner). Everyone in a household sees your name; only its owners also see your address.
          </li>
          <li>
            <span className="font-medium">Your sign-in.</span> When you continue with Google, Google confirms your email address. The site uses it only to
            check you were invited and to sign you in, and keeps nothing else from your Google account. If you ask for a code by email instead, the code goes
            to the address you typed, and the site keeps only a count of codes sent to it (as a scrambled tag, not the address, for a day). If you weren&apos;t
            invited, nothing else is kept at all.
          </li>
          <li>
            <span className="font-medium">Invites.</span> When someone invites you, the site keeps the name they typed for you, who sent it, which household
            it&apos;s for and when it was used. The link&apos;s secret isn&apos;t kept, only a scrambled form of it, so a copy of the database can&apos;t be used to
            get in. Each link works once, within a week.
          </li>
          <li>
            <span className="font-medium">Where you&apos;re signed in.</span> For each phone or computer you sign in on: a short name for it (like
            &ldquo;iPhone · Safari&rdquo;), how you signed in, when, and when it was last used, so you can see the list and sign any of them out. Not your
            browser&apos;s full description, and not your IP address.
          </li>
          <li>
            <span className="font-medium">What you make.</span> Project names and the people, dates and places you add; the words, designs and artwork; your
            hearts and passes; approvals; the order (sizes, quantities and any names to print); notes; printer searches (the ZIP code and the printers
            found); and the print files. Everyone in your household sees all of it; nobody outside your household sees any of it.
          </li>
          <li>
            <span className="font-medium">An activity log</span> of approvals, archives, renames, deletions, sign-ins and similar, with who and when,
            including when you agreed to how the site uses AI.
          </li>
          <li>
            <span className="font-medium">Spending records</span> for the AI services: what each request cost and a few words on what it was for.
          </li>
          <li>
            <span className="font-medium">Cookies and your browser.</span> One cookie keeps you signed in (for up to a year), one lasts ten minutes while you
            sign in with Google or wait for an emailed code, one holds an invite you opened for half an hour while you sign in, one remembers which of your
            households you&apos;re working in, and one remembers your time zone so the greeting fits the time of day. Your browser also remembers the garment style and color
            you last chose, and, until you close the tab, your last few swipes (for undo) and the designs you picked to compare. There are no advertising or analytics
            cookies.
          </li>
        </Bullets>
      </Section>

      <Section title="Where it's kept, and who else handles it">
        <Bullets>
          <li>
            <span className="font-medium">Supabase</span> stores everything above: the database, the artwork and print files (in private storage, opened only
            through short-lived links), and the sign-in records.
          </li>
          <li>
            <span className="font-medium">Vercel</span> hosts the site and keeps short-lived request logs, which include IP addresses.
          </li>
          <li>
            <span className="font-medium">Google</span> handles &ldquo;Continue with Google&rdquo;.
          </li>
          <li>
            <span className="font-medium">Resend</span> sends the site&apos;s email: sign-in codes to the address you ask for one at, and an alert to whoever runs
            the site when something breaks, saying where and what went wrong, not what anyone typed.
          </li>
          <li>
            <span className="font-medium">Anthropic (Claude)</span> suggests words, understands requests like &ldquo;make the words coral&rdquo;, plans and
            checks artwork, fills in a new project from a sentence, and searches the web for printers{art ? '' : ', and draws artwork'}. For that it&apos;s
            sent the details it needs: names, places and dates in the project, its words, your request, new artwork to check, and for printer searches the
            order and ZIP code.
          </li>
          {art ? (
            <li>
              <span className="font-medium">{art.name}</span> paints artwork from a written description of the picture (its subject and style, which can
              include places and themes from your project).
              {art.viaOpenAI ? ' The picture model it runs comes from OpenAI, so the description reaches OpenAI too.' : ''} The pictures come straight back to
              Our Studio rather than being kept at a public link.
            </li>
          ) : null}
        </Bullets>
        <p>
          Each of these services handles data under its own terms. By default, {openai ? 'Anthropic and OpenAI don’t' : 'Anthropic doesn’t'} use what&apos;s
          sent through {openai ? 'their APIs' : 'its API'} to train {openai ? 'their models' : 'its models'}.
        </p>
      </Section>

      <Section title="Information from Google">
        <p>
          Our Studio asks Google only to confirm your email address. It never asks for access to your Gmail, Drive,
          contacts, calendar or anything else. Our Studio&apos;s use of information received from Google APIs adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-lagoon-deep underline underline-offset-4">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Google sign-in details are not shared with anyone else or used for anything but signing you in.
        </p>
      </Section>

      <Section title="How long it's kept, and removing it">
        <Bullets>
          <li>
            Projects and their files stay until they&apos;re deleted. Deleting a project for good (from <Link href="/archived" className="underline underline-offset-4">Archived</Link>) removes its
            designs, hearts, approvals, artwork and print files. The activity log keeps the entries saying what happened, including the deletion.
          </li>
          <li>
            A copy of the database is made every night and kept for a month, in the same private storage, so a mistake can be undone. Something erased is gone
            from those copies within a month too.
          </li>
          <li>
            Leaving a household, or being taken out of one, deletes nothing: you stop seeing its projects, your hearts stop counting, and an invite brings you
            back with them.
          </li>
          <li>
            You can close your account yourself, from{' '}
            <Link href="/account" className="underline underline-offset-4">
              You
            </Link>{' '}
            (at the foot of the home screen, or your name in the sidebar). You&apos;re signed out everywhere and leave every household, but nothing is deleted, so
            a new invite (or whoever runs the site) can bring it back. Whoever runs the site can also switch an account off the same way.
          </li>
          <li>
            To have it erased for good, tick <span className="font-medium">Also erase my data</span> when you close it. Thirty days later your name, address,
            sign-ins, devices, hearts, maybes and passes are deleted, along with any household nobody else is in and every project and file in it. Until then
            whoever runs the site can stop it if you change your mind. Projects and designs you made with others stay with them, shown as made by someone
            who&apos;s left. Whoever runs the site can also erase a closed account, or a household nobody&apos;s in, straight away.
          </li>
          <li>To get a copy of what&apos;s kept about you, or for anything you can&apos;t do yourself, write to {contact}.</li>
          <li>Vercel and the AI services keep their own logs for a limited time under their terms.</li>
        </Bullets>
      </Section>

      <Section title="Children">
        <p>Our Studio isn&apos;t meant for anyone under 13, and doesn&apos;t knowingly keep information about them beyond names added to a design.</p>
      </Section>

      <Section title="Changes, and questions">
        <p>If this page changes, the date at the top changes too. Questions or requests: {contact}.</p>
      </Section>
    </LegalPage>
  );
}
