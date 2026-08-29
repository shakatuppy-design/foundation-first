import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * DISCOVERY IS NOT AUTHORITY.
 * Categories and capabilities here are self-declared advertising metadata.
 * advertised capability != verified capability != authority.
 * Authority lives only in digital_authority_rules / agent_has_authority().
 * `discovery_id` is an experimental, non-sensitive lookup handle — not an
 * address, not a phone-number replacement, not a communication endpoint.
 */

export const DISCOVERY_VISIBILITIES = ["private", "unlisted", "public"] as const;
export const DISCOVERY_STATUSES = ["draft", "listed", "delisted"] as const;

export type DiscoveryVisibility = (typeof DISCOVERY_VISIBILITIES)[number];
export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];

export type DiscoveryProfile = {
  id: string;
  agent_id: string;
  organization_id: string;
  discovery_id: string;
  display_name: string;
  description: string;
  categories: string[];
  capabilities: string[];
  visibility: DiscoveryVisibility;
  status: DiscoveryStatus;
  created_at: string;
  updated_at: string;
};

/** Discovery-safe projection. Never contains human identity or Digital Self data. */
export type DiscoveryResult = {
  discovery_id: string;
  display_name: string;
  description: string;
  agent_kind: string;
  categories: string[];
  capabilities: string[];
  visibility: DiscoveryVisibility;
  status: DiscoveryStatus;
};

const SAFE_SELECT =
  "discovery_id, display_name, description, categories, capabilities, visibility, status, agents!agent_discovery_profiles_agent_id_fkey(kind, status)";

type SafeRow = Omit<DiscoveryResult, "agent_kind"> & {
  agents: { kind: string; status: string } | null;
};

function toResult(row: SafeRow): DiscoveryResult {
  const { agents, ...rest } = row;
  return { ...rest, agent_kind: agents?.kind ?? "unknown" };
}

export const getAgentDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ agentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DiscoveryProfile | null> => {
    const { data: rows, error } = await context.supabase
      .from("agent_discovery_profiles")
      .select("*")
      .eq("agent_id", data.agentId)
      .limit(1);
    if (error) throw new Error(error.message);
    return (rows?.[0] ?? null) as DiscoveryProfile | null;
  });

const tags = z
  .array(z.string().trim().min(1).max(40))
  .max(24)
  .transform((list) => [...new Set(list.map((t) => t.toLowerCase()))]);

export const saveAgentDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        organizationId: z.string().uuid(),
        id: z.string().uuid().optional(),
        displayName: z.string().trim().min(2).max(120),
        description: z.string().max(2000).default(""),
        categories: tags,
        capabilities: tags,
        visibility: z.enum(DISCOVERY_VISIBILITIES),
        status: z.enum(DISCOVERY_STATUSES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = {
      agent_id: data.agentId,
      organization_id: data.organizationId,
      display_name: data.displayName,
      description: data.description,
      categories: data.categories.slice(0, 12),
      capabilities: data.capabilities,
      visibility: data.visibility,
      status: data.status,
    };

    const query = data.id
      ? context.supabase.from("agent_discovery_profiles").update(row).eq("id", data.id)
      : context.supabase.from("agent_discovery_profiles").insert(row);

    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().trim().max(120).default(""),
        mode: z.enum(["identifier", "name", "category", "capability"]).default("name"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<DiscoveryResult[]> => {
    const term = data.query.trim();
    if (!term) return [];

    // Exact identifier lookup is the ONLY path that can reach an unlisted profile.
    if (data.mode === "identifier") {
      const { data: rows, error } = await context.supabase
        .from("agent_discovery_profiles")
        .select(SAFE_SELECT)
        .eq("discovery_id", term)
        .in("visibility", ["public", "unlisted"])
        .eq("status", "listed")
        .limit(1);
      if (error) throw new Error(error.message);
      return ((rows ?? []) as unknown as SafeRow[])
        .filter((r) => r.agents?.status === "active")
        .map(toResult);
    }

    let builder = context.supabase
      .from("agent_discovery_profiles")
      .select(SAFE_SELECT)
      .eq("visibility", "public")
      .eq("status", "listed")
      .limit(50);

    if (data.mode === "name") builder = builder.ilike("display_name", `%${term}%`);
    if (data.mode === "category") builder = builder.contains("categories", [term.toLowerCase()]);
    if (data.mode === "capability")
      builder = builder.contains("capabilities", [term.toLowerCase()]);

    const { data: rows, error } = await builder;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as SafeRow[])
      .filter((r) => r.agents?.status === "active")
      .map(toResult);
  });
