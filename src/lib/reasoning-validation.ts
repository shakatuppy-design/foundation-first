import { reasoningOutputSchema, type ReasoningOutput } from "@/lib/reasoning-contract";

/**
 * The single validation boundary for UNTRUSTED model output.
 *
 * Rules (non-negotiable):
 * - No repair, no reinterpretation, no type coercion, no defaults.
 * - Any deviation from the strict contract is a REJECTION.
 *
 * Extracted so the adversarial test layer can exercise the exact production
 * validator without weakening it.
 */

export type ReasoningValidation =
  | { ok: true; output: ReasoningOutput }
  | { ok: false; reason: "NOT_JSON" | "SCHEMA"; issues: string[] };

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

export function validateReasoningOutput(rawText: string): ReasoningValidation {
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

  return { ok: true, output: parsed.data };
}
