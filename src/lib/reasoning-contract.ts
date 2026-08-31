import { z } from "zod";

/**
 * Provider-agnostic reasoning contract for the Management Intelligence Pilot.
 *
 * The LLM has ZERO authority, ZERO database write capability and ZERO execution
 * capability. Its output is UNTRUSTED data that must pass this strict schema
 * before it is allowed anywhere near the UI. Malformed output is rejected —
 * never silently repaired.
 */

/** The ONLY agent permitted to reach the reasoning gateway during the pilot. */
export const PILOT_AGENT_KEY = "management-intelligence-pilot" as const;

export const REASONING_STATUSES = ["COMPLETE", "NEEDS_DATA", "UNCERTAIN", "BLOCKED"] as const;
export type ReasoningStatus = (typeof REASONING_STATUSES)[number];

const line = z.string().trim().min(1).max(600);
const list = z.array(line).max(12);

/** Strict: unknown/unsupported fields are a rejection, not a warning. */
export const reasoningOutputSchema = z
  .object({
    observed: list,
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
    evidence: z.string().trim().min(1).max(4000),
    task: z.string().trim().min(1).max(1000),
    context: z.string().trim().max(1000).optional(),
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
