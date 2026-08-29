# LOGOS — Session 1: Core Foundation

Scope is foundation only: auth, organizations, multi-tenant security, and an app shell with placeholders. No Agent Network features, no dashboards beyond placeholders.

Note: the blueprint/schema documents were not attached to this project, so the schema below is derived from the table list and rules in the session brief. If the V1 documents differ, upload them and I will reconcile before building.

## 1. Backend foundation (Lovable Cloud)

Enable Lovable Cloud (Postgres + auth) and ship one migration containing:

- `users` → handled by built-in auth users, plus `profiles` (id → auth user, full_name, avatar_url, timestamps)
- `organizations` (id, name, slug unique, created_by, timestamps)
- `app_role` enum: `owner`, `admin`, `member` (extensible)
- `organization_members` (id, org_id, user_id, role, unique(org_id,user_id), timestamps)
- `digital_profiles` (id, org_id, owner user, display_name, type, metadata jsonb, timestamps)
- `agents` (id, org_id, name, kind, status, config jsonb, timestamps) — table only, no agent logic
- `agent_permissions` (id, agent_id, org_id, permission key, allowed bool, timestamps)
- `agent_activity_logs` (id, agent_id, org_id, actor user, event, payload jsonb, created_at)

All UUID primary keys, FKs with `on delete cascade`, `created_at`/`updated_at` with an `updated_at` trigger, and indexes on every FK plus `organizations.slug` and `agent_activity_logs(org_id, created_at desc)`.

## 2. Multi-tenant security (deny by default)

- RLS enabled on every table; no policy is written that allows cross-org access.
- Security-definer helpers: `is_org_member(org uuid)`, `has_org_role(org uuid, role app_role)` — avoids recursive policy evaluation on `organization_members`.
- Every org-scoped table: SELECT/INSERT/UPDATE/DELETE limited to `is_org_member(org_id)`; destructive and admin operations require `has_org_role(org_id, 'admin'|'owner')`.
- Roles live only in `organization_members` (never on profile) so they cannot be escalated client-side.
- Explicit `GRANT`s for `authenticated` and `service_role`; no `anon` grants.
- Creating an organization goes through a server-side transaction that inserts the org and its `owner` membership together, so no client can name itself owner of another org.

## 3. Authentication

Real email/password auth: sign up, log in, log out, persisted session, session listener that keeps the UI in sync. Protected routes live under an authenticated layout; the sign-in affordance reflects session state and offers sign-out. Profile row auto-created on signup via trigger.

Question answered by the brief: profile data is needed (`digital_profiles`, user names), so a `profiles` table is included.

## 4. Application shell

- Public landing at `/` with product framing and sign-in CTA
- `/auth` — sign up / log in
- Authenticated layout: sidebar navigation, top bar, user menu, organization selector (switches active org, persisted)
- `/dashboard` — placeholder with org summary cards
- `/organizations` — list own orgs, create org, members list with roles
- `/agents` — "Agent Network" placeholder page only

## 5. Design

Clean, premium, professional, responsive. Semantic design tokens in `src/styles.css` (no hardcoded colors), restrained typography, minimal motion, no gradient/AI gimmicks.

## 6. Verification before finishing

Migration applies cleanly; relationships and indexes checked; RLS confirmed enabled on all tables; auth flow exercised end to end in the preview; cross-org isolation checked with a second account/org; security scan run; no duplicate tables.

## 7. Report

Closing report covers: files created/modified, tables, migrations, RLS policies, auth, organization model, role model, security check, test results, known issues, and the recommended Session 2 scope. Work stops at Session 1.

## Technical notes

TanStack Start with file routes; data access through `createServerFn` (authenticated middleware for user-scoped reads), TanStack Query for caching, no edge functions. Client-side role checks are display-only; enforcement is in RLS plus server functions.
