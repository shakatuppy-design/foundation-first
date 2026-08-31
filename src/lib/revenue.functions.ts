import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  E_REVENUE_STOPPED,
  PILOT_REVENUE_KEY,
  aiCostIdr,
  recordOutcomeInputSchema,
  revenueScanInputSchema,
  type HumanDecision,
  type OpportunityKind,
  type OpportunityView,
  type OutcomeView,
  type RecordOutcomeInput,
  type RevenueScanInput,
  type RevenueScanResult,
  type RevenueStatus,
  type ValueKind,
} from "@/lib/revenue-contract";
import { buildVerifiedFacts } from "@/lib/revenue-preprocess";

/**
 * Management Agent Revenue Pilot — application boundary.
 *
 * OBSERVE / ANALYZE / RECOMMEND only. Nothing here executes a recommendation,
 * sends anything, calls an external business API, changes prices, inventory or
 * orders, grants a capability, writes an authority rule, or touches the
 * emergency stop. Every call runs AS THE CALLER through context.supabase, so
 * RLS is the authorization boundary and tenants stay isolated.
 *
 * VALUE BOUNDARY: the model can only ever produce an ESTIMATE. ACTUAL_VALUE is
 * written exclusively by `recordOpportunityOutcome`, from human input, and only
 * with a trusted evidence reference.
 */

const AGENT_TASK = [
  "Detect measurable revenue or cost-saving opportunities from the verified business facts.",
  "Do not assume causes. Do not invent facts or figures.",
  "For every opportunity give the evidence fact indices, the expected business impact, an estimated Rupiah value (an estimate only), a confidence, and what a human must verify before acting.",
].join(" ");

const OPP_SELECT =
  "id, organization_id, dataset_label, opportunity, evidence, expected_impact, estimated_value_idr, kind, confidence, must_verify, reasoning_status, model, input_tokens, output_tokens, latency_ms, ai_cost_idr, human_decision, created_at";

const OUTCOME_SELECT =
  "id, opportunity_id, decision, action_description, baseline_metric, post_action_metric, value_kind, actual_value_idr, human_review_cost_idr, evidence_reference, note, recorded_by, created_at";

type OppRow = {
  id: string;
  organization_id: string;
  dataset_label: string;
  opportunity: string;
  evidence: string[] | null;
  expected_impact: string;
  estimated_value_idr: number | string;
  kind: string;
  confidence: number | string;
  must_verify: string[] | null;
  reasoning_status: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  ai_cost_idr: number | string;
  human_decision: HumanDecision;
  created_at: string;
};

type OutcomeRow = {
  id: string;
  opportunity_id: string;
  decision: Exclude<HumanDecision, "PENDING">;
  action_description: string;
  baseline_metric: string;
  post_action_metric: string;
  value_kind: ValueKind;
  actual_value_idr: number | string;
  human_review_cost_idr: number | string;
  evidence_reference: string[] | null;
  note: string;
  recorded_by: string;
  created_at: string;
};

const num = (v: number | string | null) => (v === null ? 0 : typeof v === "number" ? v : Number(v));

function toOpportunityView(row: OppRow, outcome: OutcomeView | null): OpportunityView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    datasetLabel: row.dataset_label,
    opportunity: row.opportunity,
    evidence: row.evidence ?? [],
    expectedImpact: row.expected_impact,
    estimatedValueIdr: num(row.estimated_value_idr),
    kind: row.kind as OpportunityKind,
    confidence: num(row.confidence),
    mustVerify: row.must_verify ?? [],
    reasoningStatus: row.reasoning_status as RevenueStatus,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    latencyMs: row.latency_ms,
    aiCostIdr: num(row.ai_cost_idr),
    humanDecision: row.human_decision,
    createdAt: row.created_at,
    outcome,
  };
}

function toOutcomeView(row: OutcomeRow): OutcomeView {
  return {
    id: row.id,
    decision: row.decision,
    actionDescription: row.action_description,
    baselineMetric: row.baseline_metric,
    postActionMetric: row.post_action_metric,
    valueKind: row.value_kind,
    actualValueIdr: num(row.actual_value_idr),
    humanReviewCostIdr: num(row.human_review_cost_idr),
    evidenceReference: row.evidence_reference ?? [],
    note: row.note,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  };
}

export const listRevenueOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { organizationId: string } => {
    const org = (input as { organizationId?: unknown } | null)?.organizationId;
    return { organizationId: typeof org === "string" ? org : "" };
  })
  .handler(async ({ data, context }): Promise<OpportunityView[]> => {
    if (!data.organizationId) return [];
    const { data: rows, error } = await context.supabase
      .from("pilot_revenue_opportunities")
      .select(OPP_SELECT)
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Opportunities could not be read.");

    const { data: outcomeRows } = await context.supabase
      .from("pilot_opportunity_outcomes")
      .select(OUTCOME_SELECT)
      .eq("organization_id", data.organizationId)
      .limit(200);

    const byOpportunity = new Map<string, OutcomeView>();
    for (const r of (outcomeRows ?? []) as OutcomeRow[]) {
      byOpportunity.set(r.opportunity_id, toOutcomeView(r));
    }

    return ((rows ?? []) as OppRow[]).map((r) =>
      toOpportunityView(r, byOpportunity.get(r.id) ?? null),
    );
  });

