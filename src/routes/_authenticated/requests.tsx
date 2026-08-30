import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, Loader2, Radar } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { RequestPriorityBadge, RequestStatusBadge } from "@/components/request-status-badge";
import {
  AlertDialog,
  AlertDialogAction,
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
import {
  cancelCapabilityRequest,
  listMyCapabilityRequests,
  type CapabilityRequestRow,
} from "@/lib/capability-requests.functions";

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({
    meta: [
      { title: "My Capability Requests — LOGOS Platform" },
      {
        name: "description",
        content:
          "Capability requests your Digital Self has sent to discovered agents. A request is not authority, and approval does not execute anything.",
      },
      { property: "og:title", content: "My Capability Requests — LOGOS Platform" },
      {
        property: "og:description",
        content: "Track pending, approved, rejected and cancelled capability requests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: MyRequestsPage,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function RequestCard({ row }: { row: CapabilityRequestRow }) {
  const cancel = useServerFn(cancelCapabilityRequest);
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: () => cancel({ data: { id: row.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-capability-requests"] });
    },
  });

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
        {row.target_agent_label ?? "Agent (no longer listed)"}
        {row.target_organization_name ? ` · ${row.target_organization_name}` : ""}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Created {formatDate(row.created_at)} · Updated {formatDate(row.updated_at)}
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-10">
                Cancel request
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this capability request?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cancelling withdraws the request from review. It cannot be reopened.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Keep request</AlertDialogCancel>
                <AlertDialogAction
                  className="h-11"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Cancel request
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {cancelMutation.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {(cancelMutation.error as Error).message}
        </p>
      )}

      {expanded && (
        <dl className="mt-3 grid gap-2 border-t border-border pt-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Reference</dt>
            <dd className="font-mono text-xs">{row.request_id}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Decision date</dt>
            <dd>{formatDate(row.decided_at)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Your note</dt>
            <dd>{row.requester_note ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Reviewer note</dt>
            <dd>{row.reviewer_note ?? "—"}</dd>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
            An approved request records a review decision only. It grants no authority over your
            Digital Self and executes nothing.
          </p>
        </dl>
      )}
    </li>
  );
}

function MyRequestsPage() {
  const fetchRequests = useServerFn(listMyCapabilityRequests);
  const query = useQuery({
    queryKey: ["my-capability-requests"],
    queryFn: () => fetchRequests({ data: {} }),
  });

  const rows = query.data ?? [];

  return (
    <AppShell
      title="My Requests"
      description="Capability requests sent by the Digital Selves you control."
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="size-4" /> Capability requests
          </CardTitle>
          <CardDescription>
            A request is not authority. Approval is a review decision only — it does not grant access
            to your Digital Self and does not execute anything.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading your requests…
            </div>
          )}
          {query.isError && (
            <p role="alert" className="py-6 text-sm text-destructive">
              {(query.error as Error).message}
            </p>
          )}
          {!query.isLoading && !query.isError && rows.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No capability requests yet.</p>
              <Button asChild variant="outline" size="sm" className="mt-3 h-10">
                <Link to="/discovery">
                  <Radar className="size-4" /> Find an agent in Discovery
                </Link>
              </Button>
            </div>
          )}
          {rows.length > 0 && (
            <ul className="space-y-3">
              {rows.map((row) => (
                <RequestCard key={row.id} row={row} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
