import {
  PILOT_EMERGENCY_KEY,
  type PilotEmergencyView,
  type PilotState,
} from "@/lib/pilot-emergency-contract";

/**
 * Server-only emergency state reader for the pilot.
 *
 * FAIL CLOSED: any unreadable, malformed or ambiguous state resolves to
 * STOPPED. The state lives in an append-only log outside the model; nothing the
 * model returns can reach this code path.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

type RawEvent = {
  previous_state: string;
  new_state: string;
  reason: string;
  activated_by: string;
  created_at: string;
};

const asState = (value: unknown): PilotState | null =>
  value === "RUNNING" || value === "STOPPED" ? value : null;

export async function readPilotEmergencyState(
  supabase: Client,
  organizationId: string,
): Promise<PilotEmergencyView> {
  const closed = (lastEvent: PilotEmergencyView["lastEvent"] = null): PilotEmergencyView => ({
    state: "STOPPED",
    failClosed: true,
    lastEvent,
  });

  if (!organizationId) return closed();

  let rows: RawEvent[];
  try {
    const { data, error } = await supabase
      .from("pilot_emergency_events")
      .select("previous_state, new_state, reason, activated_by, created_at, seq")
      .eq("organization_id", organizationId)
      .eq("pilot_key", PILOT_EMERGENCY_KEY)
      .order("seq", { ascending: false })
      .limit(1);
    if (error) return closed();
    rows = (data ?? []) as RawEvent[];
  } catch {
    return closed();
  }

  // No event has ever been recorded: the pilot has never been stopped.
  if (rows.length === 0) return { state: "RUNNING", failClosed: false, lastEvent: null };

  const row = rows[0]!;
  const newState = asState(row.new_state);
  const previousState = asState(row.previous_state);
  if (!newState || !previousState) return closed();

  return {
    state: newState,
    failClosed: false,
    lastEvent: {
      previousState,
      newState,
      reason: row.reason,
      activatedBy: row.activated_by,
      createdAt: row.created_at,
    },
  };
}

/**
 * Single guard every pilot operation must pass — reasoning today, and any
 * future execution surface. Returns the resolved view; callers deny on
 * `state !== "RUNNING"`.
 */
export async function checkPilotOperationAllowed(
  supabase: Client,
  organizationId: string,
): Promise<{ allowed: boolean; view: PilotEmergencyView }> {
  const view = await readPilotEmergencyState(supabase, organizationId);
  return { allowed: view.state === "RUNNING", view };
}
