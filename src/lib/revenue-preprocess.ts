import type { BusinessRecord } from "@/lib/revenue-contract";

/**
 * TOKEN ECONOMY — deterministic preprocessing.
 *
 * All aggregation, comparison, percentage change and anomaly candidacy is
 * computed in code, never by the model. Only the compact derived evidence lines
 * are sent to the provider, and each line becomes a numbered VERIFIED FACT that
 * an OBSERVED claim or an opportunity's evidence must point at.
 */

export type RecordSignal = {
  record: BusinessRecord;
  salesChangePct: number | null;
  ordersChangePct: number | null;
  inventoryCoverRatio: number | null;
  anomaly: boolean;
  reasons: string[];
};

const pct = (current: number, previous: number): number | null =>
  previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}%`;

/** Deterministic anomaly candidacy: |change| >= 15% or heavy inventory cover. */
export function analyseRecords(records: BusinessRecord[]): RecordSignal[] {
  return records.map((record) => {
    const salesChangePct = pct(record.sales, record.previous_sales);
    const ordersChangePct = pct(record.orders, record.previous_orders);
    const inventoryCoverRatio =
      record.orders === 0 ? null : Math.round((record.inventory / record.orders) * 100) / 100;

    const reasons: string[] = [];
    if (salesChangePct !== null && Math.abs(salesChangePct) >= 15)
      reasons.push(`sales change ${signed(salesChangePct)}`);
    if (ordersChangePct !== null && Math.abs(ordersChangePct) >= 15)
      reasons.push(`orders change ${signed(ordersChangePct)}`);
    if (inventoryCoverRatio !== null && inventoryCoverRatio >= 3)
      reasons.push(`inventory cover ${fmt(inventoryCoverRatio)}x orders`);
    if (
      salesChangePct !== null &&
      ordersChangePct !== null &&
      Math.sign(salesChangePct) !== Math.sign(ordersChangePct) &&
      Math.abs(salesChangePct) >= 10 &&
      Math.abs(ordersChangePct) >= 10
    )
      reasons.push("sales and orders moved in opposite directions");

    return {
      record,
      salesChangePct,
      ordersChangePct,
      inventoryCoverRatio,
      anomaly: reasons.length > 0,
      reasons,
    };
  });
}

/**
 * Build the numbered verified-fact lines. Only anomaly candidates plus one
 * portfolio aggregate are sent — the full dataset is never forwarded.
 */
export function buildVerifiedFacts(records: BusinessRecord[]): {
  facts: string[];
  signals: RecordSignal[];
  anomalyCount: number;
} {
  const signals = analyseRecords(records);
  const facts: string[] = [];

  if (records.length > 0) {
    const totalSales = records.reduce((a, r) => a + r.sales, 0);
    const totalPrev = records.reduce((a, r) => a + r.previous_sales, 0);
    const totalOrders = records.reduce((a, r) => a + r.orders, 0);
    const change = pct(totalSales, totalPrev);
    facts.push(
      `PORTFOLIO: ${records.length} rows, total sales ${fmt(totalSales)} vs previous ${fmt(
        totalPrev,
      )}${change === null ? "" : ` (${signed(change)})`}, total orders ${fmt(totalOrders)}.`,
    );
  }

  const candidates = signals.filter((s) => s.anomaly);
  for (const s of candidates) {
    const r = s.record;
    facts.push(
      [
        `${r.period} · ${r.product} · ${r.region}:`,
        `sales ${fmt(r.sales)} vs ${fmt(r.previous_sales)}${
          s.salesChangePct === null ? "" : ` (${signed(s.salesChangePct)})`
        };`,
        `orders ${fmt(r.orders)} vs ${fmt(r.previous_orders)}${
          s.ordersChangePct === null ? "" : ` (${signed(s.ordersChangePct)})`
        };`,
        `inventory ${fmt(r.inventory)}${
          s.inventoryCoverRatio === null ? "" : ` (cover ${fmt(s.inventoryCoverRatio)}x orders)`
        };`,
        `anomaly candidates: ${s.reasons.join(", ")}.`,
      ].join(" "),
    );
  }

  return { facts: facts.slice(0, 40), signals, anomalyCount: candidates.length };
}
