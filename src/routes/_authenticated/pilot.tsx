import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Ban,
  Beaker,
  CircleСheckPlaceholder,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RouteError, RouteNotFound } from "@/components/route-error";

export const Route = createFileRoute("/_authenticated/pilot")({
  component: () => null,
  errorComponent: ({ error }) => <RouteError error={error as Error} />,
  notFoundComponent: RouteNotFound,
});
