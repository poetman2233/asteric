# Asteric founder guide

This guide is written for a non-technical founder. It covers getting Asteric live on the internet, inviting your first firm, running an investor demo, and the day-to-day jobs that keep it healthy. No coding is required. You will copy and paste a few values between websites.

---

## 1. What you are deploying

- **One website** that serves both your marketing page (`yourdomain.com/`) and the product (`yourdomain.com/app`).
- **One database** (Postgres) that stores every firm's data. Each firm can see only its own data; the database itself enforces this.
- **A daily maintenance job** that refreshes the demo workspace, deletes organizations whose owners asked for deletion more than 30 days ago, and cleans up expired sign-ins.

You will use three free-to-start services:

| Service | What it does | Cost to start |
|---|---|---|
| **GitHub** | Stores the code (you already use it) | Free |
| **Vercel** | Runs the website and the daily job | Free Hobby plan for testing; **Pro (about $20/month) is required for commercial use** |
| **Neon** | The Postgres database | Free tier (0.5 GB) is plenty for pilots; paid plans from about $19/month |
| **Resend** (optional) | Sends invitation and password-reset emails | Free up to 3,000 emails/month |

Expect roughly **$0/month while testing** and **about $40 to $60/month** once you have paying firms on Vercel Pro and a paid Neon plan. Prices change; check each provider's pricing page.

---

## 2. Before you start: put the code on GitHub

The new application was built on a separate branch, so your current landing page on `main` is untouched.

1. Make sure the branch with the application (named `v1-app` unless told otherwise) is on GitHub in your `asteric` repository.
2. Leave `main` as it is until you have checked the new deployment. GitHub Pages can keep serving the old page in the meantime.

---

## 3. Create the database (Neon)

1. Go to **neon.tech** and sign up (you can use your GitHub account).
2. Create a project. Name it `asteric`. Choose the region closest to your customers (for US firms, an AWS US East or US West region).
3. On the project dashboard, click **Connect**. Choose **Pooled connection**. Copy the connection string. It looks like
   `postgresql://neondb_owner:…@ep-…-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`.
4. Keep it somewhere private (a password manager). **Never paste it into GitHub, email or chat.**

---

## 4. Generate your secrets

You need three random values. The easiest way: open **https://generate-secret.vercel.app/32** three times and copy each result. (Each one is 32 random bytes; any equivalent generator works.)

- `APP_ENCRYPTION_KEY`: protects two-factor authentication secrets. **Do not lose it or change it later**, or everyone will need to set up two-factor again. Store it in your password manager.
- `CRON_SECRET`: lets Vercel's daily job prove it is allowed to run maintenance.
- `SETUP_TOKEN`: a one-time password for creating your own administrator account. You will delete it afterwards.

---

## 5. Deploy on Vercel

1. Go to **vercel.com**, sign up with GitHub, and click **Add New → Project**.
2. Import your `asteric` repository. If Vercel asks for permission to see the repository, grant it.
3. Before clicking Deploy, open **Environment Variables** and add these (name on the left, value on the right):

| Name | Value |
|---|---|
| `DATABASE_URL` | The Neon connection string from step 3 |
| `APP_URL` | For now `https://<your-project>.vercel.app` (you will change it when you add your domain) |
| `APP_ENCRYPTION_KEY` | Secret 1 from step 4 |
| `CRON_SECRET` | Secret 2 |
| `SETUP_TOKEN` | Secret 3 |
| `PLATFORM_ADMIN_EMAILS` | Your own work email |
| `SIGNUP_MODE` | `invite_only` |
| `DEMO_MODE` | `enabled` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | The email you want shown on public pages (optional) |
| `NEXT_PUBLIC_LEGAL_ENTITY` | Your company's legal name, once formed (optional) |

The full list, with explanations, is in `.env.example`.

Apply the variables to the **Production** environment. Every build applies database updates (migrations) to the database in `DATABASE_URL`, so if you also enable them for **Preview** deployments, give Preview its own Neon branch or database rather than the production one.

4. Under **Build and Output Settings**, leave the defaults: the repository's `vercel.json` already tells Vercel to set up the database tables before each build.
5. Under **Git**, set the **Production Branch** to the application branch (`v1-app`) for now, or merge it into `main` once you are happy (see section 11).
6. Click **Deploy**. The first deploy takes two to four minutes. When it finishes, Vercel shows your URL.

**Check it worked:** open `https://<your-project>.vercel.app/api/health`. You should see `{"ok":true}`. Then open the root URL: your landing page should appear exactly as before.

---

## 6. Create your administrator account

