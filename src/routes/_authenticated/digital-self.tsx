import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fingerprint, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { useOrganizations } from "@/lib/org-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createMyDigitalSelf,
  deleteGoal,
  deleteMemoryItem,
  deletePreference,
  getMyDigitalSelf,
  grantAuthority,
  revokeAuthority,
  saveGoal,
  saveMemoryItem,
  savePreference,
  setAuthorityAllowed,
  updateMyDigitalSelf,
  type DigitalCapability,
  type DigitalSelfBundle,
  type DigitalVisibility,
} from "@/lib/digital-self.functions";

export const Route = createFileRoute("/_authenticated/digital-self")({
  head: () => ({
    meta: [
      { title: "My Digital Self — LOGOS Platform" },
      {
        name: "description",
        content:
          "Control your structured digital identity: profile, preferences, goals, memory, privacy, and which agents may act on your behalf.",
      },
      { property: "og:title", content: "My Digital Self — LOGOS Platform" },
      {
        property: "og:description",
        content:
          "Identity and control layer for a human or organization: privacy defaults to private, authority is granted explicitly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: DigitalSelfPage,
});

const CAPABILITIES: { value: DigitalCapability; label: string }[] = [
  { value: "read_profile", label: "Read profile" },
  { value: "read_preference", label: "Read preferences" },
  { value: "read_goal", label: "Read goals" },
  { value: "read_memory", label: "Read memory" },
  { value: "create_intent", label: "Create intent" },
  { value: "request_capability", label: "Request capability" },
  { value: "request_quote", label: "Request quote" },
  { value: "request_action", label: "Request action" },
];

const VISIBILITIES: DigitalVisibility[] = ["private", "shared", "public"];

function VisibilityBadge({ value }: { value: DigitalVisibility }) {
  return (
    <Badge variant={value === "private" ? "secondary" : value === "shared" ? "outline" : "default"}>
      {value}
    </Badge>
  );
}

function DigitalSelfPage() {
  const { activeOrg } = useOrganizations();
  const orgId = activeOrg?.id ?? null;
  const queryClient = useQueryClient();

  const fetchBundle = useServerFn(getMyDigitalSelf);
  const create = useServerFn(createMyDigitalSelf);

  const query = useQuery({
    queryKey: ["digital-self", orgId],
    queryFn: () => fetchBundle({ data: { organizationId: orgId! } }),
    enabled: !!orgId,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["digital-self", orgId] });
  }

  const createMutation = useMutation({
    mutationFn: (displayName: string) =>
      create({ data: { organizationId: orgId!, displayName } }),
    onSuccess: invalidate,
  });

  const [newName, setNewName] = useState("");

  if (!orgId) {
    return (
      <AppShell title="My Digital Self" description="No active organization">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>No organization selected</CardTitle>
            <CardDescription>
              A Digital Self lives inside an organization. Create or select one first.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  if (query.isLoading) {
    return (
      <AppShell title="My Digital Self" description={activeOrg?.name ?? "No active organization"}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your Digital Self…
        </div>
      </AppShell>
    );
  }

  if (query.isError) {
    return (
      <AppShell title="My Digital Self" description={activeOrg?.name ?? "No active organization"}>
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Could not load your Digital Self</CardTitle>
            <CardDescription>{(query.error as Error).message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void query.refetch()}>Try again</Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const bundle = query.data as DigitalSelfBundle;

  if (!bundle.profile) {
    return (
      <AppShell title="My Digital Self" description={activeOrg?.name ?? "No active organization"}>
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Create your Digital Self</CardTitle>
            <CardDescription>
              Your Digital Self is the structured representation of you — identity and control only.
              It is not an agent and it never acts on its own. Everything starts private.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Your name"
            />
            {createMutation.isError && (
              <p className="text-sm text-destructive">
                {(createMutation.error as Error).message}
              </p>
            )}
            <Button
              disabled={newName.trim().length < 2 || createMutation.isPending}
              onClick={() => createMutation.mutate(newName.trim())}
            >
              Create Digital Self
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="My Digital Self" description={activeOrg?.name ?? "No active organization"}>
      <div className="space-y-6">
        <IdentityHeader bundle={bundle} />
        <Tabs defaultValue="profile">
          <TabsList className="flex-wrap">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="authority">Authority</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-4">
            <ProfileSection bundle={bundle} onChanged={invalidate} />
          </TabsContent>
          <TabsContent value="preferences" className="mt-4">
            <PreferencesSection bundle={bundle} onChanged={invalidate} />
          </TabsContent>
          <TabsContent value="goals" className="mt-4">
            <GoalsSection bundle={bundle} onChanged={invalidate} />
          </TabsContent>
          <TabsContent value="memory" className="mt-4">
            <MemorySection bundle={bundle} onChanged={invalidate} />
          </TabsContent>
          <TabsContent value="privacy" className="mt-4">
            <PrivacySection bundle={bundle} onChanged={invalidate} />
          </TabsContent>
          <TabsContent value="authority" className="mt-4">
            <AuthoritySection bundle={bundle} onChanged={invalidate} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function IdentityHeader({ bundle }: { bundle: DigitalSelfBundle }) {
  const profile = bundle.profile!;
  const activeGrants = bundle.authority.filter(
    (r) => r.allowed && r.status === "active" && r.agent_id,
  ).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-secondary">
            <Fingerprint className="size-5 text-foreground" />
          </span>
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {profile.display_name}
              <Badge variant="outline">{profile.profile_type}</Badge>
              <Badge variant={profile.status === "active" ? "default" : "secondary"}>
                {profile.status}
              </Badge>
              <VisibilityBadge value={profile.visibility} />
            </CardTitle>
            <CardDescription>
              Controlled by you only. Organization admins cannot edit or delete your personal
              Digital Self.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {[
          ["Preferences", `${bundle.preferences.length} recorded`],
          ["Goals", `${bundle.goals.length} defined`],
          ["Agents with authority", `${activeGrants} active grant(s)`],
        ].map(([label, detail]) => (
          <div key={label} className="rounded-lg border border-border bg-secondary/40 p-4">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProfileSection({
  bundle,
  onChanged,
}: {
  bundle: DigitalSelfBundle;
  onChanged: () => void;
}) {
  const profile = bundle.profile!;
  const update = useServerFn(updateMyDigitalSelf);
  const [name, setName] = useState(profile.display_name);
  const [status, setStatus] = useState(profile.status);

  const mutation = useMutation({
    mutationFn: () =>
      update({ data: { profileId: profile.id, displayName: name.trim(), status } }),
    onSuccess: onChanged,
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Who this Digital Self represents.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["active", "inactive", "archived"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {mutation.isError && (
          <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
        )}
        <Button disabled={mutation.isPending || name.trim().length < 2} onClick={() => mutation.mutate()}>
          Save profile
        </Button>
      </CardContent>
    </Card>
  );
}

function PreferencesSection({
  bundle,
  onChanged,
}: {
  bundle: DigitalSelfBundle;
  onChanged: () => void;
}) {
  const profile = bundle.profile!;
  const save = useServerFn(savePreference);
  const remove = useServerFn(deletePreference);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const add = useMutation({
    mutationFn: () =>
      save({
        data: { profileId: profile.id, key: key.trim(), value, visibility: "private" },
      }),
    onSuccess: () => {
      setKey("");
      setValue("");
      onChanged();
    },
  });

  const changeVisibility = useMutation({
    mutationFn: (input: { id: string; key: string; value: string; visibility: DigitalVisibility }) =>
      save({ data: { profileId: profile.id, ...input } }),
    onSuccess: onChanged,
  });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: onChanged,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>
          Structured preferences. New preferences are private by default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Key, e.g. communication_style" value={key} onChange={(e) => setKey(e.target.value)} />
          <Input placeholder="Value, e.g. simple" value={value} onChange={(e) => setValue(e.target.value)} />
          <Button disabled={key.trim().length < 1 || add.isPending} onClick={() => add.mutate()}>
            Add
          </Button>
        </div>
        {add.isError && <p className="text-sm text-destructive">{(add.error as Error).message}</p>}
        {bundle.preferences.length === 0 && (
          <p className="text-sm text-muted-foreground">No preferences recorded yet.</p>
        )}
        <div className="divide-y divide-border">
          {bundle.preferences.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{p.key}</p>
                <p className="truncate text-xs text-muted-foreground">{p.value || "—"}</p>
              </div>
              <VisibilityBadge value={p.visibility} />
              <Select
                value={p.visibility}
                onValueChange={(v) =>
                  changeVisibility.mutate({
                    id: p.id,
                    key: p.key,
                    value: p.value,
                    visibility: v as DigitalVisibility,
                  })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITIES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => del.mutate(p.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function GoalsSection({ bundle, onChanged }: { bundle: DigitalSelfBundle; onChanged: () => void }) {
  const profile = bundle.profile!;
  const save = useServerFn(saveGoal);
  const remove = useServerFn(deleteGoal);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");

  const add = useMutation({
    mutationFn: () =>
      save({
        data: {
          profileId: profile.id,
          title: title.trim(),
          description: "",
          priority,
          status: "active",
        },
      }),
    onSuccess: () => {
      setTitle("");
      onChanged();
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: onChanged,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Goals</CardTitle>
        <CardDescription>What this Digital Self is trying to achieve.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Goal title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["low", "medium", "high", "critical"].map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={title.trim().length < 2 || add.isPending} onClick={() => add.mutate()}>
            Add goal
          </Button>
        </div>
        {add.isError && <p className="text-sm text-destructive">{(add.error as Error).message}</p>}
        {bundle.goals.length === 0 && (
          <p className="text-sm text-muted-foreground">No goals defined yet.</p>
        )}
        <div className="divide-y divide-border">
          {bundle.goals.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{g.title}</p>
                {g.description && (
                  <p className="truncate text-xs text-muted-foreground">{g.description}</p>
                )}
              </div>
              <Badge variant="outline">{g.priority}</Badge>
              <Badge variant="secondary">{g.status}</Badge>
              <Button variant="ghost" size="icon" onClick={() => del.mutate(g.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MemorySection({ bundle, onChanged }: { bundle: DigitalSelfBundle; onChanged: () => void }) {
  const profile = bundle.profile!;
  const save = useServerFn(saveMemoryItem);
  const remove = useServerFn(deleteMemoryItem);
  const [content, setContent] = useState("");

  const add = useMutation({
    mutationFn: () =>
      save({
        data: {
          profileId: profile.id,
          memoryType: "note",
          content: content.trim(),
          visibility: "private",
        },
      }),
    onSuccess: () => {
      setContent("");
      onChanged();
    },
  });

  const changeVisibility = useMutation({
    mutationFn: (input: {
      id: string;
      memoryType: "note" | "fact" | "preference_signal" | "context";
      content: string;
      visibility: DigitalVisibility;
    }) => save({ data: { profileId: profile.id, ...input } }),
    onSuccess: onChanged,
  });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: onChanged,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory</CardTitle>
        <CardDescription>
          Minimal, explicit memory. Private memory stays private even when this Digital Self is
          shared — it is never exposed wholesale.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="Something worth remembering about you"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <Button disabled={content.trim().length < 1 || add.isPending} onClick={() => add.mutate()}>
          Add memory item
        </Button>
        {add.isError && <p className="text-sm text-destructive">{(add.error as Error).message}</p>}
        {bundle.memory.length === 0 && (
          <p className="text-sm text-muted-foreground">No memory items yet.</p>
        )}
        <div className="divide-y divide-border">
          {bundle.memory.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{m.content}</p>
                <p className="text-xs text-muted-foreground">
                  {m.memory_type} · source {m.source} · confidence {m.confidence}
                </p>
              </div>
              <VisibilityBadge value={m.visibility} />
              <Select
                value={m.visibility}
                onValueChange={(v) =>
                  changeVisibility.mutate({
                    id: m.id,
                    memoryType: m.memory_type as "note",
                    content: m.content,
                    visibility: v as DigitalVisibility,
                  })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITIES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => del.mutate(m.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PrivacySection({
  bundle,
  onChanged,
}: {
  bundle: DigitalSelfBundle;
  onChanged: () => void;
}) {
  const profile = bundle.profile!;
  const update = useServerFn(updateMyDigitalSelf);

  const mutation = useMutation({
    mutationFn: (visibility: DigitalVisibility) =>
      update({ data: { profileId: profile.id, visibility } }),
    onSuccess: onChanged,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Visibility of this Digital Self</CardTitle>
          <CardDescription>Private by default. You decide who may read it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {VISIBILITIES.map((v) => (
            <button
              key={v}
              onClick={() => mutation.mutate(v)}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                profile.visibility === v
                  ? "border-primary bg-secondary"
                  : "border-border hover:bg-accent"
              }`}
            >
              <span className="mt-0.5">
                <VisibilityBadge value={v} />
              </span>
              <span className="text-sm text-muted-foreground">
                {v === "private" && "Only you can read this Digital Self and its contents."}
                {v === "shared" && "Members of this organization may read it — private rows stay hidden."}
                {v === "public" && "Anyone signed in inside this organization may read it."}
              </span>
            </button>
          ))}
          {mutation.isError && (
            <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Who can access this</CardTitle>
          <CardDescription>Derived from the enforced access rules.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            ["You", "Full control: read, edit, delete, and grant authority."],
            [
              "Organization admins",
              "No write or delete access to your personal Digital Self. Read only if you set it to shared or public.",
            ],
            [
              "Organization members",
              profile.visibility === "private"
                ? "No access."
                : "Read access to non-private rows only.",
            ],
            ["Anonymous visitors", "No access at all."],
            [
              "Agents",
              "No access unless you grant an explicit authority rule — and never ownership.",
            ],
          ].map(([who, detail]) => (
            <div key={who} className="rounded-lg border border-border p-3">
              <p className="font-medium text-foreground">{who}</p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AuthoritySection({
  bundle,
  onChanged,
}: {
  bundle: DigitalSelfBundle;
  onChanged: () => void;
}) {
  const profile = bundle.profile!;
  const grant = useServerFn(grantAuthority);
  const setAllowed = useServerFn(setAuthorityAllowed);
  const revoke = useServerFn(revokeAuthority);

  const [agentId, setAgentId] = useState<string>("none");
  const [capability, setCapability] = useState<DigitalCapability>("read_profile");
  const [scopeNote, setScopeNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const add = useMutation({
    mutationFn: () =>
      grant({
        data: {
          profileId: profile.id,
          organizationId: profile.organization_id,
          agentId: agentId === "none" ? null : agentId,
          capability,
          allowed: true,
          scopeNote,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      setScopeNote("");
      setExpiresAt("");
      onChanged();
    },
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; allowed: boolean }) => setAllowed({ data: input }),
    onSuccess: onChanged,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: onChanged,
  });

  const agentName = (id: string | null) =>
    id ? (bundle.agents.find((a) => a.id === id)?.name ?? "Unknown agent") : "No agent (not delegated)";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-secondary">
              <ShieldCheck className="size-5 text-foreground" />
            </span>
            <div>
              <CardTitle>Who can act on my behalf?</CardTitle>
              <CardDescription>
                Authority is permission you grant. It never transfers ownership — you remain the
                only authority source, and nothing executes automatically yet.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {bundle.authority.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No agent can act on your behalf. Nothing is granted by default.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">Agent</th>
                    <th className="py-2 pr-4">Capability</th>
                    <th className="py-2 pr-4">Scope</th>
                    <th className="py-2 pr-4">Allowed / Denied</th>
                    <th className="py-2 pr-4">Expiration</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {bundle.authority.map((rule) => {
                    const scope = rule.scope as { note?: string } | null;
                    return (
                      <tr key={rule.id} className="border-b border-border last:border-0">
                        <td className="py-3 pr-4 text-foreground">{agentName(rule.agent_id)}</td>
                        <td className="py-3 pr-4">
                          {CAPABILITIES.find((c) => c.value === rule.capability)?.label ??
                            rule.capability}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {scope?.note || "Whole Digital Self"}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rule.allowed}
                              disabled={rule.status !== "active" || toggle.isPending}
                              onCheckedChange={(checked) =>
                                toggle.mutate({ id: rule.id, allowed: checked })
                              }
                            />
                            <span className={rule.allowed ? "text-foreground" : "text-muted-foreground"}>
                              {rule.allowed ? "Allowed" : "Denied"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {rule.expires_at ? new Date(rule.expires_at).toLocaleString() : "No expiry"}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={rule.status === "active" ? "outline" : "secondary"}>
                            {rule.status}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rule.status !== "active"}
                            onClick={() => revokeMutation.mutate(rule.id)}
                          >
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grant authority</CardTitle>
          <CardDescription>
            Choose one agent and one capability. Financial and legal capabilities do not exist and
            cannot be granted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No agent (define only)</SelectItem>
                  {bundle.agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Capability</Label>
              <Select value={capability} onValueChange={(v) => setCapability(v as DigitalCapability)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPABILITIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope">Scope note</Label>
              <Input
                id="scope"
                placeholder="Optional limit, e.g. logistics quotes only"
                value={scopeNote}
                onChange={(e) => setScopeNote(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expires">Expiration</Label>
              <Input
                id="expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          {add.isError && <p className="text-sm text-destructive">{(add.error as Error).message}</p>}
          <Button disabled={add.isPending} onClick={() => add.mutate()}>
            Grant authority
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
