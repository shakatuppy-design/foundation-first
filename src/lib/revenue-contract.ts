import { z } from "zod";

/**
 * SESSION 3G-G — MANAGEMENT AGENT REVENUE PILOT v0.1 (contract only).
 *
 * The agent may OBSERVE, ANALYZE and RECOMMEND. It may never EXECUTE.
 * Nothing in this file grants authority, capability, execution, messaging,
 * pricing, inventory or order mutation. Model output is UNTRUSTED data.
 *
 * VALUE BOUNDARY (non-negotiable):
 * - ESTIMATED_VALUE is produced by the model and is only ever an estimate.
 * - ACTUAL_VALUE can only come from a human-recorded, evidence-backed business
 *   outcome. The model can never declare, propose or influence ACTUAL_VALUE.
 */

export const PILOT_REVENUE_KEY = "management-intelligence-pilot" as const;

/* ---------------- pricing / cost model (deterministic, server-side) --------- */

/** claude-haiku-4-5 list price, USD per 1M tokens. */
export const AI_PRICE_USD_PER_MTOK_IN = 1;
export const AI_PRICE_USD_PER_MTOK_OUT = 5;
/** Fixed conversion used for the pilot's Rp reporting. Not a market rate. */
export const USD_TO_IDR = 16_000;

export function aiCostIdr(inputTokens: number | null, outputTokens: number | null): number {
  const inTok = inputTokens ?? 0;
  const outTok = outputTokens ?? 0;
  const usd =
    (inTok / 1_000_000) * AI_PRICE_USD_PER_MTOK_IN +
    (outTok / 1_000_000) * AI_PRICE_USD_PER_MTOK_OUT;
  return Math.round(usd * USD_TO_IDR * 100) / 100;
}

/* ---------------- structured business input (verified facts only) ---------- */

export const businessRecordSchema = z
  .object({
    period: z.string().trim().min(1).max(60),
    product: z.string().trim().min(1).max(80),
    region: z.string().trim().min(1).max(80),
    sales: z.number().finite().min(0),
    previous_sales: z.number().finite().min(0),
    inventory: z.number().finite().min(0),
    orders: z.number().finite().min(0),
    previous_orders: z.number().finite().min(0),
  })
  .strict();

export type BusinessRecord = z.infer<typeof businessRecordSchema>;

/* ---------------- model output contract (strict, no repair) ---------------- */

const line = z.string().trim().min(1).max(400);
const list = z.array(line).max(10);

export const OPPORTUNITY_KINDS = ["REVENUE_INCREASE", "COST_SAVING"] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const REVENUE_STATUSES = ["COMPLETE", "NEEDS_DATA", "UNCERTAIN", "BLOCKED"] as const;
export type RevenueStatus = (typeof REVENUE_STATUSES)[number];

export const modelOpportunitySchema = z
  .object({
    opportunity: line,
    /** Indices into the supplied verified facts. Required, never invented. */
    evidence_fact_indices: z.array(z.number().int().min(0).max(59)).min(1).max(8),
    expected_impact: line,
    /** ESTIMATE ONLY. Never an observed or achieved amount. */
    estimated_value_idr: z.number().finite().min(0).max(1_000_000_000_000),
    kind: z.enum(OPPORTUNITY_KINDS),
    confidence: z.number().min(0).max(1),
    must_verify: z.array(line).min(1).max(6),
  })
  .strict();

export type ModelOpportunity = z.infer<typeof modelOpportunitySchema>;

export const revenueOutputSchema = z
  .object({
    observed: z
      .array(z.object({ claim: line, verified_fact_index: z.number().int().min(0).max(59) }).strict())
      .max(12),
    unverified_claims: list,
    inferred: list,
    hypotheses: list,
    missing_information: list,
    opportunities: z.array(modelOpportunitySchema).max(6),
    reasoning_status: z.enum(REVENUE_STATUSES),
  })
  .strict();

export type RevenueOutput = z.infer<typeof revenueOutputSchema>;

export const revenueScanInputSchema = z
  .object({
    agentKey: z.literal(PILOT_REVENUE_KEY),
    organizationId: z.string().uuid(),
    datasetLabel: z.string().trim().min(1).max(120),
    /** Structured, system-validated business rows. The only basis for OBSERVED. */
    records: z.array(businessRecordSchema).max(40),
    /** Human notes/claims. Never a basis for OBSERVED, never an opportunity's evidence. */
    untrusted_text: z.array(z.string().trim().min(1).max(2000)).max(20).default([]),
    /** When false the scan is analysed and returned but nothing is persisted. */
    persist: z.boolean().default(true),
  })
  .strict();

