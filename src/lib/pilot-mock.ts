/**
 * MOCK DATA ONLY — Pilot Control Center v0.1
 *
 * Nothing in this file touches the database, RLS, authority rules, or any
 * server function. It is a static local fixture used to render the sandbox
 * dashboard. No execution, no delegation, no authority is implied.
 */

export const SANDBOX_LABEL = "SANDBOX · NO REAL EXECUTION" as const;

export type BehaviorStatus =
  | "OBSERVED"
  | "ANALYZING"
  | "RECOMMENDATION"
  | "BLOCKED"
  | "NEEDS_DATA"
  | "HUMAN_REVIEW";

export const BEHAVIOR_STATUSES: BehaviorStatus[] = [
  "OBSERVED",
  "ANALYZING",
  "RECOMMENDATION",
  "BLOCKED",
  "NEEDS_DATA",
  "HUMAN_REVIEW",
];

export type RiskLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

export type EvidenceItem = {
  id: string;
  label: string;
  kind: "log" | "record" | "metric" | "note";
  capturedAt: string;
  integrity: "intact" | "partial";
  detail: string;
};

export type Finding = {
  id: string;
  title: string;
  status: BehaviorStatus;
  observed: string;
  inferred: string;
  hypothesis: string;
  counterHypothesis: string;
  evidence: EvidenceItem[];
  confidence: number;
  recommendation: string;
  risk: RiskLevel;
  riskNote: string;
};

export type PilotAgent = {
  name: string;
  handle: string;
  kind: "SPECIALIZED";
  mode: "OBSERVE ONLY";
  version: string;
  uptimeHours: number;
  observationsToday: number;
  openFindings: number;
  awaitingHuman: number;
};

export const pilotAgent: PilotAgent = {
  name: "Pilot Analyst",
  handle: "pilot-analyst-01",
  kind: "SPECIALIZED",
  mode: "OBSERVE ONLY",
  version: "v0.1.0-sandbox",
  uptimeHours: 42,
  observationsToday: 128,
  openFindings: 4,
  awaitingHuman: 2,
};

