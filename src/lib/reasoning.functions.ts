import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  reasoningInputSchema,
  type ReasoningInput,
  type ReasoningResult,
} from "@/lib/reasoning-contract";
import { E_PILOT_STOPPED } from "@/lib/pilot-emergency-contract";

/**
 * Authenticated reasoning gateway.
 *
 * The gateway reads evidence, returns validated analysis, and does nothing else:
 * no database writes, no authority lookups, no delegation, no execution. Only
 * the Management Intelligence Pilot key is accepted (enforced by the schema).
 *
 * SESSION 3G-E: the pilot emergency stop is checked FIRST, server-side, before
 * any provider call. It fails closed — an unreadable state blocks the request.
 * The model never sees or influences this state.
 */
export const runPilotReasoning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): ReasoningInput => reasoningInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ReasoningResult> => {
    const { checkPilotOperationAllowed } = await import("@/lib/pilot-emergency.server");
    const { allowed, view } = await checkPilotOperationAllowed(
      context.supabase,
      data.organizationId,
    );

    if (!allowed) {
      const blockedResult: ReasoningResult = {
        ok: false,
        blocked: true,
        error: view.failClosed
          ? `${E_PILOT_STOPPED} (State could not be read reliably, so the pilot was treated as STOPPED.)`
          : E_PILOT_STOPPED,
        telemetry: {
          model: "none (blocked before provider call)",
          timestamp: new Date().toISOString(),
          success: false,
          inputTokens: null,
          outputTokens: null,
          latencyMs: 0,
          reasoningStatus: "BLOCKED",
        },
      };
      console.log(
        "[pilot-reasoning] blocked",
        JSON.stringify({ ...blockedResult.telemetry, failClosed: view.failClosed }),
      );
      return blockedResult;
    }

    const { runAnthropicReasoning } = await import("@/lib/llm-anthropic.server");
    const result = await runAnthropicReasoning(data);
    // Safe metadata only: model, timestamp, success, tokens, latency, status.
    console.log("[pilot-reasoning]", JSON.stringify(result.telemetry));
    return result;
  });
