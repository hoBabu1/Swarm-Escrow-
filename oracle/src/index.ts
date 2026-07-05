import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { ContractEventPoller } from "./contract/events.js";
import { handleDeliverableSubmitted } from "./pipeline/handleDeliverable.js";
import { handleChallengeRaised } from "./pipeline/handleChallenge.js";

logger.info("oracle_starting", {
  contractAddress: env.CONTRACT_ADDRESS,
  pollIntervalSeconds: env.POLL_INTERVAL_SECONDS,
});

const poller = new ContractEventPoller();
poller.onDeliverableSubmitted((event) => handleDeliverableSubmitted(event));
poller.onChallengeRaised((event) => handleChallengeRaised(event));
poller.start();

logger.info("oracle_started");

async function shutdown(signal: string): Promise<void> {
  logger.info("oracle_shutting_down", { signal });
  poller.stop();
  // Give an in-flight tick (and any handler it started) a chance to finish
  // — Render sends SIGTERM on every redeploy, so this runs routinely, not
  // just on rare crashes. Bounded so a stuck call can't block shutdown.
  await poller.waitForIdle(30_000);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
