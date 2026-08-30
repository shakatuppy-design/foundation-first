import { z } from "zod";
import {
  CAPABILITY_KEY_PATTERN,
  DATA_IDENTIFIER_PATTERN,
  EVIDENCE_KEYS,
} from "@/lib/capability-trust";

/**
 * Zod schemas mirroring the database constraints for the capability
 * self-attestation and contract layers. Terms are declarative data only: they
 * are never executed, evaluated, interpolated or treated as permissions.
 */

export const capabilityKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(CAPABILITY_KEY_PATTERN, "Use lowercase letters, numbers, dot, dash or underscore.");

export const isoDateSchema = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date.");

/** Flat, allowlisted, ≤2KB descriptive metadata. Never proof, never fetched. */
export const evidenceSchema = z
  .object({
    method_description: z.string().trim().max(500).optional(),
    internal_reference: z.string().trim().max(500).optional(),
    reviewed_scope: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((v) => JSON.stringify(v).length <= 2048, "Evidence metadata must stay under 2KB.");

export type EvidenceInput = z.infer<typeof evidenceSchema>;

export function pruneEvidence(input: EvidenceInput | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of EVIDENCE_KEYS) {
    const value = input?.[key];
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

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

/** Canonical formatting only — 3D deliberately defines no semantic vocabulary. */
const dataListSchema = z
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

export const contractTermsShape = {
  scope: boundedFlatRecord(4096),
  constraints: boundedFlatRecord(4096),
  limits: limitsSchema,
  allowedData: dataListSchema,
  prohibitedData: dataListSchema,
  requesterNote: z.string().trim().max(1000).optional(),
  effectiveFrom: isoDateSchema.nullish(),
  expiresAt: isoDateSchema.nullish(),
};

export type ContractTermsInput = {
  scope: Record<string, string | boolean>;
  constraints: Record<string, string | boolean>;
  limits: Record<string, number>;
  allowedData: string[];
  prohibitedData: string[];
  requesterNote?: string | undefined;
  effectiveFrom?: string | null | undefined;
  expiresAt?: string | null | undefined;
};

export function termColumns(data: ContractTermsInput) {
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
