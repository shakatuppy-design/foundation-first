import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Ban,
  Beaker,
  Brain,
  CheckCircle2,
  FlaskConical,
  Gauge,
  KeyRound,
  Link2,
  MessageSquare,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { PilotReasoningSection } from "@/components/pilot-reasoning-section";
import { PilotEmergencySection } from "@/components/pilot-emergency-section";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  authorityStatus,
  BEHAVIOR_STATUSES,
  emergencyControls,
  findings,
  humanFeedback,
  pilotAgent,
  riskStatus,
  sandboxChecks,
  SANDBOX_LABEL,
  type BehaviorStatus,
  type Finding,
  type RiskLevel,
} from "@/lib/pilot-mock";

export const Route = createFileRoute("/_authenticated/pilot")({
  head: () => ({
    meta: [
      { title: "Pilot Control Center — Sandbox Observation Dashboard" },
      {
        name: "description",
        content:
          "Sandbox-only pilot control center: agent overview, intelligence findings, evidence chain, behavior lab, human feedback, authority, risk and emergency controls. No real execution.",
      },
      { property: "og:title", content: "Pilot Control Center — Sandbox" },
      {
        property: "og:description",
        content:
          "Read-only sandbox dashboard for pilot agent observation, findings and evidence. Mock data, no execution.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
  component: PilotControlCenter,
});

/* ---------- presentation helpers ---------- */

const STATUS_STYLE: Record<BehaviorStatus, string> = {
  OBSERVED: "border-transparent bg-secondary text-secondary-foreground",
  ANALYZING: "border-transparent bg-primary/10 text-primary",
  RECOMMENDATION: "border-transparent bg-primary/15 text-primary",
  BLOCKED: "border-transparent bg-destructive/15 text-destructive",
  NEEDS_DATA: "border-transparent bg-muted text-muted-foreground",
  HUMAN_REVIEW: "border-transparent bg-accent text-accent-foreground",
};

const RISK_STYLE: Record<RiskLevel, string> = {
  LOW: "border-transparent bg-secondary text-secondary-foreground",
  MODERATE: "border-transparent bg-primary/10 text-primary",
  ELEVATED: "border-transparent bg-accent text-accent-foreground",
  HIGH: "border-transparent bg-destructive/15 text-destructive",
};

function StatusBadge({ status }: { status: BehaviorStatus }) {
  return (
    <Badge variant="outline" className={`font-mono text-[11px] ${STATUS_STYLE[status]}`}>
      {status}
    </Badge>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <Badge variant="outline" className={`font-mono text-[11px] ${RISK_STYLE[level]}`}>
      {level}
    </Badge>
  );
}

function SectionHeading({
  id,
  index,
  icon: Icon,
  title,
  description,
}: {
  id: string;
  index: number;
  icon: typeof Activity;
  title: string;
  description: string;
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/60 text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            <span className="mr-2 font-mono text-xs text-muted-foreground">
              {String(index).padStart(2, "0")}
            </span>
            {title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">{children}</p>
    </div>
  );
}

/* ---------- sections ---------- */

function SandboxBanner() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-secondary/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge variant="outline" className="font-mono text-[11px]">
          SANDBOX
        </Badge>
        <Badge variant="outline" className="font-mono text-[11px]">
          NO REAL EXECUTION
        </Badge>
        <span className="text-xs text-muted-foreground">
          Every value on this screen is local mock data. Nothing here reads the database, grants
          authority, or performs an action.
        </span>
      </div>
    </div>
  );
}

function OverviewSection() {
  const stats = [
    { label: "Uptime (sandbox)", value: `${pilotAgent.uptimeHours}h` },
    { label: "Observations today", value: pilotAgent.observationsToday },
    { label: "Open findings", value: pilotAgent.openFindings },
    { label: "Awaiting human", value: pilotAgent.awaitingHuman },
  ];

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{pilotAgent.name}</CardTitle>
            <CardDescription className="font-mono text-xs">{pilotAgent.handle}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono text-[11px]">
              {pilotAgent.kind}
            </Badge>
            <Badge variant="outline" className="font-mono text-[11px]">
              {pilotAgent.mode}
            </Badge>
            <Badge variant="outline" className="font-mono text-[11px]">
              {pilotAgent.version}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-secondary/40 p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The pilot agent observes and writes findings for humans to judge. It holds no authority,
          sends no messages, and cannot invoke a capability.
        </p>
      </CardContent>
    </Card>
  );
}

function FindingsSection({
  filter,
  setFilter,
  selectedId,
  onSelect,
  visible,
}: {
  filter: BehaviorStatus | "ALL";
  setFilter: (v: BehaviorStatus | "ALL") => void;
  selectedId: string;
  onSelect: (id: string) => void;
  visible: Finding[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Intelligence findings</CardTitle>
        <CardDescription>
          Each finding keeps its counter-hypothesis alongside its hypothesis, so a reading is never
          presented as a conclusion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as BehaviorStatus | "ALL")}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="ALL" className="font-mono text-[11px]">
              ALL
            </TabsTrigger>
            {BEHAVIOR_STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="font-mono text-[11px]">
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No findings with this status in the sandbox fixture.
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((f) => {
              const open = f.id === selectedId;
              return (
                <div
                  key={f.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    open ? "border-primary/40 bg-secondary/40" : "border-border bg-card"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(open ? "" : f.id)}
                    aria-expanded={open}
                    className="flex w-full flex-col gap-2 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{f.id}</span>
                      <StatusBadge status={f.status} />
                      <RiskBadge level={f.risk} />
                    </div>
                    <p className="text-sm font-medium leading-snug text-foreground">{f.title}</p>
                    <div className="flex w-full max-w-xs items-center gap-2">
                      <Progress value={Math.round(f.confidence * 100)} className="h-1.5" />
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {Math.round(f.confidence * 100)}%
                      </span>
                    </div>
                  </button>

                  {open && (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Field label="Observed">{f.observed}</Field>
                        <Field label="Inferred">{f.inferred}</Field>
                        <Field label="Hypothesis">{f.hypothesis}</Field>
                        <Field label="Counter-hypothesis">{f.counterHypothesis}</Field>
                      </div>
                      <Separator />
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Field label="Confidence">
                          {Math.round(f.confidence * 100)}% — derived from the mock fixture only.
                        </Field>
                        <Field label="Recommendation">{f.recommendation}</Field>
                        <Field label="Risk">
                          {f.risk} — {f.riskNote}
                        </Field>
                        <Field label="Evidence">
                          {f.evidence.length === 0
                            ? "No evidence attached; nothing was published."
                            : `${f.evidence.length} item(s) — see the evidence chain below.`}
                        </Field>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceSection({ finding }: { finding: Finding | undefined }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evidence chain</CardTitle>
        <CardDescription>
          {finding
            ? `Items attached to ${finding.id}. Order is capture order; nothing is re-derived here.`
            : "Select a finding above to inspect its evidence chain."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!finding || finding.evidence.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {finding
              ? "This finding carries no evidence, which is why nothing was published."
              : "No finding selected."}
          </p>
        ) : (
          <ol className="space-y-3">
            {finding.evidence.map((e, i) => (
              <li key={e.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex size-7 items-center justify-center rounded-full border border-border bg-secondary/60 font-mono text-[11px] text-muted-foreground">
                    {i + 1}
                  </span>
                  {i < finding.evidence.length - 1 && (
                    <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 flex-1 rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{e.id}</span>
                    <Badge variant="outline" className="font-mono text-[11px] uppercase">
                      {e.kind}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`font-mono text-[11px] ${
                        e.integrity === "intact"
                          ? "border-transparent bg-secondary text-secondary-foreground"
                          : "border-transparent bg-accent text-accent-foreground"
                      }`}
                    >
                      {e.integrity === "intact" ? "CHAIN INTACT" : "CHAIN PARTIAL"}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-foreground">{e.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{e.detail}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    captured {e.capturedAt}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function BehaviorLabSection() {
  const counts = useMemo(() => {
    const map = new Map<BehaviorStatus, number>();
    for (const s of BEHAVIOR_STATUSES) map.set(s, 0);
    for (const f of findings) map.set(f.status, (map.get(f.status) ?? 0) + 1);
    return map;
  }, []);

  const total = findings.length || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Behavior lab</CardTitle>
        <CardDescription>
          Where each observation currently sits. A blocked item stays visible on purpose — the
          attempt matters as much as the result.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {BEHAVIOR_STATUSES.map((s) => {
          const n = counts.get(s) ?? 0;
          return (
            <div key={s} className="flex flex-wrap items-center gap-3">
              <div className="w-40 shrink-0">
                <StatusBadge status={s} />
              </div>
              <Progress value={(n / total) * 100} className="h-2 min-w-24 flex-1" />
              <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {n}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function FeedbackSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Human feedback</CardTitle>
        <CardDescription>
          Reviewer judgements recorded against findings. In this sandbox they are display-only
          fixtures and change nothing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {humanFeedback.map((fb) => (
          <div key={fb.id} className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{fb.reviewer}</span>
              <Badge variant="outline" className="text-[11px]">
                {fb.decision}
              </Badge>
              <span className="font-mono text-[11px] text-muted-foreground">on {fb.findingId}</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">{fb.comment}</p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{fb.at}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AuthoritySection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Authority status</CardTitle>
        <CardDescription>
          Display-only mirror of a sandbox fixture. Authority is granted nowhere on this screen, and
          observation is not authorization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {authorityStatus.map((row) => (
                <TableRow key={row.capability}>
                  <TableCell className="font-mono text-xs">{row.capability}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.scope}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`font-mono text-[11px] ${
                        row.state === "OBSERVE ONLY"
                          ? "border-transparent bg-secondary text-secondary-foreground"
                          : "border-transparent bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function RiskSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Risk status</CardTitle>
        <CardDescription>Risks of the analysis itself, not of any action.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {riskStatus.map((r) => (
          <div key={r.label} className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{r.label}</p>
              <RiskBadge level={r.level} />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{r.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SandboxSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sandbox status</CardTitle>
        <CardDescription>
          What is deliberately absent from this environment.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sandboxChecks.map((c) => (
          <div
            key={c.label}
            className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/30 p-3"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{c.label}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{c.value}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ---------- page ---------- */

const SECTIONS = [
  { id: "overview", title: "Pilot agent overview", icon: Gauge, description: "Identity, mode and sandbox counters for the pilot agent." },
  { id: "findings", title: "Intelligence findings", icon: Search, description: "Observation, inference, hypothesis and counter-hypothesis per finding." },
  { id: "evidence", title: "Evidence chain", icon: Link2, description: "Ordered evidence behind the selected finding." },
  { id: "behavior", title: "Behavior lab", icon: FlaskConical, description: "Distribution of observations across behavior statuses." },
  { id: "reasoning", title: "Reasoning gateway", icon: Brain, description: "Real model-assisted analysis of supplied evidence. No authority, no execution." },
  { id: "feedback", title: "Human feedback", icon: MessageSquare, description: "Reviewer judgements recorded against findings." },
  { id: "authority", title: "Authority status", icon: KeyRound, description: "What the pilot may observe, and what it may never touch." },
  { id: "risk", title: "Risk status", icon: AlertTriangle, description: "Risks in the analysis, not in any action." },
  { id: "sandbox", title: "Sandbox status", icon: Beaker, description: "Capabilities intentionally absent from this environment." },
  { id: "emergency", title: "Emergency control", icon: Ban, description: "Real server-enforced emergency stop for the pilot agent. Fails closed." },
] as const;

function PilotControlCenter() {
  const [filter, setFilter] = useState<BehaviorStatus | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string>(findings[0]?.id ?? "");

  const visible = useMemo(
    () => (filter === "ALL" ? findings : findings.filter((f) => f.status === filter)),
    [filter],
  );
  const selected = useMemo(() => findings.find((f) => f.id === selectedId), [selectedId]);

  return (
    <AppShell
      title="Pilot Control Center v0.1"
      description="Sandbox · no real execution · local mock data"
    >
      <div className="space-y-6">
        <SandboxBanner />

        <nav aria-label="Sections" className="flex flex-wrap gap-2">
          {SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <span className="mr-1.5 font-mono text-[11px]">{String(i + 1).padStart(2, "0")}</span>
              {s.title}
            </a>
          ))}
        </nav>

        {SECTIONS.map((s, i) => (
          <section key={s.id} className="space-y-3">
            <SectionHeading
              id={s.id}
              index={i + 1}
              icon={s.icon}
              title={s.title}
              description={s.description}
            />
            {s.id === "overview" && <OverviewSection />}
            {s.id === "findings" && (
              <FindingsSection
                filter={filter}
                setFilter={setFilter}
                selectedId={selectedId}
                onSelect={setSelectedId}
                visible={visible}
              />
            )}
            {s.id === "evidence" && <EvidenceSection finding={selected} />}
            {s.id === "behavior" && <BehaviorLabSection />}
            {s.id === "reasoning" && <PilotReasoningSection />}
            {s.id === "feedback" && <FeedbackSection />}
            {s.id === "authority" && <AuthoritySection />}
            {s.id === "risk" && <RiskSection />}
            {s.id === "sandbox" && <SandboxSection />}
            {s.id === "emergency" && <PilotEmergencySection />}
          </section>
        ))}

        <p className="flex items-start gap-2 rounded-lg border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Pilot Control Center v0.1 renders local mock data only. Discovery, capability requests,
          self-attestation, contracts and authority remain separate systems, and none of them is
          read or written from this screen.
        </p>
      </div>
    </AppShell>
  );
}
