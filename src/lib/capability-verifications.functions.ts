import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { capabilityKeySchema, evidenceSchema, isoDateSchema, pruneEvidence } from "@/lib/capability-schemas";
import {
  E_CAPABILITY,
  E_UNAUTHORIZED,
  E_VERIFICATION,
  VERIFICATION_OWNER_SELECT,
  VERIFICATION_SAFE_SELECT,
  isVerificationCurrentlyValid,
  toVerificationMember,
  toVerificationOwner,
  toVerificationSafe,
  type RawVerificationRow,
  type VerificationMember,
  type VerificationOwner,
  type VerificationSafe,
} from "@/lib/capability-projections";
import {
  requireOrgManager,
  resolveAgentOrganization,
  resolveOrgRole,
} from "@/lib/capability-access.server";

/**
 * SELF-ATTESTATION IS NOT INDEPENDENT VERIFICATION AND NOT AUTHORITY.
 *
 * Advertised ≠ self-attested ≠ contracted ≠ authorized. Nothing here writes
 * digital_authority_rules, agent_permissions, messaging, matching or any
 * execution surface. Every function runs AS THE CALLER through
 * `context.supabase`; RLS plus the database guard trigger remain the
 * authorization boundary. Identity, method, status, verifier and timestamps are
 * database-derived and never accepted from a client.
 */

export const createVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        capabilityKey: capabilityKeySchema,
        attestationNote: z.string().trim().max(1000).optional(),
        evidence: evidenceSchema.optional(),
        expiresAt: isoDateSchema.nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const agent = await resolveAgentOrganization(context.supabase as never, data.agentId);
    if (agent.status !== "active") throw new Error(E_CAPABILITY);
    await requireOrgManager(context.supabase as never, context.userId, agent.organization_id);

    const { error } = await context.supabase.from("agent_capability_verifications").insert({
      agent_id: agent.id,
      organization_id: agent.organization_id,
      capability_key: data.capabilityKey,
      attestation_note: data.attestationNote?.length ? data.attestationNote : null,
      evidence: pruneEvidence(data.evidence),
      expires_at: data.expiresAt ?? null,
    });
    if (error) throw new Error(E_CAPABILITY);
    return { ok: true };
  });

export const listOrgVerifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ agentId: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ canManage: boolean; verifications: (VerificationMember | VerificationOwner)[] }> => {
      const agent = await resolveAgentOrganization(context.supabase as never, data.agentId);
      const role = await resolveOrgRole(
        context.supabase as never,
        context.userId,
        agent.organization_id,
      );
      const canManage = role === "owner" || role === "admin";

      const { data: rows, error } = await context.supabase
        .from("agent_capability_verifications")
        .select(canManage ? VERIFICATION_OWNER_SELECT : VERIFICATION_SAFE_SELECT)
        .eq("agent_id", data.agentId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(E_UNAUTHORIZED);

      const list = (rows ?? []) as unknown as RawVerificationRow[];
      return {
        canManage,
        verifications: canManage ? list.map(toVerificationOwner) : list.map(toVerificationMember),
      };
    },
  );

export const getPublicVerificationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        discoveryId: z.string().trim().min(3).max(80),
        capabilityKey: capabilityKeySchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<VerificationSafe | null> => {
    const { data: cards } = await context.supabase
      .from("agent_discovery_profiles")
      .select("agent_id, organization_id, capabilities")
      .eq("discovery_id", data.discoveryId)
      .eq("status", "listed")
      .limit(1);
    const card = cards?.[0] as
      | { agent_id: string; organization_id: string; capabilities: string[] }
      | undefined;
    if (!card) return null;
    if (!card.capabilities.map((c) => c.trim().toLowerCase()).includes(data.capabilityKey)) {
      return null;
    }

    const { data: rows } = await context.supabase
      .from("agent_capability_verifications")
      .select(VERIFICATION_SAFE_SELECT)
      .eq("agent_id", card.agent_id)
      .eq("organization_id", card.organization_id)
      .eq("capability_key", data.capabilityKey)
      .order("created_at", { ascending: false })
      .limit(10);

    const list = (rows ?? []) as unknown as RawVerificationRow[];
    if (!list.length) return null;
    const chosen = list.find((r) => isVerificationCurrentlyValid(r)) ?? list[0]!;
    return toVerificationSafe(chosen);
  });

export const decideVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        verificationId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        decisionNote: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: rows, error } = await context.supabase
      .from("agent_capability_verifications")
      .update({
        status: data.decision === "approved" ? "verified" : "rejected",
        decision_note: data.decisionNote?.length ? data.decisionNote : null,
      })
      .eq("id", data.verificationId)
      .eq("status", "pending")
      .select("id");
    if (error || !rows?.length) throw new Error(E_VERIFICATION);
    return { ok: true };
  });

export const revokeVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        verificationId: z.string().uuid(),
        decisionNote: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: rows, error } = await context.supabase
      .from("agent_capability_verifications")
      .update({
        status: "revoked",
        decision_note: data.decisionNote?.length ? data.decisionNote : null,
      })
      .eq("id", data.verificationId)
      .eq("status", "verified")
      .select("id");
    if (error || !rows?.length) throw new Error(E_VERIFICATION);
    return { ok: true };
  });
