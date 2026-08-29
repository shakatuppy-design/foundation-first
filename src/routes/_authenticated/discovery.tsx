import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Radar, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { searchDiscovery, type DiscoveryResult } from "@/lib/discovery.functions";

export const Route = createFileRoute("/_authenticated/discovery")({
  head: () => ({
    meta: [
      { title: "Agent Discovery — LOGOS Platform" },
      {
        name: "description",
        content:
          "Search the LOGOS agent discovery registry by identifier, display name, category, or advertised capability. Discovery never grants authority.",
      },
      { property: "og:title", content: "Agent Discovery — LOGOS Platform" },
      {
        property: "og:description",
        content: "Find whether an agent could be relevant — without exposing private Digital Self data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: DiscoveryPage,
});

type Mode = "identifier" | "name" | "category" | "capability";

function DiscoveryPage() {
  const run = useServerFn(searchDiscovery);
  const [mode, setMode] = useState<Mode>("name");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<DiscoveryResult[] | null>(null);

  const search = useMutation({
    mutationFn: () => run({ data: { query: term.trim(), mode } }),
    onSuccess: (data) => setResults(data),
  });

  return (
    <AppShell
      title="Discovery"
      description="Could this agent be relevant? — nothing more."
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="size-4" /> Search the registry
            </CardTitle>
            <CardDescription>
              Only discovery-safe fields are returned. Discovery does not grant authority, and
              advertised capabilities are self-declared and unverified. Unlisted profiles are
              reachable only by their exact discovery identifier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                search.mutate();
              }}
            >
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Display name</SelectItem>
                  <SelectItem value="identifier">Discovery identifier</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="capability">Advertised capability</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="w-full sm:w-72"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={mode === "identifier" ? "lg_…" : "Search term"}
                aria-label="Discovery search term"
              />
              <Button type="submit" disabled={!term.trim() || search.isPending}>
                {search.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Search
              </Button>
            </form>
            {search.isError && (
              <p className="mt-3 text-sm text-destructive">{(search.error as Error).message}</p>
            )}
          </CardContent>
        </Card>

        {results && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {results.length} discovery {results.length === 1 ? "result" : "results"}
              </CardTitle>
              <CardDescription>
                Discovered ≠ authorized. Advertised ≠ verified. No human identity or Digital Self
                data is shown.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing discoverable matched this search.
                </p>
              ) : (
                <ul className="space-y-3">
                  {results.map((r) => (
                    <li key={r.discovery_id} className="rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{r.display_name}</p>
                        <Badge variant="outline" className="capitalize">
                          {r.agent_kind}
                        </Badge>
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {r.discovery_id}
                      </p>
                      {r.description && (
                        <p className="mt-2 text-sm text-muted-foreground">{r.description}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.categories.map((c) => (
                          <Badge key={`c-${c}`} variant="secondary">
                            {c}
                          </Badge>
                        ))}
                        {r.capabilities.map((c) => (
                          <Badge key={`p-${c}`} variant="outline">
                            {c} (unverified)
                          </Badge>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