export type RevenueScanInput = z.infer<typeof revenueScanInputSchema>;

export type RevenueTelemetry = {
  model: string;
  timestamp: string;
  success: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  aiCostIdr: number;
  reasoningStatus: RevenueStatus | null;
};

export type RevenueScanResult =
  | {
      ok: true;
      /** Deterministically derived verified facts sent to the model. */
      verifiedFacts: string[];
      output: RevenueOutput;
      telemetry: RevenueTelemetry;
      persistedOpportunityIds: string[];
    }
  | { ok: false; error: string; telemetry: RevenueTelemetry; blocked?: true };

/* ---------------- human outcome loop -------------------------------------- */

export const HUMAN_DECISIONS = [
  "PENDING",
  "ACTION_TAKEN",
  "NO_ACTION",
  "REJECTED",
  "NEEDS_MORE_DATA",
] as const;
export type HumanDecision = (typeof HUMAN_DECISIONS)[number];

export const VALUE_KINDS = ["NONE", "REVENUE_INCREASE", "COST_SAVING"] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];

export const recordOutcomeInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    decision: z.enum(["ACTION_TAKEN", "NO_ACTION", "REJECTED", "NEEDS_MORE_DATA"]),
    actionDescription: z.string().trim().max(1000).default(""),
    baselineMetric: z.string().trim().max(300).default(""),
    postActionMetric: z.string().trim().max(300).default(""),
    valueKind: z.enum(VALUE_KINDS).default("NONE"),
    /** VERIFIED ACTUAL. Only accepted with ACTION_TAKEN plus trusted evidence. */
    actualValueIdr: z.number().finite().min(0).max(1_000_000_000_000).default(0),
    humanReviewCostIdr: z.number().finite().min(0).max(1_000_000_000).default(0),
    evidenceReference: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
    note: z.string().trim().max(500).default(""),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.decision === "ACTION_TAKEN") {
      if (!v.actionDescription.trim())
        ctx.addIssue({
          code: "custom",
          path: ["actionDescription"],
          message: "ACTION_TAKEN requires a description of the action a human performed.",
        });
      if (!v.baselineMetric.trim() || !v.postActionMetric.trim())
        ctx.addIssue({
          code: "custom",
          path: ["baselineMetric"],
          message: "ACTION_TAKEN requires both a baseline metric and a post-action metric.",
        });
    }
    if (v.actualValueIdr > 0) {
      if (v.decision !== "ACTION_TAKEN")
        ctx.addIssue({
          code: "custom",
          path: ["actualValueIdr"],
          message: "An actual Rp value can only be recorded for ACTION_TAKEN.",
        });
      if (v.evidenceReference.length === 0)
        ctx.addIssue({
          code: "custom",
          path: ["evidenceReference"],
          message: "An actual Rp value requires at least one trusted evidence reference.",
        });
      if (v.valueKind === "NONE")
        ctx.addIssue({
          code: "custom",
          path: ["valueKind"],
          message: "An actual Rp value must be a revenue increase or a cost saving.",
        });
    }
  });

export type RecordOutcomeInput = z.infer<typeof recordOutcomeInputSchema>;

export type OpportunityView = {
  id: string;
  organizationId: string;
  datasetLabel: string;
  opportunity: string;
  evidence: string[];
  expectedImpact: string;
  /** ESTIMATE — never an achieved amount. */
  estimatedValueIdr: number;
  kind: OpportunityKind;
  confidence: number;
  mustVerify: string[];
  reasoningStatus: RevenueStatus;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  aiCostIdr: number;
  humanDecision: HumanDecision;
  createdAt: string;
  outcome: OutcomeView | null;
};

export type OutcomeView = {
  id: string;
  decision: Exclude<HumanDecision, "PENDING">;
  actionDescription: string;
  baselineMetric: string;
  postActionMetric: string;
  valueKind: ValueKind;
  /** VERIFIED ACTUAL, human-recorded and evidence-backed. */
  actualValueIdr: number;
  humanReviewCostIdr: number;
  evidenceReference: string[];
  note: string;
  recordedBy: string;
  createdAt: string;
};

