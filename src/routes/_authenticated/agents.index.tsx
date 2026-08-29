import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Network, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { useOrganizations } from "@/lib/org-context";
import { AgentStatusBadge } from "@/components/agent-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_KINDS, listAgents, registerAgent, type AgentKind } from "@/lib/agents.functions";

export const Route = createFileRoute("/_authenticated/agents/")({
  head: () => ({
    meta: [
      { title: "Agent Registry — LOGOS Platform" },
      {
        name: "description",
        content:
          "Formal registry of agent identities in your organization: who an agent is, who registered it, its kind, purpose and lifecycle status. Registry is not authority.",
      },
      { property: "og:title", content: "Agent Registry — LOGOS Platform" },
      {
        property: "og:description",
        content: "Agent identity and lifecycle registry, isolated per organization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: AgentRegistryPage,
});

const KIND_LABEL: Record<string, string> = {
  personal: "Personal",
  organization: "Organization",
  service: "Service",
  specialized: "Specialized",
};

function AgentRegistryPage() {
  const { activeOrg } = useOrganizations();
  const fetchAgents = useServerFn(listAgents);
  const create = useServerFn(registerAgent);
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<AgentKind>("service");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const orgId = activeOrg?.id ?? null;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["agents", orgId],
    queryFn: () => fetchAgents({ data: { organizationId: orgId! } }),
    enabled: Boolean(orgId),
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      create({ data: { organizationId: orgId!, name, kind, description, status: "active" } }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["agents", orgId] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  return (
    <AppShell title="Agent Registry" description={activeOrg?.name ?? "No active organization"}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                <Network className="size-5 text-foreground" />
              </span>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Identity registry
                  <Badge variant="outline">Registry only</Badge>
                </CardTitle>
                <CardDescription>
                  An agent listed here has no authority. Authority is granted only by a Digital Self
                  through an explicit authority rule, and nothing executes in this session.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {!orgId && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Select or create an organization to view its agent registry.
            </CardContent>
          </Card>
        )}

        {orgId && data?.canManage && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Register an agent</CardTitle>
              <CardDescription>
                You are recorded as the creator. Creating an agent grants you no authority over any
                Digital Self.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Name</Label>
                  <Input
                    id="agent-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Procurement Scout"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-kind">Kind</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as AgentKind)}>
                    <SelectTrigger id="agent-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENT_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-description">Purpose</Label>
                <Textarea
                  id="agent-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this agent for?"
                  rows={3}
                />
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button
                onClick={() => registerMutation.mutate()}
                disabled={!name.trim() || registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Register agent
              </Button>
            </CardContent>
          </Card>
        )}

        {orgId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agents</CardTitle>
              <CardDescription>Scoped to this organization only.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading registry…
                </div>
              )}
              {isError && (
                <p className="py-8 text-sm text-destructive">
                  {(error as Error)?.message ?? "Could not load agents."}
                </p>
              )}
              {!isLoading && !isError && data?.agents.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No agents registered yet.
                </p>
              )}
              {!isLoading && !isError && (data?.agents.length ?? 0) > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Kind</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead>Created by</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.agents.map((agent) => (
                        <TableRow key={agent.id}>
                          <TableCell className="font-medium">
                            <Link
                              to="/agents/$agentId"
                              params={{ agentId: agent.id }}
                              className="underline-offset-4 hover:underline"
                            >
                              {agent.name}
                            </Link>
                          </TableCell>
                          <TableCell className="capitalize">
                            {KIND_LABEL[agent.kind] ?? agent.kind}
                          </TableCell>
                          <TableCell>
                            <AgentStatusBadge status={agent.status} />
                          </TableCell>
                          <TableCell>{agent.organization_name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {agent.created_by_name ?? (agent.created_by ? "Member" : "—")}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(agent.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
