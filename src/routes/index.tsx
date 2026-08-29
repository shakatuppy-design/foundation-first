import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, KeyRound, Lock, Network } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LOGOS — Multi-Tenant Operations Platform" },
      {
        name: "description",
        content:
          "LOGOS is a multi-tenant operations platform with organization-scoped access, role-based membership and database-enforced isolation.",
      },
      { property: "og:title", content: "LOGOS — Multi-Tenant Operations Platform" },
      {
        property: "og:description",
        content:
          "Organization-scoped workspaces with role-based membership and database-enforced isolation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  const pillars = [
    {
      icon: KeyRound,
      title: "Real authentication",
      body: "Email and password sign-in with persistent sessions and server-verified identity.",
    },
    {
      icon: Building2,
      title: "Organization model",
      body: "Owner, admin and member roles, designed to extend without schema rewrites.",
    },
    {
      icon: Lock,
      title: "Isolation by default",
      body: "Every query is filtered by membership in the database. Cross-tenant access is denied.",
    },
    {
      icon: Network,
      title: "Agent Network ready",
      body: "Registry, permissions and activity log foundations in place, features intentionally off.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-sm font-semibold tracking-[0.28em] text-foreground">LOGOS</span>
        <Button asChild variant={signedIn ? "default" : "outline"} size="sm">
          <Link to={signedIn ? "/dashboard" : "/auth"}>
            {signedIn ? "Open workspace" : "Sign in"}
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="border-b border-border py-20">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Core foundation · Session 1
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-6xl">
            The operational core for multi-tenant organizations.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            LOGOS starts with the parts that must be right first: identity, organizations, roles and
            strict data isolation. Domain modules build on top of this foundation, not around it.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={signedIn ? "/dashboard" : "/auth"}>
                {signedIn ? "Go to dashboard" : "Get started"}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-6 py-16 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <article key={pillar.title} className="rounded-xl border border-border p-6">
              <pillar.icon className="size-5 text-foreground" />
              <h2 className="mt-4 text-base font-medium text-foreground">{pillar.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-xs text-muted-foreground">
          LOGOS Platform · foundation build
        </div>
      </footer>
    </div>
  );
}
