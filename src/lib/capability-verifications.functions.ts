import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CAPABILITY_KEY_PATTERN,
  EVIDENCE_KEYS,
  type VerificationStatus,
} from "@/lib/capability-trust";

/**
 * SELF-ATTESTATION IS NOT VERIFICATION BY ANYONE ELSE, AND NOT AUTHORITY.
 *
 * Advertised ≠ self-attested ≠ contracted ≠ authorized.
 * Nothing here writes digital_authority_rules, agent_permissions, messaging,
 * matching or any execution surface. Every function runs AS THE CALLER through
 * `context.supabase`; the database (RLS + guard triggers) remains the
 * authorization boundary. Server-derived fields (identity, method, status,
 * verifier, timestamps) are never accepted from a client.
 */

const E_UNAUTHORIZED = "You don't have access to this.";
const E_NOT_ADMIN = "Only organization owners and admins can do this.";
const E_CAPABILITY = "This capability is not currently available for attestation.";
const E_VERIFICATION = "A valid self-attestation is required for this capability.";

/** Discovery/requester-safe projection. No verifier, evidence or private notes. */
export type VerificationSafe = {
  verification_id: string;
  capability_key: string;
  verification_method: string;
  status: VerificationStatus;
  expires_at: string | null;
  verified_at: string | null;
  is_currently_valid: boolean;
};

/** Organization member projection: lifecycle metadata only. */
export type VerificationMember = VerificationSafe & {
  id: string;
  created_at: string;
  updated_at: string;
};

/** Owner/admin projection. Still never exposes `verified_by`. */
export type VerificationOwner = VerificationMember & {
  attestation_note: string | null;
  decision_note: string | null;
  evidence: Record<string, string>;
};

const SAFE_SELECT =
  "id, verification_id, capability_key, verification_method, status, expires_at, verified_at, created_at, updated_at";
const OWNER_SELECT = `${SAFE_SELECT}, attestation_note, decision_note, evidence`;

type RawRow = {
  id: string;
  verification_id: string;
  capability_key: string;
  verification_method: string;
  status: VerificationStatus;
  expires_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  attestation_note?: string | null;
  decision_note?: string | null;
  evidence?: unknown;
};

/** Derived server-side ONLY. `status = 'verified'` alone is never sufficient. */
export function isVerificationCurrentlyValid(row: {
  status: VerificationStatus;
  expires_at: string | null;
}): boolean {
  if (row.status !== "verified") return false;
  return row.expires_at === null || new Date(row.expires_at).getTime() > Date.now();
}

function toMember(row: RawRow): VerificationMember {
  return {
    id: row.id,
    verification_id: row.verification_id,
    capability_key: row.capability_key,
    verification_method: row.verification_method,
    status: row.status,
    expires_at: row.expires_at,
    verified_at: row.verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_currently_valid: isVerificationCurrentlyValid(row),
  };
}

function toOwner(row: RawRow): VerificationOwner {
  const evidence: Record<string, string> = {};
  const raw = row.evidence;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") evidence[k] = v;
    }
  }
  return {
    ...toMember(row),
    attestation_note: row.attestation_note ?? null,
    decision_note: row.decision_note ?? null,
    evidence,
  };
}

const capabilityKey = z
  .string()
  .trim()
  .toLowerCase()
  .regex(CAPABILITY_KEY_PATTERN, "Use lowercase letters, numbers, dot, dash or underscore.");

