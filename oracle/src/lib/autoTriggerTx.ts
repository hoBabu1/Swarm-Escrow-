import type { ContractTransactionResponse } from "ethers";
import { logger } from "./logger.js";
import { isLikelyRaceRevert } from "./raceRevert.js";
import { withTxLock } from "./txMutex.js";

// Shared send/wait/log/catch scaffolding for every auto-triggered contract
// write (resolve, finalizeAfterChallengeWindow, resolveAfterSeniorArbiterTimeout).
// Acquires the process-wide tx lock so this never races another oracle-wallet
// send, waits for confirmation, and classifies failures per CLAUDE.md's
// race-vs-real-error requirement: a revert matching a known "someone else
// already handled it" reason logs at info level, anything else at error.
export async function sendAutoTriggeredTx(
  escrowId: bigint,
  fnName: string,
  send: () => Promise<ContractTransactionResponse>,
): Promise<void> {
  const logCtx = { escrowId: escrowId.toString(), function: fnName };
  try {
    await withTxLock(async () => {
      const tx = await send();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error(`${fnName} for escrow ${escrowId} failed or reverted (tx: ${tx.hash})`);
      }
      logger.info("auto_triggered_transaction", { ...logCtx, txHash: tx.hash });
    });
  } catch (err) {
    if (isLikelyRaceRevert(err)) {
      logger.info("auto_action_already_handled_by_another_caller", logCtx);
      return;
    }
    logger.error("auto_action_failed", { ...logCtx, error: err instanceof Error ? err.message : String(err) });
  }
}
