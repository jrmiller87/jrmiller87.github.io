# NO DICE // SUPABASE FOUNDATION

**Decision:** Keep the existing `https://nodicegg.github.io/` website on GitHub Pages. Use Supabase for authentication and database persistence. Discord remains the primary community hangout.

## Current state

- GitHub Pages is live and stays in place.
- Database schema is versioned in `supabase/migrations/20261120000000_initial_operations.sql`.
- The SQL file is **not** automatically deployed into a Supabase database.
- Discord OAuth, a Supabase project, bot hosting, and XP awarding **are not yet configured**.
- No member accounts, achievements, or XP have been created.
- The existing Character Nexus archive is untouched; migrating its content is a separate decision.

## 1. Create and connect a Supabase project

1. Open https://supabase.com/dashboard and create a project, for example **No Dice Operations**.
2. Connect the Supabase app in ChatGPT if you want direct help applying the schema, or open **SQL Editor** in the Supabase dashboard.
3. Apply the contents of `supabase/migrations/20261120000000_initial_operations.sql` once. Review before executing.
4. Confirm in Table Editor that the six `public` tables were created and that RLS is enabled.
5. Keep backups and review usage limits as the community grows.

## 2. Configure Discord login

1. Create an application in the Discord Developer Portal (for login; this does not need to be the eventual activity bot).
2. In Supabase: **Authentication → Sign In / Providers → Discord**, enable the provider and fill in the Discord OAuth client ID and client secret **inside Supabase**.
3. Add the **Supabase Auth callback URL displayed by that Discord provider configuration** to your Discord application's OAuth2 Redirects.
4. In **Supabase Authentication → URL Configuration**, use `https://nodicegg.github.io/` as Site URL and allow only the exact website callback / account URLs you implement.
5. Once the account page is built, use `signInWithOAuth({ provider: 'discord', options: { redirectTo: 'https://nodicegg.github.io/account.html' } })`.
6. Test Discord sign-in, sign-out, account creation, and redirect handling before adding login buttons site-wide.

Do not confuse the Discord Developer Portal *OAuth redirect* (points to Supabase Auth) with the Supabase *post-login redirect* (points back to GitHub Pages).

## 3. Browser access vs trusted server

Public browser configuration (once available):
- Supabase Project URL, for example `https://YOUR_PROJECT.supabase.co`
- Supabase **publishable** key (not secret)

Never commit or expose:
- Supabase **secret key** or legacy `service_role` key
- Discord client secret or bot token
- Database password
- Any server-side webhook signing secret

The publishable key is designed for browser use **only with appropriate RLS and grants**. The SQL foundation provides private-by-default profiles, self-editable profile display preferences, and read-only XP, badges, and mission records.

The browser **cannot award itself XP** or create mission completions. Those writes must be performed by a trusted Edge Function or Discord bot with server-side validation and rate limiting. Bot operations should verify the origin and authorize any awards, and deduplicate repeated events.

## 4. What the initial schema stores

| Table | Purpose |
| --- | --- |
| `operator_profiles` | Linked Supabase Auth users and their opt-in public profile preferences |
| `operations_missions` | Published mission descriptions and rewards |
| `operations_xp_events` | Append-only source records of XP awards |
| `operations_mission_completions` | Verified mission completions |
| `operations_badges` | Badge catalog |
| `operations_member_badges` | Badges earned by members |

There are no pretend stats, bots, or seeded accounts. Operator ranks and leaderboards will be derived from **trusted XP events** after testing security and the rank schedule.

## 5. Rollout order

1. **Database:** apply and verify the schema.
2. **Login:** implement a small Discord sign-in/account page using Supabase Auth.
3. **Profile:** display the signed-in member's own profile and personal XP history.
4. **Rewards:** add administrator-controlled missions and an award API, with abuse prevention.
5. **Discord bot:** record selected, verified actions, not every message.
6. **Leaderboards:** optional, opt-in visibility; keep moderation permissions independent from ranks.

The main No Dice site, The Lounge, Studio, Community, Gaming, Projects, and Character Nexus remain public and functional during rollout.

## Official references

- https://supabase.com/docs/guides/auth/social-sign-in/auth-discord
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/getting-started/api-keys