/** Flat, bounded, allowlisted descriptive metadata. Never proof, never fetched. */
const evidenceSchema = z
  .object({
    method_description: z.string().trim().max(500).optional(),
    internal_reference: z.string().trim().max(500).optional(),
    reviewed_scope: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (value) => JSON.stringify(value).length <= 2048,
    "Evidence metadata must stay under 2KB.",
  );

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date.");

function pruneEvidence(input: Record<string, string | undefined> | undefined) {
  const out: Record<string, string> = {};
  for (const key of EVIDENCE_KEYS) {
    const value = input?.[key];
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

async function requireOrgManager(
  supabase: { from: (t: string) => any },
  userId: string,
  organizationId: string,
): Promise<void> {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "admin") throw new Error(E_NOT_ADMIN);
}

/**
 * Records a pending organization self-attestation. The organization is resolved
 * from the agent under the caller's own RLS — never supplied by the client.
 */
export const createVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        capabilityKey: capabilityKey,
        attestationNote: z.string().trim().max(1000).optional(),
        evidence: evidenceSchema.optional(),
        expiresAt: isoDate.nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: agentRows, error: agentError } = await context.supabase
      .from("agents")
      .select("id, organization_id, status")
      .eq("id", data.agentId)
      .limit(1);
    if (agentError) throw new Error(E_UNAUTHORIZED);
    const agent = agentRows?.[0] as
      | { id: string; organization_id: string; status: string }
      | undefined;
    if (!agent) throw new Error(E_UNAUTHORIZED);
    if (agent.status !== "active") throw new Error(E_CAPABILITY);

    await requireOrgManager(context.supabase as never, context.userId, agent.organization_id);

    // The database re-validates role, eligibility, advertised capability, and
    // derives verification_id / method / status / timestamps itself.
    const { error } = await context.supabase.from("agent_capability_verifications").insert({
      agent_id: agent.id,
      organization_id: agent.organization_id,
      capability_key: data.capabilityKey,
      attestation_note: data.attestationNote?.length ? data.attestationNote : null,
      evidence: pruneEvidence(data.evidence),
      expires_at: data.expiresAt ?? null,
    });
    if (error) throw new Error(E_CAPABILITY);
    return { ok: true as const };
  });

/** Role-appropriate list for one agent. Members never see evidence or notes. */
export const listOrgVerifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ agentId: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      canManage: boolean;
      verifications: (VerificationMember | VerificationOwner)[];
    }> => {
      const { data: agentRows } = await context.supabase
        .from("agents")
        .select("id, organization_id")
        .eq("id", data.agentId)
        .limit(1);
      const agent = agentRows?.[0] as { organization_id: string } | undefined;
      if (!agent) throw new Error(E_UNAUTHORIZED);

      const { data: membership } = await context.supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", agent.organization_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (membership as { role?: string } | null)?.role;
      const canManage = role === "owner" || role === "admin";

      const { data: rows, error } = await context.supabase
        .from("agent_capability_verifications")
        .select(canManage ? OWNER_SELECT : SAFE_SELECT)
        .eq("agent_id", data.agentId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(E_UNAUTHORIZED);

      const list = (rows ?? []) as unknown as RawRow[];
      return {
        canManage,
        verifications: canManage ? list.map(toOwner) : list.map(toMember),
      };
    },
  );

/**
 * Requester-facing status, resolved only through the public discovery surface.
 * Returns discovery-safe fields exclusively.
 */
export const getPublicVerificationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        discoveryId: z.string().trim().min(3).max(80),
        capabilityKey: capabilityKey,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<VerificationSafe | null> => {
    const { data: cards } = await context.supabase
      .from("agent_discovery_profiles")
      .select("agent_id, organization_id, capabilities, status")
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
      .select(SAFE_SELECT)
      .eq("agent_id", card.agent_id)
      .eq("organization_id", card.organization_id)
      .eq("capability_key", data.capabilityKey)
      .order("created_at", { ascending: false })
      .limit(10);

    const list = (rows ?? []) as unknown as RawRow[];
    if (!list.length) return null;
    const chosen = list.find((r) => isVerificationCurrentlyValid(r)) ?? list[0]!;
    const member = toMember(chosen);
    return {
      verification_id: member.verification_id,
      capability_key: member.capability_key,
      verification_method: member.verification_method,
      status: member.status,
      expires_at: member.expires_at,
      verified_at: member.verified_at,
      is_currently_valid: member.is_currently_valid,
    };
  });

/** Owner/admin decision. The status guard and verifier identity live in the DB. */
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
  .handler(async ({ data, context }) => {
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
    return { ok: true as const };
  });

/** Only a currently verified row may be revoked. Revocation is terminal. */
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
  .handler(async ({ data, context }) => {
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
    return { ok: true as const };
  });
