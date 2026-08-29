import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrgRole = "owner" | "admin" | "member";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  created_at: string;
};

export type OrgMember = {
  id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  full_name: string | null;
};

export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrganizationSummary[]> => {
    const { data, error } = await context.supabase
      .from("organization_members")
      .select("role, organizations!inner(id, name, slug, created_at)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? [])
      .map((row) => {
        const org = row.organizations as unknown as {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        } | null;
        if (!org) return null;
        return { ...org, role: row.role as OrgRole };
      })
      .filter((row): row is OrganizationSummary => row !== null);
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        slug: z
          .string()
          .trim()
          .min(2)
          .max(40)
          .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase.rpc("create_organization", {
      _name: data.name,
      _slug: data.slug,
    });

    if (error) {
      if (error.code === "23505" || error.message.includes("duplicate")) {
        throw new Error("That workspace identifier is already taken.");
      }
      throw new Error(error.message);
    }

    return org as { id: string; name: string; slug: string };
  });

export const listOrganizationMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<OrgMember[]> => {
    const { data: members, error } = await context.supabase
      .from("organization_members")
      .select("id, user_id, role, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    if (!members?.length) return [];

    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, full_name")
      .in(
        "id",
        members.map((m) => m.user_id),
      );

    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    return members.map((m) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role as OrgRole,
      created_at: m.created_at,
      full_name: names.get(m.user_id) ?? null,
    }));
  });

export const getOrganizationOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const orgId = data.organizationId;
    const [members, digitalProfiles, agents, logs] = await Promise.all([
      context.supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      context.supabase
        .from("digital_profiles")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      context.supabase
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      context.supabase
        .from("agent_activity_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
    ]);

    return {
      members: members.count ?? 0,
      digitalProfiles: digitalProfiles.count ?? 0,
      agents: agents.count ?? 0,
      activityLogs: logs.count ?? 0,
    };
  });
