# Session 2 — Digital Self Foundation

Builds structured digital identity (profile, preferences, goals, minimal memory, privacy, authority rules) on top of the Session 1 foundation. No new auth, no duplicate user identity, no AI behaviour.

## Documented ambiguity in the current foundation

Verified in the live schema: `digital_profiles` today has `owner_id` (nullable), no `status`, and its policies let **any org owner/admin insert, update, or delete any member's profile** in their organization. That directly conflicts with the Session 2 rule "owner control > admin convenience". This is documented here and changed deliberately, not silently:

- Personal profiles (`profile_type = 'person'`, `user_id` set) become controlled by that person only. Org owners/admins lose write access to them; they keep read access only when the person's privacy setting allows it.
- Organization/business profiles (`user_id` null, org-scoped) stay controlled by org owner/admin.
- `owner_id` is renamed to `user_id` to match the requested field naming; existing rows are preserved.

## Data model

Tables created (all org-scoped where applicable, timestamps + updated_at trigger, indexes on parent keys):

- `digital_preferences` — digital_profile_id, key, value, visibility (default `private`)
- `digital_goals` — digital_profile_id, title, description, priority (`low|medium|high|critical`), status (`draft|active|paused|achieved|abandoned`)
- `digital_memory_items` — digital_profile_id, memory_type, content, source, confidence (0–1), visibility (default `private`)
- `digital_authority_rules` — digital_profile_id, capability, allowed (default false), scope jsonb, optional agent_id

Table modified: `digital_profiles` — `owner_id` → `user_id`, add `status` (`active|inactive|archived`, default `active`), add `visibility` (default `private`), extend the type check to `person|organization|business`, and enforce that a `person` profile has a `user_id` while `organization`/`business` profiles do not.

Enums are Postgres enums so future values can be added without touching UI.

Capabilities allowed in the authority enum: `read_profile`, `read_preference`, `read_goal`, `read_memory`, `create_intent`, `request_capability`, `request_quote`, `request_action`. Financial/legal capabilities are intentionally absent from the enum, so they cannot be granted at all yet.

## Privacy and RLS model (deny by default)

A security-definer helper `can_read_digital_profile(profile_id)` centralises reads:

- self (`user_id = auth.uid()`) → allowed
- profile `visibility = 'public'` → readable by any authenticated user in the same org
- `visibility = 'shared'` → readable by same-org members
- `visibility = 'private'` → owner only (org profiles: org owner/admin)
- org/business profile → org owner/admin full control, org members read

Child rows (preferences, goals, memory, authority) follow the parent: writes only by whoever controls the parent profile; reads require parent read access **and** the child row's own `visibility` (private child rows are owner-only even when the profile is shared). Memory therefore stays private by default and is never exposed wholesale.

GRANTs: `authenticated` + `service_role` only, no `anon`. RLS enabled on every new table.

## Auditability

Reuses the existing `agent_activity_logs` architecture rather than a new audit system: triggers on the four new tables plus `digital_profiles` write a row capturing actor (`auth.uid()`), event (`digital_profile.updated`, `digital_goal.created`, …), target id and table, and a payload of changed keys. No duplicate audit table.

## UI

New route group `/_authenticated/digital-self` ("My Digital Self") added to the sidebar, with six sections: Profile, Preferences, Goals, Memory, Privacy, Authority. Presented as a control-center layout — an identity header showing owner, profile type, status and visibility, plus an "who can access" panel derived from the actual policy rules; each preference/memory row shows its visibility badge and an inline visibility switch. Not a social profile layout.

Data access goes through a new `src/lib/digital-self.functions.ts` (createServerFn + `requireSupabaseAuth`), following the existing `organizations.functions.ts` pattern; TanStack Query with route loaders, error and not-found components via the existing `route-error.tsx`.

## Demo data

Seeded in the migration for the existing OWNER A test account: a `person` Digital Self "Owner A" with preferences (communication_style = simple, preferred_language = Indonesian), goal "Grow logistics business" (high), one memory item "Prefers concise operational information", all `private`, plus default authority rules with read capabilities allowed and action capabilities off.

## Verification

- Security: scripted authenticated requests with the existing four real test tokens — self allowed; other user denied; cross-org denied; member unauthorized denied; **org admin denied on another member's personal Digital Self**; org owner allowed on the organization Digital Self; anon denied on all four new tables; child-row visibility respected.
- Regression: re-run the Session 1 checks (auth, organizations, members, agents, tenant isolation, role escalation denial) plus a UI pass over `/dashboard`, `/organizations`, `/members`, `/agents`.
- Typecheck and production build.

Output report with the 15 requested sections at the end. Stops after Session 2.
