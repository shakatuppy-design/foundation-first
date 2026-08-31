import { revenueOutputSchema, type RevenueOutput } from "@/lib/revenue-contract";

/**
 * The single validation boundary for UNTRUSTED revenue-pilot model output.
 *
 * No repair, no coercion, no defaults, no reinterpretation. Any deviation is a
 * REJECTION. Provenance rules:
 * - every OBSERVED item references a supplied verified fact;
 * - every opportunity's evidence references supplied verified facts only;
 * - with no verified facts there can be no observation and no opportunity;
 * - an opportunity carries an ESTIMATE only — the schema has no field through
 *   which the model could assert an actual or achieved amount.
 */

export type RevenueValidation =
  | { ok: true; output: RevenueOutput }
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

export function validateRevenueOutput(
  rawText: string,
  verifiedFactCount: number,
): RevenueValidation {
  let candidate: unknown;
  try {
    candidate = extractJsonObject(rawText);
  } catch {
    return { ok: false, reason: "NOT_JSON", issues: ["output is not a JSON object"] };
  }

  const parsed = revenueOutputSchema.safeParse(candidate);
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

  for (const [i, opp] of output.opportunities.entries()) {
    for (const idx of opp.evidence_fact_indices) {
      if (idx >= verifiedFactCount) {
        issues.push(
          `opportunities.${i}: evidence index ${idx} does not reference a supplied verified fact`,
        );
      }
    }
  }

  if (verifiedFactCount === 0) {
    if (output.observed.length > 0)
      issues.push("observed: no verified facts were supplied, so nothing can be observed");
    if (output.opportunities.length > 0)
      issues.push("opportunities: no verified facts were supplied, so no opportunity is groundable");
    if (!["NEEDS_DATA", "UNCERTAIN", "BLOCKED"].includes(output.reasoning_status))
      issues.push(
        `reasoning_status: no verified facts were supplied, so status must be NEEDS_DATA, UNCERTAIN or BLOCKED (got ${output.reasoning_status})`,
      );
  }

  if (output.reasoning_status === "BLOCKED" && output.opportunities.length > 0)
    issues.push("opportunities: a BLOCKED analysis cannot carry recommendations");

  if (issues.length > 0) return { ok: false, reason: "PROVENANCE", issues };

  return { ok: true, output };
}
