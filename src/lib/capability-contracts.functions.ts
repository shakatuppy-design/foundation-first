import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CAPABILITY_KEY_PATTERN, DATA_IDENTIFIER_PATTERN } from "@/lib/capability-trust";
import { isVerificationCurrentlyValid } from "@/lib/capability-verifications.functions";
import type { VerificationStatus } from "@/lib/capability-trust";
import type { ContractStatus } from "@/lib/capability-trust";

/**
 * A CONTRACT IS NOT AUTHORITY AND NOT EXECUTION.
 *
 * Contract terms are declarative, bounded data. They are never executed,
 * evaluated, interpolated, fetched, or treated as permissions. Authority lives
 * ONLY in digital_authority_rules / agent_has_authority(). Every function runs
 * AS THE CALLER through `context.supabase`; RLS and the DB guard trigger remain
 * the authorization boundary. Identity, version, status, decider and timestamps
 * are database-derived and never accepted from a client.
 */

const E_UNAUTHORIZED = "You don't have access to this.";
const E_NOT_ADMIN = "Only organization owners and admins can do this.";
const E_VERIFICATION = "A valid self-attestation is required for this capability.";
const E_STATE = "This contract is no longer in a state that allows this action.";
const E_VERSION = "This version could not be created from the selected contract.";

export type ContractTerms = {
  scope: Record<string, string | boolean>;
  constraints: Record<string, string | boolean>;
  limits: Record<string, number>;
  allowed_data: string[];
  prohibited_data: string[];
  requester_note: string | null;
};

/** Lifecycle metadata only. Safe for organization members. */
export type ContractMetadata = {
  id: string;
  contract_id: string;
  capability_key: string;
  status: ContractStatus;
  version: number;
  effective_from: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  proposed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  revoked_at: string | null;
  expired_at: string | null;
  is_effective: boolean;
  agent_name: string | null;
  supersedes_contract_id: string | null;
};

/** Party-level view: requester, or agent-organization owner/admin. */
export type ContractParty = ContractMetadata & ContractTerms;

const METADATA_SELECT =
  "id, contract_id, capability_key, status, version, effective_from, expires_at, created_at, updated_at, proposed_at, accepted_at, rejected_at, revoked_at, expired_at, supersedes_contract_id, agents!acc_agent_fkey(name, status), agent_capability_verifications!acc_verification_fkey(status, expires_at)";
const PARTY_SELECT = `${METADATA_SELECT}, scope, constraints, limits, allowed_data, prohibited_data, requester_note`;

type RawRow = {
  id: string;
  contract_id: string;
  capability_key: string;
  status: ContractStatus;
  version: number;
  effective_from: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  proposed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  revoked_at: string | null;
  expired_at: string | null;
  supersedes_contract_id: string | null;
  agents: { name: string; status: string } | null;
  agent_capability_verifications: { status: VerificationStatus; expires_at: string | null } | null;
  scope?: unknown;
  constraints?: unknown;
  limits?: unknown;
  allowed_data?: string[];
  prohibited_data?: string[];
  requester_note?: string | null;
};

/**
 * Derived server-side ONLY, never stored. `status = 'accepted'` alone is never
 * sufficient: the time window, the self-attestation and the agent must all hold.
 */
function deriveEffective(row: RawRow): boolean {
  if (row.status !== "accepted") return false;
  const now = Date.now();
  if (row.effective_from && new Date(row.effective_from).getTime() > now) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false;
  if (row.agents?.status !== "active") return false;
  const verification = row.agent_capability_verifications;
  if (!verification) return false;
  return isVerificationCurrentlyValid(verification);
}

function toMetadata(row: RawRow): ContractMetadata {
  return {
    id: row.id,
    contract_id: row.contract_id,
    capability_key: row.capability_key,
    status: row.status,
    version: row.version,
    effective_from: row.effective_from,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    proposed_at: row.proposed_at,
    accepted_at: row.accepted_at,
    rejected_at: row.rejected_at,
    revoked_at: row.revoked_at,
    expired_at: row.expired_at,
    supersedes_contract_id: row.supersedes_contract_id,
    agent_name: row.agents?.name ?? null,
    is_effective: deriveEffective(row),
  };
}

