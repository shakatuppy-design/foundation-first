# Session 1.2 — Final Behavioral Security Verification

Verification only. No new features, no schema/RLS/architecture changes unless a real bug is found (then: stop and report).

## Current environment findings

- The database currently has 2 auth accounts but zero organizations and zero members, so all prior test tenants are gone. Every behavioral test needs fresh test data.
- Preview session injection is `signed_out`, and with 2 existing accounts a targeted session mint needs an approval prompt.

## Approach: real sign-ups instead of impersonation

Rather than depending on impersonation, the tests drive the actual app in a headless browser and sign up genuine test accounts through `/auth`:

- `logos-test-a+<timestamp>@example.com` → creates Organization A
- `logos-test-b+<timestamp>@example.com` → creates Organization B
- `logos-test-admin+<timestamp>@example.com` → added to Organization A as ADMIN by the owner
- `logos-test-member+<timestamp>@example.com` → added to Organization A as MEMBER by the owner

Each session's own access token is then used to issue authenticated requests against the backend API, so every assertion runs through the real auth + RLS path (no service-role shortcuts, no client-side-only checks).

If email confirmation blocks sign-in, the test is marked BLOCKED — ENVIRONMENT LIMITATION and a manual procedure is provided instead of assuming a pass.

## Test matrix to execute

1. Role behavior
   - OWNER: create organization, add/update/remove members, create/update/delete agents, set agent permissions.
   - ADMIN: allowed admin actions succeed; assigning or creating `owner` role must be denied; ownership takeover must be denied.
   - MEMBER: reads succeed; member management, agent writes, permission writes must all be denied.
2. Tenant isolation (User A vs Organization B): SELECT, INSERT, UPDATE, DELETE on organizations, organization_members, agents, agent_permissions, agent_activity_logs, digital_profiles — all must return no rows or be rejected.
3. Agent ownership: Org A's agent invisible/unwritable to User B; cross-tenant references from Org B rejected by the composite foreign keys.
4. Digital profiles: owner can read/write own; org owner/admin allowed where policy permits; outsiders denied.
5. Activity logs: forged `actor_id` rejected, log on behalf of another user rejected, cross-tenant log rejected, default attribution equals the signed-in user.
6. Anonymous access: unauthenticated requests against all seven protected tables must be denied (grants were revoked for anon).
7. UI sanity pass while signed in: navigation, organization selector, loading/empty/error states, mobile and desktop widths, with screenshots as evidence.

## Reporting

Final report includes:

- Table of TEST / EXPECTED / ACTUAL / STATUS / EVIDENCE for every case above.
- SECURITY SCORE /100.
- REMAINING RISKS.
- SESSION 2 READINESS: READY or NOT READY.
- Verdict: PASS, PASS WITH BLOCKED TESTS, or FAIL. PASS only if behavioral security is actually verified end to end.

## Technical notes

- Playwright scripts and screenshots live under `/tmp/browser/session12/`; no project files are modified.
- Test accounts and their organizations remain in the database as evidence unless you prefer them cleaned up afterwards.
- Any real bug discovered halts the session with a report rather than a silent fix.
