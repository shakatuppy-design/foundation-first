/**
 * SESSION 3G-E — local guard tests for the pilot emergency stop.
 *
 * No network, no database, no model. These probe the fail-closed semantics of
 * the server-side state reader with fake clients.
 *
 * Run: bun scripts/pilot-emergency-guard-test.ts
 */
import {
  checkPilotOperationAllowed,
  readPilotEmergencyState,
} from "../src/lib/pilot-emergency.server";

type Row = Record<string, unknown>;

const client = (behavior: () => Promise<{ data: Row[] | null; error: unknown }>) => ({
  from: () => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => behavior(),
    };
    return chain;
  },
});

const ok = (rows: Row[]) => client(async () => ({ data: rows, error: null }));
const dbError = () => client(async () => ({ data: null, error: { message: "boom" } }));
const thrown = () =>
  client(async () => {
    throw new Error("network down");
  });

const event = (newState: string, previousState = "RUNNING"): Row => ({
  previous_state: previousState,
  new_state: newState,
  reason: "test",
  activated_by: "00000000-0000-0000-0000-000000000001",
  created_at: new Date().toISOString(),
});

const ORG = "11111111-1111-1111-1111-111111111111";

let pass = 0;
let fail = 0;
const check = (name: string, condition: boolean, detail = "") => {
  if (condition) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name} ${detail}`);
  }
};

async function main() {
  const never = await readPilotEmergencyState(ok([]), ORG);
  check("no event ever recorded → RUNNING", never.state === "RUNNING" && !never.failClosed);

  const running = await readPilotEmergencyState(ok([event("RUNNING", "STOPPED")]), ORG);
  check("latest event RUNNING → RUNNING", running.state === "RUNNING" && !running.failClosed);

  const stopped = await readPilotEmergencyState(ok([event("STOPPED")]), ORG);
  check("latest event STOPPED → STOPPED", stopped.state === "STOPPED" && !stopped.failClosed);

  const errored = await readPilotEmergencyState(dbError(), ORG);
  check(
    "database error → FAIL CLOSED (STOPPED)",
    errored.state === "STOPPED" && errored.failClosed,
  );

  const threw = await readPilotEmergencyState(thrown(), ORG);
  check("thrown exception → FAIL CLOSED (STOPPED)", threw.state === "STOPPED" && threw.failClosed);

  const garbage = await readPilotEmergencyState(ok([event("MAYBE")]), ORG);
  check(
    "malformed state value → FAIL CLOSED (STOPPED)",
    garbage.state === "STOPPED" && garbage.failClosed,
  );

  const noOrg = await readPilotEmergencyState(ok([]), "");
  check("missing organization scope → FAIL CLOSED (STOPPED)", noOrg.state === "STOPPED");

  const allowedRun = await checkPilotOperationAllowed(ok([]), ORG);
  check("guard allows operation while RUNNING", allowedRun.allowed);

  const allowedStop = await checkPilotOperationAllowed(ok([event("STOPPED")]), ORG);
  check("guard denies operation while STOPPED", !allowedStop.allowed);

  const allowedErr = await checkPilotOperationAllowed(dbError(), ORG);
  check("guard denies operation on unreadable state", !allowedErr.allowed);

  // The state reader only reads the append-only log; it has no write surface,
  // so no model output can reach it. Assert the module exports nothing that writes.
  const mod = await import("../src/lib/pilot-emergency.server");
  check(
    "state module exposes read-only helpers only",
    Object.keys(mod).sort().join(",") === "checkPilotOperationAllowed,readPilotEmergencyState",
    Object.keys(mod).join(","),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
