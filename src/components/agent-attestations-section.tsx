import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Stamp } from "lucide-react";
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
import { AttestationStatusBadge } from "@/components/attestation-status-badge";
import { SELF_ATTESTATION_LABEL } from "@/lib/capability-trust";
import { getAgentDiscovery } from "@/lib/discovery.functions";
import {
  createVerification,
  decideVerification,
  listOrgVerifications,
  revokeVerification,
} from "@/lib/capability-verifications.functions";
import type { VerificationOwner } from "@/lib/capability-projections";

/**
 * UI only. Role checks below are UX; the database (RLS + guard triggers)
 * decides. A self-attestation grants no authority and executes nothing.
 */
export function AgentAttestationsSection({
  agentId,
  canManage,
}: {
  agentId: string;
  canManage: boolean;
}) {
  const fetchDiscovery = useServerFn(getAgentDiscovery);
  const fetchList = useServerFn(listOrgVerifications);
  const create = useServerFn(createVerification);
  const decide = useServerFn(decideVerification);
  const revoke = useServerFn(revokeVerification);
  const queryClient = useQueryClient();

  const [capability, setCapability] = useState("");
  const [note, setNote] = useState("");
  const [methodDescription, setMethodDescription] = useState("");
  const [reviewedScope, setReviewedScope] = useState("");
  const [internalReference, setInternalReference] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const discoveryQuery = useQuery({
    queryKey: ["agent-discovery", agentId],
    queryFn: () => fetchDiscovery({ data: { agentId } }),
  });
  const listQuery = useQuery({
    queryKey: ["agent-attestations", agentId],
    queryFn: () => fetchList({ data: { agentId } }),
  });

  const advertised = useMemo(
    () => (discoveryQuery.data?.capabilities ?? []).map((c) => c.trim().toLowerCase()),
    [discoveryQuery.data],
  );

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["agent-attestations", agentId] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          agentId,
          capabilityKey: capability,
          attestationNote: note.trim() || undefined,
          evidence: {
            method_description: methodDescription.trim() || undefined,
            reviewed_scope: reviewedScope.trim() || undefined,
            internal_reference: internalReference.trim() || undefined,
          },
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      setCapability("");
      setNote("");
      setMethodDescription("");
      setReviewedScope("");
      setInternalReference("");
      setExpiresAt("");
      refresh();
    },
  });

  const decideMutation = useMutation({
    mutationFn: (input: { verificationId: string; decision: "approved" | "rejected" }) =>
      decide({ data: input }),
    onSuccess: refresh,
  });

  const revokeMutation = useMutation({
    mutationFn: (verificationId: string) => revoke({ data: { verificationId } }),
    onSuccess: refresh,
  });

  const rows = listQuery.data?.verifications ?? [];
  const isOwnerView = listQuery.data?.canManage === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Stamp className="size-4" /> Self-attestations
        </CardTitle>
        <CardDescription>{SELF_ATTESTATION_LABEL}. A self-attestation is not
          independent verification, not a contract, and not authority.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {canManage && (
          <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Advertised capability</Label>
              <Select value={capability} onValueChange={setCapability}>
                <SelectTrigger aria-label="Advertised capability">
                  <SelectValue placeholder="Select a capability" />
                </SelectTrigger>
                <SelectContent>
                  {advertised.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!advertised.length && (
                <p className="text-xs text-muted-foreground">
                  Advertise a capability on the discovery card first.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attestation-expiry">Expiry (optional)</Label>
              <Input
                id="attestation-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="attestation-note">Attestation note</Label>
              <Textarea
                id="attestation-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What the organization is attesting to."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attestation-method">Method description</Label>
              <Input
                id="attestation-method"
                value={methodDescription}
                onChange={(e) => setMethodDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attestation-scope">Reviewed scope</Label>
              <Input
                id="attestation-scope"
                value={reviewedScope}
                onChange={(e) => setReviewedScope(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="attestation-reference">Internal reference</Label>
              <Input
                id="attestation-reference"
                value={internalReference}
                onChange={(e) => setInternalReference(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Descriptive metadata only — never proof, never fetched, never links.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!capability || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Record self-attestation
              </Button>
              {createMutation.isError && (
                <p className="mt-2 text-sm text-destructive">
                  {(createMutation.error as Error).message}
                </p>
              )}
            </div>
          </div>
        )}

        {listQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading self-attestations…
          </div>
        )}
        {listQuery.isError && (
          <p className="text-sm text-destructive">{(listQuery.error as Error).message}</p>
        )}

        {!listQuery.isLoading && !rows.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No self-attestations recorded for this agent.
          </p>
        )}

        <ul className="space-y-3">
          {rows.map((row) => {
            const owner = isOwnerView ? (row as VerificationOwner) : null;
            return (
              <li key={row.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm text-foreground">{row.capability_key}</p>
                  <AttestationStatusBadge
                    status={row.status}
                    isCurrentlyValid={row.is_currently_valid}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.expires_at
                    ? `Expires ${new Date(row.expires_at).toLocaleString()}`
                    : "No expiry"}
                  {row.verified_at
                    ? ` · attested ${new Date(row.verified_at).toLocaleString()}`
                    : ""}
                </p>
                {owner?.attestation_note && (
                  <p className="mt-2 text-sm text-muted-foreground">{owner.attestation_note}</p>
                )}
                {owner && Object.keys(owner.evidence).length > 0 && (
                  <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {Object.entries(owner.evidence).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="font-medium">{k.replace(/_/g, " ")}:</dt>
                        <dd className="break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {owner?.decision_note && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Decision note: {owner.decision_note}
                  </p>
                )}

                {canManage && row.status === "pending" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        decideMutation.mutate({
                          verificationId: row.id,
                          decision: "approved",
                        })
                      }
                      disabled={decideMutation.isPending}
                    >
                      Approve self-attestation
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        decideMutation.mutate({
                          verificationId: row.id,
                          decision: "rejected",
                        })
                      }
                      disabled={decideMutation.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {canManage && row.status === "verified" && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revokeMutation.mutate(row.id)}
                      disabled={revokeMutation.isPending}
                    >
                      Revoke
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {(decideMutation.isError || revokeMutation.isError) && (
          <p className="text-sm text-destructive">
            {((decideMutation.error ?? revokeMutation.error) as Error).message}
          </p>
        )}
        {!canManage && (
          <p className="text-xs text-muted-foreground">
            Members can read self-attestation status. Only owners and admins can record or decide.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