function flatRecord(raw: unknown): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

function numberRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

function toParty(row: RawRow): ContractParty {
  return {
    ...toMetadata(row),
    scope: flatRecord(row.scope),
    constraints: flatRecord(row.constraints),
    limits: numberRecord(row.limits),
    allowed_data: row.allowed_data ?? [],
    prohibited_data: row.prohibited_data ?? [],
    requester_note: row.requester_note ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Term validation — mirrors the database constraints exactly.          */
/* ------------------------------------------------------------------ */

const termKey = z
  .string()
  .trim()
  .regex(CAPABILITY_KEY_PATTERN, "Use lowercase letters, numbers, dot, dash or underscore.");

function boundedFlatRecord(maxBytes: number) {
  return z
    .record(termKey, z.union([z.string().trim().max(500), z.boolean()]))
    .default({})
    .refine((v) => JSON.stringify(v).length <= maxBytes, `Must stay under ${maxBytes} bytes.`);
}

const limitsSchema = z
  .record(termKey, z.number().int().nonnegative())
  .default({})
  .refine((v) => JSON.stringify(v).length <= 2048, "Must stay under 2048 bytes.");

const dataList = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(DATA_IDENTIFIER_PATTERN, "Use lowercase canonical identifiers."),
  )
  .max(24)
  .default([])
  .transform((list) => [...new Set(list)]);

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date.");

const termsShape = {
  scope: boundedFlatRecord(4096),
  constraints: boundedFlatRecord(4096),
  limits: limitsSchema,
  allowedData: dataList,
  prohibitedData: dataList,
  requesterNote: z.string().trim().max(1000).optional(),
  effectiveFrom: isoDate.nullish(),
  expiresAt: isoDate.nullish(),
};

type TermsInput = {
  scope: Record<string, string | boolean>;
  constraints: Record<string, string | boolean>;
  limits: Record<string, number>;
  allowedData: string[];
  prohibitedData: string[];
  requesterNote?: string | undefined;
  effectiveFrom?: string | null | undefined;
  expiresAt?: string | null | undefined;
};

function termColumns(data: TermsInput) {
  return {
    scope: data.scope,
    constraints: data.constraints,
    limits: data.limits,
    allowed_data: data.allowedData,
    prohibited_data: data.prohibitedData,
    requester_note: data.requesterNote?.length ? data.requesterNote : null,
    effective_from: data.effectiveFrom ?? null,
    expires_at: data.expiresAt ?? null,
  };
}

/** Resolves agent / organization / capability from the verification — never from the client. */
async function resolveVerificationTarget(
  supabase: { from: (t: string) => any },
  verificationId: string,
) {
  const { data } = await supabase
    .from("agent_capability_verifications")
    .select("id, agent_id, organization_id, capability_key, status, expires_at")
    .eq("id", verificationId)
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
  return row;
}

async function myProfileIds(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("digital_profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active");
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/* ------------------------------------------------------------------ */
/* Requester side                                                      */
/* ------------------------------------------------------------------ */

export const createContractDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        verificationId: z.string().uuid(),
        requesterProfileId: z.string().uuid(),
        capabilityRequestId: z.string().uuid().nullish(),
        ...termsShape,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const target = await resolveVerificationTarget(context.supabase as never, data.verificationId);

    // The DB guard revalidates request matching under a lock; this is UX only.
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
    if (error) throw new Error(E_STATE);
    return { ok: true as const };
  });

export const updateContractDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), ...termsShape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_capability_contracts")
      .update(termColumns(data))
      .eq("id", data.id)
      .eq("status", "draft")
      .select("id");
    if (error || !rows?.length) throw new Error(E_STATE);
    return { ok: true as const };
  });

export const proposeContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_capability_contracts")
      .update({ status: "proposed" })
      .eq("id", data.id)
      .eq("status", "draft")
      .select("id");
    if (error || !rows?.length) throw new Error(E_STATE);
    return { ok: true as const };
  });

/** Requester view: full terms, restricted to Digital Selves the caller controls. */
export const listMyContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContractParty[]> => {
    const profileIds = await myProfileIds(context.supabase as never, context.userId);
    if (!profileIds.length) return [];
    const { data: rows, error } = await context.supabase
      .from("agent_capability_contracts")
      .select(PARTY_SELECT)
      .in("requester_digital_profile_id", profileIds)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(E_UNAUTHORIZED);
    return ((rows ?? []) as unknown as RawRow[]).map(toParty);
  });

