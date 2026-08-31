import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PILOT_LESSON_KEY,
  advanceLessonReviewInputSchema,
  agentOutputReferenceSchema,
  createLessonReviewInputSchema,
  isAllowedLessonTransition,
  E_LESSON_FINAL,
  E_LESSON_NO_AUTO_PROMOTION,
  type AdvanceLessonReviewInput,
  type CreateLessonReviewInput,
  type LessonReviewEventView,
  type LessonReviewView,
  type LessonState,
} from "@/lib/lesson-contract";

/**
 * Human-review capture for the Management Intelligence Pilot.
 *
 * Every function runs AS THE CALLER through `context.supabase`; RLS is the
 * authorization boundary. Nothing here grants a capability, writes an authority
 * rule, alters a contract, changes a verification, touches the emergency stop
 * or modifies any prompt or model configuration. Lessons are inert records.
 */

type LessonRow = {
  id: string;
  organization_id: string;
  agent_output_reference: unknown;
  human_verdict: LessonReviewView["humanVerdict"];
  correction: string;
  supporting_evidence: string[] | null;
  lesson_candidate: string;
  state: LessonState;
  reviewer: string;
  decision_note: string;
  created_at: string;
  updated_at: string;
};

function toView(row: LessonRow): LessonReviewView {
  const parsed = agentOutputReferenceSchema.safeParse(row.agent_output_reference);
  return {
    id: row.id,
    organizationId: row.organization_id,
    // Stored model output stays untrusted: rejected rather than repaired.
    agentOutputReference: parsed.success ? parsed.data : null,
    humanVerdict: row.human_verdict,
    correction: row.correction,
    supportingEvidence: row.supporting_evidence ?? [],
    lessonCandidate: row.lesson_candidate,
    state: row.state,
    reviewer: row.reviewer,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT =
  "id, organization_id, agent_output_reference, human_verdict, correction, supporting_evidence, lesson_candidate, state, reviewer, decision_note, created_at, updated_at";

export const listLessonReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { organizationId: string } => {
    const org = (input as { organizationId?: unknown } | null)?.organizationId;
    return { organizationId: typeof org === "string" ? org : "" };
  })
  .handler(async ({ data, context }): Promise<LessonReviewView[]> => {
    if (!data.organizationId) return [];
    const { data: rows, error } = await context.supabase
      .from("pilot_lesson_reviews")
      .select(SELECT)
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Lesson reviews could not be read.");
    return (rows ?? []).map((r) => toView(r as LessonRow));
  });

export const listLessonReviewHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { lessonReviewId: string } => {
    const id = (input as { lessonReviewId?: unknown } | null)?.lessonReviewId;
    return { lessonReviewId: typeof id === "string" ? id : "" };
  })
  .handler(async ({ data, context }): Promise<LessonReviewEventView[]> => {
    if (!data.lessonReviewId) return [];
    const { data: rows, error } = await context.supabase
      .from("pilot_lesson_review_events")
      .select("id, event, previous_state, new_state, note, created_at")
      .eq("lesson_review_id", data.lessonReviewId)
      .order("seq", { ascending: true })
      .limit(200);
    if (error) throw new Error("Lesson review history could not be read.");
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      event: r.event as string,
      previousState: (r.previous_state as LessonState | null) ?? null,
      newState: r.new_state as LessonState,
      note: (r.note as string) ?? "",
      createdAt: r.created_at as string,
    }));
  });

export const createLessonReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): CreateLessonReviewInput =>
    createLessonReviewInputSchema.parse(input),
  )
  .handler(async ({ data, context }): Promise<LessonReviewView> => {
    const { data: row, error } = await context.supabase
      .from("pilot_lesson_reviews")
      .insert({
        organization_id: data.organizationId,
        pilot_key: PILOT_LESSON_KEY,
        agent_output_reference: data.agentOutputReference,
        human_verdict: data.humanVerdict,
        correction: data.correction,
        supporting_evidence: data.supportingEvidence,
        lesson_candidate: data.lessonCandidate,
        // Always CANDIDATE: never a shortcut into an approved lesson.
        state: "CANDIDATE",
        reviewer: context.userId,
      })
      .select(SELECT)
      .single();
    if (error || !row) throw new Error("The lesson review was rejected and nothing was recorded.");
    return toView(row as LessonRow);
  });

export const advanceLessonReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): AdvanceLessonReviewInput =>
    advanceLessonReviewInputSchema.parse(input),
  )
  .handler(async ({ data, context }): Promise<LessonReviewView> => {
    const { data: current, error: readError } = await context.supabase
      .from("pilot_lesson_reviews")
      .select("state")
      .eq("id", data.lessonReviewId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (readError || !current) throw new Error("Lesson review not found.");

    const from = current.state as LessonState;
    if (from === "APPROVED" || from === "REJECTED") throw new Error(E_LESSON_FINAL);
    if (!isAllowedLessonTransition(from, data.nextState)) {
      throw new Error(E_LESSON_NO_AUTO_PROMOTION);
    }

    const { data: row, error } = await context.supabase
      .from("pilot_lesson_reviews")
      .update({ state: data.nextState, decision_note: data.decisionNote })
      .eq("id", data.lessonReviewId)
      .eq("organization_id", data.organizationId)
      .select(SELECT)
      .single();
    if (error || !row) throw new Error("The lesson review state change was rejected.");
    return toView(row as LessonRow);
  });
