import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Network, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { useOrganizations } from "@/lib/org-context";
import { getOrganizationOverview } from "@/lib/organizations.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — LOGOS Platform" },
      {
        name: "description",
        content:
          "Overview of your active LOGOS organization: members, digital profiles and agent foundation status.",
      },
      { property: "og:title", content: "Dashboard — LOGOS Platform" },
      { property: "og:description", content: "Your LOGOS organization overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: DashboardPage,
});

function DashboardPage() {
  const { activeOrg, isLoading } = useOrganizations();
  const fetchOverview = useServerFn(getOrganizationOverview);

  const { data } = useQuery({
    queryKey: ["org-overview", activeOrg?.id],
    queryFn: () => fetchOverview({ data: { organizationId: activeOrg!.id } }),
    enabled: Boolean(activeOrg?.id),
  });

  const stats = [
    { label: "Members", value: data?.members ?? 0, icon: Users },
    { label: "Digital profiles", value: data?.digitalProfiles ?? 0, icon: ShieldCheck },
    { label: "Agents registered", value: data?.agents ?? 0, icon: Network },
    { label: "Activity records", value: data?.activityLogs ?? 0, icon: Building2 },
  ];

  return (
    <AppShell
      title="Dashboard"
      description={activeOrg ? `${activeOrg.name} · ${activeOrg.role}` : "No active organization"}
    >
      {!isLoading && !activeOrg ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Create your first organization</CardTitle>
            <CardDescription>
              Every resource in LOGOS belongs to an organization. Data is isolated per organization
              at the database level.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/organizations">Create organization</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription>{stat.label}</CardDescription>
                    <stat.icon className="size-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold tabular-nums text-foreground">
                    {stat.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Foundation status</CardTitle>
              <CardDescription>
                Session 1 delivers the core platform. Domain modules arrive in later sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                ["Authentication", "Email and password with persistent sessions"],
                ["Organizations", "Owner, admin and member roles"],
                ["Isolation", "Row-level policies deny cross-organization access"],
                ["Agent Network", "Schema prepared, features not enabled yet"],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-lg border border-border bg-secondary/40 p-4">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
