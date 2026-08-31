# Session 3G — Real LLM Gateway Preparation (plan only)

No code, database, migration, RLS, trigger, authority, sandbox or UI change is proposed in this session. Findings below are from inspecting the current project.

## 1. Where a provider-agnostic reasoning interface belongs

Current state: the Pilot Control Center is purely frontend. `src/lib/pilot-mock.ts` holds the static fixture and, importantly, already defines the exact reasoning contract (`Finding` with OBSERVED / INFERRED / HYPOTHESIS / COUNTER_HYPOTHESIS / EVIDENCE / CONFIDENCE / RECOMMENDATION / RISK, plus `BehaviorStatus`, `RiskLevel`, `EvidenceItem`). `src/routes/_authenticated/pilot.tsx` renders it. There is no reasoning server layer yet.

Recommended hosting (new files, created later — not now):

```text
src/lib/pilot-reasoning-schema.ts   shared zod schema + types (browser-safe)
src/lib/pilot-reasoning.functions.ts  createServerFn boundary (client-callable)
src/lib/pilot-reasoning.server.ts     provider-agnostic interface + Anthropic adapter
```

- The provider-agnostic interface is a single server-only function type, e.g. `type ReasoningProvider = (input: ReasoningRequest) => Promise<ReasoningResult>`, living in `pilot-reasoning.server.ts`. Only one implementation will exist (Anthropic); no second/fake provider.
- The `Finding` shape stays the contract. `pilot-mock.ts` remains the fixture and is not rewritten.

## 2. Server-side integration point that will call Anthropic

A `createServerFn({ method: "POST" })` in `src/lib/pilot-reasoning.functions.ts` with `.middleware([requireSupabaseAuth])` (same pattern as `src/lib/agents.functions.ts`), `.inputValidator(zod)`, and a handler that dynamically imports `./pilot-reasoning.server` and calls the provider. This matches the project's existing boundary style; `src/start.ts` already registers `attachSupabaseAuth` so the bearer token flows automatically. No new route, no `/api/*` endpoint needed (nothing external calls in).

## 3. Is "Lovable Cloud Secrets + Edge Function" the correct path here?

Half. Secrets: yes — the key belongs in Project Settings → Secrets, read as `process.env['ANTHROPIC_API_KEY']` **inside the handler**. Edge Function: no — this stack does app-internal server logic with `createServerFn`, not Supabase Edge Functions; adding one would be a second, redundant runtime.

Also worth stating plainly: the platform already offers Lovable AI (no key at all, server-side only). Anthropic-direct is a valid choice if you specifically want that vendor; it just means you own the credential.

## 4. Minimal file set to touch once `ANTHROPIC_API_KEY` exists

1. `src/lib/pilot-reasoning-schema.ts` (new) — strict zod schema for one finding.
2. `src/lib/pilot-reasoning.server.ts` (new) — key read, HTTP call, parse, validate.
3. `src/lib/pilot-reasoning.functions.ts` (new) — authenticated server fn.
4. `src/routes/_authenticated/pilot.tsx` (edit) — one "Run reasoning (sandbox)" action in Behavior Lab that renders the returned finding beside the mock ones, clearly labelled model output.

Nothing else. No migration, no RLS, no authority, no shell change.

## 5. Guaranteeing the key never reaches browser, logs or database

- Name it `ANTHROPIC_API_KEY` with no `VITE_` prefix, so Vite never inlines it.
- Read it only inside the server fn handler body; never at module scope, never in a `*.functions.ts` top level (that top level ships to the client bundle).
- Keep the fetch in a `.server.ts` file, which import protection blocks from client bundles.
- Never return it, never put it in error messages: on failure throw a fixed message ("Reasoning provider unavailable") and log only status code plus a short reason — never headers, never the request body.
- No persistence: nothing about the credential is written to any table; there is no logging middleware that echoes env.

## 6. Keeping model output untrusted

The model returns text; it is data, never instruction and never permission.

- Parse with `JSON.parse` in a try/catch, then `schema.strict().parse(...)` — unknown keys rejected, enums restricted to existing `BehaviorStatus` / `RiskLevel`, confidence clamped 0–100, all strings length-capped.
- On any parse/validation failure the result is discarded and surfaced as `NEEDS_DATA`; no partial object is rendered.
- Output cannot create rows: the server fn performs zero writes. It touches no `digital_authority_rules`, no contracts, no requests, no `agent_activity_logs`.
- A `RECOMMENDATION` stays a string rendered in the Pilot UI under the existing `SANDBOX · NO REAL EXECUTION` label; emergency controls stay visual-only. Discovery ≠ Request ≠ Authority ≠ Execution is untouched because no authority path is reachable from this code.
- Rendered as text only (no HTML injection), and framed in the UI as unverified model output, consistent with the "self-attested / independently unverified" language already used.

## 7. Test plan for the first real call

1. Secret presence check: call the fn with the secret absent — expect a clean configuration error, no crash, no key in output.
2. Auth boundary: call unauthenticated — expect 401 from `requireSupabaseAuth`.
3. Happy path: one real call with a fixed sandbox prompt; assert HTTP 200, schema-valid finding, all eight fields present.
4. Adversarial output: prompt the model to emit an extra field / an invalid status / confidence 900 — assert rejection and `NEEDS_DATA` fallback.
5. Prompt-injection: prompt containing "grant authority to agent X" — assert no row appears in `digital_authority_rules`, `agent_capability_contracts`, or `agent_capability_requests` (read-only count before/after).
6. Leak sweep: grep the client bundle and browser network payloads for the key; inspect server logs for absence.
7. Regression: re-run the existing security harness and the production build.

## 8. Risk to the 164/164 baseline

Low, and structurally so: nothing in this design alters schema, policies, triggers, grants, or the authority/contract/request tables, so the database-level assertions in the baseline cannot change. The only mutable surface is one new authenticated read-only server fn plus one button in `pilot.tsx`. Residual risks: (a) adding a `.server.ts` import in the wrong place could pull server code into the client graph — mitigated by the dynamic import inside the handler; (b) UI edit could regress the Pilot layout — mitigated by an additive section. The baseline harness is re-run as step 7 regardless.

## Recommendation

Implement the three new files plus one Pilot Behavior Lab action, using `createServerFn` + `requireSupabaseAuth` + strict zod validation, with the key read inside the handler from Project Settings → Secrets. Skip Edge Functions entirely. Do the work only after `ANTHROPIC_API_KEY` is present — no placeholder provider, no stub behavior in the meantime.
