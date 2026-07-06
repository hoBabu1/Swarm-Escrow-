import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { ContractEventPoller } from "./contract/events.js";
import { handleDeliverableSubmitted } from "./pipeline/handleDeliverable.js";
import { handleChallengeRaised } from "./pipeline/handleChallenge.js";
import { runAutoActionsScan } from "./pipeline/autoActions.js";

logger.info("oracle_starting", {
  contractAddress: env.CONTRACT_ADDRESS,
  pollIntervalSeconds: env.POLL_INTERVAL_SECONDS,
});

const poller = new ContractEventPoller();
poller.onDeliverableSubmitted((event) => handleDeliverableSubmitted(event));
poller.onChallengeRaised((event) => handleChallengeRaised(event));
poller.start();

// Separate timer from the event poller above: this scan enumerates every
// escrow by ID (not by event log) to catch deadline-based transitions
// (finalizeAfterChallengeWindow / resolveAfterSeniorArbiterTimeout) that
// have no corresponding on-chain event to poll for. `scanning` guards
// against overlapping runs the same way ContractEventPoller.polling does,
// in case a scan runs long on a slow RPC.
let scanning = false;
let currentScan: Promise<void> = Promise.resolve();
async function runScanTick(): Promise<void> {
  if (scanning) return;
  scanning = true;
  try {
    await runAutoActionsScan();
  } catch (err) {
    logger.error("auto_actions_scan_failed", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    scanning = false;
  }
}
const scanTimer = setInterval(() => {
  currentScan = runScanTick();
}, env.POLL_INTERVAL_SECONDS * 1000);
currentScan = runScanTick();

logger.info("oracle_started");

async function shutdown(signal: string): Promise<void> {
  logger.info("oracle_shutting_down", { signal });
  poller.stop();
  clearInterval(scanTimer);
  // Give in-flight work (event tick + auto-actions scan, and any handler
  // either started) a chance to finish — Render sends SIGTERM on every
  // redeploy, so this runs routinely, not just on rare crashes. Bounded so a
  // stuck call can't block shutdown.
  await Promise.race([Promise.all([poller.waitForIdle(30_000), currentScan]), new Promise((resolve) => setTimeout(resolve, 30_000))]);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
