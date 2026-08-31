import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganizations } from "@/lib/org-context";
import {
  getPilotEmergencyState,
  setPilotEmergencyState,
} from "@/lib/pilot-emergency.functions";
import type { PilotEmergencyView } from "@/lib/pilot-emergency-contract";
import { emergencyControls } from "@/lib/pilot-mock";

type UiState = "RUNNING" | "STOPPED" | "STOPPING" | "ERROR";

const BADGE: Record<UiState, string> = {
  RUNNING: "border-transparent bg-secondary text-secondary-foreground",
  STOPPED: "border-transparent bg-destructive/15 text-destructive",
  STOPPING: "border-transparent bg-accent text-accent-foreground",
  ERROR: "border-transparent bg-destructive/15 text-destructive",
};

export function PilotEmergencySection() {
  const { activeOrg } = useOrganizations();
  const queryClient = useQueryClient();
  const readState = useServerFn(getPilotEmergencyState);
  const writeState = useServerFn(setPilotEmergencyState);
  const [reason, setReason] = useState("Manual emergency stop from Pilot Control Center");

  const orgId = activeOrg?.id ?? "";
  const canControl = activeOrg?.role === "owner" || activeOrg?.role === "admin";

  const query = useQuery<PilotEmergencyView>({
    queryKey: ["pilot-emergency", orgId],
    queryFn: () => readState({ data: { organizationId: orgId } }) as Promise<PilotEmergencyView>,
    enabled: Boolean(orgId),
  });

  const mutation = useMutation<PilotEmergencyView, Error, "RUNNING" | "STOPPED">({
    mutationFn: (nextState) =>
      writeState({
        data: { organizationId: orgId, nextState, reason: reason.trim() },
      }) as Promise<PilotEmergencyView>,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pilot-emergency", orgId] });
    },
  });

  const view = mutation.data ?? query.data ?? null;
  const uiState: UiState = mutation.isPending
    ? "STOPPING"
    : query.isError || mutation.isError || (view?.failClosed ?? false)
      ? view?.state === "RUNNING"
        ? "ERROR"
        : "STOPPED"
      : (view?.state ?? (query.isLoading ? "STOPPING" : "STOPPED"));

  const stopped = uiState !== "RUNNING";

  return (
    <Card className={stopped ? "border-destructive/50" : "border-destructive/30"}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Emergency control</CardTitle>
          <Badge variant="outline" className={`font-mono text-[11px] ${BADGE[uiState]}`}>
            {uiState}
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            PILOT SCOPE ONLY
          </Badge>
        </div>
        <CardDescription>
          The pilot emergency stop is real and server-enforced: it is read before every reasoning
          request and fails closed. It can only deny — it never grants a capability, never changes
          authority, contracts or verification, and the model can never touch it. Scope is this
          organization&apos;s pilot agent only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed ${
            stopped
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-secondary/40 text-muted-foreground"
          }`}
        >
          {stopped ? (
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {uiState === "RUNNING" &&
              "Pilot RUNNING — its currently allowed reasoning operation is permitted. No execution capability exists."}
            {uiState === "STOPPED" &&
              "Pilot STOPPED — new reasoning requests are REJECTED server-side and any execution attempt is BLOCKED. Completed records are unchanged."}
            {uiState === "STOPPING" && "Applying / reading emergency state…"}
            {uiState === "ERROR" &&
              "Emergency state could not be read reliably — the pilot is treated as STOPPED (fail closed)."}
          </span>
        </div>

        {!orgId && (
          <p className="text-xs text-muted-foreground">
            Select an organization to control its pilot.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="pilot-stop-reason">Reason (recorded in the audit log)</Label>
          <Input
            id="pilot-stop-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            disabled={!canControl}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            onClick={() => mutation.mutate("STOPPED")}
            disabled={!orgId || !canControl || mutation.isPending || reason.trim().length < 3}
          >
            <Ban className="size-4" aria-hidden="true" />
            Activate emergency stop
          </Button>
          <Button
            variant="outline"
            onClick={() => mutation.mutate("RUNNING")}
            disabled={!orgId || !canControl || mutation.isPending || reason.trim().length < 3}
          >
            Re-enable pilot
          </Button>
        </div>

        {!canControl && orgId && (
          <p className="text-xs text-muted-foreground">
            Only an owner or admin of this organization may change the pilot emergency state. The
            database enforces this regardless of the interface.
          </p>
        )}

        {mutation.isError && (
          <p role="status" className="text-xs text-destructive">
            The state change failed. The pilot is shown as STOPPED until the state can be read
            reliably.
          </p>
        )}

        {view?.lastEvent && (
          <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
            last change · {view.lastEvent.previousState} → {view.lastEvent.newState} ·{" "}
            {new Date(view.lastEvent.createdAt).toISOString()} · by {view.lastEvent.activatedBy} ·
            reason: {view.lastEvent.reason}
          </p>
        )}

        <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-3">
          <p className="text-xs font-medium text-foreground">
            Other controls on this surface remain visual only
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {emergencyControls
              .filter((c) => c.id !== "halt")
              .map((c) => (
                <li key={c.id}>
                  {c.label} — {c.detail}
                </li>
              ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
