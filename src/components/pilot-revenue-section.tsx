import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, ShieldAlert, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  listRevenueOpportunities,
  recordOpportunityOutcome,
  runRevenueScan,
} from "@/lib/revenue.functions";
import {
  PILOT_REVENUE_KEY,
  computeRoiMetrics,
  type HumanDecision,
  type OpportunityView,
  type RevenueScanResult,
  type ValueKind,
} from "@/lib/revenue-contract";
import { REVENUE_CASES } from "@/lib/revenue-fixtures";
import { useOrganizations } from "@/lib/org-context";

const idr = (n: number) =>
  `Rp ${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;

const DECISIONS: Exclude<HumanDecision, "PENDING">[] = [
  "ACTION_TAKEN",
  "NO_ACTION",
  "REJECTED",
  "NEEDS_MORE_DATA",
];

function EstimateBadge() {
  return (
    <Badge variant="outline" className="font-mono text-[10px]">
      ESTIMATE
    </Badge>
  );
}

function ActualBadge() {
  return (
    <Badge className="font-mono text-[10px]">VERIFIED ACTUAL</Badge>
  );
}

function OutcomeForm({ opportunity }: { opportunity: OpportunityView }) {
  const queryClient = useQueryClient();
  const call = useServerFn(recordOpportunityOutcome);
  const [decision, setDecision] = useState<Exclude<HumanDecision, "PENDING">>("NEEDS_MORE_DATA");
  const [action, setAction] = useState("");
  const [baseline, setBaseline] = useState("");
  const [post, setPost] = useState("");
  const [valueKind, setValueKind] = useState<ValueKind>("NONE");
  const [actual, setActual] = useState("0");
  const [reviewCost, setReviewCost] = useState("0");
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      call({
        data: {
          organizationId: opportunity.organizationId,
          opportunityId: opportunity.id,
          decision,
          actionDescription: action,
          baselineMetric: baseline,
          postActionMetric: post,
          valueKind,
          actualValueIdr: Number(actual) || 0,
          humanReviewCostIdr: Number(reviewCost) || 0,
          evidenceReference: evidence
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
          note,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["revenue-opportunities"] }),
  });

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border p-3">
      <p className="text-xs font-medium">Human decision (only a human may record an outcome)</p>
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((d) => (
          <Button
            key={d}
            size="sm"
            variant={decision === d ? "default" : "outline"}
            onClick={() => setDecision(d)}
          >
            {d}
          </Button>
        ))}
      </div>

      {decision === "ACTION_TAKEN" && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor={`act-${opportunity.id}`}>Action a human performed</Label>
            <Textarea
              id={`act-${opportunity.id}`}
              rows={2}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`base-${opportunity.id}`}>Baseline metric</Label>
            <Input
              id={`base-${opportunity.id}`}
              value={baseline}
              onChange={(e) => setBaseline(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`post-${opportunity.id}`}>Post-action metric</Label>
            <Input
              id={`post-${opportunity.id}`}
              value={post}
              onChange={(e) => setPost(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`actual-${opportunity.id}`}>
              Measured actual value (Rp) — verified business data only
            </Label>
            <Input
              id={`actual-${opportunity.id}`}
              type="number"
              min={0}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Value kind</Label>
            <div className="flex gap-2">
              {(["NONE", "REVENUE_INCREASE", "COST_SAVING"] as ValueKind[]).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={valueKind === k ? "default" : "outline"}
                  onClick={() => setValueKind(k)}
                >
                  {k}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`rev-${opportunity.id}`}>Human review cost (Rp, optional)</Label>
            <Input
              id={`rev-${opportunity.id}`}
              type="number"
              min={0}
              value={reviewCost}
              onChange={(e) => setReviewCost(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor={`ev-${opportunity.id}`}>
              Trusted evidence reference (one per line) — required for any actual value
            </Label>
            <Textarea
              id={`ev-${opportunity.id}`}
              rows={2}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`note-${opportunity.id}`}>Note (optional)</Label>
        <Input
          id={`note-${opportunity.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? "Recording…" : "Record outcome"}
      </Button>

      {mutation.isError && (
        <p className="text-xs text-destructive">
          {(mutation.error as Error).message} No business value was recorded.
        </p>
      )}
    </div>
  );
}