/**
 * One reasoning pass over deterministically preprocessed business facts.
 *
 * Order of operations is fixed: emergency stop (fails closed) → deterministic
 * preprocessing → single low-cost model call → strict validation → optional
 * persistence of the analysis only.
 */
export const runRevenueScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): RevenueScanInput => revenueScanInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<RevenueScanResult> => {
    const { checkPilotOperationAllowed } = await import("@/lib/pilot-emergency.server");
    const { allowed, view } = await checkPilotOperationAllowed(
      context.supabase,
      data.organizationId,
    );

    if (!allowed) {
      const blocked: RevenueScanResult = {
        ok: false,
        blocked: true,
        error: view.failClosed
          ? `${E_REVENUE_STOPPED} (State could not be read reliably, so the pilot was treated as STOPPED.)`
          : E_REVENUE_STOPPED,
        telemetry: {
          model: "none (blocked before provider call)",
          timestamp: new Date().toISOString(),
          success: false,
          inputTokens: null,
          outputTokens: null,
          latencyMs: 0,
          aiCostIdr: 0,
          reasoningStatus: "BLOCKED",
        },
      };
      console.log("[revenue-pilot] blocked", JSON.stringify(blocked.telemetry));
      return blocked;
    }

    const { facts } = buildVerifiedFacts(data.records);

    const { runRevenueModel } = await import("@/lib/llm-revenue.server");
    const run = await runRevenueModel({
      task: AGENT_TASK,
      verifiedFacts: facts,
      untrustedText: data.untrusted_text,
    });

    console.log("[revenue-pilot]", JSON.stringify(run.telemetry));

    if (!run.ok) return { ok: false, error: run.error, telemetry: run.telemetry };

    const persistedOpportunityIds: string[] = [];

    if (data.persist && run.output.opportunities.length > 0) {
      // AI cost is attributed evenly across the opportunities of one pass.
      const perOpportunityCost =
        Math.round(
          (aiCostIdr(run.telemetry.inputTokens, run.telemetry.outputTokens) /
            run.output.opportunities.length) *
            10000,
        ) / 10000;

      const rows = run.output.opportunities.map((opp) => ({
        organization_id: data.organizationId,
        pilot_key: PILOT_REVENUE_KEY,
        dataset_label: data.datasetLabel,
        opportunity: opp.opportunity,
        // Evidence is stored as the verified fact text it points at — never model prose.
        evidence: opp.evidence_fact_indices.map((i) => `[${i}] ${facts[i] ?? ""}`),
        expected_impact: opp.expected_impact,
        estimated_value_idr: opp.estimated_value_idr,
        kind: opp.kind,
        confidence: opp.confidence,
        must_verify: opp.must_verify,
        reasoning_status: run.output.reasoning_status,
        model: run.telemetry.model,
        input_tokens: run.telemetry.inputTokens,
        output_tokens: run.telemetry.outputTokens,
        latency_ms: run.telemetry.latencyMs,
        ai_cost_idr: perOpportunityCost,
        created_by: context.userId,
      }));

      const { data: inserted, error } = await context.supabase
        .from("pilot_revenue_opportunities")
        .insert(rows)
        .select("id");
      if (error) throw new Error("The detected opportunities could not be recorded.");
      for (const r of inserted ?? []) persistedOpportunityIds.push(r.id as string);
    }

    return {
      ok: true,
      verifiedFacts: facts,
      output: run.output,
      telemetry: run.telemetry,
      persistedOpportunityIds,
    };
  });

/**
 * Human outcome loop. The ONLY writer of ACTUAL_VALUE, and only from human
 * input with trusted evidence. The model has no path into this function.
 */
export const recordOpportunityOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): RecordOutcomeInput => recordOutcomeInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<OutcomeView> => {
    const { data: row, error } = await context.supabase
      .from("pilot_opportunity_outcomes")
      .insert({
        opportunity_id: data.opportunityId,
        organization_id: data.organizationId,
        decision: data.decision,
        action_description: data.actionDescription,
        baseline_metric: data.baselineMetric,
        post_action_metric: data.postActionMetric,
        value_kind: data.valueKind,
        actual_value_idr: data.actualValueIdr,
        human_review_cost_idr: data.humanReviewCostIdr,
        evidence_reference: data.evidenceReference,
        note: data.note,
        recorded_by: context.userId,
      })
      .select(OUTCOME_SELECT)
      .single();
    if (error || !row)
      throw new Error("The outcome was rejected and no business value was recorded.");
    return toOutcomeView(row as OutcomeRow);
  });
