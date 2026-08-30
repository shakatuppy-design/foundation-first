import { Badge } from "@/components/ui/badge";
import { VERIFICATION_STATUS_LABEL, type VerificationStatus } from "@/lib/capability-trust";

/**
 * Never says "Verified", "Trusted" or "Certified". A self-attestation is an
 * organization's own claim and nothing more.
 */
export function AttestationStatusBadge({
  status,
  isCurrentlyValid,
}: {
  status: VerificationStatus;
  isCurrentlyValid: boolean;
}) {
  const variant =
    status === "verified" && isCurrentlyValid
      ? "default"
      : status === "pending"
        ? "secondary"
        : "outline";

  return (
    <Badge variant={variant}>
      {status === "verified" && !isCurrentlyValid
        ? "Self-attestation no longer valid"
        : VERIFICATION_STATUS_LABEL[status]}
    </Badge>
  );
}
