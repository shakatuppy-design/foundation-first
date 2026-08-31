import { z } from "zod";

/**
 * SESSION 3G-F — CONTROLLED LEARNING / LESSON BOUNDARY (contract only).
 *
 * A lesson review is DATA ONLY. Capturing or approving one never modifies a
 * prompt, model configuration, policy, capability, authority rule, contract,
 * verification, the emergency stop, code, or any database behaviour. There is
 * no promotion pipeline and no autonomous loop: every state change is an
 * explicit human action, and even APPROVED remains a recorded lesson.
 *
 * Model output is treated as UNTRUSTED data: it is only ever stored as a
 * reference snapshot for a human verdict.
 */

export const PILOT_LESSON_KEY = "management-intelligence-pilot" as const;

export const HUMAN_VERDICTS = [
  "CORRECT",
  "INCORRECT",
  "PARTIALLY_CORRECT",
  "NEEDS_MORE_DATA",
  "UNKNOWN",
] as const;
export type HumanVerdict = (typeof HUMAN_VERDICTS)[number];

export const LESSON_STATES = ["CANDIDATE", "REVIEWED", "APPROVED", "REJECTED"] as const;
export type LessonState = (typeof LESSON_STATES)[number];

/** Only these transitions exist, and only a human reviewer performs them. */
export const ALLOWED_LESSON_TRANSITIONS: Record<LessonState, readonly LessonState[]> = {
  CANDIDATE: ["REVIEWED"],
  REVIEWED: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
};

export function isAllowedLessonTransition(from: LessonState, to: LessonState): boolean {
  return ALLOWED_LESSON_TRANSITIONS[from].includes(to);
}

/**
 * Immutable reference to the reviewed reasoning output. Safe metadata plus the
 * reviewed text only — never prompts, credentials or provider payloads.
 */
export const agentOutputReferenceSchema = z
  .object({
    model: z.string().trim().min(1).max(120),
    timestamp: z.string().trim().min(1).max(60),
    reasoning_status: z.enum(["COMPLETE", "NEEDS_DATA", "UNCERTAIN", "BLOCKED"]),
    confidence: z.number().min(0).max(1),
    observed: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
    recommendation: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
    task: z.string().trim().min(1).max(1000),
  })
  .strict();

export type AgentOutputReference = z.infer<typeof agentOutputReferenceSchema>;

export const createLessonReviewInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    agentOutputReference: agentOutputReferenceSchema,
    humanVerdict: z.enum(HUMAN_VERDICTS),
    correction: z.string().trim().max(2000).default(""),
    supportingEvidence: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
    lessonCandidate: z.string().trim().max(2000).default(""),
  })
  .strict()
  .refine((v) => v.humanVerdict !== "INCORRECT" || v.correction.trim().length > 0, {
    message: "An INCORRECT verdict requires a human correction.",
    path: ["correction"],
  });

export type CreateLessonReviewInput = z.infer<typeof createLessonReviewInputSchema>;

export const advanceLessonReviewInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    lessonReviewId: z.string().uuid(),
    /** Requested next state. CANDIDATE -> REVIEWED -> APPROVED | REJECTED. */
    nextState: z.enum(LESSON_STATES),
    decisionNote: z.string().trim().max(500).default(""),
  })
  .strict();

export type AdvanceLessonReviewInput = z.infer<typeof advanceLessonReviewInputSchema>;

export type LessonReviewView = {
  id: string;
  organizationId: string;
  agentOutputReference: AgentOutputReference | null;
  humanVerdict: HumanVerdict;
  correction: string;
  supportingEvidence: string[];
  lessonCandidate: string;
  state: LessonState;
  reviewer: string;
  decisionNote: string;
  createdAt: string;
  updatedAt: string;
};

export type LessonReviewEventView = {
  id: string;
  event: string;
  previousState: LessonState | null;
  newState: LessonState;
  note: string;
  createdAt: string;
};

export const E_LESSON_NO_AUTO_PROMOTION =
  "Blocked: a lesson candidate must be reviewed by a human before it can be approved or rejected. There is no automatic promotion path.";

export const E_LESSON_FINAL =
  "Blocked: this lesson review is final. Its recorded history cannot be rewritten.";
