import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { AgentStatusBadge } from "@/components/agent-status-badge";
import { AgentDiscoverySection } from "@/components/agent-discovery-section";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AGENT_STATUSES, getAgent, setAgentStatus } from "@/lib/agents.functions";

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  head: () => ({
    meta: [
      { title: "Agent Identity — LOGOS Platform" },
      {
        name: "description",
        content:
          "Agent identity record: kind, purpose, lifecycle status, who registered it, and the authority explicitly granted to it by a Digital Self you control.",
      },
      { property: "og:title", content: "Agent Identity — LOGOS Platform" },
      {
        property: "og:description",
        content: "Identity and explicitly granted authority for a single registered agent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: AgentDetailPage,
});

const KIND_LABEL: Record<string, string> = {
  personal: "Personal",
  organization: "Organization",
  service: "Service",
  specialized: "Specialized",
};

const CAPABILITY_LABEL: Record<string, string> = {
  read_profile: "Read profile",
  read_preference: "Read preferences",
  read_goal: "Read goals",
  read_memory: "Read memory",
  create_intent: "Create intent",
  request_capability: "Request capability",
  request_quote: "Request quote",
  request_action: "Request action",
};

function AgentDetailPage() {
  const { agentId } = Route.useParams();
  const fetchAgent = useServerFn(getAgent);
  const changeStatus = useServerFn(setAgentStatus);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => fetchAgent({ data: { agentId } }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: (typeof AGENT_STATUSES)[number]) =>
      changeStatus({ data: { agentId, status } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  return (
    <AppShell
      title={data?.agent.name ?? "Agent"}
      description={data?.agent.organization_name ?? "Agent identity"}
    >
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/agents">
            <ArrowLeft className="size-4" /> Back to registry
          </Link>
        </Button>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading agent…
          </div>
        )}
        {isError && (
          <p className="py-8 text-sm text-destructive">
            {(error as Error)?.message ?? "Could not load this agent."}
          </p>
        )}

        {data && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  Identity
                  <AgentStatusBadge status={data.agent.status} />
                  <Badge variant="outline">{KIND_LABEL[data.agent.kind] ?? data.agent.kind}</Badge>
                </CardTitle>
                <CardDescription>
                  An agent is not a person, not a Digital Self, and not an owner.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {data.agent.description || "No purpose recorded."}
                </p>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["Organization", data.agent.organization_name],
                    [
                      "Registered by",
                      data.agent.created_by_name ?? (data.agent.created_by ? "Member" : "—"),
                    ],
                    ["Created", new Date(data.agent.created_at).toLocaleString()],
                    ["Last updated", new Date(data.agent.updated_at).toLocaleString()],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border bg-secondary/40 p-4">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The registering member is recorded for accountability only — registration grants no
                  authority over any Digital Self.
                </p>
                {data.canManage && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                    <span className="text-sm font-medium">Lifecycle</span>
                    <Select
                      value={data.agent.status}
                      onValueChange={(v) =>
                        statusMutation.mutate(v as (typeof AGENT_STATUSES)[number])
                      }
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AGENT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">
                            {s}
                          </SelectItem>
                        ))}
                        {data.agent.status === "inactive" && (
                          <SelectItem value="inactive">inactive (legacy)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {statusMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                    {statusMutation.isError && (
                      <span className="text-sm text-destructive">
                        {(statusMutation.error as Error).message}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4" /> Authority granted to this agent
                </CardTitle>
                <CardDescription>
                  Only grants issued by a Digital Self you control are shown. No profile, preference,
                  goal or memory content is exposed here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.authority.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    This agent holds no authority from any Digital Self you control.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {data.authority.map((grant) => (
                      <li
                        key={grant.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {CAPABILITY_LABEL[grant.capability] ?? grant.capability}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Granted by {grant.digital_profile_name}
                            {grant.expires_at
                              ? ` · expires ${new Date(grant.expires_at).toLocaleString()}`
                              : " · no expiry"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {grant.status}
                          </Badge>
                          <Badge variant={grant.effective ? "default" : "secondary"}>
                            {grant.effective ? "Effective" : "Not effective"}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <AgentDiscoverySection
              agentId={data.agent.id}
              organizationId={data.agent.organization_id}
              agentName={data.agent.name}
              canManage={data.canManage}
            />



            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity log</CardTitle>
                <CardDescription>
                  Append-only registry and authority events for this agent.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.audit.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No recorded events yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {data.audit.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="font-mono text-xs">{entry.event}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
