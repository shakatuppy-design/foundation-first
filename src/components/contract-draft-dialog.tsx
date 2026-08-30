import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Loader2 } from "lucide-react";
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
import { AttestationStatusBadge } from "@/components/attestation-status-badge";
import { SELF_ATTESTATION_LABEL } from "@/lib/capability-trust";
import { parseDataList, parseFlatTerms, parseLimits } from "@/lib/capability-terms-format";
import { listMyRequesterProfiles } from "@/lib/capability-requests.functions";
import { getPublicVerificationStatus } from "@/lib/capability-verifications.functions";
import { createContractDraft } from "@/lib/capability-contracts.functions";

/**
 * Requester flow: discovery → capability → self-attestation status → draft terms.
 * Drafting or proposing a contract creates no authority and no execution
 * permission, and never creates a self-attestation.
 */
export function ContractDraftDialog({
  discoveryId,
  agentLabel,
  capabilities,
}: {
  discoveryId: string;
  agentLabel: string;
  capabilities: string[];
}) {
  const fetchProfiles = useServerFn(listMyRequesterProfiles);
  const fetchStatus = useServerFn(getPublicVerificationStatus);
  const submit = useServerFn(createContractDraft);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [capability, setCapability] = useState(capabilities[0] ?? "");
  const [scope, setScope] = useState("");
  const [constraints, setConstraints] = useState("");
  const [limits, setLimits] = useState("");
  const [allowedData, setAllowedData] = useState("");
  const [prohibitedData, setProhibitedData] = useState("");
  const [note, setNote] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const profilesQuery = useQuery({
    queryKey: ["requester-profiles"],
    queryFn: () => fetchProfiles(),
    enabled: open,
  });

  const statusQuery = useQuery({
    queryKey: ["attestation-status", discoveryId, capability],
    queryFn: () => fetchStatus({ data: { discoveryId, capabilityKey: capability } }),
    enabled: open && capability.length > 0,
  });

  const attestation = statusQuery.data ?? null;
  const canDraft = attestation?.is_currently_valid === true;

  const create = useMutation({
    mutationFn: () =>
      submit({
        data: {
          verificationId: attestation!.verification_id,
          requesterProfileId: profileId,
          scope: parseFlatTerms(scope),
          constraints: parseFlatTerms(constraints),
          limits: parseLimits(limits),
          allowedData: parseDataList(allowedData),
          prohibitedData: parseDataList(prohibitedData),
          requesterNote: note.trim() || undefined,
          effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ["my-contracts"] });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setDone(false);
          create.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileSignature className="size-4" /> Draft contract
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Draft contract terms</DialogTitle>
          <DialogDescription>
            Bilateral declarative terms with {agentLabel}. Terms are data only — they are never
            executed and never grant authority over your Digital Self.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <p className="py-4 text-sm text-muted-foreground">
            Draft saved. Review and propose it from Contracts. Nothing is in force until the agent
            organization accepts, and acceptance still grants no authority.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Your Digital Self</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger aria-label="Your Digital Self">
                  <SelectValue placeholder="Select a Digital Self" />
                </SelectTrigger>
                <SelectContent>
                  {(profilesQuery.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Capability</Label>
              <Select value={capability} onValueChange={setCapability}>
                <SelectTrigger aria-label="Capability">
                  <SelectValue placeholder="Select a capability" />
                </SelectTrigger>
                <SelectContent>
                  {capabilities.map((c) => (
                    <SelectItem key={c} value={c.trim().toLowerCase()}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border bg-secondary/40 p-3">
              {statusQuery.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Checking self-attestation…
                </p>
              ) : attestation ? (
                <div className="space-y-1.5">
                  <AttestationStatusBadge
                    status={attestation.status}
                    isCurrentlyValid={attestation.is_currently_valid}
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {SELF_ATTESTATION_LABEL}.
                    {attestation.expires_at
                      ? ` Expires ${new Date(attestation.expires_at).toLocaleString()}.`
                      : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This capability has no self-attestation. A contract cannot be drafted yet.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="contract-scope">Scope (key = value per line)</Label>
                <Textarea
                  id="contract-scope"
                  rows={3}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder={"region = eu\nmode = read_only"}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="contract-constraints">Constraints (key = value per line)</Label>
                <Textarea
                  id="contract-constraints"
                  rows={3}
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  placeholder={"human_review = true"}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="contract-limits">Limits (key = whole number per line)</Label>
                <Textarea
                  id="contract-limits"
                  rows={2}
                  value={limits}
                  onChange={(e) => setLimits(e.target.value)}
                  placeholder={"requests_per_day = 20"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contract-allowed">Allowed data (comma separated)</Label>
                <Input
                  id="contract-allowed"
                  value={allowedData}
                  onChange={(e) => setAllowedData(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contract-prohibited">Prohibited data (comma separated)</Label>
                <Input
                  id="contract-prohibited"
                  value={prohibitedData}
                  onChange={(e) => setProhibitedData(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contract-from">Effective from (optional)</Label>
                <Input
                  id="contract-from"
                  type="datetime-local"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contract-until">Expires at (optional)</Label>
                <Input
                  id="contract-until"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="contract-note">Note to the agent organization</Label>
                <Textarea
                  id="contract-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            {create.isError && (
              <p className="text-sm text-destructive">{(create.error as Error).message}</p>
            )}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => setOpen(false)}>Close</Button>
          ) : (
            <Button
              onClick={() => create.mutate()}
              disabled={!canDraft || !profileId || create.isPending}
            >
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Save draft
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
