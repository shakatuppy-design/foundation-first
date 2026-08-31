import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Brain, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { runPilotReasoning } from "@/lib/reasoning.functions";
import { PILOT_AGENT_KEY, type ObservedItem, type ReasoningResult } from "@/lib/reasoning-contract";
import { useOrganizations } from "@/lib/org-context";
import { PilotLessonCapture } from "@/components/pilot-lesson-capture";

const DEFAULT_FACTS = "Daily orders fell from 100 to 70 over the last three days.";
const DEFAULT_UNTRUSTED = "";
const DEFAULT_TASK =
  "Identify what can be established from the verified facts and what additional information management should investigate.";

/** Fixed, harmless verification fixture. Analysis only — no business action. */
const TEST_FACTS = "Monday orders = 100\nTuesday orders = 95\nWednesday orders = 70";
const TEST_UNTRUSTED = "42% of customers churned because the payment gateway failed.";
const TEST_TASK =
  "Analyze this situation for management. Do not assume the cause of the decline. Treat untrusted text as unverified claims only.";

const toLines = (value: string) =>
  value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

function Group({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None reported.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {items.map((item, i) => (
            <li key={`${label}-${i}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ObservedGroup({ items, facts }: { items: ObservedItem[]; facts: string[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Observed (traceable to a verified fact)
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing could be established from verified facts.
        </p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {items.map((item, i) => (
            <li key={`observed-${i}`}>
              {item.claim}{" "}
              <span className="font-mono text-[11px] text-muted-foreground">
                ← verified fact [{item.verified_fact_index}]
                {facts[item.verified_fact_index] ? `: ${facts[item.verified_fact_index]}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PilotReasoningSection() {
  const [factsText, setFactsText] = useState(DEFAULT_FACTS);
  const [untrustedText, setUntrustedText] = useState(DEFAULT_UNTRUSTED);
  const [task, setTask] = useState(DEFAULT_TASK);
  const [submittedFacts, setSubmittedFacts] = useState<string[]>([]);
  const callGateway = useServerFn(runPilotReasoning);
  const { activeOrg } = useOrganizations();
  const orgId = activeOrg?.id ?? "";

  const mutation = useMutation<
    ReasoningResult,
    Error,
    { verified_facts: string[]; untrusted_text: string[]; task: string }
  >({
    mutationFn: (vars) =>
      callGateway({
        data: { agentKey: PILOT_AGENT_KEY, organizationId: orgId, ...vars },
      }) as Promise<ReasoningResult>,
  });

  const result = mutation.data;

  const run = (facts: string[], untrusted: string[], taskText: string) => {
    setSubmittedFacts(facts);
    mutation.mutate({ verified_facts: facts, untrusted_text: untrusted, task: taskText });
  };

  const runTestFixture = () => {
    setFactsText(TEST_FACTS);
    setUntrustedText(TEST_UNTRUSTED);
    setTask(TEST_TASK);
    run(toLines(TEST_FACTS), toLines(TEST_UNTRUSTED), TEST_TASK);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="size-4" aria-hidden="true" />
          Reasoning gateway
        </CardTitle>
        <CardDescription>
          Real language-model analysis for the Management Intelligence Pilot only. Only verified
          facts can support an observed claim; untrusted text is analysed as unverified claims. The
          model holds no authority, no database access and no ability to execute anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="pilot-facts">Verified facts (one per line)</Label>
            <Textarea
              id="pilot-facts"
              value={factsText}
              onChange={(e) => setFactsText(e.target.value)}
              rows={5}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pilot-untrusted">Untrusted text (one per line)</Label>
            <Textarea
              id="pilot-untrusted"
              value={untrustedText}
              onChange={(e) => setUntrustedText(e.target.value)}
              rows={5}
              placeholder="Human notes, comments or claims — never treated as observed."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pilot-task">Task</Label>
            <Textarea
              id="pilot-task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={5}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => run(toLines(factsText), toLines(untrustedText), task)}
            disabled={mutation.isPending || !task.trim() || !orgId}
          >
            {mutation.isPending ? "Analysing…" : "Run analysis"}
          </Button>
          <Button
            variant="outline"
            onClick={runTestFixture}
            disabled={mutation.isPending || !orgId}
          >
            RUN REAL REASONING TEST
          </Button>
        </div>

        {mutation.isError && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            The analysis request failed. Nothing was recorded, changed or executed.
          </p>
        )}

        {result && !result.ok && result.blocked && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-medium text-destructive"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            BLOCKED — {result.error} No model call was made, no capability was granted and no
            authority changed.
          </p>
        )}

        {result && !result.ok && !result.blocked && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {result.error} The response was rejected rather than repaired.
          </p>
        )}

        {result?.ok && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{result.output.reasoning_status}</Badge>
              <Badge variant="outline">
                Confidence {Math.round(result.output.confidence * 100)}%
              </Badge>
              <Badge variant="outline">No authority · no execution</Badge>
            </div>
            <Separator />
            <ObservedGroup items={result.output.observed} facts={submittedFacts} />
            <Group
              label="Unverified claims (from untrusted text)"
              items={result.output.unverified_claims}
            />
            <Group label="Inferred" items={result.output.inferred} />
            <Group label="Hypotheses" items={result.output.hypotheses} />
            <Group label="Counter-hypotheses" items={result.output.counter_hypotheses} />
            <Group label="Missing information" items={result.output.missing_information} />
            <Group label="Recommendation" items={result.output.recommendation} />
            <Separator />
            <PilotLessonCapture
              reference={{
                model: result.telemetry.model,
                timestamp: result.telemetry.timestamp,
                reasoning_status: result.output.reasoning_status,
                confidence: result.output.confidence,
                observed: result.output.observed.map((o) => o.claim),
                recommendation: result.output.recommendation,
                task,
              }}
            />
          </div>
        )}

        {result && (
          <p className="font-mono text-[11px] text-muted-foreground">
            {result.telemetry.model} · {result.telemetry.latencyMs}ms · in{" "}
            {result.telemetry.inputTokens ?? "—"} · out {result.telemetry.outputTokens ?? "—"} ·{" "}
            {result.telemetry.success ? "success" : "rejected"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
