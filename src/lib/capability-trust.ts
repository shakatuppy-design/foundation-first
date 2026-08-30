/**
 * Shared, non-executable vocabulary for the capability trust layers.
 *
 * ADVERTISED  → what an agent organization claims in its discovery card.
 * SELF-ATTESTED → a formal organization self-attestation (this layer).
 * CONTRACTED  → bilateral declarative terms agreed by both parties.
 * AUTHORIZED  → Digital Self authority (digital_authority_rules) ONLY.
 *
 * None of these layers creates any of the others. Nothing here is a permission,
 * an instruction, or an execution surface.
 */

/** The ONLY approved trust label for a self-attestation. Never soften this. */
export const SELF_ATTESTATION_LABEL =
  "Self-attested by the agent organization — independently unverified";

/** Mirrors the database constraint exactly. */
export const CAPABILITY_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,59}$/;

/** Mirrors the database constraint for canonical data identifiers. */
export const DATA_IDENTIFIER_PATTERN = CAPABILITY_KEY_PATTERN;

/** Evidence is bounded descriptive metadata — never proof, never fetched. */
export const EVIDENCE_KEYS = ["method_description", "internal_reference", "reviewed_scope"] as const;

export const VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
  "revoked",
  "expired",
] as const;

export const CONTRACT_STATUSES = [
  "draft",
  "proposed",
  "accepted",
  "rejected",
  "revoked",
  "expired",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Human labels that never imply independent verification or trust. */
export const VERIFICATION_STATUS_LABEL: Record<VerificationStatus, string> = {
  pending: "Attestation pending review",
  verified: "Self-attested",
  rejected: "Attestation rejected",
  revoked: "Attestation revoked",
  expired: "Attestation expired",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Draft",
  proposed: "Awaiting agent organization",
  accepted: "Accepted",
  rejected: "Rejected",
  revoked: "Revoked",
  expired: "Expired",
};
