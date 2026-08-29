# Session 3B — Intent & Discovery Foundation (Plan)

Scope: intents + a controlled discovery surface. No chat, no agent-to-agent messaging, no matching, no execution. Sessions 1/2/3A security stays untouched.

## 1. Existing schema relevant to discovery

- `agents` — id, organization_id, name, kind (personal/organization/service/specialized), status (active/suspended/revoked/archived + legacy inactive), description, config, created_by, timestamps. RLS: same-org members read; owner/admin write. Audit trigger writes to `agent_activity_logs`.
- `digital_profiles` — organization_id, user_id, display_name, profile_type (person/organization/business), status, visibility (private/shared/public). Control via `controls_digital_profile()`, read via `can_read_digital_profile()`.
- Digital Self children: `digital_preferences`, `digital_goals`, `digital_memory_items` (per-row visibility where applicable).
- `digital_authority_rules` — the only delegation link (digital_profile_id + optional agent_id + capability). Untouched.
- `agent_activity_logs` — single audit sink; insert-only, actor forced to `auth.uid()`.

## 2. Proposed tables (minimum correct model)

Two new tables only.

1. `digital_intents` — id, digital_profile_id (FK), title, description, intent_type (enum `digital_intent_type`: general, discovery, procurement, logistics, service, research), status (enum `digital_intent_status`: draft, active, paused, fulfilled, cancelled, expired; default draft), priority (reuse existing `digital_goal_priority`? No — new `digital_intent_priority`: low/medium/high/critical to stay independent), `discovery_requirement jsonb` default `{}` (e.g. `{"category":"logistics"}` — descriptive only, no matching), timestamps.
2. `agent_discovery_profiles` — id, agent_id (unique FK, one discovery profile per agent), organization_id (composite FK `(agent_id, organization_id)` → agents, preserving tenant consistency), `discovery_id text UNIQUE` (generated, non-sequential), display_name (pseudonym), description, `categories text[]`, `capabilities text[]` (free-form high-level tags — deliberately NOT the authority enum), visibility (enum `discovery_visibility`: private/unlisted/public, default private), status (enum `discovery_status`: draft/listed/delisted, default draft), timestamps.

No new permission table, no discovery↔digital_profile ownership link, no duplicate audit table.

## 3. Ownership model

- Intent belongs to a Digital Self; write/read control uses existing `controls_digital_profile()` only. Personal intents: only that person. Organization/business: org owner/admin. No admin access to personal intents.
- Discovery profile belongs to an Agent, so it follows agent write rules: org owner/admin of the agent's organization. `created_by`-style creator does not grant authority.

## 4. Discovery identity model

`discovery_id` format `lg_<26 chars base32 of gen_random_bytes(16)>` produced by a `SECURITY DEFINER`-free SQL default helper `public.generate_discovery_id()`. Random, globally unique (UNIQUE constraint + retry-free 128-bit entropy), non-sequential, unrelated to email/phone/auth user id. Documented as an experimental identity primitive, not a phone-number replacement.

## 5. Privacy model

- Discovery exposes only: discovery_id, display_name, agent kind, categories, capabilities, visibility, status. Never human name, email, phone, memory, goals, preferences, authority rules, or org-private data.
- private: not discoverable at all. unlisted: only returned on exact `discovery_id` match. public: returned by search, and only when the agent's status is `active`.
- Discovery visibility is independent of Digital Self visibility; nothing in the discovery path reads Digital Self tables.

## 6. RLS model (deny-by-default, no anon grants)

`digital_intents`: GRANT to authenticated + service_role only; all four commands via `controls_digital_profile(digital_profile_id)`.

`agent_discovery_profiles`: GRANT to authenticated + service_role only.
- SELECT: org members of the agent's org (management view) OR `visibility = 'public' AND agent is active` (cross-tenant discovery of safe fields only, still authenticated).
- INSERT/UPDATE/DELETE: `has_org_role(organization_id, ARRAY['owner','admin'])`.
- Unlisted lookups go through a `SECURITY DEFINER` function `public.lookup_discovery(_discovery_id text)` returning only safe columns for public+unlisted active agents — execute granted to `authenticated` only. Enumeration is impractical because the identifier is 128-bit random and the function requires an exact match.
- Anonymous: no grants, no policies. Discovery stays authenticated-only, matching the existing model.

## 7. Intent model

Intents are declarative records with an optional descriptive `discovery_requirement`. No automatic linkage to agents, no matching, no jobs.

## 8. Authority boundary

Discovery rows carry no capability grants. `agent_has_authority()` remains the only authority check and reads `digital_authority_rules` only. Nothing in this session inserts, infers, or widens authority. Discovered ≠ authorized.

## 9. UI changes

- `/digital-self` gains a **My Intents** section: list + create (title, description, type, priority, status), edit, cancel/delete — scoped to the selected Digital Self.
- `/agents/$agentId` gains a **Discovery** section: Discovery ID with copy button, display name, agent kind, categories, capabilities, visibility selector, status; edit discovery profile dialog; create-if-absent for owner/admin.
- New `/discovery` route: basic search by discovery identifier, display name, category, or capability, returning discovery-safe fields only, with an explicit "discovery does not grant authority" note.
No chat UI, no messaging.

## 10. Migration strategy

Single additive migration: enums → tables → GRANTs (authenticated, service_role; REVOKE from anon/PUBLIC) → ENABLE RLS → policies → indexes (discovery_id unique, categories/capabilities GIN, intent profile+status) → `set_updated_at` triggers → audit triggers emitting `intent.created`, `intent.updated`, `intent.cancelled`, `discovery.updated`, `discovery.visibility_changed` into `agent_activity_logs`. No changes to existing tables, policies, or functions. No data deleted; discovery records are never auto-removed on status change.

## 11. Behavioral tests

Live SQL under real tokens for Owner A, Admin A, Member A, Owner B, anonymous:
intent CRUD by controller only; admin denied on personal intent; org intent by owner/admin; cross-tenant intent denied; private discovery invisible; unlisted only via exact identifier; public search returns safe fields only; suspended/revoked/archived agents excluded from public discovery; discovery grants no authority (`agent_has_authority` still false); no Digital Self data reachable through discovery; identifier enumeration attempts; anonymous denied on both tables and the lookup function. Then Session 1/2/3A regression, typecheck, production build, and route checks.
