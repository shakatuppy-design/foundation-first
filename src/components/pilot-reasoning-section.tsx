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
import { PILOT_AGENT_KEY, type ReasoningResult } from "@/lib/reasoning-contract";

const DEFAULT_EVIDENCE = "Daily orders fell from 100 to 70 over the last three days.";
const DEFAULT_TASK =
  "Identify what can be established from this evidence and what additional information management should investigate.";

/** Fixed, harmless verification fixture. Analysis only — no business action. */
const TEST_EVIDENCE = "Daily orders were:\nMonday 100\nTuesday 95\nWednesday 70.";
const TEST_TASK =
  "Analyze this situation for management. Separate facts from inference and hypothesis. Do not assume the cause of the decline.";


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

export function PilotReasoningSection() {
  const [evidence, setEvidence] = useState(DEFAULT_EVIDENCE);
  const [task, setTask] = useState(DEFAULT_TASK);
  const callGateway = useServerFn(runPilotReasoning);

  const mutation = useMutation<ReasoningResult, Error, { evidence: string; task: string }>({
    mutationFn: (vars) =>
      callGateway({
        data: { agentKey: PILOT_AGENT_KEY, evidence: vars.evidence, task: vars.task },
      }) as Promise<ReasoningResult>,
  });

  const result = mutation.data;

  const runTestFixture = () => {
    setEvidence(TEST_EVIDENCE);
    setTask(TEST_TASK);
    mutation.mutate({ evidence: TEST_EVIDENCE, task: TEST_TASK });
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="size-4" aria-hidden="true" />
          Reasoning gateway
        </CardTitle>
        <CardDescription>
          Real language-model analysis for the Management Intelligence Pilot only. The model reads
          the evidence you supply and returns a structured reading of it. It holds no authority, no
          database access and no ability to execute anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pilot-evidence">Evidence</Label>
            <Textarea
              id="pilot-evidence"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={5}
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

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !evidence.trim() || !task.trim()}
        >
          {mutation.isPending ? "Analysing…" : "Run analysis"}
        </Button>

        {mutation.isError && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            The analysis request failed. Nothing was recorded, changed or executed.
          </p>
        )}

        {result && !result.ok && (
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
            <Group label="Observed" items={result.output.observed} />
            <Group label="Inferred" items={result.output.inferred} />
            <Group label="Hypotheses" items={result.output.hypotheses} />
            <Group label="Counter-hypotheses" items={result.output.counter_hypotheses} />
            <Group label="Missing information" items={result.output.missing_information} />
            <Group label="Recommendation" items={result.output.recommendation} />
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
