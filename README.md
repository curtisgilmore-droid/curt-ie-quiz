# CURT.ie Quiz

A small Angular app for running the weekly JOE.ie Friday Pub Quiz with a group. Players pick their name, answer the questions with instant feedback, and the score is saved to Supabase. Weekly and all-time leaderboards are built in.

It is an unofficial companion to [JOE.ie](https://www.joe.ie/quiz). Questions belong to JOE.ie, and every quiz links back to the original.

## How it works

- **Frontend:** Angular (standalone components, signals), hosted on GitHub Pages.
- **Storage:** Supabase Postgres. The browser only holds the project URL and the public anon key. Row-level security stops anyone writing scores directly, so the only way in is the `submit_score` function, which checks the player, the current quiz, and that the score is in range. One score per player per week, first submission wins.
- **Admin:** `/admin` signs in a single Supabase Auth user (listed in the `admins` table) and publishes the weekly quiz from pasted JSON.
- **Keep-alive:** a daily GitHub Actions job queries Supabase so the free project never pauses for inactivity.

## One-time setup

1. **GitHub repo.** Create an empty public repo named `curt-ie-quiz`, then from this folder:

   ```bash
   git init -b main
   git add .
   git commit -m "CURT.ie Quiz"
   git remote add origin git@github.com:<your-user>/curt-ie-quiz.git
   git push -u origin main
   ```

2. **Supabase project.** Create a free project, open the SQL editor, and run
   [`supabase/migrations/20261113000000_init.sql`](supabase/migrations/20261113000000_init.sql).
3. **Players.** Add each person's name in the Table editor under `players`.
4. **Admin user.** In Authentication, add a user with an email and password and turn off new sign-ups. Then run, with your email:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

5. **Turn on GitHub Pages (Actions source).**
   1. Open your repo on github.com and click **Settings** in the top bar, under the repo name (not your account settings).
   2. In the left sidebar, under **Code and automation**, click **Pages**.
   3. Under **Build and deployment**, open the **Source** dropdown and choose **GitHub Actions**. The page saves automatically, and there is no Save button.
   4. Do not pick a branch. The "Deploy from a branch" option is not used here.

   The free plan only publishes Pages from a **public** repo. If the Pages page says it needs a public repo, check **Settings**, then **General**, then **Danger Zone**, then **Change visibility**.

6. **Add the Supabase settings as Actions variables.**
   1. In the repo, go to **Settings**, then **Secrets and variables**, then **Actions**.
   2. Click the **Variables** tab (not **Secrets**), then **New repository variable**.
   3. Add `SUPABASE_URL` with your project URL (Settings, then API, "Project URL").
   4. Add `SUPABASE_ANON_KEY` with the anon or publishable key from the same API page.
   5. Never add the `service_role` key anywhere.

7. **Run the deploy.** Pushing to `main` starts the **Deploy to GitHub Pages** workflow automatically. To check it, open the **Actions** tab and wait for a green tick. If the run was started before steps 5 and 6, click it, then **Re-run all jobs**.

   When it finishes, the site is at `https://<your-user>.github.io/curt-ie-quiz/`. The link also appears on the Pages settings page and on the workflow run page.

## Weekly workflow

1. Open `/admin` and sign in.
2. Paste the JOE.ie quiz link, for example `https://www.joe.ie/quiz/the-joe-friday-pub-quiz-week-529-889400`, and click **Load quiz**. The app reads the questions, options, correct answers, rounds and images, then shows a preview.
3. Click **Publish as current quiz**, then send the Pages link to the Teams chat.

The same extraction is available from the command line if you want a JSON file. `sample/` is git-ignored so it stays out of the public repo:

```bash
npm run extract -- "https://www.joe.ie/quiz/<this-week-url>" sample/week.json
```

Quiz JSON shape (`round` and `imageUrl` are optional):

```json
{
  "weekId": "529",
  "title": "The JOE Friday Pub Quiz: week 529",
  "sourceUrl": "https://www.joe.ie/quiz/the-joe-friday-pub-quiz-week-529-889400",
  "questions": [
    {
      "round": "ROUND 1: General Knowledge",
      "text": "How many different colours are recognised as making up a rainbow?",
      "options": ["Nine", "Seven", "Eight"],
      "correctIndex": 1,
      "imageUrl": "https://assets.joe.ie/uploads/2026/11/1.webp"
    }
  ]
}
```

Publishing a quiz with an existing `weekId` updates it and makes it current again. Past scores are kept.

## Local development

```bash
npm install
SUPABASE_URL=https://<project>.supabase.co SUPABASE_ANON_KEY=<anon key> npm run configure
npm start
npm test
```

`npm run configure` rewrites `src/environments/environment.ts`. Do not commit real values there. The committed file holds empty placeholders, and the deploy workflow generates the real one at build time.

## Supabase free plan notes

Free projects are paused after about 7 days with too little database activity, and a paused project can be resumed from the dashboard for up to a year. The keep-alive workflow prevents this.
