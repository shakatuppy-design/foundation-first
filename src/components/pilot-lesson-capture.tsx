import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookMarked, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { createLessonReview } from "@/lib/lessons.functions";
import {
  HUMAN_VERDICTS,
  type AgentOutputReference,
  type HumanVerdict,
} from "@/lib/lesson-contract";
import { useOrganizations } from "@/lib/org-context";

const VERDICT_LABELS: Record<HumanVerdict, string> = {
  CORRECT: "Correct",
  INCORRECT: "Incorrect",
  PARTIALLY_CORRECT: "Partially correct",
  NEEDS_MORE_DATA: "Needs more data",
  UNKNOWN: "Unknown",
};

const toLines = (value: string) =>
  value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

/**
 * Human review of one reasoning result. Recording a lesson is data capture
 * only — it never changes prompts, model settings, capabilities, authority,
 * contracts or the emergency stop, and nothing is ever promoted automatically.
 */
export function PilotLessonCapture({ reference }: { reference: AgentOutputReference }) {
  const { activeOrg } = useOrganizations();
  const orgId = activeOrg?.id ?? "";
  const queryClient = useQueryClient();
  const call = useServerFn(createLessonReview);

  const [verdict, setVerdict] = useState<HumanVerdict>("CORRECT");
  const [correction, setCorrection] = useState("");
  const [evidence, setEvidence] = useState("");
  const [lesson, setLesson] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      call({
        data: {
          organizationId: orgId,
          agentOutputReference: reference,
          humanVerdict: verdict,
          correction,
          supportingEvidence: toLines(evidence),
          lessonCandidate: lesson,
        },
      }),
    onSuccess: () => {
      setCorrection("");
      setEvidence("");
      setLesson("");
      void queryClient.invalidateQueries({ queryKey: ["lesson-reviews"] });
    },
  });

  const correctionMissing = verdict === "INCORRECT" && correction.trim().length === 0;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <BookMarked className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">Human review of this result</p>
        <Badge variant="outline">Data only · no automatic learning</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        A recorded lesson stays an inert record. It never modifies prompts, model configuration,
        policies, capabilities, authority or code, and it is captured as a CANDIDATE that only a
        human can move forward.
      </p>
      <Separator />

      <div className="space-y-2">
        <Label>Verdict</Label>
        <div className="flex flex-wrap gap-2">
          {HUMAN_VERDICTS.map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={verdict === v ? "default" : "outline"}
              onClick={() => setVerdict(v)}
            >
              {VERDICT_LABELS[v]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="lesson-correction">
            Correction {verdict === "INCORRECT" ? "(required)" : "(optional)"}
          </Label>
          <Textarea
            id="lesson-correction"
            rows={4}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="What the correct conclusion was."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lesson-evidence">Supporting evidence (one per line)</Label>
          <Textarea
            id="lesson-evidence"
            rows={4}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lesson-candidate">Lesson candidate (optional)</Label>
          <Textarea
            id="lesson-candidate"
            rows={4}
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            placeholder="A note for a future, separately authorized learning review."
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !orgId || correctionMissing}
        >
          {mutation.isPending ? "Recording…" : "Record lesson candidate"}
        </Button>
        {correctionMissing && (
          <span className="text-xs text-muted-foreground">
            An incorrect verdict requires a correction.
          </span>
        )}
        {mutation.isSuccess && (
          <span className="text-xs text-muted-foreground">
            Recorded as CANDIDATE. Nothing else changed.
          </span>
        )}
      </div>

      {mutation.isError && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          The lesson was rejected and nothing was recorded.
        </p>
      )}
    </div>
  );
}