function OpportunityCard({ opportunity }: { opportunity: OpportunityView }) {
  const o = opportunity.outcome;
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-mono text-[10px]">
          {opportunity.kind}
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px]">
          {opportunity.reasoningStatus}
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px]">
          {opportunity.humanDecision}
        </Badge>
        <span className="font-mono text-[11px] text-muted-foreground">
          {opportunity.datasetLabel}
        </span>
      </div>

      <p className="text-sm font-medium leading-relaxed">{opportunity.opportunity}</p>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Evidence (verified facts only)
        </p>
        <ul className="list-disc space-y-1 pl-5 font-mono text-[11px] text-muted-foreground">
          {opportunity.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>

      <p className="text-sm">
        <span className="text-muted-foreground">Recommendation / expected impact: </span>
        {opportunity.expectedImpact}
      </p>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p className="flex items-center gap-2">
          <EstimateBadge /> {idr(opportunity.estimatedValueIdr)}
        </p>
        <p className="text-muted-foreground">
          Confidence {Math.round(opportunity.confidence * 100)}%
        </p>
        <p className="text-muted-foreground">AI cost {idr(opportunity.aiCostIdr)}</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          A human must verify
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs">
          {opportunity.mustVerify.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </div>

      <Separator />

      {o ? (
        <div className="space-y-1 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Actual result:</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {o.decision}
            </Badge>
            {o.actualValueIdr > 0 ? (
              <>
                <ActualBadge /> {idr(o.actualValueIdr)} ({o.valueKind})
              </>
            ) : (
              <span className="text-muted-foreground">
                No verified Rp value recorded — nothing is claimed.
              </span>
            )}
          </p>
          {o.actionDescription && (
            <p className="text-xs text-muted-foreground">Action: {o.actionDescription}</p>
          )}
          {(o.baselineMetric || o.postActionMetric) && (
            <p className="font-mono text-[11px] text-muted-foreground">
              baseline {o.baselineMetric || "—"} → post {o.postActionMetric || "—"}
            </p>
          )}
          {o.evidenceReference.length > 0 && (
            <p className="font-mono text-[11px] text-muted-foreground">
              evidence: {o.evidenceReference.join(" · ")}
            </p>
          )}
        </div>
      ) : (
        <OutcomeForm opportunity={opportunity} />
      )}
    </div>
  );
}

