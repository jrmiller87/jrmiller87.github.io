# No Dice — Operations 2.0

Operations 2.0 extends the existing Personnel / Account dashboard without replacing Discord authentication or the established XP ledger.

## Features shipped

- Premium Operator Identity: existing rank emblem, rank path, level bar, avatar and unlocked cosmetic title/frame
- Eight level-gated cosmetics, claimable/equippable without spending XP
- Eight published missions, including daily, weekly and a shared crew objective
- Member-submitted mission evidence, subject to staff approval; submitting never grants XP
- Staff queue to approve/reject claims; approved claims award the configured XP exactly once
- Verified mission completion can award an associated achievement; hidden House Builder becomes visible only after it is earned
- Badge rarity: common, rare, epic, legendary
- Monthly and all-time leaderboard: lists **only** opt-in public operators with verified XP
- Crew objective meter: aggregated approved claims this month, currently 10 to complete
- Operator Chronicle: consecutive weeks with *verified XP*, not logins or idle activity
- Staff publisher for daily, weekly, one-time and special-event missions with an optional expiration
- Desktop and mobile styling

## Required staff activation

The Command Review panel is deliberately hidden until a trusted staff member has
`app_metadata.operations_admin = true` in Supabase Auth. **No account is automatically promoted.**

An authorized backend administrator can set this using Supabase Auth Admin API
(`auth.admin.updateUserById`) with a **server-side only** service-role or secret credential.
Never put an admin credential in GitHub Pages HTML/JS or in a client-facing repository.
The staff member signs out and back in to obtain a fresh signed access token.

Server RPCs verify this trusted signed claim; hiding a button is *not* the security boundary.

## Mission review

1. A signed-in operator chooses **Submit for Review** and optionally describes what they did.
2. The server stores a pending submission with a UTC day/week key.
3. A trusted staff member opens **Command Review**, confirms actual participation, and approves or rejects.
4. An approval, and only an approval, inserts a verified XP ledger event and any matching earned badge.
5. Once-only missions stay complete. Recurring missions can be approved again in a later period, with separate claim history.
6. Claims and rewards are not self-awarded; direct client table writes are denied.

## Cosmetic permissions

Unlock eligibility uses cumulative verified XP at 500 XP per level. A server-verified unlock
is permanent. A signed-in operator can equip a *previously unlocked* cosmetic using its
dedicated RPC. Cosmetic profile columns are not directly writable by browser users.

## Privacy

Leaderboards only show operators who enabled **Show my display name and avatar in public member listings**.
Private profiles are never returned by the leaderboard RPC. The leaderboard returns names,
derived levels and XP, but no IDs, emails, OAuth tokens or private metadata.

The House Builder secret badge has an RLS policy allowing only the operator who earned it to
read its definition; unequipped or unearned secret badges remain undisclosed.

## Admin and security notes

Supabase's advisor flags intentionally exposed `SECURITY DEFINER` RPCs because authenticated
users can invoke them. Each RPC explicitly validates authentication and scopes its operations;
staff RPCs additionally validate signed server-controlled `app_metadata`.
Keep auditing all such functions when adding features, and do not grant direct INSERT/UPDATE
on XP or achievement tables to ordinary members.

## Known integration boundaries

- Community participation is **manually verified by staff**, not inferred from Discord activity.
- Live Discord event attendance sync requires a separate securely hosted bot/integration and
  Discord permissions. Nothing in GitHub Pages can prove attendance by itself.
- Recurring missions use UTC day/week boundaries; they don't require a scheduled job.
- Admin assignment is a one-time security configuration step, not a public signup feature.
- A real Discord-authenticated browser smoke test is still recommended after deployment.

## Smoke test

1. Open `https://nodicegg.github.io/account.html` and sign in.
2. Confirm XP, rank, existing missions and badges are unchanged.
3. Claim a level-eligible cosmetic, equip it, and reload; check persistence.
4. Toggle monthly and all-time standings. Private profiles should be absent.
5. Submit a weekly mission; ensure it shows pending and XP does not change.
6. With a trusted staff account, approve the submission; verify new XP and badge.
7. Check responsive layout and status messages on a narrow screen.
