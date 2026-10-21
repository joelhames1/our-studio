# Setting up Our Studio

About 20 minutes, once. You'll make four accounts (two of which you may already have), paste some keys into Vercel, and text Erin a link.

| What | Why | Cost |
| --- | --- | --- |
| **Vercel** | Hosts the app at a real URL | Free (Hobby plan) |
| **Supabase** | Saves designs, votes and print files | Free tier is plenty |
| **Anthropic (Claude)** | Word ideas, plain-English tweaks, art direction, lettering checks | Pay as you go; pennies per request |
| **fal.ai** | Paints the AI artwork, upscales it for print | Pay as you go; roughly $0.04 to $0.06 per image |

Claude and fal.ai are optional. Without them the app still works: the built-in artwork, layouts, fonts and colors, voting, approval and print files need no AI at all. The app also caps AI spending at $25 a month by default.

---

## 1. Supabase (database and file storage)

1. Go to [supabase.com](https://supabase.com) and sign up (GitHub sign-in is quickest).
2. **New project**. Name it `our-studio`, pick the region **East US (North Virginia)** (`us-east-1`), let it generate a database password (you won't need it), and create it. It takes a minute or two to spin up. That's where Vercel runs the app (`vercel.json` pins it to `iad1`, Washington, D.C.), so every trip to the database is a short one; a page makes several, one after another.
3. In the left sidebar open **SQL Editor**, then **New query**.
4. Open [`supabase/migrations/0001_studio.sql`](../supabase/migrations/0001_studio.sql) from this repo, copy the whole thing, paste it in, and press **Run**. You should see "Success. No rows returned". Then do the same with [`0002_hardening.sql`](../supabase/migrations/0002_hardening.sql), which creates the private file bucket and takes away the public roles' access to the tables, [`0003_server_access.sql`](../supabase/migrations/0003_server_access.sql), which makes sure the app's server key can use the tables, [`0004_printers.sql`](../supabase/migrations/0004_printers.sql), which adds the shared printer list, and [`0005_activity_and_limits.sql`](../supabase/migrations/0005_activity_and_limits.sql), which adds the activity log and per-person rate limits. (The Setup page also shows all of them, with a copy button. They're all safe to run again.)
5. Open **Project Settings** and grab two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`), from **Data API** or the project home page.
   - The **secret** key (starts `sb_secret_`), from **API Keys**. If your project shows the older style instead, use the `service_role` key. Either works.

   Keep the secret key secret: it can read and write everything. It only ever goes into Vercel, never into a browser.

After step 4, **Storage** should show a bucket called `studio` marked **Private**. The Setup page checks this and turns red if it's ever public.

Leave **Project Settings → Data API → Max rows** at 1000 (the default) or more. The app reads long lists a thousand rows at a time; a lower number would make it stop early and miss some.

> Heads-up: free Supabase projects pause after a week with no activity. If the app ever says it can't reach the database, open the Supabase dashboard and press **Restore**. Anything you'd saved is still there.

## 2. Claude (Anthropic)

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in.
2. **Billing**: add a payment method and a little credit ($5 to $10 lasts a long time here).
3. **API Keys**, then **Create Key**. Name it `our-studio` and copy it (starts `sk-ant-`).

## 3. fal.ai (AI artwork)

1. Go to [fal.ai](https://fal.ai) and sign in with GitHub or Google.
2. **Billing**: add $10 of credit.
3. **Keys** (or Dashboard, then API Keys), then **Add key**. Copy it.

Prefer OpenAI instead? Set `OPENAI_API_KEY` and skip fal.ai. Artwork quality is similar; print upscaling falls back to plain resampling, which is fine at most sizes.

## 4. Vercel (hosting)

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub.
2. **Add New**, then **Project**, then import `joelhames1/our-studio`. Vercel spots that it's a Next.js app; leave the build settings alone.
3. Open **Environment Variables** before deploying and add these. For each one, choose the type **Secret** (Vercel then never shows it again, even to you; it used to be a **Sensitive** switch) and set the environment to **Production** only. That way preview builds of other branches can't use the real database, the real links or the AI keys; they just show "setup needed".

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Your Project URL from step 1 |
| `SUPABASE_SECRET_KEY` | Your secret key from step 1 (or name it `SUPABASE_SERVICE_ROLE_KEY` if it's the older `service_role` key) |
| `ANTHROPIC_API_KEY` | From step 2 |
| `FAL_KEY` | From step 3 |

People sign in with Google (section 8) or a code by email (section 9 sets up the email). The old personal links (`ERIN_LINK_TOKEN`, `JOEL_LINK_TOKEN`) still work if those variables are set, but leave them out: a link keeps working for as long as its variable is there, so one that leaks is a way in until someone notices. If you need one while setting up, make it with `openssl rand -hex 24` (anything under 24 characters is ignored) and delete the variable once Google works.

Optional extras:

| Name | Default | What it does |
| --- | --- | --- |
| `MONTHLY_BUDGET_USD` | `25` | AI spending cap per calendar month, for the whole site (each household also has its own; see section 10) |
| `IMAGE_QUALITY` | `medium` | `low`, `medium` or `high` for AI artwork drafts |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Which Claude model to use |
| `FAL_IMAGE_MODEL` | `fal-ai/gpt-image-1.5` | Which fal.ai model paints artwork |
| `IMAGE_PROVIDER` | automatic | Force `fal`, `openai`, `claude-svg` or `mock` |
| `SESSION_VERSION` | `1` | Change it (to anything) and redeploy to sign everyone out everywhere |
| `ERIN_GOOGLE_EMAIL`, `JOEL_GOOGLE_EMAIL` | none | The Google addresses you each sign in with (see section 8) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | none | The site's own Google sign-in client (section 8). Without them, Google sign-in goes through Supabase |
| `CRON_SECRET` | none | Lets Vercel start the nightly backup (section 9). At least 24 characters: `openssl rand -hex 24`, or the one Setup suggests |
| `RESEND_API_KEY` | none | Sends the site's email: sign-in codes (section 8) and error alerts (section 9) |
| `ALERT_EMAIL` | `CONTACT_EMAIL` | Where the error alerts go |
| `EMAIL_FROM` | `Our Studio <studio@evolvingword.com>` | Who the site's email is from: an address on the domain verified with Resend (`ALERT_FROM`, its old name, still works) |
| `SIGN_IN_LINKS` | on | `off` stops the personal links working, if their variables are still set |
| `CODE_EMAILS_PER_DAY` | `100` | Most sign-in code emails the whole site sends in a day, so nobody can use up Resend's quota (and with it everyone's codes and alerts). Past it, the welcome page says to use Google |
| `CONTACT_EMAIL` | none | The address the privacy page and terms tell people to write to (and the one Google's brand verification wants). Without it they say "the person who invited you". |

4. Press **Deploy**. When it finishes you get a URL like `https://our-studio.vercel.app` (named after the Vercel project).

> Branches: work happens on the `claude/practical-darwin-eheq60` branch, and production follows `main` (in Vercel: **Settings, Environments, Production, Branch Tracking**, set to `main`). Pushes to the work branch don't deploy at all: `vercel.json` turns them off, since a preview couldn't sign anyone in (the keys are Production only, and Google only sends people back to the real address) and on the free plan every deployment's functions count against a 10 GB cap. Nothing goes live until Claude moves `main` forward, which it does when you say "push main".

If you add or change environment variables later, redeploy (**Deployments**, the three dots on the latest one, **Redeploy**) so the app picks them up.

## 5. Sign in and check everything

1. Open the site on your phone and sign in with Google or an email code. (With a personal link variable set, `https://YOUR-APP.vercel.app/k#YOUR_JOEL_LINK_TOKEN` works too: everything after the `#` stays on the phone, never reaches Vercel's logs, and the app wipes it from the address bar straight away.)
2. Tap **Setup** in the top corner. Every row should have a green tick. Press each **Test it** button.
   - If storage says the tables are missing, step 1.4 didn't run; the page shows the SQL with a copy button.
3. Invite Erin from **Household → Invite someone** and text her the link.

## 6. For Erin

Open the link in Safari, then **Share**, then **Add to Home Screen**. It now opens like an app, already signed in.

That's it. Pick a vibe, browse, heart things, and press **Yes, this is the one** when it's the one. Then send the shop the print file and order sheet from the last screen.

## 7. Your own address (studio.evolvingword.com)

The domain stays registered at GoDaddy, and nothing else on it changes (including email). You add one record there that points `studio` at Vercel.

1. **Vercel:** the project, then **Settings**, **Domains**, **Add**, and enter `studio.evolvingword.com`. It says it isn't configured yet and shows a **CNAME** record: name `studio` and a value ending in a Vercel DNS host. Copy that value exactly.
2. **GoDaddy:** sign in, **My Products** (or **Domain Portfolio**), click `evolvingword.com`, then the **DNS** tab.
3. Look at **Nameservers** on that page. GoDaddy's own (`ns##.domaincontrol.com`) means the records live here; carry on. Anyone else's means they live with that provider instead: add the record there, and **don't change the nameservers**, which is what would break email.
4. **DNS Records**, then **Add New Record**: type **CNAME**, name `studio`, value from Vercel, TTL left as it is. Save.
5. Leave every other record alone: MX and TXT (email), `@` and `www` (parking or forwarding). A `*` record is fine; the `studio` one wins over it.
6. **Back in Vercel:** the domain turns green once the record is visible, usually within minutes (occasionally a few hours), and Vercel sets up HTTPS itself. Then edit the project's own `.vercel.app` domain to **redirect** to `studio.evolvingword.com`, so old links land in the right place.

You'll each sign in once more on the new address: sign-ins don't carry across domains. Personal links work there too (copy fresh ones from Setup, which shows the new address).

## 8. Sign in with Google

Instead of personal links, you each sign in with your own Google account. Do this on the new address from step 7, so every setting below uses it. Setup has a **Sign in with Google** row with every value below filled in and copy buttons.

1. **Google Cloud console** ([console.cloud.google.com](https://console.cloud.google.com)):
   - Create a project called "Our Studio".
   - **Google Auth Platform** (or **OAuth consent screen**): app name "Our Studio", your address as the support contact, audience **External**. Leave it in **Testing**, and add both your Gmail addresses as **test users**. Only test users can get past Google, which is exactly what you want.
   - **Clients** (or **Credentials**), **Create client**, type **Web application**, with the authorized redirect URI `https://studio.evolvingword.com/api/auth/callback`.
   - Copy the **client ID** and **client secret**. Google may only show the secret once; if it's gone, **Add secret** on the client makes a new one.
2. **Vercel**: add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from that client, and `ERIN_GOOGLE_EMAIL` and `JOEL_GOOGLE_EMAIL` (the Google addresses you each sign in with), Production only, type **Secret**, then redeploy.
3. **Supabase**, **Authentication** → **Sign In / Providers**: make sure **Email** is off. The app never uses Supabase's sign-in, and leaving Email on lets anyone make an account there with any address.
4. Open `https://studio.evolvingword.com`, sign out if you're signed in (the button at the bottom of Setup, or just use a private window), and press **Continue with Google**. Google asks which account to use, then sends you straight back.
5. Once you've both signed in with Google, add `SIGN_IN_LINKS=off` in Vercel and redeploy. The links stop working; phones already signed in stay signed in.

Any Google account whose address isn't in a household (section 10) gets "That Google account isn't on the list", and nothing about it is kept. The app asks Google only to confirm your email address.

### Switching over from the Supabase way

Google sign-in used to go through Supabase Auth, which is why Google's screen named the supabase.co address. Without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` it still does, so nothing breaks while you switch. Setup's **Sign in with Google** row says which way it's going, and has these steps with copy buttons:

1. **Google Cloud console** → Google Auth Platform → **Clients** → your web client: add the redirect URI `https://studio.evolvingword.com/api/auth/callback` and save. Copy the client ID, and the secret (or **Add secret** for a new one).
2. **Vercel**: add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, Production only, type Secret, and redeploy. Setup now says "straight to Google".
3. Check it in a private window, so you stay signed in on your usual browser if something's off (with personal links switched off, that session is your way back in): **Continue with Google** should land you on the home screen. If it says "Didn't work that time", the redirect URI in step 1 is the usual culprit; removing the two variables and redeploying puts things back as they were. Then tidy up:
   - Google: remove the `…supabase.co/auth/v1/callback` redirect URI, and the supabase.co entry under **Branding → Authorized domains**.
   - Supabase: **Authentication → Sign In / Providers → Google** off, and delete your two old records under **Authentication → Users**.

### Later: showing "Our Studio" on Google's screen (brand verification)

There's no need to do this for the two of you. In Testing, only the test users can get past Google, and the app itself only lets in the two addresses in Vercel: two locks. Until the app is verified, Google's screen names the site's address rather than "Our Studio", and test users' approval lapses after seven days, so Google may ask you to approve again on a sign-in more than a week after the last one (the app keeps you signed in for a year, so it rarely comes up).

When someone beyond the two of you is joining, publish the app and have Google verify its branding. Google reviews it by hand, which takes a few business days. Setup's **Sign in with Google** row has a **For Google's brand verification** box with every value below and copy buttons. Switch over from the Supabase way first: Google wants every authorized domain verified as yours, and a supabase.co address can't be.

1. **Vercel**: add `CONTACT_EMAIL` (an address you read; it appears on the privacy page and terms), Production only, then redeploy.
2. **Google Search Console** ([search.google.com/search-console](https://search.google.com/search-console)): add `evolvingword.com` as a **Domain** property. It gives you a TXT record; add it at GoDaddy (DNS → Add → TXT, Name `@`) and press Verify. This proves you own the domain.
3. **Google Auth Platform → Branding**: app name "Our Studio", the logo (`docs/google-logo.png`, 120 × 120), support email, and:
   - App home page: `https://studio.evolvingword.com`
   - Privacy policy: `https://studio.evolvingword.com/privacy`
   - Terms of service: `https://studio.evolvingword.com/terms`
   - Authorized domain: `evolvingword.com`, and nothing else
   - Developer contact: your address
4. **Audience**: **Publish app** (it moves from Testing to In production), then **Verification Center** → submit for brand verification. The app only asks Google to confirm an email address, so there's no security review.

Publishing never lets anyone into the app by itself: it still only admits the addresses in Vercel. **Audience → Back to testing** undoes it.

The home page, privacy page and terms are the three pages anyone can open without signing in. If you change what the app collects or who it shares it with, update `src/app/privacy/page.tsx` and the date in `src/components/Legal.tsx`.

### Email codes, for anyone without Google

Once Resend is set up (section 9: the `RESEND_API_KEY` the alerts use), the welcome page also offers **No Google account? Get a code by email**. You type your address, get six digits from `EMAIL_FROM`, and type them in. Nothing else to set: the codes go to the same addresses as Google sign-in (`ERIN_GOOGLE_EMAIL`, `JOEL_GOOGLE_EMAIL`), and Setup's **Email codes** row says whether it's on.

- A code lasts 10 minutes and only works in the browser that asked for it, so a code read over someone's shoulder is no use on another phone.
- Five wrong tries and that code is dead. Each address gets at most 5 codes an hour and 10 a day from any one network (30 a day from everywhere), which keeps six digits out of reach of guessing. One network can ask for 20 an hour and 60 a day, one invite for 5, and the whole site sends at most `CODE_EMAILS_PER_DAY` (100), so nobody can use the form to flood someone's inbox or run down the email quota.
- Every address gets the same answer ("if it's on the list, a code is on its way"), so the form can't be used to find out who's invited. Addresses that aren't on the list never get an email.
- If the counters in the database can't be reached, codes stop working rather than going uncounted. Google sign-in carries on.

**If something goes wrong:** the welcome page says what happened. "Timed out" usually means you started on one address and finished on another (start again on `studio.evolvingword.com`). "Didn't work that time" with nothing else is usually a mismatch in step 1 or 2 (most often the redirect URI, which has to match exactly); Vercel's logs (**Logs**, filter on `Google sign-in`) show what Google said. Personal links keep working until step 5, so you can't lock yourselves out while setting this up.

---

## 9. Backups and error alerts

Two things that matter more once other people's work is in here: a copy of the database every night, and an email when something breaks. Setup has a row for each, with a **Back up now** and a **Send a test** button.

### Nightly backup (5 minutes)

1. **Vercel** → Settings → Environment Variables: add `CRON_SECRET`, Production only, type **Secret**. Setup's **Backups** row suggests a value with a copy button (or run `openssl rand -hex 24`). Then redeploy.
2. **Setup → Backups → Back up now** to make the first copy straight away. The row then shows when the last copy was made. If the last copy is more than a day and a half old, the row turns yellow and your home page says the nightly backup isn't working: a schedule that has stopped never runs far enough to send an alert itself.

From then on, Vercel runs it every night (`vercel.json` asks for 10:17 UTC, about 3am in California; on the free plan it can start any time in that hour). Each copy goes to the private storage named by its date (`backups/2026-10-21.json`), and copies older than 30 days are deleted, so a month of them is always there and something erased is gone from them within 30 days. (Copies from before they were dated, `day-01.json` to `day-31.json`, are cleared as their day comes round.) Nobody can download them through the site; you can in Supabase → Storage → `studio` → `backups`. They guard against mistakes, like a project deleted by accident; restoring one is a job for Claude (`restore` in `src/lib/server/backup.ts`). They don't cover losing the Supabase project itself: Supabase Pro's own daily backups do, and Pro also stops a quiet project being paused after a week.

### Error alerts by email (about 20 minutes, mostly waiting for DNS)

1. **Resend** ([resend.com](https://resend.com)): sign up (Google sign-in works). The free plan sends 3,000 emails a month, far more than this needs.
2. **Domains → Add Domain**: `evolvingword.com`, the region nearest you. Resend lists three DNS records (usually a TXT named `resend._domainkey`, and an MX and a TXT named `send`). Copy each one exactly from Resend.
3. **GoDaddy** → `evolvingword.com` → **DNS** → **Add New Record**, once for each. In the Name field, type just the part before `.evolvingword.com` (`resend._domainkey`, `send`), the same way you did the DKIM record for email. They sit beside your email's records and don't change them: your MX, SPF and DMARC stay as they are.
4. Back in Resend, **Verify DNS Records**. Usually minutes, sometimes a few hours.
5. **API Keys → Create API Key**: name it "Our Studio", **Sending access**, domain `evolvingword.com`. Copy it now; Resend only shows it once.
6. **Vercel**: add `RESEND_API_KEY` (Production only, type Secret), and `ALERT_EMAIL` with the address the alerts should go to (leave it out to use `CONTACT_EMAIL`). Redeploy.
7. **Setup → Error alerts → Send a test.** If Resend refuses it, the button says why (most often, the domain isn't verified yet). Check spam the first time, and mark it "not spam".

What sends an alert: a request that fails with an error nobody planned for, a page that crashes, Claude refusing a request, the database not answering or not being set up right, the artwork service failing a whole batch, rate limits that can't be counted, and a nightly backup that doesn't save. One email an hour for each problem, and at most three an hour of each kind, so one noisy problem can't hide another; the rest are in Vercel's logs. Alerts say where and what went wrong, never what anyone typed, and printer-link secrets, email addresses and long ids are blanked out. Whoever was using the site sees only what to do next ("The AI isn't working right now"), not the details.

## 10. Households

Projects belong to a household: a family, or any group making things together. Everyone in it sees its projects, hearts and approvals, and nobody outside it sees any of them, not even you as the person who runs the site. The two of you are the first household, you as its owner.

1. **Supabase → SQL Editor**: run `supabase/migrations/0006_households.sql` (it's in the setup SQL on the Setup page). It makes three tables (people, households and who belongs to which) and marks everything you've made so far as the first household's.
2. Open the site. The first time the app finds those tables empty, it adds the two of you from `ERIN_GOOGLE_EMAIL` and `JOEL_GOOGLE_EMAIL`. Setup's **Households** row turns green, and **Household** (in the sidebar, or at the foot of the home screen on a phone) shows who's in yours.

Until step 1 is done everything works as before, worked out from those two variables. Afterwards, sign-in (Google and email codes) looks people up in the database. While the two variables are in Vercel they stay Erin's and your sign-in addresses, so changing one and redeploying still changes who that is.

As the owner you can rename the household, and archive or delete any of its projects.

**Inviting people (one more SQL step).** Run `supabase/migrations/0007_invites_and_sessions.sql` in Supabase's SQL Editor (it's in the setup SQL on the Setup page too). It adds invites and the list of signed-in devices. Then:

- **Into your household:** Household → **Invite someone** → their name → **Make the link**. Copy it (or Share) and send it however you like; a text is easiest. The link works once, for 7 days, and the page can't show it again (only a scrambled form of its secret is kept). Waiting invites are listed underneath with **Cancel**.
- **A new household:** Setup → Households → **Invite a new household** → their name and a name for the household (they can rename it). Whoever opens it becomes that household's owner, with the $10 a month AI budget new households start with.
- Opening a link shows who it's from and asks their name. Someone already signed in joins with one tap; anyone else continues with Google or gets a code by email, at whatever address they like (codes only go to unknown addresses while an invite is waiting in that browser). The Firewall rule on `/api/auth/` covers the invite routes too.

**Who's in it.** Owners see **Change** next to each person: make them an owner (there can be several), make an owner a member again (there's always at least one), or take them out. Anything they had the final say on passes to you, and their hearts stop counting. Nobody can take you out, since you run the site, and you always keep at least one household. Anyone can **Leave the household** at the foot of the page, except its only owner or the only person in it. Someone in more than one household switches between them there too; each browser remembers which one it's in.

**You (your name in the sidebar, or You at the foot of the phone home screen).** Change your name, see where you're signed in (a short device name, when, and how), sign out any other device or **everywhere else**, and close your account. Signed-in devices check the list on every request, so signing one out takes effect within about half a minute.

**What a new household sees.** Their home starts empty: a welcome with their household's name, **Start your first project** with the occasions one tap away, a nudge to invite someone if they're on their own, and four steps on how it works. Someone joining a household that already has projects gets a short "New here?" card instead, until they tap Got it or start something. The steps are always at **How it works** (sidebar, or the foot of the phone home screen). Your own projects stay in your household only.

**Nothing is deleted unless someone means it.** Three tiers, gentlest first:

1. **Leaving or being taken out of a household** only ends the membership. Owners see them under **Past members** with **Invite back**, and their hearts return with them.
2. **A closed account** (they closed it on You) or **a switched-off one** (you did, on Setup → People): signed out everywhere, out of every household, can't sign in, but everything is kept and their name stays on what they did. Ownership passes to whoever joined next if they were the only owner, and the final say on anything unapproved passes to an owner (it doesn't pass back on its own after a restore; use Final say · Change). An invite brings back someone who closed their own account, into that household; one you switched off only comes back when you **Restore** it, into every household it left. A household whose last person closed their account stays, listed on Setup → People as nobody's in it.
3. **Erased for good**: only from Setup → People. **Erase now** works on a closed or switched-off account, with their name typed out; **Erase** on a household nobody's in, with its name. Someone closing their own account can tick **Also erase my data in 30 days**; the nightly job (the same one as the backup, after it) erases them when the date comes, and **Keep their data** on Setup → People stops it. Erasing takes their name, address, sign-ins, devices, hearts, maybes and passes, and any household nobody else could come back to, with all its projects and files. The nightly backups still hold a copy for 30 days. Your own account can't be closed or erased.

**Spending totals (one more SQL step).** Run `supabase/migrations/0008_spend_totals.sql` the same way. It lets the database add up each household's spending for the month, so the budgets count every entry however many there are. Until it's run, the app adds them up itself (slower) and Setup's Storage row says it's missing.

**Requests that get cut off.** Every AI call holds its worst-case cost before it starts and settles the real cost when it finishes. If Vercel stops a request partway, its hold is settled by the nightly job instead: a painting keeps its hold (it may well have been billed), a Claude call counts at a quarter of its, so a few cut-off calls don't quietly use up a household's month.

**AI budgets.** Each household has its own monthly AI limit as well as the site's `MONTHLY_BUDGET_USD`, so one busy household can't use up everyone else's month. New households start at $10; yours has no limit of its own unless you give it one, so only the site's budget applies to it. Change any of them on Setup under **AI spending this month** (**Change** next to each household; it takes effect at once, no redeploy). The site's budget is still the backstop: once it's used up, everyone stops, whatever their own limit. Each household sees its own total on its Household page; only you see everyone's totals, and the list of what was spent on shows only your household's.

## Running it on a laptop instead

```bash
npm install
npm run dev
```

Open http://localhost:3000 and pick "I'm Erin" or "I'm Joel". Everything saves to a `.data` folder. Keys go in `.env.local` (copy `.env.example`); without any keys you still get the full app, plus a practice artist that paints built-in scenes so you can try the artwork flow for free.

## Something's wrong?

**Signing in works, then "Almost ready".** The database isn't connected yet. Sign in with your own link and the home page tells you exactly what Supabase said, in plain English; **Setup** has the details and the SQL. Fix it in Supabase or Vercel, redeploy if you changed a variable, and reload. Erin just sees "Joel is still setting things up".

The usual culprits:

| What it says | What to do |
| --- | --- |
| the tables aren't there yet | Run the SQL files (step 1.4) in Supabase's SQL Editor. Setup names the table that's missing and the file that makes it. |
| refused access to the tables | Run `0003_server_access.sql`. If it still says so, the key is the wrong one (next row). |
| the activity table isn't there yet | Run `0005_activity_and_limits.sql`. Everything else keeps working until you do; the activity log is just empty and nobody is rate limited. |
| didn't accept the key / publishable key / anon key | `SUPABASE_SECRET_KEY` must be the **secret** key (starts `sb_secret_`), not the publishable one. Or use the legacy `service_role` key as `SUPABASE_SERVICE_ROLE_KEY`, never `anon`. |
| dashboard address | `SUPABASE_URL` must be the Project URL, `https://<something>.supabase.co`, not the dashboard's address. |

**"Can't reach the database".** Supabase didn't answer within 8 seconds (60 for files), or answered with an outage page. Nothing is lost; everyone sees that page with a Try again button instead of waiting, and you get an alert email saying why. On your home page the reason is shown too. Usually the project is paused (free projects pause after a week of quiet: Supabase dashboard → **Restore**) or Supabase is having a bad day ([status.supabase.com](https://status.supabase.com)). If it says it couldn't find the address, `SUPABASE_URL` is wrong.

**"Claude isn't working" on your home page.** Features that use Claude quietly fall back to simpler versions when it fails, so the app keeps track instead: when Claude's last call failed for a reason that won't fix itself (a bad key, a model name it doesn't know), or failed three times running, your home page and **Setup** say so, with Claude's own reason. The same goes for AI artwork. Erin doesn't see it. Fix the setting, redeploy, then press **Test it** on Setup; a call that works clears the warning.

**"Something went sideways" with an error code.** Open Vercel → your project → **Logs**, search for the code, and the full error is there. Send it to Claude if it isn't obvious.

**"That's a lot of … in a short while."** A per-person rate limit (the numbers are in the README's Security section). It says how long to wait. The first time someone hits one in a window, it shows up in **Activity**; if that's someone hammering the AI on purpose, change their session as in "Lost phone" below.

**Changed a variable and nothing changed?** Vercel only picks up variable changes on a new deployment: **Deployments** → the three dots on the latest → **Redeploy**.

## Printer search

The **Find a printer** section on the final screen uses Claude with web search, so it needs `ANTHROPIC_API_KEY`. A search reads several websites and costs roughly 20 to 50 cents; it counts against the monthly budget like everything else. Results are reused for 30 days per ZIP code, so only the first search (or a Refresh) costs anything, and searching the same ZIP code twice within 10 minutes never runs a second search. If a search says web search is turned off, an admin of your Anthropic organization can switch web search on in the Claude Console's organization settings.

Everything it finds comes from the printers' own pages and is marked "not verified": prices and minimums change, so confirm with them before you order.

**Send them the files** works without Claude: it makes a link the printer can open without signing in (it lasts two weeks, and you can turn it off from the same sheet).

## Lost phone or leaked link?

From any other device: **You → Where you're signed in**, then sign out the lost one (or **Sign out everywhere else**). It takes effect within about half a minute. Signing out of every device belonging to someone else is Setup → People → switch the account off, then Restore it. To sign everyone out at once, change `SESSION_VERSION` and redeploy. If the Google account itself might be compromised, change its password at Google first.

Still have a personal link variable set (`*_LINK_TOKEN`)? Delete it and redeploy; that link stops working at once.

## Security checklist (before going live)

The app's own sign-in is what keeps production private on Vercel's free plan, so these few settings matter:

1. **Sign-in**: Google sign-in (section 8) with the Email provider off in Supabase. Email codes come on by themselves once Resend is set up. No `*_LINK_TOKEN` variables left in Vercel.
2. **Vercel environment variables** (Settings → Environment Variables): every row ticked for **Production** only, so preview builds can't use any of it, and every key or secret (the Supabase key, the AI keys, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`, any link tokens) of type **Secret**. Plain settings like the email addresses can stay **Config**. Anything once marked Sensitive already counts as Secret. To fix a row that's wrong: delete it, add it again the right way, then redeploy.
3. **Deployment Protection**: Settings → Deployment Protection → **Vercel Authentication** on, **Standard Protection**, Save. That puts every preview and every `….vercel.app` deployment address behind your Vercel login, while `studio.evolvingword.com` stays public, as it has to, with the app's own sign-in in front of it.
4. **Hard spending caps at each AI provider**, as a backstop to the app's own monthly budget:
   - Anthropic Console → **Limits**: set a monthly spend limit (around $20).
   - fal.ai: keep a small prepaid balance and leave **auto top-up** off.
   - OpenAI (if used): Project → Limits → a monthly budget.
5. **Vercel Firewall**: the free plan allows one rate-limit rule, and this is the one. It caps every way in at 10 tries a minute from one address, which no person needs and every script does.
   1. Project → **Firewall** → **⋯** (top right) → **Configure** → **Add New… → Rule**. Name it "Sign-in".
   2. **If** *Request Path* *Starts with* `/api/auth/`, then **+** a second condition joined with **OR**: *Request Path* *Equals* `/api/session`. (`/api/auth/` covers Google's trip there and back and both email-code steps.)
   3. Each of the two groups gets its own **Rate Limit** row: Fixed Window, **60** seconds, **10** requests, key **IP Address**. (A group without one would act on every request it matches, so every sign-in.) **Then**: **Log** for now. **Save Rule**, then **Review Changes → Publish** (a saved rule does nothing until it's published).
   4. Test it from a Mac's Terminal. A normal sign-in is two or three requests, so it never trips the rule and the Firewall page stays empty; this sends twelve in a row:

      ```
      for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " https://studio.evolvingword.com/api/auth/google; done; echo
      ```

      With **Log**, all twelve answer `302` (off to Google), and a minute or two later Firewall → Traffic, filtered to the rule, shows about two **Logged**. If it shows all twelve, a group is missing its Rate Limit row; if none, run it again (the window resets on the minute).
   5. Edit the rule's action to **Too Many Requests (429)** and publish again. If Vercel asks you to upgrade for 429, pick **Deny** instead (it answers 403, which is just as good here). A minute later, the same command should end `429 429` (or `403 403`).
6. **Supabase**: every SQL file run (Setup shows a green Storage row when they all have), the `studio` bucket shows **Private**, and the secret key lives only in Vercel.
7. **GitHub**: keep the repo private, and:
   - **Two-factor sign-in**: your picture → **Settings** → **Password and authentication** → **Enable two-factor authentication**. Use an authenticator app (scan the QR code, type the six digits), download the recovery codes and keep them somewhere that isn't this laptop. A passkey can be added on the same page afterwards.
   - **Dependabot**: the repo → **Settings** → **Advanced Security** (under "Security and quality"; it used to be called Code security) → **Enable** next to Dependency graph (if it's off), **Dependabot alerts** and **Dependabot security updates**. The repo already asks Dependabot for weekly update pull requests; this adds a warning, and a fix, as soon as a known hole turns up.
   - Secret scanning isn't offered for private personal repos, so nothing to do there: the keys live only in Vercel anyway.
8. **After the trip** (optional): delete old print packages and artwork in Supabase Storage. If the repo ever goes public, scrub its history first; the trip's dates and route are in every commit.