export function PilotRevenueSection() {
  const { activeOrg } = useOrganizations();
  const orgId = activeOrg?.id ?? "";
  const queryClient = useQueryClient();
  const [caseId, setCaseId] = useState(REVENUE_CASES[0]!.id);
  const [scan, setScan] = useState<RevenueScanResult | null>(null);

  const listCall = useServerFn(listRevenueOpportunities);
  const scanCall = useServerFn(runRevenueScan);

  const { data: opportunities } = useQuery<OpportunityView[]>({
    queryKey: ["revenue-opportunities", orgId],
    queryFn: () => listCall({ data: { organizationId: orgId } }),
    enabled: Boolean(orgId),
  });

  const rows = opportunities ?? [];
  const metrics = useMemo(() => computeRoiMetrics(rows), [rows]);

  const activeCase = REVENUE_CASES.find((c) => c.id === caseId)!;

  const mutation = useMutation<RevenueScanResult>({
    mutationFn: () =>
      scanCall({
        data: {
          agentKey: PILOT_REVENUE_KEY,
          organizationId: orgId,
          datasetLabel: activeCase.label,
          records: activeCase.records,
          untrusted_text: activeCase.untrusted,
          persist: true,
        },
      }) as Promise<RevenueScanResult>,
    onSuccess: (result) => {
      setScan(result);
      queryClient.invalidateQueries({ queryKey: ["revenue-opportunities"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4" aria-hidden="true" />
          Management Agent revenue pilot
        </CardTitle>
        <CardDescription>
          The agent may observe, analyse and recommend. It cannot execute, send, price, restock or
          change any order. Estimated values are estimates only; an actual Rp value exists only
          after a human records a verified, evidence-backed business outcome.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Synthetic dataset</Label>
          <div className="flex flex-wrap gap-2">
            {REVENUE_CASES.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={caseId === c.id ? "default" : "outline"}
                onClick={() => setCaseId(c.id)}
              >
                {c.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{activeCase.expectation}</p>
        </div>

        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !orgId}>
          {mutation.isPending ? "Analysing…" : "Run opportunity scan"}
        </Button>

        {mutation.isError && (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            The scan failed. Nothing was recorded, changed or executed.
          </p>
        )}

        {scan && !scan.ok && (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-medium text-destructive">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {scan.blocked ? "BLOCKED — " : ""}
            {scan.error}
          </p>
        )}

        {scan?.ok && (
          <div className="space-y-2 rounded-lg border border-border p-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{scan.output.reasoning_status}</Badge>
              <Badge variant="outline">
                {scan.output.opportunities.length} opportunit
                {scan.output.opportunities.length === 1 ? "y" : "ies"}
              </Badge>
              <Badge variant="outline">No authority · no execution</Badge>
            </div>
            {scan.output.unverified_claims.length > 0 && (
              <p className="text-muted-foreground">
                Unverified claims kept out of evidence: {scan.output.unverified_claims.length}
              </p>
            )}
            {scan.output.missing_information.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {scan.output.missing_information.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
            <p className="font-mono text-[11px] text-muted-foreground">
              {scan.telemetry.model} · {scan.telemetry.latencyMs}ms · in{" "}
              {scan.telemetry.inputTokens ?? "—"} · out {scan.telemetry.outputTokens ?? "—"} · AI
              cost {idr(scan.telemetry.aiCostIdr)}
            </p>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Coins className="size-4" aria-hidden="true" />
            Agent ROI
          </p>
          <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
            <p>Opportunities found: {metrics.opportunitiesFound}</p>
            <p>Accepted: {metrics.opportunitiesAccepted}</p>
            <p>Rejected: {metrics.opportunitiesRejected}</p>
            <p>Needs more data: {metrics.opportunitiesNeedingData}</p>
            <p>No action: {metrics.opportunitiesNoAction}</p>
            <p>Pending: {metrics.opportunitiesPending}</p>
            <p className="flex items-center gap-1.5">
              <EstimateBadge /> {idr(metrics.estimatedValueIdr)}
            </p>
            <p className="flex items-center gap-1.5">
              <ActualBadge /> Rp gained {idr(metrics.actualRevenueIdr)}
            </p>
            <p className="flex items-center gap-1.5">
              <ActualBadge /> Rp saved {idr(metrics.actualSavingIdr)}
            </p>
            <p>AI cost: {idr(metrics.aiCostIdr)}</p>
            <p>Human review cost: {idr(metrics.humanReviewCostIdr)}</p>
            <p>Net value: {idr(metrics.netValueIdr)}</p>
            <p>ROI (net ÷ AI cost): {metrics.agentRoi === null ? "—" : metrics.agentRoi}</p>
            <p>
              False-positive rate:{" "}
              {metrics.falsePositiveRate === null
                ? "—"
                : `${Math.round(metrics.falsePositiveRate * 100)}%`}
            </p>
            <p>
              Avg reasoning cost:{" "}
              {metrics.averageReasoningCostIdr === null
                ? "—"
                : idr(metrics.averageReasoningCostIdr)}
            </p>
            <p>
              Avg useful finding cost:{" "}
              {metrics.averageUsefulFindingCostIdr === null
                ? "—"
                : idr(metrics.averageUsefulFindingCostIdr)}
            </p>
          </div>
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            {metrics.hasVerifiedRevenue
              ? "VERIFIED_REVENUE — at least one human-recorded, evidence-backed business outcome exists."
              : "NO_REAL_REVENUE_YET — recommendations alone are not revenue. Rp value is counted only after a verified business outcome."}
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-sm font-medium">Detected opportunities</p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No opportunity has been recorded for this organization yet.
            </p>
          ) : (
            rows.map((o) => <OpportunityCard key={o.id} opportunity={o} />)
          )}
        </div>
      </CardContent>
    </Card>
  );
}
