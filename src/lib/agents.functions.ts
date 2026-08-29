import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { JsonValue } from "@/lib/digital-self.functions";

export const AGENT_KINDS = ["personal", "organization", "service", "specialized"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

/** Legacy "inactive" is still accepted by the database for pre-existing rows. */
export const AGENT_STATUSES = ["active", "suspended", "revoked", "archived"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number] | "inactive";

export type AgentRegistryEntry = {
  id: string;
  organization_id: string;
  organization_name: string;
  name: string;
  kind: string;
  status: string;
  description: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentAuthorityGrant = {
  id: string;
  digital_profile_id: string;
  digital_profile_name: string;
  capability: string;
  scope: JsonValue;
  allowed: boolean;
  status: string;
  expires_at: string | null;
  effective: boolean;
};

export type AgentAuditEntry = {
  id: string;
  event: string;
  actor_id: string | null;
  created_at: string;
};

export type AgentDetail = {
  agent: AgentRegistryEntry;
  /** Only grants issued by Digital Selves the current user controls. RLS enforces this. */
  authority: AgentAuthorityGrant[];
  audit: AgentAuditEntry[];
  canManage: boolean;
};

const orgInput = z.object({ organizationId: z.string().uuid() });

async function creatorNames(
  supabase: { from: (t: "profiles") => any },
  ids: (string | null)[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return {};
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; full_name: string | null }[]) {
    if (row.full_name) map[row.id] = row.full_name;
  }
  return map;
}

export const listAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgInput.parse(input))
  .handler(async ({ data, context }): Promise<{ agents: AgentRegistryEntry[]; canManage: boolean }> => {
    const [{ data: rows, error }, { data: org }, { data: membership }] = await Promise.all([
      context.supabase
        .from("agents")
        .select("*")
        .eq("organization_id", data.organizationId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("organizations")
        .select("id, name")
        .eq("id", data.organizationId)
        .maybeSingle(),
      context.supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", data.organizationId)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    if (error) throw new Error(error.message);

    const names = await creatorNames(context.supabase as never, (rows ?? []).map((r) => r.created_by));

    return {
      canManage: membership?.role === "owner" || membership?.role === "admin",
      agents: (rows ?? []).map((row) => ({
        id: row.id,
        organization_id: row.organization_id,
        organization_name: org?.name ?? "—",
        name: row.name,
        kind: row.kind,
        status: row.status,
        description: row.description,
        created_by: row.created_by,
        created_by_name: row.created_by ? (names[row.created_by] ?? null) : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    };
  });

export const getAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ agentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AgentDetail> => {
    const { data: row, error } = await context.supabase
      .from("agents")
      .select("*")
      .eq("id", data.agentId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) throw new Error("Agent not found");

    const [{ data: org }, { data: membership }, { data: rules }, { data: logs }] = await Promise.all([
      context.supabase
        .from("organizations")
        .select("id, name")
        .eq("id", row.organization_id)
        .maybeSingle(),
      context.supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", row.organization_id)
        .eq("user_id", context.userId)
        .maybeSingle(),
      // RLS: only rules belonging to a Digital Self the caller controls are returned.
      context.supabase
        .from("digital_authority_rules")
        .select("id, digital_profile_id, capability, scope, allowed, status, expires_at")
        .eq("agent_id", data.agentId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("agent_activity_logs")
        .select("id, event, actor_id, created_at")
        .eq("agent_id", data.agentId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const profileIds = [...new Set((rules ?? []).map((r) => r.digital_profile_id))];
    const profileNames: Record<string, string> = {};
    if (profileIds.length) {
      const { data: profiles } = await context.supabase
        .from("digital_profiles")
        .select("id, display_name")
        .in("id", profileIds);
      for (const p of profiles ?? []) profileNames[p.id] = p.display_name;
    }

    const names = await creatorNames(context.supabase as never, [row.created_by]);
    const agentEligible = row.status === "active";

    return {
      canManage: membership?.role === "owner" || membership?.role === "admin",
      agent: {
        id: row.id,
        organization_id: row.organization_id,
        organization_name: org?.name ?? "—",
        name: row.name,
        kind: row.kind,
        status: row.status,
        description: row.description,
        created_by: row.created_by,
        created_by_name: row.created_by ? (names[row.created_by] ?? null) : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      authority: (rules ?? []).map((r) => ({
        id: r.id,
        digital_profile_id: r.digital_profile_id,
        digital_profile_name: profileNames[r.digital_profile_id] ?? "Digital Self",
        capability: r.capability,
        scope: r.scope as JsonValue,
        allowed: r.allowed,
        status: r.status,
        expires_at: r.expires_at,
        effective:
          agentEligible &&
          r.allowed === true &&
          r.status === "active" &&
          (!r.expires_at || new Date(r.expires_at).getTime() > Date.now()),
      })),
      audit: (logs ?? []) as AgentAuditEntry[],
    };
  });

export const registerAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        kind: z.enum(AGENT_KINDS),
        description: z.string().trim().max(2000).default(""),
        status: z.enum(["active", "suspended"]).default("active"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("agents")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        kind: data.kind,
        description: data.description,
        status: data.status,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        kind: z.enum(AGENT_KINDS).optional(),
        description: z.string().trim().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const patch: { name?: string; kind?: string; description?: string } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.description !== undefined) patch.description = data.description;

    const { error } = await context.supabase.from("agents").update(patch).eq("id", data.agentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAgentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ agentId: z.string().uuid(), status: z.enum(AGENT_STATUSES) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("agents")
      .update({ status: data.status })
      .eq("id", data.agentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
