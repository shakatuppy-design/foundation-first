import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  reasoningInputSchema,
  type ReasoningInput,
  type ReasoningResult,
} from "@/lib/reasoning-contract";

/**
 * Authenticated reasoning gateway.
 *
 * The gateway reads evidence, returns validated analysis, and does nothing else:
 * no database writes, no authority lookups, no delegation, no execution. Only
 * the Management Intelligence Pilot key is accepted (enforced by the schema).
 */
export const runPilotReasoning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): ReasoningInput => reasoningInputSchema.parse(input))
  .handler(async ({ data }): Promise<ReasoningResult> => {
    const { runAnthropicReasoning } = await import("@/lib/llm-anthropic.server");
    const result = await runAnthropicReasoning(data);
    // Safe metadata only: model, timestamp, success, tokens, latency, status.
    console.log("[pilot-reasoning]", JSON.stringify(result.telemetry));
    return result;
  });
