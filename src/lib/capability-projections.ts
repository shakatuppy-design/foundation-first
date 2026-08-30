import type { ContractStatus, VerificationStatus } from "@/lib/capability-trust";

/**
 * Explicit safe projections for the capability self-attestation and contract
 * layers. Raw Supabase rows never reach components. `verified_by` is never
 * selected or exposed to application consumers.
 */

/* ---------------------------- error messages ---------------------------- */

export const E_UNAUTHORIZED = "You don't have access to this.";
export const E_NOT_ADMIN = "Only organization owners and admins can do this.";
export const E_CAPABILITY = "This capability is not currently available for attestation.";
export const E_VERIFICATION = "A valid self-attestation is required for this capability.";
export const E_CONTRACT_STATE = "This contract is no longer in a state that allows this action.";
export const E_VERSION = "This version could not be created from the selected contract.";

/* ---------------------------- verifications ----------------------------- */

export const VERIFICATION_SAFE_SELECT =
  "id, verification_id, capability_key, verification_method, status, expires_at, verified_at, created_at, updated_at";
export const VERIFICATION_OWNER_SELECT = `${VERIFICATION_SAFE_SELECT}, attestation_note, decision_note, evidence`;

export type VerificationSafe = {
  verification_id: string;
  capability_key: string;
  verification_method: string;
  status: VerificationStatus;
  expires_at: string | null;
  verified_at: string | null;
  is_currently_valid: boolean;
};

export type VerificationMember = VerificationSafe & {
  id: string;
  created_at: string;
  updated_at: string;
};

export type VerificationOwner = VerificationMember & {
  attestation_note: string | null;
  decision_note: string | null;
  evidence: Record<string, string>;
};

export type RawVerificationRow = {
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

export function toVerificationMember(row: RawVerificationRow): VerificationMember {
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

export function toVerificationOwner(row: RawVerificationRow): VerificationOwner {
  const evidence: Record<string, string> = {};
  const raw = row.evidence;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") evidence[k] = v;
    }
  }
  return {
    ...toVerificationMember(row),
    attestation_note: row.attestation_note ?? null,
    decision_note: row.decision_note ?? null,
    evidence,
  };
}

export function toVerificationSafe(row: RawVerificationRow): VerificationSafe {
  const m = toVerificationMember(row);
  return {
    verification_id: m.verification_id,
    capability_key: m.capability_key,
    verification_method: m.verification_method,
    status: m.status,
    expires_at: m.expires_at,
    verified_at: m.verified_at,
    is_currently_valid: m.is_currently_valid,
  };
}

/* ------------------------------ contracts ------------------------------- */

export const CONTRACT_METADATA_SELECT =
  "id, contract_id, capability_key, status, version, effective_from, expires_at, created_at, updated_at, proposed_at, accepted_at, rejected_at, revoked_at, expired_at, supersedes_contract_id, verification_id, agents!acc_agent_fkey(name, status), agent_capability_verifications!acc_verification_fkey(status, expires_at)";
export const CONTRACT_PARTY_SELECT = `${CONTRACT_METADATA_SELECT}, scope, constraints, limits, allowed_data, prohibited_data, requester_note`;

export type ContractMetadata = {
  id: string;
  contract_id: string;
  capability_key: string;
  status: ContractStatus;
  version: number;
  verification_id: string;
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
  agent_name: string | null;
  is_effective: boolean;
};

export type ContractParty = ContractMetadata & {
  scope: Record<string, string | boolean>;
  constraints: Record<string, string | boolean>;
  limits: Record<string, number>;
  allowed_data: string[];
  prohibited_data: string[];
  requester_note: string | null;
};

export type RawContractRow = {
  id: string;
  contract_id: string;
  capability_key: string;
  status: ContractStatus;
  version: number;
  verification_id: string;
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
 * Derived server-side ONLY and never stored. `status = 'accepted'` alone is
 * never sufficient: the time window, the self-attestation and the agent
 * lifecycle must all still hold.
 */
export function deriveContractEffective(row: RawContractRow): boolean {
  if (row.status !== "accepted") return false;
  const now = Date.now();
  if (row.effective_from && new Date(row.effective_from).getTime() > now) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false;
  if (row.agents?.status !== "active") return false;
  const verification = row.agent_capability_verifications;
  if (!verification) return false;
  return isVerificationCurrentlyValid(verification);
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

export function toContractMetadata(row: RawContractRow): ContractMetadata {
  return {
    id: row.id,
    contract_id: row.contract_id,
    capability_key: row.capability_key,
    status: row.status,
    version: row.version,
    verification_id: row.verification_id,
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
    is_effective: deriveContractEffective(row),
  };
}

export function toContractParty(row: RawContractRow): ContractParty {
  return {
    ...toContractMetadata(row),
    scope: flatRecord(row.scope),
    constraints: flatRecord(row.constraints),
    limits: numberRecord(row.limits),
    allowed_data: row.allowed_data ?? [],
    prohibited_data: row.prohibited_data ?? [],
    requester_note: row.requester_note ?? null,
  };
}
