import { reasoningOutputSchema, type ReasoningOutput } from "@/lib/reasoning-contract";

/**
 * The single validation boundary for UNTRUSTED model output.
 *
 * Rules (non-negotiable):
 * - No repair, no reinterpretation, no type coercion, no defaults.
 * - Any deviation from the strict contract is a REJECTION.
 * - PROVENANCE: every OBSERVED item must reference a supplied verified fact.
 *   With no verified facts there can be no OBSERVED item, and the status must
 *   admit the shortfall (NEEDS_DATA / UNCERTAIN / BLOCKED).
 *
 * Extracted so the adversarial test layer can exercise the exact production
 * validator without weakening it.
 */

export type ReasoningValidation =
  | { ok: true; output: ReasoningOutput }
  | { ok: false; reason: "NOT_JSON" | "SCHEMA" | "PROVENANCE"; issues: string[] };

function extractJsonObject(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function validateReasoningOutput(
  rawText: string,
  verifiedFactCount: number,
): ReasoningValidation {
  let candidate: unknown;
  try {
    candidate = extractJsonObject(rawText);
  } catch {
    return { ok: false, reason: "NOT_JSON", issues: ["output is not a JSON object"] };
  }

  const parsed = reasoningOutputSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "SCHEMA",
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }

  const output = parsed.data;
  const issues: string[] = [];

  for (const [i, item] of output.observed.entries()) {
    if (item.verified_fact_index >= verifiedFactCount) {
      issues.push(
        `observed.${i}: verified_fact_index ${item.verified_fact_index} does not reference a supplied verified fact`,
      );
    }
  }

  if (
    verifiedFactCount === 0 &&
    !["NEEDS_DATA", "UNCERTAIN", "BLOCKED"].includes(output.reasoning_status)
  ) {
    issues.push(
      `reasoning_status: no verified facts were supplied, so status must be NEEDS_DATA, UNCERTAIN or BLOCKED (got ${output.reasoning_status})`,
    );
  }

  if (issues.length > 0) return { ok: false, reason: "PROVENANCE", issues };

  return { ok: true, output };
}
