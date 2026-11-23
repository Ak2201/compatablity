# Couple Compatibility

Two people create one link, answer questions separately, and see their answers together once both have finished. A conversation tool, not a diagnosis or a prediction of success.

## Status

- Done: questionnaire UI (100 items), create-link and join flow, waiting screen, database schema with Row Level Security and join/create functions.
- Tested: the schema and RLS rules on a local Postgres (26 checks). Not yet run against a real Supabase project or in two browsers.
- Not yet: saving answers to the shared session, the reveal screen, psychology-based matching. The questionnaire currently saves to this device only.

## Stack

- **Database and auth:** Supabase (Postgres, anonymous sign-in, Row Level Security, Realtime).
- **Front end:** static HTML, CSS and ES modules in `public/`, no build step.

## One-time Supabase setup

1. Create a Supabase project.
2. **Authentication → Sign In / Providers → Allow anonymous sign-ins** (on).
3. Open **SQL Editor**, paste `supabase/migrations/0001_couples_init.sql`, and run it.
4. **Project Settings → API:** copy the Project URL and the `anon` public key into `public/js/config.js`.

Keep the `service_role` key out of the front end. The app never needs it.

## Test the database

Against a throwaway database (not production):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
```

The test needs the `anon` and `authenticated` roles and an `auth.uid()` function. Supabase provides both. For a plain local Postgres, add stand-ins first. Every check runs inside a transaction that is rolled back.

## Serve the app

Any static host works. For a quick local check:

```bash
python3 -m http.server 8000 --directory public
```

Then open `http://localhost:8000`.

## How the link works

- Person A enters a name and gets a link like `https://your-site/?join=ABCD2345`.
- Person B opens it, sees A's first name, enters their own name, and joins. The session moves to `both_joined`.
- A third person who opens the link sees "This session already has two people."
- Each person answers on their own device. The database only lets a person read the partner's answers after the session is `revealed`. That rule is enforced by Row Level Security, not by the UI.

## Before real use

The questions and matching rules are a draft. A psychologist or relationship expert should review them. The app must keep the disclaimer on screen.
