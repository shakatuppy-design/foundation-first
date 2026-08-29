import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { useOrganizations } from "@/lib/org-context";
import { listOrganizationMembers } from "@/lib/organizations.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/members")({
  head: () => ({
    meta: [
      { title: "Members — LOGOS Platform" },
      {
        name: "description",
        content:
          "Members of your active LOGOS organization and their roles: owner, admin or member.",
      },
      { property: "og:title", content: "Members — LOGOS Platform" },
      { property: "og:description", content: "Organization members and role assignments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: MembersPage,
});

function MembersPage() {
  const { activeOrg } = useOrganizations();
  const fetchMembers = useServerFn(listOrganizationMembers);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["org-members", activeOrg?.id],
    queryFn: () => fetchMembers({ data: { organizationId: activeOrg!.id } }),
    enabled: Boolean(activeOrg?.id),
  });

  return (
    <AppShell title="Members" description={activeOrg?.name ?? "No active organization"}>
      <Card>
        <CardHeader>
          <CardTitle>Organization members</CardTitle>
          <CardDescription>
            Roles are stored server-side. Owners and admins manage membership; member management UI
            arrives with invitations in a later session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!activeOrg && <p className="text-sm text-muted-foreground">Select an organization.</p>}
          {activeOrg && isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {activeOrg && isError && (
            <p className="text-sm text-destructive">
              {(error as Error)?.message ?? "Could not load members."}
            </p>
          )}
          {activeOrg && !isLoading && !isError && data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          )}
          {activeOrg && data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {member.full_name ?? "Unnamed member"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Date(member.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
