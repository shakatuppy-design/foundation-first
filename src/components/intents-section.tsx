import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Target, Trash2 } from "lucide-react";
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
  INTENT_PRIORITIES,
  INTENT_STATUSES,
  INTENT_TYPES,
  deleteIntent,
  listIntents,
  saveIntent,
  type IntentPriority,
  type IntentStatus,
  type IntentType,
} from "@/lib/intents.functions";

export function IntentsSection({ profileId }: { profileId: string }) {
  const fetchIntents = useServerFn(listIntents);
  const save = useServerFn(saveIntent);
  const remove = useServerFn(deleteIntent);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [intentType, setIntentType] = useState<IntentType>("general");
  const [priority, setPriority] = useState<IntentPriority>("medium");
  const [status, setStatus] = useState<IntentStatus>("draft");
  const [category, setCategory] = useState("");

  const query = useQuery({
    queryKey: ["intents", profileId],
    queryFn: () => fetchIntents({ data: { profileId } }),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["intents", profileId] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          profileId,
          title: title.trim(),
          description,
          intentType,
          priority,
          status,
          discoveryCategory: category.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setCategory("");
      invalidate();
    },
  });

  const updateStatus = useMutation({
    mutationFn: (vars: {
      id: string;
      title: string;
      description: string;
      intentType: IntentType;
      priority: IntentPriority;
      status: IntentStatus;
    }) => save({ data: { profileId, ...vars } }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4" /> My intents
        </CardTitle>
        <CardDescription>
          What this Digital Self wants to accomplish. Intents are declarations only — nothing is
          matched, routed, or executed, and no agent gains authority from them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="intent-title">Title</Label>
            <Input
              id="intent-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Find a logistics provider"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="intent-description">Description</Label>
            <Textarea
              id="intent-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={intentType} onValueChange={(v) => setIntentType(v as IntentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as IntentPriority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTENT_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as IntentStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intent-category">Discovery requirement (optional)</Label>
            <Input
              id="intent-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. logistics"
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={title.trim().length < 2 || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Add intent
            </Button>
            {createMutation.isError && (
              <p className="mt-2 text-sm text-destructive">
                {(createMutation.error as Error).message}
              </p>
            )}
          </div>
        </div>

        {query.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading intents…
          </div>
        )}
        {query.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No intents recorded yet.
          </p>
        )}
        <ul className="space-y-3">
          {(query.data ?? []).map((intent) => (
            <li key={intent.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{intent.title}</p>
                  {intent.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{intent.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className="capitalize">
                      {intent.intent_type}
                    </Badge>
                    <Badge variant="secondary" className="capitalize">
                      {intent.priority}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={intent.status}
                    onValueChange={(v) =>
                      updateStatus.mutate({
                        id: intent.id,
                        title: intent.title,
                        description: intent.description,
                        intentType: intent.intent_type,
                        priority: intent.priority,
                        status: v as IntentStatus,
                      })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete intent ${intent.title}`}
                    onClick={() => deleteMutation.mutate(intent.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