1. Open `https://<your-project>.vercel.app/signup?setup=<your SETUP_TOKEN>`.
2. Sign up with the email you put in `PLATFORM_ADMIN_EMAILS`. Use a long, unique password.
3. You land on **/admin**. Check the **Tenant isolation** box says **RLS enforced**. If it says *App-layer only*, see Troubleshooting.
4. Go to **Settings → Security** in the app later and turn on two-factor authentication for your account.
5. In Vercel → Settings → Environment Variables, **delete `SETUP_TOKEN`**, then redeploy (Deployments → ⋯ → Redeploy). This closes the setup door.

The administrator account manages the platform. It is **not** a member of any firm and cannot see firms' matters. That is deliberate.

---

## 7. Set up the demo workspace

In **/admin**, click **Create demo workspace**. In about 10 seconds you will have "Keller & Ross Employment Law", a fictional firm with roughly 720 synthetic matters spanning 2019 to today. It is labeled as synthetic everywhere it appears.

- Anyone can enter it from the login page with **Explore the demonstration workspace**. To restrict it, set `DEMO_ACCESS_CODE` in Vercel to a code you share with investors.
- Visitors can look at everything and even record "sandbox" predictions, but nothing they do touches real data, and the workspace regenerates every night.
- To turn the demo off entirely, set `DEMO_MODE` to `disabled`.

### A five-minute investor walkthrough

1. **Overview**: the firm's calibration curve, return on legal capital, and three findings computed from its own records.
2. **Insights**: "Matters predicted at $1M or more have been systematically overestimated", "Pacific Labor Referral Group has the highest median recovery but the lowest return on legal capital", "Marco Rodriguez is well calibrated on probability but underestimates duration". Click **View supporting matters** on any of them: the list shows exactly the matters behind the claim.
3. **Matters → search "KR-1182"** (Okonkwo v. Meridian Logistics): the decision ledger. Initial prediction, a locked revision after discovery with the reason, offers, and the $475,000 settlement compared with both predictions.
4. **Portfolio Watch → search "Delgado"** (KR-1843): an open matter whose expenses have run well past its latest forecast.
5. **Calibration**: toggle **Initial prediction / Latest before resolution** to show whether revisions improved accuracy.
6. **Record a sandbox prediction** on any open matter to show how quickly it takes to capture a forecast.
7. **Network (Preview)**: be explicit that it is not live. This is the long-term vision, not a current feature.

---

### What to show in the demo (V2)

After you click **Regenerate demo workspace** in `/admin`, the Decision Inbox opens on three stories:

1. **Overconfidence.** Firm Learning shows that matters assessed at $1M or more were overestimated. Ana Keller turned that into the rule "Second assessment for matters forecast at $1M or more", and the new matter *Moreau v. Cobalt Data* is now in the inbox under it.
2. **Expense drift.** *Delgado v. Corepoint* expected $50,000 in expenses but has spent $76,000 (+52%). Click **Review assessment** to update it, or **Confirm no change**.
3. **Referral economics.** Pacific Labor Referral Group has the lowest return on legal capital. It was placed under review, so the new Pacific matter *Haddad v. Halden Retail Group* is in the inbox.

To show the full loop: open a matter, click **Assess matter** (about 30 seconds), add an event such as "Mediation held", answer "Has your view changed?", then open Firm Learning and click **Create review rule** on a finding.

## 8. Invite your first firm

1. A firm asks for access through **Request access** on your site. Their request appears in **/admin → Access requests**. You can also provision a firm directly with **Provision an organization**.
2. Enter the firm name and the owner's email, then click **Approve** (or **Create and invite owner**).
3. If email is set up, the owner receives the invitation. If not, /admin shows the invitation link: copy it and send it yourself. It expires in seven days.
4. The owner opens the link, sets a password, completes a short onboarding, and chooses **Import historical matters**.
5. The owner invites colleagues from **Settings → Team** and chooses each person's role:

| Role | Can do |
|---|---|
| Organization owner | Everything, including deleting the organization |
| Administrator | Manage team, settings, imports and exports |
| Partner / Attorney | Record predictions, events and outcomes; view analytics |
| Analyst | Import data, record events and outcomes; view analytics |
| Read only | View only |

---

## 9. The first import

Help the firm export **closed and open matters** from their case management system (Filevine, Litify, Clio, Salesforce, SmartAdvocate or a spreadsheet) as CSV or Excel. Useful columns: matter ID and name, case type, lead attorney, referral source, date opened, status, date closed, disposition, gross settlement, case costs, attorney fee, and any intake probability or value estimate recorded at the time.

