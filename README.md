# hanilfuji-golf-app

HANIL-FUJI golf club mobile web app.

## Current stack

- Static HTML app
- Planned deployment: Vercel
- Planned database/auth: Supabase
- Supabase MCP connected
- Supabase CLI initialized locally

## Entry file

- `index.html`

## Backend status

- Vercel project created: `hanilfuji-golf-app`
- Supabase project created: `nruqzbxiioxvomjlxfon`
- Applied schema migrations:
  - `supabase/migrations/20260818073938_initial_club_schema.sql`
  - `supabase/migrations/20260818075127_signup_request_approval_flow.sql`
  - `supabase/migrations/20260818075701_seed_master_admin.sql`
- Environment template added:
  - `.env.example`

## Database scope

The current schema now includes:

- employee/member profiles
- member settings
- club notices
- club events
- attendance + meal responses
- event grouping
- event scorecards and points
- yearly membership fee status
- public signup requests with admin approval flow
- RLS policies and safe read views
- seeded master admin phone: `01035504581`

## Immediate next step

Main pending app work is moving the remaining `localStorage` flows onto Supabase Auth + database-backed screens.

If you want to reconnect the CLI later:

```bash
supabase login
supabase link --project-ref nruqzbxiioxvomjlxfon
supabase db push
```
