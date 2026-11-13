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

5. **GitHub settings.**
   - Settings, Pages, Build and deployment, Source: **GitHub Actions**.
   - Settings, Secrets and variables, Actions, Variables: add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the anon or publishable key from Settings, API). Never add the service role key.
6. Re-run the **Deploy to GitHub Pages** workflow. The site is at `https://<your-user>.github.io/curt-ie-quiz/`.

## Weekly workflow

1. Extract the quiz from JOE.ie (it reads the quiz embed, including the answer key and images):

   ```bash
   npm run extract -- "https://www.joe.ie/quiz/<this-week-url>" sample/week.json
   ```

   The `sample/` folder is git-ignored so the questions stay out of the public repo.

2. Open `/admin`, sign in, paste the contents of `sample/week.json`, check the preview, and publish.
3. Send the Pages link to the Teams chat.

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
