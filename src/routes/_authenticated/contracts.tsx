import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CapabilityTrustLegend } from "@/components/capability-trust-legend";
import { CONTRACT_STATUS_LABEL } from "@/lib/capability-trust";
import { useOrganizations } from "@/lib/org-context";
import {
  acceptContract,
  listMyContracts,
  listOrgContracts,
  proposeContract,
  rejectContract,
  revokeContract,
} from "@/lib/capability-contracts.functions";
import type { ContractMetadata, ContractParty } from "@/lib/capability-projections";

export const Route = createFileRoute("/_authenticated/contracts")({
  head: () => ({
    meta: [
      { title: "Capability Contracts — LOGOS Platform" },
      {
        name: "description",
        content:
          "Draft, propose and review declarative capability contracts between a Digital Self and an agent organization. Contracts are terms only — never authority or execution.",
      },
      { property: "og:title", content: "Capability Contracts — LOGOS Platform" },
      {
        property: "og:description",
        content: "Bilateral declarative capability terms. A contract grants no authority.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: ContractsPage,
});

function terms(contract: ContractMetadata | ContractParty) {
  return "scope" in contract ? (contract as ContractParty) : null;
}

function ContractCard({
  contract,
  actions,
}: {
  contract: ContractMetadata | ContractParty;
  actions?: React.ReactNode;
}) {
  const party = terms(contract);
  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            {contract.agent_name ?? "Agent"} · <span className="font-mono">{contract.capability_key}</span>
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {contract.contract_id} · v{contract.version}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{CONTRACT_STATUS_LABEL[contract.status]}</Badge>
          <Badge variant={contract.is_effective ? "default" : "secondary"}>
            {contract.is_effective ? "In force" : "Not in force"}
          </Badge>
        </div>
      </div>

      {party && (
        <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          {[
            ["Scope", Object.entries(party.scope).map(([k, v]) => `${k} = ${v}`)],
            ["Constraints", Object.entries(party.constraints).map(([k, v]) => `${k} = ${v}`)],
            ["Limits", Object.entries(party.limits).map(([k, v]) => `${k} = ${v}`)],
            ["Allowed data", party.allowed_data],
            ["Prohibited data", party.prohibited_data],
          ].map(([label, values]) => (
            <div key={label as string}>
              <dt className="font-medium text-foreground">{label as string}</dt>
              <dd>{(values as string[]).length ? (values as string[]).join(", ") : "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      {party?.requester_note && (
        <p className="mt-2 text-xs text-muted-foreground">Note: {party.requester_note}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {contract.effective_from
          ? `Effective from ${new Date(contract.effective_from).toLocaleString()}`
          : "No start date"}
        {contract.expires_at ? ` · expires ${new Date(contract.expires_at).toLocaleString()}` : ""}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Declarative terms only — nothing here is executed and no authority is granted.
      </p>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </li>
  );
}

function RequesterContracts() {
  const fetchMine = useServerFn(listMyContracts);
  const propose = useServerFn(proposeContract);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["my-contracts"],
    queryFn: () => fetchMine(),
  });

  const proposeMutation = useMutation({
    mutationFn: (id: string) => propose({ data: { id } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["my-contracts"] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading your contracts…
      </div>
    );
  }
  if (isError) {
    return <p className="py-8 text-sm text-destructive">{(error as Error).message}</p>;
  }
  if (!data?.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No contracts yet. Draft one from Discovery after checking the self-attestation.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {data.map((contract) => (
          <ContractCard
            key={contract.id}
            contract={contract}
            actions={
              contract.status === "draft" ? (
                <Button
                  size="sm"
                  onClick={() => proposeMutation.mutate(contract.id)}
                  disabled={proposeMutation.isPending}
                >
                  {proposeMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Propose to agent organization
                </Button>
              ) : null
            }
          />
        ))}
      </ul>
      {proposeMutation.isError && (
        <p className="mt-3 text-sm text-destructive">{(proposeMutation.error as Error).message}</p>
      )}
    </>
  );
}

function OrgContracts() {
  const { activeOrg } = useOrganizations();
  const fetchOrg = useServerFn(listOrgContracts);
  const accept = useServerFn(acceptContract);
  const reject = useServerFn(rejectContract);
  const revoke = useServerFn(revokeContract);
  const queryClient = useQueryClient();

  const organizationId = activeOrg?.id;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["org-contracts", organizationId],
    queryFn: () => fetchOrg({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["org-contracts", organizationId] });
  }
  const acceptMutation = useMutation({
    mutationFn: (id: string) => accept({ data: { id } }),
    onSuccess: refresh,
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => reject({ data: { id } }),
    onSuccess: refresh,
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: refresh,
  });

  if (!organizationId) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Select an organization to review incoming contract proposals.
      </p>
    );
  }
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading contracts…
      </div>
    );
  }
  if (isError) {
    return <p className="py-8 text-sm text-destructive">{(error as Error).message}</p>;
  }

  const canManage = data?.canManage === true;
  const contracts = data?.contracts ?? [];

  if (!contracts.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No contracts involve this organization's agents yet.
      </p>
    );
  }

  return (
    <>
      {!canManage && (
        <p className="mb-3 text-xs text-muted-foreground">
          Members can read contract terms metadata. Only owners and admins can decide.
        </p>
      )}
      <ul className="space-y-3">
        {contracts.map((contract) => (
          <ContractCard
            key={contract.id}
            contract={contract}
            actions={
              canManage ? (
                <>
                  {contract.status === "proposed" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => acceptMutation.mutate(contract.id)}
                        disabled={acceptMutation.isPending}
                      >
                        Accept terms
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectMutation.mutate(contract.id)}
                        disabled={rejectMutation.isPending}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {contract.status === "accepted" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revokeMutation.mutate(contract.id)}
                      disabled={revokeMutation.isPending}
                    >
                      Revoke
                    </Button>
                  )}
                </>
              ) : null
            }
          />
        ))}
      </ul>
      {(acceptMutation.isError || rejectMutation.isError || revokeMutation.isError) && (
        <p className="mt-3 text-sm text-destructive">
          {
            ((acceptMutation.error ?? rejectMutation.error ?? revokeMutation.error) as Error)
              .message
          }
        </p>
      )}
    </>
  );
}

function ContractsPage() {
  return (
    <AppShell
      title="Capability contracts"
      description="Declarative terms between a Digital Self and an agent organization."
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="size-4" /> Four separate layers
            </CardTitle>
            <CardDescription>
              A contract records agreed terms. It grants no authority, performs no action, and does
              not verify anything.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CapabilityTrustLegend />
          </CardContent>
        </Card>

        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">My contracts</TabsTrigger>
            <TabsTrigger value="org">Incoming proposals</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contracts I proposed</CardTitle>
                <CardDescription>
                  Terms are editable while a contract is a draft, and freeze once proposed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RequesterContracts />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="org" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contracts for our agents</CardTitle>
                <CardDescription>
                  Accepting terms does not grant the agent access to any Digital Self data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OrgContracts />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
