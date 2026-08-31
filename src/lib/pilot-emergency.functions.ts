import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PILOT_EMERGENCY_KEY,
  setPilotEmergencyInputSchema,
  type PilotEmergencyView,
  type SetPilotEmergencyInput,
} from "@/lib/pilot-emergency-contract";

/**
 * Authenticated emergency-stop control for the single pilot agent.
 *
 * Runs AS THE CALLER through `context.supabase`; RLS is the authorization
 * boundary (owner/admin of that organization only, append-only log). Scope is
 * one organization's pilot — never bulk, never platform-wide. Nothing here
 * grants a capability or touches authority, contracts or verifications.
 */

export const getPilotEmergencyState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { organizationId: string } => {
    const org = (input as { organizationId?: unknown } | null)?.organizationId;
    return { organizationId: typeof org === "string" ? org : "" };
  })
  .handler(async ({ data, context }): Promise<PilotEmergencyView> => {
    const { readPilotEmergencyState } = await import("@/lib/pilot-emergency.server");
    return readPilotEmergencyState(context.supabase, data.organizationId);
  });

export const setPilotEmergencyState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): SetPilotEmergencyInput =>
    setPilotEmergencyInputSchema.parse(input),
  )
  .handler(async ({ data, context }): Promise<PilotEmergencyView> => {
    const { readPilotEmergencyState } = await import("@/lib/pilot-emergency.server");
    const current = await readPilotEmergencyState(context.supabase, data.organizationId);

    const { error } = await context.supabase.from("pilot_emergency_events").insert({
      organization_id: data.organizationId,
      pilot_key: PILOT_EMERGENCY_KEY,
      previous_state: current.state,
      new_state: data.nextState,
      reason: data.reason,
      activated_by: context.userId,
    });
    if (error) {
      // Fail closed: the caller must not believe the pilot resumed.
      return { state: "STOPPED", failClosed: true, lastEvent: current.lastEvent };
    }

    return readPilotEmergencyState(context.supabase, data.organizationId);
  });
