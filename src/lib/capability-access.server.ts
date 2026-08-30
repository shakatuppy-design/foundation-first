import {
  E_NOT_ADMIN,
  E_UNAUTHORIZED,
  E_VERIFICATION,
  isVerificationCurrentlyValid,
} from "@/lib/capability-projections";
import type { VerificationStatus } from "@/lib/capability-trust";

/**
 * Server-only role/target resolution helpers.
 *
 * These are convenience resolutions on top of RLS — never the authorization
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

/**
 * Resolves agent / organization / capability from a self-attestation, addressed
 * by its opaque public identifier. The requester never supplies the target; the
 * database guard revalidates it under a row lock during the write.
 */
export async function resolveVerificationTarget(
  supabase: Client,
  publicVerificationId: string,
): Promise<{
  id: string;
  agent_id: string;
  organization_id: string;
  capability_key: string;
}> {
  const { data } = await supabase
    .from("agent_capability_verifications")
    .select("id, agent_id, organization_id, capability_key, status, expires_at")
    .eq("verification_id", publicVerificationId)
    .limit(1);
  const row = (data ?? [])[0] as
    | {
        id: string;
        agent_id: string;
        organization_id: string;
        capability_key: string;
        status: VerificationStatus;
        expires_at: string | null;
      }
    | undefined;
  if (!row || !isVerificationCurrentlyValid(row)) throw new Error(E_VERIFICATION);
  return {
    id: row.id,
    agent_id: row.agent_id,
    organization_id: row.organization_id,
    capability_key: row.capability_key,
  };
}

/**
 * Resolves the currently valid self-attestation for an agent capability. Used
 * when a new contract version must reference a valid attestation without the
 * client naming one.
 */
export async function resolveCurrentVerification(
  supabase: Client,
  agentId: string,
  organizationId: string,
  capabilityKey: string,
): Promise<string> {
  const { data } = await supabase
    .from("agent_capability_verifications")
    .select("id, status, expires_at")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .eq("capability_key", capabilityKey)
    .eq("status", "verified")
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as { id: string; status: VerificationStatus; expires_at: string | null }[];
  const valid = rows.find((r) => isVerificationCurrentlyValid(r));
  if (!valid) throw new Error(E_VERIFICATION);
  return valid.id;
}

/**
 * Single conditional write for a lifecycle decision. All security conditions
 * (agent active, attestation valid, capability advertised and listed, identity
 * match, current status) are enforced inside the database write path — there is
 * no read-then-write security decision here.
 */
export async function decideContractStatus(
  supabase: Client,
  id: string,
  from: string,
  to: string,
  decisionNote?: string,
): Promise<{ ok: true }> {
  const { data, error } = await supabase
    .from("agent_capability_contracts")
    .update({ status: to, decision_note: decisionNote?.length ? decisionNote : null })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error || !((data ?? []) as unknown[]).length) {
    throw new Error("This contract is no longer in a state that allows this action.");
  }
  return { ok: true };
}
