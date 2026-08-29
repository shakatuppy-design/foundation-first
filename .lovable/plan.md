# Session 2 — Digital Self Foundation (revised)

Digital Self is the structured identity and control layer of a human or organization. It is not an agent, not a chatbot, and it never executes anything. Layering stays strict:

```text
USER / ORGANIZATION
        v
DIGITAL SELF        (identity + control)
        v
AUTHORITY           (explicit permission granted by the owner)
        v
AGENT               (existing agents table, separate entity)
        v
ACTION              (not built in this session)
```

No autonomous execution, no agent runtime, no merging of Digital Self and Agent.

## Documented ambiguity in the current foundation

Verified in the live schema: `digital_profiles` today has a nullable `owner_id`, no `status`, and policies that let **any org owner/admin insert, update or delete any member's profile**. That conflicts with the Session 2 ownership rule, so it is changed deliberately:

- Personal Digital Self (`profile_type = 'person'`, `user_id` set) is controlled by that person only. Org owners/admins lose all write/delete access to it and get read access only when the person's visibility setting allows it.
- Organization/business Digital Self (`user_id` null) is controlled by org owner/admin.
- `owner_id` is renamed to `user_id`; existing rows preserved.
- Org membership alone never grants access to private Digital Self data.

## 1. Final tables

New (4 tables only, all child-of-profile, timestamps + `set_updated_at` trigger, indexes on parent keys):

- `digital_preferences` — digital_profile_id, key, value, visibility (default `private`)
- `digital_goals` — digital_profile_id, title, description, priority (`low|medium|high|critical`), status (`draft|active|paused|achieved|abandoned`)
- `digital_memory_items` — digital_profile_id, memory_type, content, source, confidence (0–1), visibility (default `private`)
- `digital_authority_rules` — digital_profile_id, organization_id, capability, allowed (default false), scope jsonb, optional agent_id, `expires_at` (nullable), `status` (`active|revoked|expired`, default `active`), granted_by

Modified: `digital_profiles` — `owner_id` → `user_id`, add `status` (`active|inactive|archived`), add `visibility` (`private|shared|public`, default `private`), profile_type check extended to `person|organization|business`, and a constraint that a `person` profile has `user_id` while `organization`/`business` do not.

Reused, unchanged: `auth.users`, `profiles`, `organizations`, `organization_members`, `agents`, `agent_activity_logs`. No new audit table, no agent registry table, no capability network table.

Enums are Postgres enums so values can be added later without UI changes.

## 2. Ownership model

- Personal Digital Self: the referenced user is the single controller — only they may update, delete, or grant authority. Admins cannot write or delete it.
- Organization/business Digital Self: controlled by org owner/admin; members read only within visibility rules.
- Ownership is never transferable through an authority rule, an agent link, or an org role. `user_id` / org control are the only ownership sources.

## 3. Permission model (RLS, deny by default)

Security-definer helpers centralise the rules:

- `can_read_digital_profile(profile_id)` — self, or `public`/`shared` to same-org members, or org owner/admin for org profiles; `private` is owner-only.
- `controls_digital_profile(profile_id)` — person profile: `user_id = auth.uid()` only. Org profile: `has_org_role(org, owner|admin)`.

Child rows follow the parent: writes require `controls_digital_profile`; reads require parent read access **and** the child row's own visibility. GRANTs to `authenticated` + `service_role` only, never `anon`. RLS enabled on all new tables.

## 4. Authority model

An authority rule is a permission granted **by the Digital Self owner**, nothing more:

- Only `controls_digital_profile(digital_profile_id)` may insert, update, or revoke a rule.
- `agent_id` means "this specific agent may exercise this capability", never ownership. Nullable agent_id = the capability is defined but not delegated to any agent.
- An agent has authority only when an explicit `allowed = true`, `status = 'active'`, non-expired rule exists. A trigger flips a rule to `expired` on read/update once `expires_at` passes; nothing is granted implicitly.
- Revocation is a status change, keeping history auditable.
- No execution path is built: no runtime that consumes these rules, no agent-to-agent calls.

Capability enum (exactly these, nothing more): `read_profile`, `read_preference`, `read_goal`, `read_memory`, `create_intent`, `request_capability`, `request_quote`, `request_action`. Payment, money transfer, purchase, debt, financial commitment and legal contract are absent from the enum, so they cannot be granted at all.

## 5. Privacy model

`private` (default), `shared`, `public`. Private stays private: a memory item or preference marked `private` remains owner-only even when the parent Digital Self is `shared` or `public`. Memory is never exposed wholesale; `read_memory` authority still respects per-row visibility.

## 6. Auditability

Reuses `agent_activity_logs`. Triggers on `digital_profiles` and the four new tables log actor (`auth.uid()`), event name (`digital_profile.updated`, `digital_goal.created`, `digital_authority.granted`, `digital_authority.revoked`, …), target id/table, and payload. Every authority change records: who granted, what capability, to which agent, for which Digital Self, when, scope, expiration, and resulting status.

## 7. UI changes

New route group `/_authenticated/digital-self` ("My Digital Self") in the sidebar, six sections: Profile, Preferences, Goals, Memory, Privacy, Authority. Control-center layout — identity header (owner, type, status, visibility) and a "who can access this" panel derived from the real policy rules. Preference/memory rows show a visibility badge with an inline switch.

Authority section is framed as **"Who can act on my behalf?"**, not generic app permissions: a table of Agent · Capability · Scope · Allowed/Denied · Expiration · Status, with explicit grant and revoke actions, an empty state stating that no agent can act on your behalf, and copy clarifying that granting authority never transfers ownership.

Data access via a new `src/lib/digital-self.functions.ts` (`createServerFn` + `requireSupabaseAuth`), following `organizations.functions.ts`; TanStack Query with route loaders, errors via existing `route-error.tsx`.

## 8. Migration changes

One migration: rename `owner_id`, add profile columns/constraints, create the enums, create the four tables with GRANTs → RLS → policies in that order, create the two helper functions, rewrite `digital_profiles` policies to the new ownership model, add audit triggers, and seed demo data.

## 9. Demo

Seeded for the existing OWNER A test account: a `person` Digital Self "Owner A" with preferences (communication_style = simple, preferred_language = Indonesian), goal "Grow logistics business" (high), memory item "Prefers concise operational information" — all `private` — plus default authority rules where read capabilities exist and every action capability is denied, with no agent attached.

## 10. Future compatibility

Shape stays open to Agent Registry, Capability Network, Trust/Proof, Intent, Delegation and agent-to-agent communication (capability enum, jsonb scope, agent link, status/expiry lifecycle) — none of them are implemented now.

## 11. Verification

- Security: authenticated requests with the four real test tokens — self allowed; other user denied; cross-org denied; member denied; **org admin denied write/delete on another member's personal Digital Self**; org owner allowed on the organization Digital Self; anon denied on all four tables; private child rows hidden under a shared parent; non-owner cannot grant or revoke authority.
- Regression: re-run Session 1 checks (auth, organizations, members, agents, tenant isolation, role escalation denial) plus a UI pass over `/dashboard`, `/organizations`, `/members`, `/agents`.
- Typecheck and production build.

Report with the 15 requested sections at the end. Stops after Session 2 — no Session 3.
