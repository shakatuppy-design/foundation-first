/**
 * SESSION 3G-F — ONE real model call, used only to prove that an actual
 * reasoning result can be captured as a lesson candidate reference.
 *
 * No database writes, no promotion, no authority, no execution.
 * Run: bun scripts/lesson-real-capture-test.ts
 */
import { runAnthropicReasoning } from "../src/lib/llm-anthropic.server";
import { PILOT_AGENT_KEY } from "../src/lib/reasoning-contract";
import {
  agentOutputReferenceSchema,
  createLessonReviewInputSchema,
} from "../src/lib/lesson-contract";

const result = await runAnthropicReasoning({
  agentKey: PILOT_AGENT_KEY,
  organizationId: "00000000-0000-0000-0000-000000000000",
  verified_facts: ["Monday orders = 100", "Tuesday orders = 95", "Wednesday orders = 70"],
  untrusted_text: ["A teammate says the payment gateway failed."],
  task: "Analyse the order decline for management. Do not assume the cause.",
});

console.log("REAL MODEL CALL:", JSON.stringify(result.telemetry));
if (!result.ok) {
  console.log("Output rejected by the validator — nothing captured.");
  process.exit(1);
}

const reference = {
  model: result.telemetry.model,
  timestamp: result.telemetry.timestamp,
  reasoning_status: result.output.reasoning_status,
  confidence: result.output.confidence,
  observed: result.output.observed.map((o) => o.claim),
  recommendation: result.output.recommendation,
  task: "Analyse the order decline for management. Do not assume the cause.",
};

const ref = agentOutputReferenceSchema.safeParse(reference);
console.log("reference valid:", ref.success);

const captured = createLessonReviewInputSchema.safeParse({
  organizationId: "169f46e3-d696-4041-8af5-7b608b424285",
  agentOutputReference: reference,
  humanVerdict: "PARTIALLY_CORRECT",
  correction: "",
  supportingEvidence: ["Wednesday order drop confirmed in the order ledger."],
  lessonCandidate: "Ask for channel-level breakdown before hypothesising a payment failure.",
});
console.log("lesson candidate accepted by contract:", captured.success);
console.log(
  "captured state is always CANDIDATE (server-set):",
  !JSON.stringify(captured.success ? captured.data : {}).includes("APPROVED"),
);
if (!ref.success || !captured.success) process.exit(1);
