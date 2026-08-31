import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, History, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  advanceLessonReview,
  listLessonReviewHistory,
  listLessonReviews,
} from "@/lib/lessons.functions";
import {
  ALLOWED_LESSON_TRANSITIONS,
  type LessonReviewEventView,
  type LessonReviewView,
  type LessonState,
} from "@/lib/lesson-contract";
import { useOrganizations } from "@/lib/org-context";

const STATE_VARIANT: Record<LessonState, "secondary" | "outline" | "default" | "destructive"> = {
  CANDIDATE: "outline",
  REVIEWED: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
};

function HistoryList({ lessonId }: { lessonId: string }) {
  const call = useServerFn(listLessonReviewHistory);
  const { data } = useQuery<LessonReviewEventView[]>({
    queryKey: ["lesson-review-history", lessonId],
    queryFn: () => call({ data: { lessonReviewId: lessonId } }),
  });

  return (
    <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
      {(data ?? []).map((e) => (
        <li key={e.id}>
          {new Date(e.createdAt).toISOString()} · {e.event} · {e.previousState ?? "—"} →{" "}
          {e.newState}
          {e.note ? ` · ${e.note}` : ""}
        </li>
      ))}
      {(data ?? []).length === 0 && <li>No history recorded yet.</li>}
    </ul>
  );
}

function LessonRow({ lesson }: { lesson: LessonReviewView }) {
  const queryClient = useQueryClient();
  const call = useServerFn(advanceLessonReview);
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const mutation = useMutation({
    mutationFn: (nextState: LessonState) =>
      call({
        data: {
          organizationId: lesson.organizationId,
          lessonReviewId: lesson.id,
          nextState,
          decisionNote: note,
        },
      }),
    onSuccess: () => {
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["lesson-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["lesson-review-history", lesson.id] });
    },
  });

  const next = ALLOWED_LESSON_TRANSITIONS[lesson.state];

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATE_VARIANT[lesson.state]}>{lesson.state}</Badge>
        <Badge variant="outline">{lesson.humanVerdict}</Badge>
        <span className="font-mono text-[11px] text-muted-foreground">
          {new Date(lesson.createdAt).toISOString()}
        </span>
      </div>

      {lesson.agentOutputReference ? (
        <div className="space-y-1 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reviewed output</p>
          <p className="text-muted-foreground">{lesson.agentOutputReference.task}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {lesson.agentOutputReference.model} · {lesson.agentOutputReference.reasoning_status} ·
            confidence {Math.round(lesson.agentOutputReference.confidence * 100)}%
          </p>
        </div>
      ) : (
        <p className="text-xs text-destructive">
          The stored output reference failed validation and is not displayed.
        </p>
      )}

      {lesson.correction && (
        <p className="text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Correction: </span>
          {lesson.correction}
        </p>
      )}
      {lesson.supportingEvidence.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {lesson.supportingEvidence.map((e, i) => (
            <li key={`${lesson.id}-ev-${i}`}>{e}</li>
          ))}
        </ul>
      )}
      {lesson.lessonCandidate && (
        <p className="text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Lesson candidate:{" "}
          </span>
          {lesson.lessonCandidate}
        </p>
      )}

      <Separator />

      {next.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Decision note (optional)"
            className="max-w-xs"
          />
          {next.map((state) => (
            <Button
              key={state}
              size="sm"
              variant={state === "REJECTED" ? "outline" : "default"}
              onClick={() => mutation.mutate(state)}
              disabled={mutation.isPending}
            >
              Mark {state}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Final. Even an approved lesson stays a recorded lesson — no learning pipeline consumes it.
        </p>
      )}

      {mutation.isError && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {mutation.error instanceof Error ? mutation.error.message : "The change was rejected."}
        </p>
      )}

      <div className="space-y-2">
        <Button size="sm" variant="ghost" onClick={() => setShowHistory((s) => !s)}>
          <History className="mr-1 size-3.5" aria-hidden="true" />
          {showHistory ? "Hide" : "Show"} immutable history
        </Button>
        {showHistory && <HistoryList lessonId={lesson.id} />}
      </div>
    </div>
  );
}

export function PilotLessonBoard() {
  const { activeOrg } = useOrganizations();
  const orgId = activeOrg?.id ?? "";
  const call = useServerFn(listLessonReviews);

  const { data, isPending } = useQuery<LessonReviewView[]>({
    queryKey: ["lesson-reviews", orgId],
    queryFn: () => call({ data: { organizationId: orgId } }),
    enabled: Boolean(orgId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookMarked className="size-4" aria-hidden="true" />
          Lesson review log
        </CardTitle>
        <CardDescription>
          Human verdicts on pilot reasoning results, scoped to this organization. Lessons are data
          only: CANDIDATE → REVIEWED → APPROVED or REJECTED, each step an explicit human action.
          Nothing here changes agent behaviour, capabilities, authority or the emergency stop.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending && <p className="text-sm text-muted-foreground">Loading lesson reviews…</p>}
        {!isPending && (data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            No lessons recorded yet. Run an analysis and record a human verdict on the result.
          </p>
        )}
        {(data ?? []).map((lesson) => (
          <LessonRow key={lesson.id} lesson={lesson} />
        ))}
      </CardContent>
    </Card>
  );
}
