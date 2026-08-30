import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * CAPABILITY REQUEST IS NOT AUTHORITY.
 *
 * Discovery ≠ Capability Request ≠ Authority ≠ Execution.
 * A request records an intent to ask. An approval records a review decision only.
 * Nothing here creates digital_authority_rules, agent_permissions, messaging,
 * matching, or execution. Authority lives ONLY in digital_authority_rules /
 * agent_has_authority(). RLS in the database remains the authorization boundary;
 * these functions are a thin, typed access path that runs AS THE USER.
 */

export const REQUEST_PRIORITIES = ["normal", "high", "urgent"] as const;
export const REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type RequesterProfile = {
  id: string;
  display_name: string;
  organization_id: string;
};

export type CapabilityRequestRow = {
  id: string;
  request_id: string;
  requested_capability: string;
  status: RequestStatus;
  priority: RequestPriority;
  requester_note: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  cancelled_at: string | null;
  /** Discovery-safe agent label; null when the card is no longer readable. */
  target_agent_label: string | null;
  /** Only present when the viewer may read that organization. */
  target_organization_name: string | null;
  /** Only present when existing privacy rules let the viewer read the profile. */
  requester_display_name: string | null;
  /** Reviewer-only: request context is never returned to the requester list. */
  request_context?: Record<string, unknown>;
};

const CREATE_FAILED =
  "This capability request could not be created. The agent may no longer be eligible, the discovery card may no longer be listed, or the capability is no longer advertised.";
const ACTION_FAILED = "This request is no longer available for this action.";

/** Digital Selves the signed-in user personally controls. Never spoofable: user_id = auth.uid(). */
export const listMyRequesterProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RequesterProfile[]> => {
    const { data, error } = await context.supabase
      .from("digital_profiles")
      .select("id, display_name, organization_id")
      .eq("user_id", context.userId)
      .eq("profile_type", "person")
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (error) throw new Error("Could not load your Digital Self.");
    return (data ?? []) as RequesterProfile[];
  });

/** Resolves a discovery card the viewer can already see, for the request flow. */
export const getRequestTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ discoveryId: z.string().trim().min(3).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_discovery_profiles")
      .select(
        "display_name, capabilities, status, visibility, agent_id, organization_id, agents!agent_discovery_profiles_agent_id_fkey(status)",
      )
      .eq("discovery_id", data.discoveryId)
      .eq("status", "listed")
      .limit(1);
    if (error) throw new Error(ACTION_FAILED);
    const row = rows?.[0] as
      | {
          display_name: string;
          capabilities: string[];
          agents: { status: string } | null;
        }
      | undefined;
    if (!row || row.agents?.status !== "active") throw new Error(ACTION_FAILED);
    return { display_name: row.display_name, capabilities: row.capabilities };
  });

export const createCapabilityRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        discoveryId: z.string().trim().min(3).max(80),
        requesterProfileId: z.string().uuid(),
        capability: z.string().trim().min(1).max(60),
        priority: z.enum(REQUEST_PRIORITIES),
        requesterNote: z.string().trim().max(1000).optional(),
        contextPurpose: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Resolve target through the discovery card, under the viewer's own RLS.
    const { data: rows, error: lookupError } = await context.supabase
      .from("agent_discovery_profiles")
      .select(
        "agent_id, organization_id, capabilities, agents!agent_discovery_profiles_agent_id_fkey(status)",
      )
      .eq("discovery_id", data.discoveryId)
      .eq("status", "listed")
      .limit(1);
    if (lookupError) throw new Error(CREATE_FAILED);

    const target = rows?.[0] as
      | {
          agent_id: string;
          organization_id: string;
          capabilities: string[];
          agents: { status: string } | null;
        }
      | undefined;
    if (!target || target.agents?.status !== "active") throw new Error(CREATE_FAILED);

    const capability = data.capability.toLowerCase();
    if (!target.capabilities.includes(capability)) throw new Error(CREATE_FAILED);

    // The database re-validates ownership, eligibility and advertised capability.
    const { error } = await context.supabase.from("agent_capability_requests").insert({
      requester_digital_profile_id: data.requesterProfileId,
      target_agent_id: target.agent_id,
      target_organization_id: target.organization_id,
      requested_capability: capability,
      priority: data.priority,
      requester_note: data.requesterNote?.length ? data.requesterNote : null,
      request_context: data.contextPurpose?.length ? { purpose: data.contextPurpose } : {},
    });
    if (error) throw new Error(CREATE_FAILED);
    return { ok: true };
  });

const REQUEST_SELECT =
  "id, request_id, requested_capability, status, priority, requester_note, reviewer_note, created_at, updated_at, decided_at, cancelled_at, target_agent_id, target_organization_id, requester_digital_profile_id";

type BaseRow = {
  id: string;
  request_id: string;
  requested_capability: string;
  status: RequestStatus;
  priority: RequestPriority;
  requester_note: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  cancelled_at: string | null;
  target_agent_id: string;
  target_organization_id: string;
  requester_digital_profile_id: string;
};

