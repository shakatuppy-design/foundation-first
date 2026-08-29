import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, Radar } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  DISCOVERY_STATUSES,
  DISCOVERY_VISIBILITIES,
  getAgentDiscovery,
  saveAgentDiscovery,
  type DiscoveryStatus,
  type DiscoveryVisibility,
} from "@/lib/discovery.functions";

function parseTags(value: string) {
  return value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function AgentDiscoverySection({
  agentId,
  organizationId,
  agentName,
  canManage,
}: {
  agentId: string;
  organizationId: string;
  agentName: string;
  canManage: boolean;
}) {
  const fetchDiscovery = useServerFn(getAgentDiscovery);
  const save = useServerFn(saveAgentDiscovery);
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const query = useQuery({
    queryKey: ["agent-discovery", agentId],
    queryFn: () => fetchDiscovery({ data: { agentId } }),
  });
  const profile = query.data ?? null;

  const [displayName, setDisplayName] = useState(agentName);
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [visibility, setVisibility] = useState<DiscoveryVisibility>("private");
  const [status, setStatus] = useState<DiscoveryStatus>("draft");

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setDescription(profile.description);
    setCategories(profile.categories.join(", "));
    setCapabilities(profile.capabilities.join(", "));
    setVisibility(profile.visibility);
    setStatus(profile.status);
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          agentId,
          organizationId,
          id: profile?.id,
          displayName: displayName.trim(),
          description,
          categories: parseTags(categories),
          capabilities: parseTags(capabilities),
          visibility,
          status,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent-discovery", agentId] });
    },
  });

  async function copyId() {
    if (!profile) return;
    await navigator.clipboard.writeText(profile.discovery_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="size-4" /> Discovery
        </CardTitle>
        <CardDescription>
          A controlled, discovery-safe card for this agent. Discovery never grants authority, and
          advertised capabilities are self-declared and unverified. The discovery identifier is an
          experimental lookup handle only — not an address or contact channel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {query.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading discovery profile…
          </div>
        )}

        {profile && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 p-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Discovery ID</p>
              <p className="truncate font-mono text-sm">{profile.discovery_id}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void copyId()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy
            </Button>
            <Badge variant="outline" className="capitalize">
              {profile.visibility}
            </Badge>
            <Badge variant="secondary" className="capitalize">
              {profile.status}
            </Badge>
          </div>
        )}

        {!query.isLoading && !profile && !canManage && (
          <p className="py-4 text-sm text-muted-foreground">
            This agent has no discovery profile.
          </p>
        )}

        {canManage && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="discovery-name">Display name (pseudonym)</Label>
              <Input
                id="discovery-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="discovery-description">Description</Label>
              <Textarea
                id="discovery-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discovery-categories">Categories (comma separated)</Label>
              <Input
                id="discovery-categories"
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                placeholder="logistics, procurement"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discovery-capabilities">Advertised capabilities (unverified)</Label>
              <Input
                id="discovery-capabilities"
                value={capabilities}
                onChange={(e) => setCapabilities(e.target.value)}
                placeholder="delivery, scheduling"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as DiscoveryVisibility)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCOVERY_VISIBILITIES.map((v) => (
                    <SelectItem key={v} value={v} className="capitalize">
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Discovery status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DiscoveryStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCOVERY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={displayName.trim().length < 2 || saveMutation.isPending}
              >
                {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {profile ? "Save discovery profile" : "Create discovery profile"}
              </Button>
              {saveMutation.isError && (
                <p className="mt-2 text-sm text-destructive">
                  {(saveMutation.error as Error).message}
                </p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Only active agents are discoverable. Private is never discoverable; unlisted is
                reachable only with the exact discovery identifier.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