Then, in **Imports → New import**:

1. **Upload.** Files up to 4 MB and 20,000 rows. Nothing is saved to their matters yet.
2. **Map columns.** Asteric suggests where each column goes and shows its confidence. The firm corrects anything wrong and confirms.
3. **Review values.** Asteric groups messy values ("Wrongful Term.", "wrongful termination") and attorney name variants ("J. Ross", "Jane Ross"). High-confidence matches are accepted automatically; uncertain ones wait for a person. Unreviewed values are imported as blank, never guessed.
4. **Commit.** Duplicates are skipped. The report shows exactly what was created, skipped and missing.

A deliberately messy sample file is available on the upload page so you can practice first.

Optional AI help: if you add an AI provider key (see `.env.example`) **and** the firm turns it on in Settings → Organization, Asteric can suggest mappings for unusual column headers. Only column headers and value types are sent, never cell contents, and a person must confirm every suggestion.

---

## 10. Optional: email, custom domain

**Email (Resend):** create an account at resend.com, add and verify your domain (Resend shows the DNS records to add at your domain registrar), create an API key, then add `RESEND_API_KEY` and `EMAIL_FROM` (for example `Asteric <no-reply@yourdomain.com>`) in Vercel and redeploy.

**Custom domain:** in Vercel → Project → Settings → Domains, add `yourdomain.com` (and `www.yourdomain.com`). Vercel shows the DNS records to add at your registrar. When the domain shows *Valid*, change `APP_URL` to `https://yourdomain.com` and redeploy. HTTPS is automatic.

Moving off GitHub Pages: once the custom domain points at Vercel, GitHub Pages is no longer used. You can turn it off in the GitHub repository's Settings → Pages.

---

## 11. Making `main` the production branch

When you are satisfied with the deployment, open a pull request on GitHub from `v1-app` into `main` and merge it. Then set Vercel's Production Branch back to `main`. Your original landing page HTML remains in the git history and is preserved, with only its links updated, at `public/landing/`.

---

## 12. Day-to-day operations

- **Daily job:** runs automatically at about 09:17 UTC (Vercel → Settings → Cron Jobs shows its history). It regenerates the demo, purges organizations past their deletion grace period, and clears expired sessions.
- **Logs:** Vercel → Project → Logs. Errors appear as structured lines such as `request.unhandled`. Logs never contain passwords, tokens or matter content.
- **Health:** `/api/health` returns `{"ok":true}` when the site and database are reachable. A free uptime monitor (for example UptimeRobot or Better Stack) can watch it and email you.
- **Backups:** Neon keeps point-in-time history (the length depends on your plan). For pilots, consider a paid plan with longer history.
- **A firm wants to leave:** the owner exports everything from **Settings → Data**, then schedules deletion there. It is permanent after 30 days. Before then the owner (or you, from /admin) can cancel.

---

## 13. Before your first paying customer: legal review

The Privacy, Terms and Security pages were written to describe exactly what the software does, but **they have not been reviewed by a lawyer**. Each file carries an internal comment saying so; the public pages carry no such warning. Before real client data is uploaded, ask qualified counsel to review:

- `src/app/(public)/privacy/page.tsx`, `terms/page.tsx` and `security/page.tsx`: entity name, governing law, liability limits, data-processing terms, state privacy laws.
- Whether you need a data processing agreement (DPA) with each firm, and what attorney confidentiality rules (for example ABA Model Rule 1.6 and state equivalents) require of a vendor holding matter data.
- Vendor terms for Vercel, Neon, Resend and, if enabled, the AI provider.

Do not add claims such as "SOC 2 certified" unless you have obtained that certification. The security page currently says, accurately, that no third-party audit has been completed yet.

---

## 14. Troubleshooting

| Symptom | What to do |
|---|---|
| Build fails with "DATABASE_URL is not set" | Add `DATABASE_URL` in Vercel → Environment Variables (for Production and Preview), then redeploy. |
| /admin shows **App-layer only** for tenant isolation | Your database user cannot create the `asteric_app` role. On Neon, use the default owner role from the dashboard's connection string. Isolation is still enforced by the application, but the database layer is the important second lock; fix this before onboarding firms. |
| "The demonstration workspace has not been set up yet" | Click **Create demo workspace** in /admin. |
| Invitees never receive emails | Email is not configured. Copy the invitation link from the screen, or set up Resend (section 10). |
| Everyone was asked to set up two-factor again | `APP_ENCRYPTION_KEY` changed. Restore the original value from your password manager. |
| Daily job shows 401 | `CRON_SECRET` is missing or was changed; set it and redeploy. |
