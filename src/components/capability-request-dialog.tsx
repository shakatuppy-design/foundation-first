import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  REQUEST_PRIORITIES,
  createCapabilityRequest,
  listMyRequesterProfiles,
  type RequestPriority,
} from "@/lib/capability-requests.functions";

/**
 * UI only. The database (RLS + constraints) is the authorization boundary:
 * ownership, agent eligibility, listed discovery, advertised capability and
 * lifecycle are all re-validated server-side on insert.
 */
export function CapabilityRequestDialog({
  discoveryId,
  agentLabel,
  capabilities,
}: {
  discoveryId: string;
  agentLabel: string;
  capabilities: string[];
}) {
  const fetchProfiles = useServerFn(listMyRequesterProfiles);
  const submit = useServerFn(createCapabilityRequest);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [profileId, setProfileId] = useState<string>("");
  const [capability, setCapability] = useState<string>(capabilities[0] ?? "");
  const [priority, setPriority] = useState<RequestPriority>("normal");
  const [note, setNote] = useState("");
  const [purpose, setPurpose] = useState("");

  const profilesQuery = useQuery({
    queryKey: ["requester-profiles"],
    queryFn: () => fetchProfiles(),
    enabled: open,
  });
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);
  const activeProfile = profiles.find((p) => p.id === profileId) ?? profiles[0] ?? null;

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          discoveryId,
          requesterProfileId: activeProfile!.id,
          capability,
          priority,
          ...(note.trim() ? { requesterNote: note.trim() } : {}),
          ...(purpose.trim() ? { contextPurpose: purpose.trim() } : {}),
        },
      }),
    onSuccess: () => {
      setStep("done");
      void queryClient.invalidateQueries({ queryKey: ["my-capability-requests"] });
    },
  });

  function reset() {
    setStep("form");
    setNote("");
    setPurpose("");
    setPriority("normal");
    setCapability(capabilities[0] ?? "");
    mutation.reset();
  }

  const canContinue = Boolean(activeProfile && capability);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-10">
          <Send className="size-4" /> Request capability
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a capability</DialogTitle>
          <DialogDescription>
            Requesting is not authority. Advertised capability is not verified capability.
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Digital Self</Label>
              {profilesQuery.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading your Digital Self…
                </p>
              ) : profiles.length === 0 ? (
                <p className="text-sm text-destructive">
                  You need a Digital Self before you can request a capability.
                </p>
              ) : profiles.length === 1 ? (
                <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                  {profiles[0]!.display_name}
                </p>
              ) : (
                <Select value={activeProfile?.id ?? ""} onValueChange={setProfileId}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                You can only request as a Digital Self you control.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Target agent</Label>
              <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                {agentLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                Fixed for this request and cannot be changed later.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cr-capability">Advertised capability (unverified)</Label>
              <Select value={capability} onValueChange={setCapability}>
                <SelectTrigger id="cr-capability" className="h-11">
                  <SelectValue placeholder="Select a capability" />
                </SelectTrigger>
                <SelectContent>
                  {capabilities.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cr-priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as RequestPriority)}>
                <SelectTrigger id="cr-priority" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cr-note">Note to the reviewer (optional)</Label>
              <Textarea
                id="cr-note"
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why this capability could be relevant."
              />
              <p className="text-xs text-muted-foreground">
                Do not enter passwords, API keys, tokens, private credentials, or sensitive
                information. {note.length}/1000
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cr-purpose">Request context — purpose (optional)</Label>
              <Input
                id="cr-purpose"
                maxLength={300}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Short, non-sensitive purpose label"
              />
              <p className="flex gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Do not enter passwords, API keys, tokens, private credentials, or sensitive
                information.
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} className="h-11">
                Cancel
              </Button>
              <Button disabled={!canContinue} onClick={() => setStep("confirm")} className="h-11">
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              You are requesting this capability from this agent.
            </p>
            <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
              <p>
                <span className="text-muted-foreground">Digital Self: </span>
                {activeProfile?.display_name}
              </p>
              <p>
                <span className="text-muted-foreground">Agent: </span>
                {agentLabel}
              </p>
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">Capability: </span>
                <Badge variant="outline">{capability} (unverified)</Badge>
              </p>
              <p className="capitalize">
                <span className="text-muted-foreground">Priority: </span>
                {priority}
              </p>
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-4 text-xs leading-relaxed text-muted-foreground">
              <p>
                Submitting this request does not grant the agent authority, permission, or access to
                your Digital Self.
              </p>
              <p>
                Approval means the request has been accepted for this stage. It does not
                automatically execute actions.
              </p>
            </div>
            {mutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {(mutation.error as Error).message}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setStep("form")} className="h-11">
                Back
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="h-11"
              >
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Submit request
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Your request was recorded as <strong>pending</strong>. No authority was granted and
              nothing was executed.
            </p>
            <DialogFooter>
              <Button onClick={() => setOpen(false)} className="h-11">
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
