import { Badge } from "@/components/ui/badge";
import type { RequestPriority, RequestStatus } from "@/lib/capability-requests.functions";

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const className =
    status === "approved"
      ? "border-transparent bg-primary/15 text-primary"
      : status === "rejected"
        ? "border-transparent bg-destructive/15 text-destructive"
        : status === "cancelled"
          ? "border-transparent bg-muted text-muted-foreground"
          : "border-transparent bg-secondary text-secondary-foreground";

  return (
    <Badge variant="outline" className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function RequestPriorityBadge({ priority }: { priority: RequestPriority }) {
  return (
    <Badge variant="outline" className="capitalize">
      {priority}
    </Badge>
  );
}
