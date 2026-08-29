# LOGOS — Session 1 Audit Report + Required Fixes

Read-only audit. No feature expansion, no Session 2 work.

## 1. Database

- 7 tables, no duplicates, no unnecessary tables: `profiles`, `organizations`, `organization_members`, `digital_profiles`, `agents`, `agent_permissions`, `agent_activity_logs`.
- Every table has a UUID primary key with `gen_random_uuid()` default; all timestamps present (`created_at`, plus `updated_at` + trigger on all mutable tables).
- Foreign keys all valid and complete: org-scoped tables cascade from `organizations`; user references cascade from accounts; `digital_profiles.owner_id` and `agent_activity_logs.actor_id` are `ON DELETE SET NULL` (deliberate, so history survives account deletion).
- Uniqueness: `organizations.slug`, `(organization_id, user_id)` on members, `(agent_id, permission_key)` on permissions.
- Indexes present on every foreign key plus a composite `(organization_id, created_at DESC)` on the activity log.
- Missing/broken relationships: none. No table pair models the same concept twice.
- Gap: zero CHECK constraints. `agents.kind`, `agents.status`, `digital_profiles.profile_type`, `organizations.slug` accept arbitrary text; slug shape is validated only in application code and the RPC.

## 2. Authentication

- Real database-backed auth. Signup, login, session persistence and logout were exercised in a live browser; sessions survive reload; logout cancels queries, clears the cache and replaces history.
- Signup requires email confirmation (unconfirmed accounts cannot log in) — confirmed by test.
- Unauthorized access: `/dashboard`, `/organizations`, `/members`, `/agents` redirect to `/auth` without a session, and every server function is behind `requireSupabaseAuth`. Route guards are UX only; the real boundary is the server middleware plus RLS. Not fake, not client-only.

## 3. Multi-tenancy

Verified with two accounts and two organizations: as a signed-in member of Org A, direct database calls against Org B returned 0 rows on read, 0 rows on update, and insert was rejected by row-level policy. Org B never appeared in the UI. Isolation holds.

Not yet exercised live: ADMIN and MEMBER behaviour (this environment can only mint a session for a single account), so role-by-role runtime confirmation is outstanding.

## 4. RLS

- RLS enabled on all 7 tables; every policy is scoped `TO authenticated`; `organizations` has no INSERT policy (creation only through the server-side function); the activity log has no UPDATE/DELETE policy (append-only).
- `USING (true)` appears once: `profiles` SELECT. Any signed-in user can read every user's name and avatar — cross-tenant user enumeration.
- `WITH CHECK (true)`: none.
- Weak checks found: member-role UPDATE does not restrict the *new* role value; `agent_permissions` and `agent_activity_logs` do not verify that the referenced agent belongs to the claimed organization.

## 5. Roles

`owner`, `admin`, `member` in an extensible enum, stored in `organization_members` (never on profiles). Differences today: only owners can delete the organization or remove/modify owner rows; owners and admins manage members, agents and permissions; members are read-only on agents/permissions but can write digital profiles and append activity. Admin and owner are otherwise identical, and admin can escalate to owner (see red flags).

## 6. Data integrity

Zero orphan members, zero members without a profile, zero organizations without an owner, zero orphan agents, zero organization mismatches between agents and their permissions/logs, no duplicate identities. Test data from verification was removed; two test accounts remain in the account store (accounts cannot be deleted from here).

## 7. Architecture readiness

The path to Digital Self → Agent → Capability → Trust → Intent → Delegation needs no foundation rewrite: `digital_profiles` becomes Digital Self, `agents` already carries an extensible `config`, `agent_permissions` generalises to Capability, and `agent_activity_logs` is an append-only audit spine. Trust/Intent/Delegation arrive as new org-scoped tables reusing the same membership helper functions. Server-function + RLS layering is the right shape for delegation checks.

## 8. Red team results

Reachable as an ordinary signed-in user today:
- Read another tenant's data — blocked (verified).
- Modify another tenant's data — blocked (verified).
- Forge `organization_id` on insert — blocked (verified).
- Read every user's profile row across tenants — POSSIBLE.
- Admin promoting themselves or others to owner — POSSIBLE.
- Attaching permission/log rows to an agent that belongs to another organization (guessed id) — POSSIBLE.
- Any member editing another member's digital profile — POSSIBLE.
- Writing activity log entries with no actor — POSSIBLE.

## 9. UI

Responsive (fixed sidebar at large widths, drawer with labelled toggle below), navigation and organization selector work, empty states present on organizations/members/dashboard, loading states present. Gaps: no per-route error boundary (only the root), no error UI when the members or dashboard queries fail, and dashboard counters can show stale zeros immediately after the first organization is created.

## 10. Scores

| Area | Score |
| --- | --- |
| Architecture | 88 |
| Database | 86 |
| Security | 74 |
| RLS | 76 |
| Authentication | 92 |
| Multi-tenancy | 84 |
| Scalability | 85 |
| Maintainability | 88 |
| UI | 82 |

## 11. Red flags

CRITICAL — none.

HIGH
1. Privilege escalation: an admin can set a member row's role to `owner` (including their own).
2. The anonymous role holds full table privileges on all 7 tables; only the `TO authenticated` policies stop it — one layer, no defence in depth.

MEDIUM
3. `profiles` is world-readable to any signed-in user (cross-tenant enumeration).
4. No database-level guarantee that `agent_permissions.organization_id` / `agent_activity_logs.organization_id` matches the agent's organization.
5. Members can update or insert any digital profile in the organization, including other people's.
6. `agent_activity_logs.actor_id` may be NULL, allowing unattributable entries.
7. Role behaviour for admin and member never exercised at runtime.

LOW
8. No CHECK constraints on status/kind/type/slug.
9. No per-route error boundaries; missing query-error UI.
10. Stale dashboard counters right after first organization creation.
11. Three accepted security-definer linter warnings (documented in security memory).

## 12. Verdict

**PASS WITH FIXES** — stopping here, not proceeding to Session 2.

### Mandatory fix list (Session 1.1)

Database migration:
1. Rewrite the member UPDATE policy so the resulting role can only be `owner` when the actor is an owner, and keep admins from touching owner rows.
2. Revoke `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` on all 7 tables from the anonymous role.
3. Replace `profiles` world-read with a policy limited to your own row plus users who share an organization with you (helper function).
4. Add a unique key `(id, organization_id)` on `agents` and switch `agent_permissions` / `agent_activity_logs` to a composite foreign key on `(agent_id, organization_id)`, so a row can never point at another tenant's agent.
5. Restrict digital-profile UPDATE to the profile owner or an org owner/admin; require `owner_id = auth.uid()` on member inserts.
6. Make `agent_activity_logs.actor_id` default to `auth.uid()` and require it to equal `auth.uid()` for user-originated inserts.
7. Add CHECK constraints for `agents.status`, `agents.kind`, `digital_profiles.profile_type`, and a slug format/length check on `organizations`; validate the slug inside `create_organization` too.

Application:
8. Add `errorComponent` to each authenticated route and visible error states for the members and dashboard queries.
9. Invalidate the organization-overview query after organization creation so counters are never stale.

Verification after fixes:
10. Re-run the cross-tenant probe, plus explicit admin-escalation and member-write attempts, and re-run the database linter.

Once these pass, the recommended next step is **SESSION 2 — DIGITAL SELF**.
