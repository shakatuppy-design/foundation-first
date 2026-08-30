import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { contractTermsShape, termColumns } from "@/lib/capability-schemas";
import {
  CONTRACT_METADATA_SELECT,
  CONTRACT_PARTY_SELECT,
  E_CONTRACT_STATE,
  E_UNAUTHORIZED,
  E_VERSION,
  toContractMetadata,
  toContractParty,
  type ContractMetadata,
  type ContractParty,
  type RawContractRow,
} from "@/lib/capability-projections";
import {
  decideContractStatus,
  listControlledProfileIds,
  resolveAgentOrganization,
  resolveCurrentVerification,
  resolveOrgRole,
  resolveVerificationTarget,
} from "@/lib/capability-access.server";

/**
 * A CONTRACT IS NOT AUTHORITY AND NOT EXECUTION.
 *
 * Contract terms are declarative, bounded data. They are never executed,
 * evaluated, interpolated, fetched, or treated as permissions. Authority lives
 * ONLY in digital_authority_rules / agent_has_authority(). Every function runs
 * AS THE CALLER through `context.supabase`; RLS plus the database guard trigger
 * remain the authorization boundary. Contract identity, version, status,
 * decider and timestamps are database-derived, never client-supplied.
 */

export const createContractDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        verificationId: z.string().trim().min(3).max(80),
        requesterProfileId: z.string().uuid(),
        capabilityRequestId: z.string().uuid().nullish(),
        ...contractTermsShape,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const target = await resolveVerificationTarget(context.supabase as never, data.verificationId);

    const { error } = await context.supabase.from("agent_capability_contracts").insert({
      agent_id: target.agent_id,
      organization_id: target.organization_id,
      capability_key: target.capability_key,
      verification_id: target.id,
      requester_digital_profile_id: data.requesterProfileId,
      capability_request_id: data.capabilityRequestId ?? null,
      version: 1,
      ...termColumns(data),
    });
    if (error) throw new Error(E_CONTRACT_STATE);
    return { ok: true };
  });

export const updateContractDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), ...contractTermsShape }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: rows, error } = await context.supabase
      .from("agent_capability_contracts")
      .update(termColumns(data))
      .eq("id", data.id)
      .eq("status", "draft")
      .select("id");
    if (error || !rows?.length) throw new Error(E_CONTRACT_STATE);
    return { ok: true };
  });

export const proposeContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: rows, error } = await context.supabase
      .from("agent_capability_contracts")
      .update({ status: "proposed" })
      .eq("id", data.id)
      .eq("status", "draft")
      .select("id");
    if (error || !rows?.length) throw new Error(E_CONTRACT_STATE);
    return { ok: true };
  });

export const listMyContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContractParty[]> => {
    const profileIds = await listControlledProfileIds(context.supabase as never, context.userId);
    if (!profileIds.length) return [];
    const { data: rows, error } = await context.supabase
      .from("agent_capability_contracts")
      .select(CONTRACT_PARTY_SELECT)
      .in("requester_digital_profile_id", profileIds)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(E_UNAUTHORIZED);
    return ((rows ?? []) as unknown as RawContractRow[]).map(toContractParty);
  });

export const createContractVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        supersedesContractId: z.string().uuid(),
        ...contractTermsShape,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: parents } = await context.supabase
      .from("agent_capability_contracts")
      .select(
        "id, agent_id, organization_id, capability_key, requester_digital_profile_id, version",
      )
      .eq("id", data.supersedesContractId)
      .limit(1);
    const parent = parents?.[0] as
      | {
          id: string;
          agent_id: string;
          organization_id: string;
          capability_key: string;
          requester_digital_profile_id: string;
          version: number;
        }
      | undefined;
    if (!parent) throw new Error(E_VERSION);

    // Parties, capability and the referenced attestation are all derived from
    // the predecessor; the client cannot substitute any of them, and the DB
    // guard re-validates the whole chain under a lock.
    const verificationId = await resolveCurrentVerification(
      context.supabase as never,
      parent.agent_id,
      parent.organization_id,
      parent.capability_key,
    );

    const { error } = await context.supabase.from("agent_capability_contracts").insert({
      agent_id: parent.agent_id,
      organization_id: parent.organization_id,
      capability_key: parent.capability_key,
      verification_id: verificationId,
      requester_digital_profile_id: parent.requester_digital_profile_id,
      supersedes_contract_id: parent.id,
      version: parent.version + 1,
      ...termColumns(data),
    });
    if (error) throw new Error(E_VERSION);
    return { ok: true };
  });

export const listOrgContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        agentId: z.string().uuid().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ canManage: boolean; contracts: (ContractMetadata | ContractParty)[] }> => {
      let organizationId = data.organizationId;
      if (!organizationId && data.agentId) {
        const agent = await resolveAgentOrganization(context.supabase as never, data.agentId);
        organizationId = agent.organization_id;
      }
      if (!organizationId) throw new Error(E_UNAUTHORIZED);

      const role = await resolveOrgRole(context.supabase as never, context.userId, organizationId);
      if (!role) throw new Error(E_UNAUTHORIZED);
      const canManage = role === "owner" || role === "admin";

      let builder = context.supabase
        .from("agent_capability_contracts")
        .select(canManage ? CONTRACT_PARTY_SELECT : CONTRACT_METADATA_SELECT)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (data.agentId) builder = builder.eq("agent_id", data.agentId);

      const { data: rows, error } = await builder;
      if (error) throw new Error(E_UNAUTHORIZED);
      const list = (rows ?? []) as unknown as RawContractRow[];
      return {
        canManage,
        contracts: canManage ? list.map(toContractParty) : list.map(toContractMetadata),
      };
    },
  );

export const acceptContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), decisionNote: z.string().trim().max(1000).optional() })
      .parse(input),
  )
  .handler(({ data, context }): Promise<{ ok: true }> =>
    decideContractStatus(
      context.supabase as never,
      data.id,
      "proposed",
      "accepted",
      data.decisionNote,
    ),
  );

export const rejectContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), decisionNote: z.string().trim().max(1000).optional() })
      .parse(input),
  )
  .handler(({ data, context }): Promise<{ ok: true }> =>
    decideContractStatus(
      context.supabase as never,
      data.id,
      "proposed",
      "rejected",
      data.decisionNote,
    ),
  );

/**
 * Revocation of an accepted contract. The locked RLS model permits this for the
 * agent-organization owner/admin only; the requester has no revoke policy and
 * RLS is NOT widened here for UI convenience.
 */
export const revokeContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), decisionNote: z.string().trim().max(1000).optional() })
      .parse(input),
  )
  .handler(({ data, context }): Promise<{ ok: true }> =>
    decideContractStatus(
      context.supabase as never,
      data.id,
      "accepted",
      "revoked",
      data.decisionNote,
    ),
  );
