# CURT.ie Quiz

A small Angular app for running the weekly JOE.ie Friday Pub Quiz with a group. Players sign in with a magic link (no passwords), answer the questions with instant feedback, and the score is saved as that email address. Weekly and all-time leaderboards are built in. Every Friday at 11:00 Irish time, every player gets an email invite.

It is an unofficial companion to [JOE.ie](https://www.joe.ie/quiz). Questions belong to JOE.ie, and every quiz links back to the original.

## How it works

- **Frontend:** Angular (standalone components, signals), hosted on GitHub Pages.
- **Storage:** Supabase Postgres. The browser only holds the project URL and the public anon key. Scores are written only through `submit_score`, which reads the signed-in email from the session. Nobody can submit as someone else.
- **Sign-in:** magic link email via Supabase Auth. Only addresses already on the `players` list receive a link (`shouldCreateUser: false`).
- **Admin:** `/admin` for publishing the quiz, managing players, and sending the invite now. Password sign-in and magic link both work for the admin account.
- **Weekly job:** Edge Function + `pg_cron` at Friday 11:00 `Europe/Dublin`. It finds the newest JOE Friday Pub Quiz, publishes it, then emails every player a normal link to the site (not a magic link). If that week is already current, it does nothing. If the fetch fails, only the admin is emailed and the previous quiz stays up.
- **Keep-alive:** a daily GitHub Actions job queries Supabase so the free project never pauses for inactivity.

## One-time setup

### 1. GitHub Pages

Create a public repo named `curt-ie-quiz`, push this project, set Pages source to **GitHub Actions**, and add repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` (never the service role key). Full click path is in the earlier deploy notes: Settings → Pages → Source → GitHub Actions.

### 2. Supabase schema

1. Create a free Supabase project.
2. Run [`supabase/migrations/20261113000000_init.sql`](supabase/migrations/20261113000000_init.sql) in the SQL editor.
3. If you already inserted players without emails, add an `email` value for each row in the Table editor.
4. Run [`supabase/migrations/20261118000000_magic_link_players.sql`](supabase/migrations/20261118000000_magic_link_players.sql).

### 3. Admin user

1. Authentication → Users → Add user (email + password, auto-confirm).
2. Authentication → Providers → Email: turn off **Allow new users to sign up**.
3. Run:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'you@example.com';
```

### 4. Brevo (email delivery)

Supabase's built-in mailer only sends to team members and caps at about 2 emails an hour. Production needs custom SMTP.

1. Create a free [Brevo](https://www.brevo.com/) account.
2. Add and verify a sender. A domain you control (DKIM + DMARC DNS records) delivers reliably. A free Gmail or Outlook From address is rewritten by Brevo and often lands in spam.
3. Create an SMTP key and an API key in Brevo.

### 5. Supabase Auth SMTP and URLs

1. Authentication → SMTP: host `smtp-relay.brevo.com`, port `587`, Brevo SMTP login and key, sender name `CURT.ie Quiz`.
2. Authentication → Rate Limits: raise the email limit above 30/hour if the group is larger.
3. Authentication → URL configuration:
   - Site URL: `https://<your-user>.github.io/curt-ie-quiz/`
   - Redirect URLs: add the same URL (and `http://localhost:4200/` for local work).

### 6. Edge Functions

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), log in, and link the project. Then:

```bash
supabase secrets set \
  BREVO_API_KEY=... \
  BREVO_SENDER_EMAIL=quiz@yourdomain.ie \
  BREVO_SENDER_NAME="CURT.ie Quiz" \
  SITE_URL=https://<your-user>.github.io/curt-ie-quiz/

supabase functions deploy manage-players
supabase functions deploy send-weekly-invite
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.

### 7. Friday cron (Vault + SQL)

In the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

Then run [`supabase/migrations/20261118000001_weekly_invite_cron.sql`](supabase/migrations/20261118000001_weekly_invite_cron.sql).

### 8. Players

Use `/admin` → Players to add each person (name + email). That creates their Auth user so magic links work. Prefer this over the Table editor once the functions are deployed.

## Weekly workflow

On a normal week you do nothing. Friday at 11:00 Irish time the job publishes the new quiz and sends the invite.

Use `/admin` only when you want to step in:

- **Fetch this week's quiz now** publishes the latest Friday Pub Quiz without emailing anyone.
- **Load quiz** and **Publish as current quiz** override that with a specific JOE.ie link.
- **Send this week's invite now** resends the invite for the quiz that is already current. It does not fetch a new one.

Players open the site, enter their email, click the magic link, and play. Only the first score that week counts.

## Local development

```bash
npm install
SUPABASE_URL=https://<project>.supabase.co SUPABASE_ANON_KEY=<anon key> npm run configure
npm start
npm test
```

`npm run configure` rewrites `src/environments/environment.ts`. Do not commit real values. The deploy workflow generates them at build time.

Optional JSON extract (also available from the admin "Load quiz" button):

```bash
npm run extract -- "https://www.joe.ie/quiz/<this-week-url>" sample/week.json
```

## Supabase free plan notes

Free projects pause after about 7 days with too little database activity. A paused project can be resumed for up to a year. The keep-alive workflow prevents pausing.
