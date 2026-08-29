import { Badge } from "@/components/ui/badge";

const VARIANT: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  active: { label: "Active", variant: "default" },
  suspended: { label: "Suspended", variant: "secondary" },
  revoked: { label: "Revoked", variant: "destructive" },
  archived: { label: "Archived", variant: "outline" },
  inactive: { label: "Inactive (legacy)", variant: "outline" },
};

export function AgentStatusBadge({ status }: { status: string }) {
  const meta = VARIANT[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
