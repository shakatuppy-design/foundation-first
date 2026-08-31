import { z } from "zod";

/**
 * SESSION 3G-E — PILOT EMERGENCY STOP (contract only).
 *
 * Scope: the single Management Intelligence Pilot, per organization. This is a
 * kill switch, NOT an authority mechanism: it can only ever deny. It never
 * grants a capability, never writes digital_authority_rules, never touches
 * contracts or verifications, and cannot be influenced by model output.
 */

export const PILOT_EMERGENCY_KEY = "management-intelligence-pilot" as const;

export const PILOT_STATES = ["RUNNING", "STOPPED"] as const;
export type PilotState = (typeof PILOT_STATES)[number];

/** UI-facing state. ERROR is rendered as stopped: the switch fails closed. */
export type PilotEmergencyView = {
  state: PilotState;
  /** true when the state could not be read reliably and was forced to STOPPED. */
  failClosed: boolean;
  /** Safe metadata only — never prompts, never secrets. */
  lastEvent: {
    previousState: PilotState;
    newState: PilotState;
    reason: string;
    activatedBy: string;
    createdAt: string;
  } | null;
};

export const setPilotEmergencyInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    /** Desired state. STOPPED = emergency stop active. */
    nextState: z.enum(PILOT_STATES),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export type SetPilotEmergencyInput = z.infer<typeof setPilotEmergencyInputSchema>;

export const E_PILOT_STOPPED =
  "Pilot emergency stop is ACTIVE. The request was blocked before any reasoning or execution.";