/** Discovery-safe agent labels, resolved only through rows RLS already allows. */
async function labelAgents(
  supabase: { from: (t: string) => any },
  agentIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!agentIds.length) return map;
  const { data } = await supabase
    .from("agent_discovery_profiles")
    .select("agent_id, display_name")
    .in("agent_id", agentIds);
  for (const row of (data ?? []) as { agent_id: string; display_name: string }[]) {
    map.set(row.agent_id, row.display_name);
  }
  const { data: agents } = await supabase.from("agents").select("id, name").in("id", agentIds);
  for (const row of (agents ?? []) as { id: string; name: string }[]) {
    map.set(row.id, row.name);
  }
  return map;
}

async function labelOrganizations(
  supabase: { from: (t: string) => any },
  orgIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!orgIds.length) return map;
  const { data } = await supabase.from("organizations").select("id, name").in("id", orgIds);
  for (const row of (data ?? []) as { id: string; name: string }[]) map.set(row.id, row.name);
  return map;
}

async function labelProfiles(
  supabase: { from: (t: string) => any },
  profileIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!profileIds.length) return map;
  const { data } = await supabase
    .from("digital_profiles")
    .select("id, display_name")
    .in("id", profileIds);
  for (const row of (data ?? []) as { id: string; display_name: string }[])
    map.set(row.id, row.display_name);
  return map;
}

/** Requester view. RLS returns only requests from Digital Selves the user controls. */
export const listMyCapabilityRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ profileId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<CapabilityRequestRow[]> => {
    let builder = context.supabase
      .from("agent_capability_requests")
      .select(REQUEST_SELECT)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.profileId) builder = builder.eq("requester_digital_profile_id", data.profileId);

    const { data: rows, error } = await builder;
    if (error) throw new Error("Could not load your capability requests.");

    const base = (rows ?? []) as BaseRow[];
    const agentLabels = await labelAgents(
      context.supabase as never,
      [...new Set(base.map((r) => r.target_agent_id))],
    );
    const orgLabels = await labelOrganizations(
      context.supabase as never,
      [...new Set(base.map((r) => r.target_organization_id))],
    );

    return base.map((r) => ({
      id: r.id,
      request_id: r.request_id,
      requested_capability: r.requested_capability,
      status: r.status,
      priority: r.priority,
      requester_note: r.requester_note,
      reviewer_note: r.reviewer_note,
      created_at: r.created_at,
      updated_at: r.updated_at,
      decided_at: r.decided_at,
      cancelled_at: r.cancelled_at,
      target_agent_label: agentLabels.get(r.target_agent_id) ?? null,
      target_organization_name: orgLabels.get(r.target_organization_id) ?? null,
      requester_display_name: null,
    }));
  });

/**
 * Reviewer view. RLS returns only requests targeting organizations the viewer
 * may review; the organization filter below is a UX scope, not the boundary.
 */
export const listReviewCapabilityRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        status: z.enum(REQUEST_STATUSES).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<CapabilityRequestRow[]> => {
    let builder = context.supabase
      .from("agent_capability_requests")
      .select(`${REQUEST_SELECT}, request_context`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.organizationId) builder = builder.eq("target_organization_id", data.organizationId);
    if (data.status) builder = builder.eq("status", data.status);

    const { data: rows, error } = await builder;
    if (error) throw new Error("Could not load capability requests.");

    const base = (rows ?? []) as (BaseRow & { request_context: Record<string, unknown> })[];
    const agentLabels = await labelAgents(
      context.supabase as never,
      [...new Set(base.map((r) => r.target_agent_id))],
    );
    const orgLabels = await labelOrganizations(
      context.supabase as never,
      [...new Set(base.map((r) => r.target_organization_id))],
    );
    const profileLabels = await labelProfiles(
      context.supabase as never,
      [...new Set(base.map((r) => r.requester_digital_profile_id))],
    );

    return base.map((r) => ({
      id: r.id,
      request_id: r.request_id,
      requested_capability: r.requested_capability,
      status: r.status,
      priority: r.priority,
      requester_note: r.requester_note,
      reviewer_note: r.reviewer_note,
      created_at: r.created_at,
      updated_at: r.updated_at,
      decided_at: r.decided_at,
      cancelled_at: r.cancelled_at,
      target_agent_label: agentLabels.get(r.target_agent_id) ?? null,
      target_organization_name: orgLabels.get(r.target_organization_id) ?? null,
      requester_display_name: profileLabels.get(r.requester_digital_profile_id) ?? null,
      request_context: r.request_context ?? {},
    }));
  });

/** Requester-side cancellation. Only pending rows; RLS enforces lifecycle + ownership. */
export const cancelCapabilityRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_capability_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("id");
    if (error || !rows?.length) throw new Error(ACTION_FAILED);
    return { ok: true };
  });

/**
 * Reviewer decision. Records a decision ONLY.
 * It does not create authority, permissions, messaging, matching or execution.
 */
export const decideCapabilityRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        reviewerNote: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_capability_requests")
      .update({
        status: data.decision,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        reviewer_note: data.reviewerNote?.length ? data.reviewerNote : null,
      })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("id");
    if (error || !rows?.length) throw new Error(ACTION_FAILED);
    return { ok: true };
  });