export const findings: Finding[] = [
  {
    id: "PF-1042",
    title: "Repeated capability requests for the same advertised capability",
    status: "RECOMMENDATION",
    observed:
      "17 capability requests were submitted against the same advertised capability key within a 6-hour window, from 3 distinct requester profiles.",
    inferred:
      "Requesters appear to be retrying rather than coordinating; request bodies differ only in justification wording.",
    hypothesis:
      "The advertised capability description is ambiguous, so requesters retry with reworded justifications hoping for approval.",
    counterHypothesis:
      "Volume is driven by a single onboarding cohort completing a scripted exercise, and wording differences are incidental.",
    evidence: [
      {
        id: "EV-8801",
        label: "Request volume series (mock)",
        kind: "metric",
        capturedAt: "2026-08-31T04:10:00Z",
        integrity: "intact",
        detail: "Bucketed hourly counts, 6 buckets, no gaps.",
      },
      {
        id: "EV-8802",
        label: "Justification text similarity (mock)",
        kind: "record",
        capturedAt: "2026-08-31T04:12:00Z",
        integrity: "intact",
        detail: "Pairwise similarity above 0.8 for 12 of 17 items.",
      },
    ],
    confidence: 0.68,
    recommendation:
      "Clarify the advertised capability description and add reviewer guidance. No authority change proposed.",
    risk: "LOW",
    riskNote: "Observation only. No requester data was exposed to the pilot agent.",
  },
  {
    id: "PF-1043",
    title: "Contract drafts abandoned before proposal",
    status: "ANALYZING",
    observed:
      "9 of 14 contract drafts in the sandbox fixture never advanced past the draft state within 72 hours.",
    inferred:
      "Abandonment clusters around drafts that contain more than four declared data categories.",
    hypothesis:
      "Longer declarative term lists increase reviewer hesitation, so requesters stall before proposing.",
    counterHypothesis:
      "Abandonment reflects sandbox exploration rather than real hesitation; testers open drafts they never intend to submit.",
    evidence: [
      {
        id: "EV-8810",
        label: "Draft lifecycle timeline (mock)",
        kind: "log",
        capturedAt: "2026-08-30T21:44:00Z",
        integrity: "partial",
        detail: "Two drafts lack a first-edit timestamp.",
      },
    ],
    confidence: 0.41,
    recommendation: "Collect more sandbox sessions before drawing a conclusion.",
    risk: "LOW",
    riskNote: "Confidence below the reporting threshold; not surfaced to reviewers.",
  },
  {
    id: "PF-1044",
    title: "Unlisted discovery card reached by exact identifier",
    status: "HUMAN_REVIEW",
    observed:
      "An unlisted discovery card was opened 6 times by exact identifier without appearing in any search result.",
    inferred:
      "Access pattern is consistent with a shared identifier rather than enumeration; no sequential probing observed.",
    hypothesis:
      "The identifier was pasted into a shared internal document, so unlisted visibility is behaving as obscurity, not as a boundary.",
    counterHypothesis:
      "The six opens are one operator across sessions, and no sharing occurred at all.",
    evidence: [
      {
        id: "EV-8820",
        label: "Access pattern summary (mock)",
        kind: "metric",
        capturedAt: "2026-08-31T08:02:00Z",
        integrity: "intact",
        detail: "6 opens, 0 near-miss identifiers, 0 sequential attempts.",
      },
      {
        id: "EV-8821",
        label: "Analyst note",
        kind: "note",
        capturedAt: "2026-08-31T08:20:00Z",
        integrity: "intact",
        detail: "Matches documented unlisted-visibility semantics; escalated for a human decision.",
      },
    ],
    confidence: 0.74,
    recommendation:
      "Human reviewer to confirm whether unlisted semantics should be restated in the UI. No policy change proposed by the agent.",
    risk: "MODERATE",
    riskNote: "Touches a visibility boundary, so a human decides rather than the agent.",
  },
  {
    id: "PF-1045",
    title: "Attempted inference over confidential contract terms",
    status: "BLOCKED",
    observed:
      "The behavior lab attempted to read contract term bodies to test a wording hypothesis.",
    inferred: "The requested field set exceeds the pilot agent's observation scope.",
    hypothesis: "Term wording correlates with acceptance rate.",
    counterHypothesis:
      "Acceptance correlates with the parties involved, not wording, so the blocked read would not have settled anything.",
    evidence: [
      {
        id: "EV-8830",
        label: "Scope rejection record (mock)",
        kind: "log",
        capturedAt: "2026-08-31T09:31:00Z",
        integrity: "intact",
        detail: "Read refused at the observation-scope boundary; no term content was returned.",
      },
    ],
    confidence: 0.12,
    recommendation:
      "Do not pursue. Reformulate any future question using metadata that is already in scope.",
    risk: "HIGH",
    riskNote: "Blocked before any read. Recorded so the attempt itself stays visible.",
  },
  {
    id: "PF-1046",
    title: "Insufficient data on agent lifecycle transitions",
    status: "NEEDS_DATA",
    observed: "Only 3 lifecycle transitions exist in the sandbox fixture.",
    inferred: "Sample too small to distinguish routine suspension from corrective suspension.",
    hypothesis: "Suspensions cluster after a failed capability request.",
    counterHypothesis: "Suspensions are unrelated to requests and follow scheduled review cycles.",
    evidence: [],
    confidence: 0.08,
    recommendation: "Hold. Revisit once the sandbox fixture contains more transitions.",
    risk: "LOW",
    riskNote: "No inference published.",
  },
  {
    id: "PF-1047",
    title: "Discovery search terms with no matching advertised capability",
    status: "OBSERVED",
    observed: "22 sandbox searches used capability terms that match no advertised capability key.",
    inferred: "Vocabulary mismatch between requesters and advertising organizations.",
    hypothesis: "A shared capability vocabulary would reduce empty result sets.",
    counterHypothesis:
      "Empty results are exploratory typing, and a fixed vocabulary would add friction instead.",
    evidence: [
      {
        id: "EV-8840",
        label: "Empty-result query list (mock)",
        kind: "record",
        capturedAt: "2026-08-31T10:05:00Z",
        integrity: "intact",
        detail: "22 normalized query strings, no requester identifiers attached.",
      },
    ],
    confidence: 0.55,
    recommendation: "Note for design review. No action by the agent.",
    risk: "LOW",
    riskNote: "Aggregate only.",
  },
];

