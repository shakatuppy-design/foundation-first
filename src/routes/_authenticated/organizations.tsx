import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { useOrganizations } from "@/lib/org-context";
import { createOrganization } from "@/lib/organizations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/organizations")({
  head: () => ({
    meta: [
      { title: "Organizations — LOGOS Platform" },
      {
        name: "description",
        content:
          "Create and manage the organizations you belong to. Each organization is an isolated tenant with its own members and resources.",
      },
      { property: "og:title", content: "Organizations — LOGOS Platform" },
      { property: "og:description", content: "Manage your LOGOS organizations and roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: OrganizationsPage,
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function OrganizationsPage() {
  const { organizations, activeOrg, setActiveOrgId, refresh, isLoading } = useOrganizations();
  const create = useServerFn(createOrganization);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { name: string; slug: string }) => create({ data: input }),
    onSuccess: (org) => {
      toast.success(`${org.name} created`);
      setName("");
      setSlug("");
      refresh();
      setActiveOrgId(org.id);
      void queryClient.invalidateQueries({ queryKey: ["org-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["org-members"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell title="Organizations" description="Tenants you belong to">
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Your organizations</CardTitle>
            <CardDescription>
              You only ever see organizations you are a member of — enforced by database policies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && organizations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No organizations yet. Create one to get started.
              </p>
            )}
            {organizations.map((org) => (
              <div
                key={org.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{org.name}</p>
                  <p className="truncate text-xs text-muted-foreground">/{org.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {org.role}
                  </Badge>
                  {activeOrg?.id === org.id ? (
                    <Badge>Active</Badge>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setActiveOrgId(org.id)}>
                      Switch
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>New organization</CardTitle>
            <CardDescription>You become its owner automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({ name: name.trim(), slug: slug || slugify(name) });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nusantara Logistics"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Identifier</Label>
                <Input
                  id="org-slug"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder={slugify(name) || "nusantara-logistics"}
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers and dashes. Generated from the name if left empty.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating…" : "Create organization"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
