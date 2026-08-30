/**
 * Text <-> declarative term helpers for the contract UI.
 * Terms are DATA. Nothing here interprets, evaluates or executes a term.
 */

export function parseFlatTerms(text: string): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim().toLowerCase();
    const raw = trimmed.slice(index + 1).trim();
    if (!key) continue;
    out[key] = raw === "true" ? true : raw === "false" ? false : raw;
  }
  return out;
}

export function parseLimits(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(parseFlatTerms(text))) {
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= 0) out[key] = numeric;
  }
  return out;
}

export function parseDataList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function formatFlatTerms(record: Record<string, string | boolean | number>): string {
  return Object.entries(record)
    .map(([k, v]) => `${k} = ${String(v)}`)
    .join("\n");
}
