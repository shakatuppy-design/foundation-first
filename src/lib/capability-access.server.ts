import { E_NOT_ADMIN, E_UNAUTHORIZED } from "@/lib/capability-projections";

/**
 * Server-only role/target resolution helpers.
 *
 * These are convenience/UX resolutions on top of RLS — never the authorization
 * boundary. Every write they precede is re-validated by the database.
 */

type Client = { from: (table: string) => any };

export async function resolveOrgRole(
  supabase: Client,
  userId: string,
  organizationId: string,
): Promise<"owner" | "admin" | "member" | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  return role === "owner" || role === "admin" || role === "member" ? role : null;
}

export async function requireOrgManager(
  supabase: Client,
  userId: string,
  organizationId: string,
): Promise<void> {
  const role = await resolveOrgRole(supabase, userId, organizationId);
  if (role !== "owner" && role !== "admin") throw new Error(E_NOT_ADMIN);
}

export async function resolveAgentOrganization(
  supabase: Client,
  agentId: string,
): Promise<{ id: string; organization_id: string; status: string }> {
  const { data } = await supabase
    .from("agents")
    .select("id, organization_id, status")
    .eq("id", agentId)
    .limit(1);
  const agent = (data ?? [])[0] as
    | { id: string; organization_id: string; status: string }
    | undefined;
  if (!agent) throw new Error(E_UNAUTHORIZED);
  return agent;
}

export async function listControlledProfileIds(
  supabase: Client,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("digital_profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active");
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}
