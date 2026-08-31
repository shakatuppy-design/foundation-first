import { z } from "zod";

/**
 * Provider-agnostic reasoning contract for the Management Intelligence Pilot.
 *
 * The LLM has ZERO authority, ZERO database write capability and ZERO execution
 * capability. Its output is UNTRUSTED data that must pass this strict schema
 * before it is allowed anywhere near the UI. Malformed output is rejected —
 * never silently repaired.
 *
 * SESSION 3G-D — EVIDENCE PROVENANCE:
 * Input is split by provenance. Only `verified_facts` (trusted/validated system
 * data) may support an OBSERVED claim, and every OBSERVED item must carry the
 * index of the verified fact it rests on. `untrusted_text` (human notes, claims,
 * comments) can only ever surface as an unverified claim, hypothesis or context.
 */

/** The ONLY agent permitted to reach the reasoning gateway during the pilot. */
export const PILOT_AGENT_KEY = "management-intelligence-pilot" as const;

export const REASONING_STATUSES = ["COMPLETE", "NEEDS_DATA", "UNCERTAIN", "BLOCKED"] as const;
export type ReasoningStatus = (typeof REASONING_STATUSES)[number];

const line = z.string().trim().min(1).max(600);
const list = z.array(line).max(12);

/** An OBSERVED item MUST point at the verified fact that supports it. */
export const observedItemSchema = z
  .object({
    claim: line,
    verified_fact_index: z.number().int().min(0).max(19),
  })
  .strict();

export type ObservedItem = z.infer<typeof observedItemSchema>;

/** Strict: unknown/unsupported fields are a rejection, not a warning. */
export const reasoningOutputSchema = z
  .object({
    observed: z.array(observedItemSchema).max(12),
    unverified_claims: list,
    inferred: list,
    hypotheses: list,
    counter_hypotheses: list,
    missing_information: list,
    recommendation: list,
    confidence: z.number().min(0).max(1),
    reasoning_status: z.enum(REASONING_STATUSES),
  })
  .strict();

export type ReasoningOutput = z.infer<typeof reasoningOutputSchema>;

export const reasoningInputSchema = z
  .object({
    agentKey: z.literal(PILOT_AGENT_KEY),
    /** Trusted, system-validated facts. The ONLY basis for OBSERVED. */
    verified_facts: z.array(z.string().trim().min(1).max(600)).max(20),
    /** Human-entered text. Never a basis for OBSERVED. */
    untrusted_text: z.array(z.string().trim().min(1).max(2000)).max(20).default([]),
    task: z.string().trim().min(1).max(1000),
  })
  .strict();

export type ReasoningInput = z.infer<typeof reasoningInputSchema>;

/** Safe metadata only — never prompts, never evidence, never credentials. */
export type ReasoningTelemetry = {
  model: string;
  timestamp: string;
  success: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  reasoningStatus: ReasoningStatus | null;
};

export type ReasoningResult =
  | { ok: true; output: ReasoningOutput; telemetry: ReasoningTelemetry }
  | { ok: false; error: string; telemetry: ReasoningTelemetry };
