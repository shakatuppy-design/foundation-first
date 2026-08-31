/**
 * SESSION 3G-F — deterministic local checks for the lesson boundary.
 * No LLM calls. Contract/state-machine level only.
 */
import {
  ALLOWED_LESSON_TRANSITIONS,
  LESSON_STATES,
  agentOutputReferenceSchema,
  advanceLessonReviewInputSchema,
  createLessonReviewInputSchema,
  isAllowedLessonTransition,
  type LessonState,
} from "../src/lib/lesson-contract";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name} ${detail}`);
  }
};

const REF = {
  model: "claude-haiku-4.5",
  timestamp: new Date().toISOString(),
  reasoning_status: "COMPLETE" as const,
  confidence: 0.6,
  observed: ["Orders fell from 100 to 70."],
  recommendation: ["Investigate checkout funnel."],
  task: "Analyze the decline.",
};
const base = { organizationId: "11111111-1111-1111-1111-111111111111", agentOutputReference: REF };

// 1-5 verdict capture
for (const verdict of ["CORRECT", "PARTIALLY_CORRECT", "NEEDS_MORE_DATA", "UNKNOWN"] as const) {
  const r = createLessonReviewInputSchema.safeParse({ ...base, humanVerdict: verdict });
  check(`capture verdict ${verdict}`, r.success);
}
check(
  "capture INCORRECT with correction",
  createLessonReviewInputSchema.safeParse({
    ...base,
    humanVerdict: "INCORRECT",
    correction: "The decline was caused by a holiday, not the gateway.",
  }).success,
);
check(
  "capture INCORRECT without correction is rejected",
  !createLessonReviewInputSchema.safeParse({ ...base, humanVerdict: "INCORRECT" }).success,
);

// 6 fake lesson injection
check(
  "fake lesson (missing output reference) rejected",
  !createLessonReviewInputSchema.safeParse({
    organizationId: base.organizationId,
    humanVerdict: "CORRECT",
  }).success,
);
check(
  "fake lesson (bogus reasoning_status) rejected",
  !agentOutputReferenceSchema.safeParse({ ...REF, reasoning_status: "TRUSTED" }).success,
);
check(
  "fake lesson (smuggled extra fields) rejected",
  !createLessonReviewInputSchema.safeParse({
    ...base,
    humanVerdict: "CORRECT",
    state: "APPROVED",
    grant_capability: "orders.refund",
  }).success,
);
check(
  "fake lesson (unknown key inside output reference) rejected",
  !agentOutputReferenceSchema.safeParse({ ...REF, authority: "grant" }).success,
);

// 7 automatic promotion blocked
check("CANDIDATE -> APPROVED blocked", !isAllowedLessonTransition("CANDIDATE", "APPROVED"));
check("CANDIDATE -> REJECTED blocked", !isAllowedLessonTransition("CANDIDATE", "REJECTED"));
check("CANDIDATE -> REVIEWED allowed", isAllowedLessonTransition("CANDIDATE", "REVIEWED"));
check("REVIEWED -> APPROVED allowed", isAllowedLessonTransition("REVIEWED", "APPROVED"));
check("REVIEWED -> REJECTED allowed", isAllowedLessonTransition("REVIEWED", "REJECTED"));
check(
  "APPROVED and REJECTED are terminal",
  ALLOWED_LESSON_TRANSITIONS.APPROVED.length === 0 &&
    ALLOWED_LESSON_TRANSITIONS.REJECTED.length === 0,
);
check(
  "no transition re-opens a final lesson",
  (["APPROVED", "REJECTED"] as LessonState[]).every((from) =>
    LESSON_STATES.every((to) => !isAllowedLessonTransition(from, to)),
  ),
);
check(
  "advance input requires a known state",
  !advanceLessonReviewInputSchema.safeParse({
    organizationId: base.organizationId,
    lessonReviewId: "22222222-2222-2222-2222-222222222222",
    nextState: "PROMOTED",
  }).success,
);
check(
  "advance input rejects smuggled promotion fields",
  !advanceLessonReviewInputSchema.safeParse({
    organizationId: base.organizationId,
    lessonReviewId: "22222222-2222-2222-2222-222222222222",
    nextState: "REVIEWED",
    apply_to_prompt: true,
  }).success,
);

// 8-9-10 no learning / authority / emergency coupling in source
const fs = await import("node:fs/promises");
const sources = [
  "src/lib/lesson-contract.ts",
  "src/lib/lessons.functions.ts",
  "src/components/pilot-lesson-capture.tsx",
  "src/components/pilot-lesson-board.tsx",
];
const joined = (
  await Promise.all(sources.map((f) => fs.readFile(new URL(`../${f}`, import.meta.url), "utf8")))
).join("\n");
check(
  "lesson layer never writes digital_authority_rules",
  !joined.includes("digital_authority_rules"),
);
check(
  "lesson layer never touches capabilities, contracts or verifications",
  !/agent_permissions|agent_capability_contracts|agent_capability_verifications|agent_capability_requests/.test(
    joined,
  ),
);
check(
  "lesson layer never writes pilot_emergency_events",
  !joined.includes("pilot_emergency_events"),
);
const reasoning = await fs.readFile(
  new URL("../src/lib/reasoning.functions.ts", import.meta.url),
  "utf8",
);
const llm = await fs.readFile(new URL("../src/lib/llm-anthropic.server.ts", import.meta.url), "utf8");
check(
  "reasoning gateway does not read lessons (no behaviour feedback loop)",
  !/lesson/i.test(reasoning) && !/lesson/i.test(llm),
);
check(
  "reasoning gateway still checks the emergency stop first",
  reasoning.includes("checkPilotOperationAllowed"),
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
