import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldQuestion } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { RequestPriorityBadge, RequestStatusBadge } from "@/components/request-status-badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizations } from "@/lib/org-context";
import {
  REQUEST_STATUSES,
  decideCapabilityRequest,
  listReviewCapabilityRequests,
  type CapabilityRequestRow,
  type RequestStatus,
} from "@/lib/capability-requests.functions";

export const Route = createFileRoute("/_authenticated/review-requests")({
  head: () => ({
    meta: [
      { title: "Review Capability Requests — LOGOS Platform" },
      {
        name: "description",
        content:
          "Review capability requests addressed to your organization's agents. Approval records a review decision only and never grants Digital Self authority.",
      },
      { property: "og:title", content: "Review Capability Requests — LOGOS Platform" },
      {
        property: "og:description",
        content: "Approve or reject pending capability requests for your organization's agents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: ReviewRequestsPage,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function DecisionDialog({
  row,
  decision,
  label,
}: {
  row: CapabilityRequestRow;
  decision: "approved" | "rejected";
  label: string;
}) {
  const decide = useServerFn(decideCapabilityRequest);
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      decide({
        data: { id: row.id, decision, ...(note.trim() ? { reviewerNote: note.trim() } : {}) },
      }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["review-capability-requests"] });
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant={decision === "approved" ? "default" : "outline"}
          size="sm"
          className="h-10"
        >
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {decision === "approved"
              ? "Approve this capability request?"
              : "Reject this capability request?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {decision === "approved"
              ? "Approval records your decision only. It does not grant authority or execute the agent."
              : "Rejection records your decision only. The request becomes final and cannot be reopened."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`note-${row.id}-${decision}`}>Reviewer note (optional)</Label>
          <Textarea
            id={`note-${row.id}-${decision}`}
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Do not enter passwords, API keys, tokens, private credentials, or sensitive information.
          </p>
        </div>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {(mutation.error as Error).message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Back</AlertDialogCancel>
          <Button
            className="h-11"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            variant={decision === "approved" ? "default" : "destructive"}
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReviewCard({ row }: { row: CapabilityRequestRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{row.requested_capability}</p>
        <div className="flex flex-wrap items-center gap-2">
          <RequestPriorityBadge priority={row.priority} />
          <RequestStatusBadge status={row.status} />
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        From {row.requester_display_name ?? "a Digital Self (not disclosed)"} → {" "}
        {row.target_agent_label ?? "your agent"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Created {formatDate(row.created_at)}
        {row.decided_at ? ` · Decided ${formatDate(row.decided_at)}` : ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-10"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide details" : "View details"}
        </Button>
        {row.status === "pending" && (
          <>
            <DecisionDialog row={row} decision="approved" label="Approve" />
            <DecisionDialog row={row} decision="rejected" label="Reject" />
          </>
        )}
      </div>

      {expanded && (
        <dl className="mt-3 grid gap-2 border-t border-border pt-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Reference</dt>
            <dd className="font-mono text-xs">{row.request_id}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Organization</dt>
            <dd>{row.target_organization_name ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Requester note</dt>
            <dd>{row.requester_note ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Request context — purpose</dt>
            <dd>{row.context_purpose ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Reviewer note</dt>
            <dd>{row.reviewer_note ?? "—"}</dd>
          </div>
          <div className="space-y-1 rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground sm:col-span-2">
            <p>Advertised capability is not equivalent to verified capability.</p>
            <p>Approval does not grant Digital Self authority to the agent.</p>
          </div>
        </dl>
      )}
    </li>
  );
}

function ReviewRequestsPage() {
  const { activeOrg } = useOrganizations();
  const fetchRequests = useServerFn(listReviewCapabilityRequests);
  const [status, setStatus] = useState<RequestStatus>("pending");

  const query = useQuery({
    queryKey: ["review-capability-requests", activeOrg?.id ?? null, status],
    queryFn: () =>
      fetchRequests({
        data: { status, ...(activeOrg ? { organizationId: activeOrg.id } : {}) },
      }),
  });

  const rows = query.data ?? [];

  return (
    <AppShell
      title="Capability Requests"
      description="Requests addressed to agents in your organization."
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldQuestion className="size-4" /> Review inbox
          </CardTitle>
          <CardDescription>
            Visibility and decisions are enforced by database policies, not this interface. Approval
            records a review decision only — it grants no authority and executes nothing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter requests by status"
          >
            {REQUEST_STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                className="h-10 capitalize"
                variant={status === s ? "secondary" : "ghost"}
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
              >
                {s}
              </Button>
            ))}
          </div>

          {query.isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading requests…
            </div>
          )}
          {query.isError && (
            <p role="alert" className="py-6 text-sm text-destructive">
              {(query.error as Error).message}
            </p>
          )}
          {!query.isLoading && !query.isError && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {status === "pending"
                ? "No pending capability requests."
                : `No ${status} capability requests.`}
            </p>
          )}
          {rows.length > 0 && (
            <ul className="space-y-3">
              {rows.map((row) => (
                <ReviewCard key={row.id} row={row} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