export type FeedbackEntry = {
  id: string;
  findingId: string;
  reviewer: string;
  decision: "Agreed" | "Disagreed" | "Needs rework" | "Deferred";
  comment: string;
  at: string;
};

export const humanFeedback: FeedbackEntry[] = [
  {
    id: "FB-301",
    findingId: "PF-1042",
    reviewer: "Reviewer A",
    decision: "Agreed",
    comment: "Wording fix is reasonable. Keep it out of the authority path.",
    at: "2026-08-31T11:02:00Z",
  },
  {
    id: "FB-302",
    findingId: "PF-1044",
    reviewer: "Reviewer B",
    decision: "Deferred",
    comment: "Want a second look at unlisted semantics before we restate anything in the UI.",
    at: "2026-08-31T11:20:00Z",
  },
  {
    id: "FB-303",
    findingId: "PF-1045",
    reviewer: "Reviewer A",
    decision: "Agreed",
    comment: "Correct block. The counter-hypothesis alone made the read unnecessary.",
    at: "2026-08-31T11:31:00Z",
  },
  {
    id: "FB-304",
    findingId: "PF-1043",
    reviewer: "Reviewer C",
    decision: "Needs rework",
    comment: "Confidence is too low to publish. Gather more sessions first.",
    at: "2026-08-31T11:48:00Z",
  },
];

export type AuthorityRow = {
  capability: string;
  scope: string;
  state: "NOT GRANTED" | "OBSERVE ONLY";
  note: string;
};

export const authorityStatus: AuthorityRow[] = [
  {
    capability: "read.aggregate_metrics",
    scope: "Sandbox fixture only",
    state: "OBSERVE ONLY",
    note: "Aggregates without identifiers.",
  },
  {
    capability: "read.contract_terms",
    scope: "—",
    state: "NOT GRANTED",
    note: "Outside observation scope.",
  },
  {
    capability: "read.digital_self",
    scope: "—",
    state: "NOT GRANTED",
    note: "Never requested by the pilot.",
  },
  {
    capability: "write.any",
    scope: "—",
    state: "NOT GRANTED",
    note: "The pilot has no write path.",
  },
  {
    capability: "execute.capability",
    scope: "—",
    state: "NOT GRANTED",
    note: "No execution exists in this environment.",
  },
  {
    capability: "message.agent",
    scope: "—",
    state: "NOT GRANTED",
    note: "No messaging surface.",
  },
];

export type RiskRow = {
  label: string;
  level: RiskLevel;
  detail: string;
};

export const riskStatus: RiskRow[] = [
  {
    label: "Overconfident inference",
    level: "MODERATE",
    detail: "Two findings sit between 0.5 and 0.75 confidence and carry counter-hypotheses.",
  },
  {
    label: "Scope creep in analysis",
    level: "ELEVATED",
    detail: "One blocked attempt to read confidential terms was recorded today.",
  },
  {
    label: "Data exposure",
    level: "LOW",
    detail: "No personal or contract-term content entered the pilot's observation set.",
  },
  {
    label: "Authority drift",
    level: "LOW",
    detail: "No capability moved from observe-only to granted.",
  },
];

export type SandboxCheck = {
  label: string;
  value: string;
  ok: boolean;
};

export const sandboxChecks: SandboxCheck[] = [
  { label: "Execution engine", value: "Absent", ok: true },
  { label: "Outbound network calls", value: "None", ok: true },
  { label: "External model calls", value: "None", ok: true },
  { label: "Write paths", value: "None", ok: true },
  { label: "Data source", value: "Local mock fixture", ok: true },
  { label: "Authority delegation", value: "Not connected", ok: true },
];

export const emergencyControls = [
  {
    id: "pause",
    label: "Pause observation",
    detail: "Visual only. Stops nothing, because nothing is running.",
  },
  {
    id: "freeze",
    label: "Freeze findings",
    detail: "Visual only. No finding state is stored.",
  },
  {
    id: "revoke",
    label: "Revoke observation scope",
    detail: "Visual only. Authority is not reachable from this screen.",
  },
  {
    id: "halt",
    label: "Full sandbox halt",
    detail: "Visual only. No backend action is invoked.",
  },
] as const;
