import { Megaphone, Stamp, FileSignature, KeyRound } from "lucide-react";

/**
 * Four separate layers. None of them creates any of the others.
 */
const layers = [
  {
    icon: Megaphone,
    label: "Advertised",
    body: "What the agent organization claims it offers in its discovery card. Self-declared.",
  },
  {
    icon: Stamp,
    label: "Self-attested",
    body: "A formal organization self-attestation. Independently unverified.",
  },
  {
    icon: FileSignature,
    label: "Contracted",
    body: "Bilateral declarative terms agreed by requester and agent organization.",
  },
  {
    icon: KeyRound,
    label: "Authorized",
    body: "Separate Digital Self authority. Granted only in your Digital Self privacy controls.",
  },
] as const;

export function CapabilityTrustLegend() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {layers.map((layer) => (
        <div key={layer.label} className="rounded-lg border border-border bg-secondary/40 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <layer.icon className="size-4" aria-hidden="true" />
            {layer.label}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{layer.body}</p>
        </div>
      ))}
      <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2 xl:col-span-4">
        Advertised does not imply self-attested. Self-attested does not imply contracted. A contract
        does not grant authority, and none of these layers executes anything.
      </p>
    </div>
  );
}