export const createContractVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        supersedesContractId: z.string().uuid(),
        verificationId: z.string().uuid(),
        ...termsShape,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: parents } = await context.supabase
      .from("agent_capability_contracts")
      .select(
        "id, agent_id, organization_id, capability_key, requester_digital_profile_id, version, status",
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
          status: ContractStatus;
        }
      | undefined;
    if (!parent) throw new Error(E_VERSION);

    const target = await resolveVerificationTarget(context.supabase as never, data.verificationId);
    if (
      target.agent_id !== parent.agent_id ||
      target.organization_id !== parent.organization_id ||
      target.capability_key !== parent.capability_key
    ) {
      throw new Error(E_VERSION);
    }

    // version and chain integrity are re-enforced by the DB guard under a lock.
    const { error } = await context.supabase.from("agent_capability_contracts").insert({
      agent_id: parent.agent_id,
      organization_id: parent.organization_id,
      capability_key: parent.capability_key,
      verification_id: target.id,
      requester_digital_profile_id: parent.requester_digital_profile_id,
      supersedes_contract_id: parent.id,
      version: parent.version + 1,
      ...termColumns(data),
    });
    if (error) throw new Error(E_VERSION);
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ */
/* Agent organization side                                             */
/* ------------------------------------------------------------------ */

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
        const { data: agentRows } = await context.supabase
          .from("agents")
          .select("organization_id")
          .eq("id", data.agentId)
          .limit(1);
        organizationId = (agentRows?.[0] as { organization_id: string } | undefined)
          ?.organization_id;
      }
      if (!organizationId) throw new Error(E_UNAUTHORIZED);

      const { data: membership } = await context.supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (membership as { role?: string } | null)?.role;
      if (!role) throw new Error(E_UNAUTHORIZED);
      const canManage = role === "owner" || role === "admin";

      let builder = context.supabase
        .from("agent_capability_contracts")
        .select(canManage ? PARTY_SELECT : METADATA_SELECT)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (data.agentId) builder = builder.eq("agent_id", data.agentId);

      const { data: rows, error } = await builder;
      if (error) throw new Error(E_UNAUTHORIZED);
      const list = (rows ?? []) as unknown as RawRow[];
      return { canManage, contracts: canManage ? list.map(toParty) : list.map(toMetadata) };
    },
  );

/**
 * Acceptance is a single conditional write. All security conditions (agent
 * active, verification valid, capability still advertised and listed, identity
 * match, still proposed) are enforced inside the database write path — there is
 * no read-then-write decision here.
 */
async function decide(
  supabase: { from: (t: string) => any },
  id: string,
  from: ContractStatus,
  to: ContractStatus,
  decisionNote?: string,
) {
  const { data, error } = await supabase
    .from("agent_capability_contracts")
    .update({ status: to, decision_note: decisionNote?.length ? decisionNote : null })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error || !((data ?? []) as unknown[]).length) throw new Error(E_STATE);
  return { ok: true as const };
}

const decisionInput = (input: unknown) =>
  z
    .object({
      id: z.string().uuid(),
      decisionNote: z.string().trim().max(1000).optional(),
    })
    .parse(input);

export const acceptContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(decisionInput)
  .handler(({ data, context }) =>
    decide(context.supabase as never, data.id, "proposed", "accepted", data.decisionNote),
  );

export const rejectContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(decisionInput)
  .handler(({ data, context }) =>
    decide(context.supabase as never, data.id, "proposed", "rejected", data.decisionNote),
  );

/**
 * Revocation of an accepted contract. The locked RLS model allows this for the
 * agent-organization owner/admin only; the requester has no revoke policy and
 * RLS is NOT widened here for UI convenience.
 */
export const revokeContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(decisionInput)
  .handler(({ data, context }) =>
    decide(context.supabase as never, data.id, "accepted", "revoked", data.decisionNote),
  );

export { E_NOT_ADMIN as CONTRACT_NOT_ADMIN_MESSAGE };
