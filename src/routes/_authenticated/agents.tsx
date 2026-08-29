import { createFileRoute } from "@tanstack/react-router";
import { Network } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { useOrganizations } from "@/lib/org-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "Agent Network — LOGOS Platform" },
      {
        name: "description",
        content:
          "Agent Network placeholder. The data foundation for agents, permissions and activity logs is in place; capabilities ship in a later session.",
      },
      { property: "og:title", content: "Agent Network — LOGOS Platform" },
      { property: "og:description", content: "Agent Network foundation for your organization." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: AgentsPage,
});

function AgentsPage() {
  const { activeOrg } = useOrganizations();

  return (
    <AppShell title="Agent Network" description={activeOrg?.name ?? "No active organization"}>
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-secondary">
              <Network className="size-5 text-foreground" />
            </span>
            <div>
              <CardTitle className="flex items-center gap-2">
                Agent Network
                <Badge variant="outline">Planned</Badge>
              </CardTitle>
              <CardDescription>Foundation only — no agent behaviour is active.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            The database foundation for the network exists and is organization-isolated: agent
            registry, per-agent permission keys, and an append-only activity log. No agent runs,
            decides, or communicates with anything yet.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Agent registry", "Name, kind, status and configuration per organization"],
              ["Permissions", "Explicit permission keys, denied by default"],
              ["Activity log", "Append-only record scoped to the organization"],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-lg border border-border bg-secondary/40 p-4">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