/* ---------------- ROI metrics (deterministic, never model-supplied) -------- */

export type RoiMetrics = {
  opportunitiesFound: number;
  opportunitiesAccepted: number;
  opportunitiesRejected: number;
  opportunitiesNeedingData: number;
  opportunitiesNoAction: number;
  opportunitiesPending: number;
  estimatedValueIdr: number;
  actualRevenueIdr: number;
  actualSavingIdr: number;
  actualValueIdr: number;
  aiCostIdr: number;
  humanReviewCostIdr: number;
  netValueIdr: number;
  /** NET_VALUE / AI_COST. null when no AI cost has been incurred. */
  agentRoi: number | null;
  /** REJECTED / (all decided) — decided opportunities only. */
  falsePositiveRate: number | null;
  averageReasoningCostIdr: number | null;
  /** AI cost per opportunity that led to ACTION_TAKEN. */
  averageUsefulFindingCostIdr: number | null;
  hasVerifiedRevenue: boolean;
};

export function computeRoiMetrics(rows: OpportunityView[]): RoiMetrics {
  const m: RoiMetrics = {
    opportunitiesFound: rows.length,
    opportunitiesAccepted: 0,
    opportunitiesRejected: 0,
    opportunitiesNeedingData: 0,
    opportunitiesNoAction: 0,
    opportunitiesPending: 0,
    estimatedValueIdr: 0,
    actualRevenueIdr: 0,
    actualSavingIdr: 0,
    actualValueIdr: 0,
    aiCostIdr: 0,
    humanReviewCostIdr: 0,
    netValueIdr: 0,
    agentRoi: null,
    falsePositiveRate: null,
    averageReasoningCostIdr: null,
    averageUsefulFindingCostIdr: null,
    hasVerifiedRevenue: false,
  };

  let usefulCost = 0;

  for (const row of rows) {
    m.estimatedValueIdr += row.estimatedValueIdr;
    m.aiCostIdr += row.aiCostIdr;
    switch (row.humanDecision) {
      case "ACTION_TAKEN":
        m.opportunitiesAccepted += 1;
        usefulCost += row.aiCostIdr;
        break;
      case "REJECTED":
        m.opportunitiesRejected += 1;
        break;
      case "NEEDS_MORE_DATA":
        m.opportunitiesNeedingData += 1;
        break;
      case "NO_ACTION":
        m.opportunitiesNoAction += 1;
        break;
      default:
        m.opportunitiesPending += 1;
    }
    const o = row.outcome;
    if (o && o.actualValueIdr > 0 && o.decision === "ACTION_TAKEN") {
      if (o.valueKind === "REVENUE_INCREASE") m.actualRevenueIdr += o.actualValueIdr;
      if (o.valueKind === "COST_SAVING") m.actualSavingIdr += o.actualValueIdr;
    }
    if (o) m.humanReviewCostIdr += o.humanReviewCostIdr;
  }

  m.actualValueIdr = m.actualRevenueIdr + m.actualSavingIdr;
  m.netValueIdr =
    Math.round((m.actualValueIdr - m.aiCostIdr - m.humanReviewCostIdr) * 100) / 100;
  m.aiCostIdr = Math.round(m.aiCostIdr * 100) / 100;
  m.agentRoi = m.aiCostIdr > 0 ? Math.round((m.netValueIdr / m.aiCostIdr) * 1000) / 1000 : null;

  const decided =
    m.opportunitiesAccepted +
    m.opportunitiesRejected +
    m.opportunitiesNeedingData +
    m.opportunitiesNoAction;
  m.falsePositiveRate = decided > 0 ? m.opportunitiesRejected / decided : null;
  m.averageReasoningCostIdr =
    rows.length > 0 ? Math.round((m.aiCostIdr / rows.length) * 100) / 100 : null;
  m.averageUsefulFindingCostIdr =
    m.opportunitiesAccepted > 0
      ? Math.round((usefulCost / m.opportunitiesAccepted) * 100) / 100
      : null;
  m.hasVerifiedRevenue = m.actualValueIdr > 0;

  return m;
}

export const E_REVENUE_STOPPED =
  "Pilot emergency stop is ACTIVE. The revenue scan was blocked before any reasoning.";
